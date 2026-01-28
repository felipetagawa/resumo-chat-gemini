const ShortcutsModule = (() => {
  let commandsCache = [];
  let dropdownEl = null;
  let activeInputEl = null;
  let isOpen = false;
  let selectedIndex = 0;
  let currentFiltered = [];
  let currentQuery = "";
  let userSector = ""; // Armazenar setor do usuário

  let cacheReady = false;
  let loadingPromise = null;
  let loadSeq = 0;

  const MAX_SHORTCUT_LEN = 20;

  const INVALID_CHARS_REPLACE = /[^A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]/g;
  const INVALID_CHARS_TEST = /[^A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]/;

  function normalizeShortcutDisplay(value) {
    let v = String(value || "");
    v = v.replace(INVALID_CHARS_REPLACE, "");
    v = v.replace(/\s+/g, " ").trim();
    if (v.length > MAX_SHORTCUT_LEN) v = v.slice(0, MAX_SHORTCUT_LEN);
    return v;
  }

  function normForMatch(value) {
    return normalizeShortcutDisplay(value).toLowerCase();
  }

  const NAME_KEY = "atendeai_user_name";
  const SECTOR_KEY = "atendeai_user_sector";

  const SUPPORT_FIXED_MESSAGES = [
    "Os valores exibidos de IBS e CBS neste primeiro momento não representam cobrança efetiva, pois a fase inicial da Reforma Tributária é apenas experimental e nominativa, com alíquotas padrão 0,10 e 0,90, sem geração de recolhimento, sendo exigida apenas para empresas do Lucro Presumido e Lucro Real para fins de adaptação e validação das informações.",
    "Atualmente, a fase inicial da Reforma Tributária com IBS e CBS se aplica apenas às empresas do regime normal (Lucro Presumido e Lucro Real), sendo que para o Simples Nacional não há recolhimento nem impacto prático neste primeiro ano, pois as informações são utilizadas apenas de forma nominativa e experimental."
  ];

  const PRE_FIXED_MESSAGES = [
    "Bom dia, tudo bem?\nEu sou o atendente {{NOME}} do pré atendimento do suporte da Soften Sistema, como posso te ajudar?",
    "Boa tarde, tudo bem?\nEu sou o atendente {{NOME}} do pré atendimento do suporte da Soften Sistema, como posso te ajudar?",
    "Você pode me informar seu NOME, seu EMAIL e seu ID AnyDesk, caso não possua, acesse o nosso site em seu computador https://anydesk.com/pt por gentileza, irei verificar com um técnico especializado para te auxiliar.",
    "Caso não possua, poderia realizar o download do AnyDesk por gentileza: https://anydesk.com/pt",
    "Só um momento, irei verificar um técnico para te auxiliar e assim que estiver disponível encaminharei seu atendimento.",
    "Estou finalizando o atendimento pois não obtive resposta, qualquer dúvida entre em contato com a Soften!",
    "Disponha, precisando estamos a disposição\nTenha um ótimo dia! 🙂"
  ];

  function resolveTemplate(text, name) {
    const safe = String(name || "").trim();
    const finalName = safe ? safe : "Atendente";
    return String(text || "").replaceAll("{{NOME}}", finalName);
  }

  async function carregarAtalhosMensagens() {
    const mySeq = ++loadSeq;
    cacheReady = false;

    loadingPromise = (async () => {
      try {
        const data = await StorageHelper.get([
          "customMessages",
          "messageShortcuts",
          NAME_KEY,
          SECTOR_KEY
        ]);

        const shortcuts = data.messageShortcuts || {};
        const sector = String(data[SECTOR_KEY] || "").trim().toLowerCase();
        const name = String(data[NAME_KEY] || "").trim();

        const isPre = sector === "preatendimento";

        const fixedMessagesRaw = isPre ? PRE_FIXED_MESSAGES : SUPPORT_FIXED_MESSAGES;
        const fixedMessages = fixedMessagesRaw.map(msg => isPre ? resolveTemplate(msg, name) : msg);

        const nextCache = [];

        fixedMessages.forEach((msg, index) => {
          const key = `fixed_${index}`;
          const shortcutDisplay = normalizeShortcutDisplay(shortcuts[key]);

          // Para pré-atendimento, incluir TODAS as mensagens fixas (mesmo sem atalho)
          // Para suporte, incluir apenas as com atalho configurado
          if (!isPre && !shortcutDisplay) return;

          nextCache.push({
            key,
            shortcutDisplay: shortcutDisplay || `msg${index + 1}`, // Fallback para mensagens sem atalho
            shortcutNorm: normForMatch(shortcutDisplay || `msg${index + 1}`),
            message: msg,
            origin: "fixed",
            hasShortcut: !!shortcutDisplay
          });
        });

        if (!isPre) {
          const customMessages = data.customMessages || [];
          customMessages.forEach((msg, index) => {
            const key = `custom_${index}`;
            const shortcutDisplay = normalizeShortcutDisplay(shortcuts[key]);
            if (!shortcutDisplay) return;

            nextCache.push({
              key,
              shortcutDisplay,
              shortcutNorm: normForMatch(shortcutDisplay),
              message: msg,
              origin: "custom"
            });
          });
        }

        nextCache.sort((a, b) => {
          const c = a.shortcutNorm.localeCompare(b.shortcutNorm);
          if (c !== 0) return c;
          if (a.origin === b.origin) return 0;
          return a.origin === "fixed" ? -1 : 1;
        });

        if (mySeq === loadSeq) {
          commandsCache = nextCache;
          userSector = sector; // Armazenar setor
        }
      } catch (err) {
        console.error("[Shortcuts] erro ao carregar atalhos:", err);
        if (mySeq === loadSeq) commandsCache = [];
      } finally {
        if (mySeq === loadSeq) cacheReady = true;
      }
    })();

    return loadingPromise;
  }

  async function ensureCacheReady() {
    if (cacheReady) return;
    if (!loadingPromise) loadingPromise = carregarAtalhosMensagens();
    try {
      await loadingPromise;
    } catch (_) {
    }
  }

  function ensureDropdown() {
    if (dropdownEl) return dropdownEl;

    dropdownEl = document.createElement("div");
    dropdownEl.id = "messageShortcutDropdown";
    dropdownEl.style = `
      position: fixed;
      z-index: 999999;
      width: min(560px, calc(100vw - 40px));
      max-height: 320px;
      overflow: auto;
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: none;
    `;

    dropdownEl.addEventListener("mousedown", (e) => e.preventDefault());

    document.body.appendChild(dropdownEl);
    return dropdownEl;
  }

  function openDropdown(inputEl, query) {
    activeInputEl = inputEl;
    currentQuery = query;
    selectedIndex = 0; // Reset selecionado

    const dd = ensureDropdown();
    renderDropdown();

    positionDropdownNearInput(inputEl, dd);
    dd.style.display = "block";
    isOpen = true;
  }

  function closeDropdown() {
    if (!dropdownEl) return;
    dropdownEl.style.display = "none";
    dropdownEl.innerHTML = "";
    isOpen = false;
    activeInputEl = null;
    currentFiltered = [];
    currentQuery = "";
  }

  function renderDropdown() {
    const dd = dropdownEl;
    if (!dd) return;

    currentFiltered = [];
    const queryNorm = normForMatch(currentQuery);

    // Se query vazia, mostrar TODOS os comandos disponíveis
    if (queryNorm.length === 0) {
      currentFiltered = commandsCache.map(cmd => ({ type: 'cmd', data: cmd }));
    } else {
      // Filtrar comandos que começam com a query
      const matches = commandsCache.filter(cmd => cmd.shortcutNorm.startsWith(queryNorm));
      currentFiltered = matches.map(cmd => ({ type: 'cmd', data: cmd }));

      // Adicionar opção de criar novo atalho APENAS para suporte
      const isPre = userSector === "preatendimento";
      if (!isPre && queryNorm.length > 0) {
        currentFiltered.push({ type: 'create', query: currentQuery });
      }
    }

    if (!currentFiltered.length) {
      dd.innerHTML = `
        <div style="padding:12px 14px; color:#5f6368; font-size:13px;">
          Nenhum atalho encontrado.
        </div>
      `;
      return;
    }

    // Ajustar selectedIndex se fora dos limites
    if (selectedIndex >= currentFiltered.length) selectedIndex = 0;
    if (selectedIndex < 0) selectedIndex = 0;

    dd.innerHTML = currentFiltered.map((item, idx) => {
      const isSelected = idx === selectedIndex;
      const bg = isSelected ? '#e8f0fe' : '#fff';
      const border = isSelected ? 'border-left: 3px solid #1a73e8;' : 'border-left: 3px solid transparent;';

      if (item.type === 'cmd') {
        const cmd = item.data;
        const preview = cmd.message.length > 140 ? cmd.message.slice(0, 140) + "..." : cmd.message;

        return `
          <div class="cmd-item" data-idx="${idx}"
               style="padding:12px 14px; cursor:pointer; border-bottom:1px solid #f1f3f4; background:${bg}; ${border}">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="background:#1a73e8; color:#fff; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:700;">
                /${escapeHtml(cmd.shortcutDisplay)}
              </span>
              <span style="color:#5f6368; font-size:12px;">
                ${cmd.origin === "fixed" ? "Fixa" : "Personalizada"}
              </span>
            </div>
            <div style="margin-top:8px; color:#3c4043; font-size:13px; line-height:1.35;">
              ${escapeHtml(preview)}
            </div>
          </div>
        `;
      } else if (item.type === 'create') {
        return `
          <div class="cmd-item" data-idx="${idx}"
               style="padding:12px 14px; cursor:pointer; border-bottom:1px solid #f1f3f4; background:${bg}; ${border} color: #1a73e8; font-weight: 600;">
             Cadastrar mensagem para "/${escapeHtml(item.query)}"
          </div>
        `;
      }
    }).join("");

    // Scroll se necessário
    const selectedEl = dd.querySelector(`.cmd-item[data-idx="${selectedIndex}"]`);
    if (selectedEl) {
      // scrollIntoView se estiver fora visivel
      // Simples:
      // selectedEl.scrollIntoView({ block: 'nearest' });
    }

    dd.querySelectorAll(".cmd-item").forEach(el => {
      el.addEventListener("mouseenter", () => {
        selectedIndex = parseInt(el.dataset.idx);
        renderDropdown();
      });

      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("[Shortcuts] Click detectado no item:", selectedIndex);
        executarAcaoSelecionada();
      });
    });
  }

  function executarAcaoSelecionada() {
    console.log("[Shortcuts] executarAcaoSelecionada chamado");
    console.log("[Shortcuts] activeInputEl:", activeInputEl);
    console.log("[Shortcuts] selectedIndex:", selectedIndex);
    console.log("[Shortcuts] currentFiltered:", currentFiltered);

    if (!activeInputEl || !currentFiltered[selectedIndex]) {
      console.warn("[Shortcuts] Condição falhou - activeInputEl ou item não existe");
      return;
    }

    const item = currentFiltered[selectedIndex];
    console.log("[Shortcuts] Item selecionado:", item);

    if (item.type === 'cmd') {
      console.log("[Shortcuts] Inserindo mensagem:", item.data.message);
      inserirMensagemSubstituindoSlashQuery(activeInputEl, item.data.message);
      closeDropdown();
    } else if (item.type === 'create') {
      const query = item.query;
      closeDropdown();
      abrirModalCriarAtalho(query);
    }
  }

  function abrirModalCriarAtalho(defaultShortcut) {
    if (!window.UIBuilder) {
      alert("Erro: Modulo UIBuilder não carregado.");
      return;
    }

    UIBuilder.criarModalFormulario({
      title: 'Cadastrar Nova Mensagem',
      fields: [
        {
          name: 'shortcut',
          label: 'Atalho Personalizado',
          type: 'text',
          required: true,
          value: defaultShortcut,
          placeholder: 'Ex: bomdia'
        },
        {
          name: 'message',
          label: 'Mensagem',
          type: 'textarea',
          required: true,
          value: '',
          placeholder: 'Digite a mensagem completa aqui...'
        }
      ],
      onSave: async (formData) => {
        const newShortcut = normalizeShortcutDisplay(formData.shortcut);
        const newMessage = formData.message;

        if (!newShortcut || !newMessage) return;

        const data = await StorageHelper.get(["customMessages", "messageShortcuts"]);
        const customs = data.customMessages || [];
        const shortcuts = data.messageShortcuts || {};

        customs.push(newMessage);
        const newIndex = customs.length - 1;

        // Salvar atalho
        shortcuts[`custom_${newIndex}`] = newShortcut;

        await StorageHelper.set({
          customMessages: customs,
          messageShortcuts: shortcuts
        });

        // Recarregar cache
        carregarAtalhosMensagens();

        // Tentar inserir se o input ainda estiver lá? Talvez melhor não, apenas salvar.
        // Mas seria legal feedback.
        // alert("Mensagem cadastrada com sucesso!");
      }
    });
  }


  function positionDropdownNearInput(inputEl, dd) {
    const rect = inputEl.getBoundingClientRect();

    const margin = 8;
    const width = Math.min(560, window.innerWidth - 40);
    dd.style.width = `${width}px`;

    let left = rect.left;
    left = Math.max(20, Math.min(left, window.innerWidth - width - 20));
    dd.style.left = `${left}px`;

    dd.style.top = `0px`;
    dd.style.display = "block";
    const h = dd.offsetHeight || 240;

    let top = rect.top - h - margin;
    // Se não couber em cima, tentar embaixo?
    // Mas a lógica original era cima por padrão (estilo slack as vezes).
    // Vou manter lógica original mas garantir que não saia da tela
    if (top < 20) top = rect.bottom + margin;

    dd.style.top = `${top}px`;
  }

  function getTextBeforeCaret(el) {
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return "";

      const range = sel.getRangeAt(0).cloneRange();
      range.selectNodeContents(el);
      range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      return range.toString();
    }

    const start = el.selectionStart ?? (el.value ? el.value.length : 0);
    return (el.value || "").slice(0, start);
  }

  function findLastValidSlashIndex(text) {
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] !== "/") continue;

      if (text[i - 1] === "/") continue;

      const tail = text.slice(Math.max(0, i - 10), i + 1).toLowerCase();
      if (tail.includes("http://") || tail.includes("https://")) continue;

      return i;
    }
    return -1;
  }

  function findActiveSlashQuery(textBeforeCaret) {
    const lastSlash = findLastValidSlashIndex(textBeforeCaret);
    if (lastSlash < 0) return null;

    const after = textBeforeCaret.slice(lastSlash + 1);

    if (after.length > MAX_SHORTCUT_LEN) return null;

    if (after.length > 0 && INVALID_CHARS_TEST.test(after)) return null;

    return { slashIndex: lastSlash, query: after };
  }

  function inserirMensagemSubstituindoSlashQuery(el, message) {
    console.log("[Shortcuts] inserirMensagemSubstituindoSlashQuery chamado");
    console.log("[Shortcuts] Elemento:", el);
    console.log("[Shortcuts] Mensagem:", message);
    console.log("[Shortcuts] isContentEditable:", el.isContentEditable);

    if (el.isContentEditable) {
      const before = getTextBeforeCaret(el);
      const active = findActiveSlashQuery(before);

      console.log("[Shortcuts] ContentEditable - before:", before);
      console.log("[Shortcuts] ContentEditable - active:", active);

      const fullText = el.textContent || "";
      const caretPos = before.length;

      let start, end;

      if (active) {
        start = active.slashIndex;
        end = caretPos;
      } else {
        start = caretPos;
        end = caretPos;
      }

      const newText = fullText.slice(0, start) + message + fullText.slice(end);
      console.log("[Shortcuts] ContentEditable - newText:", newText);

      el.textContent = newText;
      el.focus();
      setCaretContentEditable(el, start + message.length);
      el.dispatchEvent(new Event("input", { bubbles: true }));

      console.log("[Shortcuts] ContentEditable - Mensagem inserida!");
      return;
    }

    const before = getTextBeforeCaret(el);
    const active = findActiveSlashQuery(before);

    console.log("[Shortcuts] Textarea/Input - before:", before);
    console.log("[Shortcuts] Textarea/Input - active:", active);

    const value = el.value || "";
    const caretPos = el.selectionStart ?? before.length;

    let start, end;

    if (active) {
      start = active.slashIndex;
      end = caretPos;
    } else {
      start = caretPos;
      end = caretPos;
    }

    const newValue = value.slice(0, start) + message + value.slice(end);
    console.log("[Shortcuts] Textarea/Input - newValue:", newValue);

    el.value = newValue;

    const newCaret = start + message.length;
    el.focus();
    el.setSelectionRange(newCaret, newCaret);

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    console.log("[Shortcuts] Textarea/Input - Mensagem inserida!");
  }

  function setCaretContentEditable(el, pos) {
    const range = document.createRange();
    const sel = window.getSelection();

    let current = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);

    let textNode = null;
    let offset = 0;

    while (walker.nextNode()) {
      const n = walker.currentNode;
      const len = n.nodeValue.length;
      if (current + len >= pos) {
        textNode = n;
        offset = pos - current;
        break;
      }
      current += len;
    }

    if (!textNode) {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      range.setStart(textNode, offset);
      range.collapse(true);
    }

    sel.removeAllRanges();
    sel.addRange(range);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function resolveInputEl(target) {
    if (!target) return null;
    if (target.matches?.('textarea, [contenteditable="true"], [role="textbox"]')) return target;
    return target.closest?.('textarea, [contenteditable="true"], [role="textbox"]') || null;
  }

  async function handleTyping(target) {
    const el = resolveInputEl(target);
    if (!el) return;

    await ensureCacheReady();

    const before = getTextBeforeCaret(el);
    const active = findActiveSlashQuery(before);

    if (active) {
      const queryNorm = normForMatch(active.query);

      // Verificar se existe match exato para expansão imediata
      // Regra:
      // 1. Deve haver um match exato.
      // 2. Não deve haver OUTROS matches que comecem com o mesmo prefixo (para não impedir de digitar atalhos mais longos).
      // Ex: se tenho "bom" e "bomdia", digitar "bom" não deve expandir "bom" imediatamente.

      const exactMatch = commandsCache.find(cmd => cmd.shortcutNorm === queryNorm);
      const potentialMatches = commandsCache.filter(cmd => cmd.shortcutNorm.startsWith(queryNorm));

      // Se match único e exato, expande agora.
      if (exactMatch && potentialMatches.length === 1) {
        inserirMensagemSubstituindoSlashQuery(el, exactMatch.message);
        closeDropdown();
        return;
      }

      if (!isOpen || activeInputEl !== el) {
        openDropdown(el, active.query);
      } else {
        currentQuery = active.query;
        renderDropdown();
        positionDropdownNearInput(el, dropdownEl);
      }
    } else {
      if (isOpen) closeDropdown();
    }
  }

  function handleKeyDown(e) {
    if (!isOpen || !activeInputEl) return;

    // Passar navegação
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex++;
      renderDropdown();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex--;
      renderDropdown();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      executarAcaoSelecionada();
    }
  }

  function init() {
    carregarAtalhosMensagens();

    StorageHelper.addListener((changes, namespace) => {
      if (namespace === "local" && (changes.messageShortcuts || changes.customMessages || changes[NAME_KEY] ||
        changes[SECTOR_KEY])) {
        carregarAtalhosMensagens();
      }
    });

    document.addEventListener("input", (event) => handleTyping(event.target));
    document.addEventListener("keyup", (event) => handleTyping(event.target));

    // Novo: Keydown para navegação
    document.addEventListener("keydown", (event) => {
      // Auto-expansão com Espaço
      if (event.key === ' ' && activeInputEl) {
        const before = getTextBeforeCaret(activeInputEl);
        const active = findActiveSlashQuery(before);
        if (active) {
          const queryNorm = normForMatch(active.query);
          const exactMatch = commandsCache.find(cmd => cmd.shortcutNorm === queryNorm);
          if (exactMatch) {
            event.preventDefault(); // Evitar o espaço extra
            inserirMensagemSubstituindoSlashQuery(activeInputEl, exactMatch.message);
            closeDropdown();
            return;
          }
        }
      }

      if (isOpen) {
        // Se dropdown aberto, verificar se é navegação
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
          if (event.key === 'Escape') {
            closeDropdown();
            return;
          }
          handleKeyDown(event);
          return;
        }
      }
    });

    document.addEventListener("focusin", (event) => handleTyping(event.target));

    document.addEventListener("mousedown", (e) => {
      if (!isOpen) return;
      if (dropdownEl && dropdownEl.contains(e.target)) return;
      if (activeInputEl && (e.target === activeInputEl || activeInputEl.contains(e.target))) return;
      closeDropdown();
    });

    window.addEventListener("resize", () => {
      if (isOpen && activeInputEl && dropdownEl) positionDropdownNearInput(activeInputEl, dropdownEl);
    }, { passive: true });

    window.addEventListener("scroll", () => {
      if (isOpen && activeInputEl && dropdownEl) positionDropdownNearInput(activeInputEl, dropdownEl);
    }, { passive: true, capture: true });
  }

  return { init };
})();

window.ShortcutsModule = ShortcutsModule;