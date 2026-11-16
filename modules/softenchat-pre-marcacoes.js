// Pré-atendimento markings on SoftenChat (the SZ ones live in pre-controls.js): on each list card
// whose conversation is the agent's own, a timer since it became theirs and the 💸 negotiation
// toggle. Which conversation a card shows comes from softenchat-cards-bridge.js (page world), as
// data-atendeai-conversa / data-atendeai-minha. No attribute, no marking. Nothing is sent anywhere:
// the API stopped keeping pre-attendance records (POST /api/pre-controls → 410).
const SoftenChatPreMarcacoes = (() => {
    const KEY = 'atendeai_softenchat_pre_v1';
    const NAME_KEY = 'atendeai_user_name';
    const SECTOR_KEY = 'atendeai_user_sector';
    const CARD = 'main aside [role="button"][tabindex="0"]';
    const DIA = 86400000;
    const LIMPEZA_MS = 7 * DIA;
    const VISTO_GRAVA_MS = 60000; // refresh "last seen" at most once a minute per conversation
    const TIMER_TITLE = 'Tempo de atendimento (desde que ficou com você)';

    let estado = {}; // conversaId -> { inicio, neg, vistoEm, fonte: 'api' | 'visto' }
    let iniciado = false;
    let me = null; // Promise<{ id }>
    const tentados = new Set(); // conversations already asked to the API on this page
    let salvarTimer = null;

    const storageGet = keys => new Promise(resolve => chrome.storage.local.get(keys, d => resolve(d || {})));
    const pad = n => String(n).padStart(2, '0');

    function formatar(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        if (total >= 86400) return `${Math.floor(total / 86400)}d ${pad(Math.floor((total % 86400) / 3600))}h`;
        return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
    }

    function cor(ms) {
        const min = ms / 60000;
        if (min < 5) return '#41925f';
        if (min < 10) return '#a09742';
        return '#e75a5a';
    }

    // When the conversation became the agent's: assumedAt, or a later transfer to them.
    function inicioDe(conversa, meId) {
        const ts = v => { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : null; };
        let inicio = ts(conversa?.assumedAt);
        const transfers = Array.isArray(conversa?.transfers) ? conversa.transfers : [];
        for (const t of transfers) {
            const para = t?.toUserId ?? t?.to_user_id ?? null;
            if (!meId || para !== meId) continue;
            const quando = ts(t.createdAt ?? t.transferredAt ?? t.at);
            if (quando != null && (inicio == null || quando > inicio)) inicio = quando;
        }
        return inicio;
    }

    function salvar() {
        clearTimeout(salvarTimer);
        salvarTimer = setTimeout(() => chrome.storage.local.set({ [KEY]: estado }), 500);
    }

    function limpar(agora) {
        let mudou = false;
        for (const [id, reg] of Object.entries(estado)) {
            if (!reg || agora - Number(reg.vistoEm || 0) > LIMPEZA_MS) { delete estado[id]; mudou = true; }
        }
        if (mudou) salvar();
    }

    function buscarInicio(id) {
        if (tentados.has(id)) return;
        tentados.add(id);
        const api = globalThis.SoftenChatCapture;
        if (!api?.apiGet) return;
        if (!me) me = api.apiGet('/auth/me').then(u => ({ id: u?.id || '' }), () => ({ id: '' }));
        me.then(({ id: meId }) => api.apiGet(`/conversations/${encodeURIComponent(id)}`)
            .then(conversa => {
                const inicio = inicioDe(conversa, meId);
                const reg = estado[id];
                if (inicio == null || !reg) return;
                reg.inicio = inicio;
                reg.fonte = 'api';
                salvar();
                varrer();
            }))
            .catch(error => console.warn('[AtendeAI] Marcações:', error?.message || error));
    }

    function parar(e) { e.stopPropagation(); }

    function criarSlot(linha, id) {
        const slot = document.createElement('span');
        slot.className = 'atendeai-pre-slot';
        slot.setAttribute('data-conversa', id);

        const timer = document.createElement('span');
        timer.className = 'atendeai-pre-timer';
        timer.setAttribute('title', TIMER_TITLE);
        timer.textContent = '00:00:00';

        const neg = document.createElement('button');
        neg.type = 'button';
        neg.className = 'atendeai-pre-neg';
        neg.textContent = '💸';
        neg.setAttribute('aria-label', 'Negociação');
        // The card opens the conversation on click/Enter: none of these may reach it.
        ['pointerdown', 'mousedown', 'keydown'].forEach(type => neg.addEventListener(type, parar));
        neg.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const conversa = slot.getAttribute('data-conversa');
            const reg = estado[conversa];
            if (!reg) return;
            reg.neg = !reg.neg;
            pintarNeg(neg, reg.neg);
            chrome.storage.local.set({ [KEY]: estado });
        });

        slot.appendChild(timer);
        slot.appendChild(neg);
        linha.appendChild(slot);
        return slot;
    }

    function pintarNeg(neg, ligado) {
        neg.setAttribute('aria-pressed', ligado ? 'true' : 'false');
        neg.setAttribute('title', ligado ? 'Negociação: SIM (clique para desativar)' : 'Negociação: NÃO (clique para ativar)');
    }

    function varrer() {
        const agora = Date.now();
        for (const card of document.querySelectorAll(CARD)) {
            const linha = card.children[0];
            let slot = linha?.querySelector('.atendeai-pre-slot') || null;
            const id = card.getAttribute('data-atendeai-minha') === '1' ? card.getAttribute('data-atendeai-conversa') : null;
            if (!id || !linha) { slot?.remove(); continue; }
            if (slot && slot.getAttribute('data-conversa') !== id) { slot.remove(); slot = null; }

            let reg = estado[id];
            if (!reg) { reg = estado[id] = { inicio: agora, neg: false, vistoEm: agora, fonte: 'visto' }; salvar(); }
            else if (agora - Number(reg.vistoEm || 0) > VISTO_GRAVA_MS) { reg.vistoEm = agora; salvar(); }
            if (reg.fonte !== 'api') buscarInicio(id);

            if (!slot) slot = criarSlot(linha, id);
            else if (linha.children[linha.children.length - 1] !== slot) linha.appendChild(slot);

            const decorrido = agora - Number(reg.inicio || agora);
            const timer = slot.querySelector('.atendeai-pre-timer');
            if (timer) { timer.textContent = formatar(decorrido); timer.style.background = cor(decorrido); }
            const neg = slot.querySelector('.atendeai-pre-neg');
            if (neg) pintarNeg(neg, !!reg.neg);
        }
    }

    async function init() {
        if (iniciado || !globalThis.SoftenChatCapture?.ativo?.()) return;
        const cfg = await storageGet([NAME_KEY, SECTOR_KEY, KEY]);
        const sector = String(cfg[SECTOR_KEY] || '').trim().toLowerCase();
        if (sector !== 'preatendimento' || !String(cfg[NAME_KEY] || '').trim()) return;
        iniciado = true;
        estado = cfg[KEY] && typeof cfg[KEY] === 'object' ? cfg[KEY] : {};
        limpar(Date.now());
        // Another SoftenChat tab toggled a 💸: follow it.
        chrome.storage.onChanged?.addListener?.((changes, area) => {
            if (area === 'local' && changes[KEY]?.newValue) { estado = changes[KEY].newValue; varrer(); }
        });
        varrer();
        setInterval(varrer, 1000);
    }

    return { init, _formatar: formatar, _cor: cor, _inicioDe: inicioDe, _varrer: varrer };
})();

globalThis.SoftenChatPreMarcacoes = SoftenChatPreMarcacoes;
