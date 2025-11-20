// background.js (service worker)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "gerarResumo") {
    const { texto } = request;

    // Função para enviar resposta (para popup ou content script)
    const enviarResposta = (data) => {
      if (sender.tab) {
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
        sendResponse(data);
      }
    };

    (async () => {
      try {
        // 1. Buscar instruções personalizadas
        const storageData = await chrome.storage.local.get(["customInstructions", "history"]);
        const customInstructions = storageData.customInstructions || "";

        // 2. Montar o prompt final
        let textoFinal = texto;
        if (customInstructions.trim()) {
          textoFinal = `INSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customInstructions}\n\n---\n\nHISTÓRICO DO CHAT:\n${texto}`;
        }

        // 3. Chamar API Java
        const resp = await fetch("https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: textoFinal })
        });

        const json = await resp.json();

        if (!resp.ok) {
          enviarResposta({ erro: json.erro || `HTTP ${resp.status}` });
          return;
        }

        // 4. Salvar no Histórico
        const novoItem = {
          timestamp: Date.now(),
          summary: json.resumo
        };

        const history = storageData.history || [];
        history.push(novoItem);

        // Manter apenas os últimos 20
        if (history.length > 20) {
          history.shift();
        }

        await chrome.storage.local.set({ history });

        // 5. Sucesso
        enviarResposta({ resumo: json.resumo });

      } catch (err) {
        enviarResposta({ erro: "Erro na comunicação: " + err.message });
      }
    })();

    return true; // mantém o canal aberto para sendResponse assíncrono
  }
});