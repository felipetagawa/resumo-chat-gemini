// content.js

// === LISTENER DE MENSAGENS ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Mensagem recebida no content.js:", request.action);

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
    // Usamos a função do feature/docs-cache-otimizacao que suporta Docs e AutoSave
    exibirResumo(request.resumo);
  } else if (request.action === "exibirDica") {
    console.log("Exibindo dica:", request.dica);
    exibirDica(request.dica);
  } else if (request.action === "exibirErro") {
    alert("Erro: " + request.erro);
  }

  return true;
});


// === VERIFICADOR DE PÁGINA E URL ===
const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";

setInterval(() => {
  const botoesExistem = document.getElementById("containerBotoesGemini");
  const urlAtualCorreta = window.location.href.startsWith(TARGET_URL);

  if (urlAtualCorreta && !botoesExistem) {
    criarBotoesFlutuantes();
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


// === FUNÇÃO DE CRIAR BOTÕES ===
function criarBotoesFlutuantes() {
  if (document.getElementById("containerBotoesGemini")) return;

  const container = document.createElement("div");
  container.id = "containerBotoesGemini";
  Object.assign(container.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999998",
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  });

  const estiloBotao = {
    background: "#fff",
    color: "#333",
    border: "1px solid #ccc",
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    textAlign: "left"
  };

  // 1. Botão Copiar Chat (From HEAD)
  const botaoCopiar = document.createElement("button");
  botaoCopiar.id = "btnCopiarChat";
  botaoCopiar.textContent = "📋 Copiar Histórico";
  Object.assign(botaoCopiar.style, estiloBotao);
  Object.assign(botaoCopiar.style, {
    background: "#ffffffff",
    color: "#4285F4",
    border: "1px solid #4285F4",
  });

  botaoCopiar.addEventListener("click", () => {
    const texto = capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      return;
    }
    navigator.clipboard.writeText(texto);

    botaoCopiar.textContent = "✅ Histórico Copiado!";
    botaoCopiar.disabled = true;
    setTimeout(() => {
      botaoCopiar.textContent = "📋 Copiar Histórico";
      botaoCopiar.disabled = false;
    }, 2000);
  });

  // 2. Botão Consultar Docs (From Feature)
  const botaoDocs = document.createElement("button");
  botaoDocs.id = "btnConsultarDocs";
  botaoDocs.textContent = "📚 Consultar Docs";
  Object.assign(botaoDocs.style, estiloBotao);
  Object.assign(botaoDocs.style, {
    background: "#fff",
    color: "#d93025",
    border: "1px solid #d93025",
  });

  botaoDocs.addEventListener("click", () => {
    exibirPainelConsultaDocs();
  });

  // 3. Botão Gerar Relatório (Merged)
  const botaoResumo = document.createElement("button");
  botaoResumo.id = "btnResumoGemini";
  botaoResumo.textContent = "🧠 Gerar Relatório";
  Object.assign(botaoResumo.style, estiloBotao);
  Object.assign(botaoResumo.style, {
    background: "#4285F4",
    color: "#fff",
    border: "none",
  });

  botaoResumo.addEventListener("click", async () => {
    botaoResumo.disabled = true;
    botaoResumo.textContent = "⏳ Gerando resumo...";

    const texto = capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      botaoResumo.disabled = false;
      botaoResumo.textContent = "🧠 Gerar Relatório";
      return;
    }
    chrome.runtime.sendMessage({ action: "gerarResumo", texto });
  });

  // 4. Botão Dica (From HEAD)
  const botaoDica = document.createElement("button");
  botaoDica.id = "btnDica";
  botaoDica.textContent = "💡 Dicas Inteligentes";
  Object.assign(botaoDica.style, estiloBotao);
  Object.assign(botaoDica.style, {
    background: "#FEF7E0",
    color: "#B06000",
    border: "1px solid #e08002ff",
  });

  botaoDica.addEventListener("click", async () => {
    botaoDica.disabled = true;
    botaoDica.textContent = "⏳ Pensando...";

    const texto = capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      botaoDica.disabled = false;
      botaoDica.textContent = "💡 Dicas Inteligentes";
      return;
    }
    chrome.runtime.sendMessage({ action: "gerarDica", texto });
  });

  // 5. Botão Mensagens (From HEAD)
  const botaoMessages = document.createElement("button");
  botaoMessages.id = "btnMessages";
  botaoMessages.textContent = "💬 Mensagens Padrão";
  Object.assign(botaoMessages.style, estiloBotao);
  Object.assign(botaoMessages.style, {
    background: "#fff",
    color: "#555453ff",
    border: "1px solid #555453ff",
  });

  botaoMessages.addEventListener("click", () => {
    mostrarPopupMensagens();
  });


  // Append All
  container.appendChild(botaoCopiar);
  container.appendChild(botaoDocs);
  container.appendChild(botaoResumo);
  container.appendChild(botaoDica);
  container.appendChild(botaoMessages);

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
      // Filtros básicos de msgs automáticas
      return t && !t.startsWith("automático");
    })
    .join("\n");

  return mensagens;
}


