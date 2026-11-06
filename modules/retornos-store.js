// Storage for "Retornos automáticos", shared by the SZ.chat and CRM tabs through chrome.storage.local.
// Every function resolves (never throws), so a content script keeps working when the extension
// is reloaded or storage is unavailable.
const RetornosStore = (() => {
  const ITEMS_KEY = "atendeai_retornos_v1";
  const SETTINGS_KEY = "atendeai_retornos_settings_v1";
  const FLAGS_KEY = "atendeai_retornos_flags_v1";
  const SECTOR_KEY = "atendeai_user_sector";
  const AGENDA_KEY = "usuarioAgendaEventsV2";
  const DAYS = ["amanha", "depois", "dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  function read(keys) {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(keys, (data) => resolve(chrome.runtime?.lastError ? {} : data || {})); }
      catch { resolve({}); }
    });
  }
  function write(data) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set(data, () => resolve()); } catch { resolve(); }
    });
  }

  // Writes are read-modify-write on one object; queue them so two quick actions in a tab never overlap.
  let queue = Promise.resolve();
  function mutate(fn) {
    const run = queue.then(fn, fn);
    queue = run.then(() => {}, () => {});
    return run;
  }

  async function loadItems() {
    const stored = (await read([ITEMS_KEY]))[ITEMS_KEY];
    return stored && typeof stored.items === "object" && stored.items ? { ...stored.items } : {};
  }
  const saveItems = (items) => write({ [ITEMS_KEY]: { version: 1, items } });

  function sortedList(items) {
    return Object.values(items).sort((a, b) => a.dueAt - b.dueAt);
  }

  const list = async () => sortedList(await loadItems());

  function cleanShortcuts(raw) {
    if (!Array.isArray(raw)) return null;
    return raw
      .filter((s) => s && DAYS.includes(s.day) && TIME_RE.test(String(s.time || "")))
      .map((s, i) => ({ id: String(s.id || `${s.day}-${s.time}-${i}`), day: s.day, time: s.time }));
  }

  async function getSettings() {
    const stored = (await read([SETTINGS_KEY]))[SETTINGS_KEY] || {};
    const shortcuts = cleanShortcuts(stored.shortcuts);
    return {
      enabled: stored.enabled !== false,
      shortcuts: shortcuts || globalThis.RetornosSchedule.defaultShortcuts()
    };
  }

  function setSettings(patch = {}) {
    return mutate(async () => {
      const current = await getSettings();
      const next = { ...current };
      if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
      if (Array.isArray(patch.shortcuts)) next.shortcuts = cleanShortcuts(patch.shortcuts) || [];
      await write({ [SETTINGS_KEY]: next });
      return next;
    });
  }

  async function isActive() {
    const data = await read([SECTOR_KEY, SETTINGS_KEY]);
    const sector = String(data[SECTOR_KEY] || "").trim().toLowerCase();
    return sector === "suporte" && (data[SETTINGS_KEY] || {}).enabled !== false;
  }

  async function getFlag(name) {
    return ((await read([FLAGS_KEY]))[FLAGS_KEY] || {})[name] === true;
  }
  function setFlag(name, value) {
    return mutate(async () => {
      const flags = (await read([FLAGS_KEY]))[FLAGS_KEY] || {};
      await write({ [FLAGS_KEY]: { ...flags, [name]: value === true } });
    });
  }

  const text = (v) => String(v ?? "").trim();
  const pick = (next, prev) => (text(next) ? text(next) : prev || "");

  function upsertCrm(data, now = Date.now()) {
    return mutate(async () => {
      const protocolo = text(data?.protocolo);
      const dueAt = Number(data?.dueAt);
      if (!protocolo || !Number.isFinite(dueAt)) return null;
      const items = await loadItems();
      const prev = items[protocolo];
      const next = {
        key: protocolo, kind: "crm", protocolo,
        atendimentoId: pick(data.atendimentoId, prev?.atendimentoId),
        cliente: pick(data.cliente, prev?.cliente),
        solicitante: pick(data.solicitante, prev?.solicitante),
        telefones: Array.isArray(data.telefones) && data.telefones.length ? data.telefones.map(text).filter(Boolean) : prev?.telefones || [],
        problema: pick(data.problema, prev?.problema),
        dueAt, createdAt: prev?.createdAt || now, updatedAt: now, alertAt: dueAt, ackedAt: null
      };
      items[protocolo] = next;
      await saveItems(items);
      return next;
    });
  }

  function newId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function manualItem(key, { text: body, dueAt }, now) {
    return {
      key, kind: "manual", text: text(body), cliente: "", solicitante: "", telefones: [], problema: "",
      dueAt, createdAt: now, updatedAt: now, alertAt: dueAt, ackedAt: null
    };
  }

  function addManual({ text: body, dueAt } = {}, now = Date.now()) {
    return mutate(async () => {
      if (!text(body) || !Number.isFinite(Number(dueAt))) return null;
      const items = await loadItems();
      const item = manualItem(`manual:${newId()}`, { text: body, dueAt: Number(dueAt) }, now);
      items[item.key] = item;
      await saveItems(items);
      return item;
    });
  }

  function patch(key, change) {
    return mutate(async () => {
      const items = await loadItems();
      if (!items[key]) return false;
      items[key] = { ...items[key], ...change(items[key]) };
      await saveItems(items);
      return true;
    });
  }

  const acknowledge = (key) => patch(key, (r) => ({ ackedAt: r.alertAt }));
  const snooze = (key, at) => patch(key, () => ({ alertAt: Number(at), ackedAt: null }));

  function remove(key) {
    return mutate(async () => {
      const items = await loadItems();
      if (!(key in items)) return false;
      delete items[key];
      await saveItems(items);
      return true;
    });
  }
  const removeByProtocolo = (protocolo) => remove(text(protocolo));

  function refreshId(protocolo, atendimentoId) {
    const id = text(atendimentoId);
    return mutate(async () => {
      const items = await loadItems();
      const item = items[text(protocolo)];
      if (!item || !id || item.atendimentoId === id) return false;
      items[item.key] = { ...item, atendimentoId: id };
      await saveItems(items);
      return true;
    });
  }

  async function pending(now = Date.now()) {
    return (await list()).filter((r) => !r.legacy && r.alertAt <= now && r.ackedAt !== r.alertAt);
  }

  function syncWithTable(protocolos, readAt = Date.now()) {
    const present = new Set((protocolos || []).map(text));
    return mutate(async () => {
      const items = await loadItems();
      const removed = Object.values(items)
        .filter((r) => r.kind === "crm" && !present.has(r.protocolo) && r.updatedAt <= readAt)
        .map((r) => r.key);
      if (!removed.length) return [];
      removed.forEach((key) => { delete items[key]; });
      await saveItems(items);
      return removed;
    });
  }

  function eventDue(evt) {
    const m = String(evt?.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const t = String(evt?.time || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    const date = new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 8, t ? +t[2] : 0, 0, 0);
    return Number.isNaN(date.getTime()) || date.getMonth() !== +m[2] - 1 ? null : date;
  }

  // Old manual agenda events: today onwards keep alerting as manual reminders; older open ones become
  // quiet "Da agenda antiga" entries. The old keys are never touched, so going back stays possible.
  function migrateAgenda(now = Date.now()) {
    return mutate(async () => {
      const empty = { moved: 0, legacy: 0 };
      if (!(await isActive()) || (await getFlag("migrated"))) return empty;
      const events = (await read([AGENDA_KEY]))[AGENDA_KEY] || {};
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const items = await loadItems();
      const result = { moved: 0, legacy: 0 };
      Object.values(events).forEach((evt) => {
        if (!evt || evt.status === "done") return;
        const due = eventDue(evt);
        if (!due) return;
        const key = `manual:migrated-${text(evt.id) || newId()}`;
        if (items[key]) return;
        const label = [text(evt.title), text(evt.client)].filter(Boolean).join(" — ") || "Evento da agenda";
        const item = manualItem(key, { text: label, dueAt: due.getTime() }, now);
        if (due.getTime() < startOfToday.getTime()) {
          item.legacy = true;
          item.ackedAt = item.alertAt;
          result.legacy += 1;
        } else {
          result.moved += 1;
        }
        items[key] = item;
      });
      if (result.moved || result.legacy) await saveItems(items);
      const flags = (await read([FLAGS_KEY]))[FLAGS_KEY] || {};
      await write({ [FLAGS_KEY]: { ...flags, migrated: true } });
      return result;
    });
  }

  function onChange(callback) {
    const watched = new Set([ITEMS_KEY, SETTINGS_KEY, SECTOR_KEY]);
    const handler = (changes, area) => {
      if (area && area !== "local") return;
      if (Object.keys(changes || {}).some((k) => watched.has(k))) {
        try { callback(changes); } catch (error) { console.warn("AtendeAI: retornos, falha ao reagir à mudança.", error); }
      }
    };
    try { chrome.storage.onChanged.addListener(handler); } catch { return () => {}; }
    return () => { try { chrome.storage.onChanged.removeListener(handler); } catch { /* ignore */ } };
  }

  return {
    ITEMS_KEY, SETTINGS_KEY, FLAGS_KEY,
    getSettings, setSettings, isActive, getFlag, setFlag,
    list, upsertCrm, addManual, remove, removeByProtocolo, acknowledge, snooze, refreshId,
    pending, syncWithTable, migrateAgenda, onChange
  };
})();

globalThis.RetornosStore = RetornosStore;
if (typeof window !== "undefined") window.RetornosStore = RetornosStore;
