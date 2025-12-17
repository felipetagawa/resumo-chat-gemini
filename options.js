document.addEventListener("DOMContentLoaded", async () => {
  const customInstructionsInput = document.getElementById("customInstructions");
  const status = document.getElementById("status");
  const historyList = document.getElementById("historyList");
  const btnLimpar = document.getElementById("limparHistorico");
  const fixedMessagesContainer = document.getElementById("fixedMessages");
  const customMessagesContainer = document.getElementById("customMessages");
  const newMessageInput = document.getElementById("newMessage");
  const openCredits = document.getElementById("openCredits");
  const creditsDialog = document.getElementById("creditsDialog");
  const closeCredits = document.getElementById("closeCredits");

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

  
  const FIXED_MESSAGES = [
    "Estamos cientes da instabilidade e nossa equipe já está trabalhando na correção.",
    "Esse comportamento ocorre devido a uma atualização recente no sistema.",
    "Pedimos que limpe o cache e reinicie o sistema antes de tentar novamente."
  ];

  FIXED_MESSAGES.forEach(msg => {
    fixedMessagesContainer.appendChild(createMessageCard(msg, false));
  });

  chrome.storage.local.get(["customMessages"], data => {
    renderCustomMessages(data.customMessages || []);
  });

  document.getElementById("addMessage").addEventListener("click", () => {
    const text = newMessageInput.value.trim();
    if (!text) return;

    chrome.storage.local.get(["customMessages"], data => {
      const list = data.customMessages || [];
      list.push(text);
      chrome.storage.local.set({ customMessages: list }, () => {
        newMessageInput.value = "";
        renderCustomMessages(list);
      });
    });
  });

  document.getElementById("backupMessages").addEventListener("click", () => {
    chrome.storage.local.get(["customMessages"], data => {
      const msgs = data.customMessages || [];
      if (msgs.length === 0) {
        alert("Nenhuma mensagem personalizada para backup.");
        return;
      }

      const content = msgs.join("\n\n---\n\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "mensagens_personalizadas.txt";
      a.click();

      URL.revokeObjectURL(url);
    });
  });

  function renderCustomMessages(messages) {
    customMessagesContainer.innerHTML = "";
    messages.forEach((msg, index) => {
      customMessagesContainer.appendChild(
        createMessageCard(msg, true, index, messages)
      );
    });
  }

  function createMessageCard(text, editable, index, list) {
    const div = document.createElement("div");
    div.className = `message-card ${editable ? "custom" : "fixed"}`;

    const p = document.createElement("div");
    p.className = "message-text";
    p.textContent = text;

    const actions = document.createElement("div");
    actions.className = "message-actions";

    const btnCopy = document.createElement("button");
    btnCopy.className = "btn-copy";
    btnCopy.textContent = "Copiar";
    btnCopy.onclick = () => navigator.clipboard.writeText(text);

    actions.appendChild(btnCopy);

    if (editable) {
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn-edit";
      btnEdit.textContent = "Editar";
      btnEdit.onclick = () => {
        const novo = prompt("Editar mensagem:", text);
        if (novo !== null) {
          list[index] = novo;
          chrome.storage.local.set({ customMessages: list }, () => {
            renderCustomMessages(list);
          });
        }
      };

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-delete";
      btnDelete.textContent = "Excluir";
      btnDelete.onclick = () => {
        list.splice(index, 1);
        chrome.storage.local.set({ customMessages: list }, () => {
          renderCustomMessages(list);
        });
      };

      actions.append(btnEdit, btnDelete);
    }

    div.append(p, actions);
    return div;
  }

  openCredits.addEventListener("click", (e) => {
    e.preventDefault();
    creditsDialog.showModal();
  });

  closeCredits.addEventListener("click", () => {
    creditsDialog.close();
  });
});
