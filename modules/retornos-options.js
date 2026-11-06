// Options-page wiring for "Retornos automáticos": visible only for Suporte.
const RetornosOptions = (() => {
  const SECTOR_KEY = "atendeai_user_sector";

  function sectorOf() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([SECTOR_KEY], (data) => resolve(String(data?.[SECTOR_KEY] || "").trim().toLowerCase()));
      } catch { resolve(""); }
    });
  }

  function say(doc, text) {
    const status = doc.getElementById("retornosDiagStatus");
    if (status) status.textContent = text;
  }

  async function initDiagnostic(doc) {
    const diag = globalThis.RetornosDiagnostic;
    const box = doc.getElementById("retornosDiagOn");
    if (!diag || !box) return;
    box.checked = await diag.isOn();
    box.addEventListener("change", () => {
      try { chrome.storage.local.set({ [diag.ON_KEY]: box.checked }); } catch { /* ignore */ }
      say(doc, box.checked ? "Gravando. Recarregue a página do CRM e faça o agendamento ou a finalização." : "Gravação desligada.");
    });
    doc.getElementById("retornosDiagCopy")?.addEventListener("click", async () => {
      const json = await diag.export();
      try {
        await navigator.clipboard.writeText(json);
        say(doc, "Gravação copiada.");
      } catch { say(doc, "Não consegui copiar. Tente de novo com esta aba em primeiro plano."); }
    });
    doc.getElementById("retornosDiagClear")?.addEventListener("click", async () => {
      await diag.clear();
      say(doc, "Gravação apagada.");
    });
  }

  async function init(doc = document) {
    const card = doc.getElementById("retornosCard");
    if (!card) return;
    const sync = async () => { card.hidden = (await sectorOf()) !== "suporte"; };
    await sync();
    try { chrome.storage.onChanged?.addListener?.((changes) => { if (changes[SECTOR_KEY]) void sync(); }); } catch { /* ignore */ }
    await initDiagnostic(doc);
  }

  return { init, initDiagnostic };
})();

globalThis.RetornosOptions = RetornosOptions;
if (typeof document !== "undefined" && document.getElementById) {
  document.addEventListener("DOMContentLoaded", () => { void RetornosOptions.init(document); });
}
