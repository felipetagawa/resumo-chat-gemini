let messageShortcutsCache = {};
let isReplacing = false;

function carregarAtalhosMensagens() {
  chrome.storage.local.get(["customMessages", "messageShortcuts"], (data) => {
    messageShortcutsCache = {};

    const fixedMessages = [
      "Estamos cientes da instabilidade e nossa equipe já está trabalhando na correção.",
      "Esse comportamento ocorre devido a uma atualização recente no sistema.",
      "Pedimos que limpe o cache e reinicie o sistema antes de tentar novamente."
    ];

    const shortcuts = data.messageShortcuts || {};

    fixedMessages.forEach((msg, index) => {
      const shortcutKey = `fixed_${index}`;
      const shortcutValue = shortcuts[shortcutKey];
      if (shortcutValue) {
        const key = typeof shortcutValue === 'string' ? shortcutValue.toUpperCase() : shortcutValue.toString();
        messageShortcutsCache[key] = msg;
      }
    });

    const customMessages = data.customMessages || [];
    customMessages.forEach((msg, index) => {
      const shortcutKey = `custom_${index}`;
      const shortcutValue = shortcuts[shortcutKey];
      if (shortcutValue) {
        const key = typeof shortcutValue === 'string' ? shortcutValue.toUpperCase() : shortcutValue.toString();
        messageShortcutsCache[key] = msg;
      }
    });
  });
}

function detectarEInserirAtalho(element) {
  if (isReplacing) return false;

  let currentText = '';

  if (element.contentEditable === 'true') {
    currentText = element.textContent || element.innerText || '';
  } else {
    currentText = element.value || '';
  }

  const match = currentText.match(/\/([A-Za-z0-9])$/);

  if (match) {
    const shortcutKey = match[1].toUpperCase();
    const message = messageShortcutsCache[shortcutKey];

    if (message) {
      isReplacing = true;

      const newText = currentText.replace(/\/[A-Za-z0-9]$/, message);

      if (element.contentEditable === 'true') {
        element.textContent = newText;

        setTimeout(() => {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(element);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);

          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));

          isReplacing = false;
        }, 10);
      } else {
        element.value = newText;
        element.setSelectionRange(newText.length, newText.length);

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        isReplacing = false;
      }
      return true;
    }
  }

  return false;
}

document.addEventListener('input', function (event) {
  const isTextArea = event.target.matches('textarea, [contenteditable="true"], div[contenteditable="true"], [role="textbox"]');

  if (isTextArea) {
    detectarEInserirAtalho(event.target);
  }
});

document.addEventListener('keydown', function (event) {
  const isTextArea = event.target.matches('textarea, [contenteditable="true"], div[contenteditable="true"], [role="textbox"]');

  if (isTextArea) {
    const isLetterOrNumber = /^[a-zA-Z0-9]$/.test(event.key);

    if (isLetterOrNumber) {
      const element = event.target;
      let currentText = '';

      if (element.contentEditable === 'true') {
        currentText = element.textContent || element.innerText || '';
      } else {
        currentText = element.value || '';
      }

      if (currentText.endsWith('/')) {
        setTimeout(() => {
          detectarEInserirAtalho(element);
        }, 10);
      }
    }
  }
});

carregarAtalhosMensagens();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.messageShortcuts || changes.customMessages)) {
    carregarAtalhosMensagens();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    exibirResumo(request.resumo);
  } else if (request.action === "exibirDica") {
    exibirDica(request.dica);
  } else if (request.action === "exibirErro") {
    alert("Erro: " + request.erro);
  }

  return true;
});

const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";

setInterval(() => {
  const botoesExistem = document.getElementById("containerBotoesGemini");
  const urlAtualCorreta = window.location.href.startsWith(TARGET_URL);

  if (urlAtualCorreta && !botoesExistem) {
    criarBotoesFlutuantes();
  } else if (urlAtualCorreta) {
    // Check for notifications if we are on the correct URL
    if (typeof verificarNotificacoesChat === 'function') {
      verificarNotificacoesChat();
    }
  } else if (!urlAtualCorreta && botoesExistem) {
    botoesExistem.remove();
    const popup = document.getElementById("geminiResumoPopup");
    if (popup) popup.remove();
    const popupDica = document.getElementById("geminiDicaPopup");
    if (popupDica) popupDica.remove();
    const popupDocs = document.getElementById("geminiDocsPopup");
    if (popupDocs) popupDocs.remove();
    const popupMsgs = document.getElementById("popupMensagensPadrao");
    if (popupMsgs) popupMsgs.remove();
  }
}, 2000);

