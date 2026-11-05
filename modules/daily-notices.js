// "Avisos do dia": situations the technician wants every suggestion to know about
// (SEFAZ unstable, system maintenance, a new technical note). Kept in this browser only;
// expired notices are dropped on every read.
const DailyNoticesModule = (() => {
  const STORAGE_KEY = "atendeai_daily_notices_v1";
  const MAX_NOTICES = 5, MAX_TEXT = 500;
  const HOUR = 60 * 60 * 1000;
  const DURATIONS = [
    ["today", "Até hoje 23h59"],
    ["2h", "Por 2 horas"],
    ["4h", "Por 4 horas"],
    ["24h", "Por 24 horas"]
  ];

  function expiryFor(duration, now = Date.now()) {
    if (duration === "2h") return now + 2 * HOUR;
    if (duration === "4h") return now + 4 * HOUR;
    if (duration === "24h") return now + 24 * HOUR;
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }

  function activeOnly(list, now = Date.now()) {
    return (Array.isArray(list) ? list : [])
      .filter((n) => n && typeof n.text === "string" && n.text.trim() && Number(n.expiresAt) > now)
      .slice(0, MAX_NOTICES);
  }

  function read() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (data) => resolve(chrome.runtime?.lastError ? [] : data?.[STORAGE_KEY]));
      } catch { resolve([]); }
    });
  }
  function write(list) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [STORAGE_KEY]: list }, () => resolve()); }
      catch { resolve(); }
    });
  }

  async function list() {
    const raw = await read();
    const active = activeOnly(raw);
    if (Array.isArray(raw) && raw.length !== active.length) await write(active);
    return active;
  }

  /** Adds a notice; the oldest one leaves when the list is full. */
  async function add(text, duration = "today") {
    const value = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (!value) return list();
    const next = [...(await list()), {
      id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      text: value,
      expiresAt: expiryFor(duration)
    }].slice(-MAX_NOTICES);
    await write(next);
    return next;
  }

  async function remove(id) {
    const next = (await list()).filter((n) => n.id !== id);
    await write(next);
    return next;
  }

  /** What the API receives: only the texts of the notices still valid. */
  async function forRequest() {
    return (await list()).map((n) => n.text);
  }

  function untilLabel(expiresAt) {
    const date = new Date(expiresAt);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return sameDay ? `até ${time}` : `até ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`;
  }

  return { list, add, remove, forRequest, untilLabel, DURATIONS, MAX_TEXT, _test: { expiryFor, activeOnly } };
})();

window.DailyNoticesModule = DailyNoticesModule;
