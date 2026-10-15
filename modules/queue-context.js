// modules/queue-context.js
// Context strip below each native queue card. Never inside a card, never floating.
const QueueContextModule = (() => {
  const ROOT = "atendeai-queue-ctx";
  const LIST_SELECTOR = ".chats-list, .contacts-list, .contact-list";
  let observer, timer, disabled = false, items = {};

  function rect(node) { return node?.getBoundingClientRect?.() || null; }
  function overlaps(a, b) {
    return !!(a && b) && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
  }
  function chatIdOf(card, all) {
    const value = String(card?.getAttribute("data-chat-id") || "").trim();
    if (!value) return null;
    return all.filter(c => String(c.getAttribute("data-chat-id") || "").trim() === value).length === 1 ? value : null;
  }
  function insideStrip(node) {
    for (let current = node; current; current = current.parentElement) {
      if (current.classList?.contains(ROOT)) return true;
    }
    return false;
  }
  function safeList() {
    for (const list of document.querySelectorAll(LIST_SELECTOR)) {
      if (!list.parentElement || !list.querySelector(".sz_contact")) continue;
      // Our own inline editor lives in a strip inside the list; only native fields disqualify it.
      if (Array.from(list.querySelectorAll("input, textarea, .msg")).some(node => !insideStrip(node))) continue;
      return list;
    }
    return null;
  }
  function flowSafe(all) {
    if (!globalThis.getComputedStyle) return true;
    return all.every(card => {
      const own = getComputedStyle(card), parent = getComputedStyle(card.parentElement);
      if (own.position === "absolute" || own.position === "fixed") return false;
      if (own.transform && own.transform !== "none") return false;
      if (parent.display === "grid" || parent.display === "inline-grid") return false;
      return !(String(parent.display).includes("flex") && !String(parent.flexDirection).startsWith("column"));
    });
  }
  function hasContent(item) { return !!(item?.anydesk || item?.problem?.text); }
  function signature(item) { return JSON.stringify([item?.anydesk || "", item?.problem?.text || "", item?.problem?.source || ""]); }

  async function copy(button, digits) {
    try { await navigator.clipboard.writeText(digits); } catch (_) { return; }
    const label = button.textContent, done = "copiado ✓";
    button.textContent = done;
    setTimeout(() => { if (button.textContent === done) button.textContent = label; }, 1500);
  }
  function startEdit(strip, span) {
    const id = strip.getAttribute("data-for-chat");
    const input = document.createElement("input");
    input.type = "text"; input.className = `${ROOT}-input`; input.maxLength = QueueContextParse.LIMIT;
    input.value = span.textContent; input.setAttribute("aria-label", "Editar linha do problema");
    let finished = false;
    const finish = async save => {
      if (finished) return; finished = true;
      const text = save ? QueueContextParse.normalizeLine(input.value) : "";
      if (text) items[id] = await QueueContextStore.merge(id, { problem: { text, source: "manual" } }) || items[id];
      input.remove();
      strip.setAttribute("data-signature", "");
      reconcile();
    };
    input.addEventListener("keydown", event => {
      event.stopPropagation?.(); // SZ global shortcuts must not see keys typed here.
      if (event.key === "Enter") { event.preventDefault?.(); return finish(true); }
      if (event.key === "Escape") { event.preventDefault?.(); return finish(false); }
    });
    input.addEventListener("blur", () => finish(false));
    strip.insertBefore(input, span); span.remove();
    input.focus(); input.select?.();
  }
  function fill(strip, item) {
    Array.from(strip.children).forEach(child => child.remove());
    strip.setAttribute("data-signature", signature(item));
    if (item.anydesk) {
      const code = document.createElement("button");
      code.type = "button"; code.className = `${ROOT}-code`;
      code.textContent = `🖥 ${QueueContextParse.formatAnyDesk(item.anydesk)}`;
      code.title = "Copiar código AnyDesk";
      code.setAttribute("aria-label", `Copiar AnyDesk ${item.anydesk}`);
      strip.appendChild(code);
      code.addEventListener("click", () => copy(code, item.anydesk));
    }
    if (item.problem?.text) {
      if (item.anydesk) {
        const sep = document.createElement("span");
        sep.className = `${ROOT}-sep`; sep.textContent = "·"; sep.setAttribute("aria-hidden", "true");
        strip.appendChild(sep);
      }
      const line = document.createElement("span");
      line.className = `${ROOT}-problem`; line.setAttribute("data-source", item.problem.source);
      line.textContent = item.problem.text; line.title = item.problem.text;
      line.addEventListener("dblclick", () => startEdit(strip, line));
      strip.appendChild(line);
    }
  }
  function build(id, item) {
    const strip = document.createElement("div");
    strip.className = ROOT; strip.setAttribute("data-for-chat", id);
    fill(strip, item);
    return strip;
  }
  function indent(strip, card) {
    const name = rect(card.querySelector(".contact-name")), own = rect(card);
    if (!name || !own) return;
    const value = `${Math.max(0, Math.round(name.left - own.left))}px`;
    if (strip.style.paddingLeft !== value) strip.style.paddingLeft = value;
  }
  function disable(reason) {
    disabled = true; observer?.disconnect(); clearTimeout(timer);
    document.querySelectorAll(`.${ROOT}`).forEach(node => node.remove());
    console.warn(`[AtendeAI] Contexto na fila desligado: ${reason}.`);
  }

  function reconcile() {
    if (disabled) return;
    const list = safeList(), strips = Array.from(document.querySelectorAll(`.${ROOT}`));
    if (!list) { strips.forEach(strip => strip.remove()); return; }
    const all = Array.from(list.querySelectorAll(".sz_contact"));
    // A framework wrapper per card could clip or overflow onto the next card unseen: fail closed.
    if (!all.every(card => card.parentElement === list)) { disable("cards dentro de contêineres próprios"); return; }
    if (!flowSafe(all)) { disable("lista sem fluxo normal"); return; }
    const wanted = new Map();
    for (const card of all) {
      const id = chatIdOf(card, all);
      if (id && hasContent(items[id])) wanted.set(id, card);
    }
    for (const strip of strips) {
      const card = wanted.get(strip.getAttribute("data-for-chat"));
      if (!card || card.nextElementSibling !== strip) strip.remove();
    }
    for (const [id, card] of wanted) {
      let strip = card.nextElementSibling;
      if (!strip?.classList?.contains(ROOT) || strip.getAttribute("data-for-chat") !== id) {
        strip = build(id, items[id]);
        card.parentElement.insertBefore(strip, card.nextElementSibling);
      } else if (strip.getAttribute("data-signature") !== signature(items[id]) && !strip.querySelector("input")) {
        fill(strip, items[id]);
      }
      indent(strip, card);
      const own = rect(strip);
      if (overlaps(own, rect(card)) || overlaps(own, rect(strip.nextElementSibling))) {
        disable("sobreposição detectada"); return;
      }
    }
  }

  function ours(record) {
    for (let node = record?.target; node; node = node.parentElement) {
      if (node.classList?.contains(ROOT)) return true;
    }
    const changed = [...(record?.addedNodes || []), ...(record?.removedNodes || [])];
    return changed.length > 0 && changed.every(node => node.classList?.contains?.(ROOT));
  }
  function schedule() {
    if (disabled) return;
    clearTimeout(timer); timer = setTimeout(tick, 250);
  }
  const pending = new Set();
  async function capture() {
    const snapshot = QueueContextCapture.read();
    if (!snapshot) return;
    const P = QueueContextParse, { chatId, messages } = snapshot;
    const source = P.problemMessages(messages), heuristic = P.heuristicLine(source.texts);
    const saved = await QueueContextStore.merge(chatId, {
      anydesk: P.detectAnyDesk(messages),
      problem: heuristic ? { text: heuristic, source: "heuristic" } : null
    });
    if (saved) items[chatId] = saved;
    const input = source.beforeDivider ? P.buildAiInput(source.texts) : "";
    if (!input || saved?.aiRequested || pending.has(chatId)) return;
    pending.add(chatId);
    items[chatId] = await QueueContextStore.merge(chatId, { aiRequested: true });
    await requestLine(chatId, input).finally(() => pending.delete(chatId));
  }
  async function requestLine(chatId, mensagens) {
    try {
      const response = await MessagingHelper.send({ action: "gerarLinhaProblema", mensagens });
      const text = response?.success ? QueueContextParse.normalizeLine(response.linha) : "";
      if (text) items[chatId] = await QueueContextStore.merge(chatId, { problem: { text, source: "ai" } });
    } catch (_) {
      // Heuristic stays; one request per attendance, no retry and no visible error.
    }
  }
  async function tick() {
    if (disabled) return;
    try { await capture(); } catch (error) { console.warn(`[AtendeAI] Contexto na fila: captura ignorada (${error?.message}).`); }
    reconcile();
  }

  async function mount() {
    if (observer || disabled) return;
    await QueueContextStore.prune();
    items = await QueueContextStore.all();
    observer = new MutationObserver(records => { if (records.some(record => !ours(record))) schedule(); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    chrome.storage.onChanged?.addListener?.((changes, area) => {
      if (area !== "local" || !changes[QueueContextStore.KEY]) return;
      void QueueContextStore.all().then(next => { items = next; schedule(); });
    });
    schedule();
  }

  return { mount, reconcile };
})();
globalThis.QueueContextModule = QueueContextModule;
