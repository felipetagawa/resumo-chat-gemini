// modules/queue-context-capture.js
// Reads the open SZ transcript as {chatId, messages}. Fails closed when ownership is unclear.
const QueueContextCapture = (() => {
  const AUTO_RE = /^autom[aá]tico\b/i;
  const ID_ATTRS = ["data-chat-id", "data-contact-id", "data-id"];
  const TIME_RE = /^\d{2}\/\d{2}\/\d{2}(?:\d{2})? \d{2}:\d{2}(?::\d{2})?$/;
  function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function key(value) { return clean(value).toLocaleLowerCase("pt-BR"); }
  function phoneLike(value) { const d = value.replace(/\D/g, ""); return /^[\d\s()+.-]+$/.test(value) && d.length >= 10 && d.length <= 15; }
  // Real SZ cards carry no id attribute: fall back to the attendance key Smart Reply and recovery use
  // (platform | name | attendance start). A raw data-chat-id keeps keys stored before this fallback.
  function idOf(card) {
    const raw = clean(card?.getAttribute?.("data-chat-id"));
    if (raw && !phoneLike(raw)) return raw;
    for (const attr of ID_ATTRS.slice(1)) {
      const value = clean(card?.getAttribute?.(attr));
      if (value && !phoneLike(value)) return `${attr}:${value}`;
    }
    const src = card?.querySelector?.('img[alt="platform"]')?.getAttribute("src") || "";
    const platform = src.match(/\/assets\/img\/platform\/mini\/([\w-]+)\.svg(?:[?#].*)?$/i)?.[1]?.toLowerCase();
    const name = key(card?.querySelector?.(".contact-name")?.textContent);
    const time = card?.querySelector?.('.contact-times[phase="attendance"] .times');
    const stamp = clean(time?.getAttribute("title") || time?.textContent);
    if (!platform || !name || !TIME_RE.test(stamp)) return null;
    return `attendance:${platform}|${name.replace(/%/g, "%25").replace(/\|/g, "%7C")}|${stamp}`;
  }
  function activeCard() {
    const active = Array.from(document.querySelectorAll(".sz_contact"))
      .filter(card => /(?:^|\s)(?:active|selected|open)(?:\s|$)/.test(String(card.className)));
    return active.length === 1 ? active[0] : null;
  }
  function roleOf(msg, name) {
    if (AUTO_RE.test(name)) return "system";
    if (msg.classList.contains("sent")) return "agent";
    if (msg.classList.contains("received")) return "client";
    // Real SZ messages are a bare .msg: the customer's carry the platform icon beside their name,
    // the technician's carry only the name.
    if (msg.querySelector(".message-details .icon-platform-mini")) return "client";
    if (name && msg.querySelector(".message-details .name")) return "agent";
    return "system";
  }
  // A transcript container tagged with an id the active card also carries, but with another value, is foreign.
  function foreign(msg, card) {
    for (let node = msg; node; node = node.parentElement) {
      for (const attr of ID_ATTRS) {
        const owner = node.getAttribute?.(attr), mine = card.getAttribute(attr);
        if (owner && mine && owner !== mine) return true;
      }
    }
    return false;
  }
  // SZ can keep other chats' transcripts in the DOM, hidden; only what is on screen belongs to the open chat.
  function hidden(msg) { return typeof msg.checkVisibility === "function" && !msg.checkVisibility(); }
  function read() {
    const card = activeCard();
    if (!card) return null;
    const chatId = idOf(card);
    const sameId = Array.from(document.querySelectorAll(".sz_contact")).filter(c => idOf(c) === chatId);
    if (!chatId || sameId.length !== 1) return null;
    const customer = key(card.querySelector(".contact-name")?.textContent);
    // A first name cannot identify an attendance ("Ana Souza" vs "Ana Silva"): only the full name counts,
    // and only when no other card shares it.
    const sameName = Array.from(document.querySelectorAll(".sz_contact"))
      .filter(c => key(c.querySelector(".contact-name")?.textContent) === customer).length;
    if (!customer || sameName !== 1) return null;
    const isCustomer = name => name === customer;
    const messages = []; let customerSeen = false;
    for (const msg of document.querySelectorAll(".msg")) {
      if (foreign(msg, card) || hidden(msg)) continue;
      const name = clean(msg.querySelector(".name")?.textContent);
      let text = clean(msg.querySelector(".message span")?.textContent || msg.querySelector(".message")?.textContent);
      // SZ signs a message with its author ("Felipe: tem o whatsapp deles?").
      if (name && key(text).startsWith(`${key(name)}:`)) text = clean(text.slice(name.length + 1));
      if (!text) continue;
      const role = roleOf(msg, name);
      // Another customer's message means two transcripts are mixed (switching chats): store nothing.
      if (role === "client") { if (!isCustomer(key(name))) return null; customerSeen = true; }
      messages.push({ role, text });
    }
    // SZ can switch the active card before swapping the transcript: require the customer's own name.
    return customerSeen ? { chatId, messages } : null;
  }
  return Object.freeze({ read, idOf });
})();
globalThis.QueueContextCapture = QueueContextCapture;
