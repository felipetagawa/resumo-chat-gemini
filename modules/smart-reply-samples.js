// Style samples for Smart Reply: the technician's own confirmed sends, kept only in this browser.
const StyleSamplesModule = (() => {
  const KEY = "atendeai_style_samples_v1";
  const MAX_ITEMS = 40, MAX_AGE = 60 * 24 * 60 * 60 * 1000, MIN_LEN = 15, MAX_LEN = 300, PER_REQUEST = 8;
  const CONFIRM_WINDOW = 10000, COUNT_DELAY = 250, TICK_DELAY = 300;
  // 9+ digits with single separators covers CPF, CNPJ, phones, AnyDesk codes and NF-e keys.
  // Local 8-digit phones ("34567890", "3456 7890", "3456-7890") and scheme-less domains are caught separately;
  // slashes are excluded from the 8-digit rule so dates ("15/10/2026") stay acceptable.
  // Any "name.letters" is treated as a domain unless it is a well-known file reference ("nota.xml"), so new
  // suffixes (.support, .digital, ...) cannot slip through. Fails closed on lookalikes such as "ok.obrigado".
  const FILE_EXT = "xml|pdf|txt|zip|rar|7z|png|jpe?g|gif|bmp|docx?|xlsx?|csv|exe|msi|log|bak|json|html?|ini|dll|sql|rtf|odt|ods|mp[34]|ofx|cer|pfx|p12|tmp|dat|lnk|bat";
  const SENSITIVE = [/\d(?:[\s.\-\/]?\d){8,}/, /\(\d{2}\)\s?\d{4,5}[-\s]?\d{4}/, /(?<![\d\/.-])\d{4,5}[-\s.]?\d{4}(?![\d\/-])/,
    /[\w.+-]+@[\w-]+\.[\w.-]+/, /\bhttps?:\/\/|\bwww\./i,
    new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?!(?:${FILE_EXT})\\b)[a-z]{2,}\\b`, "i"),
    /\b(?:[a-z0-9-]+\.){2,}[a-z]{2,}\b/i,
    /\b[a-z0-9-]+\.[a-z]{2,}\/\S*/i];                              // host/path
  const empty = () => ({ version: 1, selfName: "", items: [] });
  const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
  const key = value => normalize(value).toLocaleLowerCase("pt-BR");
  let state = empty(), queue = Promise.resolve(), started = false;
  let draft = null, pending = null, lastInserted = "", countTimer = null, tickTimer = null;

  function accept(text) {
    const t = normalize(text);
    return t.length >= MIN_LEN && t.length <= MAX_LEN && !SENSITIVE.some(re => re.test(t));
  }
  function enqueue(task) {
    const run = () => globalThis.navigator?.locks?.request ? navigator.locks.request(KEY, task) : task();
    const result = queue.then(run, run); queue = result.catch(() => {}); return result;
  }
  function sanitize(data, now = Date.now()) {
    const raw = data?.[KEY];
    if (raw?.version !== 1 || !Array.isArray(raw.items)) return empty();
    const seen = new Set();
    const items = raw.items
      .filter(i => typeof i?.text === "string" && Number.isFinite(i.at) && now - i.at < MAX_AGE && accept(i.text))
      .sort((a, b) => b.at - a.at)
      .filter(i => !seen.has(key(i.text)) && seen.add(key(i.text)))
      .slice(0, MAX_ITEMS).map(i => ({ text: normalize(i.text), at: i.at }));
    return { version: 1, selfName: typeof raw.selfName === "string" ? normalize(raw.selfName) : "", items };
  }
  function load() {
    return enqueue(async () => {
      const data = await StorageHelper.get([KEY]);
      state = sanitize(data);
      // Expired or no-longer-acceptable excerpts must leave storage too, not just memory.
      if (data?.[KEY] && JSON.stringify(data[KEY]) !== JSON.stringify(state)) {
        try { await StorageHelper.set({ [KEY]: state }); } catch (_) { /* memory state stays pruned */ }
      }
      return state;
    });
  }
  function clear() { return enqueue(async () => { state = empty(); await StorageHelper.set({ [KEY]: state }); }); }
  function record(author, text) {
    return enqueue(async () => {
      const name = normalize(author), t = normalize(text);
      if (!name) return state;
      const current = sanitize(await StorageHelper.get([KEY]));
      // A different confirmed author means another person uses this browser: forget the old voice.
      const items = current.selfName && key(current.selfName) !== key(name) ? [] : current.items;
      const echo = lastInserted && key(t) === key(lastInserted);
      lastInserted = "";
      const next = accept(t) && !echo && !items.some(i => key(i.text) === key(t))
        ? [{ text: t, at: Date.now() }, ...items].slice(0, MAX_ITEMS) : items;
      state = { version: 1, selfName: name, items: next };
      await StorageHelper.set({ [KEY]: state });
      return state;
    });
  }
  function forRequest(conversationText = "") {
    const present = key(conversationText);
    return state.items.filter(i => !present.includes(key(i.text))).slice(0, PER_REQUEST).map(i => i.text);
  }

  const composerText = el => normalize(el?.isContentEditable ? el.textContent : el?.value);
  const sentAll = () => ChatCaptureModule.mensagensDaResposta().filter(m => m.sent);
  const sentMatches = text => sentAll().filter(m => key(m.message) === key(text));
  function onInput(event) {
    const el = ChatCaptureModule.encontrarComposer();
    if (!el || (event?.target !== el && !el.contains?.(event?.target))) return;
    const value = composerText(el);
    if (!value) return; // SZ clears the composer programmatically on send; tick() detects that.
    const token = ChatCaptureModule.identificarAtendimentoResposta();
    if (!token) { draft = null; return; }
    // `base` (all sent bubbles when the draft began) lets a send that renders before the recount still confirm.
    const sameDraft = draft?.token === token;
    draft = { text: value, token, base: sameDraft ? draft.base : sentAll().length,
      before: sameDraft && draft.text === value ? draft.before : null };
    clearTimeout(countTimer);
    // Count identical sends once typing pauses, so only a later, new one proves this send.
    countTimer = setTimeout(() => {
      if (draft?.text === value && composerText(ChatCaptureModule.encontrarComposer())) draft.before = sentMatches(value).length;
    }, COUNT_DELAY);
  }
  function tick(now = Date.now()) {
    if (draft && !composerText(ChatCaptureModule.encontrarComposer())) {
      pending = { ...draft, until: now + CONFIRM_WINDOW }; draft = null;
    }
    if (!pending) return;
    if (now > pending.until || ChatCaptureModule.identificarAtendimentoResposta() !== pending.token) { pending = null; return; }
    const matches = sentMatches(pending.text);
    const all = sentAll();
    const confirmed = pending.before != null ? matches.length > pending.before
      : all.length > pending.base && key(all[all.length - 1].message) === key(pending.text);
    if (confirmed) {
      const author = matches[matches.length - 1].author, text = pending.text;
      pending = null;
      void record(author, text).catch(() => {});
    }
  }
  function start() {
    if (started || !document.body) return;
    started = true;
    void load().catch(() => {});
    document.addEventListener("input", onInput, true);
    new MutationObserver(() => { clearTimeout(tickTimer); tickTimer = setTimeout(() => tick(), TICK_DELAY); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
    chrome.storage?.onChanged?.addListener((changes, area) => { if (area === "local" && changes[KEY]) void load().catch(() => {}); });
  }
  return { start, load, accept, forRequest, clear, selfName: () => state.selfName, count: () => state.items.length,
    noteInserted(text) { lastInserted = normalize(text); }, _tick: tick, _idle: () => queue };
})();
window.StyleSamplesModule = StyleSamplesModule;
