// background.js (service worker)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "gerarResumo") {
    const { texto } = request;

    // Função para enviar resposta (para popup ou content script)
    const enviarResposta = (data) => {
      if (sender.tab) {
        // Veio de content script (content.js)
        // O content.js espera { action: "..." }
        if (data.resumo) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "exibirResumo",
            resumo: data.resumo
          });
        } else if (data.erro) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "exibirErro",
            erro: data.erro
          });
        }
      } else {
        // Veio de popup (popup.js)
        // O popup.js espera { resumo: "..." } ou { erro: "..." } no callback
        sendResponse(data);
      }
    };


    (async () => {
      try {
        // Chama sua API Java (local)
        const resp = await fetch("https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto })
        });

        const json = await resp.json();

        if (!resp.ok) {
          enviarResposta({ erro: json.erro || `HTTP ${resp.status}` });
          return;
        }

        // sucesso
        enviarResposta({ resumo: json.resumo });
      } catch (err) {
        enviarResposta({ erro: "Erro na comunicação: " + err.message });
      }
    })();

    return true; // mantém o canal aberto para sendResponse assíncrono
  }
});