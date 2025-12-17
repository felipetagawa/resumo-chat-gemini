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
        const resp = await fetch("http://localhost:8080/api/gemini/resumir", {
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
          summary: json.summary
        };

        const history = storageData.history || [];
        history.push(novoItem);

        // Manter apenas os últimos 20
        if (history.length > 20) {
          history.shift();
        }

        await chrome.storage.local.set({ history });

        // 5. Sucesso
        enviarResposta({ resumo: json.summary });

      } catch (err) {
        enviarResposta({ erro: "Erro na comunicação: " + err.message });
      }
    })();

    return true; // mantém o canal aberto para sendResponse assíncrono
  }

  // =============== GERAR DICA ===============
  if (request.action === "gerarDica") {
    const { texto } = request;

    const enviarResposta = (data) => {
      if (sender.tab) {
        if (data.dica) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "exibirDica",
            dica: data.dica
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
        // Chamar API de Dica
        const resp = await fetch("http://localhost:8080/api/chamado/processar-dica", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto })
        });

        if (!resp.ok) {
          const erroText = await resp.text();
          enviarResposta({ erro: `HTTP ${resp.status}: ${erroText}` });
          return;
        }

        const json = await resp.json();
        enviarResposta({ dica: json });

      } catch (err) {
        enviarResposta({ erro: "Erro ao processar dica: " + err.message });
      }
    })();

    return true;
  }
});
