const CRMAutomationModule = (function () {
    const TARGET_SELECTOR = '[id="frmAtendimento:tbvAtendimento:resolucao"]';

    // Helper to capitalize first letter
    const capitalize = (s) => s && s[0].toUpperCase() + s.slice(1);

    function waitForElement(selector) {
        return new Promise((resolve) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    // --- Speech Recognition Helpers (Adapted from CalledModule) ---
    function formatarTextoReconhecido(texto) {
        return texto
            .replace(/\bvírgula\b/gi, ',')
            .replace(/\bponto\b/gi, '.')
            .replace(/\bponto e vírgula\b/gi, ';')
            .replace(/\bdois pontos\b/gi, ':')
            .replace(/\binterrogação\b/gi, '?')
            .replace(/\bexclamação\b/gi, '!')
            .replace(/\bnf\b/gi, 'nota fiscal')
            .replace(/\bnf-e\b/gi, 'NF-e')
            .replace(/\bnfc-e\b/gi, 'NFC-e')
            .replace(/\bmdf-e\b/gi, 'MDF-e')
            .replace(/\bcli\b/gi, 'cliente')
            .replace(/\bobs\b/gi, 'observação')
            .replace(/\bnum\b/gi, 'número')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function createMicButton(targetInputId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = '🎤';
        btn.title = 'Usar microfone';
        btn.style.cssText = `
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
            margin-left: -32px; /* Pull back inside the input */
            z-index: 10;
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            opacity: 0.6;
            transition: opacity 0.2s, transform 0.2s;
        `;
        btn.onmouseover = () => btn.style.opacity = '1';
        btn.onmouseout = () => btn.style.opacity = '0.6';

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            startSpeechRecognition(btn, document.getElementById(targetInputId));
        };

        return btn;
    }

    function startSpeechRecognition(btn, inputEl) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Seu navegador não suporta reconhecimento de voz.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        btn.classList.add('recording');
        btn.innerHTML = '⏺️';
        btn.title = 'Gravando...';
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(-50%) scale(1.2)';

        recognition.start();

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const textoFormatado = capitalize(formatarTextoReconhecido(transcript.trim()));

            // Append or Replace? User logic from called.js was append if exists.
            const currentVal = inputEl.value.trim();
            if (currentVal) {
                inputEl.value = currentVal + ' ' + textoFormatado;
            } else {
                inputEl.value = textoFormatado;
            }

            // Trigger events to update textarea
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        };

        recognition.onend = () => {
            btn.classList.remove('recording');
            btn.innerHTML = '🎤';
            btn.title = 'Usar microfone';
            btn.style.transform = 'translateY(-50%)';
            inputEl.focus();
        };

        recognition.onerror = (event) => {
            console.error('Speech error:', event.error);
            recognition.stop();
        };
    }

    function createFormOverlay(textarea) {
        // Prevent dupes
        if (document.getElementById("crm-automation-container")) return null;

        // Visual Hide of the original textarea (keep it in DOM for form submission)
        textarea.style.cssText = `
            opacity: 0;
            height: 1px;
            overflow: hidden;
            position: absolute;
            z-index: -1;
        `;

        // Create container for our custom inputs
        const container = document.createElement("div");
        container.id = "crm-automation-container";
        container.style.cssText = `
            background: #ffffff;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 1px; 
            font-family: 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            gap: 16px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            box-sizing: border-box;
        `;

        // HTML for the form - Vertical Stack to match text flow
        container.innerHTML = `
            <div style="display:flex; justify-content:flex-end; align-items:center; padding-bottom:10px; margin-bottom:10px;">
                <!-- Button placeholder -->
                <div id="crm-actions-container" style="display:flex; align-items:center;"></div>
            </div>
            
            <!-- PROBLEMA -->
            <div>
                <label style="display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:5px; text-transform:uppercase;">1. Problema / Dúvida</label>
                <div style="position:relative;">
                    <input type="text" id="crm-input-problema" class="crm-input" style="width:100%; padding:10px; padding-right:40px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none; transition:border 0.2s; box-sizing:border-box;" placeholder="Descreva o problema ou dúvida do cliente..." autocomplete="off">
                </div>
            </div>

            <!-- SOLUÇÃO -->
            <div>
                <label style="display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:5px; text-transform:uppercase;">2. Solução Apresentada</label>
                <div style="position:relative;">
                    <textarea id="crm-input-solucao" class="crm-input" rows="3" style="width:100%; padding:10px; padding-right:40px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; outline:none; transition:border 0.2s; resize:vertical; font-family:inherit; box-sizing:border-box;" placeholder="Detalhe a solução fornecida..."></textarea>
                </div>
            </div>

            <!-- UPSELL -->
            <div style="display:flex; gap:20px; align-items:flex-start;">
                <div style="flex:0 0 auto;">
                     <label style="display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:5px; text-transform:uppercase;">3. Upsell?</label>
                     <div style="display:flex; gap:10px; background:#f9fafb; padding:8px 12px; border-radius:6px; border:1px solid #e5e7eb; box-sizing:border-box;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-size:14px; font-weight:500;">
                            <input type="radio" name="crm-upsell" value="SIM" class="crm-input-radio"> Sim
                        </label>
                        <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-size:14px; font-weight:500;">
                            <input type="radio" name="crm-upsell" value="NÃO" checked class="crm-input-radio"> Não
                        </label>
                     </div>
                </div>
                <div style="flex:1;">
                    <label style="display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:5px; text-transform:uppercase;">Oportunidade / Detalhes</label>
                    <div style="position:relative;">
                        <input type="text" id="crm-input-upsell-desc" class="crm-input" style="width:100%; padding:10px; padding-right:40px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; background:#f3f4f6; color:#9ca3af; box-sizing:border-box;" placeholder="Descreva o que foi oferecido..." disabled>
                    </div>
                </div>
            </div>

            <!-- PRINTS & HUMOR -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <!-- PRINTS -->
                <div>
                     <label style="display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:5px; text-transform:uppercase;">4. Prints (Erro/Msgs)</label>
                     <div style="display:flex; gap:15px; padding:10px; border:1px solid #d1d5db; border-radius:6px; align-items:center; box-sizing:border-box;">
                        <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-size:14px;">
                            <input type="radio" name="crm-prints" value="Sim" class="crm-input-radio"> Sim
                        </label>
                        <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-size:14px;">
                            <input type="radio" name="crm-prints" value="Não" checked class="crm-input-radio"> Não
                        </label>
                     </div>
                </div>

                <!-- HUMOR -->
                <div>
                    <label style="display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:5px; text-transform:uppercase;">5. Humor do Cliente</label>
                    <select id="crm-select-humor" class="crm-input" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; background:#fff; outline:none;">
                        <option value="Bom">Solution 😊 (Bom)</option>
                        <option value="Regular">Neutro 😐 (Regular)</option>
                        <option value="Ruim">Insatisfeito 😡 (Ruim)</option>
                    </select>
                </div>
            </div>
            
            <div style="font-size:11px; color:#9ca3af; text-align:right; margin-top:5px;">
                Pressione <span style="font-weight:700; border:1px solid #ddd; padding:0 4px; border-radius:3px;">Enter</span> para avançar.
            </div>
        `;

        // Inject before textarea
        textarea.parentElement.insertBefore(container, textarea);

        // Inject Mic Buttons
        const divProblema = container.querySelector('#crm-input-problema').parentElement;
        divProblema.appendChild(createMicButton('crm-input-problema'));

        const divSolucao = container.querySelector('#crm-input-solucao').parentElement;
        divSolucao.appendChild(createMicButton('crm-input-solucao'));

        const divUpsell = container.querySelector('#crm-input-upsell-desc').parentElement;
        divUpsell.appendChild(createMicButton('crm-input-upsell-desc'));

        // References
        const els = {
            problema: container.querySelector('#crm-input-problema'),
            solucao: container.querySelector('#crm-input-solucao'),
            upsellRadios: container.querySelectorAll('input[name="crm-upsell"]'),
            upsellDesc: container.querySelector('#crm-input-upsell-desc'),
            printRadios: container.querySelectorAll('input[name="crm-prints"]'),
            humor: container.querySelector('#crm-select-humor')
        };

        // --- Logic: Upsell Toggle ---
        const toggleUpsellDesc = () => {
            const isSim = container.querySelector('input[name="crm-upsell"]:checked').value === "SIM";
            els.upsellDesc.disabled = !isSim;
            els.upsellDesc.style.background = isSim ? '#fff' : '#f3f4f6';
            els.upsellDesc.style.color = isSim ? '#000' : '#9ca3af';
            if (isSim) els.upsellDesc.focus();
        };
        els.upsellRadios.forEach(r => r.addEventListener('change', () => {
            toggleUpsellDesc();
            updateTextarea();
        }));

        // --- Logic: Sync to Textarea ---
        const updateTextarea = () => {
            const problema = els.problema.value.trim();
            const solucao = els.solucao.value.trim();
            const upsell = container.querySelector('input[name="crm-upsell"]:checked').value;
            const upsellTxt = els.upsellDesc.value.trim();
            const prints = container.querySelector('input[name="crm-prints"]:checked').value;
            const humor = els.humor.value;

            // Only update if we have at least something, to avoid wiping out manual edits on load? 
            // Nah, aggressive overwrite is safer to ensure format.

            let text = "";

            text += `PROBLEMA / DÚVIDA: ${capitalize(problema || "Dúvida")}\n\n`;
            text += `SOLUÇÃO APRESENTADA: ${capitalize(solucao)}\n\n`;

            text += `OPORTUNIDADE DE UPSELL: ${upsell}`;
            if (upsell === "SIM" && upsellTxt) {
                text += `. ${capitalize(upsellTxt)}`;
            }
            text += `. \n\n`;

            text += `PRINTS DE ERRO OU DE MENSAGENS RELEVANTES: ${prints}\n\n`;
            text += `HUMOR DO CLIENTE: ${humor}`;

            textarea.value = text;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        };

        // Attach listeners for sync
        els.problema.addEventListener('input', updateTextarea);
        els.solucao.addEventListener('input', updateTextarea);
        els.upsellDesc.addEventListener('input', updateTextarea);
        els.printRadios.forEach(r => r.addEventListener('change', updateTextarea));
        els.humor.addEventListener('change', updateTextarea);

        // --- Logic: Enter Navigation ---
        // List of navigable inputs in order
        const getNavigableInputs = () => {
            const list = [els.problema, els.solucao, ...els.upsellRadios];

            // Check if Upsell Desc is enabled
            if (!els.upsellDesc.disabled) {
                list.push(els.upsellDesc);
            }

            list.push(...els.printRadios);
            list.push(els.humor);
            return list;
        };

        container.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Prevent default (form submit or new line if not needed)
                // Note: For 'solucao' (textarea), user might WANT new line. 
                // Allow Shift+Enter for new line in textarea?

                const target = e.target;
                const isTextarea = target.tagName === 'TEXTAREA';

                // If Ctrl+Enter or Shift+Enter in Textarea, allow new line
                if (isTextarea && (e.ctrlKey || e.shiftKey)) {
                    return;
                }

                // Else, treat as Navigation
                e.preventDefault();

                const inputs = getNavigableInputs();
                // Find current grouping logic relies on finding 'which' input it is.
                // Radios are tricky because they are group. 
                // We want to jump from Radio Group -> Next Field.

                let currentIndex = -1;

                // Identify index
                for (let i = 0; i < inputs.length; i++) {
                    if (inputs[i] === target) {
                        currentIndex = i;
                        break;
                    }
                }

                if (currentIndex === -1) return;

                // Calculate Next
                let nextIndex = currentIndex + 1;

                // If current is radio, jump over fellow radios of SAME group
                if (target.type === 'radio') {
                    const name = target.name;
                    while (nextIndex < inputs.length && inputs[nextIndex].type === 'radio' && inputs[nextIndex].name === name) {
                        nextIndex++;
                    }
                }

                if (nextIndex < inputs.length) {
                    inputs[nextIndex].focus();
                    // If radio, check it? No, just focus.
                }
            }
        });

        // Initialize textarea with default state
        updateTextarea();

        return {
            fillFromText: (fullText) => {
                const getValue = (startMarker, ...endMarkers) => {
                    const startIdx = fullText.toUpperCase().indexOf(startMarker.toUpperCase());
                    if (startIdx === -1) return "";
                    const contentStart = startIdx + startMarker.length;

                    let bestEndIdx = fullText.length;
                    for (const endMarker of endMarkers) {
                        const idx = fullText.toUpperCase().indexOf(endMarker.toUpperCase(), contentStart);
                        if (idx !== -1 && idx < bestEndIdx) bestEndIdx = idx;
                    }

                    let val = fullText.slice(contentStart, bestEndIdx).trim();
                    if (val.startsWith(':')) val = val.substring(1).trim();
                    return val;
                };

                const prob = getValue("PROBLEMA / DÚVIDA", "SOLUÇÃO APRESENTADA");
                const sol = getValue("SOLUÇÃO APRESENTADA", "OPORTUNIDADE DE UPSELL");
                const upsellFull = getValue("OPORTUNIDADE DE UPSELL", "PRINTS DE ERRO");
                const prints = getValue("PRINTS DE ERRO OU DE MENSAGENS RELEVANTES", "HUMOR DO CLIENTE");
                const humor = getValue("HUMOR DO CLIENTE");

                if (prob) els.problema.value = prob;
                if (sol) els.solucao.value = sol;
                if (upsellFull) {
                    if (upsellFull.toUpperCase().includes("SIM")) {
                        container.querySelector('input[name="crm-upsell"][value="SIM"]').click(); // Click to trigger listeners
                        const desc = upsellFull.replace(/^SIM[\s.,]*/i, '').trim();
                        if (desc) els.upsellDesc.value = desc;
                    } else {
                        container.querySelector('input[name="crm-upsell"][value="NÃO"]').click();
                    }
                }

                if (prints) {
                    const val = prints.toLowerCase().includes("sim") ? "Sim" : "Não";
                    const radio = container.querySelector(`input[name="crm-prints"][value="${val}"]`);
                    if (radio) radio.click();
                }

                if (humor) {
                    let val = "Bom";
                    if (humor.match(/regular|normal/i)) val = "Regular";
                    if (humor.match(/ruim|pessi|triste/i)) val = "Ruim";
                    els.humor.value = val;
                }

                updateTextarea();
            }
        };
    }

    async function init() {
        console.log("CRM Automation: Iniciando...");

        try {
            const textarea = await waitForElement(TARGET_SELECTOR);
            console.log("CRM Automation: Elemento encontrado!", textarea);

            const formControl = createFormOverlay(textarea);

            // Create Glue Button
            const createPasteButton = (summaryData) => {
                const btnId = "btn-paste-summary";
                if (document.getElementById(btnId)) return;

                const btn = document.createElement("button");
                btn.id = btnId;
                btn.textContent = "📋 Colar Resumo IA";
                btn.type = "button";
                btn.style.cssText = `
                    background-color: #3b82f6;
                    color: white;
                    border: none;
                    padding: 6px 14px;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: background 0.2s;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                `;

                // Insert into the form header
                const actionsContainer = document.getElementById("crm-actions-container");
                if (actionsContainer) {
                    actionsContainer.appendChild(btn);
                }

                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    if (summaryData.text) {
                        if (formControl) {
                            formControl.fillFromText(summaryData.text);
                        } else {
                            textarea.value = summaryData.text;
                        }

                        btn.textContent = "✅ Preenchido!";
                        btn.style.backgroundColor = "#10b981";
                        setTimeout(() => {
                            btn.textContent = "📋 Colar Resumo IA";
                            btn.style.backgroundColor = "#3b82f6";
                        }, 2000);
                    }
                });
            };

            // Check storage
            chrome.storage.local.get(['last_summary'], (result) => {
                const summary = result.last_summary;
                if (summary && summary.text) {
                    const isRecent = (Date.now() - (summary.timestamp || 0)) < 24 * 60 * 60 * 1000;
                    if (isRecent) {
                        createPasteButton(summary);
                    }
                }
            });

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