function criarBotoesFlutuantes() {
  if (document.getElementById("containerBotoesGemini")) return;

  // Injetar estilos CSS para os botões
  if (!document.getElementById("gemini-styles")) {
    const style = document.createElement("style");
    style.id = "gemini-styles";
    style.textContent = `
      @keyframes gradient-shift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes fadeOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }

      .gemini-floating-btn {
        position: relative;
        background: #ffffff;
        color: #3c4043;
        border: 2px solid transparent;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 14px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 190px;
        text-align: left;
        margin-bottom: 8px;
        background-clip: padding-box;
      }

      .gemini-floating-btn::before {
        content: '';
        position: absolute;
        top: -2px; left: -2px; right: -2px; bottom: -2px;
        background: linear-gradient(90deg, #0ea5e9, #3b82f6, #6366f1, #8b5cf6, #0ea5e9);
        background-size: 300% 300%;
        border-radius: 8px;
        z-index: -1;
        animation: gradient-shift 4s ease infinite;
        opacity: 0.8;
      }

      .gemini-floating-btn:hover {
        background: #f8f9fa;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
        transform: translateY(-2px);
      }

      .gemini-floating-btn:hover::before {
        animation: gradient-shift 2s ease infinite;
        opacity: 1;
      }

      .gemini-floating-btn .icon {
        font-size: 16px;
        min-width: 20px;
        text-align: center;
      }

      /* Agenda Modal Styles */
      #geminiAgendaModal {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 800px; height: 600px;
        background: white;
        z-index: 1000000;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        display: flex; flex-direction: column;
        font-family: 'Segoe UI', sans-serif;
        border: 1px solid #dadce0;
      }

      .agenda-header {
        background: #f8f9fa;
        padding: 15px 20px;
        border-bottom: 1px solid #e0e0e0;
        display: flex; justify-content: space-between; align-items: center;
        border-radius: 12px 12px 0 0;
      }

      .agenda-tabs {
        display: flex; gap: 10px; padding: 10px 20px;
        background: #fff; border-bottom: 1px solid #e0e0e0;
      }

      .agenda-tab {
        padding: 8px 16px; border-radius: 20px;
        cursor: pointer; background: #f1f3f4;
        color: #555; font-weight: 500; transition: all 0.2s;
        font-size: 13px;
      }

      .agenda-tab:hover { background: #e2e6ea; }
      .agenda-tab.active { background: #e8f0fe; color: #1a73e8; font-weight: 600; }

      .agenda-body {
        flex: 1; overflow-y: auto; padding: 20px; background: #fff;
        border-radius: 0 0 12px 12px;
      }

      /* Calendar Styles */
      .calendar-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
      .calendar-day-header { font-weight: bold; text-align: center; color: #777; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
      .calendar-day {
        border: 1px solid #eee; min-height: 80px; padding: 6px; border-radius: 6px;
        cursor: pointer; transition: background 0.2s; position: relative;
      }
      .calendar-day:hover { background: #f9f9f9; border-color: #ddd; }
      .calendar-day.today { border-color: #1a73e8; background: #f0f7ff; }
      .day-number { font-size: 12px; color: #555; font-weight: 600; margin-bottom: 4px; display: block; text-align: right; }
      .event-marker {
        display: block; background: #e8f0fe; color: #1a73e8;
        font-size: 10px; padding: 2px 4px; border-radius: 3px;
        margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      /* CRM Styles */
      .crm-controls { margin-bottom: 20px; display: flex; gap: 10px; }
      .crm-table { width: 100%; border-collapse: collapse; font-size: 14px; }
      .crm-table th { text-align: left; padding: 12px; border-bottom: 2px solid #eee; color: #444; font-weight: 600; }
      .crm-table td { padding: 12px; border-bottom: 1px solid #eee; color: #333; }
      .status-badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
      .status-pending { background: #fff3e0; color: #e65100; }
      .status-resolved { background: #e6fffa; color: #00695c; }
      .action-btn { border: none; background: none; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; font-size: 16px; margin-right: 8px; }
      .action-btn:hover { opacity: 1; }
    `;
    document.head.appendChild(style);
  }

  const container = document.createElement("div");
  container.id = "containerBotoesGemini";
  Object.assign(container.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999998",
    display: "flex",
    flexDirection: "column",
    gap: "0" // Gap handled by margin-bottom in CSS
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
    exibirPainelConsultaDocs();
  });

  // Botão Resumo
  const botaoResumo = createButton("btnResumoGemini", "Gerar Relatório", "🧠", async () => {
    const btn = document.getElementById("btnResumoGemini");
    btn.disabled = true;
    btn.innerHTML = `<span class="icon">⏳</span> Gerando...`;

    const texto = capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      btn.disabled = false;
      btn.innerHTML = `<span class="icon">🧠</span> Gerar Relatório`;
      return;
    }
    chrome.runtime.sendMessage({ action: "gerarResumo", texto }, (response) => {
      btn.disabled = false;
      btn.innerHTML = `<span class="icon">🧠</span> Gerar Relatório`;

      if (chrome.runtime.lastError) {
        alert("Erro de comunicação: " + chrome.runtime.lastError.message);
        return;
      }

      if (response && response.resumo) {
        exibirResumo(response.resumo);
      } else if (response && response.erro) {
        alert("Erro ao gerar resumo: " + response.erro);
      }
    });
  });

  // Botão Dica
  const botaoDica = createButton("btnDica", "Dicas Inteligentes", "💡", async () => {
    const btn = document.getElementById("btnDica");
    btn.disabled = true;
    btn.innerHTML = `<span class="icon">⏳</span> Pensando...`;

    const texto = capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      btn.disabled = false;
      btn.innerHTML = `<span class="icon">💡</span> Dicas Inteligentes`;
      return;
    }
    chrome.runtime.sendMessage({ action: "gerarDica", texto }, (response) => {
      btn.disabled = false;
      btn.innerHTML = `<span class="icon">💡</span> Dicas Inteligentes`;

      if (chrome.runtime.lastError) {
        alert("Erro de comunicação: " + chrome.runtime.lastError.message);
        return;
      }

      if (response && response.dica) {
        exibirDica(response.dica);
      } else if (response && response.erro) {
        alert("Erro ao gerar dica: " + response.erro);
      }
    });
  });

  // Botão Mensagens
  const botaoMessages = createButton("btnMessages", "Mensagens Padrão", "💬", () => {
    mostrarPopupMensagens();
  });

  // Botão Agenda
  const botaoAgenda = createButton("btnAgenda", "Agenda & Gestão", "📅", () => {
    if (typeof exibirAgenda === 'function') {
      exibirAgenda();
    }
  });

  container.appendChild(botaoResumo);
  container.appendChild(botaoDica);
  container.appendChild(botaoMessages);
  container.appendChild(botaoAgenda);
  container.appendChild(botaoDocs);

  document.body.appendChild(container);
}

function capturarTextoChat() {
  const mensagensDOM = document.querySelectorAll(".msg");

  if (!mensagensDOM.length) {
    alert("Nenhuma mensagem encontrada no chat aberto.");
    return "";
  }

  const mensagens = Array.from(mensagensDOM)
    .map(msg => {
      const nome = msg.querySelector(".name")?.innerText?.trim() || "";
      const texto = msg.querySelector(".message span")?.innerText?.trim() || "";
      if (!texto) return null;
      return `${nome ? nome + ": " : ""}${texto}`;
    })
    .filter(Boolean)
    .filter(linha => {
      const t = linha.toLowerCase();
      return t && !t.startsWith("automático");
    })
    .join("\n");

  return mensagens;
}

