const SummaryModule = (() => {
  const POPUP_IDS = ["geminiResumoPopup", "geminiDicaPopup"];
  let fecharAoClicarForaInstalado = false;

  // Fecha os popups ao pressionar fora deles, como os outros painéis.
  // Usa mousedown (não click) para que arrastar uma seleção de texto para fora
  // do popup, ou o clique sintético do link de "Salvar .txt", não o feche.
  function instalarFecharAoClicarFora() {
    if (fecharAoClicarForaInstalado) return;
    fecharAoClicarForaInstalado = true;
    document.addEventListener("mousedown", (event) => {
      POPUP_IDS.forEach((id) => {
        const popup = document.getElementById(id);
        if (popup && !popup.contains(event.target)) popup.remove();
      });
    }, true);
  }

  // O resumo pode repetir mensagens do cliente: vira texto antes de ganhar negrito e quebras.
  function escaparHtml(texto) {
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatarResumoComNegrito(texto) {
    let html = escaparHtml(texto)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/(\*\*[A-ZÁÉÍÓÚÃÕÇ\/\s]+\*\*)/g, '<br><br>$1<br>')
      .replace(/\n/g, '<br>')
      .replace(/^<br><br>/, '');

    return html;
  }

  function formatarResumoParaCopiar(texto) {
    let formatado = texto.replace(/\*\*/g, '');

    formatado = formatado.replace(/([A-ZÁÉÍÓÚÃÕÇ\/\s]+:)(\s*)/g, '\n\n$1 ');
    formatado = formatado.replace(/^\s+|\s+$/g, '');
    formatado = formatado.replace(/\n{3,}/g, '\n\n');
    formatado = formatado.replace(/^\n+/, '');

    return formatado.trim();
  }

  function exibirResumo(texto, clientNameOverride = null, tipo = "resumo") {
    DOMHelpers.removeElement("geminiResumoPopup");

    let humorIcon = "";
    if (tipo === "resumo") {
      const lowerText = texto.toLowerCase();
      if (lowerText.includes("humor do cliente:")) {
        const lines = texto.split("\n");
        const humorLine = lines.find(l => l.toLowerCase().includes("humor do cliente:")) || "";
        if (humorLine.match(/positivo|feliz|satisfeito|elogio/i)) humorIcon = "😊";
        else if (humorLine.match(/negativo|irritado|insatisfeito|reclama/i)) humorIcon = "😡";
        else if (humorLine.match(/neutro|normal|dúvida/i)) humorIcon = "😐";
      }
    }

    const titulo = tipo === "solucao" ? "Solução sugerida" : `Resumo gerado ${humorIcon}`.trim();

    const conteudoFormatado = formatarResumoComNegrito(texto);

    // Save to storage (History of 5)
    chrome.storage.local.get(['summary_history'], (result) => {
      const history = result.summary_history || [];
      const now = new Date();

      let clientName = clientNameOverride;

      // Fallback if not provided or if it's the placeholder "Cliente"
      if (!clientName || clientName === "Cliente") {
        clientName = `Atendimento ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const nameMatch = texto.match(/(?:Cliente|Nome):\s*([^\n\r*]+)/i);
        if (nameMatch) {
          clientName = nameMatch[1].trim();
        }
      }

      const newEntry = {
        text: texto,
        timestamp: now.getTime(),
        clientName: clientName,
        source: "ai"
      };

      // Add to front, keep max 5
      history.unshift(newEntry);
      if (history.length > 5) history.pop();

      chrome.storage.local.set({
        summary_history: history,
        last_summary: newEntry
      });
    });

    const popup = document.createElement("div");
    popup.id = "geminiResumoPopup";
    popup.className = "gemini-pop";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", titulo);

    popup.innerHTML = `
      <div class="gemini-pop-head">
        <div class="gemini-pop-title">${titulo}</div>
        <button id="fecharResumoFlutuante" type="button" class="gemini-pop-close" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div id="conteudoResumo" class="gemini-pop-body"></div>
      <div class="gemini-pop-actions">
        <button id="exportarResumo" type="button" class="gemini-pop-btn">Salvar .txt</button>
        <button id="copiarResumoFlutuante" type="button" class="gemini-pop-btn gemini-pop-btn-primary">Copiar resumo</button>
      </div>
    `;

    popup.querySelector("#conteudoResumo").innerHTML = conteudoFormatado;
    document.body.appendChild(popup);
    instalarFecharAoClicarFora();

    popup.querySelector("#fecharResumoFlutuante").addEventListener("click", () => popup.remove());

    popup.querySelector("#copiarResumoFlutuante").addEventListener("click", () => {
      const textoParaCopiar = formatarResumoParaCopiar(texto);
      navigator.clipboard.writeText(textoParaCopiar);

      const btn = popup.querySelector("#copiarResumoFlutuante");
      btn.textContent = "Copiado";
      btn.classList.add("is-done");
      setTimeout(() => {
        btn.textContent = "Copiar resumo";
        btn.classList.remove("is-done");
      }, 2000);
    });

    popup.querySelector("#exportarResumo").addEventListener("click", () => {
      const textoFormatado = formatarResumoParaCopiar(texto);
      const blob = new Blob([textoFormatado], { type: "text/plain" });
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

  function exibirDica(dicaData) {
    DOMHelpers.removeElement("geminiDicaPopup");

    let conteudo = "";

    const problemDetected = dicaData.problemDetected || dicaData.detectedProblem || "undefined";
    const moduleDetected = dicaData.moduleDetected || dicaData.detectedModule || "undefined";
    const similarCalls = dicaData.SimilarTagsFound || dicaData.similarCallsFound || 0;
    const solutions = dicaData.solutionsAnalyzed || 0;
    const tips = dicaData.tips || [];
    const status = dicaData.status || "";

    conteudo += `PROBLEMA DETECTADO:\n${problemDetected}\n\n`;
    conteudo += `MÓDULO: ${moduleDetected}\n\n`;

    conteudo += `CHAMADOS RELACIONADOS: ${similarCalls}\n\n`;
    conteudo += `SOLUÇÕES ANALISADAS: ${solutions}\n\n`;

    if (status) {
      conteudo += `STATUS: ${status}\n\n`;
    }

    if (tips && tips.length > 0) {
      tips.forEach((dica) => {
        conteudo += `${dica}\n\n`;
      });
    } else {
      if (status === "NO_HISTORY") {
        conteudo += `Não foram encontrados chamados históricos relacionados a este módulo.\n\n`;
        conteudo += `O problema foi analisado e categorizado automaticamente.\n`;
        conteudo += `Consulte a solução apresentada no resumo para verificar os passos recomendados.`;
      } else if (status === "NO_SIMILARITY") {
        conteudo += `Foram encontrados ${similarCalls} chamados no módulo, mas nenhum com problema similar.\n\n`;
        conteudo += `O problema parece ser específico ou com características únicas.\n`;
        conteudo += `Consulte a solução apresentada no resumo para verificar os passos recomendados.`;
      } else {
        conteudo += `Análise concluída. Não foram geradas dicas específicas para este problema.`;
      }
    }

    const popup = document.createElement("div");
    popup.id = "geminiDicaPopup";
    popup.className = "gemini-pop";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Dicas inteligentes");

    popup.innerHTML = `
      <div class="gemini-pop-head">
        <div class="gemini-pop-title">Dicas inteligentes</div>
        <button id="fecharDicaFlutuante" type="button" class="gemini-pop-close" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div id="conteudoDica" class="gemini-pop-body gemini-pop-pre"></div>
    `;

    popup.querySelector("#conteudoDica").innerHTML = formatarResumoComNegrito(conteudo);
    document.body.appendChild(popup);
    instalarFecharAoClicarFora();

    popup.querySelector("#fecharDicaFlutuante").addEventListener("click", () => popup.remove());
  }

  return {
    exibirResumo,
    exibirDica,
    formatarResumoComNegrito,
    formatarResumoParaCopiar
  };
})();

window.SummaryModule = SummaryModule;
