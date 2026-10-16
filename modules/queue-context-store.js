// modules/queue-context-store.js
// Local per-attendance context. Only chrome.storage.local; never sent anywhere.
const QueueContextStore = (() => {
  const KEY = "atendeai_queue_context_v1", VERSION = 3, TTL = 3 * 86400000;
  const LEGACY_KEYS = ["atendeai_support_focus_v1", "atendeai_support_focus_badges_enabled"];
  const RANK = Object.freeze({ heuristic: 1, ai: 2, manual: 3 });
  let queue = Promise.resolve();

  function storage(method, value) {
    return new Promise((resolve, reject) => chrome.storage.local[method](value, data => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message)); else resolve(data);
    }));
  }
  function serial(task) {
    // Two SZ tabs share storage: serialize across tabs when Web Locks exist.
    const execute = () => globalThis.navigator?.locks?.request ? navigator.locks.request(KEY, task) : task();
    const run = queue.then(execute, execute); queue = run.catch(() => {}); return run;
  }
  async function readAll() { const data = await storage("get", [KEY]); return data?.[KEY]?.items || {}; }
  function fresh(item) { return !!item && Number.isFinite(item.updatedAt) && Date.now() - item.updatedAt < TTL; }
  // AI bookkeeping per chat: attempts so far, the input size of the last one (0 after a failure, so any
  // input may retry) and the earliest time for the next. Pre-1.6.1 items only had aiRequested, sticky even
  // after a failure: they count as one failed attempt and get their retries.
  function shape(item) {
    const legacy = item?.aiRequested === true && !Number.isFinite(item?.aiAttempts);
    return {
      anydesk: item?.anydesk ?? null, problem: item?.problem ?? null,
      aiAttempts: legacy ? 1 : Number(item?.aiAttempts) || 0,
      aiSize: Number(item?.aiSize) || 0,
      aiNextAt: Number(item?.aiNextAt) || 0
    };
  }
  function mergeItem(current, patch) {
    const next = shape(current);
    if (patch.anydesk) next.anydesk = String(patch.anydesk);
    if (patch.aiAttempt) {
      next.aiAttempts += 1;
      next.aiSize = Number(patch.aiAttempt.size) || 0;
      next.aiNextAt = Number(patch.aiAttempt.nextAt) || 0;
    }
    if (patch.aiFailed === true) next.aiSize = 0;
    const p = patch.problem;
    if (p?.text && RANK[p.source] && (!next.problem || RANK[p.source] >= RANK[next.problem.source])) {
      next.problem = { text: String(p.text), source: p.source };
    }
    return next;
  }

  async function get(id) { const item = (await readAll())[id]; return fresh(item) ? item : null; }
  async function all() {
    return Object.fromEntries(Object.entries(await readAll()).filter(([, item]) => fresh(item)));
  }
  function merge(id, patch) {
    return serial(async () => {
      const items = await readAll(), current = fresh(items[id]) ? items[id] : null;
      const next = mergeItem(current, patch || {});
      if (!current && !next.anydesk && !next.problem && !next.aiAttempts) return null;
      if (current && JSON.stringify(shape(current)) === JSON.stringify(next)) return current;
      const saved = { ...next, updatedAt: Date.now() };
      await storage("set", { [KEY]: { version: VERSION, items: { ...items, [id]: saved } } });
      return saved;
    });
  }
  // Once: before 2026-10-16 a chat switch could mix two transcripts, so captured codes and lines
  // (heuristic or AI) may belong to another chat. Only lines the technician typed by hand are kept.
  function repair(items, isProblem) {
    return Object.fromEntries(Object.entries(items)
      .filter(([, item]) => item.problem?.source === "manual" && isProblem(item.problem.text))
      .map(([id, item]) => [id, { anydesk: null, problem: item.problem, updatedAt: item.updatedAt }]));
  }
  function prune(isProblem) {
    return serial(async () => {
      const data = await storage("get", [KEY]), stored = data?.[KEY] || {}, items = stored.items || {};
      let kept = Object.fromEntries(Object.entries(items).filter(([, item]) => fresh(item)));
      const migrate = (stored.version || 1) < VERSION && typeof isProblem === "function";
      if (migrate) kept = repair(kept, isProblem);
      if (migrate || Object.keys(kept).length !== Object.keys(items).length) {
        await storage("set", { [KEY]: { version: migrate ? VERSION : stored.version || 1, items: kept } });
      }
      await storage("remove", LEGACY_KEYS);
    });
  }

  return Object.freeze({ KEY, get, all, merge, prune });
})();
globalThis.QueueContextStore = QueueContextStore;
