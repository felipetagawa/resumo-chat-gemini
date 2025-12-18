// background.js (service worker)
const API_BASE_URL = "http://localhost:8080";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Helper para enviar resposta de volta (tab ou popup)
  const responder = (data) => {
    if (sender.tab && request.fromTab) { // Se veio de uma aba (content script)
      // Podemos responder diretamente via sendResponse se for síncrono ou chrome.tabs.sendMessage se fluxo complexo
      // Aqui, vamos tentar usar sendResponse se o canal estiver aberto, mas para chamadas async longas, 
      // às vezes é melhor mandar mensagem direta.
      // O padrão aqui será usar sendResponse para simplificar, já que retornamos true no listener.
      sendResponse(data);
    } else {
      sendResponse(data);
    }
  };

  // === 1. GERAR RESUMO ===
  if (request.action === "gerarResumo") {
    (async () => {
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

        // Salvar localmente no histórico
        const novoItem = { timestamp: Date.now(), summary: json.resumo };
        const history = storageData.history || [];
        history.push(novoItem);
        if (history.length > 20) history.shift();
        await chrome.storage.local.set({ history });

        // Enviar sucesso
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "exibirResumo", resumo: json.resumo });
        } else {
          sendResponse({ resumo: json.resumo });
        }

      } catch (err) {
        if (sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "exibirErro", erro: "Erro na comunicação: " + err.message });
        } else {
          sendResponse({ erro: "Erro: " + err.message });
        }
      }
    })();
    return true; // Keep channel open
  }

  // === 2. GERAR DICA (Merged from new-feature-solution) ===
  if (request.action === "gerarDica") {
    const { texto } = request;

    const enviarRespostaDica = (data) => {
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
        // Chamar API de Dica - Using API_BASE_URL
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

  // === 3. BUSCAR DOCUMENTAÇÃO (Docs Search) ===
  if (request.action === "buscarDocumentacao") {
    (async () => {
      try {
        const { termo } = request;
        const url = new URL(`${API_BASE_URL}/api/docs/search`);

        if (termo) url.searchParams.append('query', termo);
        // Filtro de categoria
        url.searchParams.append('categoria', 'manuais');

        const resp = await fetch(url.toString());
        if (!resp.ok) throw new Error(`Erro na API (${resp.status})`);

        const data = await resp.json();
        // data deve ser [{id, content, metadata}, ...]
        sendResponse({ sucesso: true, docs: data });
      } catch (err) {
        console.error("Erro buscarDocumentacao:", err);
        sendResponse({ sucesso: false, erro: err.toString() });
      }
    })();
    return true;
  }

  // === 4. SALVAR RESUMO COMO SOLUÇÃO (Manual Save) ===
  if (request.action === "salvarResumo") {
    (async () => {
      try {
        const { titulo, conteudo } = request;
        const resp = await fetch(`${API_BASE_URL}/api/gemini/salvar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, conteudo })
        });

        if (!resp.ok) throw new Error(`Erro ao salvar (${resp.status})`);

        // Se a API retornar JSON, podemos ler, mas o importante é o status 200
        const data = await resp.json().catch(() => ({}));
        sendResponse({ sucesso: true, data });
      } catch (err) {
        console.error("Erro salvarResumo:", err);
        sendResponse({ sucesso: false, erro: err.toString() });
      }
    })();
    return true;
  }

  // === 5. SUGERIR DOCUMENTAÇÃO (Debug Endpoint) ===
  if (request.action === "sugerirDocumentacao") {
    (async () => {
      try {
        const { resumo } = request;

        const resp = await fetch(`${API_BASE_URL}/api/gemini/documentacoes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumo })
        });

        if (!resp.ok) throw new Error(`Erro na API (${resp.status})`);

        const data = await resp.json();
        // Endpoint novo retorna: { documentacoesSugeridas: [...] }
        sendResponse({ sucesso: true, docs: data.documentacoesSugeridas || [] });
      } catch (err) {
        console.error("Erro sugerirDocumentacao:", err);
        sendResponse({ sucesso: false, erro: err.toString() });
      }
    })();
    return true;
  }
});