// === FUNÇÃO DE EXIBIR O POPUP (RESUMO) - Auto-Save & Docs (From Feature) ===
function exibirResumo(texto) {
  const popupAntigo = document.getElementById("geminiResumoPopup");
  if (popupAntigo) popupAntigo.remove();

  // 1. Analisar Humor
  let humorIcon = "";
  const lowerText = texto.toLowerCase();

  if (lowerText.includes("humor do cliente:")) {
    const lines = texto.split("\n");
    const humorLine = lines.find(l => l.toLowerCase().includes("humor do cliente:")) || "";
    if (humorLine.match(/positivo|feliz|satisfeito|elogio/i)) humorIcon = "😊";
    else if (humorLine.match(/negativo|irritado|insatisfeito|reclama/i)) humorIcon = "😡";
    else if (humorLine.match(/neutro|normal|dúvida/i)) humorIcon = "😐";
  }

  // Tentar extrair um título sugerido para salvar automaticamente
  let tituloSugerido = "Atendimento " + new Date().toLocaleString();
  const tituloMatch = texto.match(/^(?:Título|Assunto):\s*(.+)$/m) || texto.match(/^(.+)$/m);
  if (tituloMatch && tituloMatch[1].length < 100) {
    tituloSugerido = tituloMatch[1].trim().replace(/\*\*/g, '');
  }

  const popup = document.createElement("div");
  popup.id = "geminiResumoPopup";
  popup.style = `
    position:fixed;
    bottom:130px;
    right:20px;
    z-index:999999;
    background:#fff;
    border:2px solid #4285F4;
    border-radius:8px;
    padding:16px;
    width:380px;
    max-height:600px;
    overflow-y:auto;
    box-shadow:0 4px 15px rgba(66,133,244,0.35);
    font-family:Arial, sans-serif;
    font-size:14px;
    display:flex;
    flex-direction:column;
  `;

  popup.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <b style="font-size:16px; color:#4285F4;">Resumo Gerado ${humorIcon}</b>
      <button id="fecharResumoFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
    </div>
    
    <div id="statusSalvar" style="
        font-size:12px; color:#666; background:#f1f3f4; padding:5px; border-radius:4px; margin-bottom:10px; display:flex; align-items:center; gap:5px;
    ">
        <span>⏳</span> Salvando automaticamente na base...
    </div>

    <pre style="
      white-space:pre-wrap;
      padding: 10px;
      background: #f9f9f9;
      border: 1px solid #eee;
      border-radius: 4px;
      font-family: monospace;
      flex: 1;
      overflow-y: auto;
      margin-bottom: 12px;
      max-height: 300px; 
    "></pre>

    <div style="display:flex; gap:8px;">
      <button id="copiarResumoFlutuante" style="
        flex: 1; padding: 8px; background: #fff;
        color: #4285F4; border: 1px solid #4285F4; border-radius: 6px; cursor: pointer; font-weight:bold;
      ">📋 Copiar</button>
      
      <button id="exportarResumo" style="
        flex: 1; padding: 8px; background: #34A853;
        color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight:bold;
      ">💾 Baixar .txt</button>
      
      <button id="btnSugerirDocs" style="
        flex: 1; padding: 8px; background: #fbbc04;
        color: #333; border: none; border-radius: 6px; cursor: pointer; font-weight:bold;
      ">📚 Docs Sugeridos</button>
    </div>
    
    <div id="containerDocsSugeridos" style="
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #eee;
        display: none;
        flex-direction: column;
        gap: 5px;
    ">
        <label style="font-size:12px; font-weight:bold; color:#555;">Documentação Sugerida:</label>
        <div id="listaDocsSugeridos" style="max-height: 150px; overflow-y: auto;"></div>
    </div>
  `;

  popup.querySelector("pre").innerText = texto;
  document.body.appendChild(popup);

  // Auto-Save Call
  chrome.runtime.sendMessage({
    action: "salvarResumo",
    titulo: tituloSugerido,
    conteudo: texto
  }, (response) => {
    const statusDiv = popup.querySelector("#statusSalvar");
    if (response && response.sucesso) {
      statusDiv.innerHTML = `<span style="color:green;">✅</span> Salvo como: <b>${tituloSugerido.substring(0, 25)}...</b>`;
      statusDiv.style.background = "#e6f4ea";
      statusDiv.style.color = "#137333";
    } else {
      statusDiv.innerHTML = `<span style="color:red;">❌</span> Erro ao salvar: ${response ? response.erro : "Desconhecido"}`;
      statusDiv.style.background = "#fce8e6";
      statusDiv.style.color = "#c5221f";
    }
  });

  // Eventos UI
  popup.querySelector("#fecharResumoFlutuante").addEventListener("click", () => popup.remove());

  popup.querySelector("#copiarResumoFlutuante").addEventListener("click", () => {
    navigator.clipboard.writeText(texto);
    const btn = popup.querySelector("#copiarResumoFlutuante");
    const original = btn.textContent;
    btn.textContent = "✅ Copiado!";
    setTimeout(() => btn.textContent = original, 2000);
  });

  popup.querySelector("#exportarResumo").addEventListener("click", () => {
    const blob = new Blob([texto], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumo-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // 💾 Busca única de documentações (só executa uma vez)
  let jaCarregouDocs = false;

  popup.querySelector("#btnSugerirDocs").addEventListener("click", () => {
    const btn = popup.querySelector("#btnSugerirDocs");
    const container = popup.querySelector("#containerDocsSugeridos");
    const lista = popup.querySelector("#listaDocsSugeridos");

    // Se já carregou, não faz nada (botão fica desabilitado)
    if (jaCarregouDocs) return;

    btn.disabled = true;
    btn.textContent = "⌛ Buscando...";
    container.style.display = "flex";
    lista.innerHTML = "<div style='color:#666; font-style:italic;'>Analisando resumo e buscando docs...</div>";

    chrome.runtime.sendMessage({ action: "sugerirDocumentacao", resumo: texto }, (resp) => {
      jaCarregouDocs = true;
      btn.textContent = "✅ Documentação Carregada";
      // Mantém botão desabilitado após carregar

      lista.innerHTML = "";
      if (resp && resp.sucesso && resp.docs && resp.docs.length > 0) {
        resp.docs.forEach(doc => {
          const item = document.createElement("div");
          item.style = "background:#f9f9f9; padding:8px; border:1px solid #eee; border-radius:4px; font-size:12px; margin-bottom:5px;";
          const titulo = (doc.metadata && doc.metadata.title) ? doc.metadata.title : "Documento Oficial";
          const snippet = doc.content || "";

          item.innerHTML = `
                    <div style="font-weight:bold; color:#1a73e8; margin-bottom:2px;">${titulo}</div>
                    <div style="color:#333;">${snippet}</div>
                `;
          lista.appendChild(item);
        });
      } else {
        lista.innerHTML = "<div style='color:#999;'>Nenhuma documentação relevante encontrada para este resumo.</div>";
      }
    });
  });
}


// === FUNÇÃO DE EXIBIR DICA (From HEAD) ===
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
    border:2px solid #e08002;
    border-radius:8px;
    padding:16px;
    width:400px;
    max-height:500px;
    overflow-y:auto;
    box-shadow:0 4px 15px rgba(224,128,2,0.35);
    font-family:Arial, sans-serif;
    font-size: 14px;
    display: flex;
    flex-direction: column;
  `;

  popup.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <b style="font-size:16px; color:#B06000;">💡 Dicas Inteligentes</b>
      <button id="fecharDicaFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer; color:#B06000;">&times;</button>
    </div>
    
    <div id="conteudoDica" style="
      padding: 10px;
      background: #FEF7E0;
      border: 1px solid #f1d7a1;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      flex: 1;
      overflow-y: auto;
      margin-bottom: 12px;
      white-space: pre-wrap;
      line-height: 1.4;
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

// === FUNÇÃO PARA MOSTRAR POPUP DE MENSAGENS (From HEAD) ===
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
      "Estamos cientes da instabilidade e nossa equipe já está trabalhando na correção.",
      "Esse comportamento ocorre devido a uma atualização recente no sistema.",
      "Pedimos que limpe o cache e reinicie o sistema antes de tentar novamente."
    ];

    container.innerHTML = "";

    const fixedSection = document.createElement("div");
    fixedSection.innerHTML = `<h3 style="margin: 0 0 10px 0; color: #555; font-size: 14px;">Mensagens Fixas</h3>`;

    fixedMessages.forEach((msg, index) => {
      const messageCard = criarCardMensagem(msg, false, index);
      fixedSection.appendChild(messageCard);
    });

    container.appendChild(fixedSection);

    if (customMessages.length > 0) {
      const customSection = document.createElement("div");
      customSection.innerHTML = `<h3 style="margin: 20px 0 10px 0; color: #555; font-size: 14px;">Mensagens Personalizadas</h3>`;

      customMessages.forEach((msg, index) => {
        const messageCard = criarCardMensagem(msg, true, index, customMessages);
        customSection.appendChild(messageCard);
      });

      container.appendChild(customSection);
    } else {
      const emptyMsg = document.createElement("div");
      emptyMsg.style = "text-align: center; color: #666; padding: 20px; font-style: italic;";
      emptyMsg.textContent = "Nenhuma mensagem personalizada cadastrada.";
      container.appendChild(emptyMsg);
    }
  });
}