function extrairProblemaDoResumo(resumoCompleto) {
  const linhas = resumoCompleto.split('\n');
  let problema = '';
  let capturando = false;

  const inicioPalavrasChave = [
    'problema:', 'dúvida:', 'questão:', 'issue:', 'erro:',
    'situação:', 'contexto:', 'descrição:', 'relato:'
  ];

  const fimPalavrasChave = [
    'solução:', 'resolução:', 'resposta:', 'solution:',
    'correção:', 'procedimento:', 'passos:', 'como resolver:'
  ];

  for (let linha of linhas) {
    const linhaLower = linha.toLowerCase().trim();

    if (inicioPalavrasChave.some(kw => linhaLower.startsWith(kw))) {
      capturando = true;
      problema += linha + '\n';
      continue;
    }

    if (fimPalavrasChave.some(kw => linhaLower.startsWith(kw))) {
      break;
    }

    if (capturando && linha.trim()) {
      problema += linha + '\n';
    }
  }

  if (!problema.trim()) {
    const primeirosParagrafos = linhas.slice(0, Math.min(10, linhas.length));
    problema = primeirosParagrafos
      .filter(l => l.trim())
      .join('\n');
  }

  return problema.trim() || resumoCompleto;
}

function exibirResumo(texto, tipo = "resumo") {
  const popupAntigo = document.getElementById("geminiResumoPopup");
  if (popupAntigo) popupAntigo.remove();

  let humorIcon = "";
  if (tipo === "resumo") {
    const lowerText = texto.toLowerCase();
    if (lowerText.includes("humor do cliente:")) {
      const lines = texto.split("\n");
      const humorLine = lines.find(l => l.toLowerCase().includes("humor do cliente:")) || "";
      if (humorLine.match(/positivo|feliz|satisfeito|elogio/i)) humorIcon = "😊";
      else if (humorLine.match(/negativo|irritado|insatisfeito|reclama/i)) humorIcon = "😡";
      else if (humorLine.match(/neutro|normal|dúvida/i)) humorIcon = "😐";
    }
  }

  const titulo = tipo === "solucao" ? "Solução Sugerida" : `Resumo Gerado ${humorIcon}`;

  const conteudoFormatado = formatarResumoComNegrito(texto);

  const popup = document.createElement("div");
  popup.id = "geminiResumoPopup";
  popup.style = `
  position:fixed;
  bottom:130px;
  right:20px;
  z-index:999999;
  background:#fff;
  border:1px solid #dadce0;
  border-radius:8px;
  padding:16px;
  width:380px;
  max-height:500px;
  overflow-y:auto;
  box-shadow:0 4px 15px rgba(0,0,0,0.15);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size:14px;
  display:flex;
  flex-direction:column;
`;

  popup.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <b style="font-size:16px; color:#3c4043;">${titulo}</b>
      <button id="fecharResumoFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
    </div>
    
    <div id="conteudoResumo" style="
      padding: 12px;
      background: #f9f9f9;
      border: 1px solid #eee;
      border-radius: 4px;
      font-family: 'Segoe UI', sans-serif;
      flex: 1;
      overflow-y: auto;
      margin-bottom: 12px;
      line-height: 1.5;
      color: #333;
    "></div>

    <div style="display:flex; gap:8px;">
      <button id="copiarResumoFlutuante" style="
        flex: 1; padding: 8px; background: #fff;
        color: #3c4043; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; font-weight:500; font-family: 'Segoe UI', sans-serif;
      ">📋 Copiar</button>
      
      <button id="exportarResumo" style="
        flex: 1; padding: 8px; background: #fff;
        color: #3c4043; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; font-weight:500; font-family: 'Segoe UI', sans-serif;
      ">💾 Salvar .txt</button>
    </div>
  `;

  popup.querySelector("#conteudoResumo").innerHTML = conteudoFormatado;
  document.body.appendChild(popup);

  popup.querySelector("#fecharResumoFlutuante").addEventListener("click", () => popup.remove());

  popup.querySelector("#copiarResumoFlutuante").addEventListener("click", () => {
    const textoParaCopiar = formatarResumoParaCopiar(texto);
    navigator.clipboard.writeText(textoParaCopiar);

    const btn = popup.querySelector("#copiarResumoFlutuante");
    const original = btn.textContent;
    btn.textContent = "✅ Copiado!";
    btn.style.background = "#34A853";
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = "#4285F4";
    }, 2000);
  });

  popup.querySelector("#exportarResumo").addEventListener("click", () => {
    const textoFormatado = formatarResumoParaCopiar(texto);
    const blob = new Blob([textoFormatado], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumo-atendimento-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function formatarResumoComNegrito(texto) {
  let html = texto
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(\*\*[A-ZÁÉÍÓÚÃÕÇ\/\s]+\*\*)/g, '<br><br>$1<br>')
    .replace(/\n/g, '<br>')
    .replace(/^<br><br>/, '');

  return html;
}

function formatarResumoParaCopiar(texto) {
  let formatado = texto.replace(/\*\*/g, '');

  formatado = formatado.replace(/([A-ZÁÉÍÓÚÃÕÇ\/\s]+:)(\s*)/g, '\n\n$1 ');
  formatado = formatado.replace(/^\s+|\s+$/g, '');
  formatado = formatado.replace(/\n{3,}/g, '\n\n');
  formatado = formatado.replace(/^\n+/, '');

  return formatado.trim();
}

function exibirDica(dicaData) {
  const popupAntigo = document.getElementById("geminiDicaPopup");
  if (popupAntigo) popupAntigo.remove();

  let conteudo = "";

  const problemDetected = dicaData.problemDetected || dicaData.detectedProblem || "undefined";
  const moduleDetected = dicaData.moduleDetected || dicaData.detectedModule || "undefined";
  const similarCalls = dicaData.SimilarTagsFound || dicaData.similarCallsFound || 0;
  const solutions = dicaData.solutionsAnalyzed || 0;
  const tips = dicaData.tips || [];
  const status = dicaData.status || "";

  conteudo += `**PROBLEMA DETECTADO:**\n${problemDetected}\n\n`;
  conteudo += `**MÓDULO:** ${moduleDetected}\n\n`;

  conteudo += `**CHAMADOS RELACIONADOS:** ${similarCalls}\n\n`;
  conteudo += `**SOLUÇÕES ANALISADAS:** ${solutions}\n\n`;

  if (status) {
    conteudo += `**STATUS:** ${status}\n\n`;
  }

  if (tips && tips.length > 0) {
    tips.forEach((dica, index) => {
      conteudo += `${dica}\n\n`;
    });
  } else {
    if (status === "NO_HISTORY") {
      conteudo += `Não foram encontrados chamados históricos relacionados a este módulo.\n\n`;
      conteudo += `O problema foi analisado e categorizado automaticamente.\n`;
      conteudo += `Consulte a solução apresentada no resumo para verificar os passos recomendados.`;
    } else if (status === "NO_SIMILARITY") {
      conteudo += `Foram encontrados ${similarCalls} chamados no módulo, mas nenhum com problema similar.\n\n`;
      conteudo += `O problema parece ser específico ou com características únicas.\n`;
      conteudo += `Consulte a solução apresentada no resumo para verificar os passos recomendados.`;
    } else {
      conteudo += `Análise concluída. Não foram geradas dicas específicas para este problema.`;
    }
  }

  const popup = document.createElement("div");
  popup.id = "geminiDicaPopup";
  popup.style = `
    position:fixed;
    bottom:130px;
    right:20px;
    z-index:999999;
    background:#fff;
    border:1px solid #dadce0;
    border-radius:8px;
    padding:16px;
    width:400px;
    max-height:500px;
    overflow-y:auto;
    box-shadow:0 4px 15px rgba(0,0,0,0.15);
    font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    display: flex;
    flex-direction: column;
  `;

  popup.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <b style="font-size:16px; color:#3c4043;">💡 Dicas Inteligentes</b>
      <button id="fecharDicaFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer; color:#5f6368;">&times;</button>
    </div>
    
    <div id="conteudoDica" style="
      padding: 10px;
      background: #f8f9fa;
      border: 1px solid #eee;
      border-radius: 4px;
      font-family: 'Segoe UI', sans-serif;
      flex: 1;
      overflow-y: auto;
      margin-bottom: 12px;
      white-space: pre-wrap;
      line-height: 1.4;
      color: #333;
    "></div>
  `;

  popup.querySelector("#conteudoDica").innerHTML = formatarComNegrito(conteudo);
  document.body.appendChild(popup);

  popup.querySelector("#fecharDicaFlutuante").addEventListener("click", () => popup.remove());

  function formatarComNegrito(texto) {
    return texto
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }
}

