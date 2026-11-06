// Page-world bridge for "Retornos automáticos" on /crm-atendimento. Content scripts live in an
// isolated world and cannot see the page's jQuery/PrimeFaces, so this tiny script:
//  - announces every PrimeFaces/jQuery ajax request and response (the CRM saves through ajax);
//  - describes the page's Calendar widgets, and writes a date into the scheduling calendar.
// It only reads, except for the explicit "atendeai:crm-set-date" request from the AtendeAI line.
(() => {
  const AJAX_EVENT = "atendeai:crm-ajax";
  const AJAX_ATTR = "data-atendeai-crm-ajax";
  const WIDGETS_REQUEST = "atendeai:crm-widgets-request";
  const WIDGETS_EVENT = "atendeai:crm-widgets";
  const SET_DATE_EVENT = "atendeai:crm-set-date";
  const SET_DATE_ATTR = "data-atendeai-crm-set-date";
  const SET_DATE_RESULT_ATTR = "data-atendeai-crm-set-date-result";
  const DATE_INPUT_ID = "frmAtendimento:tbvAtendimento:agendamento_input";

  function emit(name, payload) {
    const json = JSON.stringify(payload);
    try { document.documentElement.setAttribute(AJAX_ATTR, json); } catch (_) { /* ignore */ }
    document.dispatchEvent(new CustomEvent(name, { detail: json }));
  }

  function parseParams(data) {
    const out = {};
    try {
      new URLSearchParams(String(data || "")).forEach((value, key) => { out[key] = value; });
    } catch (_) { /* ignore */ }
    return out;
  }

  function signalOf(phase, xhr, settings) {
    const params = parseParams(settings?.data);
    return {
      phase,
      url: String(settings?.url || "").split("?")[0],
      status: Number(xhr?.status) || 0,
      form: params["javax.faces.source"] ? String(params["javax.faces.source"]).split(":")[0] : "",
      source: params["javax.faces.source"] || "",
      params,
      responseText: phase === "complete" ? String(xhr?.responseText || "") : ""
    };
  }

  function listenAjax() {
    const jquery = window.jQuery || window.$;
    if (typeof jquery !== "function") return false;
    const doc = jquery(document);
    doc.on("ajaxSend", (_event, xhr, settings) => emit(AJAX_EVENT, signalOf("send", xhr, settings)));
    doc.on("ajaxComplete", (_event, xhr, settings) => emit(AJAX_EVENT, signalOf("complete", xhr, settings)));
    return true;
  }

  function calendarWidgets() {
    const widgets = Object.entries(window.PrimeFaces?.widgets || {});
    return widgets
      .filter(([, widget]) => widget?.cfg && ("pattern" in widget.cfg || "showTime" in widget.cfg || "timeOnly" in widget.cfg))
      .map(([key, widget]) => ({
        key, id: String(widget.id || widget.cfg.id || ""), pattern: widget.cfg.pattern || "",
        showTime: !!widget.cfg.showTime, timeOnly: !!widget.cfg.timeOnly, hourFormat: widget.cfg.hourFormat || "",
        minDate: widget.cfg.minDate ? String(widget.cfg.minDate) : ""
      }));
  }

  function setDate(text) {
    const input = document.getElementById(DATE_INPUT_ID)
      || document.querySelector('input[id$=":agendamento_input"], input[id*="agendamento"][id$="_input"]');
    if (!input) return "input-not-found";
    const baseId = input.id.replace(/_input$/, "");
    const widget = Object.values(window.PrimeFaces?.widgets || {})
      .find((w) => w?.cfg && "pattern" in w.cfg && String(w.id || w.cfg.id || "") === baseId);
    try {
      const parts = String(text).match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/);
      if (widget && typeof widget.setDate === "function" && parts) {
        widget.setDate(new Date(+parts[3], +parts[2] - 1, +parts[1], +(parts[4] || 0), +(parts[5] || 0)));
      }
    } catch (_) { /* fall back to the input below */ }
    if (input.value !== text) input.value = text;
    ["input", "change"].forEach((type) => input.dispatchEvent(new Event(type, { bubbles: true })));
    return input.value === text ? "ok" : "not-applied";
  }

  document.addEventListener(WIDGETS_REQUEST, () => {
    try { emit(WIDGETS_EVENT, calendarWidgets()); } catch (_) { /* ignore */ }
  });

  document.addEventListener(SET_DATE_EVENT, (event) => {
    const text = String(event?.detail || document.documentElement.getAttribute(SET_DATE_ATTR) || "");
    document.documentElement.setAttribute(SET_DATE_RESULT_ATTR, text ? setDate(text) : "empty");
  });

  if (!listenAjax()) {
    let tries = 0;
    const timer = setInterval(() => { if (listenAjax() || ++tries > 40) clearInterval(timer); }, 250);
  }
})();
