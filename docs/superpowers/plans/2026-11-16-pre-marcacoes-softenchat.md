# Marcações do Pré-atendimento no SoftenChat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cronômetro e 💸 de negociação nos cards da lista do SoftenChat cujas conversas estão com a própria pessoa do Pré-atendimento.

**Architecture:** Uma ponte no mundo da página (MAIN) lê as props React de cada card e grava `data-atendeai-conversa` / `data-atendeai-minha` no DOM. Um content script (só SoftenChat + setor Pré-atendimento) desenha os chips no fim da primeira linha desses cards, busca o início na API do SoftenChat e guarda tudo em `chrome.storage.local`.

**Tech Stack:** Chrome MV3, JS vanilla, testes `node --test` com `tests/mini-dom.js` e `vm`.

**Spec:** `docs/superpowers/specs/2026-11-16-pre-marcacoes-softenchat-design.md`

## Global Constraints

- Só em `chat.softensistemas.com.br`; só com `atendeai_user_sector === "preatendimento"` e `atendeai_user_name` preenchido.
- Cores do cronômetro: verde `< 5 min`, amarelo `< 10 min`, vermelho `≥ 10 min` (mesmos `#41925f`, `#a09742`, `#e75a5a` da SZ).
- Formato: `HH:MM:SS` abaixo de 24 h; `Nd HHh` a partir de 24 h.
- Tooltip do cronômetro: `Tempo de atendimento (desde que ficou com você)`.
- Nada é enviado para `/api/pre-controls`. `modules/pre-controls.js` não muda.
- Chips no fluxo (sem `position:absolute`), no fim da primeira linha do card; nada nativo é coberto.
- Card sem atributo da ponte = sem marcação.
- Limpeza: registros não vistos como seus há 7 dias são apagados.
- Versão 1.10.0.

## Review Focus

- Card reciclado pelo React para outra conversa (lista reordena): os chips devem seguir o `data-atendeai-conversa` atual, nunca o antigo.
- Clique ou Enter/Espaço no 💸 não pode abrir a conversa (o card tem `onClick` e `onKeyDown` do React).
- API do SoftenChat falha ou sem token: cronômetro usa a primeira vez visto, sem quebrar.
- Conversa deixa de ser sua (transferida): chips somem do card na próxima varredura.
- Tema claro e escuro: chips legíveis nos dois.

---

### Task 1: Ponte MAIN que identifica os cards

**Files:**
- Create: `modules/softenchat-cards-bridge.js`
- Test: `tests/softenchat-cards-bridge.test.js`

**Interfaces:**
- Produces: em cada `main aside [role="button"][tabindex="0"]`, os atributos `data-atendeai-conversa="{item.id}"` e `data-atendeai-minha="1"` (ou removidos). Exporta `globalThis.__atendeaiCardsBridge = { marcar(root) }` para teste.

- [ ] **Step 1: Testes** — card falso com chave `__reactFiber$abc` cujo `.return` (até 6 níveis) tem `memoizedProps = { item, meuId }`:
  - `item.assignedUserId === meuId`, sem `encerrada` → `data-atendeai-conversa="c1"` e `data-atendeai-minha="1"`.
  - `assignedUserId` diferente → `data-atendeai-conversa="c1"`, sem `data-atendeai-minha`.
  - `item.encerrada === true` ou `meuId` vazio → sem `data-atendeai-minha`.
  - Sem fiber / sem `item.id` → nenhum atributo; atributos antigos são removidos (card reciclado).
  - Card que trocou de `item.id` → atributo atualizado.
- [ ] **Step 2:** `node --test tests/softenchat-cards-bridge.test.js` → FAIL.
- [ ] **Step 3:** Implementar `marcar(root = document)`; `MutationObserver` no `document.body` (childList, subtree, attributes `aria-current`) com debounce de 150 ms + `setInterval` de 2 s como rede de segurança. Só escreve atributo quando o valor muda (evita loop do observer).
- [ ] **Step 4:** testes → PASS.
- [ ] **Step 5:** Commit.

