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

test('F15: Focus selectors only target its namespace and never SZ classes', () => {
  const selectors = extractSelectors(fs.readFileSync('styles/support-focus.css', 'utf8'));
  assert.ok(injectedCss.includes('styles/support-focus.css'));
  for (const selector of selectors) {
    assert.match(selector, /\.atendeai-focus-/);
    assert.doesNotMatch(selector, /\.(?:sz_contact|contact-layout|content|name|contact-name)(?:\W|$)/);
  }
});
