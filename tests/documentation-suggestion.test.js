const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(process.cwd(), "modules/documentation-suggestion.js"),
  "utf8"
);

const context = {
  window: {},
  console,
  chrome: {},
  document: {},
  location: { pathname: "/crm-atendimento/teste" },
  setTimeout,
  clearTimeout,
  Event,
  KeyboardEvent: class {}
};

vm.createContext(context);
vm.runInContext(source, context);

const api = context.window.DocumentationSuggestionModule.__test;

test("extrai código explícito de rejeição", () => {
  assert.deepEqual(
    [...api.extractExplicitCodes("Cliente recebeu Rejeição 610 ao emitir.")],
    ["610"]
  );
});

test("prefiltro prioriza documentação com código exato", () => {
  const candidates = [
    { id: "1", label: "Rejeição 533: Total da BC ICMS-ST" },
    { id: "2", label: "Rejeição 610: Total da NF-e difere do somatório dos itens" },
    { id: "3", label: "CFOP inválido para devolução" }
  ];

  const result = api.prefilterCandidates(
    candidates,
    "Cliente recebeu rejeição 610 ao emitir NF-e.",
    2
  );

  assert.equal(result[0].id, "2");
  assert.equal(result.length, 2);
});

test("prefiltro respeita limite de candidatos", () => {
  const candidates = Array.from({ length: 808 }, (_, i) => ({
    id: String(i + 1),
    label: `Documentação fiscal ${i + 1}`
  }));

  const result = api.prefilterCandidates(candidates, "erro fiscal", 200);
  assert.equal(result.length, 200);
});
