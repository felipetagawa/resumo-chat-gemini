// SoftenChat (chat.softensistemas.com.br): the agent screen opens several conversations side by
// side, each an <article data-conversa="{id}">. The bubbles carry only styling classes, so the
// transcript comes from SoftenChat's own API, with the session the page already holds.
const SoftenChatCapture = (() => {
    const HOST = 'chat.softensistemas.com.br';
    const PAGE_LIMIT = 100, MAX_MESSAGES = 300;
    const cache = new Map(); // conversationId -> { messages, at }
    const inflight = new Map();
    let lastFocused = '';
    let watching = false;
    const refreshTimers = new Map(); // conversationId -> pending re-read
    let me = null; // { id } from /auth/me, read once per page

    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const ativo = () => globalThis.location?.hostname === HOST;

    function articles() {
        return Array.from(document.querySelectorAll('article[data-conversa]'));
    }
    function articleOf(node) {
        for (let n = node; n; n = n.parentElement) {
            if (n.getAttribute?.('data-conversa') != null && String(n.tagName).toLowerCase() === 'article') return n;
        }
        return null;
    }
    function insideDialog(node) {
        for (let n = node.parentElement; n; n = n.parentElement) if (n.getAttribute?.('role') === 'dialog') return true;
        return false;
    }
    function articleById(id) {
        return id ? articles().find(a => a.getAttribute('data-conversa') === id) || null : null;
    }

    // The conversation the technician is working in: the one holding focus, else the one last
    // focused while it is still open, else the only one open. Several open and none chosen: none.
    function conversaEmFoco() {
        const focused = articleOf(document.activeElement);
        if (focused) return focused.getAttribute('data-conversa');
        if (articleById(lastFocused)) return lastFocused;
        const open = articles();
        return open.length === 1 ? open[0].getAttribute('data-conversa') : '';
    }

    function nomeDoCliente(id = conversaEmFoco()) {
        const header = articleById(id)?.querySelector('header');
        if (!header) return '';
        const bold = header.querySelector('span.font-bold');
        const fromBold = clean(bold?.textContent);
        if (fromBold) return fromBold;
        // title: "{nome} ({telefone}) — {canal} · {equipe} · {status}"
        const title = clean(header.getAttribute('title'));
        return clean(title.split(' — ')[0].replace(/\s*\([^)]*\)\s*$/, ''));
    }

    // The reply composer only: the client drawer (role="dialog") has its own textarea for notes.
    // Without the conversation assigned to the technician there is no composer at all.
    // "(…)" right after the name in the header title: a phone, or "visitor_…" for the site widget.
    function identificadorDoContato(id = conversaEmFoco()) {
        const title = clean(articleById(id)?.querySelector('header')?.getAttribute('title'));
        return clean(title.split(' — ')[0].match(/\(([^)]*)\)\s*$/)?.[1]);
    }

    function composer(id = conversaEmFoco()) {
        const list = Array.from(articleById(id)?.querySelectorAll('textarea') || [])
            .filter(el => String(el.getAttribute('aria-label') || '').startsWith('Mensagem para ')
                && !insideDialog(el) && !el.disabled && el.offsetWidth > 0 && el.offsetHeight > 0
                && getComputedStyle(el).visibility !== 'hidden');
        return list.length === 1 ? list[0] : null;
    }

    function apiBase() {
        // Routes live under the company's path: /{empresa}/chat → API at /{empresa}/api.
        const slug = String(globalThis.location?.pathname || '').split('/').filter(Boolean)[0] || '';
        const prefix = slug && !['chat', 'chat-novo', 'api'].includes(slug) ? `/${slug}` : '';
        return `${globalThis.location.origin}${prefix}/api`;
    }
    function token() {
        try { return JSON.parse(localStorage.getItem('auth') || 'null')?.accessToken || ''; }
        catch { return ''; }
    }

    const MEDIA = { image: '[Imagem]', audio: '[Áudio]', video: '[Vídeo]', document: '[Documento]' };
    function normalizar(raw, customerName) {
        if (!raw || raw.fromType === 'system' || raw.metadata?.internal === true) return null;
        let message = clean(raw.content);
        if (raw.type && raw.type !== 'text' && (!message || /^\[[a-z]+\]$/i.test(message))) message = MEDIA[raw.type] || '[Anexo]';
        if (!message) return null;
        const autor = raw.metadata?.autor || {};
        const author = clean(autor.nome);
        // self: true when SoftenChat says the logged-in technician wrote it; null when unknown.
        const self = autor.id && me?.id ? autor.id === me.id : null;
        if (raw.fromType === 'user') {
            return { name: customerName || 'Cliente', author: customerName, message, scoped: true, customer: true, sent: false, at: raw.sentAt };
        }
        if (raw.fromType === 'nina') {
            // The AI agent is neither the customer nor the technician's own voice.
            return { name: 'Agente de IA', author: '', message, scoped: true, customer: false, sent: false, at: raw.sentAt };
        }
        return { name: author || 'Técnico', author, self, message, scoped: true, customer: false, sent: true, at: raw.sentAt };
    }

    async function get(path, auth) {
        const res = await fetch(`${apiBase()}${path}`, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
            credentials: 'same-origin'
        });
        if (!res.ok) throw new Error(`SoftenChat respondeu ${res.status} em ${path.split('?')[0]}.`);
        return res.json();
    }
    const asList = body => Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.messages) ? body.messages : [];

    // Pages go backwards with ?before={oldest message id}; a short page is the start of the history.
    async function buscar(id) {
        const auth = token();
        if (!id || !auth) return null;
        if (!me) me = await get('/auth/me', auth).then(user => ({ id: user?.id || '' }), () => ({ id: '' }));
        const base = `/conversations/${encodeURIComponent(id)}/messages?limit=${PAGE_LIMIT}`;
        let all = [];
        for (let before = ''; all.length < MAX_MESSAGES;) {
            const page = asList(await get(before ? `${base}&before=${encodeURIComponent(before)}` : base, auth));
            const known = new Set(all.map(m => m.id));
            all = [...page.filter(m => !known.has(m.id)), ...all];
            if (page.length < PAGE_LIMIT) break;
            const oldest = [...page].sort((a, b) => new Date(a.sentAt || 0) - new Date(b.sentAt || 0))[0]?.id;
            if (!oldest || oldest === before) break;
            before = oldest;
        }
        return all.sort((a, b) => new Date(a.sentAt || 0) - new Date(b.sentAt || 0));
    }

    /** Reads the focused conversation from the API into the cache. Safe to call often. */
    function atualizar(id = conversaEmFoco()) {
        if (!id) return Promise.resolve(false);
        if (inflight.has(id)) return inflight.get(id);
        const job = buscar(id)
            .then(raw => { if (raw) cache.set(id, { raw, at: Date.now() }); return !!raw; })
            .catch(error => { console.warn('[AtendeAI] SoftenChat:', error?.message || error); return false; })
            .finally(() => inflight.delete(id));
        inflight.set(id, job);
        return job;
    }

    /** GET on SoftenChat's API with the page's own session; rejects without one. */
    function apiGet(path) {
        const auth = token();
        if (!auth) return Promise.reject(new Error('SoftenChat sem sessão.'));
        return get(path, auth);
    }

    function conversasAbertas() {
        return articles().map(a => a.getAttribute('data-conversa')).filter(Boolean);
    }
    const emCache = id => !!id && cache.has(id);

    function mensagens(id = conversaEmFoco()) {
        const entry = id && cache.get(id);
        if (!entry) return [];
        const customer = nomeDoCliente(id);
        return entry.raw.map(raw => normalizar(raw, customer)).filter(Boolean);
    }

    function observar() {
        if (watching || !ativo()) return;
        watching = true;
        // A click on a conversation's messages chooses it too, not only focus in its composer.
        const escolher = event => {
            const article = articleOf(event.target);
            if (!article) return;
            const id = article.getAttribute('data-conversa');
            if (id !== lastFocused) { lastFocused = id; void atualizar(id); }
        };
        document.addEventListener('focusin', escolher, true);
        document.addEventListener('pointerdown', escolher, true);
        // A new bubble in any open conversation (or a conversation just opened): re-read that one
        // once the burst settles. The queue context reads every open conversation, not only the focused one.
        if (globalThis.MutationObserver && document.body) {
            new MutationObserver(records => {
                const ids = new Set();
                for (const r of records) {
                    const id = articleOf(r.target)?.getAttribute('data-conversa');
                    if (id) ids.add(id);
                    for (const node of r.addedNodes || []) {
                        if (node?.getAttribute?.('data-conversa') != null) ids.add(node.getAttribute('data-conversa'));
                    }
                }
                for (const id of ids) {
                    clearTimeout(refreshTimers.get(id));
                    refreshTimers.set(id, setTimeout(() => { refreshTimers.delete(id); void atualizar(id); }, 800));
                }
            }).observe(document.body, { childList: true, subtree: true });
        }
        for (const id of conversasAbertas()) void atualizar(id);
    }

    return { ativo, conversaEmFoco, conversasAbertas, emCache, nomeDoCliente, identificadorDoContato, composer, atualizar, mensagens, observar, apiGet, _normalizar: normalizar };
})();

window.SoftenChatCapture = SoftenChatCapture;
