document.addEventListener("DOMContentLoaded", () => {

  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, (data) => resolve(data || {})));

  const storageSet = (obj) =>
    new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));

  const storageRemove = (key) =>
    new Promise((resolve) => chrome.storage.local.remove(key, () => resolve()));

  const el = {
    tabs: Array.from(document.querySelectorAll(".nav-tab")),
    sections: Array.from(document.querySelectorAll(".page-section")),
    tabsContainer: document.querySelector(".nav-tabs"),
    openCredits: document.getElementById("openCredits"),
    creditsDialog: document.getElementById("creditsDialog"),
    closeCredits: document.getElementById("closeCredits"),
    clearStyleSamples: document.getElementById("clearStyleSamples"),
    styleSamplesCount: document.getElementById("styleSamplesCount"),
    status: document.getElementById("status"),
    historyList: document.getElementById("historyList"),
    btnLimpar: document.getElementById("limparHistorico"),
    manualCallHistoryList: document.getElementById("manualCallHistoryList"),
    btnLimparManual: document.getElementById("limparHistoricoManual"),
    fixedMessagesContainer: document.getElementById("fixedMessages"),
    customMessagesContainer: document.getElementById("customMessages"),
    newMessageInput: document.getElementById("newMessage"),
    btnAddMessage: document.getElementById("addMessage"),
    btnBackupMessages: document.getElementById("backupMessages"),
    btnLimparTodosAtalhos: document.getElementById("limparTodosAtalhos"),
    statusAtalhos: document.getElementById("statusAtalhos"),
    customCount: document.getElementById("customCount"),
    nameSetupBlock: document.getElementById("nameSetupBlock"),
    nameInput: document.getElementById("nameInput"),
    saveNameBtn: document.getElementById("saveNameBtn"),
    nameStatus: document.getElementById("nameStatus"),
    editNameTrigger: document.getElementById("editNameTrigger"),
    nameDialog: document.getElementById("nameDialog"),
    nameDialogInput: document.getElementById("editNameDialogInput"),
    saveNameDialog: document.getElementById("editSaveNameDialog"),
    cancelNameDialog: document.getElementById("editCancelNameDialog"),
    closeNameDialog: document.getElementById("editCloseNameDialog"),
    homeGreetingPrefix: document.getElementById("homeGreetingPrefix"),
    homeGreetingComma: document.getElementById("homeGreetingComma"),
    sectorBadge: document.getElementById("sectorBadge"),
    onboardingDialog: document.getElementById("onboardingDialog"),
    onboardingNameInput: document.getElementById("onboardingNameInput"),
    onboardingSaveBtn: document.getElementById("onboardingSaveBtn"),
    onboardingCancelBtn: document.getElementById("onboardingCancelBtn"),
    onboardingTitle: document.getElementById("onboardingTitle"),
    onboardingNameWrap: document.getElementById("onboardingNameWrap"),
    onboardingNameEcho: document.getElementById("onboardingNameEcho"),
    onboardingStatus: document.getElementById("onboardingStatus"),
    versionElements: document.querySelectorAll(".app-version"),
    visibilityOptions: document.getElementById("visibilityOptions"),
    saveVisibilityBtn: document.getElementById("saveVisibilityBtn"),
    visStatus: document.getElementById("visStatus"),
    changelogList: document.getElementById("changelogList"),
    themeDark: document.getElementById("themeDark"),
    themeLight: document.getElementById("themeLight"),
    themeSystem: document.getElementById("themeSystem"),
    documentationAutofillEnabled: document.getElementById("documentationAutofillEnabled"),
    queueContextAnydesk: document.getElementById("queueContextAnydesk"),
    queueContextProblem: document.getElementById("queueContextProblem"),
    documentationLearningEnabled: document.getElementById("documentationLearningEnabled"),
    documentationLearningCount: document.getElementById("documentationLearningCount"),
    clearDocumentationLearning: document.getElementById("clearDocumentationLearning"),
  };

  const MAX_SHORTCUT_LEN = 20;
  const INVALID_SHORTCUT_CHARS = /[^A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]/g;
  const KEY_ACTIVE_TAB = "settings_active_tab";
  const NAME_KEY = "atendeai_user_name";
  const SECTOR_KEY = "atendeai_user_sector";
  const VISIBILITY_KEY = "atendeai_visibility";

  const BUTTON_CONFIGS = [
    { id: "btnAgenda", label: "Agenda & Gestão", defaultSupport: true, defaultPre: true },
    { id: "btnMessages", label: "Mensagens Padrão", defaultSupport: true, defaultPre: true },
    { id: "btnResumoGemini", label: "Gerar Relatório (IA)", defaultSupport: true, defaultPre: false },
    { id: "btnChamadoManual", label: "Chamado Manual", defaultSupport: true, defaultPre: false },
    { id: "btnConsultarDocsLoop", label: "Consultar Docs", defaultSupport: true, defaultPre: true },
    { id: "btnSmartReply", label: "↳ Sugerir resposta", defaultSupport: true, defaultPre: true }
  ];

  const FIXED_MESSAGES = [
    "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações.",
    "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações."
  ];

  function isPreAtendimento() {
    return (getUserSector && getUserSector() === "preatendimento");
  }

  const PRE_FIXED_MESSAGES = [
    {
      shortcut: "1",
      text:
        "Olá, tudo bem?\n" +
        "Eu sou o atendente {{NOME}} do pré atendimento do suporte da Soften Sistema, como posso te ajudar?"
    },
    {
      shortcut: "2",
      text:
        "Você pode me informar seu NOME, seu EMAIL e seu ID AnyDesk, caso não possua, acesse o nosso site em seu computador https://anydesk.com/pt por gentileza, irei verificar com um técnico especializado para te auxiliar."
    },
    {
      shortcut: "3",
      text:
        "Caso não possua, poderia realizar o download do AnyDesk por gentileza: https://anydesk.com/pt"
    },
    {
      shortcut: "4",
      text:
        "Só um momento, irei verificar um técnico para te auxiliar e assim que estiver disponível encaminharei seu atendimento."
    },
    {
      shortcut: "5",
      text:
        "Olá! Ainda está conosco? Caso precise de mais alguma orientação, estou à disposição para dar continuidade ao atendimento."
    },
    {
      shortcut: "6",
      text:
        "Finalizando atendimento pela falta de resposta, tenha um ótimo dia! 🙂 Muito obrigado tenha um excelente dia e continuamos a sua disposição para quaisquer e eventuais dúvidas"
    },
    {
      shortcut: "7",
      text:
        "Disponha, precisando estamos a disposição\nTenha um ótimo dia! 🙂"
    },
    {
      shortcut: "8",
      text:
        "Olá! 😊\nAgradecemos por aguardar. Sabemos que o tempo de espera pode ser cansativo e agradecemos a sua paciência.\n\nSou do pré-atendimento e já estou verificando o melhor técnico disponível para dar continuidade ao seu atendimento.\nSe quiser adiantar alguma informação por aqui, isso pode nos ajudar a agilizar.\n\nSeguimos acompanhando até a resolução. 💙"
    }
  ];

  window.FIXED_MESSAGES = FIXED_MESSAGES;

  function initTabs() {
    if (!el.tabs.length || !el.sections.length) return;

    const showSection = (id) => {
      const allowed = getAllowedTabsBySector(getUserSector());
      if (!allowed.has(id)) {
        id = allowed.has("sec-home") ? "sec-home" : Array.from(allowed)[0];
      }

      el.sections.forEach((s) => {
        const active = s.id === id;
        s.classList.toggle("active", active);
        s.setAttribute("aria-hidden", active ? "false" : "true");
      });

      el.tabs.forEach((t) => {
        const active = t.dataset.section === id;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });

      try { sessionStorage.setItem(KEY_ACTIVE_TAB, id); } catch (_) { }

      try { window.scrollTo({ top: 0, behavior: "smooth" }); }
      catch (_) { window.scrollTo(0, 0); }
    };

    const container = el.tabsContainer || document;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-tab");
      if (!btn) return;

      e.preventDefault();
      const targetId = btn.dataset.section;
      if (!targetId) return;

      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      showSection(targetId);
    });

    let initial = "sec-home";
    try {
      const saved = sessionStorage.getItem("settings_active_tab");
      const allowed = getAllowedTabsBySector(getUserSector());
      if (saved && document.getElementById(saved) && allowed.has(saved)) initial = saved;
    } catch (e) { }

    const activeBtn = el.tabs.find((t) => t.classList.contains("active"));
    if (activeBtn?.dataset?.section && document.getElementById(activeBtn.dataset.section)) {
      initial = activeBtn.dataset.section;
    }

    showSection(initial);
  }

  function inicializarAcordeons() {
    const headers = document.querySelectorAll(".accordion-header");
    if (!headers.length) return;

    headers.forEach((header) => {
      header.addEventListener("click", () => {
        const targetId = header.getAttribute("data-target");
        if (!targetId) return;

        const content = document.getElementById(targetId);
        if (!content) return;

        const icon = header.querySelector(".accordion-icon");

        const isOpen = content.classList.contains("open");
        content.classList.toggle("open", !isOpen);
        header.classList.toggle("open", !isOpen);

        if (icon) icon.textContent = isOpen ? "+" : "−";
      });
    });
  }

  function abrirAcordeon(accordionId) {
    const accordion = document.getElementById(accordionId);
    if (!accordion) return;

    const header = accordion.querySelector(".accordion-header");
    if (!header) return;

    const targetId = header.getAttribute("data-target");
    const content = targetId ? document.getElementById(targetId) : null;
    const icon = header.querySelector(".accordion-icon");

    if (!content) return;

    if (!content.classList.contains("open")) {
      content.classList.add("open");
      header.classList.add("open");
      if (icon) icon.textContent = "−";
    }
  }

  function isValidSector(sector) {
    return sector === "suporte" || sector === "preatendimento";
  }

  // Only pré-atendimento needs a name: its fixed greeting says "Eu sou o atendente {{NOME}}".
  function isConfiguredProfile(name, sector) {
    return isValidSector(sector) && (sector !== "preatendimento" || !!name);
  }

  function getUserSector() {
    try {
      const v = String(localStorage.getItem(SECTOR_KEY) || "").trim().toLowerCase();
      return isValidSector(v) ? v : "";
    } catch (e) { return ""; }
  }

  function setUserSector(sector) {
    const s = String(sector || "").trim().toLowerCase();
    if (!isValidSector(s)) return;
    try { localStorage.setItem(SECTOR_KEY, s); } catch (e) { }
  }

  function sectorLabel(sector) {
    if (sector === "suporte") return "Suporte técnico";
    if (sector === "preatendimento") return "Pré-atendimento";
    return "";
  }

  function getAllowedTabsBySector(sector) {
    if (sector === "suporte") {
      return new Set(["sec-home", "sec-mensagens", "sec-ia", "sec-historico"]);
    }

    if (sector === "preatendimento") {
      return new Set(["sec-home", "sec-mensagens"]);
    }

    return new Set(["sec-home"]);
  }

  function applySectorVisibility() {
    const sector = getUserSector();
    const allowed = getAllowedTabsBySector(sector);

    const tabs = Array.from(document.querySelectorAll(".nav-tab"));
    const sections = Array.from(document.querySelectorAll(".page-section"));

    tabs.forEach((t) => {
      const id = t.dataset.section;
      const isAllowed = allowed.has(id);
      t.style.display = isAllowed ? "" : "none";
      t.setAttribute("aria-hidden", isAllowed ? "false" : "true");

      t.tabIndex = isAllowed ? 0 : -1;
      if (!isAllowed) t.classList.remove("active");
    });

    sections.forEach((s) => {
      const isAllowed = allowed.has(s.id);
      if (!isAllowed) {
        s.classList.remove("active");
        s.style.display = "none";
        s.setAttribute("aria-hidden", "true");
      } else {
        s.style.display = "";
      }
    });

    const active = document.querySelector(".page-section.active");
    if (!active || !allowed.has(active.id)) {
      const fallback = allowed.has("sec-home")
        ? "sec-home"
        : Array.from(allowed)[0];

      try { sessionStorage.setItem("settings_active_tab", fallback); } catch (e) { }

      sections.forEach(s => {
        const on = s.id === fallback;
        if (allowed.has(s.id)) {
          s.classList.toggle("active", on);
          s.setAttribute("aria-hidden", on ? "false" : "true");
        }
      });

      tabs.forEach(t => {
        const on = t.dataset.section === fallback;
        if (allowed.has(t.dataset.section)) {
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        }
      });
    }
  }

  function sanitizeName(v) {
    return String(v || "").replace(/\s+/g, " ").trim().slice(0, 30);
  }

  async function loadUserName() {
    return sanitizeName(localStorage.getItem(NAME_KEY) || "");
  }

  async function saveUserName(name) {
    localStorage.setItem(NAME_KEY, sanitizeName(name));
  }

  async function persistUserMetaToChromeStorage({ name, sector }) {
    const payload = {};
    if (typeof name === "string") payload[NAME_KEY] = sanitizeName(name);
    if (typeof sector === "string") payload[SECTOR_KEY] = String(sector).trim().toLowerCase();
    await storageSet(payload);
  }

  async function applySectorDefaultsIfChanged(newSector) {
    const defaults = getDefaultVisibility(newSector);
    await storageSet({ [VISIBILITY_KEY]: defaults });
    renderVisibilityUI();
  }

  function getUserName() {
    try { return sanitizeName(localStorage.getItem(NAME_KEY)); }
    catch (e) { return ""; }
  }

  function resolveTemplate(text) {
    const name = getUserName() || "";
    return String(text || "").replaceAll("{{NOME}}", name);
  }

  function setUserName(name) {
    try { localStorage.setItem(NAME_KEY, sanitizeName(name)); }
    catch (e) { }
    persistUserMetaToChromeStorage({ name });
  }

  function applyPreAtendimentoMessagesUI() {
    if (!isPreAtendimento()) {
      if (el.customMessagesContainer) el.customMessagesContainer.style.display = "block";
      const addRow = document.querySelector(".add-message-row");
      if (addRow) addRow.style.display = "flex";
      if (el.btnBackupMessages) el.btnBackupMessages.style.display = "flex";
      if (el.btnLimparTodosAtalhos) el.btnLimparTodosAtalhos.style.display = "flex";
      return;
    }

    const customTitle = document.querySelector('#sec-mensagens h3:nth-of-type(2)');
    if (customTitle) customTitle.style.display = "none";

    if (el.customMessagesContainer) el.customMessagesContainer.style.display = "none";

    const addRow = document.querySelector(".add-message-row");
    if (addRow) addRow.style.display = "none";

    if (el.btnBackupMessages) el.btnBackupMessages.style.display = "none";
    if (el.btnLimparTodosAtalhos) el.btnLimparTodosAtalhos.style.display = "none";

    if (el.customCount) el.customCount.textContent = "0";
  }

  function setNameUI(name) {
    const safeName = sanitizeName(name);
    const sector = getUserSector();
    if (el.sectorBadge) {
      el.sectorBadge.hidden = !sector;
      el.sectorBadge.textContent = sector ? sectorLabel(sector) : "";
      el.sectorBadge.setAttribute("aria-label", sector ? `Setor: ${sectorLabel(sector)}. Trocar setor` : "Escolher setor");
      el.sectorBadge.title = "Trocar setor";
    }

    if (el.editNameTrigger) {
      if (safeName) {
        el.editNameTrigger.hidden = false;
        el.editNameTrigger.textContent = safeName;
      } else {
        el.editNameTrigger.hidden = true;
        el.editNameTrigger.textContent = "";
      }
    }

    if (el.nameSetupBlock) {
      el.nameSetupBlock.style.display = !safeName && sector === "preatendimento" ? "block" : "none";
    }

    if (el.nameInput) el.nameInput.value = safeName;

    if (!safeName && el.homeGreetingComma) {
      el.homeGreetingComma.style.display = "none";
    } else if (el.homeGreetingComma) {
      el.homeGreetingComma.style.display = "";
    }
  }

  function flashNameStatus(text, color = "var(--ai-text-muted)", ms = 2000) {
    if (!el.nameStatus) return;
    el.nameStatus.textContent = text;
    el.nameStatus.style.color = color;
    if (ms > 0) setTimeout(() => (el.nameStatus.textContent = ""), ms);
  }

  function openNameDialog() {
    if (!el.nameDialog) return;
    const current = getUserName();
    if (el.nameDialogInput) el.nameDialogInput.value = current;
    el.nameDialog.showModal();
    setTimeout(() => el.nameDialogInput?.focus(), 50);
  }

  function closeNameDialog() {
    try { el.nameDialog?.close(); } catch (e) { }
  }

  async function initNameOnboarding() {
    const data = await storageGet([NAME_KEY, SECTOR_KEY]);
    const currentName = sanitizeName(data[NAME_KEY]);
    const currentSector = String(data[SECTOR_KEY] || "").trim().toLowerCase();

    if (currentName) localStorage.setItem(NAME_KEY, currentName);
    if (currentSector) localStorage.setItem(SECTOR_KEY, currentSector);

    setNameUI(currentName);

    if (!isConfiguredProfile(currentName, currentSector)) {
      showOnboardingDialog();
    }

    el.onboardingSaveBtn?.addEventListener("click", validateAndSaveOnboarding);
    el.onboardingCancelBtn?.addEventListener("click", () => { try { el.onboardingDialog?.close(); } catch (e) { } });
    el.sectorBadge?.addEventListener("click", () => showOnboardingDialog({ changing: true }));
    el.onboardingDialog?.addEventListener("cancel", (e) => {
      // First access cannot be dismissed; changing the sector can.
      if (el.onboardingDialog.dataset.mode !== "change") e.preventDefault();
    });
    el.onboardingDialog?.addEventListener("change", (e) => {
      if (e.target?.name === "onboardingSector") syncOnboardingNameField();
    });
    el.onboardingNameInput?.addEventListener("input", () => {
      if (el.onboardingNameEcho) el.onboardingNameEcho.textContent = sanitizeName(el.onboardingNameInput.value) || "Ana";
    });

    el.saveVisibilityBtn?.addEventListener("click", saveVisibilitySettings);

    el.onboardingNameInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        validateAndSaveOnboarding();
      }
    });

    if (!currentName && currentSector === "preatendimento") {
      flashNameStatus("Defina seu nome: ele aparece na saudação do pré-atendimento.", "var(--ai-warning)", 2500);
      el.nameInput?.focus();
    }

    el.saveNameBtn?.addEventListener("click", async () => {
      const name = sanitizeName(el.nameInput?.value);
      if (!name) {
        flashNameStatus("⚠️ Informe um nome para continuar.", "var(--ai-warning)", 2200);
        el.nameInput?.focus();
        return;
      }

      setUserName(name);
      setNameUI(name);

      persistUserMetaToChromeStorage({ name });
      await renderFixedMessagesBySector();

      flashNameStatus("✅ Nome salvo.", "green", 1500);
    });

    el.editNameTrigger?.addEventListener("click", () => openNameDialog());

    el.closeNameDialog?.addEventListener("click", () => closeNameDialog());
    el.cancelNameDialog?.addEventListener("click", () => closeNameDialog());

    el.saveNameDialog?.addEventListener("click", async () => {
      const name = sanitizeName(el.nameDialogInput?.value);
      if (!name) {
        try { localStorage.removeItem(NAME_KEY); } catch (e) { }
        setNameUI("");
        await renderFixedMessagesBySector();
        closeNameDialog();
        return;
      }

      setUserName(name);
      setNameUI(name);

      persistUserMetaToChromeStorage({ name });
      await renderFixedMessagesBySector();

      closeNameDialog();
    });
  }

  async function refreshUIAfterOnboarding() {
    applySectorVisibility();

    initTabs();

    applyPreAtendimentoMessagesUI();

    await renderFixedMessagesBySector();

    if (isPreAtendimento()) {
      if (el.customMessagesContainer) el.customMessagesContainer.innerHTML = "";
      if (el.customCount) el.customCount.textContent = "0";
    } else {
      const data = await storageGet(["customMessages"]);
      renderCustomMessages(data.customMessages || []);
    }
  }

  function syncOnboardingNameField() {
    const selected = document.querySelector('input[name="onboardingSector"]:checked');
    const needsName = selected?.value === "preatendimento";
    if (el.onboardingNameWrap) el.onboardingNameWrap.hidden = !needsName;
    if (el.onboardingStatus) el.onboardingStatus.textContent = "";
  }

  function showOnboardingDialog({ changing = false } = {}) {
    if (!el.onboardingDialog) return;
    el.onboardingDialog.dataset.mode = changing ? "change" : "first";
    if (el.onboardingTitle) el.onboardingTitle.textContent = changing ? "Trocar setor" : "Como você atende?";
    if (el.onboardingSaveBtn) el.onboardingSaveBtn.textContent = changing ? "Salvar setor" : "Começar";
    if (el.onboardingCancelBtn) el.onboardingCancelBtn.hidden = !changing;
    if (el.onboardingStatus) el.onboardingStatus.textContent = "";

    const currentName = getUserName();
    if (el.onboardingNameInput) el.onboardingNameInput.value = currentName || "";
    if (el.onboardingNameEcho) el.onboardingNameEcho.textContent = currentName || "Ana";

    const currentSector = getUserSector() || "suporte";
    document.querySelectorAll('input[name="onboardingSector"]').forEach((r) => {
      r.disabled = false;
      r.checked = r.value === currentSector;
    });
    syncOnboardingNameField();

    if (!el.onboardingDialog.open) el.onboardingDialog.showModal();
    setTimeout(() => document.querySelector('input[name="onboardingSector"]:checked')?.focus(), 50);
  }

  async function validateAndSaveOnboarding() {
    const selected = document.querySelector('input[name="onboardingSector"]:checked');
    const sector = selected ? String(selected.value) : "";
    const name = sanitizeName(el.onboardingNameInput?.value);

    if (!isValidSector(sector)) {
      if (el.onboardingStatus) el.onboardingStatus.textContent = "Escolha um setor para continuar.";
      return;
    }
    if (sector === "preatendimento" && !name) {
      if (el.onboardingStatus) el.onboardingStatus.textContent = "Informe seu nome: ele aparece na saudação do pré-atendimento.";
      el.onboardingNameInput?.focus();
      return;
    }

    const previousSector = getUserSector();
    const btn = el.onboardingSaveBtn;
    if (btn) btn.disabled = true;

    try {
      setUserSector(sector);
      if (sector === "preatendimento") {
        try { localStorage.setItem(NAME_KEY, name); } catch (e) { }
      }
      setNameUI(getUserName());

      await persistUserMetaToChromeStorage(sector === "preatendimento" ? { name, sector } : { sector });

      if (sector !== previousSector) {
        await applySectorDefaultsIfChanged(sector);
      }

      await refreshUIAfterOnboarding();
      try { el.onboardingDialog?.close(); } catch (e) { }
    } catch (err) {
      console.error("Erro no onboarding:", err);
      if (el.onboardingStatus) el.onboardingStatus.textContent = "Não foi possível salvar. Tente novamente.";
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderHistory(history) {
    if (!el.historyList) return;
    el.historyList.innerHTML = "";

    if (!history || history.length === 0) {
      el.historyList.innerHTML = "<div class='empty-history'>Nenhum resumo salvo ainda.</div>";
      return;
    }

    const sorted = [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sorted.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const dateStr = new Date(item.timestamp || Date.now()).toLocaleString("pt-BR");
      const safeSummary = String(item.summary || "");

      li.innerHTML = `
        <div class="history-info" style="flex: 1; min-width: 0;">
          <div class="history-date" style="font-size: 11px; color: var(--ai-text-muted);">${dateStr}</div>
          <div class="history-preview" title="${safeSummary.replace(/"/g, "&quot;")}" style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeSummary}</div>
        </div>
        <div class="history-actions" style="margin-left: 10px;">
          <button class="btn-copy">Copiar</button>
          <button class="btn-view">Ver</button>
        </div>
      `;

      li.querySelector(".btn-copy")?.addEventListener("click", () => {
        navigator.clipboard.writeText(safeSummary);
        const btn = li.querySelector(".btn-copy");
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(() => (btn.textContent = original), 1500);
      });

      li.querySelector(".btn-view")?.addEventListener("click", () => {
        alert("Resumo Completo:\n\n" + safeSummary);
      });

      el.historyList.appendChild(li);
    });
  }

  function renderVersionHistory(history) {
    if (!el.changelogList) return;
    el.changelogList.innerHTML = "";

    if (!history || history.length === 0) {
      el.changelogList.hidden = true;
      return;
    }

    const sorted = [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    el.changelogList.hidden = false;

    sorted.forEach(item => {
      const div = document.createElement("div");
      div.className = "changelog-item";
      const dateStr = new Date(item.timestamp).toLocaleString("pt-BR");
      div.innerHTML = `
        <span class="changelog-dot" aria-hidden="true"></span>
        <div>
          <div class="changelog-meta">
            <strong>v${item.version}</strong>
            <span>${dateStr}</span>
          </div>
        </div>
      `;
      el.changelogList.appendChild(div);
    });
  }

  function renderManualCallHistory(history) {
    if (!el.manualCallHistoryList) return;
    el.manualCallHistoryList.innerHTML = "";

    if (!history || history.length === 0) {
      el.manualCallHistoryList.innerHTML = "<div class='empty-history'>Nenhum chamado salvo ainda.</div>";
      return;
    }

    const sorted = [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sorted.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const dateStr = new Date(item.timestamp || Date.now()).toLocaleString("pt-BR");
      const fullText = String(item.text || "");
      const preview = fullText.replace(/\n/g, " ").substring(0, 100) + (fullText.length > 100 ? "..." : "");

      li.innerHTML = `
        <div class="history-info" style="flex: 1; min-width: 0;">
          <div class="history-date" style="font-size: 11px; color: var(--ai-text-muted);">${dateStr}</div>
          <div class="history-preview" title="${fullText.replace(/"/g, "&quot;")}" style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${preview}</div>
        </div>
        <div class="history-actions" style="margin-left: 10px;">
          <button class="btn-copy">Copiar</button>
          <button class="btn-view">Ver</button>
        </div>
      `;

      li.querySelector(".btn-copy")?.addEventListener("click", () => {
        navigator.clipboard.writeText(fullText);
        const btn = li.querySelector(".btn-copy");
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(() => (btn.textContent = original), 1500);
      });

      li.querySelector(".btn-view")?.addEventListener("click", () => {
        alert("Detalhes do Chamado:\n\n" + fullText);
      });

      el.manualCallHistoryList.appendChild(li);
    });
  }

  function normalizeShortcut(value) {
    let v = String(value || "");
    v = v.replace(INVALID_SHORTCUT_CHARS, "");
    v = v.replace(/\s+/g, " ");
    v = v.slice(0, MAX_SHORTCUT_LEN);
    return v;
  }

  function normalizeForCompare(value) {
    return normalizeShortcut(value).trim().toLowerCase();
  }

  function updateCustomCount(n) {
    if (el.customCount) el.customCount.textContent = String(n || 0);
  }

  async function getShortcuts() {
    const data = await storageGet(["messageShortcuts"]);
    return data.messageShortcuts || {};
  }

  async function setShortcuts(obj) {
    await storageSet({ messageShortcuts: obj || {} });
  }

  function createMessageCard(text, editable, index, list, opts = {}) {
    const { lockShortcut = false, presetShortcut = "" } = opts;

    const div = document.createElement("div");
    div.className = `message-card ${editable ? "custom" : "fixed"}`;

    const msg = document.createElement("div");
    msg.className = "message-text";
    msg.textContent = text;

    const bottomRow = document.createElement("div");
    bottomRow.className = "message-bottom-row";
    bottomRow.style.cssText = `
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      margin-top:10px;
      padding-top:10px;
      border-top:1px solid var(--ai-border);
      flex-wrap:wrap;
    `;

    const buttons = document.createElement("div");
    buttons.style.cssText = `display:flex; align-items:center; gap:8px; flex-wrap:wrap;`;

    const btnCopy = document.createElement("button");
    btnCopy.className = "btn-copy";
    btnCopy.textContent = "Copiar";
    btnCopy.style.cssText = `
      background:var(--ai-primary-soft); color:var(--ai-primary);
      border:none; border-radius:4px;
      padding:6px 12px; font-size:12px;
      cursor:pointer; min-width:70px;
    `;
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(text);
      const original = btnCopy.textContent;
      btnCopy.textContent = "Copiado!";
      btnCopy.style.background = "var(--ai-success-soft)";
      btnCopy.style.color = "var(--ai-success)";
      setTimeout(() => {
        btnCopy.textContent = original;
        btnCopy.style.background = "var(--ai-primary-soft)";
        btnCopy.style.color = "var(--ai-primary)";
      }, 1500);
    });
    buttons.appendChild(btnCopy);

    if (editable) {
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn-edit";
      btnEdit.textContent = "Editar";
      btnEdit.style.cssText = `
        background:var(--ai-primary-soft); color:var(--ai-primary);
        border:none; border-radius:4px;
        padding:6px 12px; font-size:12px;
        cursor:pointer; min-width:70px;
      `;
      btnEdit.addEventListener("click", async () => {
        const novo = prompt("Editar mensagem:", text);
        if (novo === null) return;

        const arr = Array.isArray(list) ? list : [];
        arr[index] = String(novo);

        await storageSet({ customMessages: arr });
        renderCustomMessages(arr);
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-delete";
      btnDelete.textContent = "Excluir";
      btnDelete.style.cssText = `
        background:var(--ai-danger-soft); color:var(--ai-danger);
        border:none; border-radius:4px;
        padding:6px 12px; font-size:12px;
        cursor:pointer; min-width:70px;
      `;
      btnDelete.addEventListener("click", async () => {
        if (!confirm("Tem certeza que deseja excluir esta mensagem?")) return;

        const arr = Array.isArray(list) ? list : [];
        arr.splice(index, 1);
        await storageSet({ customMessages: arr });

        const shortcuts = await getShortcuts();
        const clean = {};

        Object.keys(shortcuts).forEach((k) => {
          if (k.startsWith("fixed_")) {
            clean[k] = shortcuts[k];
            return;
          }
          if (k.startsWith("custom_")) {
            const idx = parseInt(k.split("_")[1], 10);
            if (Number.isNaN(idx)) return;
            if (idx < index) clean[k] = shortcuts[k];
            else if (idx > index) clean[`custom_${idx - 1}`] = shortcuts[k];
          }
        });

        await setShortcuts(clean);
        renderCustomMessages(arr);
      });

      buttons.append(btnEdit, btnDelete);
    }

    const shortcutConfig = document.createElement("div");
    shortcutConfig.className = "shortcut-config";
    shortcutConfig.style.cssText = `display:flex; align-items:center; gap:6px; flex-wrap:wrap;`;

    const shortcutLabel = document.createElement("span");
    shortcutLabel.textContent = "Atalho: /";
    shortcutLabel.style.cssText = "color:var(--ai-text-muted); font-size:12px; font-weight:700;";

    const shortcutInput = document.createElement("input");
    shortcutInput.type = "text";
    shortcutInput.maxLength = String(MAX_SHORTCUT_LEN);
    shortcutInput.placeholder = "ex: Bom dia";
    shortcutInput.autocomplete = "off";
    shortcutInput.spellcheck = false;
    shortcutInput.style.cssText = `
      width:180px;
      padding:6px 8px;
      border:1px solid var(--ai-border-strong);
      border-radius:6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-weight:800;
      font-size:13px;
    `;

    shortcutInput.addEventListener("input", () => {
      shortcutInput.value = normalizeShortcut(shortcutInput.value);
    });

    shortcutInput.addEventListener("keydown", (e) => {
      const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End", "Tab", "Enter"];
      if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;

      if (e.key.length === 1 && !/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]$/.test(e.key)) {
        e.preventDefault();
      }
    });

    const shortcutKey = editable ? `custom_${index}` : `fixed_${index}`;

    if (lockShortcut) {
      shortcutInput.value = String(presetShortcut || "");
      shortcutInput.disabled = true;
      shortcutInput.title = "Atalho fixo (Pré-atendimento)";
      shortcutInput.style.opacity = "0.85";
      shortcutInput.style.cursor = "not-allowed";
    } else {
      (async () => {
        const shortcuts = await getShortcuts();
        shortcutInput.value = shortcuts[shortcutKey] ? String(shortcuts[shortcutKey]) : "";
      })();

      shortcutInput.addEventListener("change", async () => {
        const valueToSave = normalizeShortcut(shortcutInput.value).trim();
        const shortcuts = await getShortcuts();

        if (!valueToSave) {
          delete shortcuts[shortcutKey];
          await setShortcuts(shortcuts);
          return;
        }

        const compareValue = normalizeForCompare(valueToSave);
        const duplicate = Object.entries(shortcuts).some(([k, v]) => {
          if (k === shortcutKey) return false;
          return normalizeForCompare(v) === compareValue;
        });

        if (duplicate) {
          alert("Este atalho já está sendo usado por outra mensagem!");
          shortcutInput.value = shortcuts[shortcutKey] ? String(shortcuts[shortcutKey]) : "";
          return;
        }

        shortcuts[shortcutKey] = valueToSave;
        await setShortcuts(shortcuts);
      });
    }

    shortcutConfig.append(shortcutLabel, shortcutInput);
    bottomRow.append(buttons, shortcutConfig);

    div.append(msg, bottomRow);
    return div;
  }

  async function renderFixedMessagesBySector() {
    if (!el.fixedMessagesContainer) return;

    el.fixedMessagesContainer.innerHTML = "";

    if (isPreAtendimento()) {
      PRE_FIXED_MESSAGES.forEach((m, index) => {
        const resolvedText = resolveTemplate(m.text);

        el.fixedMessagesContainer.appendChild(
          createMessageCard(resolvedText, false, index, null, {
            lockShortcut: false,
            presetShortcut: m.shortcut
          })
        );
      });

      return;
    }

    FIXED_MESSAGES.forEach((msg, index) => {
      el.fixedMessagesContainer.appendChild(createMessageCard(msg, false, index));
    });
  }

  function getDefaultVisibility(sector) {
    const isPre = sector === "preatendimento";
    const settings = {};
    BUTTON_CONFIGS.forEach(btn => {
      settings[btn.id] = isPre ? btn.defaultPre : btn.defaultSupport;
    });
    return settings;
  }

  async function loadVisibilitySettings() {
    const data = await storageGet([VISIBILITY_KEY, SECTOR_KEY]);
    let settings = data[VISIBILITY_KEY];

    if (!settings) {
      const sector = data[SECTOR_KEY] || "";
      settings = getDefaultVisibility(sector);
    }
    if (settings.btnSmartReply === undefined) {
      settings = { ...settings, btnSmartReply: settings.btnAssistenteIA ?? true };
    }
    return settings;
  }

  async function renderVisibilityUI() {
    if (!el.visibilityOptions) return;
    const settings = await loadVisibilitySettings();

    el.visibilityOptions.innerHTML = BUTTON_CONFIGS.map(btn => `
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
        <input type="checkbox" value="${btn.id}" ${settings[btn.id] ? "checked" : ""}>
        ${btn.label}
      </label>
    `).join("");
  }

  async function saveVisibilitySettings() {
    const settings = { ...(await loadVisibilitySettings()) };
    const checkboxes = el.visibilityOptions.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach(cb => {
      settings[cb.value] = cb.checked;
    });

    await storageSet({ [VISIBILITY_KEY]: settings });

    if (el.visStatus) {
      el.visStatus.textContent = "✅ Configurações salvas!";
      el.visStatus.style.color = "green";
      setTimeout(() => el.visStatus.textContent = "", 2000);
    }
  }

  renderFixedMessagesBySector();

  function renderCustomMessages(messages) {
    if (!el.customMessagesContainer) return;
    el.customMessagesContainer.innerHTML = "";

    (messages || []).forEach((msg, index) => {
      el.customMessagesContainer.appendChild(createMessageCard(msg, true, index, messages));
    });

    updateCustomCount((messages || []).length);
  }

  function updateVersionDisplay() {
    try {
      const manifest = chrome.runtime.getManifest();
      const version = manifest.version;
      if (el.versionElements) {
        el.versionElements.forEach(element => {
          element.textContent = `v${version}`;
        });
      }
    } catch (e) {
      console.error("Erro ao obter versão do manifesto:", e);
    }
  }

  const THEME_KEY = "atendeai_theme";
  const DOC_AUTOFILL_KEY = "atendeai_documentation_autofill_enabled";
  const DOC_LEARNING_ENABLED_KEY = "atendeai_documentation_learning_enabled";
  const DOC_LEARNING_KEY = "atendeai_documentation_learning_v1";

  async function initAppearanceSettings() {
    await globalThis.ThemeModule?.init?.();
    // Colours transition only after the saved theme is painted, so a light preference never animates in from dark.
    requestAnimationFrame(() => document.documentElement.setAttribute("data-theme-ready", ""));
    const radios = [el.themeDark, el.themeLight, el.themeSystem].filter(Boolean);
    if (!radios.length) return;
    const data = await storageGet([THEME_KEY]);
    const value = ["dark", "light", "system"].includes(data[THEME_KEY]) ? data[THEME_KEY] : "dark";
    radios.forEach(radio => { radio.checked = radio.value === value; });
    radios.forEach(radio => {
      radio.addEventListener("change", async () => {
        if (!radio.checked || !["dark", "light", "system"].includes(radio.value)) return;
        await storageSet({ [THEME_KEY]: radio.value });
      });
    });
  }

  function renderDocumentationLearningCount(memory) {
    if (!el.documentationLearningCount) return;
    const total = Object.keys(memory?.docs || {}).length;
    el.documentationLearningCount.textContent = `Aprendizado local\n${total} documentações aprendidas`;
  }

  // Read live by modules/queue-context.js through chrome.storage.onChanged; absent means on.
  const QUEUE_CONTEXT_KEYS = { queueContextAnydesk: "atendeai_queue_context_anydesk", queueContextProblem: "atendeai_queue_context_problem" };

  async function initQueueContextSettings() {
    const data = await storageGet(Object.values(QUEUE_CONTEXT_KEYS));
    for (const [id, key] of Object.entries(QUEUE_CONTEXT_KEYS)) {
      const box = el[id];
      if (!box) continue;
      box.checked = data[key] !== false;
      box.addEventListener("change", () => storageSet({ [key]: box.checked }));
    }
  }

  async function initDocumentationSettings() {
    if (!el.documentationAutofillEnabled || !el.documentationLearningEnabled) return;

    const data = await storageGet([DOC_AUTOFILL_KEY, DOC_LEARNING_ENABLED_KEY, DOC_LEARNING_KEY]);
    el.documentationAutofillEnabled.checked = data[DOC_AUTOFILL_KEY] !== false;
    el.documentationLearningEnabled.checked = data[DOC_LEARNING_ENABLED_KEY] !== false;
    renderDocumentationLearningCount(data[DOC_LEARNING_KEY]);

    el.documentationAutofillEnabled.addEventListener("change", async () => {
      await storageSet({ [DOC_AUTOFILL_KEY]: el.documentationAutofillEnabled.checked });
    });

    el.documentationLearningEnabled.addEventListener("change", async () => {
      await storageSet({ [DOC_LEARNING_ENABLED_KEY]: el.documentationLearningEnabled.checked });
    });

    el.clearDocumentationLearning?.addEventListener("click", async () => {
      if (!confirm("Remover o aprendizado local de documentações?")) return;
      await storageRemove(DOC_LEARNING_KEY);
      renderDocumentationLearningCount({ docs: {} });
    });
  }

  async function initApp() {
    updateVersionDisplay();

    await initNameOnboarding();

    applySectorVisibility();
    initTabs();
    inicializarAcordeons();

    renderVisibilityUI();
    applyPreAtendimentoMessagesUI();
    await initAppearanceSettings();
    await initQueueContextSettings();
    await initDocumentationSettings();

    const name = await loadUserName();
    setNameUI(name);

    const base = await storageGet(["history", "chamado_manual_history", "customMessages", "versionHistory"]);
    // Style samples: count and clear only; the content script owns collection.
    if (el.clearStyleSamples) {
      const STYLE_SAMPLES_KEY = "atendeai_style_samples_v1";
      const paintStyleSamples = async () => {
        const data = await storageGet([STYLE_SAMPLES_KEY]);
        const items = data?.[STYLE_SAMPLES_KEY]?.items;
        el.styleSamplesCount.textContent = String(Array.isArray(items) ? items.length : 0);
      };
      await paintStyleSamples();
      el.clearStyleSamples.addEventListener("click", async () => {
        await new Promise(resolve => chrome.storage.local.remove(STYLE_SAMPLES_KEY, resolve));
        await paintStyleSamples();
        if (el.status) el.status.textContent = "Amostras de estilo apagadas.";
      });
    }

    renderHistory(base.history || []);
    renderManualCallHistory(base.chamado_manual_history || []);
    renderVersionHistory(base.versionHistory || []);

    await renderFixedMessagesBySector();

    if (!isPreAtendimento()) {
      renderCustomMessages(base.customMessages || []);
    } else {
      if (el.customMessagesContainer) el.customMessagesContainer.innerHTML = "";
      if (el.customCount) el.customCount.textContent = "0";
    }

    el.btnLimpar?.addEventListener("click", async () => {
      if (!confirm("Tem certeza que deseja apagar todo o histórico de resumos?")) return;
      await storageSet({ history: [] });
      renderHistory([]);
      if (el.status) {
        el.status.textContent = "🗑️ Histórico de resumos limpo.";
        setTimeout(() => {
          if (el.status) el.status.textContent = "";
        }, 2000);
      }
    });

    el.btnLimparManual?.addEventListener("click", async () => {
      if (!confirm("Tem certeza que deseja apagar todo o histórico de chamados manuais?")) return;
      await storageSet({ chamado_manual_history: [] });
      renderManualCallHistory([]);
      if (el.status) {
        el.status.textContent = "🗑️ Histórico de chamados limpo.";
        setTimeout(() => {
          if (el.status) el.status.textContent = "";
        }, 2000);
      }
    });

    el.btnAddMessage?.addEventListener("click", async () => {
      if (isPreAtendimento()) return;
      const text = String(el.newMessageInput?.value || "").trim();
      if (!text) return;

      const data = await storageGet(["customMessages"]);
      const list = data.customMessages || [];
      list.push(text);

      await storageSet({ customMessages: list });
      if (el.newMessageInput) el.newMessageInput.value = "";

      renderCustomMessages(list);
      abrirAcordeon("customAccordion");
    });

    el.btnBackupMessages?.addEventListener("click", async () => {
      const data = await storageGet(["customMessages"]);
      const msgs = data.customMessages || [];
      if (!msgs.length) {
        alert("Nenhuma mensagem personalizada para backup.");
        return;
      }

      const content = msgs.join("\n\n---\n\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "mensagens_personalizadas.txt";
      a.click();

      URL.revokeObjectURL(url);
    });

    el.btnLimparTodosAtalhos?.addEventListener("click", async () => {
      if (!confirm("Tem certeza que deseja remover todos os atalhos configurados?")) return;

      await storageRemove("messageShortcuts");

      if (el.statusAtalhos) {
        el.statusAtalhos.textContent = "✅ Todos os atalhos foram removidos!";
        el.statusAtalhos.style.color = "green";
        setTimeout(() => {
          if (el.statusAtalhos) el.statusAtalhos.textContent = "";
        }, 3000);
      }

      renderFixedMessagesBySector();
      if (!isPreAtendimento()) {
        chrome.storage.local.get(["customMessages"], data => {
          renderCustomMessages(data.customMessages || []);
        });
      } else {
        if (el.customMessagesContainer) el.customMessagesContainer.innerHTML = "";
        if (el.customCount) el.customCount.textContent = "0";
      }
    });

    el.openCredits?.addEventListener("click", (e) => {
      e.preventDefault();
      el.creditsDialog?.showModal();
    });

    el.closeCredits?.addEventListener("click", () => {
      el.creditsDialog?.close();
    });

  }

  initApp();
});
