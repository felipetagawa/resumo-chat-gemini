/**
 * ============================================
 * SHORTCUTS.JS - Sistema de Atalhos de Mensagens
 * ============================================
 * Gerencia atalhos de texto para mensagens padrão
 */

const ShortcutsModule = (() => {
    let messageShortcutsCache = {};
    let isReplacing = false;

    /**
     * Carrega atalhos do storage
     */
    async function carregarAtalhosMensagens() {
        const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
        messageShortcutsCache = {};

        const fixedMessages = [
            "Estamos cientes da instabilidade e nossa equipe já está trabalhando na correção.",
            "Esse comportamento ocorre devido a uma atualização recente no sistema.",
            "Pedimos que limpe o cache e reinicie o sistema antes de tentar novamente."
        ];

        const shortcuts = data.messageShortcuts || {};

        // Atalhos fixos
        fixedMessages.forEach((msg, index) => {
            const shortcutKey = `fixed_${index}`;
            const shortcutValue = shortcuts[shortcutKey];
            if (shortcutValue) {
                const key = typeof shortcutValue === 'string' ? shortcutValue.toUpperCase() : shortcutValue.toString();
                messageShortcutsCache[key] = msg;
            }
        });

        // Mensagens customizadas
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

    /**
     * Detecta e insere atalho no elemento
     */
    function detectarEInserirAtalho(element) {
        if (isReplacing) return false;

        let currentText = '';

        if (element.contentEditable === 'true') {
            currentText = element.textContent || element.innerText || '';
        } else {
            currentText = element.value || '';
        }

        const match = currentText.match(/\/([A-Za-z0-9])$/);

        if (match) {
            const shortcutKey = match[1].toUpperCase();
            const message = messageShortcutsCache[shortcutKey];

            if (message) {
                isReplacing = true;

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

    /**
     * Inicializa event listeners
     */
    function init() {
        // Input event
        document.addEventListener('input', function (event) {
            const isTextArea = event.target.matches('textarea, [contenteditable="true"], div[contenteditable="true"], [role="textbox"]');

            if (isTextArea) {
                detectarEInserirAtalho(event.target);
            }
        });

        // Keydown event
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

        // Carrega atalhos inicialmente
        carregarAtalhosMensagens();

        // Listener para mudanças no storage
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

// Export
window.ShortcutsModule = ShortcutsModule;