function mostrarPopupMensagens() {
  const popupAntigo = document.getElementById("popupMensagensPadrao");
  if (popupAntigo) popupAntigo.remove();

  const popup = document.createElement("div");
  popup.id = "popupMensagensPadrao";
  popup.style = `
        position: fixed;
        bottom: 130px;
        right: 20px;
        z-index: 999999;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 16px;
        width: 450px;
        max-height: 500px;
        overflow-y: auto;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
        font-size: 14px;
        display: flex;
        flex-direction: column;
    `;

  popup.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <b style="font-size:16px;">💬 Mensagens Padrão</b>
            <button id="fecharPopupMensagens" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
        </div>
        <div id="mensagensContainer" style="flex: 1; overflow-y: auto; margin-bottom: 12px;">
            <div id="mensagensCarregando" style="padding: 20px; text-align: center;">
                Carregando mensagens...
            </div>
        </div>
    `;

  document.body.appendChild(popup);

  carregarEMostrarMensagens();

  popup.querySelector("#fecharPopupMensagens").addEventListener("click", () => {
    popup.remove();
  });
}

function carregarEMostrarMensagens() {
  const container = document.getElementById("mensagensContainer");

  chrome.storage.local.get(["customMessages"], (data) => {
    const customMessages = data.customMessages || [];
    const fixedMessages = [
      "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações.",
      "Atualmente, a fase inicial da Reforma Tributária com IBS e CBS se aplica apenas às empresas do regime normal (Lucro Presumido e Lucro Real), sendo que para o Simples Nacional não há recolhimento nem impacto prático neste primeiro ano, pois as informações são utilizadas apenas de forma nominativa e experimental.",
      "A reformulação das telas não altera a lógica de cálculo nem as regras fiscais do sistema, sendo uma evolução voltada à melhoria contínua, e qualquer diferença percebida está relacionada apenas à interface ou fluxo, com nossa equipe disponível para esclarecer dúvidas e ajustar eventuais pontos específicos.",
      "As telas reformuladas de Contas a Receber, Contas a Pagar, NFC-e e Cadastro de Produtos mantêm as mesmas regras fiscais e operacionais de antes, tendo sido alterados apenas aspectos visuais e funcionais para melhorar usabilidade e organização, sem impacto nos cálculos ou validações já existentes.",
      "A emissão de NFC-e para CNPJ deixou de ser permitida por determinação das normas fiscais vigentes, não sendo uma regra criada pelo sistema, que apenas aplica automaticamente essa exigência legal para evitar rejeições e problemas fiscais ao contribuinte.",
      "O procedimento de referenciar NFC-e em uma NF-e não é mais aceito pela legislação fiscal atual, motivo pelo qual o sistema bloqueia essa prática, garantindo conformidade legal e evitando a rejeição dos documentos junto à SEFAZ.",
      "A vedação à emissão de NFC-e para CNPJ e ao seu referenciamento em NF-e decorre exclusivamente de alterações nas regras fiscais, e o sistema apenas segue essas determinações para manter a regularidade das operações e evitar inconsistências legais."
    ];

    container.innerHTML = "";

    const fixedAccordion = criarAcordeon(
      "Mensagens Fixas",
      true,
      "fixed-accordion"
    );

    fixedMessages.forEach((msg, index) => {
      const messageCard = criarCardMensagemPopup(msg, false, index);
      fixedAccordion.content.appendChild(messageCard);
    });

    container.appendChild(fixedAccordion.container);

    const customAccordion = criarAcordeon(
      `Mensagens Personalizadas (${customMessages.length})`,
      false,
      "custom-accordion"
    );

    if (customMessages.length > 0) {
      customMessages.forEach((msg, index) => {
        const messageCard = criarCardMensagemPopup(msg, true, index, customMessages);
        customAccordion.content.appendChild(messageCard);
      });
    } else {
      const emptyMsg = document.createElement("div");
      emptyMsg.style = "text-align: center; color: #666; padding: 20px; font-style: italic;";
      emptyMsg.textContent = "Nenhuma mensagem personalizada cadastrada.";
      customAccordion.content.appendChild(emptyMsg);
    }

    container.appendChild(customAccordion.container);

    const instructions = document.createElement("div");
    instructions.style = "margin-top: 15px; padding: 10px; background: #f0f7ff; border-radius: 6px; border-left: 3px solid #4285F4; font-size: 12px; color: #555;";
    instructions.innerHTML = `
            <strong>💡 Como usar os atalhos:</strong><br>
            Digite o atalho (ex: /1, /a) no campo de mensagem do chat para inserir automaticamente.
        `;
    container.appendChild(instructions);
  });
}

function criarAcordeon(titulo, aberto = true, id = "") {
  const container = document.createElement("div");
  container.id = id;
  container.style = "margin-bottom: 10px;";

  const header = document.createElement("div");
  header.style = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        background: ${aberto ? '#f1f5f9' : '#f8fafc'};
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        cursor: pointer;
        user-select: none;
        font-weight: 600;
        font-size: 14px;
        color: #334155;
        transition: background 0.2s;
    `;

  header.innerHTML = `
        <span>${titulo}</span>
        <span style="font-size: 18px; transition: transform 0.3s;">${aberto ? '−' : '+'}</span>
    `;

  const content = document.createElement("div");
  content.style = `
        border: 1px solid #e2e8f0;
        border-top: none;
        border-radius: 0 0 6px 6px;
        background: white;
        max-height: ${aberto ? 'none' : '0'};
        overflow: ${aberto ? 'visible' : 'hidden'};
        opacity: ${aberto ? '1' : '0'};
        transition: all 0.3s ease;
        margin-top: ${aberto ? '0' : '-1px'};
    `;

  if (aberto) {
    content.style.padding = '15px 15px 5px 15px';
    content.style.borderTop = 'none';
  } else {
    content.style.padding = '0';
    content.style.border = 'none';
  }

  let isOpen = aberto;

  function toggleAcordeon() {
    isOpen = !isOpen;

    const icon = header.querySelector('span:last-child');
    icon.textContent = isOpen ? '−' : '+';

    header.style.background = isOpen ? '#f1f5f9' : '#f8fafc';
    header.style.borderRadius = isOpen ? '6px 6px 0 0' : '6px';

    if (isOpen) {
      content.style.padding = '15px 15px 5px 15px';
      content.style.maxHeight = 'none';
      content.style.overflow = 'visible';
      content.style.opacity = '1';
      content.style.border = '1px solid #e2e8f0';
      content.style.borderTop = 'none';
      content.style.marginTop = '0';
    } else {
      content.style.padding = '0';
      content.style.maxHeight = '0';
      content.style.overflow = 'hidden';
      content.style.opacity = '0';
      content.style.border = 'none';
      content.style.marginTop = '-1px';
    }
  }

  header.addEventListener('click', toggleAcordeon);

  header.addEventListener('mouseenter', () => {
    header.style.background = isOpen ? '#e2e8f0' : '#f1f5f9';
  });

  header.addEventListener('mouseleave', () => {
    header.style.background = isOpen ? '#f1f5f9' : '#f8fafc';
  });

  container.appendChild(header);
  container.appendChild(content);

  return {
    container: container,
    content: content,
    toggle: toggleAcordeon
  };
}

