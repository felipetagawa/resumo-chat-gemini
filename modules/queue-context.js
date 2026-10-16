// modules/queue-context.js
// Context strip below each native queue card. Never inside a card, never floating.
const QueueContextModule = (() => {
  const ROOT = "atendeai-queue-ctx";
  // #contact-fields is the real SZ queue (pre-controls uses it too); the class names are older adapters.
  const LIST_SELECTOR = "#contact-fields, .contacts-field.contact-scroll, .chats-list, .contacts-list, .contact-list";
  const WRAPPER = "sz_contact-wrapper";
  const AI_MAX_ATTEMPTS = 3, AI_RETRY_MS = 2 * 60 * 1000;
  // Options page switches; both default on. Off hides that part and, for the problem, skips the AI call.
  const PREF_KEYS = Object.freeze({ anydesk: "atendeai_queue_context_anydesk", problem: "atendeai_queue_context_problem" });
  let observer, timer, disabled = false, items = {}, lastRejection = "", prefs = { anydesk: true, problem: true };

  function rect(node) { return node?.getBoundingClientRect?.() || null; }
  function overlaps(a, b) {
    return !!(a && b) && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
  }
  function chatIdOf(card, all) {
    const value = QueueContextCapture.idOf(card);
    if (!value) return null;
    return all.filter(c => QueueContextCapture.idOf(c) === value).length === 1 ? value : null;
  }
  // SZ wraps every card in its own native .sz_contact-wrapper; the strip goes after that wrapper.
  function unitOf(card) {
    const parent = card.parentElement;
    return parent?.classList?.contains(WRAPPER) && parent.querySelectorAll(".sz_contact").length === 1 ? parent : card;
  }
  function insideStrip(node) {
    for (let current = node; current; current = current.parentElement) {
      if (current.classList?.contains(ROOT)) return true;
    }
    return false;
  }
  // A left-column list of usable size whose first clipping box (itself or an ancestor) scrolls natively.
  // The real SZ list is a block that scrolls through .active_contacts_list, not a flex column scrolling itself.
  function layoutProblem(list) {
    const r = rect(list);
    const half = Number(globalThis.innerWidth) / 2;
    if (r && (r.width < 210 || r.height < 200)) return "lista pequena demais";
    if (r && half > 0 && r.left > half) return "lista fora da coluna esquerda";
    if (!globalThis.getComputedStyle) return "";
    for (let node = list; node && node !== document.body; node = node.parentElement) {
      const overflowY = String(getComputedStyle(node).overflowY || "visible");
      if (overflowY === "visible") continue;
      return /auto|scroll/.test(overflowY) ? "" : "lista recortada sem rolagem";
    }
    return "lista sem rolagem nativa";
  }
  function safeList() {
    let problem = "";
    for (const list of document.querySelectorAll(LIST_SELECTOR)) {
      if (list === document.body || !list.parentElement || !list.querySelector(".sz_contact")) continue;
      const layout = layoutProblem(list);
      if (layout) { problem = layout; continue; }
      // Our own inline editor lives in a strip inside the list; only native fields disqualify it.
      if (Array.from(list.querySelectorAll("input, textarea, .msg")).some(node => !insideStrip(node))) {
        problem = "campos nativos dentro da lista"; continue;
      }
      lastRejection = "";
      return list;
    }
    problem = problem || "lista da fila não encontrada";
    // Say once why nothing renders, instead of failing silently on every tick.
    if (problem !== lastRejection) { lastRejection = problem; console.warn(`[AtendeAI] Contexto na fila sem faixas: ${problem}.`); }
    return null;
  }
  function flowSafe(units) {
    if (!globalThis.getComputedStyle) return true;
    return units.every(unit => {
      const own = getComputedStyle(unit), parent = getComputedStyle(unit.parentElement);
      if (own.position === "absolute" || own.position === "fixed") return false;
      if (own.transform && own.transform !== "none") return false;
      if (parent.display === "grid" || parent.display === "inline-grid") return false;
      return !(String(parent.display).includes("flex") && !String(parent.flexDirection).startsWith("column"));
    });
  }
  // What the strip shows. The heuristic line (first customer words, cut) rarely says what the problem is,
  // so only an AI or manual label is shown; the heuristic stays stored but is never displayed.
  function view(item) {
    const problem = item?.problem?.text && item.problem.source !== "heuristic" ? item.problem : null;
    return { anydesk: prefs.anydesk ? item?.anydesk || null : null, problem: prefs.problem ? problem : null };
  }
  function hasContent(item) { const v = view(item); return !!(v.anydesk || v.problem); }
  function signature(item) { const v = view(item); return JSON.stringify([v.anydesk || "", v.problem?.text || "", v.problem?.source || ""]); }

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
  function fill(strip, stored) {
    Array.from(strip.children).forEach(child => child.remove());
    strip.setAttribute("data-signature", signature(stored));
    const item = view(stored);
    if (item.anydesk) {
      const code = document.createElement("button");
      code.type = "button"; code.className = `${ROOT}-code`;
      code.textContent = `🖥 ${QueueContextParse.formatAnyDesk(item.anydesk)}`;
      code.title = "Copiar código AnyDesk";
      code.setAttribute("aria-label", `Copiar AnyDesk ${item.anydesk}`);
      strip.appendChild(code);
      code.addEventListener("click", () => copy(code, item.anydesk));
    }
    if (item.problem) {
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
  function disable(reason) {
    disabled = true; observer?.disconnect(); clearTimeout(timer);
    document.querySelectorAll(`.${ROOT}`).forEach(node => node.remove());
    console.warn(`[AtendeAI] Contexto na fila desligado: ${reason}.`);
  }

  function reconcile() {
    if (disabled) return;
    const list = safeList(), strips = Array.from(document.querySelectorAll(`.${ROOT}`));
    if (!list) { strips.forEach(strip => strip.remove()); return; }
    const all = Array.from(list.querySelectorAll(".sz_contact")), units = all.map(unitOf);
    // Cards sit directly in the list, or each in its own native wrapper, all wrappers side by side.
    // Any other per-card container could clip or overflow onto the next card unseen: fail closed.
    const host = units[0]?.parentElement;
    const placed = units.every((unit, i) => unit === all[i] ? unit.parentElement === list
      : unit.parentElement === host && list.contains(host));
    if (!placed) { disable("cards dentro de contêineres próprios"); return; }
    if (!flowSafe(units)) { disable("lista sem fluxo normal"); return; }
    const wanted = new Map();
    for (const card of all) {
      const id = chatIdOf(card, all);
      if (id && hasContent(items[id])) wanted.set(id, card);
    }
    for (const strip of strips) {
      const card = wanted.get(strip.getAttribute("data-for-chat"));
      if (!card || unitOf(card).nextElementSibling !== strip) strip.remove();
    }
    for (const [id, card] of wanted) {
      const unit = unitOf(card);
      let strip = unit.nextElementSibling;
      if (!strip?.classList?.contains(ROOT) || strip.getAttribute("data-for-chat") !== id) {
        strip = build(id, items[id]);
        unit.parentElement.insertBefore(strip, unit.nextElementSibling);
      } else if (strip.getAttribute("data-signature") !== signature(items[id]) && !strip.querySelector("input")) {
        fill(strip, items[id]);
      }
      const own = rect(strip);
      if (overlaps(own, rect(unit)) || overlaps(own, rect(strip.nextElementSibling))) {
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
    if (!prefs.anydesk && !prefs.problem) return;
    const snapshot = QueueContextCapture.read();
    if (!snapshot) return;
    const P = QueueContextParse, { chatId, messages } = snapshot;
    const source = P.problemMessages(messages), heuristic = P.heuristicLine(source.texts);
    const saved = await QueueContextStore.merge(chatId, {
      anydesk: P.detectAnyDesk(messages),
      problem: heuristic ? { text: heuristic, source: "heuristic" } : null
    });
    if (saved) items[chatId] = saved;
    const input = P.aiReady(source) ? P.buildAiInput(source.texts) : "";
    if (!prefs.problem || !input || pending.has(chatId) || !aiDue(saved, input)) return;
    pending.add(chatId);
    items[chatId] = await QueueContextStore.merge(chatId,
      { aiAttempt: { size: input.length, nextAt: Date.now() + AI_RETRY_MS } });
    await requestLine(chatId, input).finally(() => pending.delete(chatId));
  }
  // A few tries per attendance, spaced out: after a failure any input may retry; after an answer
  // without a usable line, only once the customer has written more.
  function aiDue(saved, input) {
    if (["ai", "manual"].includes(saved?.problem?.source)) return false;
    const attempts = Number(saved?.aiAttempts) || (saved?.aiRequested ? 1 : 0);
    if (attempts >= AI_MAX_ATTEMPTS) return false;
    if (!attempts) return true;
    return Date.now() >= (Number(saved.aiNextAt) || 0) && input.length > (Number(saved.aiSize) || 0);
  }
  async function requestLine(chatId, mensagens) {
    let failed = true;
    try {
      const response = await MessagingHelper.send({ action: "gerarLinhaProblema", mensagens });
      failed = !response?.success;
      const text = response?.success ? QueueContextParse.normalizeLine(response.linha) : "";
      if (text) items[chatId] = await QueueContextStore.merge(chatId, { problem: { text, source: "ai" } });
    } catch (_) {
      // No visible error: the next capture after AI_RETRY_MS tries again.
    }
    if (failed) items[chatId] = await QueueContextStore.merge(chatId, { aiFailed: true });
  }
  async function tick() {
    if (disabled) return;
    try { await capture(); } catch (error) { console.warn(`[AtendeAI] Contexto na fila: captura ignorada (${error?.message}).`); }
    reconcile();
  }

  async function mount() {
    if (observer || disabled) return;
    await QueueContextStore.prune(QueueContextParse.isProblemLine);
    items = await QueueContextStore.all();
    const saved = await new Promise(resolve => chrome.storage.local.get(Object.values(PREF_KEYS), data => resolve(data || {})));
    for (const [name, key] of Object.entries(PREF_KEYS)) prefs[name] = saved[key] !== false;
    observer = new MutationObserver(records => { if (records.some(record => !ours(record))) schedule(); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    chrome.storage.onChanged?.addListener?.((changes, area) => {
      if (area !== "local") return;
      let toggled = false;
      for (const [name, key] of Object.entries(PREF_KEYS)) {
        if (changes[key]) { prefs[name] = changes[key].newValue !== false; toggled = true; }
      }
      if (toggled) schedule();
      if (!changes[QueueContextStore.KEY]) return;
      void QueueContextStore.all().then(next => { items = next; schedule(); });
    });
    schedule();
  }

  return { mount, reconcile };
})();
globalThis.QueueContextModule = QueueContextModule;
