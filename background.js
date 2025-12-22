const API_BASE_URL = "http://localhost:8080";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const responder = (data) => {
    if (sender.tab && request.fromTab) {
      sendResponse(data);
    } else {
      sendResponse(data);
    }
  };

  if (request.action === "gerarResumo") {
    const handleGerarResumo = async () => {
      try {
        const { texto } = request;
        const storageData = await chrome.storage.local.get(["customInstructions", "history"]);
        const customInstructions = storageData.customInstructions || "";

        let textoFinal = texto;
        if (customInstructions.trim()) {
          textoFinal = `INSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customInstructions}\n\n---\n\nHISTÓRICO DO CHAT:\n${texto}`;
        }

        const resp = await fetch(`${API_BASE_URL}/api/gemini/resumir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: textoFinal })
        });

        const json = await resp.json();

        if (!resp.ok) {
          if (sender.tab) {
            chrome.tabs.sendMessage(sender.tab.id, { action: "exibirErro", erro: json.erro || `HTTP ${resp.status}` });
          } else {
            sendResponse({ erro: json.erro || `HTTP ${resp.status}` });
          }
          return;
        }

        const resumoTexto = json.summary || json.resumo;

        const novoItem = { timestamp: Date.now(), summary: resumoTexto };
        const history = storageData.history || [];
        history.push(novoItem);
        if (history.length > 20) history.shift();
        await chrome.storage.local.set({ history });

        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "exibirResumo", resumo: resumoTexto });
          sendResponse({ success: true, resumo: resumoTexto });
        } else {
          sendResponse({ resumo: resumoTexto });
        }

      } catch (err) {
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "exibirErro", erro: "Erro: " + err.message });
        }
        sendResponse({ erro: "Erro: " + err.message });
      }
    };
    handleGerarResumo();
    return true;
  }

  if (request.action === "gerarDica") {
    const { texto } = request;

    const enviarRespostaDica = (data) => {
      sendResponse(data);
    };

    (async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/chamado/processar-dica`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto })
        });

        if (!resp.ok) {
          const erroText = await resp.text();
          enviarRespostaDica({ erro: `HTTP ${resp.status}: ${erroText}` });
          return;
        }

        const json = await resp.json();
        enviarRespostaDica({ dica: json });

      } catch (err) {
        enviarRespostaDica({ erro: "Erro ao processar dica: " + err.message });
      }
    })();

    return true;
  }

  if (request.action === "buscarDocumentacao") {
    (async () => {
      try {
        const { query } = request;
        const url = new URL(`${API_BASE_URL}/api/docs/search`);

        if (query) url.searchParams.append('query', query);
        url.searchParams.append('categoria', 'manuais');

        const resp = await fetch(url.toString());
        if (!resp.ok) throw new Error(`Erro na API (${resp.status})`);

        const data = await resp.json();
        sendResponse({ sucesso: true, resultado: data });
      } catch (err) {
        console.error("Erro buscarDocumentacao:", err);
        sendResponse({ sucesso: false, erro: err.toString() });
      }
    })();
    return true;
  }

});
