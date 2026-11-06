// "Sugerir resposta" chat: one conversation per attendance, kept only in this browser
// (chrome.storage.local), plus the slice of it the API accepts as `messages`.
const ReplyChatStore = (() => {
  const KEY = "atendeai_reply_chats_v1";
  const TTL = 24 * 60 * 60 * 1000;
  const MAX_ITEMS = 50, MAX_MESSAGES = 40;
  // Mirrors the API limits for `messages` (POST /api/gemini/responder).
  const MAX_TURNS = 12, MAX_TURN = 1500, MAX_TOTAL = 8000;
  let queue = Promise.resolve();

  function enqueue(task) {
    const run = () => globalThis.navigator?.locks?.request ? navigator.locks.request(KEY, task) : task();
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }

  // Storage failures (extension context invalidated, quota) never break the chat: it keeps working in memory.
  function read() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (data) => {
          const items = !chrome.runtime?.lastError && data?.[KEY]?.items;
          resolve(items && typeof items === "object" ? items : {});
        });
      } catch { resolve({}); }
    });
  }
  function write(items) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [KEY]: { version: 1, items } }, () => resolve()); }
      catch { resolve(); }
    });
  }

  const validMessage = (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
  const fresh = (item, now) => item && Array.isArray(item.messages)
    && Number.isFinite(item.updatedAt) && now - item.updatedAt < TTL;

  // Queued like the writes, so a read never sees storage from before a pending save or clear.
  function load(token) {
    return enqueue(async () => {
      const item = (await read())[token];
      if (!fresh(item, Date.now())) return { token, messages: [], updatedAt: 0 };
      return { token, messages: item.messages.filter(validMessage), updatedAt: item.updatedAt };
    });
  }

  function save(conversation) {
    return enqueue(async () => {
      const now = Date.now();
      const items = await read();
      for (const [token, item] of Object.entries(items)) if (!fresh(item, now)) delete items[token];
      conversation.updatedAt = now;
      items[conversation.token] = {
        token: conversation.token,
        messages: conversation.messages.filter(validMessage).slice(-MAX_MESSAGES),
        updatedAt: now
      };
      const newest = Object.entries(items).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_ITEMS);
      await write(Object.fromEntries(newest));
    });
  }

  function clear(token) {
    return enqueue(async () => {
      const items = await read();
      delete items[token];
      await write(items);
    });
  }

  /** The latest turns the API accepts: no errors, alternating, technician first and last, within the limits. */
  function forApi(messages) {
    const turns = [];
    for (const m of (Array.isArray(messages) ? messages : []).filter((m) => validMessage(m) && !m.error)) {
      const content = m.content.trim().slice(0, MAX_TURN);
      if (!content) continue;
      // A failed turn leaves two technician turns in a row: the newest one is the current ask.
      if (turns.length && turns[turns.length - 1].role === m.role) turns.pop();
      turns.push({ role: m.role, content });
    }
    let out = turns.slice(-MAX_TURNS);
    const total = () => out.reduce((sum, m) => sum + m.content.length, 0);
    while (out.length && (out[0].role !== "user" || total() > MAX_TOTAL)) out = out.slice(1);
    return out.length && out[out.length - 1].role === "user" ? out : [];
  }

  return { load, save, clear, forApi };
})();

window.ReplyChatStore = ReplyChatStore;
