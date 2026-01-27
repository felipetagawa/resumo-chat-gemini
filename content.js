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

function criarBotoesFlutuantes() {
  if (DOMHelpers.exists("containerBotoesGemini")) return;

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

  dropdownContent.appendChild(itemDocs);
  dropdownContent.appendChild(itemDica);

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

  const botaoChamadoManual = createButton(
    "btnChamadoManual",
    "Chamado Manual",
    "chamado-manual.png",
    guardFeature(() => CalledModule.exibirChamadoManual())
  );

  container.appendChild(botaoResumo);
  container.appendChild(botaoMessages);
  container.appendChild(botaoAgenda);
  container.appendChild(botaoChamadoManual);
  container.appendChild(containerDropdown);

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

setInterval(() => {
  const botoesExistem = DOMHelpers.exists("containerBotoesGemini");
  const urlAtualCorreta = window.location.href.startsWith(TARGET_URL);

  if (urlAtualCorreta && !botoesExistem) {
    inicializarModulos();
    criarBotoesFlutuantes();
  } else if (urlAtualCorreta) {
    inicializarModulos();
    NotificationsModule.verificarNotificacoesChat();
  } else if (!urlAtualCorreta && botoesExistem) {
    modulosInicializados = false;

    DOMHelpers.removeElement("containerBotoesGemini");
    DOMHelpers.removeElement("geminiResumoPopup");
    DOMHelpers.removeElement("geminiDicaPopup");
    DOMHelpers.removeElement("geminiDocsPopup");
    DOMHelpers.removeElement("popupMensagensPadrao");
  }
}, 2000);

console.log("✅ AtendeAI Manager: Extensão carregada e modularizada!");
