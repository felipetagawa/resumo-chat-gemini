// Popup do ícone: segue o tema escolhido nas Configurações.
void Promise.resolve(globalThis.ThemeModule?.init?.()).finally(() => {
  requestAnimationFrame(() => document.documentElement.setAttribute("data-theme-ready", ""));
});
