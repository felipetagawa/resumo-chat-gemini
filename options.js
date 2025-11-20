document.addEventListener("DOMContentLoaded", async () => {
  const customInstructionsInput = document.getElementById("customInstructions");
  const status = document.getElementById("status");
  const historyList = document.getElementById("historyList");
  const btnLimpar = document.getElementById("limparHistorico");

  // 1. Carregar Configurações
  chrome.storage.local.get(["customInstructions", "history"], (data) => {
    if (data.customInstructions) {
      customInstructionsInput.value = data.customInstructions;
    }
    renderHistory(data.history || []);
  });

  // 2. Salvar Configurações
  document.getElementById("salvar").addEventListener("click", () => {
    const instructions = customInstructionsInput.value.trim();

    chrome.storage.local.set({ customInstructions: instructions }, () => {
      status.textContent = "✅ Configurações salvas!";
      status.style.color = "green";
      setTimeout(() => { status.textContent = ""; }, 2000);
    });
  });

  // 3. Limpar Histórico
  btnLimpar.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja apagar todo o histórico?")) {
      chrome.storage.local.set({ history: [] }, () => {
        renderHistory([]);
        status.textContent = "🗑️ Histórico limpo.";
      });
    }
  });

  // Função para renderizar a lista
  function renderHistory(history) {
    historyList.innerHTML = "";

    if (!history || history.length === 0) {
      historyList.innerHTML = "<div class='empty-history'>Nenhum resumo salvo ainda.</div>";
      return;
    }

    // Ordenar do mais recente para o mais antigo
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

    sortedHistory.forEach(item => {
      const li = document.createElement("li");
      li.className = "history-item";

      const dateStr = new Date(item.timestamp).toLocaleString("pt-BR");

      li.innerHTML = `
        <div class="history-info">
          <div class="history-date">${dateStr}</div>
          <div class="history-preview" title="${item.summary}">${item.summary}</div>
        </div>
        <div class="history-actions">
          <button class="btn-copy">Copiar</button>
          <button class="btn-view">Ver</button>
        </div>
      `;

      // Evento Copiar
      li.querySelector(".btn-copy").addEventListener("click", () => {
        navigator.clipboard.writeText(item.summary);
        const btn = li.querySelector(".btn-copy");
        const originalText = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(() => btn.textContent = originalText, 1500);
      });

      // Evento Ver
      li.querySelector(".btn-view").addEventListener("click", () => {
        alert("Resumo Completo:\n\n" + item.summary);
      });

      historyList.appendChild(li);
    });
  }
});
