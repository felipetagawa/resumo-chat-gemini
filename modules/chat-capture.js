const ChatCaptureModule = (() => {
    const replyOwners = new WeakMap();
    let replyObserver;
    function identificarAtendimentoResposta() {
        const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
        const card = document.querySelector('.sz_contact.active');
        if (!card || document.querySelectorAll('.sz_contact.active').length !== 1) return '';
        for (const attr of ['data-chat-id', 'data-contact-id', 'data-id']) {
            const value = normalize(card.getAttribute(attr)), digits = value.replace(/\D/g, '');
            if (value && !(/^[\d\s()+.-]+$/.test(value) && digits.length >= 10 && digits.length <= 15)) return `${attr}:${value}`;
        }
        const src = card.querySelector('img[alt="platform"]')?.getAttribute('src') || '';
        const platform = src.match(/\/assets\/img\/platform\/mini\/([\w-]+)\.svg(?:[?#].*)?$/i)?.[1]?.toLowerCase();
        const name = normalize(card.querySelector('.contact-name')?.textContent).toLowerCase();
        const time = card.querySelector('.contact-times[phase="attendance"] .times');
        const timestamp = normalize(time?.getAttribute('title') || time?.textContent);
        if (!platform || !name || !/^\d{2}\/\d{2}\/\d{2}(?:\d{2})? \d{2}:\d{2}(?::\d{2})?$/.test(timestamp)) return '';
        return `attendance:${platform}|${name.replace(/%/g, '%25').replace(/\|/g, '%7C')}|${timestamp}`;
    }
    function rememberReplyNodes() {
        const token = identificarAtendimentoResposta();
        if (token) for (const msg of document.querySelectorAll('.msg')) {
            if (replyOwners.has(msg)) continue;
            let owner = token;
            const attr = token.split(':')[0];
            if (['data-chat-id', 'data-contact-id', 'data-id'].includes(attr)) {
                for (let parent = msg.parentElement; parent; parent = parent.parentElement) {
                    const value = String(parent.getAttribute(attr) || '').trim();
                    if (value) { owner = `${attr}:${value}`; break; }
                }
            }
            replyOwners.set(msg, owner);
        }
        return token;
    }
    function observarAtendimentoResposta() {
        // Retain only weak node references and attendance IDs, never message excerpts.
        // Old nodes cannot be reassigned when SZ updates a same-name header/container.
        rememberReplyNodes();
        if (!replyObserver && globalThis.MutationObserver && document.body) {
            replyObserver = new MutationObserver(rememberReplyNodes);
            replyObserver.observe(document.body, { childList: true, subtree: true, attributes: true,
                characterData: true, attributeFilter: ['class', 'data-chat-id', 'data-contact-id', 'data-id', 'title', 'src', 'phase'] });
        }
    }
    // Smart Reply alone: structured, ephemeral capture of the active attendance.
    // Keep the legacy report capture below independent of these rules.
    function mensagensParaResposta() {
        const card = document.querySelector('.sz_contact.active');
        const token = rememberReplyNodes();
        if (!card || !token) return [];
        const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
        const customer = normalize(card.querySelector('.contact-name')?.textContent);
        const matchesCustomer = name => customer && (name === customer
            || (customer.split(' ')[0].length >= 3 && name === customer.split(' ')[0]));
        const attrs = ['data-chat-id', 'data-contact-id', 'data-id'];
        const messages = Array.from(document.querySelectorAll('.msg')).flatMap(msg => {
            let scoped = false;
            // Message IDs belong to the message, not to the attendance. Check ancestors only.
            for (let parent = msg.parentElement; parent; parent = parent.parentElement) {
                if (parent.getAttribute('hidden') !== null || parent.getAttribute('aria-hidden') === 'true') return [];
                for (const attr of attrs) {
                    const active = card.getAttribute(attr), owner = parent.getAttribute(attr);
                    if (active && owner && active !== owner) return [];
                    if (active && owner === active) scoped = true;
                }
            }
            if (replyOwners.get(msg) !== token) return [];
            if (msg.closest?.('[hidden], [aria-hidden="true"]')) return [];
            if (msg.getClientRects && !msg.getClientRects().length) return [];
            const name = msg.querySelector('.name')?.innerText?.trim() || '';
            const message = msg.querySelector('.message span')?.innerText?.trim() || '';
            if (!message || /^autom[aá]tico\b/i.test(name)) return [];
            const sent = msg.classList.contains('sent');
            const received = msg.classList.contains('received');
            const knownCustomer = matchesCustomer(normalize(name));
            if (!sent && name && !knownCustomer && !scoped) return [];
            if (!sent && received && name && !knownCustomer) return [];
            return [{ name: name || (sent ? 'Técnico' : 'Cliente'), message,
                scoped, customer: !sent && (knownCustomer || (!name && received)) }];
        });
        // SZ can update its active card before replacing the old transcript.
        // Without a matching customer or attendance container, fail closed.
        const hasUnscopedCustomer = messages.some(item => item.customer && !item.scoped);
        return messages.filter(item => item.scoped || hasUnscopedCustomer);
    }

    function limitarMensagensRecentes(messages) {
        const lines = [], marker = '[trecho inicial omitido] ';
        let available = 16000;
        for (const item of [...messages].reverse()) {
            const prefix = `${item.name}: `;
            const line = prefix + item.message;
            const budget = available - (lines.length ? 1 : 0);
            if (line.length <= budget) {
                lines.unshift(line); available = budget - line.length;
            } else {
                const tailLength = budget - prefix.length - marker.length;
                if (tailLength > 0) lines.unshift(prefix + marker + item.message.slice(-tailLength));
                break;
            }
        }
        return lines.join('\n');
    }

    function capturarContextoResposta(mode = 'RECENT') {
        const messages = mensagensParaResposta();
        const fullConversation = messages.map(item => `${item.name}: ${item.message}`).join('\n');
        const lastCustomer = messages.filter(item => item.customer).slice(-1);
        let conversation;
        if (mode === 'LAST_CUSTOMER') conversation = limitarMensagensRecentes(lastCustomer);
        else if (mode !== 'AVAILABLE') conversation = limitarMensagensRecentes(messages.slice(-12));
        else {
            conversation = fullConversation;
            // Preserve Smart Reply's existing broad-context omission strategy.
            if (conversation.length > 16000) {
                const marker = '\n[trecho intermediário omitido]\n';
                const latest = lastCustomer[0];
                const line = latest ? `${latest.name}: ${latest.message}` : '';
                conversation = !line ? conversation.slice(0, 4000) + marker + conversation.slice(-11900)
                    : conversation.slice(0, 2000) + marker + 'Última interação do cliente:\n'
                        + line.slice(-6000) + marker + conversation.slice(-7800);
            }
        }
        return { conversation, fullConversation };
    }

    function capturarTextoChat() {
        const mensagensDOM = document.querySelectorAll(".msg");

        if (!mensagensDOM.length) {
            return "";
        }

        const mensagens = Array.from(mensagensDOM)
            .map(msg => {
                const nome = msg.querySelector(".name")?.innerText?.trim() || "";
                const texto = msg.querySelector(".message span")?.innerText?.trim() || "";
                if (!texto) return null;
                return `${nome ? nome + ": " : ""}${texto}`;
            })
            .filter(Boolean)
            .filter(linha => {
                const t = linha.toLowerCase();
                return t && !t.startsWith("automático");
            })
            .join("\n");

        return mensagens;
    }

    function extrairProblemaDoResumo(resumoCompleto) {
        const linhas = resumoCompleto.split('\n');
        let problema = '';
        let capturando = false;

        const inicioPalavrasChave = [
            'problema:', 'dúvida:', 'questão:', 'issue:', 'erro:',
            'situação:', 'contexto:', 'descrição:', 'relato:'
        ];

        const fimPalavrasChave = [
            'solução:', 'resolução:', 'resposta:', 'solution:',
            'correção:', 'procedimento:', 'passos:', 'como resolver:'
        ];

        for (let linha of linhas) {
            const linhaLower = linha.toLowerCase().trim();

            if (inicioPalavrasChave.some(kw => linhaLower.startsWith(kw))) {
                capturando = true;
                problema += linha + '\n';
                continue;
            }

            if (fimPalavrasChave.some(kw => linhaLower.startsWith(kw))) {
                break;
            }

            if (capturando && linha.trim()) {
                problema += linha + '\n';
            }
        }

        if (!problema.trim()) {
            const primeirosParagrafos = linhas.slice(0, Math.min(10, linhas.length));
            problema = primeirosParagrafos
                .filter(l => l.trim())
                .join('\n');
        }

        return problema.trim() || resumoCompleto;
    }

    function capturarNomeCliente() {
        // Tentativa 1: Seletores comuns de header de chat
        const selectors = [
            "#contact-name",
            ".contact-name",
            ".header-info .name",
            ".conversation-header .name",
            ".chat-header .title",
            ".chat-title",
            "header .name",
            ".top-bar .name"
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText.trim()) {
                return el.innerText.trim();
            }
        }

        // Tentativa 2: Procurar na primeira mensagem recebida (que não seja do sistema)
        // Isso é arriscado mas pode funcionar se o header falhar
        const msgs = document.querySelectorAll(".msg");
        for (const msg of msgs) {
            const isSent = msg.classList.contains("sent"); // Se tiver classe de enviado
            const nameEl = msg.querySelector(".name");
            // Se tem nome e não parece ser o usuário logado (assumindo logica de classe ou comparação simples)
            if (nameEl && nameEl.innerText) {
                // Simplificação: apenas retorne o primeiro nome encontrado se não temos header
                return nameEl.innerText.trim();
            }
        }

        return "Cliente";
    }

    return {
        capturarTextoChat,
        capturarContextoResposta,
        identificarAtendimentoResposta,
        observarAtendimentoResposta,
        extrairProblemaDoResumo,
        capturarNomeCliente
    };
})();

window.ChatCaptureModule = ChatCaptureModule;
