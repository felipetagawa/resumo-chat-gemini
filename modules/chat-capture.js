const ChatCaptureModule = (() => {
    function capturarTextoChat() {
        const mensagensDOM = document.querySelectorAll(".msg");

        if (!mensagensDOM.length) {
            alert("Nenhuma mensagem encontrada no chat aberto.");
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

    return {
        capturarTextoChat,
        extrairProblemaDoResumo
    };
})();

window.ChatCaptureModule = ChatCaptureModule;
