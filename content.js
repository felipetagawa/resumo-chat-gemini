// content.js

// === LISTENER DE MENSAGENS ===
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

  return mensagens.slice(0, 4000);
}


// === FUNÇÃO DE EXIBIR O POPUP (ATUALIZADA) ===
function exibirResumo(texto) {
  const popupAntigo = document.getElementById("geminiResumoPopup");
  if (popupAntigo) popupAntigo.remove();

  // 1. Analisar Humor
  let humorIcon = "";
  const lowerText = texto.toLowerCase();
  if (lowerText.includes("humor do cliente:")) {
    // Tenta extrair a linha do humor
    const lines = texto.split("\n");
    const humorLine = lines.find(l => l.toLowerCase().includes("humor do cliente:")) || "";

    if (humorLine.match(/positivo|feliz|satisfeito|elogio/i)) humorIcon = "😊";
    else if (humorLine.match(/negativo|irritado|insatisfeito|reclama/i)) humorIcon = "😡";
    else if (humorLine.match(/neutro|normal|dúvida/i)) humorIcon = "😐";
  }

  const popup = document.createElement("div");
  popup.id = "geminiResumoPopup";
  popup.style = `
    position:fixed;
    bottom:130px;
    right:20px;
    z-index:999999;
    background:#fff;
    border:1px solid #ccc;
    border-radius:8px;
    padding:16px;
    width:360px;
    max-height:500px;
    overflow-y:auto;
    box-shadow:0 4px 15px rgba(0,0,0,0.2);
    font-family:Arial, sans-serif;
    font-size: 14px;
    display: flex;
    flex-direction: column;
  `;

  popup.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <b style="font-size:16px;">Resumo Gerado ${humorIcon}</b>
      <button id="fecharResumoFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
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
    "></pre>

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

  popup.querySelector("pre").innerText = texto;
  document.body.appendChild(popup);

  // Eventos
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
    a.download = `resumo-atendimento-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}