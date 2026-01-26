const DOMHelpers = {
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

    removeElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
    },

    exists(id) {
        return !!document.getElementById(id);
    },

    addDelegatedListener(parent, selector, event, handler) {
        parent.addEventListener(event, (e) => {
            if (e.target.matches(selector)) {
                handler(e);
            }
        });
    }
};

window.DOMHelpers = DOMHelpers;