function criarCardMensagemPopup(text, isCustom, index, customMessagesList) {
  const card = document.createElement("div");
  card.style = `
        background: ${isCustom ? '#eef4ff' : '#f9fafb'};
        border: 1px solid ${isCustom ? '#c9ddff' : '#ddd'};
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 10px;
        font-size: 13px;
        line-height: 1.4;
    `;

  const textDiv = document.createElement("div");
  textDiv.style = "margin-bottom: 10px; white-space: pre-wrap;";
  textDiv.textContent = text;

  card.appendChild(textDiv);

  const bottomRow = document.createElement("div");
  bottomRow.style = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 10px;
        border-top: 1px solid ${isCustom ? '#c9ddff' : '#ddd'};
    `;

  const buttonsContainer = document.createElement("div");
  buttonsContainer.style = "display: flex; gap: 8px; align-items: center;";

  const btnCopiar = document.createElement("button");
  btnCopiar.innerHTML = "Copiar";
  btnCopiar.style = `
        background: #dbeafe;
        color: #1e40af;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    `;

  btnCopiar.onclick = () => {
    navigator.clipboard.writeText(text);
    btnCopiar.innerHTML = "✅ Copiado!";
    setTimeout(() => {
      btnCopiar.innerHTML = "Copiar";
    }, 1500);
  };

  const btnEnviar = document.createElement("button");
  btnEnviar.innerHTML = " Enviar";
  btnEnviar.style = `
        background: #4285F4;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    `;

  btnEnviar.onclick = () => {
    enviarMensagemParaChat(text);
    const popup = document.getElementById("popupMensagensPadrao");
    if (popup) popup.remove();
  };

  buttonsContainer.appendChild(btnCopiar);
  buttonsContainer.appendChild(btnEnviar);

  const shortcutContainer = document.createElement("div");
  shortcutContainer.style = `
        display: flex;
        align-items: center;
        gap: 5px;
        margin-left: auto;
    `;

  const shortcutKey = isCustom ? `custom_${index}` : `fixed_${index}`;

  chrome.storage.local.get(["messageShortcuts"], (data) => {
    const shortcuts = data.messageShortcuts || {};
    const shortcutValue = shortcuts[shortcutKey];

    if (shortcutValue) {
      const displayValue = typeof shortcutValue === 'string' ? shortcutValue.toUpperCase() : shortcutValue.toString();

      const shortcutLabel = document.createElement("span");
      shortcutLabel.textContent = "Atalho: /";
      shortcutLabel.style = `
                color: #666;
                font-size: 12px;
                font-family: Arial, sans-serif;
            `;

      const shortcutBadge = document.createElement("span");
      shortcutBadge.textContent = displayValue;
      shortcutBadge.style = `
                display: inline-block;
                background: ${isCustom ? '#dbeafe' : '#e5e7eb'};
                color: ${isCustom ? '#1e40af' : '#374151'};
                padding: 2px 8px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
                font-weight: bold;
                border: 1px solid ${isCustom ? '#93c5fd' : '#d1d5db'};
                min-width: 20px;
                text-align: center;
            `;
      shortcutBadge.title = `Digite "/${displayValue}" no chat para inserir automaticamente`;

      shortcutContainer.appendChild(shortcutLabel);
      shortcutContainer.appendChild(shortcutBadge);
    } else {
      const noShortcutLabel = document.createElement("span");
      noShortcutLabel.textContent = "Sem atalho";
      noShortcutLabel.style = `
                color: #999;
                font-size: 11px;
                font-style: italic;
            `;
      noShortcutLabel.title = "Configure um atalho nas opções da extensão";
      shortcutContainer.appendChild(noShortcutLabel);
    }
  });

  bottomRow.appendChild(buttonsContainer);
  bottomRow.appendChild(shortcutContainer);

  card.appendChild(bottomRow);

  return card;
}

