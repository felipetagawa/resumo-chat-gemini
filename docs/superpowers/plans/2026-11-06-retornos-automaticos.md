# Retornos automáticos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o técnico do Suporte agenda um atendimento no CRM, o AtendeAI guarda o retorno, avisa na hora (só dentro do navegador) e reabre o atendimento com um clique; a Agenda & Gestão vira Retornos e Notas. Versão 1.8.0.

**Architecture:** Módulos vanilla de content script, cada um com uma responsabilidade, todos compartilhando `chrome.storage.local` (a única ponte entre as abas do SZ.chat e as do CRM):
- `retornos-schedule.js`: funções puras (datas, atalhos, agrupamento, rótulos, correspondência chat↔retorno).
- `retornos-store.js`: configurações e retornos em `chrome.storage.local`, sincronia, migração da agenda antiga.
- `retornos-diagnostic.js` + `crm-retornos-bridge.js` (mundo MAIN): modo de diagnóstico desligado por padrão, e o sinal de salvamento (AJAX do PrimeFaces) que alimenta o resto.
- `retornos-capture.js`: lê a tela `crm-atendimento`, interpreta o sinal de salvamento (Agendar, Finalizar, recusado) e falha fechado quando há dúvida.
- UI: `retornos-crm-line.js` (linha no atendimento), `retornos-strip.js` (faixa no Chamado por Técnico), `retornos-alert.js` (aviso na hora, SZ.chat e CRM), `retornos-list.js` (lista compartilhada pela faixa e pela aba Retornos), mais mudanças em `agenda.js`, `notifications.js`, `options.*`.

**Tech Stack:** JavaScript sem build (Chrome MV3 content scripts), `node:test` + `vm` + `tests/mini-dom.js`. Rodar tudo: `node --test tests/`.

**Spec:** `docs/superpowers/specs/2026-11-06-retornos-automaticos-design.md`

## Global Constraints

- **Só o setor Suporte** (`atendeai_user_sector === "suporte"` em `chrome.storage.local`). Pré-atendimento fica exatamente como hoje: Agenda & Gestão com as abas atuais e `notifications.js` inalterado.
- **Nenhuma permissão nova** no `manifest.json` (hoje só `storage`). Sem `alarms`: o tempo do aviso é de timers nas abas abertas; os vencidos com o navegador fechado aparecem como atrasados quando uma aba abre.
- **Nenhuma chamada de IA nova.**
- **Nunca cobrir, deslocar ou alterar** elementos nativos do SZ.chat nem a tabela nativa CHAMADOS do CRM. Tudo do AtendeAI é elemento novo e irmão, sem `position: absolute/fixed` sobre nativos (o aviso na hora é `position: fixed` num canto livre, como os toasts existentes).
- **Nunca salvar nada no CRM por conta própria.** Nenhum teste automatizado ou manual do plano clica em salvar. Agendar só se testa reagendando um atendimento existente; Finalizar só com as finalizações reais do Felipe.
- UI em português, voz do AtendeAI ("eu guardo", "eu te aviso"), selo **AtendeAI** e tokens `--ai-*` de `styles/tokens.css`. Cada raiz nova precisa entrar na lista de raízes de `styles/tokens.css` (o teste `css-isolation` exige).
- Chaves: `atendeai_retornos_v1` (retornos), `atendeai_retornos_settings_v1` (liga/desliga e atalhos), `atendeai_retornos_flags_v1` (`newsSeen`, `migrated`), `atendeai_retornos_diag_on` e `atendeai_retornos_diag_log` (diagnóstico). Nenhuma chave antiga é apagada (`usuarioAgendaEventsV2`, `usuarioAgendaCRM` ficam).
- Identidade do retorno do CRM: o **protocolo**. Guarda também o id da URL `crm-atendimento/<id>`, atualizado a cada visita a uma página com esse protocolo.
- Atalhos padrão: `Amanhã 08:00`, `Amanhã 14:00`, `Segunda 08:00`. "Amanhã" na sexta ou no sábado vira segunda. "Segunda" é sempre a próxima segunda depois de hoje.
- Adiar: `15 min`, `1 h`, `Amanhã 08:00`. O aviso na hora **não some sozinho**, não tem "Abrir atendimento", e fechar/adiar vale para todas as abas.
- Textos fixos: caixa marcada "Ao salvar, eu guardo este retorno e te aviso na hora."; desmarcada "Este agendamento não vira lembrete."; faixa vazia "Nenhum retorno marcado. Quando você salvar um atendimento com Agendar, ele aparece aqui com um botão para abrir direto, e eu te aviso na hora."; aviso de novidade com título "Seus retornos agora te encontram", três passos ("Agende no CRM como sempre." / "O AtendeAI guarda e te avisa na hora." / "Abra direto pela faixa “Meus retornos”.") e botão "Entendi".

