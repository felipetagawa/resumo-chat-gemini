const SummaryModule = (() => {
    function formatarResumoComNegrito(texto) {
        let html = texto
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

    function exibirResumo(texto, tipo = "resumo") {
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

        const titulo = tipo === "solucao" ? "Solução Sugerida" : `Resumo Gerado ${humorIcon}`;

        const conteudoFormatado = formatarResumoComNegrito(texto);

        const popup = document.createElement("div");
        popup.id = "geminiResumoPopup";
        popup.style = `
      position:fixed;
      bottom:130px;
      right:20px;
      z-index:999999;
      background:#fff;
      border:1px solid #dadce0;
      border-radius:8px;
      padding:16px;
      width:380px;
      max-height:500px;
      overflow-y:auto;
      box-shadow:0 4px 15px rgba(0,0,0,0.15);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size:14px;
      display:flex;
      flex-direction:column;
    `;

        popup.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <b style="font-size:16px; color:#3c4043;">${titulo}</b>
        <button id="fecharResumoFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
      </div>
      <div id="conteudoResumo" style="
        padding: 12px;
        background: #f9f9f9;
        border: 1px solid #eee;
        border-radius: 4px;
        font-family: 'Segoe UI', sans-serif;
        flex: 1;
        overflow-y: auto;
        margin-bottom: 12px;
        line-height: 1.5;
        color: #333;
      "></div>

      <div style="display:flex; gap:8px;">
        <button id="copiarResumoFlutuante" style="
          flex: 1; padding: 8px; background: #fff;
          color: #3c4043; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; font-weight:500; font-family: 'Segoe UI', sans-serif;
        ">📋 Copiar</button>
        <button id="exportarResumo" style="
          flex: 1; padding: 8px; background: #fff;
          color: #3c4043; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; font-weight:500; font-family: 'Segoe UI', sans-serif;
        ">💾 Salvar .txt</button>
      </div>
    `;

        popup.querySelector("#conteudoResumo").innerHTML = conteudoFormatado;
        document.body.appendChild(popup);

        popup.querySelector("#fecharResumoFlutuante").addEventListener("click", () => popup.remove());

        popup.querySelector("#copiarResumoFlutuante").addEventListener("click", () => {
            const textoParaCopiar = formatarResumoParaCopiar(texto);
            navigator.clipboard.writeText(textoParaCopiar);

            const btn = popup.querySelector("#copiarResumoFlutuante");
            const original = btn.textContent;
            btn.textContent = "✅ Copiado!";
            btn.style.background = "#34A853";
            setTimeout(() => {
                btn.textContent = original;
                btn.style.background = "#4285F4";
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

        conteudo += `**PROBLEMA DETECTADO:**\n${problemDetected}\n\n`;
        conteudo += `**MÓDULO:** ${moduleDetected}\n\n`;

        conteudo += `**CHAMADOS RELACIONADOS:** ${similarCalls}\n\n`;
        conteudo += `**SOLUÇÕES ANALISADAS:** ${solutions}\n\n`;

        if (status) {
            conteudo += `**STATUS:** ${status}\n\n`;
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
        popup.style = `
      position:fixed;
      bottom:130px;
      right:20px;
      z-index:999999;
      background:#fff;
      border:1px solid #dadce0;
      border-radius:8px;
      padding:16px;
      width:400px;
      max-height:500px;
      overflow-y:auto;
      box-shadow:0 4px 15px rgba(0,0,0,0.15);
      font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      display: flex;
      flex-direction: column;
    `;

        popup.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <b style="font-size:16px; color:#3c4043;">💡 Dicas Inteligentes</b>
        <button id="fecharDicaFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer; color:#5f6368;">&times;</button>
      </div>
      <div id="conteudoDica" style="
        padding: 10px;
        background: #f8f9fa;
        border: 1px solid #eee;
        border-radius: 4px;
        font-family: 'Segoe UI', sans-serif;
        flex: 1;
        overflow-y: auto;
        margin-bottom: 12px;
        white-space: pre-wrap;
        line-height: 1.4;
        color: #333;
      "></div>
    `;

        popup.querySelector("#conteudoDica").innerHTML = formatarResumoComNegrito(conteudo);
        document.body.appendChild(popup);

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
