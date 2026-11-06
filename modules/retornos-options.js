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

  const DAY_OPTIONS = [
    ["amanha", "Amanhã"], ["depois", "Depois de amanhã"], ["dom", "Próximo domingo"], ["seg", "Próxima segunda"],
    ["ter", "Próxima terça"], ["qua", "Próxima quarta"], ["qui", "Próxima quinta"], ["sex", "Próxima sexta"], ["sab", "Próximo sábado"]
  ];

  function node(doc, tag, props = {}) {
    const n = doc.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "text") n.textContent = v;
      else if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    });
    return n;
  }

  async function initSettings(doc) {
    const store = globalThis.RetornosStore;
    const enabled = doc.getElementById("retornosEnabled");
    const holder = doc.getElementById("retornosShortcuts");
    if (!store || !enabled || !holder) return;
    let current = (await store.getSettings()).shortcuts.map((s) => ({ ...s }));
    enabled.checked = (await store.getSettings()).enabled;
    enabled.addEventListener("change", () => { void store.setSettings({ enabled: enabled.checked }); });

    const persist = () => store.setSettings({ shortcuts: current.map((s) => ({ ...s })) });
    const paint = () => {
      while (holder.children.length) holder.children[0].remove();
      current.forEach((shortcut) => {
        const day = node(doc, "select", { "data-role": "day", "aria-label": "Dia" });
        DAY_OPTIONS.forEach(([value, label]) => day.appendChild(node(doc, "option", { value, text: label })));
        day.value = shortcut.day;
        const time = node(doc, "input", { type: "time", "data-role": "time", "aria-label": "Hora" });
        time.value = shortcut.time;
        const remove = node(doc, "button", { type: "button", "data-role": "remove", text: "Remover", "aria-label": "Remover atalho" });
        day.addEventListener("change", () => { shortcut.day = day.value; void persist(); });
        time.addEventListener("change", () => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)) { shortcut.time = time.value; void persist(); } });
        remove.addEventListener("click", async () => { current = current.filter((s) => s !== shortcut); paint(); await persist(); });
        const row = node(doc, "div", { class: "retornos-shortcut-row", style: "display:flex; gap:8px; align-items:center;" });
        [day, time, remove].forEach((n) => row.appendChild(n));
        holder.appendChild(row);
      });
    };
    paint();
    doc.getElementById("retornosShortcutAdd")?.addEventListener("click", async () => {
      current.push({ id: `custom-${Date.now().toString(36)}-${current.length}`, day: "amanha", time: "08:00" });
      paint();
      await persist();
    });
    doc.getElementById("retornosShortcutReset")?.addEventListener("click", async () => {
      current = globalThis.RetornosSchedule.defaultShortcuts().map((s) => ({ ...s }));
      paint();
      await persist();
    });
  }

  async function init(doc = document) {
    const card = doc.getElementById("retornosCard");
    if (!card) return;
    const sync = async () => { card.hidden = (await sectorOf()) !== "suporte"; };
    await sync();
    try { chrome.storage.onChanged?.addListener?.((changes) => { if (changes[SECTOR_KEY]) void sync(); }); } catch { /* ignore */ }
    await initSettings(doc);
    await initDiagnostic(doc);
  }

  return { init, initDiagnostic, initSettings };
})();

globalThis.RetornosOptions = RetornosOptions;
if (typeof document !== "undefined" && document.getElementById) {
  document.addEventListener("DOMContentLoaded", () => { void RetornosOptions.init(document); });
}