## Review Focus

- Salvamento recusado pela validação do CRM: não cria, não atualiza, não remove (teste em Task 4 com fixture de recusa).
- Detecção de Finalizar sem certeza: não remove (Task 4; a sincronia da Task 6 e o Remover cobrem).
- Tabela do Chamado por Técnico ainda carregando, vazia ou paginada: a sincronia não remove nada (Task 6).
- Retorno criado há segundos e ainda ausente da tabela lida antes: não é removido (Task 2, `syncWithTable`).
- Relógio do computador mudando ou aba voltando de suspensão: avisa uma vez só por `alertAt`, e dois retornos vencidos juntos viram um aviso agrupado (Task 5).
- `chrome.storage` indisponível ou extensão recarregada: nenhum módulo lança no content script (Tasks 2 e 5).
- Dois clientes com o mesmo nome ou telefone parcial no SZ.chat: o aviso ao abrir o chat não aparece (Task 8).
- Evento antigo da agenda sem data válida: a migração ignora em vez de quebrar (Task 7).

---

### Task 1: Descoberta no CRM — modo de diagnóstico e ponte de sinais

**Files:**
- Create: `modules/crm-retornos-bridge.js` (mundo MAIN), `modules/retornos-diagnostic.js`
- Modify: `manifest.json` (novos scripts em `/crm-atendimento*`), `options.html` + `options.js` (bloco "Diagnóstico (avançado)", recolhido, só Suporte), `styles/tokens.css` (se a UI do diagnóstico precisar de raiz)
- Test: `tests/retornos-diagnostic.test.js`

**Interfaces:**
- Produces (bridge, MAIN world): em cada `pfAjaxSend`/`pfAjaxComplete` do jQuery, dispara `document.dispatchEvent(new CustomEvent("atendeai:crm-ajax", { detail: JSON.stringify(signal) }))` e espelha o JSON em `document.documentElement` no atributo `data-atendeai-crm-ajax`. `signal = { phase: "send"|"complete", url, status, form, source, params: {name: value}, responseText, args }`. Também responde ao evento `atendeai:crm-widgets-request` com `atendeai:crm-widgets` (`detail`: JSON de `[{id, type, pattern, showTime, timeOnly, minDate}]` dos widgets Calendar).
- Produces (isolated): `window.RetornosDiagnostic = { isOn(): Promise<boolean>, redactParams(params): object, redactResponse(xml): object, snapshotDom(root): object, record(entry): Promise<void>, export(): Promise<string>, clear(): Promise<void>, start(doc): void }`. O log fica em `atendeai_retornos_diag_log` (máx. 40 entradas).
- Regras de privacidade do log exportado: nomes de campos são mantidos; valores só de `javax.faces.source`, `javax.faces.partial.*`, `lblOnOf` e do campo da data; todo outro texto vira máscara (letras→`a`, dígitos→`9`), exceto textos de mensagens, growl e diálogos. `ViewState` vira só o tamanho.

- [ ] **Step 1: Write the failing tests** em `tests/retornos-diagnostic.test.js` (carrega o módulo num `vm` com `chrome.storage` falso, padrão de `tests/daily-notices.test.js`):
  - `redactParams` mantém `javax.faces.source`, mascara `frmAtendimento:tbvAtendimento:solicitante` ("Maria da Silva" → `aaaaa aa aaaaa`), converte `javax.faces.ViewState` em `{length: n}`.
  - `redactResponse` sobre `<partial-response><changes><update id="frmAtendimento:msgs"><![CDATA[<span class="ui-messages-error-detail">Informe o problema</span>]]></update><update id="x"><![CDATA[Cliente Fulano 123]]></update><redirect url="/crm-atendimento/123"/><extension ln="primefaces" type="args">{"validationFailed":true}</extension></changes></partial-response>` devolve `{updates:[{id:"frmAtendimento:msgs", text:"Informe o problema"},{id:"x", text:"aaaaaaa aaaaaa 999"}], redirect:"/crm-atendimento/999", args:{validationFailed:true}}`.
  - `record` respeita o limite de 40 entradas (a mais antiga sai) e não grava nada quando o diagnóstico está desligado (`atendeai_retornos_diag_on` ausente).
  - `snapshotDom` (com `mini-dom`) devolve, para cada `input/select/textarea` do form, `{id, name, type, label, checked, valueShape}` e a lista de botões `{id, text, visible}`.
