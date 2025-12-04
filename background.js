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
ATUE COMO UM ESPECIALISTA EM SUPORTE TÉCNICO DE SOFTWARE ERP.

Analise a conversa de atendimento abaixo e identifique a CATEGORIA do problema e as palavras-chave mais relevantes.

CATEGORIAS VÁLIDAS (escolha UMA):
- NFE: Nota Fiscal Eletrônica, emissão de notas, SEFAZ, XML, certificado digital, danfe
- NFCE: Nota Fiscal de Consumidor Eletrônica, cupom fiscal eletrônico
- CTE: Conhecimento de Transporte Eletrônico
- VENDAS: PDV, frente de caixa, orçamento, pedido de venda, forma de pagamento, desconto
- FINANCEIRO: Contas a pagar/receber, boleto, fluxo de caixa, conciliação bancária
- ESTOQUE: Controle de estoque, movimentação, inventário, saldo, produtos
- OUTROS: Problemas que não se encaixam nas categorias acima

INSTRUÇÕES:
1. Identifique a categoria que melhor se encaixa no problema
2. Extraia as 3-5 palavras-chave mais importantes do problema
3. Retorne APENAS no formato: CATEGORIA palavra1 palavra2 palavra3
4. NÃO inclua prefixos como "Busca:", "Categoria:", etc.
5. Se o problema for sobre PDV, Frente de Caixa, Cupom Fiscal ou Pagamentos, use VENDAS
6. Se for sobre emissão de notas, use NFE ou NFCE conforme o caso

EXEMPLOS:
Entrada: "Cliente com erro ao emitir NFe, aparece rejeição 539"
Saída: NFE erro rejeição 539

Entrada: "Boleto não está sendo registrado no banco"
Saída: FINANCEIRO boleto registro banco

Entrada: "Produto com saldo negativo no estoque"
Saída: ESTOQUE saldo negativo produto

Entrada: "Como configurar forma de pagamento no PDV"
Saída: VENDAS forma pagamento PDV configurar

CONVERSA DO ATENDIMENTO:
${texto}

RESPOSTA (categoria + palavras-chave):`.trim();

        const respClassificacao = await fetch("https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: promptClassificacao })
        });

        const jsonClassificacao = await respClassificacao.json();

        if (!respClassificacao.ok) {
          throw new Error("Falha na classificação inteligente: " + (jsonClassificacao.erro || respClassificacao.status));
        }

        const termoDeBusca = jsonClassificacao.resumo.trim();
        console.log("Termo de busca gerado pelo Gemini:", termoDeBusca);

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
