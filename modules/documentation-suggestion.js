const DocumentationSuggestionModule = (() => {
  const DOCUMENTATION_INPUT_ID = "frmAtendimento:tbvAtendimento:documentacao_input";
  const DOCUMENTATION_PANEL_ID = "frmAtendimento:tbvAtendimento:documentacao_panel";
  const DOCUMENTATION_HIDDEN_ID = "frmAtendimento:tbvAtendimento:documentacao_hinput";
  const UI_ID = "atendeai-documentation-suggestion";
  const MAX_JEV_CANDIDATES = 200;
  const STRONG_JEV_CANDIDATES = 40;
  const STRONG_LEXICAL_THRESHOLD = 24;
  const MAX_MEMORY_BOOST = 45;
  const LOAD_TIMEOUT_MS = 3500;
  const MIN_LOAD_MS = 500;
  const STABLE_WINDOW_MS = 700;
  const SELECT_CONFIRM_TIMEOUT_MS = 1600;
  const SELECT_CONFIRM_POLL_MS = 25;
  const AUTOFILL_KEY = "atendeai_documentation_autofill_enabled";
  const LEARNING_ENABLED_KEY = "atendeai_documentation_learning_enabled";

  const cache = new Map();
  let manualSelectionCleanup = null;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function extractPanelCandidates(panel) {
    const seen = new Set();
    return [...panel.querySelectorAll("li[data-item-value][data-item-label]")]
      .map((element) => ({
        id: String(element.dataset.itemValue || "").trim(),
        label: String(element.dataset.itemLabel || element.textContent || "").trim()
      }))
      .filter((candidate) => {
        if (!candidate.id || !candidate.label || seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      });
  }

  async function waitForCandidates(panel) {
    const startedAt = Date.now();
    let previousCount = -1;
    let lastChangeAt = startedAt;

    while (Date.now() - startedAt < LOAD_TIMEOUT_MS) {
      const now = Date.now();
      const count = extractPanelCandidates(panel).length;

      if (count !== previousCount) {
        previousCount = count;
        lastChangeAt = now;
      }

      const loadElapsed = now - startedAt;
      const stableFor = now - lastChangeAt;

      if (
        count > 0 &&
        loadElapsed >= MIN_LOAD_MS &&
        stableFor >= STABLE_WINDOW_MS
      ) {
        return extractPanelCandidates(panel);
      }

      await delay(100);
    }

    return extractPanelCandidates(panel);
  }

  async function loadCandidatesSilently() {
    const cacheKey = location.pathname;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const input = document.getElementById(DOCUMENTATION_INPUT_ID);
    const panel = document.getElementById(DOCUMENTATION_PANEL_ID);

    if (!input || !panel) {
      throw new Error("Campo de Documentação do CRM não encontrado.");
    }

    panel.style.setProperty("visibility", "hidden", "important");
    panel.style.setProperty("opacity", "0", "important");
    panel.style.setProperty("pointer-events", "none", "important");

    try {
      if (!readBridgeStatus()) {
        throw new Error("Integração PrimeFaces ainda não está pronta. Recarregue a página.");
      }

      document.dispatchEvent(new CustomEvent("atendeai:crm-documentation-search"));

      await delay(50);

      const requestedStatus = readBridgeStatus();

      if (requestedStatus === "widget-not-found") {
        throw new Error("Autocomplete de Documentação do CRM não foi encontrado.");
      }

      if (requestedStatus === "error") {
        throw new Error("O CRM não conseguiu iniciar a busca de documentações.");
      }

      const candidates = await waitForCandidates(panel);
      if (!candidates.length) {
        throw new Error("O CRM não retornou documentações para este atendimento.");
      }

      cache.set(cacheKey, candidates);
      return candidates;
    } finally {
      panel.style.removeProperty("visibility");
      panel.style.removeProperty("opacity");
      panel.style.removeProperty("pointer-events");
      panel.style.display = "none";
    }
  }

  const RANKING_STOP_WORDS = new Set([
    "cliente", "esta", "está", "com", "uma", "para", "por", "que",
    "foi", "tem", "erro", "duvida", "dúvida", "sistema", "nota", "fiscal", "ao",
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "e", "a", "o"
  ].map(normalizeText));

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

  function rankingTokens(text) {
    return normalizeText(text)
      .split(" ")
      .filter((token) => token.length >= 2 && !RANKING_STOP_WORDS.has(token));
  }

  function hasWholeCode(text, code) {
    return new RegExp(`(^|\\s)${code}(\\s|$)`).test(text);
  }

  function containsTerm(haystack, term) {
    const learning = window.DocumentationLearningModule;
    if (learning?.containsTerm) return learning.containsTerm(haystack, term);

    const hayTokens = normalizeText(haystack).split(" ").filter(Boolean);
    const termTokens = normalizeText(term).split(" ").filter(Boolean);
    if (!termTokens.length || hayTokens.length < termTokens.length) return false;

    for (let i = 0; i <= hayTokens.length - termTokens.length; i++) {
      let matched = true;
      for (let j = 0; j < termTokens.length; j++) {
        if (hayTokens[i + j] !== termTokens[j]) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }

    return false;
  }

  function hasFeatureMatch(features, haystack) {
    return Object.keys(features || {}).some((feature) => containsTerm(haystack, feature));
  }

  function labelTerms(label) {
    const tokens = rankingTokens(label);
    const terms = new Set(tokens);
    for (let i = 0; i < tokens.length - 1; i++) {
      terms.add(`${tokens[i]} ${tokens[i + 1]}`);
    }
    return terms;
  }

  function buildIdf(candidates) {
    const total = Math.max(candidates.length, 1);
    const df = new Map();
    for (const candidate of candidates) {
      for (const term of labelTerms(candidate.label)) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }
    return (term) => Math.log((total + 1) / ((df.get(term) || 0) + 1)) + 1;
  }

  function featureBoost(features, haystack, weight) {
    let boost = 0;
    for (const [feature, count] of Object.entries(features || {})) {
      if (!containsTerm(haystack, feature)) continue;
      boost += Math.min(Number(count) || 0, 8) * weight;
    }
    return boost;
  }

  function memoryBoost(doc, normalizedContext) {
    const learning = window.DocumentationLearningModule;
    if (learning?.memoryBoostFor) return learning.memoryBoostFor(doc, normalizedContext);
    if (!doc) return 0;
    const haystack = String(normalizedContext || "");
    const matchedPositive = hasFeatureMatch(doc.positiveFeatures, haystack);
    const matchedNegative = hasFeatureMatch(doc.negativeFeatures, haystack);
    if (!matchedPositive && !matchedNegative) return 0;

    const confirmationMod = matchedPositive
      ? Math.min(Number(doc.confirmations) || 0, 8)
      : 0;
    const boost = confirmationMod
      + featureBoost(doc.positiveFeatures, haystack, 2)
      + featureBoost(doc.negativeFeatures, haystack, -1);
    return Math.max(-15, Math.min(MAX_MEMORY_BOOST, boost));
  }

  function scoreCandidate(candidate, index, { tokens, codes, idf, normalizedContext, docs }) {
    const normalizedLabel = normalizeText(candidate.label);
    let codeHits = 0;
    let tokenScore = 0;
    let bigramScore = 0;
    let lexicalScore = 0;

    for (const code of codes) {
      if (hasWholeCode(normalizedLabel, code)) {
        codeHits += 1;
        lexicalScore += 1000;
      }
    }

    for (const token of tokens) {
      if (containsTerm(normalizedLabel, token)) {
        tokenScore += 5 * idf(token);
      }
    }

    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = `${tokens[i]} ${tokens[i + 1]}`;
      if (containsTerm(normalizedLabel, pair)) {
        bigramScore += 16 * idf(pair);
      }
    }

    lexicalScore += tokenScore + bigramScore;
    if (normalizedContext.length >= 10 && normalizedLabel.includes(normalizedContext)) {
      lexicalScore += 100;
    }

    const memoryDoc = docs[candidate.id];
    const memoryScore = memoryBoost(memoryDoc, normalizedContext);

    return {
      candidate,
      score: lexicalScore + memoryScore,
      lexicalScore,
      memoryScore,
      tokenScore,
      bigramScore,
      codeHits,
      memoryConfirmations: Number(memoryDoc?.confirmations) || 0,
      index
    };
  }

  function rankCandidates(candidates, context, memory) {
    const normalizedContext = normalizeText(context);
    const tokens = [...new Set(rankingTokens(context))];
    const codes = extractExplicitCodes(context);
    const idf = buildIdf(candidates);
    const docs = memory?.docs && typeof memory.docs === "object" ? memory.docs : {};

    const ranked = candidates.map((candidate, index) => (
      scoreCandidate(candidate, index, { tokens, codes, idf, normalizedContext, docs })
    ));

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    return ranked;
  }

  /**
   * Strong ranking (top 40) when there is enough local evidence:
   * - an explicit rejection/error code appears in the context, or
   * - the top candidate has discriminative lexical overlap, or
   * - local memory has multiple confirmations AND current overlap.
   * Otherwise keep the broad fallback of up to 200 candidates.
   * Explicit-code matches are never dropped by the cut.
   */
  function hasStrongRankingEvidence(ranked, codes) {
    const hasMatchingExplicitCode = Array.isArray(codes)
      && codes.length > 0
      && Array.isArray(ranked)
      && ranked.some((item) => (item.codeHits || 0) > 0);
    if (hasMatchingExplicitCode) return true;
    const top = ranked[0];
    if (!top) return false;
    if (top.lexicalScore >= STRONG_LEXICAL_THRESHOLD) return true;
    if (top.memoryConfirmations >= 3 && top.lexicalScore > 5) return true;
    return false;
  }

  function takeCandidatesForJev(ranked, { strong } = {}) {
    const limit = strong ? STRONG_JEV_CANDIDATES : MAX_JEV_CANDIDATES;
    const head = ranked.slice(0, limit);
    const seen = new Set(head.map((item) => item.candidate.id));
    const extras = ranked.filter((item) => item.codeHits > 0 && !seen.has(item.candidate.id));
    return [...head, ...extras].map((item) => item.candidate);
  }

  function prefilterCandidates(candidates, context, limitOrOptions) {
    let limit = null;
    let memory = { docs: {} };

    if (typeof limitOrOptions === "number") {
      limit = limitOrOptions;
    } else if (limitOrOptions && typeof limitOrOptions === "object") {
      if (Number.isFinite(limitOrOptions.limit)) limit = limitOrOptions.limit;
      if (limitOrOptions.memory) memory = limitOrOptions.memory;
    }

    const ranked = rankCandidates(candidates, context, memory);
    if (limit != null) {
      return ranked.slice(0, limit).map((item) => item.candidate);
    }

    const codes = extractExplicitCodes(context);
    return takeCandidatesForJev(ranked, { strong: hasStrongRankingEvidence(ranked, codes) });
  }

  function shouldAutofill(response, settings = {}) {
    if (settings.autofillEnabled === false) return false;
    if (response?.mode !== "single") return false;
    const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
    return suggestions.length === 1 && Boolean(suggestions[0]?.id) && Boolean(suggestions[0]?.label);
  }

  function shouldLearnFromSelection(args) {
    if (args?.source === "autofill") return false;
    const learning = window.DocumentationLearningModule;
    if (learning?.shouldLearnFromSelection) return learning.shouldLearnFromSelection(args);
    return args?.source === "use-button";
  }

  async function rememberAutofillOutcome({ source, suggestion, context }) {
    if (!shouldLearnFromSelection({ source })) return;
    const learning = window.DocumentationLearningModule;
    if (!learning?.recordPositive || !suggestion?.id) return;
    await learning.recordPositive({
      docId: suggestion.id,
      label: suggestion.label,
      context
    });
  }

  function extractProblemFromStructuredText(value) {
    const text = String(value || "").replace(/\*\*/g, "").trim();
    if (!text) return "";

    const startMatch = text.match(
      /(?:PROBLEMA\s*\/\s*D[ÚU]VIDA|PROBLEMA|D[ÚU]VIDA)\s*:\s*/i
    );
    if (!startMatch || startMatch.index == null) return "";

    const contentStart = startMatch.index + startMatch[0].length;
    const remainder = text.slice(contentStart);

    const endMarkers = [
      /\n\s*SOLU[CÇ][AÃ]O\s+APRESENTADA\s*:/i,
      /\n\s*SOLU[CÇ][AÃ]O\s*:/i,
      /\n\s*RESOLU[CÇ][AÃ]O\s*:/i,
      /\n\s*OPORTUNIDADE\s+DE\s+UPSELL\s*:/i,
      /\n\s*PRINTS?\s+DE\s+ERRO/i,
      /\n\s*HUMOR\s+DO\s+CLIENTE\s*:/i
    ];

    let end = remainder.length;
    for (const marker of endMarkers) {
      const match = remainder.match(marker);
      if (match?.index != null && match.index < end) {
        end = match.index;
      }
    }

    return remainder.slice(0, end).trim();
  }

  function getCurrentContext() {
    const resolution = document.querySelector(
      '[id="frmAtendimento:tbvAtendimento:resolucao"], textarea[name*="resolucao"], textarea[id*="resolucao"]'
    )?.value?.trim();

    const problemFromSummary = extractProblemFromStructuredText(resolution);
    if (problemFromSummary) return problemFromSummary;

    const problem = document.getElementById("crm-input-problema")?.value?.trim();
    if (problem) return problem;

    return resolution || "";
  }

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function addText(parent, tag, text, styleText = "") {
    const element = document.createElement(tag);
    element.textContent = String(text || "");
    if (styleText) element.style.cssText = styleText;
    parent.appendChild(element);
    return element;
  }

  function readBridgeStatus() {
    return document.documentElement?.getAttribute("data-atendeai-documentation-bridge") || "";
  }

  function dispatchSelect(id, label) {
    document.documentElement?.setAttribute("data-atendeai-documentation-select-id", id);
    document.documentElement?.setAttribute("data-atendeai-documentation-select-label", label);
    document.dispatchEvent(new CustomEvent("atendeai:crm-documentation-select", {
      detail: { id, label }
    }));
    return readBridgeStatus();
  }

  function isTerminalSelectStatus(status) {
    return status === "selected"
      || status === "select-failed"
      || status === "candidate-not-found"
      || status === "widget-not-found";
  }

  async function waitForBridgeSelectStatus() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SELECT_CONFIRM_TIMEOUT_MS) {
      const status = readBridgeStatus();
      if (isTerminalSelectStatus(status)) return status;
      await delay(SELECT_CONFIRM_POLL_MS);
    }
    return readBridgeStatus();
  }

  async function dispatchSelectAndWait(id, label) {
    dispatchSelect(id, label);
    return waitForBridgeSelectStatus();
  }

  function panelHasCandidate(id) {
    const panel = document.getElementById(DOCUMENTATION_PANEL_ID);
    if (!panel) return false;
    return [...panel.querySelectorAll("li[data-item-value]")].some(
      (item) => String(item.getAttribute("data-item-value") || "") === String(id)
    );
  }

  function selectionMatches(id, label) {
    const input = document.getElementById(DOCUMENTATION_INPUT_ID);
    if (normalizeText(input?.value) !== normalizeText(label)) return false;
    const hidden = document.getElementById(DOCUMENTATION_HIDDEN_ID);
    const hiddenValue = String(hidden?.value || "").trim();
    return Boolean(hiddenValue) && hiddenValue === String(id);
  }

  async function waitForSelectionConfirmed(id, label) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SELECT_CONFIRM_TIMEOUT_MS) {
      if (selectionMatches(id, label)) return true;
      await delay(SELECT_CONFIRM_POLL_MS);
    }
    return selectionMatches(id, label);
  }

  async function selectDocumentation(id, label) {
    let status = await dispatchSelectAndWait(id, label);
    if (status === "selected") return true;

    if (status === "candidate-not-found" || !panelHasCandidate(id)) {
      try {
        cache.delete(location.pathname);
        await loadCandidatesSilently();
        status = await dispatchSelectAndWait(id, label);
      } catch (_) {
        return false;
      }
    }

    return status === "selected";
  }

  async function loadUiSettings() {
    const learning = window.DocumentationLearningModule;
    if (learning?.isAutofillEnabled && learning?.isLearningEnabled) {
      return {
        autofillEnabled: await learning.isAutofillEnabled(),
        learningEnabled: await learning.isLearningEnabled()
      };
    }

    const data = await new Promise((resolve) => {
      try {
        chrome.storage.local.get([AUTOFILL_KEY, LEARNING_ENABLED_KEY], (result) => resolve(result || {}));
      } catch (_) {
        resolve({});
      }
    });

    return {
      autofillEnabled: data[AUTOFILL_KEY] !== false,
      learningEnabled: data[LEARNING_ENABLED_KEY] !== false
    };
  }

  function readLiveContext() {
    try {
      return String(getCurrentContext() || "").trim();
    } catch (_) {
      return "";
    }
  }

  function resolveManualLearningContext(sessionContext) {
    const current = readLiveContext();
    const session = String(sessionContext || "").trim();
    const currentKey = normalizeText(current);
    const sessionKey = normalizeText(session);
    if (currentKey) {
      return {
        text: current,
        sameAsSession: currentKey === sessionKey
      };
    }
    return {
      text: session,
      sameAsSession: true
    };
  }

  function watchTrustedManualSelection({ lastConfirmedId, suggestionIds, context, labelsById }) {
    if (typeof manualSelectionCleanup === "function") {
      manualSelectionCleanup();
      manualSelectionCleanup = null;
    }

    const panel = document.getElementById(DOCUMENTATION_PANEL_ID);
    const learning = window.DocumentationLearningModule;
    if (!panel || !learning) return;

    let lastSelectedId = lastConfirmedId;
    let pendingSeq = 0;
    const labels = labelsById instanceof Map ? labelsById : new Map();

    const onClick = (event) => {
      const li = event.target?.closest?.("li[data-item-value][data-item-label]");
      if (!li) return;
      if (!shouldLearnFromSelection({ source: "manual", event })) return;

      const id = String(li.getAttribute("data-item-value") || "").trim();
      const label = String(li.getAttribute("data-item-label") || "").trim();
      if (!id) return;
      if (label) labels.set(id, label);

      const previousId = lastSelectedId;
      const seq = ++pendingSeq;
      void (async () => {
        const confirmed = await waitForSelectionConfirmed(id, label);
        if (seq !== pendingSeq) return;
        if (!confirmed) return;
        if (id === previousId) return;

        const learningContext = resolveManualLearningContext(context);
        if (!normalizeText(learningContext.text)) return;

        if (previousId && learningContext.sameAsSession) {
          await learning.recordCorrection({
            previousId,
            previousLabel: labels.get(previousId) || "",
            selectedId: id,
            selectedLabel: label,
            context: learningContext.text
          });
          lastSelectedId = id;
          return;
        }

        await learning.recordPositive({
          docId: id,
          label,
          context: learningContext.text
        });
        lastSelectedId = id;
      })();
    };

    panel.addEventListener("click", onClick, true);
    manualSelectionCleanup = () => panel.removeEventListener("click", onClick, true);
  }

  function renderUseButton(parent, onUse) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Usar";
    button.style.cssText = [
      "border:1px solid #93c5fd",
      "background:#eff6ff",
      "color:#1d4ed8",
      "border-radius:4px",
      "padding:2px 8px",
      "font-size:11px",
      "font-weight:700",
      "cursor:pointer",
      "white-space:nowrap"
    ].join(";");
    button.addEventListener("click", onUse);
    parent.appendChild(button);
    return button;
  }

  function resultTitle(mode, autoSelected) {
    if (autoSelected) return "Documentação selecionada";
    if (mode === "single") return "Documentação sugerida";
    if (mode === "uncertain") return "Documentação pouco clara";
    return "Possíveis documentações";
  }

  async function useSuggestedDocumentation(resultEl, item, response, totalCandidates, sentCandidates, viewState) {
    const ok = await selectDocumentation(item.id, item.label);
    if (!ok) {
      renderMessage(resultEl, "Não foi possível selecionar a documentação no CRM.", true);
      return false;
    }
    if (shouldLearnFromSelection({ source: "use-button" })) {
      await window.DocumentationLearningModule?.recordPositive?.({
        docId: item.id,
        label: item.label,
        context: viewState.context
      });
    }
    const nextState = {
      ...viewState,
      autofillStatus: "selected",
      autofillAttempted: false,
      fromAutofill: false,
      autoFilledId: item.id
    };
    renderResult(resultEl, {
      ...response,
      mode: "single",
      suggestions: [item]
    }, totalCandidates, sentCandidates, nextState);
    const labelsById = new Map(viewState.labelsById || []);
    labelsById.set(item.id, item.label);
    watchTrustedManualSelection({
      lastConfirmedId: item.id,
      suggestionIds: viewState.suggestionIds || [item.id],
      context: viewState.context,
      labelsById
    });
    return true;
  }

  function renderResult(resultEl, response, totalCandidates, sentCandidates, viewState = {}) {
    clearElement(resultEl);

    const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
    const autoSelected = viewState.autofillStatus === "selected";
    const showAutofillFailure = response?.mode === "single"
      && viewState.autofillAttempted
      && viewState.autofillStatus !== "selected";

    addText(resultEl, "div", resultTitle(response?.mode, autoSelected),
      "font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:6px;");

    if (!suggestions.length) {
      addText(resultEl, "div", "Não foi possível identificar uma documentação com segurança.",
        "font-size:12px;color:#475569;line-height:1.4;");
    } else {
      suggestions.slice(0, 3).forEach((item) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;justify-content:space-between;align-items:flex-start;margin-top:5px;";

        const selectedHere = autoSelected && item.id === viewState.autoFilledId;
        addText(
          row,
          "span",
          selectedHere ? `✓ ${item.label}` : item.label,
          "font-size:12px;color:#1f2937;line-height:1.35;flex:1;"
        );

        const meta = document.createElement("div");
        meta.style.cssText = "display:flex;flex-direction:column;align-items:flex-end;gap:4px;white-space:nowrap;";
        const percent = `${Math.round(Number(item.probability || 0) * 100)}%`;
        addText(
          meta,
          "strong",
          selectedHere && viewState.fromAutofill
            ? `${percent} · selecionada automaticamente`
            : percent,
          "font-size:12px;color:#2563eb;"
        );

        if (!selectedHere) {
          renderUseButton(meta, () => useSuggestedDocumentation(
            resultEl, item, response, totalCandidates, sentCandidates, viewState
          ));
        }

        row.appendChild(meta);
        resultEl.appendChild(row);
      });
    }

    if (showAutofillFailure) {
      addText(resultEl, "div", "Não foi possível selecionar automaticamente.",
        "font-size:11px;color:#b45309;margin-top:6px;");
    }

    addText(
      resultEl,
      "div",
      `${totalCandidates} opções carregadas do CRM • ${sentCandidates} analisadas • ${Number(response?.latencyMs || 0)} ms`,
      "font-size:10px;color:#94a3b8;margin-top:8px;"
    );
  }

  function renderMessage(resultEl, message, isError = false) {
    clearElement(resultEl);
    addText(
      resultEl,
      "div",
      message,
      `font-size:12px;line-height:1.4;color:${isError ? "#b91c1c" : "#475569"};`
    );
  }

  async function handleSuggestClick(button, result) {
    const context = getCurrentContext();
    if (!context) {
      result.style.display = "block";
      renderMessage(result, "Preencha o problema/dúvida ou cole o resumo antes de sugerir.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Carregando documentações...";
    result.style.display = "block";
    renderMessage(result, "Consultando as opções válidas deste Produto no CRM...");

    try {
      const settings = await loadUiSettings();
      const allCandidates = await loadCandidatesSilently();

      let memory = { docs: {} };
      if (settings.learningEnabled) {
        memory = await window.DocumentationLearningModule?.loadMemory?.() || memory;
      }

      const candidates = prefilterCandidates(allCandidates, context, { memory });

      button.textContent = "Analisando...";
      renderMessage(result, `Analisando ${candidates.length} de ${allCandidates.length} documentações...`);

      const response = await sendMessage({
        action: "classificarDocumentacao",
        context,
        candidates
      });

      if (!response?.success) {
        throw new Error(response?.erro || "Não foi possível sugerir a documentação.");
      }

      const classification = response.classification || {};
      const suggestions = Array.isArray(classification.suggestions) ? classification.suggestions : [];
      const viewState = {
        context,
        autofillEnabled: settings.autofillEnabled,
        autofillAttempted: false,
        autofillStatus: null,
        autoFilledId: null
      };

      if (shouldAutofill(classification, settings)) {
        viewState.autofillAttempted = true;
        const suggestion = suggestions[0];
        const selected = await selectDocumentation(suggestion.id, suggestion.label);
        viewState.autofillStatus = selected ? "selected" : (readBridgeStatus() || "select-failed");
        if (selected) {
          viewState.autoFilledId = suggestion.id;
          viewState.fromAutofill = true;
          await rememberAutofillOutcome({
            source: "autofill",
            suggestion,
            context
          });
        }
      }

      renderResult(result, classification, allCandidates.length, candidates.length, viewState);

      const suggestionIds = suggestions.map((item) => item.id);
      const labelsById = new Map(suggestions.map((item) => [item.id, item.label]));
      viewState.suggestionIds = suggestionIds;
      viewState.labelsById = labelsById;
      watchTrustedManualSelection({
        lastConfirmedId: viewState.autoFilledId,
        suggestionIds,
        context,
        labelsById
      });
    } catch (error) {
      renderMessage(result, error?.message || "Falha ao sugerir documentação.", true);
    } finally {
      button.disabled = false;
      button.textContent = "✨ Sugerir documentação";
    }
  }

  function createUi(input) {
    if (document.getElementById(UI_ID)) return;

    const wrapper = document.createElement("div");
    wrapper.id = UI_ID;
    wrapper.style.cssText = "margin-top:6px;width:100%;box-sizing:border-box;";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "✨ Sugerir documentação";
    button.style.cssText = [
      "border:1px solid #93c5fd",
      "background:#eff6ff",
      "color:#1d4ed8",
      "border-radius:6px",
      "padding:7px 10px",
      "font-size:12px",
      "font-weight:700",
      "cursor:pointer"
    ].join(";");

    const result = document.createElement("div");
    result.style.cssText = [
      "display:none",
      "margin-top:6px",
      "padding:9px 10px",
      "border:1px solid #dbeafe",
      "border-radius:6px",
      "background:#fff",
      "max-width:520px"
    ].join(";");

    button.addEventListener("click", () => handleSuggestClick(button, result));

    wrapper.appendChild(button);
    wrapper.appendChild(result);

    const host = input.closest(".ui-autocomplete") || input.parentElement;
    host.insertAdjacentElement("afterend", wrapper);
  }

  async function init() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 10000) {
      const input = document.getElementById(DOCUMENTATION_INPUT_ID);
      if (input) {
        createUi(input);
        return;
      }
      await delay(200);
    }

    console.warn("AtendeAI: campo de Documentação não encontrado para sugestão.");
  }

  return {
    init,
    __test: {
      normalizeText,
      extractProblemFromStructuredText,
      extractExplicitCodes,
      prefilterCandidates,
      rankCandidates,
      takeCandidatesForJev,
      hasStrongRankingEvidence,
      shouldAutofill,
      shouldLearnFromSelection,
      rememberAutofillOutcome,
      selectDocumentation,
      useSuggestedDocumentation,
      watchTrustedManualSelection,
      containsTerm,
      MAX_JEV_CANDIDATES,
      STRONG_JEV_CANDIDATES
    }
  };
})();

window.DocumentationSuggestionModule = DocumentationSuggestionModule;
