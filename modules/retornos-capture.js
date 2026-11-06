// Reads the /crm-atendimento screen and decides, from the CRM's own ajax answer, whether a save was
// accepted and whether it was an Agendar or a Finalizar. Anything uncertain returns null/"unknown"
// and changes nothing: a return is only created, moved or removed on a clear, accepted save.
const RetornosCapture = (() => {
  // Filled from the real recordings (plan Task 1, step 8): one entry per CRM save request.
  //   { mode: "agendar" | "finalizar" | "radio", source: RegExp }
  // "radio" means the same button saves both and the Agendar/Finalizar radio decides.
  // Empty until recorded: with no signature nothing is ever created or removed (fails closed).
  const RECORDED_SIGNATURES = [];
  let signatures = RECORDED_SIGNATURES;

  const ERROR_RE = /ui-messages-(?:error|fatal)|ui-message-(?:error|fatal)|ui-growl-(?:item[^"]*)?(?:error|fatal)|ui-state-error/;
  const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const norm = (v) => text(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function summarizeXml(xml) {
    const body = String(xml ?? "");
    let args = null;
    const m = body.match(/<extension[^>]*type="args"[^>]*>([\s\S]*?)<\/extension>/);
    if (m) { try { args = JSON.parse(m[1]); } catch { args = null; } }
    const redirect = body.match(/<redirect url="([^"]*)"/);
    return { args, hasError: ERROR_RE.test(body), redirect: redirect ? redirect[1] : null };
  }

  const summaryOf = (signal) => (signal.response && typeof signal.response === "object"
    ? signal.response : summarizeXml(signal.responseText));

  function signatureFor(source) {
    return signatures.find((s) => s.source.test(String(source || ""))) || null;
  }

  function interpretSave(signal, ctx = {}) {
    if (!signal || signal.phase !== "complete") return null;
    const signature = signatureFor(signal.source);
    if (!signature) return null;
    const mode = signature.mode === "radio" ? ctx.radioMode || null : signature.mode;
    const summary = summaryOf(signal);
    if (Number(signal.status) !== 200 || summary.args?.validationFailed === true || summary.hasError === true) {
      return { outcome: "refused", mode };
    }
    if (!mode) return { outcome: "unknown", mode: null };
    return { outcome: "ok", mode };
  }

  const kindOf = (node) => String(node.getAttribute?.("type") || node.type || node.tagName || "").toLowerCase();
  const isField = (node) => /^(input|textarea|select)$/i.test(node?.tagName || "");

  function valueOf(node) {
    if (!node) return "";
    return text(isField(node) ? node.value : node.textContent);
  }

  function labels(doc) {
    return [...doc.querySelectorAll("label")];
  }

  function valueNear(doc, label) {
    const target = label.getAttribute("for");
    if (target) return valueOf(doc.getElementById(target));
    return valueOf(label.nextElementSibling);
  }

  function valuesByLabel(doc, pattern) {
    return labels(doc).filter((l) => pattern.test(norm(l.textContent))).map((l) => valueNear(doc, l)).filter(Boolean);
  }

  function radios(doc) {
    return [...doc.querySelectorAll("input")].filter((n) => kindOf(n) === "radio" && /lblOnOf$/.test(n.getAttribute("name") || n.name || ""));
  }

  function labelOfRadio(doc, radio) {
    const own = labels(doc).find((l) => l.getAttribute("for") === radio.id);
    return norm(own ? own.textContent : radio.nextElementSibling?.textContent);
  }

  function readMode(doc) {
    const checked = radios(doc).find((r) => r.checked === true);
    if (!checked) return null;
    const label = labelOfRadio(doc, checked);
    if (label.includes("agend")) return "agendar";
    if (label.includes("finaliz")) return "finalizar";
    return null;
  }

  function findDateInput(doc) {
    const byId = [...doc.querySelectorAll("input")].find((n) => /agendamento/i.test(n.id || "") && /_input$/.test(n.id || ""));
    if (byId) return byId;
    const label = labels(doc).find((l) => norm(l.textContent).includes("data do agendamento"));
    if (!label) return null;
    const target = label.getAttribute("for");
    return target ? doc.getElementById(target) : label.nextElementSibling;
  }

  function problemFromResolution(doc) {
    const area = doc.getElementById("frmAtendimento:tbvAtendimento:resolucao");
    const raw = String(area?.value || "");
    const tagged = raw.match(/PROBLEMA\s*\/\s*D[ÚU]VIDA:\s*([^\n]+)/i);
    if (tagged) return text(tagged[1]);
    return text(raw.split("\n").find((line) => text(line)) || "");
  }

  function readPage(doc, url) {
    const id = String(url || "").match(/\/crm-atendimento\/([^/?#]+)/);
    const first = (pattern) => valuesByLabel(doc, pattern)[0] || "";
    return {
      protocolo: first(/^protocolo\b/),
      atendimentoId: id ? id[1] : "",
      cliente: first(/^cliente\b/),
      solicitante: first(/^solicitante\b/),
      telefones: [...new Set(valuesByLabel(doc, /telefone|celular|^fone\b/).filter((v) => v.replace(/\D/g, "").length >= 8))],
      problema: first(/^problema\b/) || problemFromResolution(doc),
      dateText: valueOf(findDateInput(doc)),
      mode: readMode(doc)
    };
  }

  async function applySave(verdict, page, remember, now = Date.now()) {
    const store = globalThis.RetornosStore;
    if (!verdict || verdict.outcome !== "ok" || !store || !page?.protocolo) return;
    if (verdict.mode === "finalizar") {
      await store.removeByProtocolo(page.protocolo);
    } else if (verdict.mode === "agendar") {
      if (remember === false) {
        await store.removeByProtocolo(page.protocolo);
        return;
      }
      const due = globalThis.RetornosSchedule.parseCrmValue(page.dateText);
      if (!due) return;
      await store.upsertCrm({ ...page, dueAt: due.getTime() }, now);
    }
  }

  function readRemember(doc) {
    return doc.getElementById("atendeai-retornos-remember")?.checked !== false;
  }

  async function start(doc, win) {
    try {
      const store = globalThis.RetornosStore;
      if (!store || !(await store.isActive())) return;
      const href = () => String(win?.location?.href || "");
      const refresh = async () => {
        const page = readPage(doc, href());
        if (page.protocolo && page.atendimentoId) await store.refreshId(page.protocolo, page.atendimentoId);
      };
      [0, 1500, 4000].forEach((ms) => setTimeout(() => { void refresh(); }, ms));

      let snapshot = null;
      doc.addEventListener("atendeai:crm-ajax", (event) => {
        let signal = null;
        try { signal = JSON.parse(event.detail); } catch { return; }
        if (!signatureFor(signal?.source)) return;
        if (signal.phase === "send") {
          snapshot = { page: readPage(doc, href()), remember: readRemember(doc), radioMode: readMode(doc) };
        } else if (signal.phase === "complete" && snapshot) {
          const taken = snapshot;
          snapshot = null;
          const verdict = interpretSave(signal, { radioMode: taken.radioMode });
          if (verdict) void applySave(verdict, taken.page, taken.remember);
        }
      });
    } catch (error) {
      console.warn("AtendeAI: retornos, falha ao acompanhar o salvamento.", error);
    }
  }

  return {
    get SAVE_SIGNATURES() { return signatures; },
    interpretSave, readPage, readMode, findDateInput, applySave, start, summarizeXml,
    _test: { setSignatures(list) { signatures = list; } }
  };
})();

globalThis.RetornosCapture = RetornosCapture;
if (typeof window !== "undefined") {
  window.RetornosCapture = RetornosCapture;
  if (typeof document !== "undefined" && typeof location !== "undefined" && /\/crm-atendimento/.test(location.pathname)) {
    void RetornosCapture.start(document, window);
  }
}
