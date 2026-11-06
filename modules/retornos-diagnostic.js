// Diagnostic mode for "Retornos automáticos" (off by default). It records, in this browser only,
// what the CRM shows when a technician saves an attendance, so the save detection can be built
// and tested on real recordings. It never changes anything in the CRM and never clicks anything.
// The exported recording is redacted: field names and routing values stay, personal text is masked.
const RetornosDiagnostic = (() => {
  const ON_KEY = "atendeai_retornos_diag_on";
  const LOG_KEY = "atendeai_retornos_diag_log";
  const MAX_ENTRIES = 40;
  const KEEP_PARAM = /^javax\.faces\.(source|partial\.|behavior\.event|event)|lblOnOf|agendamento/i;
  const KEEP_TEXT_ID = /msg|message|growl|dialog|confirm/i;
  const ERROR_RE = /ui-messages-(?:error|fatal)|ui-message-(?:error|fatal)|ui-growl-(?:item[^"]*)?(?:error|fatal)|ui-state-error/;
  const MESSAGE_TEXT = /ui-(?:messages-(?:error|warn|info|fatal)-(?:summary|detail)|growl-title|growl-message)[^>]*>([^<]*)</g;

  const mask = (text) => String(text ?? "").replace(/[A-Za-zÀ-ÿ]/g, "a").replace(/\d/g, "9");
  const plain = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

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

  async function isOn() {
    return (await read([ON_KEY]))[ON_KEY] === true;
  }

  function redactParams(params) {
    const out = {};
    Object.entries(params || {}).forEach(([name, value]) => {
      if (name === "javax.faces.ViewState") out[name] = { length: String(value ?? "").length };
      else out[name] = KEEP_PARAM.test(name) ? String(value ?? "") : mask(value);
    });
    return out;
  }

  function redactArgs(raw) {
    try {
      const parsed = JSON.parse(raw);
      const out = {};
      Object.entries(parsed).forEach(([k, v]) => { out[k] = typeof v === "string" ? mask(v) : v; });
      return out;
    } catch { return null; }
  }

  function redactResponse(xml) {
    const text = String(xml ?? "");
    const out = { updates: [], messages: [], redirect: null, args: null, evals: [], hasError: ERROR_RE.test(text) };
    for (const m of text.matchAll(/<update id="([^"]*)">([\s\S]*?)<\/update>/g)) {
      const body = m[2].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
      for (const msg of body.matchAll(MESSAGE_TEXT)) if (msg[1].trim()) out.messages.push(msg[1].trim());
      const flat = plain(body).slice(0, 300);
      out.updates.push({ id: m[1].replace(/\d{4,}/g, (d) => mask(d)), text: KEEP_TEXT_ID.test(m[1]) ? flat : mask(flat) });
    }
    const redirect = text.match(/<redirect url="([^"]*)"/);
    if (redirect) out.redirect = redirect[1].replace(/\d/g, "9");
    const args = text.match(/<extension[^>]*type="args"[^>]*>([\s\S]*?)<\/extension>/);
    if (args) out.args = redactArgs(args[1]);
    for (const m of text.matchAll(/<eval>([\s\S]*?)<\/eval>/g)) {
      out.evals.push(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").replace(/\d{3,}/g, (d) => mask(d)).slice(0, 300));
    }
    return out;
  }

  function visible(node) {
    try {
      if (typeof node.getClientRects === "function") return node.getClientRects().length > 0;
    } catch { /* fall through */ }
    return true;
  }

  function labelOf(node, root) {
    const id = node.id;
    const labels = id ? [...root.querySelectorAll("label")].filter((l) => l.getAttribute("for") === id) : [];
    if (labels[0]) return plain(labels[0].textContent).slice(0, 60);
    const prev = node.previousElementSibling;
    if (prev && /^(label|span)$/.test(prev.tagName)) return plain(prev.textContent).slice(0, 60);
    return "";
  }

  function snapshotDom(root) {
    const fields = [...root.querySelectorAll("input, select, textarea")]
      .filter((n) => n.name !== "javax.faces.ViewState")
      .map((n) => {
        const type = n.type || n.getAttribute("type") || n.tagName.toLowerCase();
        const entry = {
          id: n.id || "", name: n.getAttribute("name") || n.name || "", type,
          label: labelOf(n, root), checked: n.checked === true,
          valueShape: mask(n.value), visible: visible(n)
        };
        if (type === "radio" || type === "checkbox") entry.value = String(n.getAttribute("value") ?? n.value ?? "");
        return entry;
      });
    const buttons = [...root.querySelectorAll("button, a.ui-commandlink, .ui-button")]
      .map((n) => ({ id: n.id || "", text: plain(n.textContent).slice(0, 40), visible: visible(n) }));
    const dialogs = [...root.querySelectorAll(".ui-dialog, .ui-confirm-dialog")]
      .map((n) => ({ id: n.id || "", visible: visible(n), text: plain(n.textContent).slice(0, 200) }));
    const messages = [...root.querySelectorAll(".ui-messages, .ui-growl-item-container")]
      .map((n) => plain(n.textContent).slice(0, 200)).filter(Boolean);
    return { fields, buttons, dialogs, messages };
  }

  async function record(entry) {
    if (!(await isOn())) return;
    const log = (await read([LOG_KEY]))[LOG_KEY];
    const next = [...(Array.isArray(log) ? log : []), { at: new Date().toISOString(), ...entry }].slice(-MAX_ENTRIES);
    await write({ [LOG_KEY]: next });
  }

  async function exportLog() {
    const log = (await read([LOG_KEY]))[LOG_KEY];
    return JSON.stringify(Array.isArray(log) ? log : [], null, 2);
  }

  async function clear() {
    await write({ [LOG_KEY]: [] });
  }

  function chain(target) {
    const out = [];
    for (let n = target; n && out.length < 6; n = n.parentElement) {
      out.push({ tag: n.tagName, id: n.id || "", cls: String(n.className || "").slice(0, 60), text: plain(n.textContent).slice(0, 40) });
      if (n.tagName === "form") break;
    }
    return out;
  }

  async function start(doc, win) {
    try {
      if (!(await isOn())) return;
      const root = doc.body || doc;
      doc.addEventListener("click", (event) => {
        record({ kind: "click", chain: chain(event.target), dom: snapshotDom(root) });
      }, true);
      doc.addEventListener("atendeai:crm-ajax", (event) => {
        let signal = null;
        try { signal = JSON.parse(event.detail); } catch { return; }
        record({
          kind: "ajax", phase: signal.phase, status: signal.status, form: signal.form, source: signal.source,
          params: redactParams(signal.params), response: signal.phase === "complete" ? redactResponse(signal.responseText) : null
        });
        if (signal.phase === "complete") setTimeout(() => record({ kind: "dom-after", dom: snapshotDom(root) }), 150);
      });
      doc.addEventListener("atendeai:crm-widgets", (event) => {
        try { record({ kind: "widgets", widgets: JSON.parse(event.detail) }); } catch { /* ignore */ }
      });
      win?.addEventListener?.("beforeunload", () => { record({ kind: "navigation", url: String(win.location?.pathname || "") }); });
      setTimeout(() => doc.dispatchEvent(new CustomEvent("atendeai:crm-widgets-request")), 1500);
      record({ kind: "start", url: String(win?.location?.pathname || ""), dom: snapshotDom(root) });
    } catch (error) {
      console.warn("AtendeAI: diagnóstico dos retornos falhou.", error);
    }
  }

  return { isOn, redactParams, redactResponse, snapshotDom, record, export: exportLog, clear, start, ON_KEY, LOG_KEY };
})();

globalThis.RetornosDiagnostic = RetornosDiagnostic;
if (typeof window !== "undefined") window.RetornosDiagnostic = RetornosDiagnostic;
if (typeof document !== "undefined" && typeof location !== "undefined" && typeof window !== "undefined" && /\/crm-atendimento/.test(location.pathname)) {
  void RetornosDiagnostic.start(document, window);
}
