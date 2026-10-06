// AtendeAI appearance. Applies only to exclusive extension roots, never to SZ.
const ThemeModule = (() => {
  const KEY = "atendeai_theme";
  const ATTR = "data-atendeai-theme";
  const VALUES = Object.freeze(["dark", "light", "system"]);
  const ROOT_IDS = Object.freeze([
    "containerBotoesGemini",
    "atendeai-recovery-report-fallback",
    "atendeai-recovery-overlay",
    "atendeai-smart-reply",
    "geminiAgendaModal",
    "geminiResumoPopup",
    "geminiDicaPopup",
    "geminiDocsPopup",
    "gemini-notification-toast",
    "atendeai-onboarding-overlay",
    "atendeai-config-modal-overlay",
    "chamadoManualPopup",
    "productClassifierResult",
    "popupMensagensPadrao"
  ]);
  const ROOT_CLASSES = Object.freeze([
    "atendeai-modal-overlay",
    "atendeai-observations-drawer",
    "atendeai-observations-overlay",
    "atendeai-observations-button",
    "recovery-buffer-panel",
    "smart-reply-preview"
  ]);
  const ROOT_SELECTOR = [
    ...ROOT_IDS.map(id => `#${id}`),
    ...ROOT_CLASSES.map(name => `.${name}`)
  ].join(",");
  let preference = "dark";
  let media;
  let observer;
  let starting;

  function classesOf(el) {
    return String(el?.className || "").split(/\s+/).filter(Boolean);
  }
  function isRoot(el) {
    if (!el) return false;
    if (el.id && ROOT_IDS.includes(el.id)) return true;
    return ROOT_CLASSES.some(name => classesOf(el).includes(name));
  }
  function normalize(value) {
    return VALUES.includes(value) ? value : "dark";
  }
  function resolved() {
    if (preference === "light") return "light";
    if (preference === "system") return media?.matches ? "dark" : "light";
    return "dark";
  }
  function paint(el) {
    if (!isRoot(el)) return;
    const theme = resolved();
    if (el.getAttribute?.(ATTR) !== theme) el.setAttribute(ATTR, theme);
  }
  function apply(root) {
    if (root) {
      paint(root);
      return resolved();
    }
    document.querySelectorAll(ROOT_SELECTOR).forEach(paint);
    return resolved();
  }
  function scan(node) {
    paint(node);
    node?.querySelectorAll?.(ROOT_SELECTOR)?.forEach(paint);
  }
  async function load() {
    const data = await new Promise(resolve => {
      try {
        chrome.storage.local.get([KEY], store => {
          resolve(chrome.runtime?.lastError ? {} : store || {});
        });
      } catch {
        resolve({});
      }
    });
    preference = Object.prototype.hasOwnProperty.call(data, KEY) ? normalize(data[KEY]) : "dark";
  }
  async function init() {
    if (starting) {
      await starting;
      apply();
      return preference;
    }
    starting = (async () => {
      media = globalThis.window?.matchMedia?.("(prefers-color-scheme: dark)");
      const onScheme = () => { if (preference === "system") apply(); };
      media?.addEventListener?.("change", onScheme);
      if (!media?.addEventListener && media?.addListener) media.addListener(onScheme);
      chrome.storage?.onChanged?.addListener((changes, area) => {
        if (area === "local" && Object.prototype.hasOwnProperty.call(changes, KEY)) {
          preference = changes[KEY].newValue == null ? "dark" : normalize(changes[KEY].newValue);
          apply();
        }
      });
      if (!observer && document.body) {
        observer = new MutationObserver(records => {
          for (const record of records) {
            paint(record.target);
            for (const node of record.addedNodes || []) scan(node);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
      await load();
      apply();
    })();
    await starting;
    return preference;
  }
  return { KEY, ATTR, VALUES, init, apply, resolved: () => resolved(), preference: () => preference };
})();
globalThis.ThemeModule = ThemeModule;
if (globalThis.window) globalThis.window.ThemeModule = ThemeModule;
