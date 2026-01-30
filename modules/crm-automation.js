const CRMAutomationModule = (function () {
    const TARGET_SELECTOR = '[id="frmAtendimento:tbvAtendimento:resolucao"]';

    const TEMPLATE = `PROBLEMA / DÚVIDA: Dúvida

SOLUÇÃO APRESENTADA: 

OPORTUNIDADE DE UPSELL: NÃO. .

PRINTS DE ERRO OU DE MENSAGENS RELEVANTES: Não

HUMOR DO CLIENTE: Bom`;

    function waitForElement(selector) {
        return new Promise((resolve) => {
            const element = document.querySelector(selector);
            if (element) {
                return resolve(element);
            }

            const observer = new MutationObserver((mutations) => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Fallback timeout after 30 seconds to clean up observer if needed? 
            // For now, infinite wait is ok as it's the main purpose of this script.
        });
    }

    async function init() {
        console.log("CRM Automation: Iniciando...");

        try {
            const textarea = await waitForElement(TARGET_SELECTOR);
            console.log("CRM Automation: Elemento encontrado!", textarea);

            if (!textarea.value.trim()) {
                textarea.value = TEMPLATE;

                // Dispatch input event to ensure frameworks (like JSF/PrimeFaces) detect the change
                const event = new Event('input', { bubbles: true });
                textarea.dispatchEvent(event);

                // Also try change event
                const changeEvent = new Event('change', { bubbles: true });
                textarea.dispatchEvent(changeEvent);

                console.log("CRM Automation: Template preenchido com sucesso.");
            } else {
                console.log("CRM Automation: Campo já possui conteúdo. Pula preenchimento.");
            }
        } catch (error) {
            console.error("CRM Automation: Erro ao tentar preencher o CRM", error);
        }
    }

    return {
        init
    };
})();

// Auto-inicialização quando o script é carregado
CRMAutomationModule.init();
