// Buffer local de recuperação (V1A).
// Guarda por pouco tempo a conversa SZ aberta em chrome.storage.local para o
// Gerar Relatório continuar depois que o histórico sai do DOM.
// Retenção: 24 horas, no máximo 10 conversas, com exclusão manual.
// A captura não faz rede nem chama IA. O buffer inteiro nunca vai para o backend.
// Identidade: atributos explícitos do card ou plataforma + nome + início do
// atendimento. Sem assinatura completa, a sessão ganha um bufferId local.

const RecoveryBufferModule = (() => {
  const STORAGE_KEY = "atendeai_recovery_buffers_v1";
  const POSITION_KEY = "atendeai_recovery_panel_position";
  const PANEL_ID = "atendeai-recovery-report-fallback";
  const DEBOUNCE_MS = 750;
  const TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_BUFFERS = 10;
  const MAX_PROMPT_COMPLEMENT_CHARS = 2000;
  const EDIT_DEBOUNCE_MS = 400;
  const PANEL_MARGIN = 8;
  const LIST_PANEL_WIDTH = 420;
  const DETAIL_PANEL_WIDTH = 540;
  const PANEL_FALLBACK_HEIGHT = 360;
  const AUTHOR_RE = /^([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'.’-]{0,30}(?: [A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'.’-]{0,30}){0,3}): (.+)$/;

  const CONVERSATION_ATTRS = ["data-chat-id", "data-contact-id", "data-id"];
  const ACTIVE_CARD_SELECTORS = [
    ".sz_contact.active",
    ".sz_contact.selected",
    ".sz_contact.open",
    ".chats-list .chat.active"
  ];

  let started = false;
  let debounceTimer = null;
  let editTimer = null;
  let queuedSnapshot = null;
  let activeSession = null;
  let writeQueue = Promise.resolve();
  let currentUnavailable = true;
  let panelRequest = 0;
  let panelOpening = false;
  let panelDrag = null;
  let panelShell = null;
  let pendingObservation = null;
  let viewportClampBound = false;

  function enqueue(task) {
    const run = writeQueue.then(task, task);
    writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  function normalizeTranscript(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isPhoneLike(value) {
    const compact = String(value || "").trim();
    if (!compact || !/^[\d\s()+.-]+$/.test(compact)) return false;
    const digits = compact.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }

  function readAttrs(element, attrs) {
    if (!element?.getAttribute) return "";
    for (const attr of attrs) {
      const value = String(element.getAttribute(attr) || "").trim();
      if (!value || isPhoneLike(value)) continue;
      return `${attr}:${value}`;
    }
    return "";
  }

  function sourceIdFromCard(card) {
    const sourceId = readAttrs(card, CONVERSATION_ATTRS);
    if (sourceId) return sourceId;
    if (!card) return "";
    const platformSrc = card.querySelector('img[alt="platform"]')?.getAttribute("src") || "";
    const platform = platformSrc.match(/\/assets\/img\/platform\/mini\/([\w-]+)\.svg(?:[?#].*)?$/i)?.[1]?.toLowerCase();
    const name = normalizeText(card.querySelector(".contact-name")?.textContent).toLowerCase();
    const time = card.querySelector('.contact-times[phase="attendance"] .times');
    const timestamp = normalizeText(time?.getAttribute("title") || time?.textContent);
    if (platform && name && /^\d{2}\/\d{2}\/\d{2}(?:\d{2})? \d{2}:\d{2}(?::\d{2})?$/.test(timestamp)) {
      return `attendance:${platform}|${name.replace(/%/g, "%25").replace(/\|/g, "%7C")}|${timestamp}`;
    }
    return "";
  }

  function resolveSourceId(doc = document) {
    for (const selector of ACTIVE_CARD_SELECTORS) {
      const card = doc.querySelector?.(selector);
      if (card) return sourceIdFromCard(card);
    }
    return "";
  }

  function getConversationIdentityFromCard(card) {
    const sourceId = sourceIdFromCard(card);
    return sourceId ? Object.freeze({ sourceId, displayName: normalizeText(card.querySelector(".contact-name")?.textContent) || "Conversa" }) : null;
  }

  function getCurrentConversationIdentity() {
    for (const selector of ACTIVE_CARD_SELECTORS) {
      const card = document.querySelector(selector);
      if (card) return getConversationIdentityFromCard(card);
    }
    return null;
  }

  function detectAnydeskCandidate(transcript) {
    const lines = String(transcript || "").split("\n");
    for (const line of lines) {
      if (!/anydesk|id\s*anydesk|acesso\s+remoto/i.test(line)) continue;
      const groups = line.match(/\d[\d\s.-]*\d/g) || [];
      for (const group of groups) {
        const digits = group.replace(/\D/g, "");
        if (digits.length !== 9 && digits.length !== 10) continue;
        return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
      }
    }
    return null;
  }

  function messageCount(transcript) {
    const normalized = normalizeTranscript(transcript);
    if (!normalized) return 0;
    return normalized.split("\n").length;
  }

  function formatMessageCount(transcript) {
    const count = messageCount(transcript);
    return count === 1 ? "1 mensagem" : `${count} mensagens`;
  }

  function formatClock(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function formatBufferLabel(buffer, nowMs = Date.now()) {
    const when = new Date(Number(buffer?.updatedAt || buffer?.capturedAt || nowMs));
    const today = new Date(nowMs);
    const day = when.toDateString() === today.toDateString()
      ? "hoje"
      : `${String(when.getDate()).padStart(2, "0")}/${String(when.getMonth() + 1).padStart(2, "0")}`;
    const name = normalizeText(buffer?.displayName) || "Conversa";
    return `${name} — ${day} ${formatClock(when)}`;
  }

  function initialsFromName(name) {
    const words = normalizeText(name).split(" ").filter(Boolean);
    const letters = [];
    for (const word of words) {
      const match = word.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
      if (match) letters.push(match[0]);
      if (letters.length === 3) break;
    }
    if (letters.length >= 2) return letters.join("").toLocaleUpperCase("pt-BR");
    const compact = normalizeText(name).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (compact.length >= 2) return compact.slice(0, 2).toLocaleUpperCase("pt-BR");
    if (compact.length === 1) return compact.toLocaleUpperCase("pt-BR");
    return "?";
  }

  function namesLooselyMatch(author, displayName) {
    const who = normalizeText(author).toLocaleLowerCase("pt-BR");
    const name = normalizeText(displayName).toLocaleLowerCase("pt-BR");
    if (!who || !name || name === "conversa") return false;
    if (who === name) return true;
    const first = name.split(" ")[0];
    return first.length >= 3 && who === first;
  }

  function candidateAuthor(line) {
    const match = String(line || "").match(AUTHOR_RE);
    if (!match) return null;
    const author = match[1];
    if (author.length > 48 || /\d/.test(author)) return null;
    return { author, text: match[2] };
  }

  function parseTranscript(transcript, displayName) {
    const lines = String(transcript || "").replace(/\r\n/g, "\n").split("\n");
    const candidates = lines.map((line) => candidateAuthor(line));
    const counts = new Map();
    candidates.forEach((candidate) => {
      if (!candidate) return;
      const key = candidate.author.toLocaleLowerCase("pt-BR");
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const uniform = lines.length >= 2 && candidates.every((candidate, index) => {
      return lines[index].length === 0 || Boolean(candidate);
    });
    return lines.map((line, index) => {
      const candidate = candidates[index];
      if (!candidate) return { raw: line };
      const key = candidate.author.toLocaleLowerCase("pt-BR");
      const known = namesLooselyMatch(candidate.author, displayName)
        || (counts.get(key) || 0) >= 2
        || uniform;
      if (!known) return { raw: line };
      return { author: candidate.author, text: candidate.text };
    });
  }

  function attendanceStamp(sourceId) {
    const raw = String(sourceId || "");
    if (!raw.startsWith("attendance:")) return "";
    const parts = raw.slice("attendance:".length).split("|");
    if (parts.length < 3) return "";
    let stamp = parts.slice(2).join("|");
    try {
      stamp = decodeURIComponent(stamp);
    } catch (err) {
      /* O carimbo armazenado continua válido mesmo se a decodificação falhar. */
    }
    if (!/^\d{2}\/\d{2}\/\d{2}(?:\d{2})? \d{2}:\d{2}(?::\d{2})?$/.test(stamp)) return "";
    return stamp.replace(/(\d{2}:\d{2}):\d{2}$/, "$1");
  }

  function formatDetailStamp(buffer, nowMs = Date.now()) {
    const embedded = attendanceStamp(buffer?.sourceId);
    if (embedded) return embedded;
    const when = new Date(Number(buffer?.updatedAt || buffer?.capturedAt || nowMs));
    if (Number.isNaN(when.getTime())) return "";
    const day = String(when.getDate()).padStart(2, "0");
    const month = String(when.getMonth() + 1).padStart(2, "0");
    const year = String(when.getFullYear()).slice(-2);
    return `${day}/${month}/${year} ${formatClock(when)}`;
  }

  function formatDetailMeta(buffer, nowMs = Date.now()) {
    const stamp = formatDetailStamp(buffer, nowMs);
    const count = formatMessageCount(buffer?.transcript);
    return stamp ? `${stamp} · ${count}` : count;
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (data) => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "storage read failed"));
          return;
        }
        resolve(data || {});
      });
    });
  }

  function storageSet(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "storage write failed"));
          return;
        }
        resolve();
      });
    });
  }

  async function readState() {
    const data = await storageGet([STORAGE_KEY]);
    const stored = data?.[STORAGE_KEY];
    return {
      version: 1,
      buffers: Array.isArray(stored?.buffers) ? stored.buffers : []
    };
  }

  async function writeState(state) {
    try {
      await storageSet({
        [STORAGE_KEY]: {
          version: 1,
          buffers: state.buffers
        }
      });
      return true;
    } catch (err) {
      console.error("Não foi possível salvar o buffer de recuperação:", err?.message || err);
      return false;
    }
  }

  function bufferTime(buffer) {
    return Number(buffer?.updatedAt || buffer?.capturedAt || 0);
  }

  function applyRetention(buffers, now) {
    const fresh = (Array.isArray(buffers) ? buffers : []).filter((buffer) => {
      const time = bufferTime(buffer);
      return time > 0 && now - time < TTL_MS;
    });
    fresh.sort((a, b) => bufferTime(b) - bufferTime(a));
    return fresh.slice(0, MAX_BUFFERS);
  }

  function createBufferId() {
    if (globalThis.crypto?.randomUUID) return `rb_${crypto.randomUUID()}`;
    return `rb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function sameContent(current, next) {
    return String(current?.sourceId || "") === String(next?.sourceId || "")
      && normalizeText(current?.displayName) === normalizeText(next?.displayName)
      && normalizeTranscript(current?.transcript) === normalizeTranscript(next?.transcript)
      && String(current?.summaryObservation || "") === String(next?.summaryObservation || "")
      && String(current?.privateNote || "") === String(next?.privateNote || "")
      && (current?.anydeskCandidate || null) === (next?.anydeskCandidate || null);
  }

  function namesDiffer(a, b) {
    return normalizeText(a).toLocaleLowerCase() !== normalizeText(b).toLocaleLowerCase();
  }

  function findBuffer(buffers, identity) {
    if (identity.sourceId) {
      const bySource = buffers.find((buffer) => buffer.sourceId === identity.sourceId);
      if (bySource) return bySource;
    }

    if (!activeSession?.bufferId) return null;
    const bySession = buffers.find((buffer) => buffer.bufferId === activeSession.bufferId);
    if (!bySession) return null;
    if (identity.sourceId && !bySession.sourceId) return null;
    if (identity.sourceId && bySession.sourceId && bySession.sourceId !== identity.sourceId) return null;

    const nextName = identity.displayName || "";
    const previousName = bySession.displayName || "";
    if (!identity.sourceId && nextName && previousName && namesDiffer(nextName, previousName)) return null;
    return bySession;
  }

  function sameIdentity(previous, next) {
    if (previous.sourceId && next.sourceId) return previous.sourceId === next.sourceId;
    if (previous.sourceId || next.sourceId) {
      if (previous.displayName && next.displayName) return !namesDiffer(previous.displayName, next.displayName);
      return true;
    }
    if (previous.displayName && next.displayName) return !namesDiffer(previous.displayName, next.displayName);
    return true;
  }

  function readLiveSnapshot() {
    const capture = typeof ChatCaptureModule === "undefined" ? null : ChatCaptureModule;
    const observations = typeof ObservationsModule === "undefined" ? null : ObservationsModule;
    const rawName = normalizeText(capture?.capturarNomeCliente?.() || "");
    const observationSnapshot = observations?.getCurrentObservationSnapshot?.() || {};

    return {
      sourceId: resolveSourceId(document),
      displayName: !rawName || rawName === "Cliente" ? "" : rawName,
      transcript: capture?.capturarTextoChat?.() || "",
      summaryObservation: observationSnapshot.summaryObservation || "",
      privateNote: observationSnapshot.privateNote || ""
    };
  }

  async function persistSnapshotUnlocked(snapshot, now) {
    const transcript = normalizeTranscript(snapshot?.transcript);
    if (!transcript) return { ok: true, persisted: false, skipped: true, reason: "empty" };

    const state = await readState();
    const retained = applyRetention(state.buffers, now);
    const identity = {
      sourceId: String(snapshot?.sourceId || ""),
      displayName: normalizeText(snapshot?.displayName)
    };
    const existing = findBuffer(retained, identity);
    const summaryObservation = String(snapshot?.summaryObservation || "").trim();
    const privateNote = String(snapshot?.privateNote || "").trim();
    const anydeskCandidate = detectAnydeskCandidate(transcript);
    const displayName = identity.displayName || existing?.displayName || "Conversa";
    const sourceId = identity.sourceId || existing?.sourceId || "";

    let buffer;
    if (existing) {
      buffer = {
        ...existing,
        sourceId,
        displayName,
        transcript,
        summaryObservation,
        privateNote,
        anydeskCandidate,
        updatedAt: now
      };
      if (sameContent(existing, buffer)) {
        activeSession = {
          bufferId: existing.bufferId,
          sourceId: existing.sourceId || "",
          displayName: existing.displayName || ""
        };
        if (retained.length !== state.buffers.length) {
          const persisted = await writeState({ version: 1, buffers: retained });
          return {
            ok: persisted,
            persisted,
            skipped: true,
            bufferId: existing.bufferId,
            reason: persisted ? "unchanged" : "storage"
          };
        }
        return { ok: true, persisted: false, skipped: true, bufferId: existing.bufferId, reason: "unchanged" };
      }
    } else {
      buffer = {
        bufferId: createBufferId(),
        sourceId,
        displayName,
        capturedAt: now,
        updatedAt: now,
        transcript,
        summaryObservation,
        privateNote,
        anydeskCandidate
      };
    }

    const others = retained.filter((item) => item.bufferId !== buffer.bufferId);
    const buffers = applyRetention([buffer, ...others], now);
    const persisted = await writeState({ version: 1, buffers });
    if (!persisted) return { ok: false, persisted: false, reason: "storage" };

    activeSession = {
      bufferId: buffer.bufferId,
      sourceId: buffer.sourceId || "",
      displayName: buffer.displayName || ""
    };
    return { ok: true, persisted: true, skipped: false, bufferId: buffer.bufferId };
  }

  function persistSnapshot(snapshot, now = Date.now()) {
    return enqueue(async () => {
      try {
        return await persistSnapshotUnlocked(snapshot, now);
      } catch (err) {
        console.error("Não foi possível salvar o buffer de recuperação:", err?.message || err);
        return { ok: false, persisted: false, reason: "storage" };
      }
    });
  }

  function scheduleCapture() {
    const snapshot = readLiveSnapshot();
    const tasks = [];

    if (queuedSnapshot && !sameIdentity(queuedSnapshot, snapshot)) {
      const previous = queuedSnapshot;
      clearTimeout(debounceTimer);
      debounceTimer = null;
      queuedSnapshot = null;
      tasks.push(persistSnapshot(previous));
    }

    if (!normalizeTranscript(snapshot.transcript)) {
      if (queuedSnapshot && sameIdentity(queuedSnapshot, snapshot)) {
        const previous = queuedSnapshot;
        clearTimeout(debounceTimer);
        debounceTimer = null;
        queuedSnapshot = null;
        tasks.push(persistSnapshot(previous));
      }
      return Promise.all(tasks);
    }

    queuedSnapshot = snapshot;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const pending = queuedSnapshot;
      queuedSnapshot = null;
      debounceTimer = null;
      return persistSnapshot(pending);
    }, DEBOUNCE_MS);
    return Promise.all(tasks);
  }

  function flushNow() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    const snapshot = queuedSnapshot || readLiveSnapshot();
    queuedSnapshot = null;
    if (!normalizeTranscript(snapshot?.transcript)) {
      return Promise.resolve({ ok: true, persisted: false, skipped: true, reason: "empty" });
    }
    return persistSnapshot(snapshot);
  }

  function buildReportRequest(buffer) {
    const texto = String(buffer?.transcript || "");
    const promptComplement = String(buffer?.summaryObservation || "").trim();
    const request = { action: "gerarResumo", texto };
    if (promptComplement) request.promptComplement = promptComplement;
    return request;
  }

  async function cleanup(now = Date.now()) {
    return enqueue(async () => {
      try {
        const state = await readState();
        const buffers = applyRetention(state.buffers, now);
        if (buffers.length === state.buffers.length) {
          return { ok: true, persisted: false, buffers };
        }
        const persisted = await writeState({ version: 1, buffers });
        return { ok: persisted, persisted, buffers: persisted ? buffers : state.buffers };
      } catch (err) {
        console.error("Não foi possível salvar o buffer de recuperação:", err?.message || err);
        return { ok: false, persisted: false, reason: "storage" };
      }
    });
  }

  async function deleteBuffer(bufferId) {
    return enqueue(async () => {
      try {
        const state = await readState();
        const buffers = state.buffers.filter((buffer) => buffer.bufferId !== bufferId);
        if (buffers.length === state.buffers.length) {
          return { ok: true, persisted: false, skipped: true };
        }
        const persisted = await writeState({ version: 1, buffers });
        if (!persisted) return { ok: false, persisted: false, reason: "storage" };
        if (activeSession?.bufferId === bufferId) activeSession = null;
        return { ok: true, persisted: true };
      } catch (err) {
        console.error("Não foi possível salvar o buffer de recuperação:", err?.message || err);
        return { ok: false, persisted: false, reason: "storage" };
      }
    });
  }

  async function saveBufferEdits(bufferId, edits, now = Date.now()) {
    return enqueue(async () => {
      try {
        const state = await readState();
        const index = state.buffers.findIndex((buffer) => buffer.bufferId === bufferId);
        if (index < 0) return { ok: false, persisted: false, reason: "missing" };

        const current = state.buffers[index];
        const next = {
          ...current,
          summaryObservation: String(edits?.summaryObservation || "").trim(),
          privateNote: edits?.privateNote == null
            ? String(current.privateNote || "")
            : String(edits.privateNote),
          updatedAt: now
        };
        if (sameContent(current, next)) {
          return { ok: true, persisted: false, skipped: true, bufferId };
        }

        const buffers = state.buffers.slice();
        buffers[index] = next;
        const persisted = await writeState({ version: 1, buffers: applyRetention(buffers, now) });
        if (!persisted) return { ok: false, persisted: false, reason: "storage", buffer: current };
        return { ok: true, persisted: true, bufferId, buffer: next };
      } catch (err) {
        console.error("Não foi possível salvar o buffer de recuperação:", err?.message || err);
        return { ok: false, persisted: false, reason: "storage" };
      }
    });
  }

  function notify(message) {
    if (typeof alert === "function") alert(message);
  }

  function closePanel() {
    panelRequest += 1;
    panelOpening = false;
    clearTimeout(editTimer);
    editTimer = null;
    pendingObservation = null;
    panelDrag = null;
    panelShell = null;
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById("atendeai-recovery-overlay")?.remove();
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  async function copyAnydesk(candidate, button) {
    try {
      await navigator.clipboard.writeText(String(candidate || "").replace(/\s+/g, ""));
      button.textContent = "Copiado";
    } catch (err) {
      console.error("Não foi possível copiar o AnyDesk:", err?.message || err);
      button.textContent = "Copiar";
    }
  }

  async function generateFromBuffer(buffer, observationInput, generateButton, setStatus) {
    clearTimeout(editTimer);
    editTimer = null;
    pendingObservation = null;
    const summaryObservation = String(observationInput.value || "").trim();
    if (summaryObservation.length > MAX_PROMPT_COMPLEMENT_CHARS) {
      notify(`O campo "Observações para o resumo" excede o limite de ${MAX_PROMPT_COMPLEMENT_CHARS} caracteres.`);
      return;
    }

    generateButton.disabled = true;
    generateButton.textContent = "Gerando...";
    try {
      const saveResult = await saveBufferEdits(buffer.bufferId, {
        summaryObservation,
        privateNote: null
      });
      if (!saveResult.ok) setStatus("Não foi possível atualizar a cópia local.");

      const request = buildReportRequest({
        transcript: buffer.transcript,
        summaryObservation
      });
      const canSend = typeof MessagingHelper !== "undefined"
        && MessagingHelper?.send
        && typeof SummaryModule !== "undefined"
        && SummaryModule?.exibirResumo;
      if (!canSend) {
        notify("Não foi possível gerar o relatório.");
        return;
      }

      const response = await MessagingHelper.send(request);
      if (response?.resumo) {
        SummaryModule.exibirResumo(response.resumo, buffer.displayName || null);
        closePanel();
        return;
      }
      notify(response?.erro ? `Erro ao gerar resumo: ${response.erro}` : "Erro ao gerar resumo.");
    } catch (err) {
      notify(`Erro de comunicação: ${err?.message || err}`);
    } finally {
      generateButton.disabled = false;
      generateButton.textContent = "Gerar relatório";
    }
  }

  function clearChildren(node) {
    while (node?.children?.length) node.children[0].remove();
  }

  function setClassToken(element, token, enabled) {
    const parts = String(element?.className || "").split(/\s+/).filter((part) => part && part !== token);
    if (enabled) parts.push(token);
    if (element) element.className = parts.join(" ");
  }

  function isDragBlocked(target, boundary) {
    let node = target;
    while (node && node !== boundary) {
      const tag = String(node.tagName || "").toLowerCase();
      if (tag === "button" || tag === "textarea" || tag === "input" || tag === "a" || tag === "select" || tag === "label") {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function readViewport() {
    const width = Number(window.innerWidth);
    const height = Number(window.innerHeight);
    return {
      width: Number.isFinite(width) && width > 0 ? width : 1280,
      height: Number.isFinite(height) && height > 0 ? height : 800
    };
  }

  function measurePanel(panel) {
    const detail = panel?.getAttribute?.("data-mode") === "detail";
    let width = detail ? DETAIL_PANEL_WIDTH : LIST_PANEL_WIDTH;
    let height = PANEL_FALLBACK_HEIGHT;
    if (typeof panel?.getBoundingClientRect === "function") {
      const rect = panel.getBoundingClientRect();
      if (Number(rect?.width) > 0) width = Number(rect.width);
      if (Number(rect?.height) > 0) height = Number(rect.height);
    }
    return { width, height };
  }

  function clampPanelPosition(point, size) {
    const viewport = readViewport();
    const width = Math.max(1, Number(size?.width) || LIST_PANEL_WIDTH);
    const height = Math.max(1, Number(size?.height) || PANEL_FALLBACK_HEIGHT);
    const safeWidth = Math.min(width, Math.max(1, viewport.width - PANEL_MARGIN * 2));
    const safeHeight = Math.min(height, Math.max(1, viewport.height - PANEL_MARGIN * 2));
    const maxX = Math.max(PANEL_MARGIN, viewport.width - safeWidth - PANEL_MARGIN);
    const maxY = Math.max(PANEL_MARGIN, viewport.height - safeHeight - PANEL_MARGIN);
    const x = Number(point?.x);
    const y = Number(point?.y);
    return {
      x: Math.min(Math.max(PANEL_MARGIN, Number.isFinite(x) ? x : PANEL_MARGIN), maxX),
      y: Math.min(Math.max(PANEL_MARGIN, Number.isFinite(y) ? y : PANEL_MARGIN), maxY)
    };
  }

  function currentPanelOrigin(panel) {
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) return { x: left, y: top };
    if (typeof panel.getBoundingClientRect === "function") {
      const rect = panel.getBoundingClientRect();
      if (Number.isFinite(rect?.left) && Number.isFinite(rect?.top)) return { x: rect.left, y: rect.top };
    }
    return { x: PANEL_MARGIN, y: PANEL_MARGIN };
  }

  function applyPanelPosition(panel, point) {
    const next = clampPanelPosition(point, measurePanel(panel));
    panel.style.left = `${next.x}px`;
    panel.style.top = `${next.y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    return next;
  }

  function persistPanelPosition(point) {
    return storageSet({ [POSITION_KEY]: { x: point.x, y: point.y } }).catch((err) => {
      console.error("Não foi possível salvar a posição do painel de recuperação:", err?.message || err);
    });
  }

  async function readPanelPosition() {
    try {
      const data = await storageGet([POSITION_KEY]);
      const stored = data?.[POSITION_KEY];
      const x = Number(stored?.x);
      const y = Number(stored?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    } catch (err) {
      console.error("Não foi possível ler a posição do painel de recuperação:", err?.message || err);
      return null;
    }
  }

  function bindPanelDrag(header, panel) {
    header.addEventListener("pointerdown", (event) => {
      if (event.button != null && event.button !== 0) return;
      if (isDragBlocked(event.target, header)) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      const origin = currentPanelOrigin(panel);
      panelDrag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: origin.x,
        startY: origin.y
      };
      setClassToken(panel, "is-dragging", true);
      if (typeof header.setPointerCapture === "function" && event.pointerId != null) {
        try {
          header.setPointerCapture(event.pointerId);
        } catch (err) {
          /* Sem captura de ponteiro, o arraste ainda vale dentro do header. */
        }
      }
    });

    header.addEventListener("pointermove", (event) => {
      if (!panelDrag) return;
      if (event.pointerId != null && panelDrag.id != null && event.pointerId !== panelDrag.id) return;
      applyPanelPosition(panel, {
        x: panelDrag.startX + (event.clientX - panelDrag.x),
        y: panelDrag.startY + (event.clientY - panelDrag.y)
      });
    });

    const finishDrag = (event) => {
      if (!panelDrag) return;
      if (event?.pointerId != null && panelDrag.id != null && event.pointerId !== panelDrag.id) return;
      const left = parseFloat(panel.style.left);
      const top = parseFloat(panel.style.top);
      panelDrag = null;
      setClassToken(panel, "is-dragging", false);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return;
      void persistPanelPosition({ x: left, y: top });
    };
    header.addEventListener("pointerup", finishDrag);
    header.addEventListener("pointercancel", finishDrag);
    header.addEventListener("lostpointercapture", finishDrag);
  }

  function onViewportResize() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    const next = applyPanelPosition(panel, { x: left, y: top });
    void persistPanelPosition(next);
  }

  function reclampPanelAfterMode(panel) {
    if (!panel) return;
    if (!Number.isFinite(parseFloat(panel.style.left)) || !Number.isFinite(parseFloat(panel.style.top))) return;
    const origin = currentPanelOrigin(panel);
    const next = applyPanelPosition(panel, origin);
    if (next.x !== origin.x || next.y !== origin.y) void persistPanelPosition(next);
  }

  function ensureViewportClamp() {
    if (viewportClampBound) return;
    viewportClampBound = true;
    window.addEventListener("resize", onViewportResize);
  }

  function scheduleObservationSave(bufferId, value, setStatus) {
    pendingObservation = { bufferId, summaryObservation: value, setStatus };
    clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      return flushObservationSave();
    }, EDIT_DEBOUNCE_MS);
  }

  function flushObservationSave() {
    const pending = pendingObservation;
    pendingObservation = null;
    clearTimeout(editTimer);
    editTimer = null;
    if (!pending) return Promise.resolve(null);
    return saveBufferEdits(pending.bufferId, {
      summaryObservation: pending.summaryObservation,
      privateNote: null
    }).then((result) => {
      if (!result?.ok && typeof pending.setStatus === "function") {
        pending.setStatus("Não foi possível atualizar a cópia local.");
      }
      return result;
    });
  }

  function appendPrivateNote(parent, buffer) {
    const privateNote = String(buffer?.privateNote || "").trim();
    if (!privateNote) return;
    const note = createElement("div", "recovery-private-note");
    note.appendChild(createElement("div", "", "Notas privadas (somente neste navegador)"));
    note.appendChild(createElement("div", "recovery-private-note-text", privateNote));
    parent.appendChild(note);
  }

  function appendObservationField(parent, buffer, setStatus) {
    const observationLabel = createElement("label", "recovery-buffer-observation-label", "Observações para o resumo");
    const observationInput = document.createElement("textarea");
    observationInput.className = "recovery-buffer-observation";
    observationInput.rows = 3;
    observationInput.value = String(buffer?.summaryObservation || "");
    observationInput.addEventListener("input", () => {
      scheduleObservationSave(buffer.bufferId, observationInput.value, setStatus);
    });
    parent.appendChild(observationLabel);
    parent.appendChild(observationInput);
    return observationInput;
  }

  function renderTranscript(parent, buffer) {
    const scroller = createElement("div", "recovery-transcript");
    const parsed = parseTranscript(buffer?.transcript, buffer?.displayName);
    parsed.forEach((entry) => {
      if (!entry.author) {
        scroller.appendChild(createElement("div", "recovery-transcript-raw", entry.raw));
        return;
      }
      const row = createElement("div", "recovery-transcript-message");
      row.appendChild(createElement("div", "recovery-transcript-author", entry.author));
      row.appendChild(createElement("div", "recovery-transcript-text", entry.text));
      scroller.appendChild(row);
    });
    parent.appendChild(scroller);
  }

  function fillHeader(panel, options) {
    const header = panel.querySelector(".recovery-buffer-header");
    clearChildren(header);
    if (typeof options.onBack === "function") {
      const back = createElement("button", "recovery-buffer-back", "←");
      back.type = "button";
      back.setAttribute("aria-label", "Voltar");
      back.addEventListener("click", () => options.onBack());
      header.appendChild(back);
    }
    const titleWrap = createElement("div", "recovery-buffer-title-wrap");
    const titleRow = createElement("div", "recovery-buffer-title-row");
    if (options.mode !== "detail") {
      const icon = createElement("span", "recovery-buffer-icon", "A");
      icon.setAttribute("aria-hidden", "true");
      titleRow.appendChild(icon);
    }
    const titleClass = options.mode === "detail" ? "recovery-detail-name" : "recovery-buffer-title";
    titleRow.appendChild(createElement("strong", titleClass, options.title));
    titleWrap.appendChild(titleRow);
    const metaClass = options.mode === "detail" ? "recovery-detail-meta" : "recovery-buffer-desc";
    titleWrap.appendChild(createElement("p", metaClass, options.meta));
    header.appendChild(titleWrap);
    const closeButton = createElement("button", "recovery-buffer-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Fechar");
    closeButton.addEventListener("click", closePanel);
    header.appendChild(closeButton);
  }

  function bufferAfterObservationSave(buffer, typed, result) {
    const next = {
      ...buffer,
      summaryObservation: String(typed || "").trim()
    };
    if (!result?.buffer) return next;
    return {
      ...next,
      summaryObservation: result.buffer.summaryObservation,
      privateNote: result.buffer.privateNote,
      transcript: result.buffer.transcript,
      updatedAt: result.buffer.updatedAt
    };
  }

  function openConversation(buffer, observationInput, setStatus) {
    const typed = observationInput ? observationInput.value : buffer.summaryObservation;
    pendingObservation = {
      bufferId: buffer.bufferId,
      summaryObservation: typed,
      setStatus
    };
    return flushObservationSave().then((result) => {
      renderDetail(bufferAfterObservationSave(buffer, typed, result));
    });
  }

  function renderBufferItem(buffer, now, setStatus, index, onView) {
    const item = createElement("div", "recovery-buffer-item");
    item.setAttribute("data-tone", String((Number(index) || 0) % 4));

    const identity = createElement("div", "recovery-buffer-identity");
    const avatar = createElement("span", "recovery-buffer-avatar", initialsFromName(buffer.displayName));
    avatar.setAttribute("aria-hidden", "true");
    identity.appendChild(avatar);
    const head = createElement("div", "recovery-buffer-head");
    head.appendChild(createElement("div", "recovery-buffer-label", formatBufferLabel(buffer, now)));
    head.appendChild(createElement("div", "recovery-buffer-count", formatMessageCount(buffer.transcript)));
    identity.appendChild(head);
    item.appendChild(identity);

    if (buffer.anydeskCandidate) {
      const anydeskRow = createElement("div", "recovery-buffer-anydesk");
      anydeskRow.appendChild(createElement("span", "", `AnyDesk: ${buffer.anydeskCandidate}`));
      const copyButton = createElement("button", "", "Copiar");
      copyButton.type = "button";
      copyButton.addEventListener("click", () => {
        void copyAnydesk(buffer.anydeskCandidate, copyButton);
      });
      anydeskRow.appendChild(copyButton);
      item.appendChild(anydeskRow);
    }

    const observationInput = appendObservationField(item, buffer, setStatus);
    appendPrivateNote(item, buffer);

    const actions = createElement("div", "recovery-buffer-actions");
    const viewButton = createElement("button", "recovery-buffer-view", "Ver conversa");
    viewButton.type = "button";
    const generateButton = createElement("button", "recovery-buffer-generate", "Gerar relatório");
    generateButton.type = "button";
    const deleteButton = createElement("button", "recovery-buffer-delete", "Excluir");
    deleteButton.type = "button";

    viewButton.addEventListener("click", () => onView(buffer, observationInput));
    generateButton.addEventListener("click", () => {
      return generateFromBuffer(buffer, observationInput, generateButton, setStatus);
    });
    deleteButton.addEventListener("click", () => {
      return deleteBuffer(buffer.bufferId).then((result) => {
        if (!result?.ok) {
          setStatus("Não foi possível excluir a cópia local.");
          return;
        }
        return refreshList();
      });
    });

    actions.appendChild(viewButton);
    actions.appendChild(generateButton);
    actions.appendChild(deleteButton);
    item.appendChild(actions);
    return item;
  }

  function renderList(buffers) {
    const panel = document.getElementById(PANEL_ID);
    const shell = panelShell;
    if (!panel || !shell) return;
    panel.setAttribute("data-mode", "list");
    panel.setAttribute("aria-label", shell.showUnavailable ? "Gerar relatório" : "Conversas preservadas");
    fillHeader(panel, {
      mode: "list",
      title: shell.showUnavailable ? "Gerar relatório" : "Conversas preservadas",
      meta: "Recupere atendimentos importantes quando precisar."
    });
    const body = panel.querySelector(".recovery-buffer-body");
    clearChildren(body);
    if (shell.showUnavailable) {
      body.appendChild(createElement("div", "recovery-buffer-section", "Conversa atual"));
      body.appendChild(createElement("div", "recovery-buffer-unavailable", "indisponível"));
      body.appendChild(createElement("div", "recovery-buffer-section", "Conversas preservadas"));
    }
    if (!buffers.length) {
      body.appendChild(createElement("div", "recovery-buffer-empty", shell.readFailed
        ? "Não foi possível ler as conversas preservadas."
        : "Nenhuma conversa preservada."));
    } else {
      const list = createElement("div", "recovery-buffer-list");
      buffers.forEach((buffer, index) => {
        list.appendChild(renderBufferItem(buffer, shell.now, shell.setStatus, index, (item, input) => {
          return openConversation(item, input, shell.setStatus);
        }));
      });
      body.appendChild(list);
    }
    reclampPanelAfterMode(panel);
  }

  function renderDetail(buffer) {
    const panel = document.getElementById(PANEL_ID);
    const shell = panelShell;
    if (!panel || !shell) return;
    panel.setAttribute("data-mode", "detail");
    panel.setAttribute("aria-label", "Ver conversa");
    fillHeader(panel, {
      mode: "detail",
      title: normalizeText(buffer?.displayName) || "Conversa",
      meta: formatDetailMeta(buffer, shell.now),
      onBack: () => {
        const input = panel.querySelector(".recovery-buffer-observation");
        pendingObservation = {
          bufferId: buffer.bufferId,
          summaryObservation: input ? input.value : buffer.summaryObservation,
          setStatus: shell.setStatus
        };
        return flushObservationSave().then(() => refreshList());
      }
    });
    const body = panel.querySelector(".recovery-buffer-body");
    clearChildren(body);
    renderTranscript(body, buffer);
    const footer = createElement("div", "recovery-detail-footer");
    const observationInput = appendObservationField(footer, buffer, shell.setStatus);
    appendPrivateNote(footer, buffer);
    const actions = createElement("div", "recovery-buffer-actions");
    const generateButton = createElement("button", "recovery-buffer-generate", "Gerar relatório");
    generateButton.type = "button";
    generateButton.addEventListener("click", () => {
      return generateFromBuffer(buffer, observationInput, generateButton, shell.setStatus);
    });
    actions.appendChild(generateButton);
    footer.appendChild(actions);
    body.appendChild(footer);
    reclampPanelAfterMode(panel);
  }

  function refreshList() {
    const panel = document.getElementById(PANEL_ID);
    const shell = panelShell;
    if (!panel || !shell) return openPreservedPanel();
    const now = Date.now();
    shell.now = now;
    return enqueue(async () => {
      try {
        const state = await readState();
        const retained = applyRetention(state.buffers, now);
        if (retained.length !== state.buffers.length) {
          await writeState({ version: 1, buffers: retained });
        }
        return { buffers: retained, readFailed: false };
      } catch (err) {
        console.error("Não foi possível ler o buffer de recuperação:", err?.message || err);
        return { buffers: [], readFailed: true };
      }
    }).then((loaded) => {
      if (!document.getElementById(PANEL_ID) || !panelShell) return loaded.buffers;
      panelShell.readFailed = loaded.readFailed;
      renderList(loaded.buffers);
      return loaded.buffers;
    });
  }

  function renderFallback(buffers, now = Date.now(), options = {}) {
    closePanel();
    ensureViewportClamp();
    const overlay = createElement("div", "recovery-buffer-overlay");
    overlay.id = "atendeai-recovery-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:999997;";
    overlay.addEventListener("click", closePanel);
    document.body.appendChild(overlay);

    const panel = createElement("div", "recovery-buffer-panel");
    panel.id = PANEL_ID;
    panel.style.cssText = "position:fixed;right:20px;bottom:90px;z-index:1000002;background:#fff;";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("data-mode", "list");
    const header = createElement("div", "recovery-buffer-header");
    panel.appendChild(header);
    panel.appendChild(createElement("div", "recovery-buffer-body"));
    const status = createElement("div", "recovery-buffer-status", "");
    panel.appendChild(status);
    panelShell = {
      showUnavailable: options.currentUnavailable !== false,
      readFailed: Boolean(options.readFailed),
      setStatus(text) {
        status.textContent = text || "";
      },
      now
    };
    bindPanelDrag(header, panel);
    document.body.appendChild(panel);
    renderList(buffers);
    if (options.position) applyPanelPosition(panel, options.position);
  }

  async function openPreservedPanel() {
    const request = ++panelRequest;
    panelOpening = true;
    const now = Date.now();
    const loaded = await enqueue(async () => {
      try {
        const state = await readState();
        const retained = applyRetention(state.buffers, now);
        if (retained.length !== state.buffers.length) {
          await writeState({ version: 1, buffers: retained });
        }
        const position = await readPanelPosition();
        return { buffers: retained, readFailed: false, position };
      } catch (err) {
        console.error("Não foi possível ler o buffer de recuperação:", err?.message || err);
        return { buffers: [], readFailed: true, position: null };
      }
    });
    if (request !== panelRequest) return loaded.buffers;
    panelOpening = false;
    renderFallback(loaded.buffers, now, {
      readFailed: loaded.readFailed,
      currentUnavailable,
      position: loaded.position
    });
    return loaded.buffers;
  }

  async function openReportFallback() {
    currentUnavailable = true;
    return openPreservedPanel();
  }

  async function openPreservedBuffers() {
    if (panelOpening || document.getElementById(PANEL_ID)) {
      closePanel();
      return [];
    }
    currentUnavailable = false;
    return openPreservedPanel();
  }

  function onVisibility() {
    if (document.hidden) return flushNow();
    return undefined;
  }

  function init() {
    if (started) return;
    started = true;
    ensureViewportClamp();

    if (document.body && typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => {
        void scheduleCapture();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (typeof ObservationsModule !== "undefined") {
      ObservationsModule.onCurrentObservationsReady?.(() => { void scheduleCapture(); });
    }
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });
    document.addEventListener("click", (event) => {
      const panel = document.getElementById(PANEL_ID);
      if (panel && !panel.contains(event.target)) closePanel();
    });
    window.addEventListener("pagehide", () => {
      void flushNow();
    });
    void scheduleCapture();
  }

  function resetSession() {
    activeSession = null;
    queuedSnapshot = null;
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  return {
    init,
    getCurrentConversationIdentity,
    getConversationIdentityFromCard,
    openReportFallback,
    openPreservedBuffers,
    buildReportRequest,
    formatBufferLabel,
    __test: {
      STORAGE_KEY,
      POSITION_KEY,
      DEBOUNCE_MS,
      TTL_MS,
      MAX_BUFFERS,
      scheduleCapture,
      flushNow,
      persistSnapshot,
      resolveSourceId,
      detectAnydeskCandidate,
      applyRetention,
      cleanup,
      deleteBuffer,
      saveBufferEdits,
      readState,
      resetSession,
      initialsFromName,
      parseTranscript,
      clampPanelPosition,
      getActiveSession() {
        return activeSession ? { ...activeSession } : null;
      }
    }
  };
})();

window.RecoveryBufferModule = RecoveryBufferModule;
