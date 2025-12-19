/**
 * ============================================
 * CONTENT.JS - Orquestrador Principal
 * ============================================
 * Arquivo principal que inicializa e coordena todos os módulos
 * Refatorado de 2279 linhas para ~200 linhas
 */

// URL alvo onde a extensão deve funcionar
const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";

/**
 * Inicializa todos os módulos
 */
function inicializarModulos() {
  // Inicializa sistema de atalhos
  ShortcutsModule.init();

  // Inicializa notificações
  NotificationsModule.init();
}

/**
 * Cria botões flutuantes
 */
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
    btn.innerHTML = `<span class="icon">${icon}</span> ${text}`;
    btn.addEventListener("click", onClick);
    return btn;
  };

  // Botão Docs
  const botaoDocs = createButton("btnConsultarDocs", "Consultar Docs", "📚", () => {
    DocsModule.exibirPainelConsultaDocs();
  });

  // Botão Resumo
  const botaoResumo = createButton("btnResumoGemini", "Gerar Relatório", "🧠", async () => {
    const btn = document.getElementById("btnResumoGemini");
    btn.disabled = true;
    btn.innerHTML = `<span class="icon">⏳</span> Gerando...`;

    const texto = ChatCaptureModule.capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      btn.disabled = false;
      btn.innerHTML = `<span class="icon">🧠</span> Gerar Relatório`;
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
      btn.innerHTML = `<span class="icon">🧠</span> Gerar Relatório`;
    }
  });

  // Botão Dica
  const botaoDica = createButton("btnDica", "Dicas Inteligentes", "💡", async () => {
    const btn = document.getElementById("btnDica");
    btn.disabled = true;
    btn.innerHTML = `<span class="icon">⏳</span> Pensando...`;

    const texto = ChatCaptureModule.capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      btn.disabled = false;
      btn.innerHTML = `<span class="icon">💡</span> Dicas Inteligentes`;
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
      btn.innerHTML = `<span class="icon">💡</span> Dicas Inteligentes`;
    }
  });

  // Botão Mensagens
  const botaoMessages = createButton("btnMessages", "Mensagens Padrão", "💬", () => {
    MessagesModule.mostrarPopupMensagens();
  });

  // Botão Agenda
  const botaoAgenda = createButton("btnAgenda", "Agenda & Gestão", "📅", () => {
    AgendaModule.exibirAgenda();
  });

  container.appendChild(botaoResumo);
  container.appendChild(botaoDica);
  container.appendChild(botaoMessages);
  container.appendChild(botaoAgenda);
  container.appendChild(botaoDocs);

  document.body.appendChild(container);
}

/**
 * Listener para mensagens do background
 */
MessagingHelper.addListener((request, sender, sendResponse) => {
  const botaoResumo = document.getElementById("btnResumoGemini");
  const botaoDica = document.getElementById("btnDica");
  const botaoMessages = document.getElementById("btnMessages");

  if (botaoResumo) {
    botaoResumo.disabled = false;
    botaoResumo.textContent = "🧠 Gerar Relatório";
  }

  if (botaoMessages) {
    botaoMessages.disabled = false;
    botaoMessages.textContent = "💬 Mensagens Padrão";
  }

  if (botaoDica) {
    botaoDica.disabled = false;
    botaoDica.textContent = "💡 Dicas Inteligentes";
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

/**
 * Monitora presença na URL correta e gerencia botões
 */
setInterval(() => {
  const botoesExistem = DOMHelpers.exists("containerBotoesGemini");
  const urlAtualCorreta = window.location.href.startsWith(TARGET_URL);

  if (urlAtualCorreta && !botoesExistem) {
    criarBotoesFlutuantes();
  } else if (urlAtualCorreta) {
    // Verifica notificações se estamos na URL correta
    NotificationsModule.verificarNotificacoesChat();
  } else if (!urlAtualCorreta && botoesExistem) {
    // Remove tudo se não estiver mais na URL correta
    DOMHelpers.removeElement("containerBotoesGemini");
    DOMHelpers.removeElement("geminiResumoPopup");
    DOMHelpers.removeElement("geminiDicaPopup");
    DOMHelpers.removeElement("geminiDocsPopup");
    DOMHelpers.removeElement("popupMensagensPadrao");
  }
}, 2000);

/**
 * Inicializa extensão quando o script carregar
 */
inicializarModulos();

console.log("✅ AtendeAI Manager: Extensão carregada e modularizada!");
