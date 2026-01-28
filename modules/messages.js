const MessagesModule = (() => {

    function toggleMensagens() {
        const existente = document.getElementById("popupMensagensPadrao");
        if (existente) {
            existente.remove();
        } else {
            carregarEMostrarMensagens();
        }
    }

    async function carregarEMostrarMensagens() {
        const popup = criarPopupMensagens();
        document.body.appendChild(popup);

        const data = await StorageHelper.get(["customMessages", "messageShortcuts", "atendeai_user_sector", "atendeai_user_name"]);
        const customMessagesList = data.customMessages || [];
        const shortcuts = data.messageShortcuts || {};
        const sector = data.atendeai_user_sector || "suporte";
        const name = data.atendeai_user_name || "";

        renderizarMensagens(popup, customMessagesList, shortcuts, sector, name);
    }

    function criarPopupMensagens() {
        const popup = document.createElement("div");
        popup.id = "popupMensagensPadrao";
        popup.style = `
      position: fixed;
      bottom: 130px;
      right: 20px;
      z-index: 999999;
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 0;
      width: 450px;
      max-height: 600px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
    `;

        popup.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid #eee;">
        <b style="font-size:16px; color:#3c4043;">Mensagens Padrão</b>
        <button id="fecharMensagensFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
      </div>
      <div id="conteudoMensagens" style="flex:1; overflow-y:auto; padding:16px;"></div>
    `;

        popup.querySelector("#fecharMensagensFlutuante").addEventListener("click", () => popup.remove());

        return popup;
    }

    function resolveTemplate(text, name) {
        const safe = String(name || "").trim();
        const finalName = safe ? safe : "Atendente";
        return String(text || "").replaceAll("{{NOME}}", finalName);
    }

    const SUPPORT_FIXED_MESSAGES = [
        "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações.",
        "Atualmente, a fase inicial da Reforma Tributária com IBS e CBS se aplica apenas às empresas do regime normal (Lucro Presumido e Lucro Real), sendo que para o Simples Nacional não há recolhimento nem impacto prático neste primeiro ano, pois as informações são utilizadas apenas de forma nominativa e experimental."
    ];

    const PRE_FIXED_MESSAGES = [
        { text: "Bom dia, tudo bem?\nEu sou o atendente {{NOME}} do pré atendimento do suporte da Soften Sistema, como posso te ajudar?" },
        { text: "Boa tarde, tudo bem?\nEu sou o atendente {{NOME}} do pré atendimento do suporte da Soften Sistema, como posso te ajudar?" },
        { text: "Você pode me informar seu NOME, seu EMAIL e seu ID AnyDesk, caso não possua, acesse o nosso site em seu computador https://anydesk.com/pt por gentileza, irei verificar com um técnico especializado para te auxiliar." },
        { text: "Caso não possua, poderia realizar o download do AnyDesk por gentileza: https://anydesk.com/pt" },
        { text: "Só um momento, irei verificar um técnico para te auxiliar e assim que estiver disponível encaminharei seu atendimento." },
        { text: "Estou finalizando o atendimento pois não obtive resposta, qualquer dúvida entre em contato com a Soften!" },
        { text: "Disponha, precisando estamos a disposição\nTenha um ótimo dia! 🙂" }
    ];

    function renderizarMensagens(popup, customMessagesList, shortcuts = {}, sector = "suporte", name = "") {
        const container = popup.querySelector("#conteudoMensagens");
        const isPre = sector === "preatendimento";

        const fixedMessages = isPre ? PRE_FIXED_MESSAGES.map(m => resolveTemplate(m.text, name)) : SUPPORT_FIXED_MESSAGES;

        const fixedAcordeon = UIBuilder.criarAcordeon("📌 Mensagens Fixas", true, "acordeon-fixas");

        fixedMessages.forEach((msg, index) => {
            const key = `fixed_${index}`;
            const shortcut = shortcuts[key];
            const card = criarCardMensagem(msg, false, shortcut, index);
            fixedAcordeon.content.appendChild(card);
        });
        container.appendChild(fixedAcordeon.container);

        if (!isPre) {
            const customAcordeon = UIBuilder.criarAcordeon(`✨ Mensagens Personalizadas (${customMessagesList.length})`, true, "acordeon-custom");

            // Adicionar botão de nova mensagem no header do acordeon ou logo abaixo
            const btnAdd = document.createElement("button");
            btnAdd.innerHTML = "Nova Mensagem";
            btnAdd.style = `
                margin: 4px 0 10px 0;
                background: #e8f0fe;
                color: #1a73e8;
                border: 1px solid #d2e3fc;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                width: 100%;
                transition: all 0.2s;
            `;
            btnAdd.onmouseover = () => btnAdd.style.background = "#d2e3fc";
            btnAdd.onmouseout = () => btnAdd.style.background = "#e8f0fe";

            btnAdd.onclick = () => {
                UIBuilder.criarModalFormulario({
                    title: 'Cadastrar Nova Mensagem',
                    fields: [
                        {
                            name: 'shortcut',
                            label: 'Atalho Opcional',
                            type: 'text',
                            required: false,
                            value: '',
                            placeholder: 'Ex: aviso'
                        },
                        {
                            name: 'message',
                            label: 'Mensagem',
                            type: 'textarea',
                            required: true,
                            value: '',
                            placeholder: 'Digite a mensagem...'
                        }
                    ],
                    onSave: async (formData) => {
                        const newShortcut = formData.shortcut ? String(formData.shortcut).trim() : "";
                        const newMessage = formData.message;

                        if (!newMessage) return;

                        const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
                        const customs = data.customMessages || [];
                        const shortcuts = data.messageShortcuts || {};

                        // Validar duplicação de atalho
                        if (newShortcut) {
                            const normalizedNew = newShortcut.toLowerCase();
                            const duplicate = Object.values(shortcuts).some(value =>
                                String(value).toLowerCase() === normalizedNew
                            );

                            if (duplicate) {
                                alert("Este atalho já está sendo usado por outra mensagem!");
                                return;
                            }
                        }

                        customs.push(newMessage);
                        const newIndex = customs.length - 1;

                        if (newShortcut) {
                            // Salvar atalho se fornecido
                            shortcuts[`custom_${newIndex}`] = newShortcut;
                        }

                        await StorageHelper.set({
                            customMessages: customs,
                            messageShortcuts: shortcuts
                        });

                        // Reload
                        toggleMensagens();
                        toggleMensagens();
                    }
                });
            };

            customAcordeon.content.appendChild(btnAdd);

            if (customMessagesList.length === 0) {
                const emptyMsg = document.createElement("p");
                emptyMsg.style = "color:#999; text-align:center; padding:20px; font-size:13px;";
                emptyMsg.innerText = "Nenhuma mensagem personalizada.";
                customAcordeon.content.appendChild(emptyMsg);
            } else {
                customMessagesList.forEach((msg, index) => {
                    const key = `custom_${index}`;
                    const shortcut = shortcuts[key];
                    const card = criarCardMensagem(msg, true, shortcut, index);
                    customAcordeon.content.appendChild(card);
                });
            }
            container.appendChild(customAcordeon.container);
        }
    }

    function criarCardMensagem(text, isCustom, shortcut = null, index = -1) {
        const card = document.createElement("div");
        card.style = `
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    `;

        const shortcutBadge = shortcut ? `<span style="background:#1a73e8; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:11px; margin-right:8px; color:#ffffff; box-shadow: 0 2px 4px rgba(26,115,232,0.3); border: 1px solid #1557b0;">/${shortcut}</span>` : '';

        card.innerHTML = `
      <div style="font-size:13px; color:#333; line-height:1.4; padding-right: 20px;">
        ${shortcutBadge}
        ${text}
      </div>
      <div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end; align-items:center;">
        ${isCustom ? `<button class="btn-excluir" style="background:transparent; border:none; color:#d93025; font-size:12px; cursor:pointer; margin-right:auto;">Excluir</button>` : ''}
        <button class="btn-enviar" style="background:#1a73e8; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px;">Enviar</button>
        <button class="btn-copiar" style="background:#f1f3f4; color:#3c4043; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px;">Copiar</button>
      </div>
    `;

        // Adicionar campo de atalho para TODAS as mensagens (fixas e personalizadas)
        const shortcutConfig = document.createElement("div");
        shortcutConfig.style.cssText = "margin-top:10px; padding-top:10px; border-top:1px solid #e0e0e0; display:flex; align-items:center; gap:6px;";

        const shortcutLabel = document.createElement("span");
        shortcutLabel.textContent = "Atalho: /";
        shortcutLabel.style.cssText = "color:#666; font-size:12px; font-weight:700;";

        const shortcutInput = document.createElement("input");
        shortcutInput.type = "text";
        shortcutInput.maxLength = 20;
        shortcutInput.placeholder = "ex: bomdia";
        shortcutInput.value = shortcut || "";
        shortcutInput.style.cssText = `
            width:180px;
            padding:6px 8px;
            border:1px solid #ccc;
            border-radius:6px;
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-weight:800;
            font-size:13px;
        `;

        shortcutInput.addEventListener("change", async () => {
            const newShortcut = shortcutInput.value.trim();
            const data = await StorageHelper.get(["messageShortcuts"]);
            const shortcuts = data.messageShortcuts || {};

            const targetKey = isCustom ? `custom_${index}` : `fixed_${index}`;

            // Validar duplicação
            if (newShortcut) {
                const normalizedNew = newShortcut.toLowerCase();
                const duplicate = Object.entries(shortcuts).some(([key, value]) => {
                    if (key === targetKey) return false; // Ignorar o próprio
                    return String(value).toLowerCase() === normalizedNew;
                });

                if (duplicate) {
                    alert("Este atalho já está sendo usado por outra mensagem!");
                    shortcutInput.value = shortcuts[targetKey] || "";
                    return;
                }

                shortcuts[targetKey] = newShortcut;
            } else {
                delete shortcuts[targetKey];
            }

            await StorageHelper.set({ messageShortcuts: shortcuts });

            // Recarregar para atualizar badge
            toggleMensagens();
            toggleMensagens();
        });

        shortcutConfig.appendChild(shortcutLabel);
        shortcutConfig.appendChild(shortcutInput);
        card.appendChild(shortcutConfig);

        if (isCustom) {
            const btnDelete = card.querySelector(".btn-excluir");
            const btnEdit = document.createElement("button");
            btnEdit.textContent = "Editar";
            btnEdit.className = "btn-editar";
            btnEdit.style.cssText = "background:transparent; border:none; color:#1a73e8; font-size:12px; cursor:pointer; margin-right:8px;";

            // Inserir botão Editar ao lado do Excluir
            btnDelete.parentNode.insertBefore(btnEdit, btnDelete);

            btnEdit.addEventListener("click", async (e) => {
                e.stopPropagation();

                const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
                const messages = data.customMessages || [];
                const shortcuts = data.messageShortcuts || {};

                const currentMessage = messages[index];
                const currentShortcut = shortcuts[`custom_${index}`] || "";

                UIBuilder.criarModalFormulario({
                    title: 'Editar Mensagem Personalizada',
                    fields: [
                        {
                            name: 'shortcut',
                            label: 'Atalho Opcional',
                            type: 'text',
                            required: false,
                            value: currentShortcut,
                            placeholder: 'Ex: aviso'
                        },
                        {
                            name: 'message',
                            label: 'Mensagem',
                            type: 'textarea',
                            required: true,
                            value: currentMessage,
                            placeholder: 'Digite a mensagem...'
                        }
                    ],
                    onSave: async (formData) => {
                        const newShortcut = formData.shortcut ? String(formData.shortcut).trim() : "";
                        const newMessage = formData.message;

                        if (!newMessage) return;

                        const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
                        const messages = data.customMessages || [];
                        const shortcuts = data.messageShortcuts || {};

                        // Validar duplicação de atalho (se mudou)
                        if (newShortcut && newShortcut !== currentShortcut) {
                            const normalizedNew = newShortcut.toLowerCase();
                            const duplicate = Object.entries(shortcuts).some(([key, value]) => {
                                if (key === `custom_${index}`) return false;
                                return String(value).toLowerCase() === normalizedNew;
                            });

                            if (duplicate) {
                                alert("Este atalho já está sendo usado por outra mensagem!");
                                return;
                            }
                        }

                        // Atualizar mensagem
                        messages[index] = newMessage;

                        // Atualizar atalho
                        if (newShortcut) {
                            shortcuts[`custom_${index}`] = newShortcut;
                        } else {
                            delete shortcuts[`custom_${index}`];
                        }

                        await StorageHelper.set({
                            customMessages: messages,
                            messageShortcuts: shortcuts
                        });

                        // Recarregar
                        toggleMensagens();
                        toggleMensagens();
                    }
                });
            });

            btnDelete.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (confirm("Excluir mensagem personalizada?")) {
                    const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
                    let newMessages = data.customMessages || [];
                    newMessages.splice(index, 1);
                    await StorageHelper.set({ customMessages: newMessages });

                    // Remover atalho associado
                    let newShortcuts = data.messageShortcuts || {};
                    delete newShortcuts[`custom_${index}`];

                    const cleanShortcuts = {};
                    Object.keys(newShortcuts).forEach(key => {
                        if (key.startsWith("fixed_")) {
                            cleanShortcuts[key] = newShortcuts[key];
                        } else if (key.startsWith("custom_")) {
                            const idx = parseInt(key.split("_")[1]);
                            if (idx < index) {
                                cleanShortcuts[key] = newShortcuts[key];
                            } else if (idx > index) {
                                cleanShortcuts[`custom_${idx - 1}`] = newShortcuts[key];
                            }
                        }
                    });

                    await StorageHelper.set({ messageShortcuts: cleanShortcuts });

                    toggleMensagens(); // Reload
                    toggleMensagens();
                }
            });
        }

        card.querySelector(".btn-enviar").addEventListener("click", (e) => {
            e.stopPropagation();
            enviarMensagemParaChat(text);
        });

        card.querySelector(".btn-copiar").addEventListener("click", (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(text);
            const btn = e.target;
            const original = btn.textContent;
            btn.textContent = "✅ Copiado";
            setTimeout(() => { btn.textContent = original; }, 1500);
        });

        card.addEventListener("mouseenter", () => {
            card.style.background = "#e8f0fe";
            card.style.borderColor = "#1a73e8";
        });

        card.addEventListener("mouseleave", () => {
            card.style.background = "#f8f9fa";
            card.style.borderColor = "#e0e0e0";
        });

        return card;
    }

    function enviarMensagemParaChat(mensagem) {
        const textAreas = document.querySelectorAll('textarea[placeholder*="Digite"], div[contenteditable="true"][role="textbox"], div[contenteditable="true"][placeholder*="Digite"], #twemoji-textarea');

        let inputEncontrado = null;

        for (let input of textAreas) {
            const isVisible = input.offsetWidth > 0 && input.offsetHeight > 0 &&
                getComputedStyle(input).visibility !== 'hidden';
            if (isVisible) {
                inputEncontrado = input;
                break;
            }
        }

        if (!inputEncontrado) {
            alert("Não foi possível encontrar o campo de mensagem. Certifique-se de que há um chat ativo.");
            return;
        }

        if (inputEncontrado.contentEditable === 'true') {
            inputEncontrado.focus();
            inputEncontrado.textContent = mensagem;

            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            inputEncontrado.dispatchEvent(inputEvent);

            setTimeout(() => {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(inputEncontrado);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }, 50);
        } else {
            inputEncontrado.value = mensagem;
            inputEncontrado.focus();

            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            inputEncontrado.dispatchEvent(inputEvent);
        }
    }

    return {
        toggleMensagens
    };
})();

window.MessagesModule = MessagesModule;
