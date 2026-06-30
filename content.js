const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";
let modulosInicializados = false;
const MAX_PROMPT_COMPLEMENT_CHARS = 2000;

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

function isValidSector(sector) {
  return sector === "suporte" || sector === "preatendimento" || sector === "lider";
}

async function isUserConfigured() {
  const { name, sector } = await getUserConfig();
  return !!name && isValidSector(sector);
}

function inicializarModulos() {
  if (modulosInicializados) return;

  ShortcutsModule.init();
  NotificationsModule.init();

  PreControlModule.init();
  ObservationsModule.init();

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

  const LEADER_PASSWORD = "SoftengerenciamentoJB-BR";

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

    <div style="margin-bottom: 14px;">
      <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 12px;">Seu Setor</label>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <label style="cursor: pointer;">
          <input type="radio" name="onboarding-sector" value="suporte" checked style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid #e2e8f0; border-radius: 12px; padding: 12px;
            text-align: center; font-size: 14px; font-weight: 700;
            color: #64748b; transition: all 0.2s;
          ">Suporte</div>
        </label>

        <label style="cursor: pointer;">
          <input type="radio" name="onboarding-sector" value="preatendimento" style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid #e2e8f0; border-radius: 12px; padding: 12px;
            text-align: center; font-size: 14px; font-weight: 700;
            color: #64748b; transition: all 0.2s;
          ">Pré-atendimento</div>
        </label>

        <label style="cursor: pointer; grid-column: 1 / span 2;">
          <input type="radio" name="onboarding-sector" value="lider" style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid #e2e8f0; border-radius: 12px; padding: 12px;
            text-align: center; font-size: 14px; font-weight: 900;
            color: #64748b; transition: all 0.2s;
          ">Líder</div>
        </label>
      </div>
    </div>

    <div id="leader-pass-wrap" style="display:none; margin-bottom: 20px;">
      <label style="display:block; font-size: 13px; font-weight: 800; color:#334155; margin-bottom:8px;">Senha do Líder</label>
      <input type="password" id="leader-pass-input" placeholder="Digite a senha" style="
        width: 100%;
        padding: 12px;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        font-size: 15px;
        outline: none;
      "/>
      <div id="leader-pass-hint" style="margin-top:8px; font-size:12px; color:#b45309; font-weight:700;"></div>
    </div>

    <button id="onboarding-save-btn" style="
      width: 100%;
      background: #2563eb;
      color: white;
      border: none;
      padding: 14px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.2s;
    ">Salvar e Continuar</button>
  `;

  const styleRadios = () => {
    const cards = body.querySelectorAll(".sector-card");
    const inputs = body.querySelectorAll('input[name="onboarding-sector"]');
    inputs.forEach((input, index) => {
      const active = input.checked;
      cards[index].style.borderColor = active ? "#2563eb" : "#e2e8f0";
      cards[index].style.backgroundColor = active ? "#eff6ff" : "transparent";
      cards[index].style.color = active ? "#1e40af" : "#64748b";
    });

    const selected = body.querySelector('input[name="onboarding-sector"]:checked')?.value;
    const passWrap = body.querySelector("#leader-pass-wrap");
    if (passWrap) passWrap.style.display = (selected === "lider") ? "block" : "none";
  };

  body.addEventListener("change", (e) => {
    if (e.target.name === "onboarding-sector") styleRadios();
  });
  setTimeout(styleRadios, 0);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const saveBtn = body.querySelector("#onboarding-save-btn");
  const nameInput = body.querySelector("#onboarding-name-input");
  const passInput = body.querySelector("#leader-pass-input");
  const passHint = body.querySelector("#leader-pass-hint");

  saveBtn.addEventListener("click", async () => {
    const name = (nameInput.value || "").trim();
    const sector = body.querySelector('input[name="onboarding-sector"]:checked')?.value;

    if (!name) {
      alert("Por favor, digite seu nome.");
      return;
    }

    if (!sector) {
      alert("Selecione um setor.");
      return;
    }

    if (sector === "lider") {
      const pass = (passInput?.value || "").trim();
      if (!pass) {
        if (passHint) passHint.textContent = "⚠️ Senha obrigatória para selecionar Líder.";
        passInput?.focus();
        return;
      }
      if (pass !== LEADER_PASSWORD) {
        if (passHint) passHint.textContent = "❌ Senha incorreta.";
        passInput?.focus();
        return;
      }
      if (passHint) passHint.textContent = "";
    }

    await new Promise((resolve) =>
      chrome.storage.local.set({ [NAME_KEY]: name, [SECTOR_KEY]: sector }, resolve)
    );

    const isPre = sector === "preatendimento";
    const isLeader = sector === "lider";

    const newVisibility = {
      btnAgenda: true,
      btnMessages: true,
      btnAssistenteIA: true,
      btnConsultarDocsLoop: true,
      btnResumoGemini: !isPre,
      btnChamadoManual: !isPre,
      btnDica: !isPre
    };

    await new Promise((resolve) =>
      chrome.storage.local.set({ atendeai_visibility: newVisibility }, resolve)
    );

    overlay.remove();
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

  inicializarModulos();
  NotificationsModule.verificarNotificacoesChat();

  isUserConfigured().then(configured => {
    if (!configured) {
      createOnboardingModal();
      return;
    }

    const modal = document.getElementById("atendeai-onboarding-overlay");
    if (modal) modal.remove();

    // Fetch visibility and sector directly to ensure we have the correct data for buttons
    chrome.storage.local.get(["atendeai_visibility", SECTOR_KEY], (items) => {
      const visibility = items.atendeai_visibility || {};
      const rawSector = items[SECTOR_KEY];
      const sector = String(rawSector || "").trim().toLowerCase();

      console.log("DEBUG: checkAndInit direct load. Sector:", sector, "Visibility:", visibility);
      criarBotoesFlutuantes(visibility, sector);
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
  try {
    const data = await storageGet([NAME_KEY, SECTOR_KEY]);
    console.log("DEBUG: getUserConfig raw data:", data);
    const name = sanitizeName(data[NAME_KEY]);
    const sector = sanitizeSector(data[SECTOR_KEY]);
    console.log("DEBUG: getUserConfig processed:", { name, sector });
    return { name, sector };
  } catch (e) {
    console.error("DEBUG: getUserConfig error:", e);
    return { name: "", sector: "" };
  }
}

function guardFeature(actionFn, opts = {}) {
  const { allowLeader = false } = opts;

  return async (...args) => {
    const { sector } = await getUserConfig();
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

function criarBotoesFlutuantes(visibility, userSector) {
  if (DOMHelpers.exists("containerBotoesGemini")) {
    DOMHelpers.removeElement("containerBotoesGemini");
  }



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
      const clientName = ChatCaptureModule.capturarNomeCliente(); // Captura nome para histórico

      if (!texto) {
        alert("Não foi possível capturar o texto do chat.");
        btn.disabled = false;
        btn.innerHTML = `${getIconHTML("relatorio.png", "Gerar Relatório")} Gerar Relatório`;
        return;
      }

      try {
        const summaryObservation = ObservationsModule.getPromptComplementForCurrentChat();
        const validatedPromptComplement = summaryObservation;

        if (validatedPromptComplement.length > MAX_PROMPT_COMPLEMENT_CHARS) {
          alert(`O campo "Observações para o resumo" excede o limite de ${MAX_PROMPT_COMPLEMENT_CHARS} caracteres.`);
          return;
        }

        const payload = {
          action: "gerarResumo",
          texto
        };
        if (summaryObservation) payload.promptComplement = summaryObservation;

        const response = await MessagingHelper.send(payload);
        if (response && response.resumo) SummaryModule.exibirResumo(response.resumo, clientName); // Passa nome para salvar corretamente
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
      const summaryObservation = ObservationsModule.getPromptComplementForCurrentChat();
      const validatedPromptComplement = summaryObservation;

      if (validatedPromptComplement.length > MAX_PROMPT_COMPLEMENT_CHARS) {
        alert(`O campo "Observações para o resumo" excede o limite de ${MAX_PROMPT_COMPLEMENT_CHARS} caracteres.`);
        return;
      }

      const payload = {
        action: "gerarDica",
        texto
      };
      if (summaryObservation) payload.promptComplement = summaryObservation;

      const response = await MessagingHelper.send(payload);
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

  // Botão de Configurações padrão para todos os setores (substitui Chamado Manual)
  const botaoObservacoes = createButton(
    "btnObservacoes",
    "Observações",
    "📝",
    guardFeature(() => ObservationsModule.openDrawer())
  );
  botaoObservacoes.insertAdjacentHTML(
    "beforeend",
    '<span class="atendeai-observations-dot" hidden aria-hidden="true"></span><span class="atendeai-observations-ia" hidden>IA</span>'
  );

  const botaoConfiguracoes = createButton(
    "btnConfiguracoes",
    "Configurações",
    "config.png",
    () => {
      try {
        chrome.runtime.sendMessage({ action: "openOptions" });
      } catch (e) {
        const url = chrome.runtime.getURL("options.html");
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  );

  if (isVisible("btnResumoGemini")) container.appendChild(botaoResumo);
  if (isVisible("btnMessages")) container.appendChild(botaoMessages);
  if (isVisible("btnAgenda")) container.appendChild(botaoAgenda);
  container.appendChild(botaoObservacoes);
  container.appendChild(botaoConfiguracoes); // Sempre mostra Configurações

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


  if (!isTarget) {
    if (modulosInicializados) {
      console.log("DEBUG: Leaving target area, cleaning up.");
      modulosInicializados = false;
      DOMHelpers.removeElement("containerBotoesGemini");
      DOMHelpers.removeElement("atendeai-onboarding-overlay");
    }
    return;
  }

  inicializarModulos();
  NotificationsModule.verificarNotificacoesChat();

  isUserConfigured().then(configured => {
    if (!configured) {
      if (!document.getElementById("atendeai-onboarding-overlay")) {
        console.log("DEBUG: Not configured, showing onboarding modal.");
        createOnboardingModal();
      }
      return;
    }

    const modal = document.getElementById("atendeai-onboarding-overlay");
    if (modal) {
      console.log("DEBUG: Configured, removing modal.");
      modal.remove();
    }

    // Verificação de existência movida para dentro do callback para evitar recriação desnecessária
    if (!document.getElementById("containerBotoesGemini")) {
      storageGet(["atendeai_visibility", SECTOR_KEY]).then(items => {
        const visibility = items.atendeai_visibility || {};
        const rawSector = items[SECTOR_KEY];
        const sector = String(rawSector || "").trim().toLowerCase();

        criarBotoesFlutuantes(visibility, sector);
      });
    }
  });
}

setInterval(checkAndInit, 2000);

console.log("✅ AtendeAI Manager: Extensão carregada e modularizada!");
