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
  function safeList() {
    for (const list of document.querySelectorAll(LIST_SELECTOR)) {
      if (!list.parentElement || !list.querySelector(".sz_contact")) continue;
      if (list.querySelector("input, textarea, .msg")) continue;
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
  async function tick() {
    if (disabled) return;
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
