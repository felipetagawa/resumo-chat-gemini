const DocsModule = (() => {
  function exibirPainelConsultaDocs() {
    DOMHelpers.removeElement("geminiDocsPopup");

    const popup = document.createElement("div");
    popup.id = "geminiDocsPopup";
    popup.style = `
      position: fixed;
      bottom: 130px;
      right: 20px;
      z-index: 999999;
      background: var(--ai-surface);
      border: 1px solid var(--ai-border-strong);
      border-radius: 8px;
      padding: 16px;
      width: 450px;
      max-height: 500px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
    `;

    popup.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <b style="font-size:16px; color:var(--ai-text);">📚 Consultar Documentação</b>
        <button id="fecharDocsFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer; color:var(--ai-text-secondary);">&times;</button>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <input 
          type="text" 
          id="inputBuscaDocs" 
          placeholder="Digite sua dúvida..."
          style="flex:1; color:var(--ai-text); background:var(--ai-surface); padding:10px; border:1px solid var(--ai-border-strong); border-radius:6px; font-size:14px;"
        />
        <button 
          id="btnBuscarDocs" 
          style="background:var(--ai-primary); color:var(--ai-on-primary); border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:600;"
        >Buscar</button>
      </div>

      <div 
        id="resultadosDocs" 
        style="flex:1; overflow-y:auto; padding:12px; background:var(--ai-surface-muted); border:1px solid var(--ai-border); border-radius:6px; min-height:200px;"
      >
        <p style="color:var(--ai-text-muted); text-align:center">Digite uma dúvida e clique em Buscar</p>
      </div>
    `;

    document.body.appendChild(popup);
    globalThis.ThemeModule?.apply?.(popup);

    popup.querySelector("#fecharDocsFlutuante").addEventListener("click", () => popup.remove());

    const inputBusca = popup.querySelector("#inputBuscaDocs");
    const btnBuscar = popup.querySelector("#btnBuscarDocs");
    const resultadosDiv = popup.querySelector("#resultadosDocs");

    async function realizarBusca() {
      const query = inputBusca.value.trim();

      if (!query) {
        resultadosDiv.innerHTML = '<p style="color:var(--ai-text-muted); text-align:center">Digite uma dúvida para buscar</p>';
        return;
      }

      btnBuscar.disabled = true;
      btnBuscar.textContent = "Buscando...";
      resultadosDiv.innerHTML = '<p style="color:var(--ai-text-muted); text-align:center">🔍 Buscando documentação...</p>';

      try {
        const response = await MessagingHelper.send({
          action: "buscarDocumentacao",
          query: query
        });

        console.log("Resposta da busca de docs:", response);

        if (response && response.sucesso && response.resultado) {
          let resultado = response.resultado;

          // Se for um array, pega o primeiro item (ou concatena se necessário, mas por enquanto vamos focar no primeiro que tiver conteúdo)
          if (Array.isArray(resultado) && resultado.length > 0) {
            resultado = resultado[0];
          }

          // Extrair o conteúdo
          let textoExibir = '';
          if (typeof resultado === 'string') {
            textoExibir = resultado;
          } else if (resultado.content) {
            textoExibir = resultado.content;
          } else if (resultado.resposta) {
            textoExibir = resultado.resposta;
          } else if (resultado.answer) {
            textoExibir = resultado.answer;
          } else {
            // Caso falhe em encontrar os campos esperados, tenta mostrar o objeto formatado para debug ou fallback
            textoExibir = JSON.stringify(resultado, null, 2);
          }

          // Formatar o texto: substituir \n por quebras de linha HTML
          const textoFormatado = textoExibir.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');

          resultadosDiv.innerHTML = `
            <div style="background:var(--ai-surface); padding:12px; border-radius:6px; border:1px solid var(--ai-border);">
              <div style="color:var(--ai-text); line-height:1.6;">${textoFormatado}</div>
            </div>
          `;
        } else if (response && response.erro) {
          resultadosDiv.innerHTML = `<p style="color:var(--ai-danger);">Erro: ${response.erro}</p>`;
        } else {
          console.log("Resposta sem resultado esperado:", response);
          resultadosDiv.innerHTML = '<p style="color:var(--ai-text-muted);">Nenhum resultado encontrado</p>';
        }
      } catch (error) {
        console.error("Erro ao buscar documentação:", error);
        resultadosDiv.innerHTML = `<p style="color:var(--ai-danger);">Erro: ${error.message}</p>`;
      } finally {
        btnBuscar.disabled = false;
        btnBuscar.textContent = "Buscar";
      }
    }

    btnBuscar.addEventListener("click", realizarBusca);
    inputBusca.addEventListener("keypress", (e) => {
      if (e.key === "Enter") realizarBusca();
    });

    setTimeout(() => inputBusca.focus(), 100);
  }

  return {
    exibirPainelConsultaDocs
  };
})();

window.DocsModule = DocsModule;