function enviarMensagemParaChat(mensagem) {
  const seletores = [
    '#twemoji-textarea',
    '.twemojiTextarea.pastable',
    '.ji-textarea[contenteditable="true"]',
    '.ji-textarea',
    '[contenteditable="true"]',
    'textarea[placeholder*="mensagem"]',
    'textarea[placeholder*="message"]',
    'div[contenteditable="true"]',
    'div[role="textbox"]'
  ];

  let textarea = null;

  for (const seletor of seletores) {
    const elemento = document.querySelector(seletor);
    if (elemento) {
      textarea = elemento;
      break;
    }
  }

  if (!textarea) {
    const elementosEditaveis = document.querySelectorAll('[contenteditable="true"]');

    if (elementosEditaveis.length > 0) {
      textarea = elementosEditaveis[0];
    }
  }

  if (textarea) {
    try {
      textarea.textContent = mensagem;

      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      setTimeout(() => {
        textarea.focus();

        const keydownEvent = new KeyboardEvent('keydown', {
          key: 'a',
          bubbles: true
        });
        textarea.dispatchEvent(keydownEvent);

      }, 100);

    } catch (error) {
      console.error("Erro ao inserir mensagem:", error);
    }
  } else {
    alert("Não foi possível encontrar o campo de texto do chat.");
  }
}

