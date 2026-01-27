const ShortcutsModule = (() => {
  let commandsCache = [];
  let dropdownEl = null;
  let activeInputEl = null;
  let isOpen = false;

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
    "Atualmente, a fase inicial da Reforma Tributária com IBS e CBS se aplica apenas às empresas do regime normal (Lucro Presumido e Lucro Real), sendo que para o Simples Nacional não há recolhimento nem impacto prático neste primeiro ano, pois as informações são utilizadas apenas de forma nominativa e experimental.",
    "A reformulação das telas não altera a lógica de cálculo nem as regras fiscais do sistema, sendo uma evolução voltada à melhoria contínua, e qualquer diferença percebida está relacionada apenas à interface ou fluxo, com nossa equipe disponível para esclarecer dúvidas e ajustar eventuais pontos específicos.",
    "As telas reformuladas de Contas a Receber, Contas a Pagar, NFC-e e Cadastro de Produtos mantêm as mesmas regras fiscais e operacionais de antes, tendo sido alterados apenas aspectos visuais e funcionais para melhorar usabilidade e organização, sem impacto nos cálculos ou validações já existentes.",
    "A emissão de NFC-e para CNPJ deixou de ser permitida por determinação das normas fiscais vigentes, não sendo uma regra criada pelo sistema, que apenas aplica automaticamente essa exigência legal para evitar rejeições e problemas fiscais ao contribuinte.",
    "O procedimento de referenciar NFC-e em uma NF-e não é mais aceito pela legislação fiscal atual, motivo pelo qual o sistema bloqueia essa prática, garantindo conformidade legal e evitando a rejeição dos documentos junto à SEFAZ.",
    "A vedação à emissão de NFC-e para CNPJ e ao seu referenciamento em NF-e decorre exclusivamente de alterações nas regras fiscais, e o sistema apenas segue essas determinações para manter a regularidade das operações e evitar inconsistências legais."
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
          if (!shortcutDisplay) return;

          nextCache.push({
            key,
            shortcutDisplay,
            shortcutNorm: normForMatch(shortcutDisplay),
            message: msg,
            origin: "fixed"
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

        if (mySeq === loadSeq) commandsCache = nextCache;
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

    const dd = ensureDropdown();
    renderDropdown(query);

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
  }

  function renderDropdown(queryRaw) {
    const dd = ensureDropdown();
    const queryNorm = normForMatch(queryRaw);

    const filtered = commandsCache.filter(cmd => {
      if (!queryNorm) return true;
      return cmd.shortcutNorm.startsWith(queryNorm);
    });

    if (!filtered.length) {
      dd.innerHTML = `
        <div style="padding:12px 14px; color:#5f6368; font-size:13px;">
          Nenhum atalho encontrado para <b>/${escapeHtml(queryRaw || "")}</b>
        </div>
      `;
      return;
    }

    dd.innerHTML = filtered.map(cmd => {
      const preview = cmd.message.length > 140 ? cmd.message.slice(0, 140) + "..." : cmd.message;

      return `
        <div class="cmd-item" data-key="${escapeHtml(cmd.key)}"
             style="padding:12px 14px; cursor:pointer; border-bottom:1px solid #f1f3f4;">
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
    }).join("");

    dd.querySelectorAll(".cmd-item").forEach(el => {
      el.addEventListener("mouseenter", () => el.style.background = "#f8f9fa");
      el.addEventListener("mouseleave", () => el.style.background = "#fff");

      el.addEventListener("click", () => {
        const key = el.getAttribute("data-key");
        const cmd = commandsCache.find(c => c.key === key);
        if (!cmd || !activeInputEl) return;

        inserirMensagemSubstituindoSlashQuery(activeInputEl, cmd.message);
        closeDropdown();
      });
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
    if (el.isContentEditable) {
      const before = getTextBeforeCaret(el);
      const active = findActiveSlashQuery(before);
      if (!active) return;

      const fullText = el.textContent || "";
      const caretPos = before.length;

      const start = active.slashIndex;
      const end = caretPos;

      const newText = fullText.slice(0, start) + message + fullText.slice(end);

      el.focus();
      el.textContent = newText;

      setCaretContentEditable(el, start + message.length);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const before = getTextBeforeCaret(el);
    const active = findActiveSlashQuery(before);
    if (!active) return;

    const caretPos = el.selectionStart ?? before.length;
    const start = active.slashIndex;
    const end = caretPos;

    const value = el.value || "";
    const newValue = value.slice(0, start) + message + value.slice(end);

    el.value = newValue;

    const newCaret = start + message.length;
    el.focus();
    el.setSelectionRange(newCaret, newCaret);

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
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
    if (!commandsCache.length) {
      if (isOpen) closeDropdown();
      return;
    }

    const before = getTextBeforeCaret(el);
    const active = findActiveSlashQuery(before);

    if (active) {
      if (!isOpen || activeInputEl !== el) {
        openDropdown(el, active.query);
      } else {
        renderDropdown(active.query);
        positionDropdownNearInput(el, dropdownEl);
      }
    } else {
      if (isOpen) closeDropdown();
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

    document.addEventListener("focusin", (event) => handleTyping(event.target));

    document.addEventListener("mousedown", (e) => {
      if (!isOpen) return;
      if (dropdownEl && dropdownEl.contains(e.target)) return;
      if (activeInputEl && (e.target === activeInputEl || activeInputEl.contains(e.target))) return;
      closeDropdown();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) closeDropdown();
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