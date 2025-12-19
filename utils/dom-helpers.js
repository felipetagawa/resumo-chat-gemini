/**
 * ============================================
 * DOM-HELPERS.JS - DOM Manipulation Utilities
 * ============================================
 * Funções auxiliares para manipulação do DOM
 */

const DOMHelpers = {
    /**
     * Cria um elemento com propriedades
     * @param {string} tag - Tag do elemento
     * @param {object} props - Propriedades (className, id, style, etc)
     * @param {string|Element} content - Conteúdo do elemento
     * @returns {Element} Elemento criado
     */
    createElement(tag, props = {}, content = '') {
        const element = document.createElement(tag);

        Object.keys(props).forEach(key => {
            if (key === 'style' && typeof props[key] === 'object') {
                Object.assign(element.style, props[key]);
            } else if (key === 'dataset' && typeof props[key] === 'object') {
                Object.assign(element.dataset, props[key]);
            } else {
                element[key] = props[key];
            }
        });

        if (typeof content === 'string') {
            element.innerHTML = content;
        } else if (content instanceof Element) {
            element.appendChild(content);
        }

        return element;
    },

    /**
     * Remove elemento do DOM se existir
     * @param {string} id - ID do elemento
     */
    removeElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
    },

    /**
     * Verifica se elemento existe
     * @param {string} id - ID do elemento
     * @returns {boolean} true se existir
     */
    exists(id) {
        return !!document.getElementById(id);
    },

    /**
     * Adiciona event listener com delegation
     * @param {Element} parent - Elemento pai
     * @param {string} selector - Seletor CSS dos filhos
     * @param {string} event - Nome do evento
     * @param {function} handler - Handler do evento
     */
    addDelegatedListener(parent, selector, event, handler) {
        parent.addEventListener(event, (e) => {
            if (e.target.matches(selector)) {
                handler(e);
            }
        });
    }
};

// Export para uso em outros módulos
window.DOMHelpers = DOMHelpers;
