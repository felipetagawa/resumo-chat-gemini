const ShortcutsModule = (() => {
    let messageShortcutsCache = {};
    let isReplacing = false;

    async function carregarAtalhosMensagens() {
        const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
        messageShortcutsCache = {};

        const fixedMessages = [
            "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações.",
            "Atualmente, a fase inicial da Reforma Tributária com IBS e CBS se aplica apenas às empresas do regime normal (Lucro Presumido e Lucro Real), sendo que para o Simples Nacional não há recolhimento nem impacto prático neste primeiro ano, pois as informações são utilizadas apenas de forma nominativa e experimental.",
            "A reformulação das telas não altera a lógica de cálculo nem as regras fiscais do sistema, sendo uma evolução voltada à melhoria contínua, e qualquer diferença percebida está relacionada apenas à interface ou fluxo, com nossa equipe disponível para esclarecer dúvidas e ajustar eventuais pontos específicos.",
            "As telas reformuladas de Contas a Receber, Contas a Pagar, NFC-e e Cadastro de Produtos mantêm as mesmas regras fiscais e operacionais de antes, tendo sido alterados apenas aspectos visuais e funcionais para melhorar usabilidade e organização, sem impacto nos cálculos ou validações já existentes.",
            "A emissão de NFC-e para CNPJ deixou de ser permitida por determinação das normas fiscais vigentes, não sendo uma regra criada pelo sistema, que apenas aplica automaticamente essa exigência legal para evitar rejeições e problemas fiscais ao contribuinte.",
            "O procedimento de referenciar NFC-e em uma NF-e não é mais aceito pela legislação fiscal atual, motivo pelo qual o sistema bloqueia essa prática, garantindo conformidade legal e evitando a rejeição dos documentos junto à SEFAZ.",
            "A vedação à emissão de NFC-e para CNPJ e ao seu referenciamento em NF-e decorre exclusivamente de alterações nas regras fiscais, e o sistema apenas segue essas determinações para manter a regularidade das operações e evitar inconsistências legais."
        ];

        const shortcuts = data.messageShortcuts || {};

        fixedMessages.forEach((msg, index) => {
            const shortcutKey = `fixed_${index}`;
            const shortcutValue = shortcuts[shortcutKey];
            if (shortcutValue) {
                const key = typeof shortcutValue === 'string' ? shortcutValue.toUpperCase() : shortcutValue.toString();
                messageShortcutsCache[key] = msg;
            }
        });

        const customMessages = data.customMessages || [];
        customMessages.forEach((msg, index) => {
            const shortcutKey = `custom_${index}`;
            const shortcutValue = shortcuts[shortcutKey];
            if (shortcutValue) {
                const key = typeof shortcutValue === 'string' ? shortcutValue.toUpperCase() : shortcutValue.toString();
                messageShortcutsCache[key] = msg;
            }
        });
    }

    function detectarEInserirAtalho(element) {
        if (isReplacing) return false;

        let currentText = '';

        if (element.contentEditable === 'true') {
            currentText = element.textContent || element.innerText || '';
        } else {
            currentText = element.value || '';
        }

        // Check for slash trigger to open popup
        if (currentText.endsWith('/') && !currentText.endsWith('//')) {
            if (window.MessagesModule && window.MessagesModule.toggleMensagens && !document.getElementById("popupMensagensPadrao")) {
                window.MessagesModule.toggleMensagens();
            }
        }

        const match = currentText.match(/\/([A-Za-z0-9])$/);

        if (match) {
            const shortcutKey = match[1].toUpperCase();
            const message = messageShortcutsCache[shortcutKey];

            if (message) {
                isReplacing = true;

                // Close popup if open
                if (window.MessagesModule && window.MessagesModule.toggleMensagens && document.getElementById("popupMensagensPadrao")) {
                    window.MessagesModule.toggleMensagens();
                }

                const newText = currentText.replace(/\/[A-Za-z0-9]$/, message);

                if (element.contentEditable === 'true') {
                    element.textContent = newText;

                    setTimeout(() => {
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.selectNodeContents(element);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);

                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));

                        isReplacing = false;
                    }, 10);
                } else {
                    element.value = newText;
                    element.setSelectionRange(newText.length, newText.length);

                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));

                    isReplacing = false;
                }
                return true;
            }
        }

        return false;
    }

    function init() {

        document.addEventListener('input', function (event) {
            const isTextArea = event.target.matches('textarea, [contenteditable="true"], div[contenteditable="true"], [role="textbox"]');

            if (isTextArea) {
                detectarEInserirAtalho(event.target);
            }
        });

        document.addEventListener('keydown', function (event) {
            const isTextArea = event.target.matches('textarea, [contenteditable="true"], div[contenteditable="true"], [role="textbox"]');

            if (isTextArea) {
                const isLetterOrNumber = /^[a-zA-Z0-9]$/.test(event.key);

                if (isLetterOrNumber) {
                    const element = event.target;
                    let currentText = '';

                    if (element.contentEditable === 'true') {
                        currentText = element.textContent || element.innerText || '';
                    } else {
                        currentText = element.value || '';
                    }

                    if (currentText.endsWith('/')) {
                        setTimeout(() => {
                            detectarEInserirAtalho(element);
                        }, 10);
                    }
                }
            }
        });

        carregarAtalhosMensagens();

        StorageHelper.addListener((changes, namespace) => {
            if (namespace === 'local' && (changes.messageShortcuts || changes.customMessages)) {
                carregarAtalhosMensagens();
            }
        });
    }

    return {
        init
    };
})();

window.ShortcutsModule = ShortcutsModule;
