// The AtendeAI line under the CRM's native "Data do agendamento" field (/crm-atendimento).
// It is a new sibling block: it never moves, hides or edits anything native. Shortcuts and free
// date/time only ask the page-world bridge to write the native calendar; the native field stays
// the truth and is what the CRM saves.
const RetornosCrmLine = (() => {
  const LINE_ID = "atendeai-retornos-line";
  const SET_DATE_EVENT = "atendeai:crm-set-date";
  const SET_DATE_ATTR = "data-atendeai-crm-set-date";
  const RESULT_ATTR = "data-atendeai-crm-set-date-result";
  const HINT_ON = "Ao salvar, eu guardo este retorno e te aviso na hora.";
  const HINT_OFF = "Este agendamento não vira lembrete.";
  const HINT_FAIL = "Não consegui preencher a data. Use o campo do CRM acima.";
  // Until the CRM's save signal is calibrated from real recordings, nothing is stored: say so plainly.
  const HINT_CALIBRATING = "Em calibração: ainda não guardo este retorno sozinho. Para ser avisado, use “+ Lembrete” na Agenda & Gestão do SZ.chat.";

  function make(doc, tag, props = {}, children = []) {
    const node = doc.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key === "id") node.id = value;
      else if (key === "checked") node.checked = value;
      else node.setAttribute(key, value);
    });
    children.forEach((child) => node.appendChild(child));
    return node;
  }

  // The CRM only accepts an appointment inside business hours (08:00–17:00, told by the technician).
  const HOURS_WARNING = "Atenção: o CRM só aceita agendar das 8h às 17h.";
  function outsideHours(text) {
    const m = String(text).match(/ (\d{2}):(\d{2})$/);
    if (!m) return false;
    const minutes = Number(m[1]) * 60 + Number(m[2]);
    return minutes < 8 * 60 || minutes > 17 * 60;
  }

  const calibrated = () => globalThis.RetornosCapture?.hasSignatures?.() === true;
  const hintFor = (checked) => (!calibrated() ? HINT_CALIBRATING : checked ? HINT_ON : HINT_OFF);

  // Asks the page-world bridge to write the native calendar, then tells the technician what happened.
  function writeDate(doc, text, hint, picked) {
    const id = globalThis.RetornosCapture?.findDateInput?.(doc)?.id || "";
    const payload = JSON.stringify({ id, value: text });
    try {
      doc.documentElement?.removeAttribute?.(RESULT_ATTR);
      doc.documentElement?.setAttribute?.(SET_DATE_ATTR, payload);
    } catch { /* ignore */ }
    doc.dispatchEvent(new CustomEvent(SET_DATE_EVENT, { detail: payload }));
    setTimeout(() => {
      const result = doc.documentElement?.getAttribute?.(RESULT_ATTR);
      if (picked) picked.textContent = !result || result === "ok" ? `Preenchi o campo do CRM: ${text}${outsideHours(text) ? ` ${HOURS_WARNING}` : ""}` : HINT_FAIL;
      if (result && result !== "ok" && hint) hint.textContent = HINT_FAIL;
    }, 300);
  }

  function buildShortcuts(doc, holder, shortcuts, hint, picked) {
    while (holder.children.length) holder.children[0].remove();
    const now = new Date();
    const S = globalThis.RetornosSchedule;
    shortcuts.forEach((shortcut) => {
      const button = make(doc, "button", { type: "button", class: "atendeai-retornos-shortcut", text: S.shortcutLabel(shortcut, now) });
      button.addEventListener("click", () => writeDate(doc, S.toCrmValue(S.resolveShortcut(shortcut, new Date())), hint, picked));
      holder.appendChild(button);
    });
  }

  function buildLine(doc, shortcuts) {
    // A re-render rebuilds the line: the box comes back as the technician left it for this attendance.
    const checked = globalThis.RetornosCapture.keptRemember(doc);
    const hint = make(doc, "div", { id: "atendeai-retornos-hint", class: "atendeai-retornos-hint", text: hintFor(checked) });
    const picked = make(doc, "div", { id: "atendeai-retornos-picked", class: "atendeai-retornos-picked", role: "status" });
    const holder = make(doc, "div", { class: "atendeai-retornos-shortcuts" });
    buildShortcuts(doc, holder, shortcuts, hint, picked);

    const date = make(doc, "input", { id: "atendeai-retornos-date", type: "date", "aria-label": "Data do retorno" });
    const time = make(doc, "input", { id: "atendeai-retornos-time", type: "time", "aria-label": "Hora do retorno" });
    const applyFree = () => {
      const d = String(date.value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const t = String(time.value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
      if (d && t) writeDate(doc, `${d[3]}/${d[2]}/${d[1]} ${t[1]}:${t[2]}`, hint, picked);
    };
    [date, time].forEach((input) => {
      input.addEventListener("change", applyFree);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") event.preventDefault(); });
    });

    const remember = make(doc, "input", { id: "atendeai-retornos-remember", type: "checkbox", checked });
    remember.addEventListener("change", () => {
      globalThis.RetornosCapture.keepRemember(doc, remember.checked);
      hint.textContent = hintFor(remember.checked);
    });

    const free = make(doc, "div", { class: "atendeai-retornos-free" }, [
      make(doc, "span", { class: "atendeai-retornos-or", text: "ou escolha" }), date, time
    ]);
    const rememberRow = make(doc, "label", { class: "atendeai-retornos-remember", for: "atendeai-retornos-remember" }, [
      remember, make(doc, "span", { text: "Me lembrar deste retorno" })
    ]);
    const head = make(doc, "div", { class: "atendeai-retornos-head" }, [
      make(doc, "span", { class: "atendeai-retornos-seal", text: "AtendeAI" }),
      make(doc, "span", { class: "atendeai-retornos-title", text: "Retorno rápido" })
    ]);
    const line = make(doc, "div", { id: LINE_ID, class: "atendeai-retornos-line", role: "group", "aria-label": "Retorno rápido do AtendeAI" },
      [head, holder, free, rememberRow, hint, picked]);
    line.hidden = true;
    line._shortcutsHolder = holder;
    line._hint = hint;
    line._picked = picked;
    return line;
  }

  // Observed: the date lives in a 25%-wide floating-label span inside a `.linha` row together with the
  // Agendar/Finalizar radios. The line goes right after that row (full width), never inside the span.
  function anchorOf(input) {
    for (let node = input.parentElement; node; node = node.parentElement) {
      if (/\blinha\b/.test(node.className || "")) return node;
    }
    const wrapper = input.parentElement;
    return wrapper && /\bui-calendar\b/.test(wrapper.className || "") ? wrapper : input;
  }

  function sync(doc) {
    const line = doc.getElementById(LINE_ID);
    if (line) line.hidden = globalThis.RetornosCapture.readMode(doc) !== "agendar";
    return line;
  }

  async function mount(doc) {
    const store = globalThis.RetornosStore;
    if (!store || !(await store.isActive())) return false;
    if (doc.getElementById(LINE_ID)) return false;
    const input = globalThis.RetornosCapture.findDateInput(doc);
    const anchor = input && anchorOf(input);
    if (!anchor?.parentElement) return false;
    const { shortcuts } = await store.getSettings();
    const line = buildLine(doc, shortcuts);
    anchor.parentElement.insertBefore(line, anchor.nextElementSibling);
    sync(doc);
    store.onChange(async () => {
      const settings = await store.getSettings();
      if (line._shortcutsHolder) buildShortcuts(doc, line._shortcutsHolder, settings.shortcuts, line._hint, line._picked);
    });
    return true;
  }

  // PrimeFaces re-renders parts of the form after ajax calls, which can drop the line: keep it present.
  function start(doc) {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!doc.getElementById(LINE_ID)) await mount(doc);
        sync(doc);
      } catch (error) {
        console.warn("AtendeAI: linha de retornos falhou.", error);
      } finally { busy = false; }
    };
    ["click", "change"].forEach((type) => doc.addEventListener(type, () => setTimeout(tick, 0), true));
    setInterval(tick, 700);
    void tick();
  }

  return { mount, sync, start, LINE_ID };
})();

globalThis.RetornosCrmLine = RetornosCrmLine;
if (typeof window !== "undefined") {
  window.RetornosCrmLine = RetornosCrmLine;
  if (typeof document !== "undefined" && typeof location !== "undefined" && /\/crm-atendimento/.test(location.pathname)) {
    RetornosCrmLine.start(document);
  }
}
