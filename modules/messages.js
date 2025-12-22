const MessagesModule = (() => {

    function mostrarPopupMensagens() {
        DOMHelpers.removeElement("popupMensagensPadrao");
        carregarEMostrarMensagens();
    }

    async function carregarEMostrarMensagens() {
        const popup = criarPopupMensagens();
        document.body.appendChild(popup);

        const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
        const customMessagesList = data.customMessages || [];

        renderizarMensagens(popup, customMessagesList);
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
        <b style="font-size:16px; color:#3c4043;">💬 Mensagens Padrão</b>
        <button id="fecharMensagensFlutuante" style="background:none; border:none; font-size:18px; cursor:pointer;">&times;</button>
      </div>
      <div id="conteudoMensagens" style="flex:1; overflow-y:auto; padding:16px;"></div>
    `;

        popup.querySelector("#fecharMensagensFlutuante").addEventListener("click", () => popup.remove());

        return popup;
    }

    function renderizarMensagens(popup, customMessagesList) {
        const container = popup.querySelector("#conteudoMensagens");

        const fixedMessages = [
            "Estamos cientes da instabilidade e nossa equipe já está trabalhando na correção.",
            "Esse comportamento ocorre devido a uma atualização recente no sistema.",
            "Pedimos que limpe o cache e reinicie o sistema antes de tentar novamente."
        ];

        const fixedAcordeon = UIBuilder.criarAcordeon("📌 Mensagens Fixas", true, "acordeon-fixas");
        fixedMessages.forEach((msg, index) => {
            const card = criarCardMensagem(msg, false, index);
            fixedAcordeon.content.appendChild(card);
        });
        container.appendChild(fixedAcordeon.container);

        const customAcordeon = UIBuilder.criarAcordeon(`✨ Mensagens Personalizadas (${customMessagesList.length})`, true, "acordeon-custom");

        if (customMessagesList.length === 0) {
            customAcordeon.content.innerHTML = `<p style="color:#999; text-align:center; padding:20px;">Nenhuma mensagem personalizada. Configure em Opções.</p>`;
        } else {
            customMessagesList.forEach((msg, index) => {
                const card = criarCardMensagem(msg, true, index, customMessagesList);
                customAcordeon.content.appendChild(card);
            });
        }
        container.appendChild(customAcordeon.container);
    }

    function criarCardMensagem(text, isCustom, index, customMessagesList = []) {
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

        card.innerHTML = `
      <div style="font-size:13px; color:#333; line-height:1.4;">${text}</div>
      <div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn-enviar" style="background:#1a73e8; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px;">Enviar</button>
        <button class="btn-copiar" style="background:#f1f3f4; color:#3c4043; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px;">Copiar</button>
      </div>
    `;

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
        const textAreas = document.querySelectorAll('textarea[placeholder*="Digite"], div[contenteditable="true"][role="textbox"]');

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
        mostrarPopupMensagens
    };
})();

window.MessagesModule = MessagesModule;