function exibirPainelConsultaDocs() {
  const popupId = "geminiDocsPopup";
  const popupAntigo = document.getElementById(popupId);
  if (popupAntigo) {
    popupAntigo.remove();
    return;
  }

  const popup = document.createElement("div");
  popup.id = popupId;
  popup.style = `
  position: fixed;
  bottom: 130px;
  right: 20px;
  z-index: 999999;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  width: 360px;
  height: 500px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  font-family: Arial, sans-serif;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  `;

  popup.innerHTML = `
    <div style="background:#f1f3f4; padding:10px; border-bottom:1px solid #ddd; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:bold; font-size:16px; color:#333;">📚 Consultar Docs</div>
        <button id="fecharDocs" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
    </div>

    <div style="padding:15px; flex:1; overflow-y:auto; display:flex; flex-direction:column;">
      <label style="font-weight:bold; margin-bottom:5px;">O que você procura?</label>
      <div style="display:flex; gap:5px; margin-bottom:15px;">
        <input type="text" id="inputBuscaDocs" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px;" placeholder="Ex: Erro 503, Nota Fiscal...">
          <button id="btnBuscarDocs" style="background:#d93025; color:#fff; padding:8px 12px; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">🔍</button>
      </div>

      <div id="listaResultadosDocs" style="flex:1; overflow-y:auto;">
        <div style="color:#666; font-style:italic; text-align:center; margin-top:20px;">Digite um termo para buscar na base de conhecimento.</div>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector("#fecharDocs").addEventListener("click", () => popup.remove());

  const btnBuscar = popup.querySelector("#btnBuscarDocs");
  const inputBusca = popup.querySelector("#inputBuscaDocs");
  const lista = popup.querySelector("#listaResultadosDocs");

  const realizarBusca = () => {
    const termo = inputBusca.value.trim();
    if (!termo) return;

    lista.innerHTML = "<div style='text-align:center; color:#666;'>Buscando...</div>";

    chrome.runtime.sendMessage({ action: "buscarDocumentacao", termo }, (resp) => {
      lista.innerHTML = "";
      if (resp && resp.sucesso) {
        if (!resp.docs || resp.docs.length === 0) {
          lista.innerHTML = "<div style='color:#666;'>Nenhum documento encontrado.</div>";
        } else {
          resp.docs.forEach(doc => {
            const item = document.createElement("div");
            item.style = "background:#f9f9f9; padding:10px; margin-bottom:8px; border:1px solid #eee; border-radius:4px; font-size:13px;";

            const titulo = (doc.metadata && doc.metadata.title) ? doc.metadata.title : "Documento Sem Título";
            const conteudo = doc.content || "";

            item.innerHTML = `
    <div style="font-weight:bold; color:#1a73e8; margin-bottom:4px;">${titulo}</div>
      <div style="color:#333; line-height:1.4;">${conteudo}</div>
  `;
            lista.appendChild(item);
          });
        }
      } else {
        lista.innerHTML = `<div style='color:red;'>Erro: ${resp ? resp.erro : "Desconhecido"}</div>`;
      }
    });
  };

  btnBuscar.addEventListener("click", realizarBusca);
  inputBusca.addEventListener("keypress", (e) => {
    if (e.key === "Enter") realizarBusca();
  });

  setTimeout(() => inputBusca.focus(), 100);
}

function exibirNotas() {
  // Deprecated - merging into exibirAgenda in this update
}

// --- Notification System ---
let lastCheckedClientName = "";

function verificarNotificacoesChat() {
  // Tries to identify the potential client header in the page
  const headerSelectors = [
    // Standard headers often used in varied chat layouts or material designs
    "header .truncate",
    ".conversation-header .name",
    ".room-name",
    ".chat-header .title",
    // Fallback attempts
    "h1",
    "h2",
    ".v-toolbar__title",
    ".item-title"
  ];

  let headerElement = null;
  for (const sel of headerSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim()) {
      headerElement = el;
      break;
    }
  }

  if (!headerElement) return;

  const currentClientName = headerElement.innerText.trim();

  // Simple debounce/check to avoid spamming logic
  if (currentClientName && currentClientName !== lastCheckedClientName) {
    lastCheckedClientName = currentClientName;
    checkAndShowNotification(currentClientName);
  }
}

function checkAndShowNotification(clientName) {
  chrome.storage.local.get(["usuarioAgendaCRM"], (data) => {
    const atendimentos = data.usuarioAgendaCRM || [];
    const target = clientName.toLowerCase();

    // Find pending items for this client
    const matches = atendimentos.filter(a =>
      a.cliente && a.cliente.toLowerCase().includes(target) &&
      a.status !== 'resolvido'
    );

    if (matches.length > 0) {
      exibirNotificacaoSistema(clientName, matches);
    }
  });
}

function exibirNotificacaoSistema(clientName, matches) {
  if (document.getElementById("gemini-notification-toast")) return;

  const toast = document.createElement("div");
  toast.id = "gemini-notification-toast";
  // The 'slideIn' animation is defined in the injected CSS
  toast.style = `
    position: fixed; top: 90px; right: 20px; background: #fff;
    border-left: 6px solid #f59e0b; padding: 16px 20px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.15); border-radius: 6px;
    z-index: 1000000; font-family: 'Segoe UI', sans-serif;
    animation: slideIn 0.5s ease-out; min-width: 300px;
  `;

  const count = matches.length;
  const msgMain = count === 1 ? "1 Pendência Encontrada" : `${count} Pendências Encontradas`;
  const subject = matches[0].assunto;
  const note = count > 1 ? `e mais ${count - 1} item(ns)...` : subject;

  toast.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:start;">
       <div>
         <div style="font-weight:700; color:#333; margin-bottom:4px; font-size:14px;">🔔 Lembrete: ${clientName}</div>
         <div style="color:#e65100; font-weight:600; font-size:13px; margin-bottom:2px;">${msgMain}</div>
         <div style="color:#555; font-size:13px;">${note}</div>
       </div>
       <button id="closeToast" style="background:none; border:none; cursor:pointer; color:#999; font-size:18px;">&times;</button>
    </div>
    <div style="margin-top:10px; text-align:right;">
        <button id="btnVerAgendaToast" style="background:#f59e0b; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Ver Agenda</button>
    </div>
  `;

  document.body.appendChild(toast);

  toast.querySelector("#closeToast").addEventListener("click", () => {
    toast.remove();
  });

  toast.querySelector("#btnVerAgendaToast").addEventListener("click", () => {
    exibirAgenda();
    toast.remove();
  });

  // Auto dismiss after 8 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.animation = "fadeOut 0.5s ease-in";
      setTimeout(() => toast.remove(), 450);
    }
  }, 8000);
}

// --- Unified Agenda Implementation ---

function exibirAgenda() {
  const popupAntigo = document.getElementById("geminiAgendaModal");
  if (popupAntigo) popupAntigo.remove();

  const popup = document.createElement("div");
  popup.id = "geminiAgendaModal";
  // Styles handled by CSS class #geminiAgendaModal

  popup.innerHTML = `
      <div class="agenda-header">
        <div style="font-size: 18px; font-weight: 600; color: #3c4043; display: flex; align-items: center; gap: 10px;">
          📅 Agenda & Gestão
        </div>
        <button id="fecharAgendaM" style="background:none; border:none; font-size:24px; color:#5f6368; cursor:pointer;">&times;</button>
      </div>
      <div class="agenda-tabs">
        <div class="agenda-tab active" data-tab="calendario">📅 Calendário</div>
        <div class="agenda-tab" data-tab="crm">📋 Atendimentos (CRM)</div>
      </div>
      <div class="agenda-body">
        <div id="tab-calendario" class="tab-content" style="display:block;">
           <div id="calendar-container"></div>
        </div>
        <div id="tab-crm" class="tab-content" style="display:none;">
           <div id="crm-container"></div>
        </div>
      </div>
    `;

  document.body.appendChild(popup);

  // Close functionality
  popup.querySelector("#fecharAgendaM").addEventListener("click", () => popup.remove());

  // Tab Switching
  const tabs = popup.querySelectorAll('.agenda-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      popup.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      const target = popup.querySelector(`#tab-${tab.dataset.tab}`);
      if (target) target.style.display = 'block';
    });
  });

  // Initialize Components
  iniciarCalendario(popup.querySelector("#calendar-container"));
  iniciarCRM(popup.querySelector("#crm-container"));
}

