/**
 * ============================================
 * MESSAGING.JS - Chrome Runtime Messaging Helper
 * ============================================
 * Funções auxiliares para comunicação com background script
 */

const MessagingHelper = {
    /**
     * Envia mensagem para o background script
     * @param {object} message - Mensagem para enviar
     * @returns {Promise} Promise com a resposta
     */
    send(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    },

    /**
     * Adiciona listener para mensagens recebidas
     * @param {function} callback - Função callback(request, sender, sendResponse)
     */
    addListener(callback) {
        chrome.runtime.onMessage.addListener(callback);
    }
};

// Export para uso em outros módulos
window.MessagingHelper = MessagingHelper;
