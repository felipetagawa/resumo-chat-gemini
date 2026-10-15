const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const injectedCss = (manifest.content_scripts || [])
  .flatMap((entry) => entry.css || [])
  .filter((file) => file !== "styles/options.css");

const GENERIC_CLASSES = [
  "btn-primary",
  "btn-secondary",
  "btn-danger",
  "ai-btn",
  "ai-btn-primary",
  "ai-btn-secondary",
  "ai-btn-ghost",
  "ai-btn-danger",
  "modal-overlay",
  "modal-form-container",
  "modal-form-header",
  "modal-form-title",
  "modal-close-btn",
  "modal-form-body",
  "modal-form-footer",
  "form-group",
  "form-label",
  "form-input",
  "form-textarea",
  "form-select",
  "form-row",
  "chamado-popup",
  "product-classifier-result",
  "product-classifier-title",
  "product-classifier-primary",
  "product-classifier-list",
  "product-classifier-option",
  "product-classifier-empty",
  "popup-overlay",
  "popup-content",
  "popup-header",
  "popup-body",
  "tab-content",
  "action-btn",
  "status-badge",
  "calendar-day",
  "calendar-grid",
  "calendar-controls",
  "calendar-day-header",
  "day-number",
  "tela",
  "mic-btn",
  "radio-group",
  "radio-item"
];

const GENERIC_CLASS_RE = new RegExp(
  `(?:^|[^\\w-])\\.(?:${GENERIC_CLASSES.join("|")})(?:$|[^\\w-])`
);

const EXCLUSIVE_ROOT_RE = /#(?:containerBotoesGemini|chamadoManualPopup|productClassifierResult|gemini[A-Za-z][\w-]*|atendeai-[\w-]+)|(?:^|[^\w-])\.(?:atendeai|gemini)-[\w-]+/;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripKeyframes(css) {
  return css.replace(/@keyframes\s+[\w-]+\s*\{/g, (match, offset, source) => {
    let depth = 0;
    let i = offset + match.length - 1;
    do {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    } while (depth > 0 && i < source.length);
    return " ".repeat(i - offset);
  });
}

