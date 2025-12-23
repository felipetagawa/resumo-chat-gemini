const CalledModule = (function () {
  let currentPopup = null;

  function exibirChamadoManual() {
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
    }

    currentPopup = document.createElement('div');
    currentPopup.id = 'chamadoManualPopup';
    currentPopup.className = 'chamado-popup active';

    currentPopup.innerHTML = `
      <div class="popup-overlay"></div>
      <div class="popup-content">
        <div class="popup-header">
          <h4>📝 Chamado Manual</h4>
          <button class="btn-close-popup">&times;</button>
        </div>
        <div class="popup-body">
          <div class="chamado-form">
            <!-- Formulário -->
            <div class="tela active">
              <div class="problema-duvida-container">
                <label>PROBLEMA / DÚVIDA</label>
                <div class="mic-btn-container">
                  <textarea id="problemaDuvida" rows="3" placeholder="Ex: O cliente tentou cancelar a nota fiscal eletrônica 7310 e enfrentou um erro de retorno no sistema..."></textarea>
                  <button class="mic-btn" data-target="problemaDuvida" title="Usar microfone">
                    <span class="mic-emoji">🎤</span>
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label for="docNumber">NÚMERO DO DOCUMENTO</label>
                <div class="mic-btn-container">
                  <input type="text" id="docNumber" placeholder="Ex: 7310">
                  <button class="mic-btn" data-target="docNumber" title="Usar microfone">
                    <span class="mic-emoji">🎤</span>
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label for="solucao">SOLUÇÃO APRESENTADA</label>
                <div class="mic-btn-container">
                  <textarea id="solucao" rows="3" placeholder="Ex: Verifiquei que a NF-e 7310 já havia sido cancelada anteriormente, mas o sistema apresentou um erro de retorno..."></textarea>
                  <button class="mic-btn" data-target="solucao" title="Usar microfone">
                    <span class="mic-emoji">🎤</span>
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label>OPORTUNIDADE DE UPSELL</label>
                <div class="radio-group">
                  <div class="radio-item">
                    <input type="radio" id="upsell-sim" name="upsell" value="SIM">
                    <label for="upsell-sim">SIM</label>
                  </div>
                  <div class="radio-item">
                    <input type="radio" id="upsell-nao" name="upsell" value="NÃO" checked>
                    <label for="upsell-nao">NÃO</label>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label for="upsellDesc">DESCRIÇÃO DE UPSELL <span class="info">(Apenas se houver upsell)</span></label>
                <div class="mic-btn-container">
                  <textarea id="upsellDesc" rows="2" placeholder="Descreva o que foi oferecido/vendido..."></textarea>
                  <button class="mic-btn" data-target="upsellDesc" title="Usar microfone">
                    <span class="mic-emoji">🎤</span>
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label>PRINTS DE ERRO OU DE MENSAGENS RELEVANTES</label>
                <div class="radio-group">
                  <div class="radio-item">
                    <input type="radio" id="captura-sim" name="captura" value="Sim">
                    <label for="captura-sim">Sim</label>
                  </div>
                  <div class="radio-item">
                    <input type="radio" id="captura-nao" name="captura" value="Não" checked>
                    <label for="captura-nao">Não</label>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label for="humorSelection">HUMOR DO CLIENTE</label>
                <select id="humorSelection">
                  <option value="BOM">BOM</option>
                  <option value="REGULAR">REGULAR</option>
                  <option value="RUIM">RUIM</option>
                </select>
              </div>

              <div class="d-grid">
                <button id="copyBtn">
                  📋 Copiar
                </button>
                <div id="copyMessage"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(currentPopup);
    initializeChamadoFunctions(currentPopup);
  }

  function initializeChamadoFunctions(popup) {
    const autoResize = (el) => {
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight) + 'px';
    };

    const camposAutoResize = ['problemaDuvida', 'solucao', 'upsellDesc'];
    camposAutoResize.forEach(id => {
      const el = popup.querySelector('#' + id);
      if (el) {
        el.addEventListener('input', () => autoResize(el));
        setTimeout(() => autoResize(el), 50);
      }
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const micButtons = popup.querySelectorAll('.mic-btn');

      micButtons.forEach(btn => {
        const targetId = btn.getAttribute('data-target');
        const campo = popup.querySelector('#' + targetId);
        if (!campo) return;

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        let gravando = false;

        btn.addEventListener('click', (e) => {
          e.stopPropagation();

          if (!gravando) {
            try {
              recognition.start();
              gravando = true;
              btn.classList.add('recording');
              btn.innerHTML = '<span class="mic-emoji">⏺️</span>';
              btn.title = 'Gravando... Clique para parar';
            } catch (err) {
              console.log('Erro ao iniciar gravação:', err);
              btn.classList.remove('recording');
              gravando = false;
            }
          } else {
            recognition.stop();
          }
        });

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;

          const textoFormatado = formatarTextoReconhecido(transcript.trim());

          const valorAtual = campo.value.trim();
          let novoValor;

          if (valorAtual) {
            novoValor = valorAtual + ' ' + textoFormatado;
          } else {
            novoValor = capitalizarPrimeiraLetra(textoFormatado);
          }

          campo.value = novoValor;

          if (campo.tagName === 'TEXTAREA') {
            autoResize(campo);
          }

          campo.focus();
          campo.setSelectionRange(novoValor.length, novoValor.length);
        };

        recognition.onend = () => {
          gravando = false;
          btn.classList.remove('recording');
          btn.innerHTML = '<span class="mic-emoji">🎤</span>';
          btn.title = 'Usar microfone';
        };

        recognition.onerror = (event) => {
          console.log('Erro no reconhecimento:', event.error);

          gravando = false;
          btn.classList.remove('recording');
          btn.innerHTML = '<span class="mic-emoji">🎤</span>';
          btn.title = 'Usar microfone';

          if (event.error === 'no-speech') {
            return;
          }

          if (event.error === 'network') {
            setTimeout(() => {
              if (!gravando) {
                recognition.start().catch(() => {
                  btn.style.display = 'none';
                });
              }
            }, 1000);
          }
        };
      });
    } else {
      popup.querySelectorAll('.mic-btn').forEach(btn => {
        btn.style.display = 'none';
      });
    }

    function formatarTextoReconhecido(texto, isProblemaDuvida = false) {
      texto = texto
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

      return texto;
    }

    function capitalizarPrimeiraLetra(texto) {
      if (!texto) return texto;
      return texto.charAt(0).toUpperCase() + texto.slice(1);
    }

    const copyBtn = popup.querySelector('#copyBtn');
    const copyMessage = popup.querySelector('#copyMessage');

    copyMessage.style.opacity = '0';

    copyBtn.addEventListener('click', async () => {
      const problemaDuvida = popup.querySelector('#problemaDuvida').value.trim();
      const docNumber = popup.querySelector('#docNumber').value.trim();
      const solucao = popup.querySelector('#solucao').value.trim();
      const upsell = popup.querySelector('input[name="upsell"]:checked')?.value || 'NÃO';
      const upsellDesc = popup.querySelector('#upsellDesc').value.trim();
      const captura = popup.querySelector('input[name="captura"]:checked')?.value || 'Não';
      const humor = popup.querySelector('#humorSelection').value;

      let texto = '';

      if (problemaDuvida) {
        const problemaFormatado = capitalizarPrimeiraLetra(problemaDuvida);
        texto += `PROBLEMA / DÚVIDA: ${problemaFormatado}\n\n`;
      }

      if (docNumber) {
        texto += `NÚMERO DO DOCUMENTO: ${docNumber}\n\n`;
      }

      if (solucao) {
        const solucaoFormatada = capitalizarPrimeiraLetra(solucao);
        texto += `SOLUÇÃO APRESENTADA: ${solucaoFormatada}\n\n`;
      }

      texto += `OPORTUNIDADE DE UPSELL: ${upsell}`;
      if (upsellDesc && upsell === 'SIM') {
        texto += `. ${capitalizarPrimeiraLetra(upsellDesc)}`;
      }
      texto += '\n\n';

      texto += `PRINTS DE ERRO OU DE MENSAGENS RELEVANTES: ${captura}.\n\n`;

      texto += `HUMOR DO CLIENTE: ${humor}.`;

      try {
        await navigator.clipboard.writeText(texto);

        const historyData = await new Promise(resolve => {
          chrome.storage.local.get(['chamado_manual_history'], resolve);
        });

        let history = historyData.chamado_manual_history || [];
        history.push({
          timestamp: Date.now(),
          text: texto
        });

        if (history.length > 50) history = history.slice(-50);
        await chrome.storage.local.set({ chamado_manual_history: history });

        copyMessage.textContent = '✅ Copiado e salvo!';
        copyMessage.style.opacity = '1';

        setTimeout(() => {
          popup.querySelectorAll('textarea, input[type="text"]').forEach(el => {
            el.value = '';
          });

          popup.querySelector('#humorSelection').value = 'BOM';
          popup.querySelector('#upsell-nao').checked = true;
          popup.querySelector('#captura-nao').checked = true;

          camposAutoResize.forEach(id => {
            const el = popup.querySelector('#' + id);
            if (el) autoResize(el);
          });

          setTimeout(() => {
            copyMessage.style.opacity = '0';
          }, 1500);
        }, 300);

      } catch (err) {
        copyMessage.textContent = '❌ Erro ao copiar!';
        copyMessage.style.background = '#e74c3c';
        copyMessage.style.opacity = '1';

        setTimeout(() => {
          copyMessage.style.opacity = '0';
          copyMessage.style.background = '#48bb78';
        }, 2000);
      }
    });

    const camposTexto = popup.querySelectorAll("textarea, input[type='text']");

    camposTexto.forEach(campo => {
      const key = `cache_${campo.id}`;
      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";
      campo.parentNode.insertBefore(wrapper, campo);
      wrapper.appendChild(campo);

      const list = document.createElement("div");
      list.className = "suggestions-list";
      wrapper.appendChild(list);

      function mostrarSugestoes(filtro = "") {
        const values = JSON.parse(localStorage.getItem(key) || "[]");
        list.innerHTML = "";

        const filtradas = values
          .filter(v => v.toLowerCase().includes(filtro.toLowerCase()))
          .slice(-5)
          .reverse();

        if (filtradas.length === 0) {
          list.style.display = "none";
          return;
        }

        filtradas.forEach(value => {
          const item = document.createElement("div");
          item.className = "suggestion-item";
          item.textContent = value;

          item.addEventListener("click", () => {
            campo.value = value;
            list.style.display = "none";
            if (campo.tagName === 'TEXTAREA') autoResize(campo);
          });

          list.appendChild(item);
        });

        list.style.display = "block";
      }

      campo.addEventListener("focus", () => mostrarSugestoes(campo.value));
      campo.addEventListener("input", () => mostrarSugestoes(campo.value));

      campo.addEventListener("blur", () => {
        setTimeout(() => list.style.display = "none", 200);

        const value = campo.value.trim();
        if (value.length > 0) {
          let values = JSON.parse(localStorage.getItem(key) || "[]");
          if (!values.includes(value)) {
            values.push(value);
            if (values.length > 10) values = values.slice(-10);
            localStorage.setItem(key, JSON.stringify(values));
          }
        }
      });

      document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) list.style.display = "none";
      });
    });

    function fecharPopup() {
      if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
      }
    }

    popup.querySelector('.btn-close-popup').addEventListener('click', fecharPopup);
    popup.querySelector('.popup-overlay').addEventListener('click', fecharPopup);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && currentPopup) {
        fecharPopup();
      }
    });

    popup.querySelector('.popup-content').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    setTimeout(() => {
      const primeiroCampo = popup.querySelector('#problemaDuvida');
      if (primeiroCampo) primeiroCampo.focus();
    }, 100);
  }

  return {
    exibirChamadoManual: exibirChamadoManual
  };
})();

window.CalledModule = CalledModule;