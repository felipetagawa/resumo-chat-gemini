const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";
let modulosInicializados = false;

const NAME_KEY = "atendeai_user_name";
const SECTOR_KEY = "atendeai_user_sector";

function getUserSectorSafe() {
  try {
    return String(localStorage.getItem(SECTOR_KEY) || "").trim().toLowerCase();
  } catch (e) {
    return "";
  }
}

function getUserNameSafe() {
  try {
    return String(localStorage.getItem(NAME_KEY) || "").trim();
  } catch (e) {
    return "";
  }
}

function isUserConfigured() {
  const sector = getUserSectorSafe();
  const name = getUserNameSafe();

  const sectorOk = sector === "suporte" || sector === "preatendimento";
  const nameOk = !!name;
  return sectorOk && nameOk;
}

function inicializarModulos() {
  if (modulosInicializados) return;

  ShortcutsModule.init();
  NotificationsModule.init();

  modulosInicializados = true;
}

const getIconHTML = (icon, text) => {
  if (typeof icon === "string" && (icon.endsWith(".png") || icon.endsWith(".jpg") || icon.endsWith(".svg"))) {
    const iconUrl = chrome.runtime.getURL(icon);
    return `<span class="icon"><img src="${iconUrl}" alt="${text} icon" style="width: 16px; height: 16px; vertical-align: middle;"></span>`;
  }
  return `<span class="icon">${icon}</span>`;
};

