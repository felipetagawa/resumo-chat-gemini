// Style samples for Smart Reply: the technician's own confirmed sends, kept only in this browser.
const StyleSamplesModule = (() => {
  const KEY = "atendeai_style_samples_v1";
  const MAX_ITEMS = 40, MAX_AGE = 60 * 24 * 60 * 60 * 1000, MIN_LEN = 15, MAX_LEN = 300, PER_REQUEST = 8;
  const CONFIRM_WINDOW = 10000, COUNT_DELAY = 250, TICK_DELAY = 300;
  // 9+ digits with single separators covers CPF, CNPJ, phones, AnyDesk codes and NF-e keys.
  const SENSITIVE = [/\d(?:[\s.\-\/]?\d){8,}/, /[\w.+-]+@[\w-]+\.[\w.-]+/, /\bhttps?:\/\/|\bwww\./i];
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
  function load() { return enqueue(async () => { state = sanitize(await StorageHelper.get([KEY])); return state; }); }
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
  const sentMatches = text => ChatCaptureModule.mensagensDaResposta().filter(m => m.sent && key(m.message) === key(text));
  function onInput(event) {
    const el = ChatCaptureModule.encontrarComposer();
    if (!el || (event?.target !== el && !el.contains?.(event?.target))) return;
    const value = composerText(el);
    if (!value) return; // SZ clears the composer programmatically on send; tick() detects that.
    const token = ChatCaptureModule.identificarAtendimentoResposta();
    if (!token) { draft = null; return; }
    draft = { text: value, token, before: draft?.text === value ? draft.before : null };
    clearTimeout(countTimer);
    // Count identical sends once typing pauses, so only a later, new one proves this send.
    countTimer = setTimeout(() => { if (draft?.text === value) draft.before = sentMatches(value).length; }, COUNT_DELAY);
  }
  function tick(now = Date.now()) {
    if (draft && draft.before != null && !composerText(ChatCaptureModule.encontrarComposer())) {
      pending = { ...draft, until: now + CONFIRM_WINDOW }; draft = null;
    }
    if (!pending) return;
    if (now > pending.until || ChatCaptureModule.identificarAtendimentoResposta() !== pending.token) { pending = null; return; }
    const matches = sentMatches(pending.text);
    if (matches.length > pending.before) {
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
