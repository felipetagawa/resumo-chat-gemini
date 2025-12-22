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
      background: #fff;
      border: 1px solid #dadce0;
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
        <b style="font-size:16px; color:#3c4043;">📚 Consultar Documentação</b>
        <button id="fecharDocsFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <input 
          type="text" 
          id="inputBuscaDocs" 
          placeholder="Digite sua dúvida..."
          style="flex:1; padding:10px; border:1px solid #dadce0; border-radius:6px; font-size:14px;"
        />
        <button 
          id="btnBuscarDocs" 
          style="background:#1a73e8; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:600;"
        >Buscar</button>
      </div>

      <div 
        id="resultadosDocs" 
        style="flex:1; overflow-y:auto; padding:12px; background:#f8f9fa; border:1px solid #e0e0e0; border-radius:6px; min-height:200px;"
      >
        <p style="color:#999; text-align:center">Digite uma dúvida e clique em Buscar</p>
      </div>
    `;

        document.body.appendChild(popup);

        popup.querySelector("#fecharDocsFlutuante").addEventListener("click", () => popup.remove());

        const inputBusca = popup.querySelector("#inputBuscaDocs");
        const btnBuscar = popup.querySelector("#btnBuscarDocs");
        const resultadosDiv = popup.querySelector("#resultadosDocs");

        async function realizarBusca() {
            const query = inputBusca.value.trim();

            if (!query) {
                resultadosDiv.innerHTML = '<p style="color:#999; text-align:center">Digite uma dúvida para buscar</p>';
                return;
            }

            btnBuscar.disabled = true;
            btnBuscar.textContent = "Buscando...";
            resultadosDiv.innerHTML = '<p style="color:#999; text-align:center">🔍 Buscando documentação...</p>';

            try {
                const response = await MessagingHelper.send({
                    action: "buscarDoc",
                    query: query
                });

                if (response && response.resultado) {
                    resultadosDiv.innerHTML = `
            <div style="background:white; padding:12px; border-radius:6px; border:1px solid #e0e0e0;">
              <div style="color:#444; line-height:1.6; white-space:pre-wrap;">${response.resultado}</div>
            </div>
          `;
                } else if (response && response.erro) {
                    resultadosDiv.innerHTML = `<p style="color:#d32f2f;">Erro: ${response.erro}</p>`;
                } else {
                    resultadosDiv.innerHTML = '<p style="color:#999;">Nenhum resultado encontrado</p>';
                }
            } catch (error) {
                resultadosDiv.innerHTML = `<p style="color:#d32f2f;">Erro: ${error.message}</p>`;
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