function createOnboardingModal() {
  if (document.getElementById("atendeai-onboarding-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "atendeai-onboarding-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(8px);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    width: 480px;
    max-width: 90vw;
    background: #ffffff;
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    padding: 24px;
    text-align: center;
    color: white;
  `;
  header.innerHTML = `
    <div style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Bem-vindo ao AtendeAI!</div>
    <div style="font-size: 14px; opacity: 0.9;">Configure seu perfil para começarmos.</div>
  `;

  const body = document.createElement("div");
  body.style.cssText = `padding: 32px 24px;`;

  body.innerHTML = `
    <div style="margin-bottom: 20px;">
      <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px;">Nome</label>
      <input type="text" id="onboarding-name-input" placeholder="Digite seu nome" style="
        width: 100%;
        padding: 12px;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        font-size: 15px;
        outline: none;
        transition: border-color 0.2s;
      " />
    </div>

    <div style="margin-bottom: 24px;">
      <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 12px;">Seu Setor</label>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <label style="cursor: pointer;">
          <input type="radio" name="onboarding-sector" value="suporte" checked style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
            text-align: center;
            font-size: 14px;
            font-weight: 600;
            color: #64748b;
            transition: all 0.2s;
          ">Suporte</div>
        </label>
        <label style="cursor: pointer;">
          <input type="radio" name="onboarding-sector" value="preatendimento" style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
            text-align: center;
            font-size: 14px;
            font-weight: 600;
            color: #64748b;
            transition: all 0.2s;
          ">Pré-atendimento</div>
        </label>
      </div>
    </div>

    <button id="onboarding-save-btn" style="
      width: 100%;
      background: #2563eb;
      color: white;
      border: none;
      padding: 14px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    ">Salvar e Continuar</button>
  `;

  // Style logic for radio buttons
  const styleRadios = () => {
    const cards = body.querySelectorAll('.sector-card');
    const inputs = body.querySelectorAll('input[name="onboarding-sector"]');
    inputs.forEach((input, index) => {
      if (input.checked) {
        cards[index].style.borderColor = '#2563eb';
        cards[index].style.backgroundColor = '#eff6ff';
        cards[index].style.color = '#1e40af';
      } else {
        cards[index].style.borderColor = '#e2e8f0';
        cards[index].style.backgroundColor = 'transparent';
        cards[index].style.color = '#64748b';
      }
    });
  };

  body.addEventListener('change', (e) => {
    if (e.target.name === 'onboarding-sector') styleRadios();
  });
  setTimeout(styleRadios, 0);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Logic
  const saveBtn = body.querySelector('#onboarding-save-btn');
  const nameInput = body.querySelector('#onboarding-name-input');

  saveBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const sector = body.querySelector('input[name="onboarding-sector"]:checked').value;

    if (!name) {
      alert("Por favor, digite seu nome.");
      return;
    }

    // Save
    console.log("DEBUG: Saving user config:", name, sector);
    await new Promise(resolve => chrome.storage.local.set({
      [NAME_KEY]: name,
      [SECTOR_KEY]: sector
    }, resolve));

    // Force visibility update based on new sector
    const isPre = sector === "preatendimento";
    const newVisibility = {
      btnAgenda: true,
      btnMessages: true,
      btnAssistenteIA: true,
      btnConsultarDocsLoop: true,
      btnResumoGemini: !isPre,
      btnChamadoManual: !isPre,
      btnDica: !isPre
    };

    console.log("DEBUG: Saving new visibility:", newVisibility);
    await new Promise(resolve => chrome.storage.local.set({ ["atendeai_visibility"]: newVisibility }, resolve));

    // Remove modal and init
    overlay.remove();
    // Trigger immediate check
    console.log("DEBUG: Triggering checkAndInit after save.");
    checkAndInit();
  });
}

function checkAndInit() {
  const urlAtualCorreta = window.location.href.startsWith(TARGET_URL);
  if (!urlAtualCorreta) {
    if (modulosInicializados) {
      modulosInicializados = false;
      DOMHelpers.removeElement("containerBotoesGemini");
      DOMHelpers.removeElement("atendeai-onboarding-overlay");
    }
    return;
  }

  // Se URL correta
  inicializarModulos();
  NotificationsModule.verificarNotificacoesChat();

  isUserConfigured().then(configured => {
    if (!configured) {
      createOnboardingModal();
      return;
    }

    // Se configurado, garantir que modal não existe e criar botões
    const modal = document.getElementById("atendeai-onboarding-overlay");
    if (modal) modal.remove();

    storageGet(["atendeai_visibility"]).then(data => {
      criarBotoesFlutuantes(data.atendeai_visibility);
    });
  });
}


const storageGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (data) => resolve(data || {})));

function sanitizeName(v) {
  return String(v || "").trim();
}
function sanitizeSector(v) {
  return String(v || "").trim().toLowerCase();
}

async function getUserConfig() {
  const data = await storageGet([NAME_KEY, SECTOR_KEY]);
  const name = sanitizeName(data[NAME_KEY]);
  const sector = sanitizeSector(data[SECTOR_KEY]);

  return { name, sector };
}

async function isUserConfigured() {
  const { name, sector } = await getUserConfig();
  const sectorOk = sector === "suporte" || sector === "preatendimento";
  const nameOk = !!name;
  return sectorOk && nameOk;
}

function guardFeature(actionFn) {
  return async (...args) => {
    const ok = await isUserConfigured();
    if (!ok) {
      openConfigRequiredModal();
      return;
    }
    return actionFn(...args);
  };
}

function ensureConfigRequiredModal() {
  if (document.getElementById("atendeai-config-modal-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "atendeai-config-modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(6px);
  `;

  const modal = document.createElement("div");
  modal.id = "atendeai-config-modal";
  modal.style.cssText = `
    width: 520px;
    max-width: 92vw;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 18px 50px rgba(0,0,0,0.28);
    overflow: hidden;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;

  modal.innerHTML = `
    <div style="
      padding: 16px 18px;
      background: linear-gradient(135deg, #1a73e8, #4285F4);
      color: #fff;
    ">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <div style="font-size:16px; font-weight:900;">Configuração necessária</div>
          <div style="margin-top:6px; font-size:12.8px; opacity:.95; font-weight:600;">
            Para usar os recursos, configure seu nome/login e setor no Portal AtendeAI.
          </div>
        </div>

        <button id="atendeai-config-modal-close" type="button" aria-label="Fechar" style="
          appearance:none;
          border:none;
          background: rgba(255,255,255,0.18);
          color:#fff;
          width:34px;
          height:34px;
          border-radius:10px;
          cursor:pointer;
          font-weight:900;
          display:inline-flex;
          align-items:center;
          justify-content:center;
        ">✕</button>
      </div>
    </div>

    <div style="padding: 16px 18px; color:#0f172a;">
      <div style="
        padding: 12px 12px;
        border-radius: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        font-size: 13px;
        font-weight: 700;
        color: #334155;
        line-height: 1.45;
      ">
        • Nome/Login: usado para personalizar mensagens</b>)<br/>
        • Setor: define quais funcionalidades aparecem e quais atalhos são fixos.
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="atendeai-config-modal-cancel" type="button" style="
          background:#e5e7eb;
          color:#111827;
          font-weight:900;
          border:none;
          border-radius:12px;
          padding:10px 12px;
          cursor:pointer;
        ">Agora não</button>

        <button id="atendeai-config-modal-open-portal" type="button" style="
          background:#1a73e8;
          color:#fff;
          font-weight:900;
          border:none;
          border-radius:12px;
          padding:10px 12px;
          cursor:pointer;
        ">Abrir Portal AtendeAI</button>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => { overlay.style.display = "none"; };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById("atendeai-config-modal-close")?.addEventListener("click", close);
  document.getElementById("atendeai-config-modal-cancel")?.addEventListener("click", close);

  document.getElementById("atendeai-config-modal-open-portal")?.addEventListener("click", async () => {
    try {
      chrome.runtime.sendMessage({ action: "openOptions" });
    } catch (e) {
      const url = chrome.runtime.getURL("options.html");
      window.open(url, "_blank", "noopener,noreferrer");
    }
    close();
  });
}

function openConfigRequiredModal() {
  ensureConfigRequiredModal();
  const overlay = document.getElementById("atendeai-config-modal-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
}

function criarBotoesFlutuantes(visibility) {
  if (DOMHelpers.exists("containerBotoesGemini")) {
    console.log("DEBUG: containerBotoesGemini already exists, skipping creation.");
    return;
  }

  console.log("DEBUG: criarBotoesFlutuantes called with:", visibility);

  const isVisible = (key, defaultVal = true) => {
    if (!visibility) return defaultVal;
    return visibility[key] === true;
  };

  const container = DOMHelpers.createElement("div", {
    id: "containerBotoesGemini",
    style: {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "999998",
      display: "flex",
      flexDirection: "column",
      gap: "0"
    }
  });

  const createButton = (id, text, icon, onClick) => {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "gemini-floating-btn";

    btn.innerHTML = `${getIconHTML(icon, text)} ${text}`;
    btn.addEventListener("click", onClick);
    return btn;
  };

  const botaoDocs = createButton(
    "btnConsultarDocs",
    "Consultar Docs",
    "docs.png",
    guardFeature(() => DocsModule.exibirPainelConsultaDocs())
  );

  const botaoResumo = createButton("btnResumoGemini", "Gerar Relatório", "relatorio.png",
    guardFeature(async () => {
      const btn = document.getElementById("btnResumoGemini");
      btn.disabled = true;
      btn.innerHTML = `<span class="icon">⏳</span> Gerando...`;

      const texto = ChatCaptureModule.capturarTextoChat();
      if (!texto) {
        alert("Não foi possível capturar o texto do chat.");
        btn.disabled = false;
        btn.innerHTML = `${getIconHTML("relatorio.png", "Gerar Relatório")} Gerar Relatório`;
        return;
      }

      try {
        const response = await MessagingHelper.send({ action: "gerarResumo", texto });
        if (response && response.resumo) SummaryModule.exibirResumo(response.resumo);
        else if (response && response.erro) alert("Erro ao gerar resumo: " + response.erro);
      } catch (error) {
        alert("Erro de comunicação: " + error.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${getIconHTML("relatorio.png", "Gerar Relatório")} Gerar Relatório`;
      }
    })
  );

  const containerDropdown = document.createElement("div");
  containerDropdown.className = "gemini-dropdown";

  const botaoMain = createButton("btnAssistenteIA", "Assistente IA", "icon48.png", (e) => {
    e.stopPropagation();
    containerDropdown.classList.toggle("active");
  });
  botaoMain.onclick = null;

  const dropdownContent = document.createElement("div");
  dropdownContent.className = "gemini-dropdown-content";

  document.addEventListener("click", () => {
    containerDropdown.classList.remove("active");
  });

  const itemDocs = document.createElement("button");
  itemDocs.className = "gemini-dropdown-item";
  itemDocs.id = "btnConsultarDocsLoop";
  itemDocs.innerHTML = `${getIconHTML("docs.png", "Consultar Docs")} Consultar Docs`;
  itemDocs.onclick = guardFeature(() => DocsModule.exibirPainelConsultaDocs());

  const itemDica = document.createElement("button");
  itemDica.className = "gemini-dropdown-item";
  itemDica.id = "btnDica";
  itemDica.innerHTML = `${getIconHTML("dicas-inteligentes.png", "Dicas Inteligentes")} Dicas Inteligentes`;

  itemDica.onclick = guardFeature(async () => {
    const btn = document.getElementById("btnDica");
    btn.disabled = true;
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = `<span class="icon">⏳</span> Pensando...`;

    const texto = ChatCaptureModule.capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
      return;
    }

    try {
      const response = await MessagingHelper.send({ action: "gerarDica", texto });
      if (response && response.dica) SummaryModule.exibirDica(response.dica);
      else if (response && response.erro) alert("Erro ao gerar dica: " + response.erro);
    } catch (error) {
      alert("Erro de comunicação: " + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${getIconHTML("dicas-inteligentes.png", "Dicas Inteligentes")} Dicas Inteligentes`;
    }
  });

  if (isVisible("btnConsultarDocsLoop")) dropdownContent.appendChild(itemDocs);
  if (isVisible("btnDica")) dropdownContent.appendChild(itemDica);

  containerDropdown.appendChild(botaoMain);
  containerDropdown.appendChild(dropdownContent);

  const botaoMessages = createButton(
    "btnMessages",
    "Mensagens Padrão",
    "mensagem-padrao.png",
    guardFeature(() => MessagesModule.toggleMensagens())
  );

  const botaoAgenda = createButton(
    "btnAgenda",
    "Agenda & Gestão",
    "agenda.png",
    guardFeature(() => AgendaModule.exibirAgenda())
  );

  if (isVisible("btnResumoGemini")) container.appendChild(botaoResumo);
  if (isVisible("btnMessages")) container.appendChild(botaoMessages);
  if (isVisible("btnAgenda")) container.appendChild(botaoAgenda);

  if (isVisible("btnAssistenteIA")) container.appendChild(containerDropdown);

  document.body.appendChild(container);
}

MessagingHelper.addListener((request, sender, sendResponse) => {
  const botaoResumo = document.getElementById("btnResumoGemini");
  const botaoDica = document.getElementById("btnDica");
  const botaoMessages = document.getElementById("btnMessages");

  if (botaoResumo) {
    botaoResumo.disabled = false;
    botaoResumo.innerHTML = `${getIconHTML("relatorio.png", "Gerar Relatório")} Gerar Relatório`;
  }

  if (botaoMessages) {
    botaoMessages.disabled = false;
    botaoMessages.innerHTML = `${getIconHTML("mensagem-padrao.png", "Mensagens Padrão")} Mensagens Padrão`;
  }

  if (botaoDica) {
    botaoDica.disabled = false;
    botaoDica.innerHTML = `${getIconHTML("dicas-inteligentes.png", "Dicas Inteligentes")} Dicas Inteligentes`;
  }

  if (request.action === "exibirResumo") {
    SummaryModule.exibirResumo(request.resumo);
  } else if (request.action === "exibirDica") {
    SummaryModule.exibirDica(request.dica);
  } else if (request.action === "exibirErro") {
    alert("Erro: " + request.erro);
  }

  return true;
});

console.log("✅ Main Loop: Checking...");
function checkAndInit() {
  const currentUrl = window.location.href;
  const isTarget = currentUrl.startsWith(TARGET_URL);

  // console.log("DEBUG: Checking URL...", currentUrl, "Matches?", isTarget);

  if (!isTarget) {
    if (modulosInicializados) {
      console.log("DEBUG: Leaving target area, cleaning up.");
      modulosInicializados = false;
      DOMHelpers.removeElement("containerBotoesGemini");
      DOMHelpers.removeElement("atendeai-onboarding-overlay");
    }
    return;
  }

  // Se URL correta
  inicializarModulos();
  NotificationsModule.verificarNotificacoesChat();

  isUserConfigured().then(configured => {
    // console.log("DEBUG: User Configured?", configured);
    if (!configured) {
      if (!document.getElementById("atendeai-onboarding-overlay")) {
        console.log("DEBUG: Not configured, showing onboarding modal.");
        createOnboardingModal();
      }
      return;
    }

    // Se configurado, garantir que modal não existe e criar botões
    const modal = document.getElementById("atendeai-onboarding-overlay");
    if (modal) {
      console.log("DEBUG: Configured, removing modal.");
      modal.remove();
    }

    storageGet(["atendeai_visibility"]).then(data => {
      console.log("DEBUG: Loaded visibility from storage:", data.atendeai_visibility);
      criarBotoesFlutuantes(data.atendeai_visibility);
    });
  });
}

setInterval(checkAndInit, 2000);

console.log("✅ AtendeAI Manager: Extensão carregada e modularizada!");
