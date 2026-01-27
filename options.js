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
    customInstructionsInput: document.getElementById("customInstructions"),
    btnSalvar: document.getElementById("salvar"),
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
    onboardingStatus: document.getElementById("onboardingStatus"),
    onboardingStatus: document.getElementById("onboardingStatus"),
    versionElements: document.querySelectorAll(".app-version"),
    visibilityOptions: document.getElementById("visibilityOptions"),
    saveVisibilityBtn: document.getElementById("saveVisibilityBtn"),
    visStatus: document.getElementById("visStatus"),
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
    { id: "btnAssistenteIA", label: "Botão Assistente IA (Dropdown)", defaultSupport: true, defaultPre: true },
    { id: "btnConsultarDocsLoop", label: "↳ Consultar Docs (no Menu)", defaultSupport: true, defaultPre: true },
    { id: "btnDica", label: "↳ Dicas Inteligentes (no Menu)", defaultSupport: true, defaultPre: false }
  ];

  const FIXED_MESSAGES = [
    "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações.",
    "Atualmente, a fase inicial da Reforma Tributária com IBS e CBS se aplica apenas às empresas do regime normal (Lucro Presumido e Lucro Real), sendo que para o Simples Nacional não há recolhimento nem impacto prático neste primeiro ano, pois as informações são utilizadas apenas de forma nominativa e experimental.",
    "A reformulação das telas não altera a lógica de cálculo nem as regras fiscais do sistema, sendo uma evolução voltada à melhoria contínua, e qualquer diferença percebida está relacionada apenas à interface ou fluxo, com nossa equipe disponível para esclarecer dúvidas e ajustar eventuais pontos específicos.",
    "As telas reformuladas de Contas a Receber, Contas a Pagar, NFC-e e Cadastro de Produtos mantêm as mesmas regras fiscais e operacionais de antes, tendo sido alterados apenas aspectos visuais e funcionais para melhorar usabilidade e organização, sem impacto nos cálculos ou validações já existentes.",
    "A emissão de NFC-e para CNPJ deixou de ser permitida por determinação das normas fiscais vigentes, não sendo uma regra criada pelo sistema, que apenas aplica automaticamente essa exigência legal para evitar rejeições e problemas fiscais ao contribuinte.",
    "O procedimento de referenciar NFC-e em uma NF-e não é mais aceito pela legislação fiscal atual, motivo pelo qual o sistema bloqueia essa prática, garantindo conformidade legal e evitando a rejeição dos documentos junto à SEFAZ.",
    "A vedação à emissão de NFC-e para CNPJ e ao seu referenciamento em NF-e decorre exclusivamente de alterações nas regras fiscais, e o sistema apenas segue essas determinações para manter a regularidade das operações e evitar inconsistências legais."
  ];

  function isPreAtendimento() {
    return (getUserSector && getUserSector() === "preatendimento");
  }

  const PRE_FIXED_MESSAGES = [
    {
      shortcut: "1",
      text:
        "Bom dia, tudo bem?\n" +
        "Eu sou o atendente {{NOME}} do pré atendimento do suporte da Soften Sistema, como posso te ajudar?"
    },
    {
      shortcut: "2",
      text:
        "Boa tarde, tudo bem?\n" +
        "Eu sou o atendente {{NOME}} do pré atendimento do suporte da Soften Sistema, como posso te ajudar?"
    },
    {
      shortcut: "3",
      text:
        "Você pode me informar seu NOME, seu EMAIL e seu ID AnyDesk, caso não possua, acesse o nosso site em seu computador https://anydesk.com/pt por gentileza, irei verificar com um técnico especializado para te auxiliar."
    },
    {
      shortcut: "4",
      text:
        "Caso não possua, poderia realizar o download do AnyDesk por gentileza: https://anydesk.com/pt"
    },
    {
      shortcut: "5",
      text:
        "Só um momento, irei verificar um técnico para te auxiliar e assim que estiver disponível encaminharei seu atendimento."
    },
    {
      shortcut: "6",
      text:
        "Estou finalizando o atendimento pois não obtive resposta, qualquer dúvida entre em contato com a Soften!"
    },
    {
      shortcut: "7",
      text:
        "Disponha, precisando estamos a disposição\nTenha um ótimo dia! 🙂"
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

  function getUserSector() {
    try {
      const v = String(localStorage.getItem(SECTOR_KEY) || "").trim().toLowerCase();
      if (v === "suporte" || v === "preatendimento") return v;
      return "";
    } catch (e) {
      return "";
    }
  }

  function setUserSectorOnce(sector) {
    const s = String(sector || "").trim().toLowerCase();
    if (s !== "suporte" && s !== "preatendimento") return;

    try {
      const existing = getUserSector();
      if (existing) return;
      localStorage.setItem(SECTOR_KEY, s);
    } catch (e) { }
  }

  function sectorLabel(sector) {
    if (sector === "suporte") return "Suporte";
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
    if (!isPreAtendimento()) return;

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
      if (sector) {
        el.sectorBadge.style.display = "inline-flex";
        el.sectorBadge.textContent = `Setor: ${sectorLabel(sector)}`;
      } else {
        el.sectorBadge.style.display = "none";
        el.sectorBadge.textContent = "";
      }
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
      el.nameSetupBlock.style.display = safeName ? "none" : "block";
    }

    if (el.nameInput) el.nameInput.value = safeName;

    if (!safeName && el.homeGreetingComma) {
      el.homeGreetingComma.style.display = "none";
    } else if (el.homeGreetingComma) {
      el.homeGreetingComma.style.display = "";
    }
  }

  function flashNameStatus(text, color = "#64748b", ms = 2000) {
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

  function initNameOnboarding() {
    const current = getUserName();
    setNameUI(current);
    const currentName = getUserName();
    const currentSector = getUserSector();

    setNameUI(currentName);

    if (!currentName || !currentSector) {
      showOnboardingDialog();
    }

    el.onboardingSaveBtn?.addEventListener("click", validateAndSaveOnboarding);

    el.saveVisibilityBtn?.addEventListener("click", saveVisibilitySettings);

    el.onboardingNameInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        validateAndSaveOnboarding();
      }
    });

    if (!current) {
      flashNameStatus("⚠️ Defina seu nome para continuar.", "#b45309", 2500);
      el.nameInput?.focus();
    }

    el.saveNameBtn?.addEventListener("click", async () => {
      const name = sanitizeName(el.nameInput?.value);
      if (!name) {
        flashNameStatus("⚠️ Informe um nome para continuar.", "#b45309", 2200);
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

  function showOnboardingDialog() {
    if (!el.onboardingDialog) return;

    el.onboardingDialog.addEventListener("cancel", (e) => e.preventDefault());

    el.onboardingDialog.showModal();

    if (el.onboardingStatus) el.onboardingStatus.textContent = "";

    const currentName = getUserName();
    if (el.onboardingNameInput) el.onboardingNameInput.value = currentName || "";

    const currentSector = getUserSector();
    const radios = Array.from(document.querySelectorAll('input[name="onboardingSector"]'));
    if (currentSector) {
      radios.forEach(r => {
        r.checked = (r.value === currentSector);
        r.disabled = true;
      });
    } else {
      radios.forEach(r => { r.disabled = false; r.checked = false; });
    }

    setTimeout(() => el.onboardingNameInput?.focus(), 50);
  }

  async function validateAndSaveOnboarding() {
    const name = sanitizeName(el.onboardingNameInput?.value);
    const sectorExisting = getUserSector();

    let sector = sectorExisting;
    if (!sectorExisting) {
      const selected = document.querySelector('input[name="onboardingSector"]:checked');
      sector = selected ? String(selected.value) : "";
    }

    if (!name) {
      if (el.onboardingStatus) el.onboardingStatus.textContent = "⚠️ Informe seu nome/login.";
      el.onboardingNameInput?.focus();
      return;
    }

    if (!sector || (sector !== "suporte" && sector !== "preatendimento")) {
      if (el.onboardingStatus) el.onboardingStatus.textContent = "⚠️ Selecione seu setor.";
      return;
    }

    setUserName(name);
    setUserSectorOnce(sector);
    setNameUI(name);

    persistUserMetaToChromeStorage({ name, sector });

    // Se mudou o setor, reseta a visibilidade para o padrão desse setor
    if (sector !== sectorExisting) {
      await applySectorDefaultsIfChanged(sector);
    }

    await refreshUIAfterOnboarding();

    try { el.onboardingDialog.close(); } catch (e) { }
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
          <div class="history-date" style="font-size: 11px; color: #666;">${dateStr}</div>
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
          <div class="history-date" style="font-size: 11px; color: #666;">${dateStr}</div>
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
      border-top:1px solid #eee;
      flex-wrap:wrap;
    `;

    const buttons = document.createElement("div");
    buttons.style.cssText = `display:flex; align-items:center; gap:8px; flex-wrap:wrap;`;

    const btnCopy = document.createElement("button");
    btnCopy.className = "btn-copy";
    btnCopy.textContent = "Copiar";
    btnCopy.style.cssText = `
      background:#dbeafe; color:#1e40af;
      border:none; border-radius:4px;
      padding:6px 12px; font-size:12px;
      cursor:pointer; min-width:70px;
    `;
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(text);
      const original = btnCopy.textContent;
      btnCopy.textContent = "Copiado!";
      btnCopy.style.background = "#34A853";
      btnCopy.style.color = "#fff";
      setTimeout(() => {
        btnCopy.textContent = original;
        btnCopy.style.background = "#dbeafe";
        btnCopy.style.color = "#1e40af";
      }, 1500);
    });
    buttons.appendChild(btnCopy);

    if (editable) {
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn-edit";
      btnEdit.textContent = "Editar";
      btnEdit.style.cssText = `
        background:#e0f2fe; color:#0369a1;
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
        background:#fee2e2; color:#dc2626;
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
    shortcutLabel.style.cssText = "color:#666; font-size:12px; font-weight:700;";

    const shortcutInput = document.createElement("input");
    shortcutInput.type = "text";
    shortcutInput.maxLength = String(MAX_SHORTCUT_LEN);
    shortcutInput.placeholder = "ex: Bom dia";
    shortcutInput.autocomplete = "off";
    shortcutInput.spellcheck = false;
    shortcutInput.style.cssText = `
      width:180px;
      padding:6px 8px;
      border:1px solid #ccc;
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
      const shortcuts = await getShortcuts();

      PRE_FIXED_MESSAGES.forEach((m, i) => {
        shortcuts[`fixed_${i}`] = String(m.shortcut || "");
      });

      await setShortcuts(shortcuts);

      PRE_FIXED_MESSAGES.forEach((m, index) => {
        const resolvedText = resolveTemplate(m.text);

        el.fixedMessagesContainer.appendChild(
          createMessageCard(resolvedText, false, index, null, {
            lockShortcut: true,
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

    // Se não existir config salva, usa o padrão do setor
    if (!settings) {
      const sector = data[SECTOR_KEY] || "";
      settings = getDefaultVisibility(sector);
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
    const settings = {};
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

  // Override setShortcuts to NOT clear visibility when just saving names
  // But inside validateAndSaveOnboarding we should reset visibility to defaults if sector changed

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

  async function initApp() {
    applySectorVisibility();
    initTabs();
    inicializarAcordeons();
    initNameOnboarding();
    updateVersionDisplay();
    renderVisibilityUI();

    applyPreAtendimentoMessagesUI();

    const name = await loadUserName();
    setNameUI(name);

    const base = await storageGet(["customInstructions", "history", "chamado_manual_history", "customMessages"]);

    renderHistory(base.history || []);
    renderManualCallHistory(base.chamado_manual_history || []);

    await renderFixedMessagesBySector();

    if (!isPreAtendimento()) {
      renderCustomMessages(base.customMessages || []);
    } else {
      if (el.customMessagesContainer) el.customMessagesContainer.innerHTML = "";
      if (el.customCount) el.customCount.textContent = "0";
    }

    el.btnSalvar?.addEventListener("click", async () => {
      const instructions = String(el.customInstructionsInput?.value || "").trim();
      await storageSet({ customInstructions: instructions });

      if (el.status) {
        el.status.textContent = "✅ Configurações salvas!";
        el.status.style.color = "green";
        setTimeout(() => {
          if (el.status) el.status.textContent = "";
        }, 2000);
      }
    });

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