function iniciarCalendario(container) {
  const date = new Date();
  let currentMonth = date.getMonth();
  let currentYear = date.getFullYear();
  let eventsCache = {};

  const loadEvents = (cb) => {
    chrome.storage.local.get(["usuarioAgendaEvents"], (data) => {
      eventsCache = data.usuarioAgendaEvents || {};
      cb();
    });
  };

  const saveEvent = (year, month, day, text) => {
    const key = `${year}-${month}-${day}`;
    if (!eventsCache[key]) eventsCache[key] = [];
    eventsCache[key].push(text);
    chrome.storage.local.set({ usuarioAgendaEvents: eventsCache }, () => {
      render();
    });
  };

  const render = () => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    container.innerHTML = `
            <div class="calendar-controls">
                <button id="prevMonth" style="border:none; background:none; cursor:pointer; font-size:18px; padding:5px;">◀</button>
                <div style="font-weight:700; font-size:16px; color:#333;">${monthNames[currentMonth]} ${currentYear}</div>
                <button id="nextMonth" style="border:none; background:none; cursor:pointer; font-size:18px; padding:5px;">▶</button>
            </div>
            <div class="calendar-grid">
                ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<div class="calendar-day-header">${d}</div>`).join('')}
            </div>
        `;

    const grid = container.querySelector('.calendar-grid');

    // Empty slots
    for (let i = 0; i < firstDay; i++) {
      grid.appendChild(document.createElement('div'));
    }

    // Days
    for (let i = 1; i <= daysInMonth; i++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';

      const isToday = i === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
      if (isToday) dayEl.classList.add('today');

      // Check content
      const key = `${currentYear}-${currentMonth}-${i}`;
      const dayEvents = eventsCache[key] || [];

      let eventsHtml = '';
      dayEvents.forEach(evt => {
        eventsHtml += `<span class="event-marker" title="${evt}">${evt}</span>`;
      });

      dayEl.innerHTML = `
           <span class="day-number">${i}</span>
           <div class="day-events">${eventsHtml}</div>
        `;

      dayEl.addEventListener('click', () => {
        const novo = prompt(`Adicionar evento para ${i}/${currentMonth + 1}:`);
        if (novo && novo.trim()) {
          saveEvent(currentYear, currentMonth, i, novo.trim());
        }
      });

      grid.appendChild(dayEl);
    }

    container.querySelector("#prevMonth").addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      render();
    });
    container.querySelector("#nextMonth").addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      render();
    });
  };

  loadEvents(render);
}

function iniciarCRM(container) {
  container.innerHTML = `
        <div class="crm-controls">
            <button id="btnAddCrm" style="background:#1a73e8; color:white; border:none; padding:10px 16px; border-radius:6px; font-weight:600; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.1);">+ Novo Atendimento</button>
            <div style="flex:1;"></div>
            <input type="text" id="filtroCrm" placeholder="Filtrar por nome..." style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;">
        </div>
        <div style="overflow-x:auto; border:1px solid #eee; border-radius:6px;">
            <table class="crm-table">
                <thead style="background:#f8f9fa;">
                    <tr>
                        <th>Cliente</th>
                        <th>Assunto/Pendência</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody id="crmBody"></tbody>
            </table>
        </div>
    `;

  const tbody = container.querySelector("#crmBody");
  const filtroInput = container.querySelector("#filtroCrm");

  const renderTable = (dados, filtro = "") => {
    tbody.innerHTML = "";

    const filtrados = dados.filter(d =>
      d.cliente.toLowerCase().includes(filtro.toLowerCase()) ||
      d.assunto.toLowerCase().includes(filtro.toLowerCase())
    );

    if (filtrados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:#777;">Nenhum registro encontrado.</td></tr>`;
      return;
    }

    filtrados.forEach((item, index) => {
      // We use the original index from the main array implies we need to handle reference,
      // but for simplicity in this version, we will re-map indices or just stick to simple rendering.
      // Actually, to edit/delete reliably with filter, we should better store ID, but for now let's map back.
      const originalIndex = dados.indexOf(item);

      const tr = document.createElement("tr");
      tr.innerHTML = `
            <td><strong>${item.cliente}</strong></td>
            <td>${item.assunto}</td>
            <td><span class="status-badge ${item.status === 'pendente' ? 'status-pending' : 'status-resolved'}">${item.status}</span></td>
            <td>
                <button class="action-btn btn-resolve" data-idx="${originalIndex}" title="${item.status === 'pendente' ? 'Marcar Resolvido' : 'Reabrir'}">
                   ${item.status === 'pendente' ? '✅' : '↩️'}
                </button>
                <button class="action-btn btn-delete" data-idx="${originalIndex}" title="Excluir">🗑️</button>
            </td>
        `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-resolve').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.idx);
        dados[idx].status = dados[idx].status === 'pendente' ? 'resolvido' : 'pendente';
        salvarCRM(dados);
        renderTable(dados, filtroInput.value);
      });
    });

    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (confirm("Tem certeza que deseja remover este registro?")) {
          const idx = parseInt(btn.dataset.idx);
          dados.splice(idx, 1);
          salvarCRM(dados);
          renderTable(dados, filtroInput.value);
        }
      });
    });
  };

  const salvarCRM = (dados) => {
    chrome.storage.local.set({ usuarioAgendaCRM: dados });
  };

  chrome.storage.local.get(["usuarioAgendaCRM"], (data) => {
    const dados = data.usuarioAgendaCRM || [];
    renderTable(dados);

    container.querySelector("#btnAddCrm").addEventListener('click', () => {
      const cliente = prompt("Nome do Cliente:");
      if (!cliente) return;
      const assunto = prompt("O que está pendente ou foi tratado?");
      if (!assunto) return;

      dados.push({
        cliente: cliente.trim(),
        assunto: assunto.trim(),
        status: 'pendente',
        data: new Date().toISOString()
      });
      salvarCRM(dados);
      renderTable(dados, filtroInput.value);
    });

    filtroInput.addEventListener('input', (e) => {
      renderTable(dados, e.target.value);
    });
  });
}
