// SoftenChat list cards carry no conversation id in the DOM. This bridge runs in the page's world
// (it needs React's own properties on the nodes) and writes, on each card of the list:
//   data-atendeai-conversa="{id}"  the conversation the card shows
//   data-atendeai-minha="1"        that conversation is assigned to the logged-in agent
// Read from the props of the card component (React 18: { item, meuId, ... }). A card that cannot
// be read carries no attribute, so the extension draws nothing on it.
(() => {
    if (globalThis.__atendeaiCardsBridge) return;
    const CARD = 'main aside [role="button"][tabindex="0"]';
    const MAX_DEPTH = 8;

    function fiberOf(node) {
        for (const key of Object.keys(node)) if (key.startsWith('__reactFiber$')) return node[key];
        return null;
    }

    function propsDoCard(node) {
        let fiber = fiberOf(node);
        for (let depth = 0; fiber && depth < MAX_DEPTH; depth += 1, fiber = fiber.return) {
            const props = fiber.memoizedProps;
            if (props && props.item && typeof props.item === 'object') return props;
        }
        return null;
    }

    // Writes only on change: the observer below would otherwise wake itself up forever.
    function definir(node, name, value) {
        if (value == null) {
            if (node.getAttribute(name) != null) node.removeAttribute(name);
        } else if (node.getAttribute(name) !== value) {
            node.setAttribute(name, value);
        }
    }

    function marcar(root = document) {
        for (const card of root.querySelectorAll(CARD)) {
            let id = null, minha = null;
            try {
                const props = propsDoCard(card);
                const item = props?.item;
                id = typeof item?.id === 'string' && item.id ? item.id : null;
                const meuId = typeof props?.meuId === 'string' ? props.meuId : '';
                if (id && meuId && item.assignedUserId === meuId && item.encerrada !== true && item.isActive !== false) minha = '1';
            } catch { id = null; minha = null; }
            definir(card, 'data-atendeai-conversa', id);
            definir(card, 'data-atendeai-minha', minha);
        }
    }

    globalThis.__atendeaiCardsBridge = { marcar };

    let pending = null;
    const agendar = () => {
        if (pending) return;
        pending = setTimeout(() => { pending = null; marcar(); }, 150);
    };
    if (globalThis.MutationObserver && document.body) {
        new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    // Safety net: a re-render that swaps a card's item without touching the DOM tree.
    setInterval(marcar, 2000);
    marcar();
})();
