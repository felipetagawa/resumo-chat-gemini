// Local, short-lived addendum for Smart Reply only. Never uses legacy note identity.
const SmartReplyContextModule = (() => {
  const KEY = "atendeai_smart_reply_context_v1";
  const TTL = 24 * 60 * 60 * 1000;
  const LIMIT = 2000, MAX_ITEMS = 50;
  let sourceId = "", value = "", updatedAt = 0, ready = false, generation = 0;
  let timer, pendingEdit, loading, observer, queue = Promise.resolve();
  const listeners = new Set();
  const currentId = () => globalThis.RecoveryBufferModule?.getCurrentConversationIdentity?.()?.sourceId || "";
  const notify = () => listeners.forEach(fn => fn());
  const field = () => document.getElementById("atendeai-reply-addendum");
  function enqueue(task) {
    const run = () => globalThis.navigator?.locks?.request ? navigator.locks.request(KEY, task) : task();
    const result = queue.then(run, run); queue = result.catch(() => {}); return result;
  }
  async function read() {
    const data = await StorageHelper.get([KEY]);
    const items = Object.create(null);
    const entries = Object.entries(data?.[KEY]?.items || {}).reverse().filter(([id, item]) =>
      item?.sourceId === id && typeof item.text === "string" && item.text.trim()
      && Number.isFinite(item.updatedAt) && item.updatedAt > 0 && Date.now() - item.updatedAt < TTL)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_ITEMS);
    for (const [id, item] of entries) items[id] = { sourceId: id, text: item.text.slice(0, LIMIT), updatedAt: item.updatedAt };
    const stored = data?.[KEY]?.items || {};
    if (Object.keys(items).length !== Object.keys(stored).length
      || Object.entries(items).some(([id, item]) => JSON.stringify(item) !== JSON.stringify(stored[id]))) {
      await StorageHelper.set({ [KEY]: { version: 1, items } });
    }
    return { version: 1, items };
  }
  function status(text, tone = "neutral") {
    const el = document.getElementById("atendeai-reply-addendum-status");
    if (el) { el.textContent = text; el.setAttribute("data-tone", tone); }
  }
  function paint() {
    const el = field();
    if (el) { el.value = value; el.maxLength = LIMIT; el.disabled = !ready || !sourceId || currentId() !== sourceId; }
    const count = document.getElementById("atendeai-reply-addendum-count");
    if (count) count.textContent = `${value.length}/${LIMIT}`;
  }
  function getForCurrentChat() {
    return ready && sourceId && currentId() === sourceId && Date.now() - updatedAt < TTL ? value.trim() : "";
  }
  async function sync() {
    if (!observer && globalThis.MutationObserver && document.body) {
      observer = new MutationObserver(() => { if (currentId() !== sourceId) void sync(); });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ["class", "data-chat-id", "data-contact-id", "data-id", "title", "src", "phase"] });
    }
    const id = currentId();
    if (id === sourceId && loading) return loading;
    if (id === sourceId && ready && Date.now() - updatedAt < TTL) return;
    const request = ++generation;
    const edit = pendingEdit; pendingEdit = null;
    if (edit) void persist(edit);
    clearTimeout(timer); sourceId = id; ready = false; value = ""; updatedAt = 0; paint(); notify();
    status(id ? "Carregando…" : "Reabra o atendimento para usar o adendo.");
    const pending = enqueue(read).then(state => {
      if (request !== generation || currentId() !== id) return;
      const item = state.items[id]; value = item?.text || ""; updatedAt = item?.updatedAt || Date.now();
      ready = true; paint(); status(id ? "Salvo" : "Reabra o atendimento para usar o adendo."); notify();
    }).catch(() => {
      if (request !== generation || currentId() !== id) return;
      ready = false; paint(); status("Não foi possível carregar o adendo.", "error");
    }).finally(() => { if (request === generation) loading = null; });
    loading = pending; return pending;
  }
  async function persist(edit) {
    return enqueue(async () => {
      const state = await read();
      // The edit was captured only while the field matched a safe identity.
      // Keep that immutable sourceId across awaits, including a switch to B:
      // pending A is saved to A, never retargeted to the newly active chat.
      if (edit.text.trim()) state.items[edit.sourceId] = { sourceId: edit.sourceId, text: edit.text, updatedAt: Date.now() };
      else delete state.items[edit.sourceId];
      const entries = Object.entries(state.items).reverse().sort((a, b) => b[1].updatedAt - a[1].updatedAt);
      // Stable tie-breaking keeps the current edit when saves share a millisecond.
      for (const [id] of entries.filter(([id]) => id !== edit.sourceId).slice(edit.text.trim() ? MAX_ITEMS - 1 : MAX_ITEMS)) delete state.items[id];
      await StorageHelper.set({ [KEY]: state });
      if (currentId() === edit.sourceId && edit.generation === generation && value === edit.text) status("Salvo", "success");
    }).catch(() => { if (currentId() === edit.sourceId && edit.generation === generation) status("Erro ao salvar", "error"); });
  }
  function onInput() {
    if (!ready || !sourceId || currentId() !== sourceId) { void sync(); return; }
    value = String(field()?.value || "").slice(0, LIMIT); updatedAt = Date.now(); paint(); notify();
    status("Salvando…", "pending"); clearTimeout(timer);
    const edit = { sourceId, text: value, generation };
    pendingEdit = edit;
    timer = setTimeout(() => { if (pendingEdit === edit) pendingEdit = null; return persist(edit); }, 450);
  }
  function bind() {
    const el = field();
    if (el && !el.getAttribute("data-atendeai-bound")) {
      el.setAttribute("data-atendeai-bound", "true"); el.addEventListener("input", onInput);
    }
    paint();
  }
  async function flush() {
    clearTimeout(timer);
    pendingEdit = null;
    if (ready && sourceId && currentId() === sourceId) await persist({ sourceId, text: value, generation });
  }
  return { sync, bind, flush, getForCurrentChat, onChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
})();
window.SmartReplyContextModule = SmartReplyContextModule;
