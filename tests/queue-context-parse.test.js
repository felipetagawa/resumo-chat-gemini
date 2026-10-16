// tests/queue-context-parse.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/queue-context-parse.js', 'utf8'), context);
  return context.QueueContextParse;
}
const P = load();
// Values created inside the vm realm fail strict deepEqual on prototype identity.
const plain = value => JSON.parse(JSON.stringify(value));
const client = text => ({ role: 'client', text });
const agent = text => ({ role: 'agent', text });
const system = text => ({ role: 'system', text });

test('anydesk: accepts number right after a request, with separators', () => {
  assert.equal(P.detectAnyDesk([agent('Pode me passar o número do AnyDesk?'), client('123 456 789')]), '123456789');
  assert.equal(P.detectAnyDesk([agent('qual o seu desk?'), client('1.234.567.890')]), '1234567890');
});

test('anydesk: accepts within the 3 client messages after the request, not the 4th', () => {
  assert.equal(P.detectAnyDesk([agent('me envia o id do any desk'), client('ok'), client('um momento'),
    client('o número é 1234567890')]), '1234567890');
  assert.equal(P.detectAnyDesk([agent('me envia o acesso remoto'), client('a'), client('b'), client('c'),
    client('meu código 123456789')]), null);
});

test('anydesk: isolated number is accepted without a request', () => {
  assert.equal(P.detectAnyDesk([client('987.654.321')]), '987654321');
});

test('anydesk: number inside a sentence before any request is rejected', () => {
  assert.equal(P.detectAnyDesk([client('meu pedido 123456789 deu erro'), agent('qual seu anydesk?')]), null);
});

test('anydesk: phone, CNPJ, CPF and protocol are rejected', () => {
  assert.equal(P.detectAnyDesk([agent('qual o anydesk?'), client('meu whats é 11 3456 7890')]), null);
  assert.equal(P.detectAnyDesk([agent('qual o anydesk?'), client('cnpj 12.345.678/0001-90')]), null);
  assert.equal(P.detectAnyDesk([agent('qual o anydesk?'), client('123.456.789-00')]), null);
  assert.equal(P.detectAnyDesk([agent('qual o anydesk?'), client('protocolo 202610141')]), null);
  assert.equal(P.detectAnyDesk([agent('qual o anydesk?'), client('12345678000190')]), null);
});

test('anydesk: "tela" is not mistaken for "tel"; the most recent code wins', () => {
  assert.equal(P.detectAnyDesk([agent('anydesk?'), client('na tela 123456789')]), '123456789');
  assert.equal(P.detectAnyDesk([agent('anydesk?'), client('123456789'),
    agent('o anydesk mudou? manda de novo'), client('987654321')]), '987654321');
});

test('divider: without transfer, client messages before the first agent message', () => {
  const r = plain(P.problemMessages([client('bom dia'), client('não emite nota'), agent('Olá, sou o Felipe'), client('ok')]));
  assert.deepEqual(r, { texts: ['bom dia', 'não emite nota'], beforeDivider: true });
});

test('divider: last transfer wins and earlier sectors are included', () => {
  const r = plain(P.problemMessages([client('boleto vencido'), system('Triagem transferiu para Financeiro'),
    client('também não emite nfe'), system('Financeiro transferiu para o atendente Felipe'), client('?')]));
  assert.deepEqual(r, { texts: ['boleto vencido', 'também não emite nfe'], beforeDivider: true });
});

test('divider: client text containing "transferi" is not a divider', () => {
  const r = plain(P.problemMessages([client('transferi o arquivo mas deu erro'), agent('Olá')]));
  assert.deepEqual(r, { texts: ['transferi o arquivo mas deu erro'], beforeDivider: true });
});

test('divider: nothing before it falls back to client messages after it', () => {
  const r = plain(P.problemMessages([system('Triagem transferiu para Felipe'), client('oi'), client('o pdv travou')]));
  assert.deepEqual(r, { texts: ['oi', 'o pdv travou'], beforeDivider: false });
});

test('heuristic: skips greetings, numbers and punctuation; truncates at 32 on a word boundary', () => {
  assert.equal(P.heuristicLine(['Bom dia!', 'olá, tudo bem?', '123456789', '?',
    'Acabei de instalar um certificado e não emite DANFE']), 'Acabei de instalar um…');
  const long = P.heuristicLine(['erro '.repeat(30)]);
  assert.ok(long.length <= 32); assert.ok(long.endsWith('…'));
  assert.equal(P.heuristicLine(['oi', 'boa tarde']), '');
});

test('ai input keeps the most recent messages within 1500 chars', () => {
  const input = P.buildAiInput(['a'.repeat(1000), 'b'.repeat(600), 'c']);
  assert.ok(!input.includes('a')); assert.ok(input.includes('b'.repeat(600))); assert.ok(input.endsWith('c'));
  assert.ok(input.length <= 1500);
  assert.equal(P.buildAiInput(['z'.repeat(3000)]).length, 1500);
  assert.equal(P.buildAiInput([]), '');
});

test('format and normalize', () => {
  assert.equal(P.formatAnyDesk('123456789'), '123 456 789');
  assert.equal(P.formatAnyDesk('1234567890'), '1 234 567 890');
  assert.equal(P.normalizeLine('"Certificado novo não emite DANFE."'), 'Certificado novo não emite DANFE');
  assert.equal(P.normalizeLine('x'.repeat(90)).length, 32);
});

test('final review: greeting-only messages before the divider are not AI input', () => {
  const r = plain(P.problemMessages([client('boa tarde'), system('Triagem transferiu para Felipe'), client('o pdv travou na venda')]));
  assert.deepEqual(r, { texts: ['o pdv travou na venda'], beforeDivider: false });
});

test('final review: without transfer or technician message there is no divider yet, so no AI', () => {
  const r = plain(P.problemMessages([client('oi'), client('minha nota não sai')]));
  assert.deepEqual(r, { texts: ['oi', 'minha nota não sai'], beforeDivider: false });
});

test('the webchat start button is not a problem description', () => {
  assert.equal(P.meaningful('Iniciar'), false);
  assert.equal(P.meaningful('Começar'), false);
  const source = P.problemMessages([{ role: 'client', text: 'Iniciar' }, { role: 'agent', text: 'Olá, sou o Felipe' },
    { role: 'client', text: 'Eu consigo de alguma forma conectar vcs 2?' }]);
  assert.deepEqual(plain(source), { texts: ['Eu consigo de alguma forma conectar vcs 2?'], beforeDivider: false });
  assert.equal(P.heuristicLine(source.texts), 'Eu consigo de alguma forma…');
});

test('a sender name prefix never becomes the problem line', () => {
  const source = P.problemMessages([{ role: 'client', text: 'Thiago Antonio Oliveira da Costa: Boleto não gera' }]);
  assert.equal(P.heuristicLine(source.texts), 'Boleto não gera');
  // One capitalized word before a colon is content, not a name.
  assert.equal(P.heuristicLine(P.problemMessages([{ role: 'client', text: 'Erro: rejeição 539' }]).texts), 'Erro: rejeição 539');
});

test('stored lines are reusable only without button labels or sender prefixes', () => {
  assert.equal(P.isProblemLine('Iniciar'), false);
  assert.equal(P.isProblemLine('Thiago Antonio Oliveira da Costa: B…'), false);
  assert.equal(P.isProblemLine('Não consigo emitir nota'), true);
});
