const ObservationsModule = (() => {
  const STORAGE_KEY = "atendeai_chat_observations";
  const BUTTON_ID = "btnObservacoes";
  const DRAWER_ID = "atendeai-observations-drawer";
  const OVERLAY_ID = "atendeai-observations-overlay";
  const OBS_FIELD_ID = "atendeai-observation-text";
  const COMPLEMENT_FIELD_ID = "atendeai-prompt-complement";
  const USE_COMPLEMENT_ID = "atendeai-use-prompt-complement";
  const SAVE_STATUS_ID = "atendeai-observations-save-status";
  const MAX_COMPLEMENT_CHARS = 2000;
  const SAVE_DEBOUNCE_MS = 450;

  let currentChatKey = "";
  let currentMeta = { contactName: "", phone: "", protocol: "" };
  let currentValues = {
    observationText: "",
    promptComplement: "",
    usePromptComplement: false
  };
  let saveTimer = null;
  let mutationObserver = null;
  let pollTimer = null;
  let lastIdentityHash = "";
  let syncInProgress = false;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function extractProtocol(text) {
    if (!text) return "";
    const match = text.match(/protocolo\s*[:#-]?\s*([a-z0-9./_-]{4,})/i);
    return match ? normalizeText(match[1]) : "";
  }

  function extractPhone(text) {
    if (!text) return "";
    const match = text.match(/(?:\+?\d[\d()\-\s]{7,}\d)/);
    return match ? normalizePhone(match[0]) : "";
  }

  function getCandidateTextBlocks() {
    const blocks = [];
    const selectors = [
      ".contact-info",
      ".contact-details",
      ".conversation-header",
      ".chat-header",
      ".drawer",
      ".sidebar",
      "aside",
      "header"
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const text = normalizeText(el.innerText || "");
        if (text) blocks.push(text);
      });
    });

    return blocks;
  }

  function detectContactName() {
    const selectors = [
      "#contact-name",
      ".contact-name",
      ".header-info .name",
      ".conversation-header .name",
      ".chat-header .title",
      ".chat-title"
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = normalizeText(el?.innerText || "");
      if (value) return value;
    }

    if (window.ChatCaptureModule?.capturarNomeCliente) {
      const value = normalizeText(window.ChatCaptureModule.capturarNomeCliente());
      if (value && value !== "Cliente") return value;
    }

    return "";
  }

  function detectChatMeta() {
    const blocks = getCandidateTextBlocks();
    const contactName = detectContactName();
    let protocol = "";
    let phone = "";

    for (const block of blocks) {
      if (!protocol) protocol = extractProtocol(block);
      if (!phone) phone = extractPhone(block);
      if (protocol && phone) break;
    }

    return { contactName, phone, protocol };
  }

  function buildChatKey(meta) {
    if (meta.protocol) return `protocol:${meta.protocol.toLowerCase()}`;
    if (meta.phone) return `phone:${meta.phone}`;
    if (meta.contactName) return `contact:${meta.contactName.toLowerCase()}`;
    return "";
  }

  async function readStorageMap() {
    const data = await StorageHelper.get([STORAGE_KEY]);
    return data?.[STORAGE_KEY] || {};
  }

  async function writeStorageMap(map) {
    await StorageHelper.set({ [STORAGE_KEY]: map });
  }

  function findExistingContactButton(label) {
    const targetLabel = normalizeText(label).toLowerCase();
    return Array.from(document.querySelectorAll("button")).find((button) => {
      return normalizeText(button.textContent || "").toLowerCase() === targetLabel;
    });
  }

  function findButtonHost() {
    const notesButton = findExistingContactButton("Anotações") || findExistingContactButton("Anotacoes");
    if (notesButton) {
      return notesButton.parentElement || notesButton.closest("div");
    }

    const galleryButton = findExistingContactButton("Galeria");
    if (galleryButton) {
      return galleryButton.parentElement || galleryButton.closest("div");
    }

    return null;
  }

  function createButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "atendeai-observations-button";
    button.innerHTML = `
      <span class="atendeai-observations-icon">📝</span>
      <span>Observações</span>
      <span class="atendeai-observations-dot" aria-hidden="true"></span>
      <span class="atendeai-observations-ia">IA</span>
    `;
    button.addEventListener("click", () => openDrawer());
    return button;
  }

  function ensureButton() {
    updateButtonState();
  }

  function updateButtonState() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;

    const hasObservation = !!String(currentValues.observationText || "").trim();
    const hasComplement = !!String(currentValues.promptComplement || "").trim();
    const usesComplement = hasComplement && currentValues.usePromptComplement === true;

    button.classList.toggle("has-observation", hasObservation || hasComplement);
    button.classList.toggle("uses-ia", usesComplement);
    const dot = button.querySelector(".atendeai-observations-dot");
    const iaBadge = button.querySelector(".atendeai-observations-ia");
    if (dot) dot.hidden = !(hasObservation || hasComplement);
    if (iaBadge) iaBadge.hidden = !usesComplement;
    button.title = usesComplement
      ? "Este chat tem observações e complemento ativo para IA"
      : hasObservation || hasComplement
        ? "Este chat tem observações salvas"
        : "Adicionar observações para este chat";
  }

  function setStatus(text, tone = "neutral") {
    const status = document.getElementById(SAVE_STATUS_ID);
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function scheduleSave() {
    setStatus("Salvando...", "pending");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistCurrentInputs().catch((err) => {
        console.error("Observations save error:", err);
        setStatus("Erro ao salvar", "error");
      });
    }, SAVE_DEBOUNCE_MS);
  }

  async function persistCurrentInputs() {
    if (!currentChatKey) {
      setStatus("Selecione um chat", "error");
      return;
    }

    const obsInput = document.getElementById(OBS_FIELD_ID);
    const complementInput = document.getElementById(COMPLEMENT_FIELD_ID);
    const useComplementInput = document.getElementById(USE_COMPLEMENT_ID);
    if (!obsInput || !complementInput || !useComplementInput) return;

    const observationText = String(obsInput.value || "");
    const promptComplement = String(complementInput.value || "");
    const usePromptComplement = useComplementInput.checked === true;

    currentValues = { observationText, promptComplement, usePromptComplement };

    const map = await readStorageMap();
    const isEmpty = !observationText.trim() && !promptComplement.trim() && !usePromptComplement;

    if (isEmpty) {
      delete map[currentChatKey];
    } else {
      map[currentChatKey] = {
        observationText,
        promptComplement,
        usePromptComplement,
        updatedAt: Date.now(),
        contactName: currentMeta.contactName || "",
        phone: currentMeta.phone || "",
        protocol: currentMeta.protocol || ""
      };
    }

    await writeStorageMap(map);
    setStatus("Salvo", "success");
    updateButtonState();
  }

  async function loadCurrentValues() {
    if (!currentChatKey) {
      currentValues = { observationText: "", promptComplement: "", usePromptComplement: false };
      applyValuesToInputs();
      updateButtonState();
      return;
    }

    const map = await readStorageMap();
    const item = map[currentChatKey] || {};
    currentValues = {
      observationText: String(item.observationText || ""),
      promptComplement: String(item.promptComplement || ""),
      usePromptComplement: item.usePromptComplement === true
    };
    applyValuesToInputs();
    updateButtonState();
  }

  function applyValuesToInputs() {
    const obsInput = document.getElementById(OBS_FIELD_ID);
    const complementInput = document.getElementById(COMPLEMENT_FIELD_ID);
    const useComplementInput = document.getElementById(USE_COMPLEMENT_ID);
    const counter = document.getElementById("atendeai-prompt-complement-count");

    if (obsInput) obsInput.value = currentValues.observationText || "";
    if (complementInput) complementInput.value = currentValues.promptComplement || "";
    if (useComplementInput) useComplementInput.checked = currentValues.usePromptComplement === true;
    if (counter) counter.textContent = `${String(currentValues.promptComplement || "").length}/${MAX_COMPLEMENT_CHARS}`;
  }

  async function syncChatContext() {
    if (syncInProgress) return;
    syncInProgress = true;
    try {
      const meta = detectChatMeta();
      const chatKey = buildChatKey(meta);
      const identityHash = `${chatKey}|${meta.contactName}|${meta.phone}|${meta.protocol}`;
      if (identityHash === lastIdentityHash) return;

      currentMeta = meta;
      currentChatKey = chatKey;
      lastIdentityHash = identityHash;
      await loadCurrentValues();
    } finally {
      syncInProgress = false;
    }
  }

  function removeDrawerElements() {
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(DRAWER_ID)?.remove();
  }

  function closeDrawer() {
    clearTimeout(saveTimer);
    persistCurrentInputs()
      .catch((err) => console.error("Observations close save error:", err))
      .finally(removeDrawerElements);
  }

  function openDrawer() {
    removeDrawerElements();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "atendeai-observations-overlay";
    overlay.addEventListener("click", closeDrawer);

    const drawer = document.createElement("aside");
    drawer.id = DRAWER_ID;
    drawer.className = "atendeai-observations-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.innerHTML = `
      <div class="atendeai-observations-header">
        <div>
          <div class="atendeai-observations-title">Observações</div>
          <div class="atendeai-observations-client"></div>
        </div>
        <button type="button" class="atendeai-observations-close" aria-label="Fechar">×</button>
      </div>

      <div class="atendeai-observations-body">
        <label class="atendeai-observations-label" for="${OBS_FIELD_ID}">Observações privadas</label>
        <textarea id="${OBS_FIELD_ID}" rows="7" placeholder="Anote algo para lembrar depois. Este texto fica somente local e não vai para a API."></textarea>

        <div class="atendeai-observations-section-title">Complemento para IA</div>
        <label class="atendeai-observations-toggle">
          <input id="${USE_COMPLEMENT_ID}" type="checkbox" />
          <span>Usar complemento na IA</span>
        </label>
        <textarea id="${COMPLEMENT_FIELD_ID}" rows="6" maxlength="${MAX_COMPLEMENT_CHARS}" placeholder="Contexto opcional para enviar junto com Gerar Relatório ou Dicas Inteligentes."></textarea>

        <div class="atendeai-observations-footer-row">
          <span id="${SAVE_STATUS_ID}" data-tone="neutral">Salvo</span>
          <span id="atendeai-prompt-complement-count">0/${MAX_COMPLEMENT_CHARS}</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    const client = drawer.querySelector(".atendeai-observations-client");
    client.textContent = currentMeta.contactName || currentMeta.phone || currentMeta.protocol || "Chat atual";

    drawer.querySelector(".atendeai-observations-close")?.addEventListener("click", closeDrawer);
    bindDrawerEvents();
    applyValuesToInputs();
    drawer.querySelector(`#${OBS_FIELD_ID}`)?.focus();
  }

  function bindDrawerEvents() {
    const obsInput = document.getElementById(OBS_FIELD_ID);
    const complementInput = document.getElementById(COMPLEMENT_FIELD_ID);
    const useComplementInput = document.getElementById(USE_COMPLEMENT_ID);
    const counter = document.getElementById("atendeai-prompt-complement-count");

    obsInput?.addEventListener("input", scheduleSave);
    complementInput?.addEventListener("input", () => {
      if (counter) counter.textContent = `${complementInput.value.length}/${MAX_COMPLEMENT_CHARS}`;
      scheduleSave();
    });
    useComplementInput?.addEventListener("change", scheduleSave);
  }

  function initObservers() {
    if (mutationObserver || pollTimer) return;

    mutationObserver = new MutationObserver(() => {
      ensureButton();
      syncChatContext().catch((err) => console.error("Observations sync error:", err));
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    pollTimer = setInterval(() => {
      ensureButton();
      syncChatContext().catch(() => {});
    }, 1200);
  }

  function getPromptComplementForCurrentChat() {
    const complementInput = document.getElementById(COMPLEMENT_FIELD_ID);
    const useComplementInput = document.getElementById(USE_COMPLEMENT_ID);

    const promptComplement = complementInput
      ? String(complementInput.value || "")
      : String(currentValues.promptComplement || "");

    const usePromptComplement = useComplementInput
      ? useComplementInput.checked === true
      : currentValues.usePromptComplement === true;

    if (!usePromptComplement || !promptComplement.trim()) return "";
    return promptComplement.trim();
  }

  function getCurrentChatMeta() {
    return { ...currentMeta, chatKey: currentChatKey };
  }

  function init() {
    ensureButton();
    syncChatContext().catch((err) => console.error("Observations init error:", err));
    initObservers();
  }

  return {
    init,
    openDrawer,
    getPromptComplementForCurrentChat,
    getCurrentChatMeta
  };
})();

window.ObservationsModule = ObservationsModule;
