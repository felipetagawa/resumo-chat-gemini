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
  const customCount = document.getElementById("customCount");
  const manualCallHistoryList = document.getElementById("manualCallHistoryList");
  const btnLimparManual = document.getElementById("limparHistoricoManual");

  inicializarAcordeons();

  chrome.storage.local.get(["customInstructions", "history", "chamado_manual_history", "buttonVisibility"], (data) => {
    if (data.customInstructions) {
      customInstructionsInput.value = data.customInstructions;
    }

    // Carregar visibilidade dos botões
    const visibility = data.buttonVisibility || {};
    document.getElementById("checkBtnResumo").checked = visibility.btnResumo !== false;
    document.getElementById("checkBtnMessages").checked = visibility.btnMessages !== false;
    document.getElementById("checkBtnAgenda").checked = visibility.btnAgenda !== false;
    document.getElementById("checkBtnChamadoManual").checked = visibility.btnChamadoManual !== false;
    document.getElementById("checkBtnAssistenteIA").checked = visibility.btnAssistenteIA !== false;

    renderHistory(data.history || []);
    renderManualCallHistory(data.chamado_manual_history || []);
  });

  document.getElementById("salvar").addEventListener("click", () => {
    const instructions = customInstructionsInput.value.trim();

    chrome.storage.local.set({ customInstructions: instructions }, () => {
      status.textContent = "✅ Configurações salvas!";
      status.style.color = "green";
      setTimeout(() => { status.textContent = ""; }, 2000);
    });
  });

  // Salvar Visibilidade
  document.getElementById("salvarVisibilidade").addEventListener("click", () => {
    const visibility = {
      btnResumo: document.getElementById("checkBtnResumo").checked,
      btnMessages: document.getElementById("checkBtnMessages").checked,
      btnAgenda: document.getElementById("checkBtnAgenda").checked,
      btnChamadoManual: document.getElementById("checkBtnChamadoManual").checked,
      btnAssistenteIA: document.getElementById("checkBtnAssistenteIA").checked
    };

    chrome.storage.local.set({ buttonVisibility: visibility }, () => {
      const statusVis = document.getElementById("statusVisibilidade");
      statusVis.textContent = "✅ Preferências de visibilidade salvas! Recarregue a página para aplicar.";
      statusVis.style.color = "green";
      setTimeout(() => { statusVis.textContent = ""; }, 3000);
    });
  });

  btnLimpar.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja apagar todo o histórico de resumos?")) {
      chrome.storage.local.set({ history: [] }, () => {
        renderHistory([]);
        status.textContent = "🗑️ Histórico de resumos limpo.";
        setTimeout(() => { status.textContent = ""; }, 2000);
      });
    }
  });

  btnLimparManual.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja apagar todo o histórico de chamados manuais?")) {
      chrome.storage.local.set({ chamado_manual_history: [] }, () => {
        renderManualCallHistory([]);
        status.textContent = "🗑️ Histórico de chamados limpo.";
        setTimeout(() => { status.textContent = ""; }, 2000);
      });
    }
  });

  function renderHistory(history) {
    historyList.innerHTML = "";

    if (!history || history.length === 0) {
      historyList.innerHTML = "<div class='empty-history'>Nenhum resumo salvo ainda.</div>";
      return;
    }

    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

    sortedHistory.forEach(item => {
      const li = document.createElement("li");
      li.className = "history-item";

      const dateStr = new Date(item.timestamp).toLocaleString("pt-BR");

      li.innerHTML = `
        <div class="history-info" style="flex: 1; min-width: 0;">
          <div class="history-date" style="font-size: 11px; color: #666;">${dateStr}</div>
          <div class="history-preview" title="${item.summary}" style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.summary}</div>
        </div>
        <div class="history-actions" style="margin-left: 10px;">
          <button class="btn-copy">Copiar</button>
          <button class="btn-view">Ver</button>
        </div>
      `;

      li.querySelector(".btn-copy").addEventListener("click", () => {
        navigator.clipboard.writeText(item.summary);
        const btn = li.querySelector(".btn-copy");
        const originalText = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(() => btn.textContent = originalText, 1500);
      });

      li.querySelector(".btn-view").addEventListener("click", () => {
        alert("Resumo Completo:\n\n" + item.summary);
      });

      historyList.appendChild(li);
    });
  }

  function renderManualCallHistory(history) {
    manualCallHistoryList.innerHTML = "";

    if (!history || history.length === 0) {
      manualCallHistoryList.innerHTML = "<div class='empty-history'>Nenhum chamado salvo ainda.</div>";
      return;
    }

    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

    sortedHistory.forEach(item => {
      const li = document.createElement("li");
      li.className = "history-item";

      const dateStr = new Date(item.timestamp).toLocaleString("pt-BR");
      const previewText = item.text.replace(/\n/g, " ").substring(0, 100) + "...";

      li.innerHTML = `
        <div class="history-info" style="flex: 1; min-width: 0;">
          <div class="history-date" style="font-size: 11px; color: #666;">${dateStr}</div>
          <div class="history-preview" title="${item.text.replace(/"/g, '&quot;')}" style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${previewText}</div>
        </div>
        <div class="history-actions" style="margin-left: 10px;">
          <button class="btn-copy">Copiar</button>
          <button class="btn-view">Ver</button>
        </div>
      `;

      li.querySelector(".btn-copy").addEventListener("click", () => {
        navigator.clipboard.writeText(item.text);
        const btn = li.querySelector(".btn-copy");
        const originalText = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(() => btn.textContent = originalText, 1500);
      });

      li.querySelector(".btn-view").addEventListener("click", () => {
        alert("Detalhes do Chamado:\n\n" + item.text);
      });

      manualCallHistoryList.appendChild(li);
    });
  }

  const FIXED_MESSAGES = [
    "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações.",
    "Atualmente, a fase inicial da Reforma Tributária com IBS e CBS se aplica apenas às empresas do regime normal (Lucro Presumido e Lucro Real), sendo que para o Simples Nacional não há recolhimento nem impacto prático neste primeiro ano, pois as informações são utilizadas apenas de forma nominativa e experimental.",
    "A reformulação das telas não altera a lógica de cálculo nem as regras fiscais do sistema, sendo uma evolução voltada à melhoria contínua, e qualquer diferença percebida está relacionada apenas à interface ou fluxo, com nossa equipe disponível para esclarecer dúvidas e ajustar eventuais pontos específicos.",
    "As telas reformuladas de Contas a Receber, Contas a Pagar, NFC-e e Cadastro de Produtos mantêm as mesmas regras fiscais e operacionais de antes, tendo sido alterados apenas aspectos visuais e funcionais para melhorar usabilidade e organização, sem impacto nos cálculos ou validações já existentes.",
    "A emissão de NFC-e para CNPJ deixou de ser permitida por determinação das normas fiscais vigentes, não sendo uma regra criada pelo sistema, que apenas aplica automaticamente essa exigência legal para evitar rejeições e problemas fiscais ao contribuinte.",
    "O procedimento de referenciar NFC-e em uma NF-e não é mais aceito pela legislação fiscal atual, motivo pelo qual o sistema bloqueia essa prática, garantindo conformidade legal e evitando a rejeição dos documentos junto à SEFAZ.",
    "A vedação à emissão de NFC-e para CNPJ e ao seu referenciamento em NF-e decorre exclusivamente de alterações nas regras fiscais, e o sistema apenas segue essas determinações para manter a regularidade das operações e evitar inconsistências legais."
  ];

  FIXED_MESSAGES.forEach((msg, index) => {
    fixedMessagesContainer.appendChild(createMessageCard(msg, false, index));
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
        abrirAcordeon('customAccordion');
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

  document.getElementById("limparTodosAtalhos")?.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja remover todos os atalhos configurados?")) {
      chrome.storage.local.remove("messageShortcuts", () => {
        const status = document.getElementById("statusAtalhos");
        status.textContent = "✅ Todos os atalhos foram removidos!";
        status.style.color = "green";

        chrome.storage.local.get(["customMessages"], data => {
          const customMessages = data.customMessages || [];
          renderCustomMessages(customMessages);

          fixedMessagesContainer.innerHTML = "";
          FIXED_MESSAGES.forEach((msg, index) => {
            fixedMessagesContainer.appendChild(createMessageCard(msg, false, index));
          });
        });

        setTimeout(() => {
          status.textContent = "";
        }, 3000);
      });
    }
  });

  function renderCustomMessages(messages) {
    customMessagesContainer.innerHTML = "";
    messages.forEach((msg, index) => {
      customMessagesContainer.appendChild(
        createMessageCard(msg, true, index, messages)
      );
    });

    customCount.textContent = messages.length;
  }

  function createMessageCard(text, editable, index, list) {
    const div = document.createElement("div");
    div.className = `message-card ${editable ? "custom" : "fixed"}`;

    const p = document.createElement("div");
    p.className = "message-text";
    p.textContent = text;

    const bottomRow = document.createElement("div");
    bottomRow.className = "message-bottom-row";
    bottomRow.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #eee;
    `;

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const btnCopy = document.createElement("button");
    btnCopy.className = "btn-copy";
    btnCopy.textContent = "Copiar";
    btnCopy.style.cssText = `
        background: #dbeafe;
        color: #1e40af;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 70px;
    `;

    btnCopy.onclick = () => {
      navigator.clipboard.writeText(text);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = "Copiado!";
      btnCopy.style.background = "#34A853";
      btnCopy.style.color = "white";
      setTimeout(() => {
        btnCopy.textContent = originalText;
        btnCopy.style.background = "#dbeafe";
        btnCopy.style.color = "#1e40af";
      }, 1500);
    };

    buttonsContainer.appendChild(btnCopy);

    if (editable) {
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn-edit";
      btnEdit.textContent = "Editar";
      btnEdit.style.cssText = `
            background: #e0f2fe;
            color: #0369a1;
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
            min-width: 70px;
        `;
      btnEdit.onclick = () => {
        const novo = prompt("Editar mensagem:", text);
        if (novo !== null) {
          list[index] = novo;
          chrome.storage.local.set({ customMessages: list }, () => {
            chrome.storage.local.get(["customMessages"], data => {
              renderCustomMessages(data.customMessages || []);
            });
          });
        }
      };

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-delete";
      btnDelete.textContent = "Excluir";
      btnDelete.style.cssText = `
            background: #fee2e2;
            color: #dc2626;
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
            min-width: 70px;
        `;
      btnDelete.onclick = () => {
        if (confirm("Tem certeza que deseja excluir esta mensagem?")) {
          const shortcutKey = `custom_${index}`;

          list.splice(index, 1);
          chrome.storage.local.set({ customMessages: list }, () => {
            // Sincronizar atalhos
            chrome.storage.local.get(["messageShortcuts"], (data) => {
              const shortcuts = data.messageShortcuts || {};
              const cleanShortcuts = {};

              Object.keys(shortcuts).forEach(key => {
                if (key.startsWith("fixed_")) {
                  cleanShortcuts[key] = shortcuts[key];
                } else if (key.startsWith("custom_")) {
                  const idx = parseInt(key.split("_")[1]);
                  if (idx < index) {
                    cleanShortcuts[key] = shortcuts[key];
                  } else if (idx > index) {
                    cleanShortcuts[`custom_${idx - 1}`] = shortcuts[key];
                  }
                }
              });

              chrome.storage.local.set({ messageShortcuts: cleanShortcuts }, () => {
                chrome.storage.local.get(["customMessages"], data => {
                  renderCustomMessages(data.customMessages || []);
                });
              });
            });
          });
        }
      };

      buttonsContainer.append(btnEdit, btnDelete);
    }

    const shortcutConfig = document.createElement("div");
    shortcutConfig.className = "shortcut-config";
    shortcutConfig.style.cssText = `
        display: flex;
        align-items: center;
        gap: 5px;
    `;

    const shortcutLabel = document.createElement("span");
    shortcutLabel.textContent = "Atalho: /";
    shortcutLabel.style.cssText = "color: #666; font-size: 12px;";

    const shortcutInput = document.createElement("input");
    shortcutInput.type = "text";
    shortcutInput.maxLength = "1";
    shortcutInput.style.cssText = `
        width: 40px;
        padding: 4px;
        border: 1px solid #ccc;
        border-radius: 4px;
        text-align: center;
        font-family: monospace;
        font-weight: bold;
        font-size: 13px;
        text-transform: uppercase;
    `;

    shortcutInput.addEventListener('wheel', (e) => e.preventDefault());

    shortcutInput.addEventListener('input', () => {
      let value = shortcutInput.value.toUpperCase();
      const isValid = /^[A-Z0-9]$/.test(value);

      if (!isValid && value !== "") {
        const lastChar = value.split('').find(char => /^[A-Z0-9]$/.test(char));
        shortcutInput.value = lastChar || "";
      } else {
        shortcutInput.value = value;
      }
    });

    shortcutInput.addEventListener('keydown', (e) => {
      if (e.key.length === 1 && !/^[a-zA-Z0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });

    const shortcutKey = editable ? `custom_${index}` : `fixed_${index}`;

    chrome.storage.local.get(["messageShortcuts"], (data) => {
      const shortcuts = data.messageShortcuts || {};
      const savedValue = shortcuts[shortcutKey];
      if (savedValue) {
        shortcutInput.value = typeof savedValue === 'string' ? savedValue.toUpperCase() : savedValue.toString();
      } else {
        shortcutInput.value = "";
      }
    });

    shortcutInput.addEventListener('change', () => {
      let value = shortcutInput.value.trim().toUpperCase();

      if (value && /^[A-Z0-9]$/.test(value)) {
        chrome.storage.local.get(["messageShortcuts"], (data) => {
          const shortcuts = data.messageShortcuts || {};

          let isDuplicate = false;
          for (const [key, savedValue] of Object.entries(shortcuts)) {
            const compareValue = typeof savedValue === 'string' ? savedValue.toUpperCase() : savedValue.toString();
            if (key !== shortcutKey && compareValue === value) {
              isDuplicate = true;
              break;
            }
          }

          if (isDuplicate) {
            alert("Este atalho já está sendo usado por outra mensagem!");
            chrome.storage.local.get(["messageShortcuts"], (data2) => {
              const shortcuts2 = data2.messageShortcuts || {};
              const savedValue = shortcuts2[shortcutKey];
              shortcutInput.value = savedValue ?
                (typeof savedValue === 'string' ? savedValue.toUpperCase() : savedValue.toString()) :
                "";
            });
          } else {
            shortcuts[shortcutKey] = value;
            chrome.storage.local.set({ messageShortcuts: shortcuts });
          }
        });
      } else if (value === "") {
        chrome.storage.local.get(["messageShortcuts"], (data) => {
          const shortcuts = data.messageShortcuts || {};
          delete shortcuts[shortcutKey];
          chrome.storage.local.set({ messageShortcuts: shortcuts });
        });
      }
    });

    shortcutConfig.appendChild(shortcutLabel);
    shortcutConfig.appendChild(shortcutInput);
    bottomRow.appendChild(buttonsContainer);
    bottomRow.appendChild(shortcutConfig);

    div.appendChild(p);
    div.appendChild(bottomRow);

    return div;
  }

  function inicializarAcordeons() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const targetId = header.getAttribute('data-target');
        const content = document.getElementById(targetId);
        const icon = header.querySelector('.accordion-icon');

        if (content.classList.contains('open')) {
          content.classList.remove('open');
          header.classList.remove('open');
          icon.textContent = '+';
        } else {
          content.classList.add('open');
          header.classList.add('open');
          icon.textContent = '−';
        }
      });
    });
  }

  function abrirAcordeon(accordionId) {
    const accordion = document.getElementById(accordionId);
    const header = accordion.querySelector('.accordion-header');
    const content = document.getElementById(header.getAttribute('data-target'));
    const icon = header.querySelector('.accordion-icon');

    if (!content.classList.contains('open')) {
      content.classList.add('open');
      header.classList.add('open');
      icon.textContent = '−';
    }
  }

  openCredits.addEventListener("click", (e) => {
    e.preventDefault();
    creditsDialog.showModal();
  });

  closeCredits.addEventListener("click", () => {
    creditsDialog.close();
  });
});
