// Pure helpers for "Retornos automáticos": shortcut dates, labels, grouping and the
// conservative chat↔return matching. No DOM and no chrome.* here, so it is testable in isolation.
const RetornosSchedule = (() => {
  const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const DEFAULT_TIME = "08:00";
  const pad = (n) => String(n).padStart(2, "0");

  function defaultShortcuts() {
    return [
      { id: "amanha-0800", day: "amanha", time: "08:00" },
      { id: "amanha-1400", day: "amanha", time: "14:00" },
      { id: "seg-0800", day: "seg", time: "08:00" }
    ];
  }

  function parseTime(text) {
    const m = String(text || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    const [h, min] = (m ? m[0] : DEFAULT_TIME).split(":").map(Number);
    return { h, min };
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
  }

  // Tomorrow, except that tomorrow on a Saturday or a Sunday means Monday.
  function tomorrowDay(now) {
    const next = addDays(now, 1);
    const dow = next.getDay();
    if (dow === 6) return addDays(next, 2);
    if (dow === 0) return addDays(next, 1);
    return next;
  }

  function dayOf(shortcut, now) {
    const day = String(shortcut?.day || "amanha");
    if (day === "depois") return addDays(now, 2);
    const weekday = WEEKDAYS.indexOf(day);
    if (weekday >= 0) {
      const ahead = ((weekday - now.getDay() + 7) % 7) || 7;
      return addDays(now, ahead);
    }
    return tomorrowDay(now);
  }

  function resolveShortcut(shortcut, now = new Date()) {
    const base = dayOf(shortcut, now);
    const { h, min } = parseTime(shortcut?.time);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, min, 0, 0);
  }

  function shortcutLabel(shortcut, now = new Date()) {
    const date = resolveShortcut(shortcut, now);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const day = String(shortcut?.day || "amanha");
    let name;
    if (day === "depois") name = "Depois de amanhã";
    else if (WEEKDAYS.includes(day)) name = WEEKDAY_NAMES[WEEKDAYS.indexOf(day)];
    else name = date.getDay() === 1 && addDays(now, 1).getDay() !== 1 ? "Segunda" : "Amanhã";
    return `${name} ${time}`;
  }

  function snoozeOptions(now = new Date()) {
    const base = now.getTime();
    const tomorrow = { id: "tomorrow", day: "amanha", time: "08:00" };
    return [
      { id: "15m", label: "15 min", at: base + 15 * 60000 },
      { id: "1h", label: "1 h", at: base + 60 * 60000 },
      { id: "tomorrow", label: shortcutLabel(tomorrow, now), at: resolveShortcut(tomorrow, now).getTime() }
    ];
  }

  function toCrmValue(date, pattern = "dd/MM/yyyy HH:mm") {
    return String(pattern)
      .replace("dd", pad(date.getDate()))
      .replace("MM", pad(date.getMonth() + 1))
      .replace("yyyy", String(date.getFullYear()))
      .replace("HH", pad(date.getHours()))
      .replace("mm", pad(date.getMinutes()));
  }

  function parseCrmValue(text) {
    const m = String(text || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
    if (!m) return null;
    const [, d, mo, y, h, mi] = m.map(Number);
    const date = new Date(y, mo - 1, d, h, mi, 0, 0);
    const same = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
      && date.getHours() === h && date.getMinutes() === mi;
    return same ? date : null;
  }

  function groupRetornos(items, now = Date.now()) {
    const startOfTomorrow = addDays(new Date(now), 1).getTime();
    const sorted = [...(items || [])].sort((a, b) => a.dueAt - b.dueAt);
    return {
      atrasados: sorted.filter((i) => i.dueAt < now),
      hoje: sorted.filter((i) => i.dueAt >= now && i.dueAt < startOfTomorrow),
      proximos: sorted.filter((i) => i.dueAt >= startOfTomorrow)
    };
  }

  function dayDiff(ts, now) {
    const a = addDays(new Date(ts), 0).getTime();
    const b = addDays(new Date(now), 0).getTime();
    return Math.round((a - b) / 86400000);
  }

  function whenLabel(dueAt, now = Date.now()) {
    const date = new Date(dueAt);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const diff = dayDiff(dueAt, now);
    if (diff === 0) return `hoje ${time}`;
    if (diff === 1) return `amanhã ${time}`;
    if (diff === -1) return `ontem ${time}`;
    return `${WEEKDAY_SHORT[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${time}`;
  }

  function createdLabel(createdAt, now = Date.now()) {
    const diff = dayDiff(createdAt, now);
    if (diff === 0) return "agendado hoje por você";
    if (diff === -1) return "agendado ontem por você";
    const date = new Date(createdAt);
    return `agendado em ${pad(date.getDate())}/${pad(date.getMonth() + 1)} por você`;
  }

  function normalizeName(text) {
    return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function phoneKey(text) {
    const digits = String(text || "").replace(/\D/g, "");
    return digits.length >= 8 ? digits.slice(-8) : "";
  }

  function distinct(list) {
    return [...new Map(list.map((r) => [r.key, r])).values()];
  }

  // Phone first, then a full (two words or more) name equal to the client or the requester.
  // More than one candidate, or none, is "not sure": null.
  function matchChat(retornos, { name, phone } = {}) {
    const list = Array.isArray(retornos) ? retornos : [];
    const wantedPhone = phoneKey(phone);
    if (wantedPhone) {
      const byPhone = distinct(list.filter((r) => (r.telefones || []).some((t) => phoneKey(t) === wantedPhone)));
      if (byPhone.length === 1) return byPhone[0];
      if (byPhone.length > 1) return null;
    }
    const wantedName = normalizeName(name);
    if (wantedName.split(" ").filter(Boolean).length < 2) return null;
    const byName = distinct(list.filter((r) => normalizeName(r.cliente) === wantedName || normalizeName(r.solicitante) === wantedName));
    return byName.length === 1 ? byName[0] : null;
  }

  return {
    defaultShortcuts, resolveShortcut, shortcutLabel, snoozeOptions, toCrmValue, parseCrmValue,
    groupRetornos, whenLabel, createdLabel, normalizeName, phoneKey, matchChat, WEEKDAYS, WEEKDAY_NAMES
  };
})();

globalThis.RetornosSchedule = RetornosSchedule;
if (typeof window !== "undefined") window.RetornosSchedule = RetornosSchedule;
