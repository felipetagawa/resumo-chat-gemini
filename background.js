// background.js
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "gerarResumo") {
    const { texto } = request;

    // Função inteligente para enviar a resposta
    const enviarResposta = (data) => {
      if (sender.tab) {
        // Veio da PÁGINA (content.js)
        const action = data.erro ? "exibirErro" : "exibirResumo";
        chrome.tabs.sendMessage(sender.tab.id, { action, ...data });
      } else {
        // Veio do POPUP (popup.js)
        sendResponse(data);
      }
    };

    // --- Lógica da API ---

    const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");
    if (!geminiApiKey) {
      enviarResposta({ erro: "API key do Gemini não configurada. Vá em Opções." });
      return true;
    }

    try {
      // === PROMPT ATUALIZADO ===
      const prompt = `
**Instrução Importante: Analise a conversa inteira, do início ao fim.** Ignore todas as mensagens do bot "Automatico". Foque apenas no cliente e no atendente humano.

Analise o atendimento abaixo e resuma-o de forma concisa e direta, seguindo *exatamente* este formato:

**PROBLEMA / DÚVIDA:** [Descreva em uma frase qual foi o problema ou dúvida principal do cliente, incluindo dados-chave como o número da nota, se houver.]
**SOLUÇÃO APRESENTADA:** [Descreva os passos da solução de forma direta (ex: Atendente identificou o prazo, cancelou a nota, duplicou, corrigiu os dados e autorizou a nova).]
**OPORTUNIDADE DE UPSELL:** [Responda apenas 'NÃO' ou 'SIM'.]
**PRINTS DE ERRO OU DE MENSAGENS RELEVANTES:** [Responda apenas 'Não' ou 'Sim'.]
**HUMOR DO CLIENTE:** [Descreva o humor em uma palavra (ex: Bom, Neutro, Irritado) e justifique brevemente (ex: "Bom. Foi objetivo e agradeceu no final.")]

ATENDIMENTO:
${texto}
      `;
      // === FIM DO PROMPT ===

      // Usando o v1 e 'gemini-1.5-flash'
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            // --- ADIÇÃO IMPORTANTE ---
            // Isso garante que a IA seja mais objetiva (temperature)
            // e tenha espaço de sobra para o resumo (maxOutputTokens).
            generationConfig: {
              temperature: 0.3, // Deixa a resposta mais "direta" e menos "criativa"
              maxOutputTokens: 2048 // Aumenta o limite de tokens da *resposta*
            }
            // --- FIM DA ADIÇÃO ---
          })
        }
      );

      if (!response.ok) {
        let errorMsg = `Erro HTTP: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData?.error?.message || JSON.stringify(errorData);
        } catch (e) {
          errorMsg = `${errorMsg} - ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      
      // Verificação de segurança: Checar se a API truncou a resposta
      const finishReason = data?.candidates?.[0]?.finishReason;
      if (finishReason === "MAX_TOKENS") {
          throw new Error("Erro: A resposta da API foi cortada por exceder o limite de tokens. O resumo pode estar incompleto.");
      }

      const resumo = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!resumo) {
        throw new Error("Erro: A API não retornou um resumo.");
      }

      // Sucesso
      enviarResposta({ resumo: resumo });

    } catch (err) {
      // Erro
      enviarResposta({ erro: "Erro ao chamar API: " + err.message });
    }

    return true; // Manter canal aberto
  }
});