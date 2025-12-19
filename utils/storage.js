/**
 * ============================================
 * STORAGE.JS - Chrome Storage Helper
 * ============================================
 * Funções auxiliares para interagir com chrome.storage
 */

const StorageHelper = {
    /**
     * Obtém dados do storage local
     * @param {string|array} keys - Chave(s) para buscar
     * @returns {Promise} Promise com os dados
     */
    get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (data) => {
                resolve(data);
            });
        });
    },

    /**
     * Salva dados no storage local
     * @param {object} data - Dados para salvar
     * @returns {Promise} Promise quando salvamento concluir
     */
    set(data) {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, () => {
                resolve();
            });
        });
    },

    /**
     * Remove dados do storage local
     * @param {string|array} keys - Chave(s) para remover
     * @returns {Promise} Promise quando remoção concluir
     */
    remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                resolve();
            });
        });
    },

    /**
     * Adiciona listener para mudanças no storage
     * @param {function} callback - Função callback(changes, namespace)
     */
    addListener(callback) {
        chrome.storage.onChanged.addListener(callback);
    }
};

// Export para uso em outros módulos
window.StorageHelper = StorageHelper;
