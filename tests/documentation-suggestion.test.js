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

test("extrai somente PROBLEMA / DÚVIDA do resumo estruturado", () => {
  const summary = [
    "PROBLEMA / DÚVIDA: Cliente recebeu rejeição 610 ao emitir NF-e.",
    "",
    "SOLUÇÃO APRESENTADA: Foi ajustada a numeração e realizada nova emissão.",
    "",
    "OPORTUNIDADE DE UPSELL: NÃO."
  ].join("\n");

  assert.equal(
    api.extractProblemFromStructuredText(summary),
    "Cliente recebeu rejeição 610 ao emitir NF-e."
  );
});

test("retorna vazio quando texto não possui seção de problema", () => {
  assert.equal(
    api.extractProblemFromStructuredText("Texto livre sem estrutura."),
    ""
  );
});
