// modules/queue-context-parse.js
// Pure parsing for the queue context strip. No DOM, storage or network.
const QueueContextParse = (() => {
  // A queue label, not a sentence: fits the ~286px SZ queue column beside the AnyDesk code.
  const LIMIT = 32, AI_INPUT_LIMIT = 1500;
  const TRANSFER_RE = /transferi/i;
  const REQUEST_RE = /\b(?:any\s?desk|desk)\b|acesso remoto/i;
  const EXCLUDE_RE = /\b(?:cnpj|cpf|tel|telefone|fone|celular|whats|whatsapp|protocolo)\b/i;
  // 9–10 digits with optional single separators; never a slice of a longer number (CPF, CNPJ).
  const CANDIDATE_RE = /(?<!\d[ .-]?)\d(?:[ .-]?\d){8,9}(?![ .-]?\d)/g;
  const GREETING_RE = /(?<!\p{L})(?:oi|olá|ola|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|ok|obrigad[oa]|por favor)(?!\p{L})/giu;
  // SZ webchat records its start button as the customer's first message.
  const BUTTON_RE = /^(?:iniciar|come[cç]ar)$/i;
  // "Thiago Antonio Oliveira da Costa: ..." — a sender prefix (group chats, signatures), two or more name words.
  const AUTHOR_PREFIX_RE = /^\p{Lu}[\p{L}'’.-]*(?: (?:d[aeo]s?|e|\p{Lu}[\p{L}'’.-]*)){1,5}: (?=\S)/u;

  function clean(text) { return String(text || "").replace(/\s+/g, " ").trim(); }
  function withoutAuthor(text) { return clean(text).replace(AUTHOR_PREFIX_RE, ""); }
  function truncate(text) {
    const t = clean(text);
    if (t.length <= LIMIT) return t;
    let cut = t.slice(0, LIMIT - 1);
    // Prefer a word boundary, unless it would throw away more than half the label.
    const space = cut.lastIndexOf(" ");
    if (space >= LIMIT / 2) cut = cut.slice(0, space);
    return `${cut.trimEnd()}…`;
  }
  function candidates(text) {
    return (text.match(CANDIDATE_RE) || []).map(v => v.replace(/\D/g, "")).filter(v => v.length === 9 || v.length === 10);
  }
  function isClient(m) { return m?.role === "client"; }

  function detectAnyDesk(messages) {
    let sinceRequest = Infinity, found = null;
    for (const m of messages || []) {
      const text = clean(m?.text);
      if (!isClient(m)) { if (REQUEST_RE.test(text)) sinceRequest = 0; continue; }
      sinceRequest += 1;
      if (EXCLUDE_RE.test(text)) continue;
      const list = candidates(text);
      if (!list.length) continue;
      const onlyNumber = list.length === 1 && /^[\d .-]+$/.test(text);
      if (sinceRequest <= 3 || onlyNumber) found = list[list.length - 1];
    }
    return found;
  }

  function dividerIndex(list) {
    let transfer = -1;
    list.forEach((m, i) => { if (!isClient(m) && TRANSFER_RE.test(clean(m?.text))) transfer = i; });
    return transfer >= 0 ? transfer : list.findIndex(m => m?.role === "agent");
  }
  function problemMessages(messages) {
    const list = messages || [], index = dividerIndex(list);
    const texts = items => items.filter(isClient).map(m => withoutAuthor(m.text)).filter(Boolean);
    // No divider yet: the technician has not taken the chat, so the input is not final.
    if (index < 0) return { texts: texts(list), beforeDivider: false };
    const before = texts(list.slice(0, index));
    // Greetings alone before the divider are not a problem description worth an AI call.
    if (before.some(meaningful)) return { texts: before, beforeDivider: true };
    return { texts: texts(list.slice(index + 1)), beforeDivider: false };
  }

  function meaningful(text) {
    const t = clean(text);
    return !BUTTON_RE.test(t) && t.replace(GREETING_RE, "").replace(/[^\p{L}]/gu, "").length >= 3;
  }
  function heuristicLine(texts) {
    const first = (texts || []).find(meaningful);
    return first ? truncate(first) : "";
  }

  function buildAiInput(texts) {
    const out = []; let size = 0;
    for (const raw of [...(texts || [])].reverse()) {
      const line = clean(raw);
      if (!line) continue;
      if (size + line.length + (out.length ? 1 : 0) > AI_INPUT_LIMIT) {
        if (!out.length) out.unshift(line.slice(-AI_INPUT_LIMIT));
        break;
      }
      size += line.length + (out.length ? 1 : 0);
      out.unshift(line);
    }
    return out.join("\n");
  }

  function formatAnyDesk(digits) { return String(digits || "").replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function normalizeLine(text) {
    return truncate(clean(text).replace(/^["'“”]+|["'“”]+$/g, "").replace(/\.+$/, "").trim());
  }

  return Object.freeze({ LIMIT, detectAnyDesk, problemMessages, heuristicLine, buildAiInput, formatAnyDesk, normalizeLine, meaningful,
    // A stored line is still usable: real content, no sender prefix left in it.
    isProblemLine: text => meaningful(text) && withoutAuthor(text) === clean(text) });
})();
globalThis.QueueContextParse = QueueContextParse;
