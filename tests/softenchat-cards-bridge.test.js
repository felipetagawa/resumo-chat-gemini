// The page-world bridge that tells which conversation each SoftenChat list card shows.
// SoftenChat (React 18.3.1, bundle of 16/11/2026) renders each card from a memo component whose
// props are { item, aberto, nomeDoAgente, meuId, sla, onAbrir, onAssumir }; the card <div> is its root.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, el } = require('./mini-dom');

function card(props) {
  const node = el('div', { role: 'button', tabindex: '0' }, [el('span'), el('span'), el('span')]);
  if (props) {
    // div fiber → memo wrapper → component with the props
    node['__reactFiber$x1y2'] = { memoizedProps: { className: 'w-full' }, return: { memoizedProps: {}, return: { memoizedProps: props, return: null } } };
  }
  return node;
}

function load(cards) {
  const document = createDocument();
  const aside = el('aside', {}, [el('div', {}, cards)]);
  document.body.appendChild(el('main', {}, [aside]));
  const context = { document, setTimeout() {}, clearTimeout() {}, setInterval() {}, MutationObserver: undefined };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('modules/softenchat-cards-bridge.js', 'utf8'), context);
  return context.__atendeaiCardsBridge;
}

const item = (over = {}) => ({ id: 'c1', assignedUserId: 'u1', contactName: 'Ana', ...over });

test('a card assigned to me gets its conversation id and the mine flag', () => {
  const c = card({ item: item(), meuId: 'u1' });
  load([c]).marcar();
  assert.equal(c.getAttribute('data-atendeai-conversa'), 'c1');
  assert.equal(c.getAttribute('data-atendeai-minha'), '1');
});

test('a card assigned to someone else gets the id but not the mine flag', () => {
  const c = card({ item: item({ assignedUserId: 'u2' }), meuId: 'u1' });
  load([c]).marcar();
  assert.equal(c.getAttribute('data-atendeai-conversa'), 'c1');
  assert.equal(c.getAttribute('data-atendeai-minha'), null);
});

test('a closed conversation, an inactive one or an unknown me is never mine', () => {
  const closed = card({ item: item({ encerrada: true }), meuId: 'u1' });
  const inactive = card({ item: item({ id: 'c2', isActive: false }), meuId: 'u1' });
  const noMe = card({ item: item({ id: 'c3' }), meuId: '' });
  const waiting = card({ item: item({ id: 'c4', assignedUserId: null }), meuId: null });
  load([closed, inactive, noMe, waiting]).marcar();
  for (const c of [closed, inactive, noMe, waiting]) assert.equal(c.getAttribute('data-atendeai-minha'), null);
});

test('a card that cannot be read carries no attribute, and loses old ones', () => {
  const unreadable = card(null);
  unreadable.setAttribute('data-atendeai-conversa', 'velho');
  unreadable.setAttribute('data-atendeai-minha', '1');
  const noId = card({ item: { assignedUserId: 'u1' }, meuId: 'u1' });
  load([unreadable, noId]).marcar();
  for (const c of [unreadable, noId]) {
    assert.equal(c.getAttribute('data-atendeai-conversa'), null);
    assert.equal(c.getAttribute('data-atendeai-minha'), null);
  }
});

test('a card React reuses for another conversation follows the new one', () => {
  const props = { item: item(), meuId: 'u1' };
  const c = card(props);
  const bridge = load([c]);
  bridge.marcar();
  c['__reactFiber$x1y2'].return.return.memoizedProps = { item: item({ id: 'c9', assignedUserId: 'u2' }), meuId: 'u1' };
  bridge.marcar();
  assert.equal(c.getAttribute('data-atendeai-conversa'), 'c9');
  assert.equal(c.getAttribute('data-atendeai-minha'), null);
});

test('only list cards inside main aside are touched', () => {
  const document = createDocument();
  const outside = card({ item: item(), meuId: 'u1' });
  document.body.appendChild(el('main', {}, [outside]));
  const context = { document, setTimeout() {}, clearTimeout() {}, setInterval() {} };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('modules/softenchat-cards-bridge.js', 'utf8'), context);
  context.__atendeaiCardsBridge.marcar();
  assert.equal(outside.getAttribute('data-atendeai-conversa'), null);
});
