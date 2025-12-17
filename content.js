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


  // Botão Consultar Docs
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


  container.appendChild(botaoDocs);
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
      // Filtros básicos de msgs automáticas
      return t && !t.startsWith("automático");
    })
    .join("\n");

  return mensagens;
}


// === FUNÇÃO DE EXIBIR O POPUP (RESUMO) - Auto-Save ===
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
    border:1px solid #ccc;
    border-radius:8px;
    padding:16px;
    width:380px;
    max-height:600px;
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
    </div>
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

// === FUNÇÃO DO PAINEL DE CONSULTA DE DOCS ===
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
            const conteudo = doc.content ? doc.content.substring(0, 150) + "..." : "";

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


