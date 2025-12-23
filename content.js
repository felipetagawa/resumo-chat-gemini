const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";

function inicializarModulos() {

  ShortcutsModule.init();

  NotificationsModule.init();
}

const getIconHTML = (icon, text) => {
  if (typeof icon === "string" && (icon.endsWith(".png") || icon.endsWith(".jpg") || icon.endsWith(".svg"))) {
    const iconUrl = chrome.runtime.getURL(icon);
    return `<span class="icon"><img src="${iconUrl}" alt="${text} icon" style="width: 16px; height: 16px; vertical-align: middle;"></span>`;
  }
  return `<span class="icon">${icon}</span>`;
};

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

  const botaoDocs = createButton("btnConsultarDocs", "Consultar Docs", "docs.png", () => {
    DocsModule.exibirPainelConsultaDocs();
  });

  const botaoResumo = createButton("btnResumoGemini", "Gerar Relatório", "relatorio.png", async () => {
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

      if (response && response.resumo) {
        SummaryModule.exibirResumo(response.resumo);
      } else if (response && response.erro) {
        alert("Erro ao gerar resumo: " + response.erro);
      }
    } catch (error) {
      alert("Erro de comunicação: " + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${getIconHTML("relatorio.png", "Gerar Relatório")} Gerar Relatório`;
    }
  });


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
  itemDocs.onclick = () => {
    DocsModule.exibirPainelConsultaDocs();
  };

  const itemDica = document.createElement("button");
  itemDica.className = "gemini-dropdown-item";
  itemDica.id = "btnDica";
  itemDica.innerHTML = `${getIconHTML("dicas-inteligentes.png", "Dicas Inteligentes")} Dicas Inteligentes`;

  itemDica.onclick = async () => {
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

      if (response && response.dica) {
        SummaryModule.exibirDica(response.dica);
      } else if (response && response.erro) {
        alert("Erro ao gerar dica: " + response.erro);
      }
    } catch (error) {
      alert("Erro de comunicação: " + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${getIconHTML("dicas-inteligentes.png", "Dicas Inteligentes")} Dicas Inteligentes`;
    }
  };

  dropdownContent.appendChild(itemDocs);
  dropdownContent.appendChild(itemDica);

  containerDropdown.appendChild(botaoMain);
  containerDropdown.appendChild(dropdownContent);

  // --- Fim Botão Unificado ---

  const botaoMessages = createButton("btnMessages", "Mensagens Padrão", "mensagem-padrao.png", () => {
    MessagesModule.mostrarPopupMensagens();
  });

  const botaoAgenda = createButton("btnAgenda", "Agenda & Gestão", "agenda.png", () => {
    AgendaModule.exibirAgenda();
  });

  const botaoChamadoManual = createButton("btnChamadoManual", "Chamado Manual", "chamado-manual.png", () => {
    CalledModule.exibirChamadoManual();
  });

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
    criarBotoesFlutuantes();
  } else if (urlAtualCorreta) {

    NotificationsModule.verificarNotificacoesChat();
  } else if (!urlAtualCorreta && botoesExistem) {

    DOMHelpers.removeElement("containerBotoesGemini");
    DOMHelpers.removeElement("geminiResumoPopup");
    DOMHelpers.removeElement("geminiDicaPopup");
    DOMHelpers.removeElement("geminiDocsPopup");
    DOMHelpers.removeElement("popupMensagensPadrao");
  }
}, 2000);

inicializarModulos();

console.log("✅ AtendeAI Manager: Extensão carregada e modularizada!");
