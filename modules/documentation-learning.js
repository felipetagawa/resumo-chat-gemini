const DocumentationLearningModule = (() => {
  const STORAGE_KEY = "atendeai_documentation_learning_v1";
  const AUTOFILL_KEY = "atendeai_documentation_autofill_enabled";
  const LEARNING_ENABLED_KEY = "atendeai_documentation_learning_enabled";
  const VERSION = 1;
  const TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const MAX_DOCS = 300;
  const MAX_FEATURES_PER_DOC = 24;
  const MAX_FEATURE_COUNT = 50;

  const STOP_WORDS = new Set([
    "cliente", "esta", "está", "com", "uma", "para", "por", "que",
    "foi", "tem", "erro", "duvida", "dúvida", "sistema", "nota", "fiscal", "ao",
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "e", "a", "o"
  ].map(normalizeText));

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (data) => resolve(data || {}));
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => resolve());
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => resolve());
    });
  }

  function emptyMemory() {
    return { version: VERSION, docs: {} };
  }

  function looksLikePii(token) {
    const value = String(token || "");
    if (!value) return true;
    if (value.includes("@")) return true;
    if (/^\d{8,}$/.test(value)) return true;
    if (/^\d{2}\d{3}\d{3}\d{4}\d{2}$/.test(value)) return true;
    return false;
  }

  function extractExplicitCodes(context) {
    const codes = new Set();
    const text = String(context || "");
    const regex = /\b(?:rejei[cç][aã]o|erro)\s*[:#-]?\s*(\d{3,4})\b/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      codes.add(match[1]);
    }
    return [...codes];
  }

  function hasWholeCode(text, code) {
    return new RegExp(`(^|\\s)${code}(\\s|$)`).test(text);
  }

  function extractSafeFeatures(context, label) {
    const features = {};
    const normalizedContext = normalizeText(context);
    const normalizedLabel = normalizeText(label);
    if (!normalizedContext || !normalizedLabel) return features;

    const codes = extractExplicitCodes(context);
    for (const code of codes) {
      if (hasWholeCode(normalizedLabel, code) && hasWholeCode(normalizedContext, code)) {
        features[code] = 1;
      }
    }

    const labelTokens = normalizedLabel
      .split(" ")
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token) && !looksLikePii(token));

    for (const token of labelTokens) {
      if (/^\d+$/.test(token)) continue;
      if (normalizedContext.includes(token)) features[token] = 1;
    }

    for (let i = 0; i < labelTokens.length - 1; i++) {
      const bigram = `${labelTokens[i]} ${labelTokens[i + 1]}`;
      if (normalizedContext.includes(bigram)) features[bigram] = 1;
    }

    return features;
  }

  function capFeatures(features) {
    const entries = Object.entries(features || {})
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
    return Object.fromEntries(entries.slice(0, MAX_FEATURES_PER_DOC));
  }

  function bumpFeatures(target, incoming, amount) {
    const next = { ...(target || {}) };
    for (const [key, value] of Object.entries(incoming || {})) {
      next[key] = Math.min(MAX_FEATURE_COUNT, (Number(next[key]) || 0) + ((Number(value) || 0) * amount));
    }
    return capFeatures(next);
  }

  function cleanup(memory, now = Date.now()) {
    const docs = memory?.docs && typeof memory.docs === "object" ? memory.docs : {};
    const kept = {};
    for (const [id, doc] of Object.entries(docs)) {
      if (!doc || typeof doc !== "object") continue;
      if (now - Number(doc.updatedAt || 0) > TTL_MS) continue;
      kept[id] = {
        updatedAt: Number(doc.updatedAt) || now,
        confirmations: Math.min(MAX_FEATURE_COUNT, Math.max(0, Number(doc.confirmations) || 0)),
        positiveFeatures: capFeatures(doc.positiveFeatures || {}),
        negativeFeatures: capFeatures(doc.negativeFeatures || {})
      };
    }

    const rankedIds = Object.keys(kept).sort(
      (a, b) => (kept[b].updatedAt || 0) - (kept[a].updatedAt || 0)
    );
    if (rankedIds.length > MAX_DOCS) {
      for (const id of rankedIds.slice(MAX_DOCS)) delete kept[id];
    }

    return { version: VERSION, docs: kept };
  }

  function memoriesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  async function isFlagEnabled(key) {
    const data = await storageGet([key]);
    return data[key] !== false;
  }

  function isLearningEnabled() {
    return isFlagEnabled(LEARNING_ENABLED_KEY);
  }

  function isAutofillEnabled() {
    return isFlagEnabled(AUTOFILL_KEY);
  }

  async function loadMemory() {
    const data = await storageGet([STORAGE_KEY]);
    const raw = data[STORAGE_KEY];
    const incoming = raw && raw.version === VERSION && raw.docs && typeof raw.docs === "object"
      ? { version: VERSION, docs: raw.docs }
      : emptyMemory();
    const cleaned = cleanup(incoming);
    if (raw && !memoriesEqual(cleaned, incoming)) {
      await storageSet({ [STORAGE_KEY]: cleaned });
    }
    return cleaned;
  }

  async function saveMemory(memory) {
    const cleaned = cleanup(memory);
    await storageSet({ [STORAGE_KEY]: cleaned });
    return cleaned;
  }

  function ensureDoc(memory, docId) {
    const id = String(docId);
    if (!memory.docs[id]) {
      memory.docs[id] = {
        updatedAt: Date.now(),
        confirmations: 0,
        positiveFeatures: {},
        negativeFeatures: {}
      };
    }
    return memory.docs[id];
  }

  async function recordPositive({ docId, label, context }) {
    if (!docId) return;
    if (!(await isLearningEnabled())) return;
    const memory = await loadMemory();
    const doc = ensureDoc(memory, docId);
    doc.confirmations = Math.min(MAX_FEATURE_COUNT, (Number(doc.confirmations) || 0) + 1);
    doc.updatedAt = Date.now();
    doc.positiveFeatures = bumpFeatures(doc.positiveFeatures, extractSafeFeatures(context, label), 1);
    await saveMemory(memory);
  }

  async function recordCorrection({
    previousId,
    previousLabel,
    selectedId,
    selectedLabel,
    context
  }) {
    if (!(await isLearningEnabled())) return;
    if (selectedId) {
      await recordPositive({ docId: selectedId, label: selectedLabel, context });
    }
    if (!previousId || String(previousId) === String(selectedId)) return;

    const memory = await loadMemory();
    const previous = ensureDoc(memory, previousId);
    const negativeFeatures = extractSafeFeatures(context, selectedLabel || previousLabel);
    previous.negativeFeatures = bumpFeatures(previous.negativeFeatures, negativeFeatures, 1);
    previous.updatedAt = Date.now();
    await saveMemory(memory);
  }

  function shouldLearnFromSelection({ source, event } = {}) {
    if (source === "autofill") return false;
    if (source === "use-button") return true;
    if (source === "manual") return event?.isTrusted === true;
    return false;
  }

  async function clearLearning() {
    await storageRemove(STORAGE_KEY);
  }

  async function countDocs() {
    const memory = await loadMemory();
    return Object.keys(memory.docs || {}).length;
  }

  function featureBoost(features, haystack, weight) {
    let boost = 0;
    for (const [feature, count] of Object.entries(features || {})) {
      if (haystack.includes(feature)) boost += Math.min(Number(count) || 0, 8) * weight;
    }
    return boost;
  }

  function memoryBoostFor(doc, normalizedContext) {
    if (!doc) return 0;
    const haystack = String(normalizedContext || "");
    const boost = Math.min(Number(doc.confirmations) || 0, 8) * 4
      + featureBoost(doc.positiveFeatures, haystack, 2)
      + featureBoost(doc.negativeFeatures, haystack, -1);
    return Math.max(-15, Math.min(45, boost));
  }

  return {
    STORAGE_KEY,
    AUTOFILL_KEY,
    LEARNING_ENABLED_KEY,
    VERSION,
    TTL_MS,
    MAX_DOCS,
    MAX_FEATURES_PER_DOC,
    isLearningEnabled,
    isAutofillEnabled,
    loadMemory,
    recordPositive,
    recordCorrection,
    shouldLearnFromSelection,
    extractSafeFeatures,
    clearLearning,
    countDocs,
    memoryBoostFor
  };
})();

window.DocumentationLearningModule = DocumentationLearningModule;
