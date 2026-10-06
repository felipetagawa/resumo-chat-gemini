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

const ieCandidates = [
  { id: "incorreta", label: "IE incorreta" },
  { id: "ausente", label: "IE ausente" },
  { id: "invalida", label: "IE inválida" },
  { id: "nao-informada", label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA" },
  { id: "nao-habilitada", label: "IE não habilitada" }
];

test('R1. "IE não informada" prioriza label com "não informada" sobre "IE incorreta"', () => {
  const result = api.prefilterCandidates(
    ieCandidates,
    "IE do destinatário não foi informada",
    5
  );
  assert.equal(result[0].id, "nao-informada");
});

test('R2. "IE incorreta" prioriza "IE incorreta"', () => {
  const result = api.prefilterCandidates(ieCandidates, "IE incorreta", 5);
  assert.equal(result[0].id, "incorreta");
});

test('R3. token genérico "IE" tem peso inferior a termo discriminativo', () => {
  const ranked = api.rankCandidates(ieCandidates, "IE ausente");
  const genericIe = ranked.find((item) => item.candidate.id === "invalida");
  const discriminative = ranked.find((item) => item.candidate.id === "ausente");
  assert.ok(discriminative.lexicalScore > genericIe.lexicalScore);
  assert.equal(ranked[0].candidate.id, "ausente");
});

test("R4. bigram discriminativo pesa mais que unigram genérico", () => {
  const ranked = api.rankCandidates(ieCandidates, "IE não informada");
  const byId = Object.fromEntries(ranked.map((item) => [item.candidate.id, item]));
  assert.ok(byId["nao-informada"].lexicalScore > byId.incorreta.lexicalScore);
  assert.ok(
    (byId["nao-informada"].bigramScore || 0) > (byId.incorreta.tokenScore || 0)
  );
});

test("R5. rejeição 232 mantém prioridade máxima", () => {
  const candidates = [
    { id: "noise-1", label: "IE do destinatário não informada no cadastro auxiliar" },
    { id: "232", label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA" },
    { id: "noise-2", label: "IE destinatário não informada em outro fluxo" }
  ];
  const result = api.prefilterCandidates(
    candidates,
    "Cliente recebeu rejeição 232 e a IE do destinatário não foi informada",
    3
  );
  assert.equal(result[0].id, "232");
});

test("R6. memória confirmada melhora ranking em empate/ambiguidade", () => {
  const memory = {
    version: 1,
    docs: {
      ausente: {
        updatedAt: Date.now(),
        confirmations: 6,
        positiveFeatures: { ausente: 5, ie: 2 },
        negativeFeatures: {}
      }
    }
  };
  const tied = [
    { id: "incorreta", label: "IE do destinatário" },
    { id: "ausente", label: "IE do destinatário" }
  ];
  const withoutMemory = api.prefilterCandidates(tied, "problema na IE do destinatário", 2);
  const withMemory = api.prefilterCandidates(tied, "problema na IE do destinatário", {
    limit: 2,
    memory
  });
  assert.equal(withoutMemory[0].id, "incorreta");
  assert.equal(withMemory[0].id, "ausente");
});

test("R7. memória fraca não sobrepõe código explícito", () => {
  const memory = {
    version: 1,
    docs: {
      ausente: {
        updatedAt: Date.now(),
        confirmations: 2,
        positiveFeatures: { ie: 2, ausente: 2 },
        negativeFeatures: {}
      }
    }
  };
  const candidates = [
    { id: "ausente", label: "IE ausente" },
    { id: "232", label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA" }
  ];
  const result = api.prefilterCandidates(
    candidates,
    "Cliente recebeu rejeição 232",
    { limit: 2, memory }
  );
  assert.equal(result[0].id, "232");
});

test("R8. sem evidência forte mantém fallback amplo de candidatos", () => {
  const candidates = Array.from({ length: 808 }, (_, i) => ({
    id: String(i + 1),
    label: `Documentação fiscal ${i + 1}`
  }));
  const result = api.prefilterCandidates(candidates, "erro fiscal");
  assert.equal(result.length, 200);
});

test("R9. evidência forte reduz candidatos para top 40", () => {
  const candidates = [
    { id: "232", label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA" },
    ...Array.from({ length: 80 }, (_, i) => ({
      id: `other-${i}`,
      label: `Documentação fiscal ${i + 1}`
    }))
  ];
  const result = api.prefilterCandidates(
    candidates,
    "Cliente recebeu rejeição 232 e a IE do destinatário não foi informada"
  );
  assert.equal(result.length, 40);
  assert.equal(result[0].id, "232");
});

test("R10. candidato de código explícito nunca é removido pelo corte", () => {
  const ranked = Array.from({ length: 45 }, (_, i) => ({
    candidate: { id: String(i), label: `Doc ${i}` },
    score: 45 - i,
    lexicalScore: 45 - i,
    codeHits: i === 44 ? 1 : 0,
    index: i
  }));
  const result = api.takeCandidatesForJev(ranked, { strong: true });
  assert.ok(result.some((candidate) => candidate.id === "44"));
  assert.ok(result.length <= 41);
});

test("M6. código explícito sem candidato correspondente => WEAK / até 200", () => {
  const context = "erro 1234 ao cadastrar produto";
  const candidates = Array.from({ length: 250 }, (_, i) => ({
    id: String(i + 1),
    label: "Ajuste de estoque manual"
  }));
  const ranked = api.rankCandidates(candidates, context);
  const codes = [...api.extractExplicitCodes(context)];
  assert.deepEqual(codes, ["1234"]);
  assert.equal(api.hasStrongRankingEvidence(ranked, codes), false);
  const result = api.prefilterCandidates(candidates, context);
  assert.equal(result.length, 200);
});

test('LX1. "ie" não pontua "cliente"', () => {
  const ranked = api.rankCandidates(
    [{ id: "cliente", label: "Cadastro do CLIENTE" }],
    "problema na IE"
  );
  assert.equal(ranked[0].tokenScore, 0);
  assert.equal(ranked[0].bigramScore, 0);
  assert.equal(ranked[0].lexicalScore, 0);
});

test('LX2. "ie" pontua token IE', () => {
  const ranked = api.rankCandidates(
    [{ id: "ie", label: "IE incorreta" }],
    "problema na IE"
  );
  assert.ok(ranked[0].tokenScore > 0);
  assert.equal(ranked[0].candidate.id, "ie");
});

test('LX3. "nao informada" não pontua substring parcial', () => {
  const ranked = api.rankCandidates(
    [
      { id: "parcial", label: "Zona informadax auxiliar" },
      { id: "sequencia", label: "Campo não informada" }
    ],
    "nao informada"
  );
  const byId = Object.fromEntries(ranked.map((item) => [item.candidate.id, item]));
  assert.equal(byId.parcial.tokenScore, 0);
  assert.equal(byId.parcial.bigramScore, 0);
  assert.equal(byId.parcial.lexicalScore, 0);
  assert.ok(byId.sequencia.bigramScore > 0);
  assert.ok(byId.sequencia.lexicalScore > byId.parcial.lexicalScore);
});

test('LX4. "IE do destinatário não foi informada" mantém REJEIÇÃO 232 acima das alternativas próximas', () => {
  const candidates = [
    { id: "cliente", label: "Cadastro do CLIENTE" },
    { id: "incorreta", label: "IE incorreta" },
    { id: "ausente", label: "IE ausente" },
    { id: "invalida", label: "IE inválida" },
    { id: "nao-habilitada", label: "IE não habilitada" },
    { id: "232", label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA" }
  ];
  const ranked = api.rankCandidates(candidates, "IE do destinatário não foi informada");
  assert.equal(ranked[0].candidate.id, "232");
  const cliente = ranked.find((item) => item.candidate.id === "cliente");
  assert.equal(cliente.tokenScore, 0);
  assert.equal(cliente.lexicalScore, 0);
});

test("M7. código explícito com candidato correspondente => STRONG / top 40", () => {
  const context = "rejeição 232";
  const candidates = [
    { id: "232", label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA" },
    ...Array.from({ length: 80 }, (_, i) => ({
      id: `other-${i}`,
      label: `Documentação fiscal ${i + 1}`
    }))
  ];
  const ranked = api.rankCandidates(candidates, context);
  const codes = api.extractExplicitCodes(context);
  assert.equal(api.hasStrongRankingEvidence(ranked, codes), true);
  const result = api.prefilterCandidates(candidates, context);
  assert.equal(result.length, 40);
  assert.equal(result[0].id, "232");
  assert.ok(result.some((candidate) => candidate.id === "232"));
});
