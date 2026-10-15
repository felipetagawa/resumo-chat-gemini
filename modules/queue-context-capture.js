// modules/queue-context-capture.js
// Reads the open SZ transcript as {chatId, messages}. Fails closed when ownership is unclear.
const QueueContextCapture = (() => {
  const AUTO_RE = /^autom[aá]tico\b/i;
  function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function key(value) { return clean(value).toLocaleLowerCase("pt-BR"); }
  function activeCard() {
    const active = Array.from(document.querySelectorAll(".sz_contact"))
      .filter(card => /(?:^|\s)(?:active|selected|open)(?:\s|$)/.test(String(card.className)));
    return active.length === 1 ? active[0] : null;
  }
  function roleOf(msg, name) {
    if (AUTO_RE.test(name)) return "system";
    if (msg.classList.contains("sent")) return "agent";
    if (msg.classList.contains("received")) return "client";
    return "system";
  }
  function foreign(msg, chatId) {
    for (let node = msg; node; node = node.parentElement) {
      const owner = node.getAttribute?.("data-chat-id");
      if (owner && owner !== chatId) return true;
    }
    return false;
  }
  function read() {
    const card = activeCard();
    if (!card) return null;
    const chatId = clean(card.getAttribute("data-chat-id"));
    const sameId = Array.from(document.querySelectorAll(".sz_contact")).filter(c => clean(c.getAttribute("data-chat-id")) === chatId);
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
      if (foreign(msg, chatId)) continue;
      const name = clean(msg.querySelector(".name")?.textContent);
      const text = clean(msg.querySelector(".message span")?.textContent || msg.querySelector(".message")?.textContent);
      if (!text) continue;
      const role = roleOf(msg, name);
      if (role === "client" && isCustomer(key(name))) customerSeen = true;
      messages.push({ role, text });
    }
    // SZ can switch the active card before swapping the transcript: require the customer's own name.
    return customerSeen ? { chatId, messages } : null;
  }
  return Object.freeze({ read });
})();
globalThis.QueueContextCapture = QueueContextCapture;
