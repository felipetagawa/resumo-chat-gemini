// Buffer local de recuperação (V1A).
// Guarda por pouco tempo a conversa SZ aberta em chrome.storage.local para o
// Gerar Relatório continuar depois que o histórico sai do DOM.
// Retenção: 24 horas, no máximo 10 conversas, com exclusão manual.
// A captura não faz rede nem chama IA. O buffer inteiro nunca vai para o backend.
// Identidade: reutiliza os atributos estáveis que pre-controls.js já lê no card
// (data-chat-id, data-contact-id, data-id, id). Valor parecido com telefone é
// ignorado. Protocolo, telefone e nome não são chave durável; sem atributo
// estável, a sessão visível ganha um bufferId local.

const RecoveryBufferModule = (() => {
  const STORAGE_KEY = "atendeai_recovery_buffers_v1";
  const PANEL_ID = "atendeai-recovery-report-fallback";
  const DEBOUNCE_MS = 750;
  const TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_BUFFERS = 10;
  const MAX_PROMPT_COMPLEMENT_CHARS = 2000;
  const EDIT_DEBOUNCE_MS = 400;

  const CONVERSATION_ATTRS = ["data-chat-id", "data-contact-id", "data-id"];
  const CARD_ATTRS = ["data-chat-id", "data-contact-id", "data-id", "id"];
  const ACTIVE_CARD_SELECTORS = [
    ".sz_contact.active",
    ".sz_contact.selected",
    ".sz_contact.open",
    ".chats-list .chat.active"
  ];
  const IGNORED_DOM_IDS = new Set(["contact-fields", "app", "root", "content", "messages"]);

  let started = false;
  let debounceTimer = null;
  let editTimer = null;
  let queuedSnapshot = null;
  let activeSession = null;
  let writeQueue = Promise.resolve();
  let currentUnavailable = true;

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
      if (attr === "id" && IGNORED_DOM_IDS.has(value)) continue;
      return `${attr}:${value}`;
    }
    return "";
  }

  function resolveSourceId(doc = document) {
    const message = doc.querySelector?.(".msg");
    let node = message || null;
    while (node) {
      const sourceId = readAttrs(node, CONVERSATION_ATTRS);
      if (sourceId) return sourceId;
      node = node.parentElement || null;
    }

    for (const selector of ACTIVE_CARD_SELECTORS) {
      const card = doc.querySelector?.(selector);
      const sourceId = readAttrs(card, CARD_ATTRS);
      if (sourceId) return sourceId;
    }

    return "";
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
    clearTimeout(editTimer);
    editTimer = null;
    document.getElementById(PANEL_ID)?.remove();
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

  function renderBufferItem(buffer, now, setStatus) {
    const item = createElement("div", "recovery-buffer-item");
    item.style.cssText = "padding:12px 0; border-top:1px solid #eee;";

    item.appendChild(createElement("div", "recovery-buffer-label", formatBufferLabel(buffer, now)));
    item.appendChild(createElement("div", "recovery-buffer-count", formatMessageCount(buffer.transcript)));

    if (buffer.anydeskCandidate) {
      const anydeskRow = createElement("div", "recovery-buffer-anydesk");
      anydeskRow.style.cssText = "margin-top:8px; display:flex; gap:8px; align-items:center;";
      anydeskRow.appendChild(createElement("span", "", `AnyDesk: ${buffer.anydeskCandidate}`));
      const copyButton = createElement("button", "", "Copiar");
      copyButton.type = "button";
      copyButton.addEventListener("click", () => {
        void copyAnydesk(buffer.anydeskCandidate, copyButton);
      });
      anydeskRow.appendChild(copyButton);
      item.appendChild(anydeskRow);
    }

    const observationLabel = createElement("label", "recovery-buffer-observation-label", "Observações para o resumo");
    observationLabel.style.cssText = "display:block; margin-top:8px; font-size:12px; color:#3c4043;";
    const observationInput = document.createElement("textarea");
    observationInput.className = "recovery-buffer-observation";
    observationInput.rows = 3;
    observationInput.value = String(buffer.summaryObservation || "");
    observationInput.style.cssText = "width:100%; box-sizing:border-box; margin-top:4px;";
    observationInput.addEventListener("input", () => {
      clearTimeout(editTimer);
      editTimer = setTimeout(() => {
        void saveBufferEdits(buffer.bufferId, {
          summaryObservation: observationInput.value,
          privateNote: null
        }).then((result) => {
          if (!result?.ok) setStatus("Não foi possível atualizar a cópia local.");
        });
      }, EDIT_DEBOUNCE_MS);
    });
    item.appendChild(observationLabel);
    item.appendChild(observationInput);

    const privateNote = String(buffer.privateNote || "").trim();
    if (privateNote) {
      const note = createElement("div", "recovery-private-note");
      note.style.cssText = "margin-top:8px; font-size:12px; color:#5f6368;";
      note.appendChild(createElement("div", "", "Notas privadas (somente neste navegador)"));
      note.appendChild(createElement("div", "recovery-private-note-text", privateNote));
      item.appendChild(note);
    }

    const actions = createElement("div", "recovery-buffer-actions");
    actions.style.cssText = "display:flex; gap:8px; margin-top:8px;";
    const generateButton = createElement("button", "recovery-buffer-generate", "Gerar relatório");
    generateButton.type = "button";
    const deleteButton = createElement("button", "recovery-buffer-delete", "Excluir");
    deleteButton.type = "button";

    generateButton.addEventListener("click", () => {
      return generateFromBuffer(buffer, observationInput, generateButton, setStatus);
    });
    deleteButton.addEventListener("click", () => {
      return deleteBuffer(buffer.bufferId).then((result) => {
        if (!result?.ok) {
          setStatus("Não foi possível excluir a cópia local.");
          return;
        }
        return openPreservedPanel();
      });
    });

    actions.appendChild(generateButton);
    actions.appendChild(deleteButton);
    item.appendChild(actions);
    return item;
  }

  function renderFallback(buffers, now = Date.now(), options = {}) {
    clearTimeout(editTimer);
    editTimer = null;
    document.getElementById(PANEL_ID)?.remove();

    const panel = createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "right:20px",
      "bottom:90px",
      "z-index:1000002",
      "width:360px",
      "max-height:70vh",
      "overflow:auto",
      "background:#fff",
      "border:1px solid #dadce0",
      "border-radius:8px",
      "padding:16px",
      "box-shadow:0 4px 15px rgba(0,0,0,0.15)",
      "font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      "font-size:14px",
      "color:#202124"
    ].join(";");

    const showUnavailable = options.currentUnavailable !== false;
    const header = createElement("div");
    header.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:8px;";
    header.appendChild(createElement("strong", "", showUnavailable ? "Gerar relatório" : "Conversas preservadas"));
    const closeButton = createElement("button", "", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Fechar");
    closeButton.addEventListener("click", closePanel);
    header.appendChild(closeButton);
    panel.appendChild(header);

    if (showUnavailable) {
      panel.appendChild(createElement("div", "", "Conversa atual"));
      const unavailable = createElement("div", "", "indisponível");
      unavailable.style.cssText = "margin:0 0 12px 12px; color:#5f6368;";
      panel.appendChild(unavailable);
      panel.appendChild(createElement("div", "", "Conversas preservadas"));
    }

    const status = createElement("div", "recovery-buffer-status", "");
    status.style.cssText = "min-height:18px; margin-top:8px; color:#d93025; font-size:12px;";
    const setStatus = (text) => {
      status.textContent = text || "";
    };

    if (!buffers.length) {
      const empty = createElement("div", "", options.readFailed
        ? "Não foi possível ler as conversas preservadas."
        : "Nenhuma conversa preservada.");
      empty.style.cssText = "margin-top:8px; color:#5f6368;";
      panel.appendChild(empty);
    } else {
      buffers.forEach((buffer) => panel.appendChild(renderBufferItem(buffer, now, setStatus)));
    }

    panel.appendChild(status);
    document.body.appendChild(panel);
  }

  async function openPreservedPanel() {
    const now = Date.now();
    const loaded = await enqueue(async () => {
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
    });
    renderFallback(loaded.buffers, now, {
      readFailed: loaded.readFailed,
      currentUnavailable
    });
    return loaded.buffers;
  }

  async function openReportFallback() {
    currentUnavailable = true;
    return openPreservedPanel();
  }

  async function openPreservedBuffers() {
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
    openReportFallback,
    openPreservedBuffers,
    buildReportRequest,
    formatBufferLabel,
    __test: {
      STORAGE_KEY,
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
      getActiveSession() {
        return activeSession ? { ...activeSession } : null;
      }
    }
  };
})();

window.RecoveryBufferModule = RecoveryBufferModule;