### Task 2: Módulo de marcações (content script)

**Files:**
- Create: `modules/softenchat-pre-marcacoes.js`, `styles/pre-marcacoes.css`
- Test: `tests/softenchat-pre-marcacoes.test.js`

**Interfaces:**
- Consumes: atributos da Task 1; `SoftenChatCapture.ativo()`.
- Produces: `globalThis.SoftenChatPreMarcacoes = { init(), _formatar(ms), _cor(ms), _inicioDe(conversa, meId) }`.
- Storage: chave `atendeai_softenchat_pre_v1` = `{ [conversaId]: { inicio: number, neg: boolean, vistoEm: number, fonte: "api"|"visto" } }`.

- [ ] **Step 1: Testes**
  - `_formatar`: `0 → "00:00:00"`, `754000 → "00:12:34"`, `86400000+3*3600000 → "1d 03h"`.
  - `_cor`: `4.9 min → #41925f`, `5 min → #a09742`, `10 min → #e75a5a`.
  - `_inicioDe({assumedAt, transfers}, meId)`: usa `assumedAt`; usa a transferência para `meId` mais recente se posterior; retorna `null` sem nenhum dos dois. Aceitar nas transferências `toUserId`/`to_user_id` e `createdAt`/`transferredAt`/`at` (confirmar na página real e ajustar).
  - Setor `suporte` → nada desenhado. Setor `preatendimento` + nome → card com `data-atendeai-minha="1"` recebe `.atendeai-pre-slot` como último filho de `:scope > span:first-child`, com `.atendeai-pre-timer` e `.atendeai-pre-neg`.
  - Card sem `data-atendeai-minha` que tinha slot → slot removido.
  - Clique no 💸 alterna `neg` no storage e `aria-pressed`; `stopPropagation` chamado em `click`, `keydown`, `pointerdown`.
  - API falhando → `inicio` = agora, `fonte: "visto"`; com API ok → `fonte: "api"` e não busca de novo.
  - Registro com `vistoEm` de 8 dias atrás é apagado no `init`.
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3:** Implementar. Token e base da API como `softenchat-capture.js` (`localStorage.auth.accessToken`, `/{empresa}/api`); `GET /auth/me` uma vez para `meId`. Varredura a cada 1 s (atualiza texto/cor dos timers, cria/remove slots) + observer com debounce. Slot reutilizado quando `dataset.conversa` bate; senão recriado. 💸 é `<button type="button">` com `aria-pressed`, título `Negociação: SIM/NÃO (clique para alternar)`. CSS com classes `atendeai-pre-*`, chips 18 px de altura, fonte 10 px tabular, 💸 cinza `#6b7280` desligado / `#5ccf86` ligado.
- [ ] **Step 4:** testes → PASS.
- [ ] **Step 5:** Commit.

### Task 3: Ligar na extensão

**Files:**
- Modify: `manifest.json` (versão 1.10.0; novo bloco `world: "MAIN"` para `https://chat.softensistemas.com.br/*` com `modules/softenchat-cards-bridge.js`; `styles/pre-marcacoes.css` e `modules/softenchat-pre-marcacoes.js` antes de `content.js`)
- Modify: `content.js` (`inicializarModulos`: `void globalThis.SoftenChatPreMarcacoes?.init?.()` ao lado de `PreControlModule.init()`)
- Modify: `ARQUITETURA.md` (uma seção curta)

- [ ] **Step 1:** Editar; `node --test tests/` → tudo PASS (incluindo `css-isolation.test.js`).
- [ ] **Step 2:** Commit.

### Task 4: Verificação na página real

- [ ] Recarregar a extensão, setor Pré-atendimento, abrir `chat.softensistemas.com.br/soften-sistemas/chat`.
- [ ] Confirmar: atributos nos cards, chips na primeira linha, tempo bate com `assumedAt`, 💸 não abre o chat, tema escuro legível, nomes dos campos de `transfers`.
