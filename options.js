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
    versionElements: document.querySelectorAll(".app-version"),
    visibilityOptions: document.getElementById("visibilityOptions"),
    saveVisibilityBtn: document.getElementById("saveVisibilityBtn"),
    visStatus: document.getElementById("visStatus"),
    leaderPasswordWrap: document.getElementById("leaderPasswordWrap"),
    leaderPasswordInput: document.getElementById("leaderPasswordInput"),
    leaderFilterName: document.getElementById("leaderFilterName"),
    leaderFilterDateFrom: document.getElementById("leaderFilterDateFrom"),
    leaderFilterDateTo: document.getElementById("leaderFilterDateTo"),
    leaderFilterNegociation: document.getElementById("leaderFilterNegociation"),
    leaderBtnAll: document.getElementById("leaderBtnAll"),
    leaderBtnQuery: document.getElementById("leaderBtnQuery"),
    leaderExportTxt: document.getElementById("leaderExportTxt"),
    leaderExportExcel: document.getElementById("leaderExportExcel"),
    leaderStatus: document.getElementById("leaderStatus"),
    leaderAvgBox: document.getElementById("leaderAvgBox"),
    leaderTableBody: document.getElementById("leaderTableBody"),
  };

  const MAX_SHORTCUT_LEN = 20;
  const INVALID_SHORTCUT_CHARS = /[^A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]/g;
  const KEY_ACTIVE_TAB = "settings_active_tab";
  const NAME_KEY = "atendeai_user_name";
  const SECTOR_KEY = "atendeai_user_sector";
  const VISIBILITY_KEY = "atendeai_visibility";
  const LEADER_PASSWORD = "SoftengerenciamentoJB-BR";
  const LEADER_AUTH_KEY = "atendeai_leader_auth";

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
        "Olá! Ainda está conosco? Caso precise de mais alguma orientação, estou à disposição para dar continuidade ao atendimento."
    },
    {
      shortcut: "7",
      text:
        "Finalizando atendimento pela falta de resposta, tenha um ótimo dia! 🙂 Muito obrigado tenha um excelente dia e continuamos a sua disposição para quaisquer e eventuais dúvidas"
    },
    {
      shortcut: "8",
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
      if (v === "suporte" || v === "preatendimento" || v === "lider") return v;
      return "";
    } catch (e) { return ""; }
  }

  function setUserSectorOnce(sector) {
    const s = String(sector || "").trim().toLowerCase();
    if (s !== "suporte" && s !== "preatendimento" && s !== "lider") return;

    try {
      const existing = getUserSector();
      if (existing) return;
      localStorage.setItem(SECTOR_KEY, s);
    } catch (e) { }
  }

  function sectorLabel(sector) {
    if (sector === "suporte") return "Suporte";
    if (sector === "preatendimento") return "Pré-atendimento";
    if (sector === "lider") return "Líder";
    return "";
  }

  function getAllowedTabsBySector(sector) {
    if (sector === "suporte") {
      return new Set(["sec-home", "sec-mensagens", "sec-ia", "sec-historico"]);
    }

    if (sector === "preatendimento") {
      return new Set(["sec-home", "sec-mensagens"]);
    }

    if (sector === "lider") {
      return new Set(["sec-home", "sec-mensagens", "sec-ia", "sec-historico", "sec-lider"]);
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

  async function initNameOnboarding() {
    const data = await storageGet([NAME_KEY, SECTOR_KEY]);
    const currentName = sanitizeName(data[NAME_KEY]);
    const currentSector = String(data[SECTOR_KEY] || "").trim().toLowerCase();

    if (currentName) localStorage.setItem(NAME_KEY, currentName);
    if (currentSector) localStorage.setItem(SECTOR_KEY, currentSector);

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

    if (!currentName) {
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

  function toggleLeaderPasswordUI() {
    const selected = document.querySelector('input[name="onboardingSector"]:checked');
    const isLeader = selected && selected.value === "lider";
    if (el.leaderPasswordWrap) el.leaderPasswordWrap.style.display = isLeader ? "block" : "none";
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

    toggleLeaderPasswordUI();

    document.querySelectorAll('input[name="onboardingSector"]').forEach(r => {
      r.addEventListener("change", toggleLeaderPasswordUI);
    });

    ensureLeaderPasswordUI();

    setTimeout(() => el.onboardingNameInput?.focus(), 50);
  }

  function ensureLeaderPasswordUI() {
    if (!el.onboardingDialog) return;

    let wrap = el.onboardingDialog.querySelector("#leaderPasswordWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "leaderPasswordWrap";
      wrap.style.cssText = "margin-top:12px; display:none;";

      wrap.innerHTML = `
        <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:6px;">
          Senha do Líder
        </label>
        <input id="leaderPasswordInput" type="password" placeholder="Digite a senha" style="
          width: 100%;
          padding: 10px 12px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          font-size: 14px;
          outline: none;
        "/>
        <div style="margin-top:6px; font-size:12px; color:#64748b; font-weight:600;">
          Necessário para habilitar o painel Líder.
        </div>
      `;

      const radiosBlock = el.onboardingDialog.querySelector(".sector-grid")
        || el.onboardingDialog.querySelector('input[name="onboardingSector"]')?.closest("div")
        || el.onboardingDialog;

      radiosBlock?.parentElement?.insertBefore(wrap, radiosBlock.nextSibling);
    }

    const update = () => {
      const selected = document.querySelector('input[name="onboardingSector"]:checked');
      const sector = selected ? String(selected.value || "").toLowerCase() : "";
      wrap.style.display = sector === "lider" ? "block" : "none";
    };

    const radios = Array.from(document.querySelectorAll('input[name="onboardingSector"]'));
    radios.forEach(r => r.addEventListener("change", update));
    update();
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
      el.onboardingStatus.textContent = "⚠️ Informe seu nome/login.";
      el.onboardingNameInput?.focus();
      return;
    }

    if (!sector || (sector !== "suporte" && sector !== "preatendimento" && sector !== "lider")) {
      el.onboardingStatus.textContent = "⚠️ Selecione seu setor.";
      return;
    }

    const btn = el.onboardingSaveBtn;
    if (btn) btn.disabled = true;

    try {
      setUserName(name);
      setUserSectorOnce(sector);
      setNameUI(name);

      await persistUserMetaToChromeStorage({ name, sector });

      if (sector !== sectorExisting) {
        await applySectorDefaultsIfChanged(sector);
      }

      await refreshUIAfterOnboarding();

    } catch (err) {
      console.error("Erro no onboarding:", err);
      if (el.onboardingStatus) {
        el.onboardingStatus.textContent = "❌ Erro ao finalizar. Veja o console (F12).";
      }
    } finally {
      try { el.onboardingDialog?.close(); } catch (e) { console.error("Falha ao fechar dialog:", e); }
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

  function normalizeToYMD(dateRaw) {
    const s = (dateRaw == null ? "" : String(dateRaw)).trim();
    if (!s) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;

    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

    return "";
  }

  function initLeaderControls() {
    if (!el.leaderBtnQuery || !el.leaderTableBody) return;

    const PAGE_SIZE = 15;
    let currentPage = 0;

    let masterRows = [];
    let filteredRows = [];
    let pageRows = [];

    const pagePrevBtn = document.getElementById("leaderPagePrev");
    const pageNextBtn = document.getElementById("leaderPageNext");
    const pageInfoEl = document.getElementById("leaderPageInfo");

    const setStatus = (text, color = "#64748b") => {
      if (!el.leaderStatus) return;
      el.leaderStatus.textContent = text || "";
      el.leaderStatus.style.color = color;
    };

    const disableUI = (disabled) => {
      [el.leaderBtnQuery, el.leaderExportTxt, el.leaderExportExcel, pagePrevBtn, pageNextBtn]
        .filter(Boolean)
        .forEach((b) => (b.disabled = !!disabled));
    };

    const safe = (v) => (v == null ? "" : String(v));

    const normalizeName = (v) => safe(v).trim();
    const normalizeDate = (v) => safe(v).trim();

    const normalizeBoolFilter = (v) => {
      const s = safe(v).trim().toLowerCase();
      if (!s || s === "all" || s === "todos") return null;
      if (s === "true" || s === "sim" || s === "1") return true;
      if (s === "false" || s === "nao" || s === "não" || s === "0") return false;
      return null;
    };

    function getLeaderFilters() {
      const name = normalizeName(el.leaderFilterName?.value);

      const dateFrom = normalizeDate(el.leaderFilterDateFrom?.value);
      const dateTo = normalizeDate(el.leaderFilterDateTo?.value);

      const neg = normalizeBoolFilter(el.leaderFilterNegociation?.value);

      return { name, dateFrom, dateTo, neg };
    }

    function parseDurationToMs(value) {
      if (value == null) return 0;

      if (typeof value === "number" && Number.isFinite(value)) {
        if (value > 100000) return Math.max(0, Math.floor(value));
        if (value > 0 && value < 100000) return Math.max(0, Math.floor(value * 1000));
        return 0;
      }

      const s = safe(value).trim();

      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
        const parts = s.split(":").map((x) => parseInt(x, 10));
        if (parts.some((n) => Number.isNaN(n))) return 0;

        let h = 0, m = 0, sec = 0;
        if (parts.length === 3) [h, m, sec] = parts;
        if (parts.length === 2) [m, sec] = parts;

        return ((h * 3600) + (m * 60) + sec) * 1000;
      }

      if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        if (!Number.isFinite(n)) return 0;
        if (n > 100000) return n;
        return n * 1000;
      }

      return 0;
    }

    function formatDuration(ms) {
      ms = Math.max(0, Math.floor(ms || 0));
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;

      const pad = (n) => String(n).padStart(2, "0");
      if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
      return `${pad(m)}:${pad(s)}`;
    }

    function normalizeApiList(payload) {
      if (Array.isArray(payload)) return payload;
      if (payload && typeof payload === "object") {
        const candidates = [
          payload.content, payload.items, payload.data, payload.result, payload.results,
          payload.registros, payload.records,
        ];
        for (const c of candidates) if (Array.isArray(c)) return c;
      }
      return [];
    }

    function pickField(obj, keys) {
      for (const k of keys) {
        if (obj && obj[k] != null) return obj[k];
      }
      return "";
    }

    function normalizeNegociationValue(v) {
      if (v === true) return true;
      if (v === false) return false;

      const s = safe(v).trim().toLowerCase();
      if (!s) return false;

      if (s === "true" || s === "sim" || s === "s" || s === "1" || s === "yes") return true;
      if (s === "false" || s === "nao" || s === "não" || s === "n" || s === "0" || s === "no") return false;

      if (s.includes("sim")) return true;
      return false;
    }

    function mapRow(item) {
      const dateRaw = pickField(item, ["date", "data", "createdAt", "created_at", "dia", "timestamp", "dataRegistro", "data_registro"]);
      const preRaw = pickField(item, ["preName", "pre", "nomePre", "nome_pre", "agentName", "name", "tecnico", "usuario", "userName", "user_name"]);
      const cliRaw = pickField(item, ["nameClient", "clientName", "cliente", "nomeCliente", "nome_cliente", "customerName", "customer", "client"]);

      const negRaw = pickField(item, [
        "negociation", "negotiation",
        "negociacao", "negociação",
        "isNegociation", "isNegotiation",
        "hasNegociation", "hasNegotiation",
        "negociou", "negociado", "negociacaoOk"
      ]);
      const neg = normalizeNegociationValue(negRaw);

      const ms =
        parseDurationToMs(
          pickField(item, [
            "durationMs", "tempoMs", "timeMs", "elapsedMs", "spentMs",
            "duration", "tempo", "time", "elapsed",
            "durationSeconds", "tempoSeconds", "timeSeconds"
          ])
        ) || 0;

      const dateStr = normalizeToYMD(dateRaw).trim();

      return {
        date: dateStr || "",
        pre: safe(preRaw).trim(),
        client: safe(cliRaw).trim(),
        ms,
        negociation: neg,
        raw: item
      };
    }

    function renderTable(rows) {
      pageRows = rows || [];
      if (!el.leaderTableBody) return;

      el.leaderTableBody.innerHTML = "";

      if (!pageRows.length) {
        el.leaderTableBody.innerHTML = `
          <tr>
            <td colspan="5" style="padding:12px; color:#64748b; font-weight:700;">
              Nenhum registro encontrado.
            </td>
          </tr>
        `;
        return;
      }

      const frag = document.createDocumentFragment();

      pageRows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${safe(r.date)}</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-weight:800;">${safe(r.pre)}</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${safe(r.client)}</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:800;">
            ${formatDuration(r.ms)}
          </td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-weight:900;">
            ${r.negociation ? "Sim" : "Não"}
          </td>
        `;
        frag.appendChild(tr);
      });

      el.leaderTableBody.appendChild(frag);
    }

    function renderAvgBox(rows) {
      if (!el.leaderAvgBox) return;

      const all = rows || [];
      const valid = all.filter((r) => (r.ms || 0) > 0);

      if (!all.length) {
        el.leaderAvgBox.innerHTML = `
          <div style="font-weight:900; color:#0f172a;">Sem dados</div>
          <div style="margin-top:6px; color:#64748b; font-weight:700;">
            Faça uma consulta para ver métricas.
          </div>
        `;
        return;
      }

      const totalMs = valid.reduce((acc, r) => acc + (r.ms || 0), 0);
      const avgMs = valid.length ? Math.round(totalMs / valid.length) : 0;

      el.leaderAvgBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:900; color:#0f172a;">Registros</div>
            <div style="margin-top:4px; color:#334155; font-weight:800;">${all.length}</div>
          </div>
          <div>
            <div style="font-weight:900; color:#0f172a;">Média (tempos válidos)</div>
            <div style="margin-top:4px; color:#334155; font-weight:900; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas;">
              ${formatDuration(avgMs)}
            </div>
          </div>
          <div>
            <div style="font-weight:900; color:#0f172a;">Total (tempos válidos)</div>
            <div style="margin-top:4px; color:#334155; font-weight:900; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas;">
              ${formatDuration(totalMs)}
            </div>
          </div>
        </div>
      `;
    }

    function downloadFile(filename, content, mime) {
      const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 600);
    }

    function exportTxt() {
      if (!pageRows.length) {
        setStatus("⚠️ Nada para exportar.", "#b45309");
        return;
      }

      const lines = [
        "Data\tPre\tCliente\tTempo\tNegociação",
        ...pageRows.map((r) => `${safe(r.date)}\t${safe(r.pre)}\t${safe(r.client)}\t${formatDuration(r.ms)}\t${r.negociation ? "Sim" : "Não"}`)
      ];

      downloadFile("pre_controles.txt", lines.join("\n"), "text/plain;charset=utf-8");
      setStatus("✅ TXT gerado.", "green");
    }

    function exportCsvForExcel() {
      if (!pageRows.length) {
        setStatus("⚠️ Nada para exportar.", "#b45309");
        return;
      }

      const esc = (v) => `"${safe(v).replace(/"/g, '""')}"`;

      const lines = [
        ["Data", "Pre", "Cliente", "Tempo", "Negociação"].map(esc).join(";"),
        ...pageRows.map((r) => [r.date, r.pre, r.client, formatDuration(r.ms), (r.negociation ? "Sim" : "Não")].map(esc).join(";"))
      ];

      const content = "\uFEFF" + lines.join("\n");
      downloadFile("pre_controles.csv", content, "text/csv;charset=utf-8");
      setStatus("✅ CSV (Excel) gerado.", "green");
    }

    function applyFilters(rows, filters) {
      const nameNeedle = safe(filters.name).trim().toLowerCase();

      const from = safe(filters.dateFrom).trim();
      const to = safe(filters.dateTo).trim();

      const neg = filters.neg;

      return (rows || []).filter((r) => {
        if (nameNeedle) {
          const hay = safe(r.pre).toLowerCase();
          if (!hay.includes(nameNeedle)) return false;
        }

        if (neg === true || neg === false) {
          if (r.negociation !== neg) return false;
        }

        if (from) {
          if (!r.date) return false;
          if (safe(r.date) < from) return false;
        }

        if (to) {
          if (!r.date) return false;
          if (safe(r.date) > to) return false;
        }

        return true;
      });
    }

    function getTotalPages() {
      const total = filteredRows.length;
      return Math.max(1, Math.ceil(total / PAGE_SIZE));
    }

    function clampPage() {
      const totalPages = getTotalPages();
      if (currentPage < 0) currentPage = 0;
      if (currentPage > totalPages - 1) currentPage = totalPages - 1;
    }

    function updatePaginationUI() {
      const totalPages = getTotalPages();
      clampPage();

      const total = filteredRows.length;

      if (pageInfoEl) {
        pageInfoEl.textContent = String(total === 0 ? 1 : (currentPage + 1));
      }

      if (pagePrevBtn) pagePrevBtn.disabled = currentPage <= 0 || total === 0;
      if (pageNextBtn) pageNextBtn.disabled = currentPage >= totalPages - 1 || total === 0;
    }

    function renderCurrentPage() {
      clampPage();

      const start = currentPage * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const slice = filteredRows.slice(start, end);

      renderTable(slice);

      renderAvgBox(filteredRows);

      updatePaginationUI();
    }

    function refreshFiltered(resetPage = false) {
      const f = getLeaderFilters();
      filteredRows = applyFilters(masterRows, f);
      if (resetPage) currentPage = 0;
      renderCurrentPage();
    }

    function setCurrentMonthDefaults() {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();

      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);

      const toYMD = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      };

      if (el.leaderFilterDateFrom) el.leaderFilterDateFrom.value = toYMD(first);
      if (el.leaderFilterDateTo) el.leaderFilterDateTo.value = toYMD(last);
    }

    async function query({ name, dateFrom, dateTo, negociation } = {}) {
      disableUI(true);
      setStatus("🔎 Consultando...", "#64748b");

      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              action: "preControl:query",
              name: name || "",
              dateFrom: dateFrom || "",
              dateTo: dateTo || "",
              negociation: (negociation === true ? true : negociation === false ? false : ""),
              date: "",
              page: 0,
              size: 5000
            },
            (r) => resolve(r || {})
          );
        });

        if (!resp.success) {
          masterRows = [];
          filteredRows = [];
          currentPage = 0;
          renderCurrentPage();
          setStatus(`❌ ${resp.erro || "Erro na consulta"}`, "#b91c1c");
          return;
        }

        const list = normalizeApiList(resp.data);
        const rows = list.map(mapRow);

        rows.sort((a, b) => {
          const da = safe(a.date), db = safe(b.date);
          if (da !== db) return db.localeCompare(da);
          const pa = safe(a.pre), pb = safe(b.pre);
          if (pa !== pb) return pa.localeCompare(pb);
          return safe(a.client).localeCompare(safe(b.client));
        });

        masterRows = rows;

        refreshFiltered(true);

        setStatus(`✅ ${filteredRows.length} registro(s) no filtro (de ${rows.length}).`, "green");

      } catch (err) {
        masterRows = [];
        filteredRows = [];
        currentPage = 0;
        renderCurrentPage();
        setStatus(`❌ Erro: ${err?.message || String(err)}`, "#b91c1c");
      } finally {
        disableUI(false);
        setTimeout(() => setStatus(""), 2500);
      }
    }

    el.leaderBtnQuery.addEventListener("click", () => {
      const f = getLeaderFilters();

      query({
        name: f.name,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        negociation: f.neg
      });
    });

    pagePrevBtn?.addEventListener("click", () => {
      if (!filteredRows.length) return;
      currentPage -= 1;
      renderCurrentPage();
    });

    pageNextBtn?.addEventListener("click", () => {
      if (!filteredRows.length) return;
      currentPage += 1;
      renderCurrentPage();
    });

    el.leaderExportTxt?.addEventListener("click", exportTxt);
    el.leaderExportExcel?.addEventListener("click", exportCsvForExcel);

    [
      el.leaderFilterName,
      el.leaderFilterDateFrom,
      el.leaderFilterDateTo,
      el.leaderFilterNegociation
    ].forEach((inp) => {
      inp?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          el.leaderBtnQuery?.click();
        }
      });
    });

    el.leaderFilterNegociation?.addEventListener("change", () => el.leaderBtnQuery?.click());
    el.leaderFilterDateFrom?.addEventListener("change", () => el.leaderBtnQuery?.click());
    el.leaderFilterDateTo?.addEventListener("change", () => el.leaderBtnQuery?.click());

    setCurrentMonthDefaults();

    masterRows = [];
    filteredRows = [];
    currentPage = 0;
    renderCurrentPage();

    el.leaderBtnQuery?.click();
  }

  function renderVersionHistory(history) {
    if (!el.changelogList) return;
    el.changelogList.innerHTML = "";

    if (!history || history.length === 0) {
      el.changelogList.innerHTML = "<div style='font-size:12px; color:#666; font-style:italic;'>Nenhum registro de atualização.</div>";
      return;
    }

    const sorted = [...history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sorted.forEach(item => {
      const div = document.createElement("div");
      div.style.cssText = "display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:6px;";

      const dateStr = new Date(item.timestamp).toLocaleString("pt-BR");

      div.innerHTML = `
        <div style="font-size:13px; font-weight:700; color:#333;">v${item.version}</div>
        <div style="font-size:11px; color:#888;">${dateStr}</div>
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
    updateVersionDisplay();

    await initNameOnboarding();

    applySectorVisibility();
    initTabs();
    inicializarAcordeons();

    renderVisibilityUI();
    applyPreAtendimentoMessagesUI();

    const name = await loadUserName();
    setNameUI(name);

    const base = await storageGet(["customInstructions", "history", "chamado_manual_history", "customMessages", "versionHistory"]);

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

    initLeaderControls();
  }

  initApp();
});