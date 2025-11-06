// content.js

// === LISTENER DE MENSAGENS (igual ao anterior) ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const botaoResumo = document.getElementById("btnResumoGemini");
  if (botaoResumo) {
    botaoResumo.disabled = false;
    botaoResumo.textContent = "🧠 Gerar Relatório";
  }

  if (request.action === "exibirResumo") {
    exibirResumo(request.resumo);
  } else if (request.action === "exibirErro") {
    alert("Erro: " + request.erro);
  }
});

// === NOVO: VERIFICADOR DE PÁGINA E URL ===
// URL exata onde os botões devem aparecer
const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";

// Verifica a URL a cada 2 segundos. Mais robusto para SPAs (Single Page Apps)
setInterval(() => {
  const botoesExistem = document.getElementById("containerBotoesGemini");
  
  // Usamos startsWith para incluir URLs com parâmetros (ex: /agent?id=123)
  const urlAtualCorreta = window.location.href.startsWith(TARGET_URL);

  if (urlAtualCorreta && !botoesExistem) {
    // Se estamos na URL correta e os botões NÃO existem, crie-os.
    criarBotoesFlutuantes();
  } else if (!urlAtualCorreta && botoesExistem) {
    // Se NÃO estamos na URL correta e os botões EXISTEM, remova-os.
    botoesExistem.remove();
    
    // Opcional: remover o popup de resumo se existir
    const popup = document.getElementById("geminiResumoPopup");
    if (popup) popup.remove();
  }
}, 2000); // Verifica a cada 2 segundos


// === FUNÇÃO DE CRIAR BOTÕES (igual ao anterior) ===
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
      background: "#fff",
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

  container.appendChild(botaoCopiar);
  container.appendChild(botaoResumo);
  document.body.appendChild(container);
}


// === MUDANÇA PRINCIPAL AQUI ===
function capturarTextoChat() {
  // Seleciona somente as mensagens da conversa visível
  const mensagensDOM = document.querySelectorAll(".msg");

  if (!mensagensDOM.length) {
    alert("Nenhuma mensagem encontrada no chat aberto.");
    return "";
  }

  // Mapeia o texto de cada mensagem visível
  const mensagens = Array.from(mensagensDOM)
    .map(msg => {
      const nome = msg.querySelector(".name")?.innerText?.trim() || "";
      const texto = msg.querySelector(".message span")?.innerText?.trim() || "";
      if (!texto) return null;
      return `${nome ? nome + ": " : ""}${texto}`;
    })
    .filter(Boolean) // remove nulos
    .filter(linha => {
      const t = linha.toLowerCase();
      // Ignora mensagens automáticas ou vazias
      return t && !t.startsWith("automático");
    })
    .join("\n");

  // Limite de segurança (Gemini aceita até 4096 tokens)
  return mensagens.slice(0, 4000);
}



// === FUNÇÃO DE EXIBIR O POPUP (igual ao anterior) ===
function exibirResumo(texto) {
  const popupAntigo = document.getElementById("geminiResumoPopup");
  if (popupAntigo) popupAntigo.remove();

  const popup = document.createElement("div");
  popup.id = "geminiResumoPopup"; 
  popup.style = `
    position:fixed;
    bottom:130px; /* Ajustado para ficar acima dos botões */
    right:20px;
    z-index:999999;
    background:#fff;
    border:1px solid #ccc;
    border-radius:8px;
    padding:16px;
    width:340px;
    max-height:400px;
    overflow-y:auto;
    box-shadow:0 2px 10px rgba(0,0,0,0.2);
    font-family:Arial;
    font-size: 14px;
  `;

  popup.innerHTML = `
    <b style="font-size:16px;">Resumo Gerado:</b>
    <pre style="
      white-space:pre-wrap;
      margin-top:12px;
      margin-bottom:16px;
      padding: 8px;
      background: #f9f9f9;
      border: 1px solid #eee;
      border-radius: 4px;
      font-family: monospace;
      max-height: 250px;
      overflow-y: auto;
    "></pre>
    <div style="display:flex; gap:8px;">
      <button id="copiarResumoFlutuante" style="
        flex: 1; padding: 8px 12px; background: #4285F4;
        color: #fff; border: none; border-radius: 6px; cursor: pointer;
      ">📋 Copiar Resumo</button>
      <button id="fecharResumoFlutuante" style="
        flex: 0; padding: 8px 12px; background: #eee;
        color: #333; border: 1px solid #ccc; border-radius: 6px; cursor: pointer;
      ">Fechar</button>
    </div>
  `;

  popup.querySelector("pre").innerText = texto;
  document.body.appendChild(popup);

  popup.querySelector("#fecharResumoFlutuante").addEventListener("click", () => {
    popup.remove();
  });

  popup.querySelector("#copiarResumoFlutuante").addEventListener("click", () => {
    navigator.clipboard.writeText(texto);
    const btn = popup.querySelector("#copiarResumoFlutuante");
    btn.textContent = "✅ Copiado!";
    setTimeout(() => {
      btn.textContent = "📋 Copiar Resumo";
    }, 2000);
  });
}

// REMOVIDO:
// window.addEventListener("load", () => setTimeout(criarBotoesFlutuantes, 2000));
// A nova lógica setInterval() acima substitui isso.