- [ ] **Step 2: Run** `node --test tests/retornos-diagnostic.test.js` — FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `modules/retornos-diagnostic.js` e `modules/crm-retornos-bridge.js` conforme as Interfaces. `start(doc)` registra: clique em fase de captura em qualquer `button, a.ui-commandlink, .ui-button` (grava cadeia de elementos até o form, snapshot antes), o evento `atendeai:crm-ajax` (grava sinal redigido + snapshot depois, 150 ms após `complete`), `beforeunload` (grava a navegação), e o evento de widgets. Cada entrada leva `at` (ISO) e `url` sem query. Só roda quando `isOn()`.
- [ ] **Step 4: Opções**: dentro de "Retornos automáticos" (Task 9 cria a seção; aqui entra só o bloco recolhido `<details id="retornosDiagnostico">`): chave "Gravar o que o CRM mostra ao salvar" (grava `atendeai_retornos_diag_on`), botões "Copiar gravação" (clipboard, JSON redigido) e "Apagar gravação". Texto: "Só para ajudar a configurar os retornos. Não altera nada no CRM."
- [ ] **Step 5: manifest.json**: `crm-retornos-bridge.js` no bloco MAIN existente; `retornos-diagnostic.js` no bloco de `/crm-atendimento*`.
- [ ] **Step 6: Run** `node --test tests/` — PASS.
- [ ] **Step 7: Commit** `feat: diagnostic mode records what the CRM shows when saving`.
- [ ] **Step 8 (humano, bloqueia a Task 4 final):** Felipe liga o diagnóstico nas opções, faz **um Agendar reagendando um atendimento existente** e **uma finalização real do dia**, clica "Copiar gravação" depois de cada um e entrega os dois JSON. Eles viram `tests/fixtures/retornos/agendar-ok.json`, `finalizar-ok.json` (e `recusado.json` se ele provocar uma validação sem salvar, por exemplo Agendar sem data). Confirmar neles: qual valor do rádio `lblOnOf` é Agendar, se `frmConfirmarAgendamento` aparece e qual botão confirma, o `javax.faces.source` do salvar, o `pattern` do calendário e os ids dos campos Protocolo/Cliente/Solicitante/Telefone/Problema.

### Task 2: Datas, atalhos, rótulos e correspondência (`RetornosSchedule`)

**Files:**
- Create: `modules/retornos-schedule.js`
- Test: `tests/retornos-schedule.test.js`

**Interfaces:**
- Produces: `window.RetornosSchedule` com
  - `defaultShortcuts(): [{id, day, time}]` (`day` ∈ `"amanha"|"depois"|"dom"|"seg"|"ter"|"qua"|"qui"|"sex"|"sab"`; `time` `"HH:MM"`).
  - `resolveShortcut(shortcut, now: Date): Date` e `shortcutLabel(shortcut, now): string` (ex.: `"Amanhã 08:00"`, e `"Segunda 08:00"` quando "amanhã" cai em fim de semana).
  - `snoozeOptions(now: Date): [{id: "15m"|"1h"|"tomorrow", label, at: number}]`.
  - `toCrmValue(date: Date, pattern?: string): string` (padrão `dd/MM/yyyy HH:mm`) e `parseCrmValue(text: string): Date|null`.
  - `groupRetornos(items, now: number): {atrasados, hoje, proximos}` (cada lista por `dueAt` crescente; `atrasados` = `dueAt` antes de `now`; `hoje` = hoje e ainda não vencido; `proximos` = depois de hoje).
  - `whenLabel(dueAt, now): string` (`"hoje 08:00"`, `"amanhã 14:00"`, `"ontem 08:00"`, `"seg 10/11 08:00"`) e `createdLabel(createdAt, now): string` (`"agendado ontem por você"`).
  - `normalizeName(text): string` (sem acento, minúsculas, sem pontuação, espaços colapsados), `phoneKey(text): string` (últimos 8 dígitos, `""` se menos de 8 dígitos).
  - `matchChat(retornos, {name, phone}): retorno|null`: primeiro por telefone, depois por nome normalizado igual ao cliente ou ao solicitante (nome com pelo menos duas palavras). Se casar com mais de um retorno de chaves diferentes, `null`.

