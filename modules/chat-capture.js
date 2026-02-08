const ChatCaptureModule = (() => {
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
        extrairProblemaDoResumo,
        capturarNomeCliente
    };
})();

window.ChatCaptureModule = ChatCaptureModule;
