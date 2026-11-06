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

  let leaveWaitMs = 4000;
  const MESSAGE_RE = /ui-(?:messages-(?:error|warn|info|fatal)-(?:summary|detail)|growl-title|growl-message)[^>]*>([^<]*)</g;
  const GROWL_PROBLEM_RE = /severity["']?\s*:\s*["'](?:warn|error|fatal)["']/;
  const ERROR_RE = /ui-messages-(?:error|fatal)|ui-message-(?:error|fatal)|ui-growl-(?:item[^"]*)?(?:error|fatal)|ui-state-error/;
  // The dialog is opened by a script the CRM runs (<eval>), e.g. PF('dlgConfirmarAgendamento').show(), or by the
  // Salvar button's oncomplete when args.agendaProxima is true. The re-rendered form naming it shows nothing.
  const SHOWS_CONFIRM_RE = /dlgConfirmarAgendamento['"]?\s*\)?\s*\.show\s*\(/;
  const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const norm = (v) => text(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function summarizeXml(xml) {
    const body = String(xml ?? "");
    let args = null;
    const m = body.match(/<extension[^>]*type="args"[^>]*>([\s\S]*?)<\/extension>/);
    if (m) { try { args = JSON.parse(m[1]); } catch { args = null; } }
    const redirect = body.match(/<redirect url="([^"]*)"/);
    const evals = [...body.matchAll(/<eval>([\s\S]*?)<\/eval>/g)].map((e) => e[1]);
    // Observed 06/11/2026: validation answers update "frmTop:growl" with a script
    //   PrimeFaces.cw("Growl", ..., {msgs:[{summary:"Atenção",detail:"O problema deve ter ...",severity:'warn'}]})
    // (unquoted keys). Prefer each message's detail over its generic summary.
    const growl = (key) => [...body.matchAll(new RegExp(`["']?${key}["']?\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g"))].map((m) => m[1]);
    const details = growl("detail").map(text).filter(Boolean);
    const messages = [
      ...[...body.matchAll(MESSAGE_RE)].map((m) => text(m[1])).filter(Boolean),
      ...(details.length ? details : growl("summary").map(text).filter(Boolean))
    ];
    return {
      args, hasError: ERROR_RE.test(body), growlProblems: GROWL_PROBLEM_RE.test(body),
      redirect: redirect ? redirect[1] : null, evals, messages,
      updateIds: [...body.matchAll(/<update id="([^"]*)"/g)].map((m) => m[1]),
      // The real Salvar button also opens it from its own oncomplete: if(args.agendaProxima){PF('dlgConfirmarAgendamento').show();}
      showsConfirm: evals.some((e) => SHOWS_CONFIRM_RE.test(e)) || args?.agendaProxima === true
    };
  }

  // A short, personal-data-free description of what the CRM answered, for the "last save" note.
  function describe(summary) {
    const mask = (v) => String(v ?? "").replace(/\d{6,}/g, "…");
    const parts = [];
    const messages = [...new Set(summary.messages || [])].slice(0, 2);
    if (messages.length) parts.push(`mensagem: ${messages.map(mask).join(" / ")}`);
    const evals = (summary.evals || []).map((e) => mask(text(e).replace(/<!\[CDATA\[|\]\]>/g, ""))).filter(Boolean).slice(0, 2);
    if (evals.length) parts.push(`script: ${evals.join(" ; ")}`);
    if (summary.args && Object.keys(summary.args).length) parts.push(`args: ${Object.keys(summary.args).slice(0, 6).join(",")}`);
    if ((summary.updateIds || []).length) parts.push(`atualizou: ${summary.updateIds.slice(0, 4).map((id) => id.split(":").pop()).join(",")}`);
    return parts.join(" | ").slice(0, 260);
  }

  // Observed 06/11/2026: a real save does NOT leave the screen. It answers with a Growl toast
  //   {summary:"Salvo",detail:"Atendimento salvo com sucesso!",severity:'info'}
  // and refreshes the form. That message is the proof of a save.
  const confirmedSaved = (summary) => (summary.messages || []).some((m) => /salvo com sucesso/i.test(m));
  // Leaving the screen (the CRM redirects) is also proof; anything else is not.
  const leaves = (summary) => Boolean(summary.redirect) || (summary.evals || []).some((e) => /location|href|redirect/i.test(e));
  const asksConfirmation = (summary) => summary.showsConfirm === true || (summary.evals || []).some((e) => SHOWS_CONFIRM_RE.test(e));

  const summaryOf = (signal) => {
    const summary = signal.response && typeof signal.response === "object" ? signal.response : summarizeXml(signal.responseText);
    // pfAjaxComplete also hands over the parsed `args`; prefer it over the XML extension.
    return signal.args && typeof signal.args === "object" ? { ...summary, args: signal.args } : summary;
  };

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
    if (Number(signal.status) !== 200 || summary.args?.validationFailed === true) {
      return { outcome: "refused", mode, reason: "validacao", detail: describe(summary) };
    }
    // The success toast wins: the form the CRM re-renders along with it can hold error-styled fields
    // or name the confirmation dialog, and neither undoes the save the toast confirms.
    const saved = confirmedSaved(summary);
    // Salvar can open "Confirmar Agendamento" (another chamado close to that time): nothing is saved yet.
    if (!saved && signature.mode !== "confirm" && asksConfirmation(summary)) return { outcome: "pending", mode };
    if (!saved && summary.hasError === true) return { outcome: "refused", mode, reason: "validacao", detail: describe(summary) };
    // A warning/error toast with no sign of leaving the screen is the CRM refusing (e.g. "O problema
    // deve ter ao menos 10 caracteres!"). If the screen is left anyway, the save went through.
    if (!saved && summary.growlProblems === true && !leaves(summary)) return { outcome: "refused", mode, reason: "validacao", detail: describe(summary) };
    if (!mode) return { outcome: "unknown", mode: null, reason: "sem-modo", detail: describe(summary) };
    if (!saved && !leaves(summary)) return { outcome: "unknown", mode, reason: "ficou-na-tela", detail: describe(summary) };
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

  // Returns what it did: "guardado", "removido" or null (nothing changed).
  async function applySave(verdict, page, remember, now = Date.now()) {
    const store = globalThis.RetornosStore;
    if (!verdict || verdict.outcome !== "ok" || !store || !page?.protocolo) return null;
    if (verdict.mode === "finalizar") {
      await store.removeByProtocolo(page.protocolo);
      return "removido";
    }
    if (verdict.mode === "agendar") {
      if (remember === false) {
        await store.removeByProtocolo(page.protocolo);
        return "removido";
      }
      const due = globalThis.RetornosSchedule.parseCrmValue(page.dateText);
      if (!due) return null;
      await store.upsertCrm({ ...page, dueAt: due.getTime() }, now);
      return "guardado";
    }
    return null;
  }

  // The bridge sends the signal as the event detail and mirrors it in an attribute, because the
  // detail can be lost between the page world and this one.
  function signalOf(event, doc) {
    for (const raw of [event?.detail, doc.documentElement?.getAttribute?.("data-atendeai-crm-ajax")]) {
      if (!raw) continue;
      try { return JSON.parse(raw); } catch { /* try the next source */ }
    }
    return null;
  }

  // "Me lembrar" lives in the AtendeAI line, which PrimeFaces drops whenever it re-renders the form.
  // The technician's choice is kept in memory for the attendance on screen (its protocolo), so the
  // rebuilt line, and a Salvar sent before it is back, never tick an unticked box again.
  let rememberChoice = null;
  const protocoloOf = (doc) => valuesByLabel(doc, /^protocolo\b/)[0] || "";

  function keepRemember(doc, checked) {
    rememberChoice = { protocolo: protocoloOf(doc), checked: checked !== false };
  }

  function keptRemember(doc) {
    return rememberChoice && rememberChoice.protocolo === protocoloOf(doc) ? rememberChoice.checked : true;
  }

  function readRemember(doc) {
    const box = doc.getElementById("atendeai-retornos-remember");
    return box ? box.checked !== false : keptRemember(doc);
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
      // "Confirmar Agendamento" dialog waits for Continuar (Cancelar drops it, a new Salvar replaces it).
      let snapshot = null, held = null;

      const remember = (outcome, mode, reason, page, detail) => store.setLastSave?.({ at: Date.now(), outcome, mode, reason: reason || "", detail: detail || "", protocolo: page?.protocolo || "" });

      const settle = async (verdict, taken) => {
        if (verdict.outcome === "ok") {
          const did = await applySave(verdict, taken.page, taken.remember);
          await remember(did || "ignorado", verdict.mode, "", taken.page);
        } else if (verdict.outcome === "refused") {
          await remember("recusado", verdict.mode, verdict.reason, taken.page, verdict.detail);
        } else if (verdict.reason === "ficou-na-tela" && verdict.mode) {
          // No proof in the answer itself: a save makes the CRM leave this screen, so wait a moment for that.
          let done = false;
          const finish = (left) => {
            if (done) return;
            done = true;
            win.removeEventListener?.("beforeunload", onLeave);
            win.removeEventListener?.("pagehide", onLeave);
            if (left) void applySave({ outcome: "ok", mode: verdict.mode }, taken.page, taken.remember).then((did) => remember(did || "ignorado", verdict.mode, "saiu-da-tela", taken.page));
            else void remember("sem-confirmacao", verdict.mode, "ficou-na-tela", taken.page, verdict.detail);
          };
          const onLeave = () => finish(true);
          win.addEventListener?.("beforeunload", onLeave);
          win.addEventListener?.("pagehide", onLeave);
          setTimeout(() => finish(false), leaveWaitMs);
        } else {
          await remember("sem-confirmacao", verdict.mode, verdict.reason, taken.page, verdict.detail);
        }
      };

      doc.addEventListener("atendeai:crm-ajax", (event) => {
        const signal = signalOf(event, doc);
        if (!signal) return;
        // The answer pairs with the request sent by its source, and uses the signature read at send
        // time: by now the answer may have re-rendered the form without that button.
        if (signal.phase === "complete" && snapshot && snapshot.source === signal.source) {
          const taken = snapshot;
          snapshot = null;
          const verdict = interpretSave(signal, { radioMode: taken.radioMode, signature: taken.signature });
          if (verdict?.outcome === "pending") held = taken;
          else {
            held = null;
            if (verdict) void settle(verdict, taken);
          }
          return;
        }
        const signature = signatureFor(signal.source, doc);
        if (!signature) return;
        if (signature.mode === "cancel") { held = null; snapshot = null; return; }
        if (signal.phase === "send") {
          if (signature.mode === "confirm") snapshot = held ? { ...held, signature, source: signal.source } : null;
          else { held = null; snapshot = { page: readPage(doc, href()), remember: readRemember(doc), radioMode: readMode(doc), signature, source: signal.source }; }
        }
      });
    } catch (error) {
      console.warn("AtendeAI: retornos, falha ao acompanhar o salvamento.", error);
    }
  }

  return {
    get SAVE_SIGNATURES() { return signatures; },
    hasSignatures: () => signatures.length > 0,
    interpretSave, readPage, readMode, findDateInput, applySave, start, summarizeXml, keepRemember, keptRemember,
    _test: { setSignatures(list) { signatures = list; }, setLeaveWait(ms) { leaveWaitMs = ms; } }
  };
})();

globalThis.RetornosCapture = RetornosCapture;
if (typeof window !== "undefined") {
  window.RetornosCapture = RetornosCapture;
  if (typeof document !== "undefined" && typeof location !== "undefined" && /\/crm-atendimento/.test(location.pathname)) {
    void RetornosCapture.start(document, window);
  }
}