function splitSelectors(selectorText) {
  let inner = 0;
  let current = "";
  const out = [];
  for (const ch of selectorText) {
    if (ch === "(") inner++;
    if (ch === ")") inner--;
    if (ch === "," && inner === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function extractSelectors(css) {
  const cleaned = stripKeyframes(stripComments(css));
  const selectors = [];
  let i = 0;
  while (i < cleaned.length) {
    const brace = cleaned.indexOf("{", i);
    if (brace === -1) break;
    const selectorText = cleaned.slice(i, brace).trim();
    let depth = 0;
    let j = brace;
    do {
      if (cleaned[j] === "{") depth++;
      else if (cleaned[j] === "}") depth--;
      j++;
    } while (depth > 0 && j < cleaned.length);
    i = j;
    if (!selectorText || selectorText.startsWith("@")) continue;
    selectors.push(...splitSelectors(selectorText));
  }
  return selectors;
}

test("injected CSS lists the polish stylesheets and excludes options.css", () => {
  assert.ok(injectedCss.includes("styles/tokens.css"));
  assert.ok(injectedCss.includes("styles/modals.css"));
  assert.equal(injectedCss.includes("styles/options.css"), false);
});

test("injected design-system selectors stay under exclusive AtendeAI roots", () => {
  assert.ok(injectedCss.length > 0, "manifest must declare injected stylesheets");
  const leaks = [];
  for (const file of injectedCss) {
    const css = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const selector of extractSelectors(css)) {
      if (!GENERIC_CLASS_RE.test(selector)) continue;
      if (EXCLUSIVE_ROOT_RE.test(selector)) continue;
      leaks.push(`${file}: ${selector}`);
    }
  }
  assert.deepEqual(leaks, []);
});

test("injected stylesheets do not style the host document", () => {
  const forbidden = /^(html|body|:root|\*)(?:$|[^-\w])/;
  const leaks = [];
  for (const file of injectedCss) {
    const css = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const selector of extractSelectors(css)) {
      if (forbidden.test(selector)) leaks.push(`${file}: ${selector}`);
    }
  }
  assert.deepEqual(leaks, []);
});

test('F15: queue context selectors only target its namespace and never SZ classes', () => {
  const selectors = extractSelectors(fs.readFileSync('styles/queue-context.css', 'utf8'));
  assert.ok(injectedCss.includes('styles/queue-context.css'));
  for (const selector of selectors) {
    assert.match(selector, /\.atendeai-queue-ctx/);
    assert.doesNotMatch(selector, /\.(?:sz_contact|contact-layout|content|name|contact-name)(?:\W|$)/);
  }
});

test('queue context strip stays one fixed line in normal flow', () => {
  const css = fs.readFileSync('styles/queue-context.css', 'utf8');
  assert.match(css, /height: 16px/); assert.match(css, /margin: 0/); assert.match(css, /white-space: nowrap/);
  assert.doesNotMatch(css, /position:\s*(?:absolute|fixed)|transform|margin[^;]*-\d/);
});

test('dark Recovery overrides each light tone and avatar; private notes use a theme surface', () => {
  const css = fs.readFileSync('styles/recovery.css', 'utf8');
  for (let tone = 0; tone < 4; tone++) {
    const selector = `.recovery-buffer-panel[data-atendeai-theme="dark"] .recovery-buffer-item[data-tone="${tone}"]`;
    assert.ok(css.includes(`${selector} { border-left-color: var(--ai-`));
    assert.ok(css.includes(`${selector} .recovery-buffer-avatar { background: var(--ai-`));
  }
  assert.match(css, /\[data-atendeai-theme="dark"\] \.recovery-buffer-item\s*\{\s*background:\s*var\(--ai-surface-muted\)/);
  const privateNote = css.match(/\.recovery-private-note\s*\{([^}]+)\}/)[1];
  assert.match(privateNote, /background:\s*var\(--ai-surface-muted\)/);
});

test('Docs popup uses themed surfaces, foregrounds and explicit shared placeholders', () => {
  const docs = fs.readFileSync('modules/docs.js', 'utf8');
  assert.doesNotMatch(docs, /#[0-9a-f]{3,8}\b|background:\s*white|color:\s*white/i);
  assert.ok(docs.includes('background:var(--ai-primary); color:var(--ai-on-primary)'));
  const css = fs.readFileSync('styles/tokens.css', 'utf8');
  assert.match(css, /#geminiDocsPopup[^{}]+::placeholder\s*\{\s*color: var\(--ai-text-muted\);\s*opacity: 1;/);
});

test('message popup and form styles are isolated and use tokens for all visual states', () => {
  const css = fs.readFileSync('styles/modals.css', 'utf8');
  const messagesCss = stripComments(css.slice(css.indexOf('/* Standard messages:')));
  const selectors = extractSelectors(messagesCss);
  assert.ok(selectors.length > 20);
  for (const selector of selectors) {
    assert.match(selector, /^(?:#popupMensagensPadrao(?:\s|$)|\.atendeai-modal-overlay\[data-atendeai-messages-form\])/);
  }
  assert.doesNotMatch(messagesCss, /#[a-f\d]{3,8}\b|rgba?\(|:\s*(?:white|black)\b/i);
  const declarations = selector => [...messagesCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, group]) => splitSelectors(group.trim()).includes(selector))
    .map(([, , body]) => body).join(';');
  for (const [selector, token] of [
    ['#popupMensagensPadrao', 'surface'],
    ['#popupMensagensPadrao .messages-card', 'surface-muted'],
    ['#popupMensagensPadrao .messages-card:hover', 'surface-hover'],
    ['#popupMensagensPadrao .btn-enviar:hover', 'primary-hover'],
    ['#popupMensagensPadrao .btn-editar:hover', 'primary-soft'],
    ['#popupMensagensPadrao .btn-excluir:hover', 'danger-soft']
  ]) assert.ok(declarations(selector).includes(`background: var(--ai-${token})`), selector);
  for (const selector of ['#popupMensagensPadrao .btn-enviar', '#popupMensagensPadrao .messages-shortcut-badge']) {
    assert.match(declarations(selector), /color:\s*var\(--ai-on-primary\)/);
  }
  assert.match(declarations('#popupMensagensPadrao .messages-shortcut-input::placeholder'), /color:\s*var\(--ai-text-muted\)/);
  for (const selector of ['#popupMensagensPadrao .messages-shortcut-input:focus', '#popupMensagensPadrao button:focus-visible']) {
    assert.match(declarations(selector), /box-shadow:\s*var\(--ai-focus\)/);
  }
  assert.match(messagesCss, /:user-invalid\s*\{\s*border-color:\s*var\(--ai-danger\)/);
  assert.match(declarations('#popupMensagensPadrao #conteudoMensagens'), /scrollbar-color:\s*var\(--ai-border-strong\) var\(--ai-surface\)/);
});

test('Smart Reply card lives inside the dock footprint, uses tokens and respects reduced motion', () => {
  const css = fs.readFileSync('styles/smart-reply.css', 'utf8');
  assert.doesNotMatch(css, /position:\s*(fixed|absolute)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /smart-reply-profiles|smart-reply-preview|atendeai-reply-context/);
  assert.match(css, /#containerBotoesGemini\[data-reply-open="true"\] > :not\(\.gemini-dock-toolbar\):not\(#atendeai-smart-reply\)\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.smart-reply-card\s*\{[^}]*min-height:\s*0/);
  assert.match(css, /\.smart-reply-text\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.smart-reply-skeleton\s*\{[^}]*animation:\s*none/);
  assert.match(css, /:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ai-focus\)/);
});