function criarCardMensagem(text, isCustom, index, customMessagesList) {
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

  const actionsDiv = document.createElement("div");
  actionsDiv.style = "display: flex; gap: 8px; justify-content: flex-end;";

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
    btnCopiar.innerHTML = "Copiado!";
    setTimeout(() => {
      btnCopiar.innerHTML = "Copiar";
    }, 1500);
  };

  const btnEnviar = document.createElement("button");
  btnEnviar.innerHTML = "Enviar";
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

  actionsDiv.appendChild(btnCopiar);
  actionsDiv.appendChild(btnEnviar);

  card.appendChild(textDiv);
  card.appendChild(actionsDiv);

  return card;
}

function enviarMensagemParaChat(mensagem) {
  console.log("Tentando enviar mensagem:", mensagem);

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
      console.log("Campo encontrado com seletor:", seletor, elemento);
      break;
    }
  }

  if (!textarea) {
    console.error("Campo de texto não encontrado com nenhum seletor!");

    const elementosEditaveis = document.querySelectorAll('[contenteditable="true"]');
    console.log("Elementos editáveis encontrados:", elementosEditaveis.length);

    if (elementosEditaveis.length > 0) {
      textarea = elementosEditaveis[0];
      console.log("Usando primeiro elemento editável:", textarea);
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

        console.log("Mensagem inserida no campo:", textarea.textContent);

      }, 100);

    } catch (error) {
      console.error("Erro ao inserir mensagem:", error);
    }
  } else {
    console.error("Campo de texto do chat não encontrado!");
    alert("Não foi possível encontrar o campo de texto do chat.");
  }
}


// === FUNÇÃO DO PAINEL DE CONSULTA DE DOCS (From Feature) ===
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
      position:fixed;
      bottom:130px;
      right:20px;
      z-index:999999;
      background:#fff;
      border:1px solid #ccc;
      border-radius:8px;
      width:360px;
      height: 500px;
      box-shadow:0 4px 15px rgba(0,0,0,0.2);
      font-family:Arial, sans-serif;
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

  // --- Event Listeners ---
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

  // Focar no input ao abrir
  setTimeout(() => inputBusca.focus(), 100);
}