- [ ] **Step 1: Write the failing tests**: sexta 07/11/2026... use as datas da spec: quinta 05/11/2026 10:00 → `Amanhã 08:00` = sexta 06/11 08:00; sexta 06/11 → `Amanhã 08:00` = segunda 09/11 08:00 com rótulo `Segunda 08:00`; sábado 07/11 idem; domingo 08/11 → amanhã = segunda 09/11; `Segunda 08:00` numa segunda 09/11 = segunda 16/11; `toCrmValue(new Date(2026,10,9,8,0)) === "09/11/2026 08:00"` e o `parseCrmValue` de volta; `snoozeOptions` na sexta 18:00 dá `tomorrow` = segunda 08:00; `groupRetornos` separa atrasado (ontem), hoje (daqui a 1 h) e próximo (depois de amanhã); `matchChat` casa `"(11) 98888-7777"` com `"11988887777"`, não casa por nome de uma palavra só ("Maria"), devolve `null` com dois retornos de chaves diferentes para o mesmo telefone.
- [ ] **Step 2: Run** `node --test tests/retornos-schedule.test.js` — FAIL.
- [ ] **Step 3: Implement** o módulo (IIFE, sem DOM, sem `chrome`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: retornos date shortcuts, labels and chat matching`.

### Task 3: Armazenamento, configurações, sincronia e migração (`RetornosStore`)

**Files:**
- Create: `modules/retornos-store.js`
- Test: `tests/retornos-store.test.js`

**Interfaces:**
- Consumes: `RetornosSchedule.defaultShortcuts`.
- Produces: `window.RetornosStore` (tudo assíncrono, nunca lança; sem `chrome.storage` devolve vazio):
  - `getSettings(): {enabled: boolean, shortcuts}` / `setSettings(patch)`; `isActive(): boolean` (setor `suporte` **e** `enabled !== false`).
  - Retorno: `{key, kind: "crm"|"manual", protocolo?, atendimentoId?, cliente, solicitante, telefones: string[], problema, text?, dueAt, createdAt, updatedAt, alertAt, ackedAt: number|null, legacy?: boolean}`. Chave `protocolo` para o CRM, `manual:<id>` para manual.
  - `list(): Retorno[]`; `upsertCrm(data, now?): Retorno` (mesma chave = reagendamento: novo `dueAt`, `alertAt = dueAt`, `ackedAt = null`, mantém `createdAt`); `addManual({text, dueAt}, now?)`; `remove(key)`; `removeByProtocolo(protocolo)`.
  - `acknowledge(key)` (`ackedAt = alertAt`); `snooze(key, at)` (`alertAt = at`, `ackedAt = null`); `refreshId(protocolo, atendimentoId)` (só grava se mudou).
  - `pending(now): Retorno[]` (os que devem avisar: `alertAt <= now`, `ackedAt !== alertAt`, não `legacy`).
  - `syncWithTable(protocolos: string[], readAt: number): string[]` remove retornos `crm` cujo protocolo não está na lista **e** cujo `updatedAt <= readAt`; devolve as chaves removidas.
  - `migrateAgenda(now): {moved: number, legacy: number}`: roda uma vez (`flags.migrated`), só se `isActive()`. Eventos de `usuarioAgendaEventsV2` com `status !== "done"` e data válida: de hoje em diante viram `manual` com aviso; data passada viram `legacy: true` (sem aviso, `ackedAt = alertAt`). Não apaga as chaves antigas.
  - `onChange(callback): () => void` (assina `chrome.storage.onChanged` para as chaves de retornos e configurações).
  - `getFlag(name)` / `setFlag(name, value)`.

- [ ] **Step 1: Write the failing tests** (`vm` + `chrome.storage` falso com `onChanged`): `upsertCrm` cria; segunda chamada com outra data atualiza sem duplicar e zera `ackedAt`; `snooze`/`acknowledge`/`pending` (retorno vencido aparece em `pending`; depois de `acknowledge` não; depois de `snooze` para o futuro não, e volta quando o tempo chega); `syncWithTable` remove o ausente, preserva o presente e preserva o retorno com `updatedAt > readAt`, e não toca em `manual`; `refreshId` troca o id; `migrateAgenda` com um evento de hoje (vira manual com aviso), um passado (legacy sem aviso), um `done` (ignorado), um sem data (ignorado), segunda chamada não duplica, e as chaves antigas continuam no storage; `isActive` falso para `preatendimento` e para `enabled: false`; storage ausente não lança.
- [ ] **Step 2: Run** `node --test tests/retornos-store.test.js` — FAIL.
- [ ] **Step 3: Implement** o módulo. Escritas leem-e-gravam o objeto inteiro de `atendeai_retornos_v1` (`{version: 1, items}`), como `daily-notices.js` faz.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: retornos store with sync and agenda migration`.

### Task 4: Leitura da tela e detecção do salvamento (`RetornosCapture`) + linha do AtendeAI

**Files:**
- Create: `modules/retornos-capture.js`, `modules/retornos-crm-line.js`, `styles/retornos.css`, `tests/fixtures/retornos/` (gravações da Task 1)
- Modify: `modules/crm-retornos-bridge.js` (escrita no calendário, evento `atendeai:crm-set-date`), `manifest.json`, `styles/tokens.css` (raiz `#atendeai-retornos-line`)
- Test: `tests/retornos-capture.test.js`, `tests/retornos-crm-line.test.js`

**Interfaces:**
- Consumes: `RetornosSchedule`, `RetornosStore`.
- Produces `window.RetornosCapture`:
  - `SAVE_SIGNATURES`: lista de `{mode: "agendar"|"finalizar", source: RegExp, modeFrom: "radio"|"source"}` preenchida **a partir das gravações da Task 1**. Enquanto estiver vazia, `interpretSave` devolve sempre `null` (falha fechado: nada é criado nem removido).
  - `interpretSave(signal, domBefore): {outcome: "ok"|"refused"|"unknown", mode: "agendar"|"finalizar"|null}`: `ok` só se o sinal casa uma assinatura, `status` é 200, `args.validationFailed` não é verdadeiro e não há mensagem de erro no corpo.
  - `readPage(doc, url): {protocolo, atendimentoId, cliente, solicitante, telefones, problema, mode, dateText}`; `atendimentoId` vem de `/crm-atendimento/<id>`; `problema` cai para a primeira linha da Resolução se o campo Problema estiver vazio.
  - `applySave(outcome, page, remember, now): Promise<void>`: `agendar`+`remember` → `RetornosStore.upsertCrm`; `agendar` sem `remember` → `removeByProtocolo`; `finalizar` → `removeByProtocolo`; `refused`/`unknown` → nada.
- Produces `window.RetornosCrmLine`: `mount(doc)` insere, logo abaixo do campo nativo "Data do agendamento", `<div id="atendeai-retornos-line">` com selo AtendeAI, os atalhos (`RetornosStore.getSettings().shortcuts`), campos `data` e `hora`, e a caixa "Me lembrar deste retorno" (marcada). Só aparece com o rádio em Agendar; some e reaparece junto com o rádio. Clicar num atalho ou mudar data/hora dispara `atendeai:crm-set-date` (`detail`: `"09/11/2026 08:00"`); a ponte escreve no widget Calendar do PrimeFaces e no input, e dispara `change`. O texto da caixa muda conforme marcada/desmarcada. Só monta se `RetornosStore.isActive()`. Também chama `RetornosStore.refreshId(protocolo, id)` a cada visita.

- [ ] **Step 1: Colocar as fixtures** reais (`agendar-ok.json`, `finalizar-ok.json`, opcional `recusado.json`) em `tests/fixtures/retornos/`; **sem elas o passo 2 usa fixtures sintéticas marcadas como `"synthetic": true` e a assinatura real fica pendente** (registrar no relatório final).
- [ ] **Step 2: Write the failing tests** `tests/retornos-capture.test.js`: para cada fixture, `interpretSave` devolve o `outcome`/`mode` esperado; com `SAVE_SIGNATURES` vazia devolve `null`; `validationFailed: true` → `refused`; `applySave` cria no Agendar com a caixa marcada, atualiza no reagendamento, remove com a caixa desmarcada, remove no Finalizar, não faz nada em `refused`/`unknown`; `readPage` sobre um DOM mínimo extrai protocolo, id da URL, telefones, e usa a Resolução quando o Problema está vazio. `tests/retornos-crm-line.test.js`: a linha só existe com Agendar marcado, atalho dispara `atendeai:crm-set-date` com o valor `dd/MM/yyyy HH:mm` certo, a caixa desmarcada muda o texto para "Este agendamento não vira lembrete.", não monta para `preatendimento` nem desligado, monta uma vez só.
- [ ] **Step 3: Run** `node --test tests/retornos-capture.test.js tests/retornos-crm-line.test.js` — FAIL.
- [ ] **Step 4: Implement** `retornos-capture.js` (as assinaturas vêm das fixtures), `retornos-crm-line.js`, `retornos.css` (tokens `--ai-*`, selo AtendeAI dourado, sem sobrepor nada nativo: a linha é um bloco irmão no fluxo) e o handler `atendeai:crm-set-date` na ponte (`widget.setDate(...)`, `input.value`, `change`).
- [ ] **Step 5: Run** `node --test tests/` — PASS.
- [ ] **Step 6: Commit** `feat: AtendeAI line under the CRM scheduling field and save detection`.

### Task 5: Aviso na hora, em todas as abas (`RetornosAlert`)

**Files:**
- Create: `modules/retornos-alert.js`
- Modify: `styles/retornos.css`, `styles/tokens.css` (raiz `#atendeai-retornos-alert`), `manifest.json` (SZ.chat e CRM), `content.js` (`RetornosAlert.start()` na inicialização dos módulos)
- Test: `tests/retornos-alert.test.js`

**Interfaces:**
- Consumes: `RetornosStore.pending/acknowledge/snooze/onChange/isActive`, `RetornosSchedule.snoozeOptions/whenLabel/createdLabel`.
- Produces: `window.RetornosAlert = { start(doc?): void, stop(): void, render(pendingList, now): void }`. `start` agenda um timer para o próximo `alertAt` (e relê no `onChange`), faz uma checagem imediata ao abrir (vencidos aparecem como atrasados). O aviso é `<div id="atendeai-retornos-alert" role="alert">` no canto inferior esquerdo, com selo AtendeAI, "Retorno agora", cliente, produto ou problema, "agendado ontem por você", botão **×** e **Adiar** (15 min, 1 h, Amanhã 08:00). Vários vencidos: um aviso agrupado com uma linha por retorno, cada linha com seu × e Adiar, mais "Fechar todos". Sem timeout de sumiço e sem botão Abrir. Fechar/adiar grava no store, e o `onChange` remove o aviso das outras abas.

- [ ] **Step 1: Write the failing tests** (`mini-dom`, relógio injetável `start(doc, {now: () => t, setTimer})`): retorno vencido aparece com o texto "Retorno agora"; não some sozinho depois de 60 s simulados; ×  chama `acknowledge` e remove; Adiar 15 min chama `snooze(key, now+15min)`; dois vencidos viram um aviso com duas linhas; retorno que vence depois dispara o timer certo e só aparece então; `acknowledge` feito pela "outra aba" (mudança no store) remove o aviso desta; `isActive()` falso (outro setor ou desligado) não renderiza nada; um retorno `legacy` nunca avisa; chave `ackedAt === alertAt` não reaparece depois de recarregar.
- [ ] **Step 2: Run** `node --test tests/retornos-alert.test.js` — FAIL.
- [ ] **Step 3: Implement** o módulo. Não usa `position` sobre nativo: canto inferior esquerdo, `z-index` acima da página, mesma convenção dos toasts existentes; tokens por `ThemeModule.apply?.(el)` quando existir (SZ.chat) e tokens claros por padrão no CRM.
- [ ] **Step 4: Run** `node --test tests/` — PASS.
- [ ] **Step 5: Commit** `feat: in-browser alert when a return is due`.

### Task 6: Faixa "Meus retornos" no Chamado por Técnico, sincronia e aviso de novidade

**Files:**
- Create: `modules/retornos-list.js` (renderização compartilhada), `modules/retornos-strip.js`
- Modify: `manifest.json` (content script novo para `https://sistemaempresarialweb.com.br/crm-chamado-por-tecnico*` e `www.`, com `styles/tokens.css` e `styles/retornos.css`; scripts `retornos-schedule.js`, `retornos-store.js`, `retornos-list.js`, `retornos-alert.js`, `retornos-strip.js`), `styles/retornos.css`, `styles/tokens.css` (raízes `#atendeai-retornos-strip`, `#atendeai-retornos-news`)
- Test: `tests/retornos-strip.test.js`

**Interfaces:**
- Produces `window.RetornosList`: `render(container, {items, now, withManual, onOpen, onRemove, showLegacy}): void` — grupos Atrasados, Hoje e Próximos, cada linha com quando, cliente, produto ou problema, **Abrir** (só se `atendimentoId`) e **Remover**; vazio mostra o texto fixo da faixa vazia. `withManual: false` na faixa; lembrete manual leva "anotado à mão" e nunca Abrir.
- Produces `window.RetornosStrip`:
  - `readTable(doc): {recognized: boolean, protocolos: string[]}`: reconhecida só com a tabela `[id="frmTabela:dtTPos"]` com cabeçalhos `Agendamento`, `Protocolo`, `Cliente`, `Produto`, pelo menos uma linha de dados e sem paginador visível; a célula do protocolo é o texto da coluna menos o título escondido (`.ui-column-title`), só dígitos.
  - `mount(doc)`: insere `<section id="atendeai-retornos-strip">` **antes** da tabela nativa (irmã, nada dentro dela), com selo AtendeAI e contadores (atrasados, hoje, próximos). **Abrir** abre `https://www.sistemaempresarialweb.com.br/crm-atendimento/<id>` em nova aba (`noopener`), porque o Atender nativo é um `PrimeFaces.ab` sem link (observado em 06/11/2026) e não dá para imitá-lo sem clicar. **Remover** chama `RetornosStore.remove`.
  - Sincronia: a cada mudança da tabela (`MutationObserver` com debounce de 1,5 s) e na carga, se `readTable(doc).recognized`, chama `RetornosStore.syncWithTable(protocolos, Date.now())`.
  - Aviso de novidade (`#atendeai-retornos-news`): uma vez por navegador (`flags.newsSeen`) com título, três passos e **Entendi** do bloco "Textos fixos"; só com o recurso ativo.
  - Atualiza a faixa em `RetornosStore.onChange`.

- [ ] **Step 1: Write the failing tests** (`mini-dom` com tabela de verdade reduzida da estrutura observada: `Agendamento`/`Protocolo`/`Cliente`/`Produto`/`Tp.Atend.`/`Ação`, células com `span.ui-column-title`): `readTable` não reconhece sem linhas, com cabeçalho diferente, ou com paginador; reconhece e extrai protocolos (ignorando o título escondido); a faixa vem antes da tabela e não altera a tabela (compara o `outerHTML` da tabela antes e depois); sincronia remove o ausente e preserva o presente, e **não remove nada** quando a tabela não é reconhecida; Abrir usa a URL certa e Abrir não existe sem id; Remover tira da lista; vazia mostra o texto fixo; o aviso de novidade aparece uma vez e some para sempre após Entendi; nada disso monta para `preatendimento` ou desligado.
- [ ] **Step 2: Run** `node --test tests/retornos-strip.test.js` — FAIL.
- [ ] **Step 3: Implement** `retornos-list.js` e `retornos-strip.js`; `retornos-strip.js` inicializa sozinho na página (como `crm-automation.js`).
- [ ] **Step 4: Run** `node --test tests/` — PASS.
- [ ] **Step 5: Commit** `feat: "Meus retornos" strip with table sync and news notice`.

### Task 7: Agenda & Gestão enxugada (Retornos e Notas) e migração

**Files:**
- Modify: `modules/agenda.js` (`exibirAgenda`, `migrarEventosAntigos`), `styles/calendar.css` e `styles/retornos.css`
- Test: `tests/agenda-retornos.test.js`

**Interfaces:**
- Consumes: `RetornosStore.isActive/list/addManual/remove/migrateAgenda/onChange`, `RetornosList.render`.
- Produces: `AgendaModule.exibirAgenda()` decide as abas por setor: Suporte com o recurso ligado → `Retornos` (primeira) e `Notas`; Suporte com o recurso desligado → só `Notas`; Pré-atendimento → as quatro abas atuais, sem nenhuma mudança. A aba Retornos usa `RetornosList.render` com `withManual: true` e `showLegacy: true` (grupo recolhido "Da agenda antiga (N)", cada um com Remover), e o botão **"+ Lembrete"** (texto e data/hora, dois campos). Chama `RetornosStore.migrateAgenda(Date.now())` antes de renderizar. O botão "Reordenar" some do Suporte.

- [ ] **Step 1: Write the failing tests**: carrega `agenda.js` com os helpers existentes simulados (ver como `tests/dock.test.js` carrega módulos) e verifica as abas por setor (Suporte ligado: Retornos+Notas; desligado: só Notas; Pré: Calendário, CRM, Kanban, Notas); "+ Lembrete" cria um manual com os dois campos; migração mostra o grupo "Da agenda antiga (1)"; Pré-atendimento não migra nem mostra Retornos.
- [ ] **Step 2: Run** `node --test tests/agenda-retornos.test.js` — FAIL.
- [ ] **Step 3: Implement** a mudança em `agenda.js` (as funções `iniciarCalendario/CRM/Kanban` ficam intactas para o Pré-atendimento).
- [ ] **Step 4: Run** `node --test tests/` — PASS.
- [ ] **Step 5: Commit** `feat: Agenda & Gestão becomes Retornos and Notas for Suporte`.

### Task 8: Aviso ao abrir o chat do cliente

**Files:**
- Modify: `modules/notifications.js`
- Create: `modules/retornos-chat-notice.js`
- Test: `tests/retornos-chat-notice.test.js`

**Interfaces:**
- Consumes: `RetornosSchedule.matchChat`, `RetornosSchedule.whenLabel`, `RetornosStore.list/isActive`.
- Produces: `window.RetornosChatNotice.check({name, phone}): Promise<void>`. Para o Suporte com o recurso ativo mostra `#atendeai-retornos-chat-notice`: "AtendeAI · Você tem retorno marcado com este cliente (hoje 08:00)", botão **Abrir no CRM** (nova aba, só com id) e ×; não some sozinho. `NotificationsModule.checkAndShowNotification` chama `RetornosChatNotice.check` e **retorna sem mostrar o aviso antigo** quando o setor é Suporte (com o recurso ligado ou desligado); para Pré-atendimento o aviso antigo e `verificarEventosVencidos` ficam como estão. Para Suporte, `verificarEventosVencidos` também deixa de avisar.

- [ ] **Step 1: Write the failing tests**: casa por telefone, casa por nome normalizado, não mostra com dois retornos ambíguos, não mostra sem confiança, × fecha, Abrir no CRM aponta para a URL certa e some sem id; Suporte desligado não mostra nada (nem o aviso antigo); Pré-atendimento continua chamando o aviso antigo (`tests` verificam que `exibirNotificacaoSistema` ainda é usado para esse setor).
- [ ] **Step 2: Run** `node --test tests/retornos-chat-notice.test.js` — FAIL.
- [ ] **Step 3: Implement** o módulo e a bifurcação de setor em `notifications.js`; a captura de nome e telefone do chat usa o que `ChatCaptureModule` já expõe (nome do cliente; telefone só se já houver extrator, senão só nome).
- [ ] **Step 4: Run** `node --test tests/` — PASS.
- [ ] **Step 5: Commit** `feat: retorno notice when opening the client's chat`.

### Task 9: Opções, manifest 1.8.0, changelog e documentação

**Files:**
- Modify: `options.html`, `options.js`, `manifest.json` (versão e ordem dos scripts), `README.md`, `ARQUITETURA.md`
- Test: `tests/retornos-options.test.js`, ajuste de `tests/dock.test.js` ou `tests/onboarding.test.js` se a lista de scripts do manifest for testada

**Interfaces:**
- Consumes: `RetornosStore.getSettings/setSettings`, `RetornosSchedule.defaultShortcuts`.
- Produces: seção **Retornos automáticos** (visível só no Suporte) com a chave liga/desliga (padrão ligada) e atalhos editáveis (adicionar, remover, editar: dia relativo + hora, sempre ao menos zero atalhos permitidos, restaurar padrão); entrada **1.8.0** no changelog ("Retornos automáticos: agende no CRM e o AtendeAI guarda, avisa na hora e abre o atendimento com um clique; Agenda & Gestão agora é Retornos e Notas."); `manifest.json` em `"version": "1.8.0"` com todos os scripts e CSS novos na ordem certa (schedule antes de store, store antes de list/alert/strip/capture/line).

- [ ] **Step 1: Write the failing tests**: seção escondida para Pré-atendimento e visível para Suporte; chave grava `enabled`; atalho novo grava e persiste em `shortcuts`; remover e restaurar padrão; o manifest está em 1.8.0, não ganhou permissões (`permissions` continua `["storage"]`) e todo arquivo listado nos `content_scripts` existe em disco.
- [ ] **Step 2: Run** `node --test tests/retornos-options.test.js` — FAIL.
- [ ] **Step 3: Implement** em `options.html`/`options.js`, a versão, o changelog e as menções em `README.md`/`ARQUITETURA.md`.
- [ ] **Step 4: Run** `node --test tests/` — PASS.
- [ ] **Step 5: Commit** `chore: release 1.8.0`.

### Task 10: Verificação final

- [ ] **Step 1: Run** `node --test tests/` — todos passam, saída colada no relatório.
- [ ] **Step 2: Conferir** `git diff main --stat`: nenhuma permissão nova, nenhuma chamada de IA nova, nenhuma chave antiga apagada, nenhum elemento nativo alterado (`rtk proxy grep -n "alarms\|MessagingHelper.send" modules/retornos-*.js` sem resultados).
- [ ] **Step 3: Relatório ao Felipe** com o que ficou sem verificação ao vivo (CRM: assinatura do salvamento e confirmação, escrita no calendário, leitura de Protocolo/Cliente/Problema, Abrir em nova aba; SZ.chat: aviso do chat, convivência do aviso na hora com a dock) e a pendência das gravações da Task 1 se ainda não existirem. Sem push nem merge.
