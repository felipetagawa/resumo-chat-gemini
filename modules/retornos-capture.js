// Reads the /crm-atendimento screen and decides, from the CRM's own ajax answer, whether a save was
// accepted and whether it was an Agendar or a Finalizar. Anything uncertain returns null/"unknown"
// and changes nothing: a return is only created, moved or removed on a clear, accepted save.
const RetornosCapture = (() => {
  // One entry per CRM request that saves an attendance. A request is matched by its
  // javax.faces.source, either by regex (`source`) or, since the CRM's ids are auto-generated
  // (j_idt92), by the button it came from (`form` + `button` text, read from the page).
  //   mode: "agendar" | "finalizar" | "radio" (the Agendar/Finalizar radio decides) | "confirm"
  //   ("Continuar" in the "Confirmar Agendamento" dialog: it finishes the save started by Salvar), "cancel" ("Cancelar" there: drops it).
  // Read from the live page (crm-atendimento, 06/11/2026), NOT yet from a recorded save. The response
  // rules in interpretSave fail closed: anything not clearly accepted changes nothing.
  const RECORDED_SIGNATURES = [
    { mode: "radio", form: "frmAtendimento", button: /^salvar$/i },
    { mode: "confirm", form: "frmConfirmarAgendamento", button: /^continuar$/i },
    { mode: "cancel", form: "frmConfirmarAgendamento", button: /^cancelar$/i }
  ];
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
    const evals = [...body.matchAll(/<eval>([\s\S]*?)<\/eval>/g)].map((e) => e[1]);
    return {
      args, hasError: ERROR_RE.test(body), redirect: redirect ? redirect[1] : null, evals,
      showsConfirm: /dlgConfirmarAgendamento/.test(body)
    };
  }

  // A saved attendance leaves the screen (the CRM redirects); anything else is not proof of a save.
  const leaves = (summary) => Boolean(summary.redirect) || (summary.evals || []).some((e) => /location|href|redirect/i.test(e));
  const asksConfirmation = (summary) => summary.showsConfirm === true || /dlgConfirmarAgendamento/.test(JSON.stringify(summary.evals || []));

  const summaryOf = (signal) => (signal.response && typeof signal.response === "object"
    ? signal.response : summarizeXml(signal.responseText));

  function signatureFor(source, doc) {
    const id = String(source || "");
    if (!id) return null;
    return signatures.find((s) => {
      if (s.source) return s.source.test(id);
      if (!s.button || !doc || !id.startsWith(`${s.form}:`)) return false;
      const node = doc.getElementById(id);
      return Boolean(node) && s.button.test(text(node.textContent));
    }) || null;
  }

  function interpretSave(signal, ctx = {}) {
    if (!signal || signal.phase !== "complete") return null;
    const signature = ctx.signature || signatureFor(signal.source, ctx.doc);
    if (!signature) return null;
    const mode = signature.mode === "radio" || signature.mode === "confirm" ? ctx.radioMode || null : signature.mode;
    const summary = summaryOf(signal);
    if (Number(signal.status) !== 200 || summary.args?.validationFailed === true || summary.hasError === true) {
      return { outcome: "refused", mode };
    }
    // Salvar can open "Confirmar Agendamento" (another chamado close to that time): nothing is saved yet.
    if (signature.mode !== "confirm" && asksConfirmation(summary)) return { outcome: "pending", mode };
    if (!mode || !leaves(summary)) return { outcome: "unknown", mode };
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

  // PrimeFaces labels point at the component wrapper (a span) as often as at the input itself.
  const inputIn = (node) => (!node ? null : isField(node) ? node : node.querySelector?.("input") || null);

  function valueNear(doc, label) {
    const target = label.getAttribute("for");
    if (target) {
      const node = doc.getElementById(target);
      return valueOf(inputIn(node) || node);
    }
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
    const label = labels(doc).find((l) => norm(l.textContent).includes("data do agendamento"));
    const target = label?.getAttribute("for");
    const wrapper = target ? doc.getElementById(target) : label?.nextElementSibling;
    // Observed: label[for] = the calendar's span ("...:dataA"), the real input is "...:dataA_input".
    const found = inputIn(wrapper) || (target ? doc.getElementById(`${target}_input`) : null);
    if (found) return found;
    return [...doc.querySelectorAll("input")].find((n) => /(?:agendamento|dataA)_input$/i.test(n.id || "")) || null;
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

      // `snapshot`: the page as it was when Salvar was sent. `held`: the same snapshot kept while the
      // "Confirmar Agendamento" dialog waits for Continuar (Cancelar sends nothing we track, and a new
      // Salvar replaces it).
      let snapshot = null, held = null;
      doc.addEventListener("atendeai:crm-ajax", (event) => {
        let signal = null;
        try { signal = JSON.parse(event.detail); } catch { return; }
        const signature = signatureFor(signal?.source, doc);
        if (!signature) return;
        if (signature.mode === "cancel") { held = null; snapshot = null; return; }
        if (signal.phase === "send") {
          if (signature.mode === "confirm") snapshot = held ? { ...held, signature, source: signal.source } : null;
          else { held = null; snapshot = { page: readPage(doc, href()), remember: readRemember(doc), radioMode: readMode(doc), signature, source: signal.source }; }
        } else if (signal.phase === "complete" && snapshot && snapshot.source === signal.source) {
          const taken = snapshot;
          snapshot = null;
          const verdict = interpretSave(signal, { radioMode: taken.radioMode, signature: taken.signature });
          if (verdict?.outcome === "pending") held = taken;
          else {
            held = null;
            if (verdict) void applySave(verdict, taken.page, taken.remember);
          }
        }
      });
    } catch (error) {
      console.warn("AtendeAI: retornos, falha ao acompanhar o salvamento.", error);
    }
  }

  return {
    get SAVE_SIGNATURES() { return signatures; },
    hasSignatures: () => signatures.length > 0,
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
