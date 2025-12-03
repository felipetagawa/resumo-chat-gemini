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

  if (request.action === "buscarSolucao") {
    const { texto } = request;

    const enviarResposta = (data) => {
      if (sender.tab) {
        if (data.solucao) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "exibirResumo",
            resumo: data.solucao,
            tipo: "solucao"
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
        // PASSO 1: Classificar o problema usando a API externa (Gemini)
        // Isso transforma o chat bagunçado em uma string de busca limpa (ex: "NFE - Erro de Duplicidade")
        const promptClassificacao = `
ATUE COMO UM SUPORTE TÉCNICO ESPECIALISTA.
Analise a conversa abaixo e identifique a CATEGORIA DO PROBLEMA (Ex: NFE, FINANCEIRO, ESTOQUE, VENDAS) e o TÍTULO DO ERRO.
Se não encontrar uma categoria clara, tente inferir pelo contexto.

Retorne APENAS uma linha no seguinte formato:
CATEGORIA: [Nome da Categoria] - ERRO: [Descrição curta do erro]

Exemplos:
CATEGORIA: NFE - ERRO: Duplicidade de Nota
CATEGORIA: FINANCEIRO - ERRO: Boleto não registrado

CONVERSA:
${texto}
        `.trim();

        const respClassificacao = await fetch("https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: promptClassificacao })
        });

        const jsonClassificacao = await respClassificacao.json();

        if (!respClassificacao.ok) {
          throw new Error("Falha na classificação inteligente: " + (jsonClassificacao.erro || respClassificacao.status));
        }

        const termoDeBusca = jsonClassificacao.resumo; // Ex: "CATEGORIA: NFE - ERRO: Duplicidade..."
        console.log("Termo classificado:", termoDeBusca);

        // PASSO 2: Buscar a solução no banco de dados local usando o termo classificado
        const respSolucao = await fetch("http://localhost:8080/api/gemini/solucao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: termoDeBusca })
        });

        const jsonSolucao = await respSolucao.json();

        if (!respSolucao.ok) {
          // Se o backend retornar 404 ou erro, tentamos mostrar o que o Gemini classificou pelo menos, ou o erro
          throw new Error(jsonSolucao.erro || `Erro no servidor local: ${respSolucao.status}`);
        }

        // Sucesso!
        enviarResposta({ solucao: jsonSolucao.solucao });

      } catch (err) {
        console.error("Erro no fluxo de solução:", err);
        enviarResposta({ erro: "Não foi possível encontrar solução. Detalhe: " + err.message });
      }
    })();

    return true;
  }
});
