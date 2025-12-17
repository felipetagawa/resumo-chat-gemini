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
    console.log("Exibindo resumo:", request.resumo);
    exibirResumo(request.resumo, "resumo");
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

  const botaoResumo = document.createElement("button");
  botaoResumo.id = "btnResumoGemini";
  botaoResumo.textContent = "🧠 Gerar Relatório";
  Object.assign(botaoResumo.style, estiloBotao);
  Object.assign(botaoResumo.style, {
    background: "#fff",
    color: "#4285F4",
    border: "1px solid #4285F4",
  });

  botaoResumo.addEventListener("click", async () => {
    botaoResumo.disabled = true;
    botaoResumo.textContent = "⏳ Pensando...";

    const texto = capturarTextoChat();
    if (!texto) {
      alert("Não foi possível capturar o texto do chat.");
      botaoResumo.disabled = false;
      botaoResumo.textContent = "🧠 Gerar Relatório";
      return;
    }
    chrome.runtime.sendMessage({ action: "gerarResumo", texto });
  });

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
      return t && !t.startsWith("automático");
    })
    .join("\n");

  return mensagens;
}


// === FUNÇÃO DE EXIBIR O POPUP ===
function exibirResumo(texto, tipo = "resumo") {
  const popupAntigo = document.getElementById("geminiResumoPopup");
  if (popupAntigo) popupAntigo.remove();

  // 1. Analisar Humor (apenas se for resumo)
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
  border:2px solid #4285F4; /* BORDA AZUL */
  border-radius:8px;
  padding:16px;
  width:380px;
  max-height:500px;
  overflow-y:auto;
  box-shadow:0 4px 15px rgba(66,133,244,0.35); /* SOMBRA AZUL */
  font-family:Arial, sans-serif;
  font-size:14px;
  display:flex;
  flex-direction:column;
`;


  popup.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <b style="font-size:16px; color:#4285F4;">${titulo}</b>
      <button id="fecharResumoFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
    </div>
    
    <div id="conteudoResumo" style="
      padding: 12px;
      background: #f9f9f9;
      border: 1px solid #eee;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      flex: 1;
      overflow-y: auto;
      margin-bottom: 12px;
      line-height: 1.5;
    "></div>

    <div style="display:flex; gap:8px;">
      <button id="copiarResumoFlutuante" style="
        flex: 1; padding: 8px; background: #4285F4;
        color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight:bold;
      ">📋 Copiar</button>
      
      <button id="exportarResumo" style="
        flex: 1; padding: 8px; background: #34A853;
        color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight:bold;
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

  // === EXIBIR DICA ===
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

// === FUNÇÃO PARA MOSTRAR POPUP DE MENSAGENS ===
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