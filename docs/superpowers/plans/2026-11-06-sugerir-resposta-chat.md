# Sugerir resposta em chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "Sugerir resposta" into a chat window like "Consultar Docs" whose every answer is a customer-ready message (Copiar / Inserir no chat), using SoftenDocs only when it matters, and swap the dock so Consultar Docs is the prominent button.

**Architecture:** The API keeps one endpoint (`POST /api/gemini/responder`) and gains an optional `messages` chat history; the service sends it as a `chat` key inside the existing data JSON (single model turn, same providers), gates the manual by intent plus the technician's last message, and returns only the sources the model cites through a stripped `FONTES:` control line. The extension replaces the in-dock card with a fixed window (`#atendeai-smart-reply`) whose conversation is stored per attendance token in `chrome.storage.local`.

**Tech Stack:** Chrome MV3 extension in plain JS (`node --test` with `vm` harnesses); Spring Boot 3 / Java 17 API (JUnit 5, Mockito, MockMvc).

**Spec:** `docs/superpowers/specs/2026-11-06-sugerir-resposta-chat-design.md` (approved by Felipe on 06/11/2026). Visual reference: `.superpowers/brainstorm/51095-1793938118/content/chat-resposta.html` (dock option A + the chat window).

**Repositories (two), both on `main`, clean at base:**
- API: `~/Developer/Repositorios/resumo-chat-api` — Tasks 1–2. Tests: `./mvnw -q test` (passing at base `b36eec2`).
- Extension: `~/Developer/Repositorios/resumo-chat-gemini/resumo-chat-gemini` — Tasks 3–8. Tests: `node --test tests/` (323 passing at base `cdfdb7a`).

**Git:** create branch `feat/reply-chat` in each repo before the first commit there. Commit locally. **No `git push`, no `deploy.sh`, no release upload without Felipe's explicit OK** (Task 8 asks him).

## Global Constraints

- Chat history limits (extension and API agree): at most **12** turns, each **1–1500** chars after trim, at most **8000** chars total; roles `"user"` / `"assistant"` alternate, the first and the last are `"user"`.
- With `messages` present, the API rejects non-blank `replyInstruction`, non-blank `currentReply` and `regenerate: true` (HTTP 400). Without `messages`, every current payload behaves exactly as today (old extensions keep working).
- Manual is never searched for `intent` `cobrar_retorno` or `encerrar`; `cliente_dificil` still searches.
- `sources` contains only pages the model cited on its `FONTES:` line; missing or malformed line → `sources: []`. The `FONTES:` line never reaches the technician.
- Model, `maxTokens` 512, the 6 s Claude timeout, the Gemini fallback, `ReplyPolish` and the `SmartReplyRateLimiter` (30/min) are unchanged.
- Cliché-only output → HTTP 502 `{"erro":"Não saiu uma boa sugestão. Tente de novo."}` (was "Tente ↻ Outra.", which no longer exists in the UI).
- Nothing is generated when the window opens. The first request happens only on a chip click or a sent message.
- Model text is always set with `textContent` / text nodes, never `innerHTML`. Source links only when `url` starts with `https://docs.softensistemas.com.br/`.
- Storage key `atendeai_reply_chats_v1` in `chrome.storage.local`: `{ version: 1, items: { [token]: { token, messages, updatedAt } } }`; TTL 24 h since `updatedAt`, at most 50 items, at most 40 messages each.
- The Smart Reply module must not touch `RecoveryBufferModule` (an existing harness asserts it); the attendance identity is `ChatCaptureModule.identificarAtendimentoResposta()`.
- Every CSS selector in `styles/smart-reply.css` starts with `#atendeai-smart-reply` (already in the `styles/tokens.css` scope list).
- UI copy (exact): window title `Sugerir resposta`; header links `Nova`, `×` (aria-label `Fechar`); context `Lendo o atendimento de ` + client name; toggle `Avisos` / `Avisos (n)`; badge `adendo`; reply label `Resposta para o cliente`; buttons `Copiar` → `Copiado` / `Não copiou`, `Inserir no chat`; sources prefix `Base:`; input placeholder `Diga o que responder, ou corrija a última… (Enter envia)`; busy `Escrevendo a resposta…`; stale note `O cliente mandou mensagem nova. Envie algo para atualizar.`; empty hint `Escolha o tipo de resposta, ou escreva o que quer dizer ao cliente.`; error retry `Tentar de novo`; no identity `Não foi possível identificar com segurança o atendimento ativo. Reabra a conversa.`

## Review Focus

1. **Attendance switch while a reply is in flight:** the reply is stored in the origin attendance's conversation and is not shown in the attendance now open — test in Task 5.
2. **Customer writes after a reply:** that reply's `Inserir no chat` is disabled, `Copiar` still works, the stale note shows — test in Task 6.
3. **`FONTES:` in odd shapes** (lowercase, extra spaces, in the middle, twice): always stripped from the reply, numbers parsed from the last one — test in Task 2.
4. **A failed turn followed by a new message:** history sent to the API skips error turns and never has two `user` turns in a row (keep the newest) — test in Task 4.
5. **Storage unavailable** (`chrome.storage` throws, extension context invalidated): the chat still works in memory for the session and nothing throws — test in Task 4.

---

## Task 1: API accepts `messages` on `/api/gemini/responder`

Repo: `resumo-chat-api`.

**Files:**
- Modify: `src/main/java/com/soften/support/gemini_resumo/dto/SmartReplyRequest.java`
- Test: `src/test/java/com/soften/support/gemini_resumo/service/SmartReplyChatRequestTest.java` (new)

**Interfaces:**
- Produces: `SmartReplyRequest` gains a 9th record component `List<ClaudeService.Turn> messages` (never null; empty when absent). Constants `MAX_CHAT_TURNS = 12`, `MAX_CHAT_TURN = 1500`, `MAX_CHAT_TOTAL = 8000`. Keep an 8-argument constructor `(conversation, promptComplement, replyInstruction, styleSamples, regenerate, currentReply, intent, notices)` that delegates with `List.of()` so existing callers compile. `ClaudeService.Turn(boolean fromUser, String text)` already exists in `docs/ClaudeService.java`.

- [ ] **Step 1: Write the failing tests** in `SmartReplyChatRequestTest` (parse with `ObjectMapper.readValue(json, SmartReplyRequest.class)` like `SmartReplyIntentTest.parse`):

```java
@Test void parsesAlternatingChatEndingWithTheTechnician() {
    var r = parse(Map.of("conversation", "Cliente: deu erro", "intent", "resolver", "messages", List.of(
        Map.of("role", "user", "content", "Resolver"),
        Map.of("role", "assistant", "content", "Me manda um print?"),
        Map.of("role", "user", "content", " ela já mandou "))));
    assertEquals(3, r.messages().size());
    assertTrue(r.messages().get(0).fromUser());
    assertEquals("ela já mandou", r.messages().get(2).text());
}
@Test void oldPayloadHasNoMessages() { assertTrue(parse(Map.of("conversation", "Cliente: oi")).messages().isEmpty()); }
@Test void rejectsBadChatShapes() {
    // each must throw (Jackson wraps IllegalArgumentException; assert any exception)
    // 1. first turn assistant; 2. last turn assistant; 3. two user turns in a row;
    // 4. role "system"; 5. content not text; 6. blank content; 7. 13 turns;
    // 8. one turn of 1501 chars; 9. 6 turns of 1500 chars (9000 total); 10. messages not an array
}
@Test void chatRejectsTheOldAdjustFields() {
    // messages + replyInstruction "mais curto" → throws
    // messages + currentReply "x" + replyInstruction "y" → throws
    // messages + regenerate true → throws
    // messages + regenerate false → parses
}
```

- [ ] **Step 2: Run** `./mvnw -q test -Dtest=SmartReplyChatRequestTest` — expected: compilation failure (`messages()` undefined).
- [ ] **Step 3: Implement** in `SmartReplyRequest`: add `@JsonProperty("messages") JsonNode messages` to `from(...)`, a private `static List<ClaudeService.Turn> chat(JsonNode node)` validating every rule in Global Constraints (trim each content; check length after trim), and the chat-vs-adjust rejection. Messages are copied with `List.copyOf` in the compact constructor (null → `List.of()`).
- [ ] **Step 4: Run** `./mvnw -q test` — expected: all tests pass (new and existing).
- [ ] **Step 5: Commit** `feat: Smart Reply accepts the technician's chat history (messages)`.

## Task 2: Service uses the chat, gates the manual and returns only cited sources

Repo: `resumo-chat-api`.

**Files:**
- Modify: `src/main/java/com/soften/support/gemini_resumo/service/SmartReplyService.java`
- Modify: `src/main/java/com/soften/support/gemini_resumo/controller/SmartReplyController.java` (502 copy only)
- Modify: `src/test/java/com/soften/support/gemini_resumo/service/SmartReplyDocsTest.java` (stubs must now end with `FONTES: 1`)
- Test: `src/test/java/com/soften/support/gemini_resumo/service/SmartReplyChatTest.java` (new); update any test asserting `"Tente ↻ Outra."`

**Interfaces:**
- Consumes: `SmartReplyRequest.messages()` (Task 1).
- Produces:
  - Data JSON gains `"chat": [{"autor": "tecnico"|"assistente", "texto": "..."}]` only when `messages` is non-empty.
  - Each `documentacao` item gains `"n"` (1-based, in hit order).
  - `static final Set<String> NO_DOCS_INTENTS = Set.of("cobrar_retorno", "encerrar")`.
  - `List<DocsIndex.Hit> relevantDocs(String conversation, String technicianAsk)`; the existing 1-arg overload delegates with `null`.
  - `record Cited(String text, Set<Integer> numbers)` and `static Cited cited(String raw)`.

- [ ] **Step 1: Write the failing tests** in `SmartReplyChatTest` (reuse `SmartReplyDocsTest.index()`; mock `ClaudeService`/`GeminiService` as that test does):

```java
@Test void chatTravelsAsDataWithAutorAndTexto()          // data.chat == [{tecnico,"Resolver"},{assistente,"Me manda um print?"},{tecnico,"ela já mandou"}]; no "chat" key when messages empty
@Test void technicianAskFindsTheManualEvenWhenTheCustomerSaidLittle()
                                                          // conversation "Cliente: oi", last message "como resolver rejeição 539 duplicidade" → data.documentacao[0].n == 1
@Test void cobrarAndEncerrarNeverSearchTheManual()        // conversation mentions rejeição 539 duplicidade; intent "encerrar" → no "documentacao", sources empty; same for "cobrar_retorno"; "cliente_dificil" still gets documentacao
@Test void onlyCitedPagesComeBackAndTheControlLineIsStripped()
                                                          // model "Consulta a chave na SEFAZ.\nFONTES: 1" → reply "Consulta a chave na SEFAZ.", sources [https://d/539]
                                                          // "…\nFONTES: nenhuma" → sources []; no FONTES line → sources []; "…\nFONTES: 7" (unknown n) → sources []
@Test void oddControlLinesAreAlwaysStripped()             // "fontes:1" lowercase, "  FONTES :  1 , 1 " spaces, a FONTES line in the middle plus one at the end (numbers from the last) — reply never contains "FONTES"
@Test void geminiFallbackFollowsTheSameRules()            // Claude empty → Gemini returns "Texto\nFONTES: 1" → reply "Texto", sources [https://d/539]
@Test void policyExplainsChatAndFontes()                  // POLICY contains "CHAT (chat)" and "FONTES:"
```

Add to `SmartReplyControllerTest` (or the contract test): cliché-only output → 502 body `{"erro":"Não saiu uma boa sugestão. Tente de novo."}`.

- [ ] **Step 2: Run** `./mvnw -q test -Dtest='SmartReplyChatTest,SmartReplyDocsTest'` — expected: failures (no `chat` key, sources returned without citation).
- [ ] **Step 3: Implement** in `SmartReplyService`:
  - **POLICY: new `CHAT (chat)` section**, in the voice of the existing sections. It says:
    - `chat` is the technician's conversation with the assistant;
    - the last `tecnico` entry is the current ask (goal, correction or new fact);
    - the last `assistente` entry is the base when the ask is an adjustment;
    - the output is still only the message to the customer;
    - the technician's words set the goal but never override FATOS / NUNCA USE.
  - **POLICY: extend the DOCUMENTAÇÃO bullet.** Each trecho has `n`. When the documentation was used, end with a last line `FONTES: <números separados por vírgula>`; otherwise `FONTES: nenhuma`.
  - Keep each safeguard bullet on its own line; `SmartReplyPolicyTest` checks exact substrings.
  - **`reply()` order:**
    1. Skip the docs search when `intent ∈ NO_DOCS_INTENTS`.
    2. Search with `relevantDocs(conversation, last user turn text or null)`. The query is the technician ask + `"\n"` + today's opening/tail query. Keep `DOCS_MIN_MATCHED_TERMS`.
    3. Generate with Claude first, then the Gemini fallback (unchanged).
    4. `cited(raw)`: remove every line matching `(?im)^\s*fontes\s*:.*$` and parse integers from the last such line.
    5. `ReplyPolish.apply(cited.text())`.
    6. Map the cited numbers → hits → `Source(title, url)`, deduped by url, in citation order.
- [ ] **Step 4: Change the 502 copy** in `SmartReplyController` to `"Não saiu uma boa sugestão. Tente de novo."`.
- [ ] **Step 5: Run** `./mvnw -q test` — expected: all pass, including `SmartReplyPolicyTest`, `SmartReplyDocsTest` (with `FONTES: 1` stubs) and the contract tests.
- [ ] **Step 6: Commit** `feat: Smart Reply chat mode, manual gated by intent and ask, only cited sources`.

## Task 3: Background passes `messages` through

Repo: extension.

**Files:**
- Modify: `background.js` (`gerarResposta` handler, ~lines 205–247)
- Test: `tests/observations-and-payload.test.js` (append, using its `background.dispatch` harness)

**Interfaces:**
- Consumes: the Global Constraints chat limits.
- Produces: `chrome.runtime` action `gerarResposta` accepts `messages: Array<{role, content}>` and forwards it trimmed to the API body as `messages`.

- [ ] **Step 1: Write the failing tests**:

```js
test('gerarResposta envia o histórico do chat aparado', async () => {
  // dispatch { action:'gerarResposta', conversation:'Cliente: oi', intent:'resolver',
  //   messages:[{role:'user',content:' Resolver '},{role:'assistant',content:'Me manda um print?'},{role:'user',content:'ela mandou'}] }
  // → success true; API body.messages deepEqual [{role:'user',content:'Resolver'},{role:'assistant',content:'Me manda um print?'},{role:'user',content:'ela mandou'}]
});
test('gerarResposta rejeita histórico inválido sem chamar a API', async () => {
  // each → success false and no fetch: first assistant; last assistant; 13 turns; a 1501-char turn;
  // 6×1500 chars; messages + replyInstruction; messages + regenerate true; messages not an array
});
```

- [ ] **Step 2: Run** `node --test tests/observations-and-payload.test.js` — expected: the two new tests fail.
- [ ] **Step 3: Implement** the validation inside the existing `if (... ) { safeSend({ success:false, erro:"Contexto inválido para sugerir resposta." }) }` guard and `if (request.messages?.length) payload.messages = ...trimmed`.
- [ ] **Step 4: Run** `node --test tests/` — expected: all pass.
- [ ] **Step 5: Commit** `feat: background forwards the Sugerir resposta chat history`.

## Task 4: `ReplyChatStore` — conversations per attendance and the API history

Repo: extension.

**Files:**
- Create: `modules/reply-chat-store.js`
- Modify: `manifest.json` (add `modules/reply-chat-store.js` to `content_scripts.js` right before `modules/smart-reply.js`)
- Test: `tests/reply-chat-store.test.js` (new; `vm` + an in-memory `chrome.storage.local` like `tests/smart-reply.test.js`)

**Interfaces:**
- Produces: `window.ReplyChatStore` with:
  - `load(token: string) → Promise<{ token, messages: Message[], updatedAt: number }>` (empty conversation when missing, expired or storage fails);
  - `save(conversation) → Promise<void>` (trims to the last 40 messages, sets `updatedAt = Date.now()`, keeps the newest 50 items, drops expired ones);
  - `clear(token) → Promise<void>`;
  - `forApi(messages: Message[]) → Array<{role, content}>`.
  - `Message = { role: 'user'|'assistant', content: string, intent?: string, sources?: Array<{title,url}>, error?: true, at: number }`.
  - Writes are serialized with the `enqueue` + `navigator.locks` pattern from `modules/smart-reply-context.js`. Every `chrome.storage` call is wrapped so a throw or `runtime.lastError` resolves instead of rejecting.

- [ ] **Step 1: Write the failing tests**:

```js
test('cada atendimento tem sua conversa e ela volta ao reabrir', ...)        // save token A then B; load(A).messages[0].content === 'Resolver'; load('C').messages.length === 0
test('conversa com mais de 24 h volta vazia e é descartada no próximo save', ...)
test('guarda no máximo 50 conversas e 40 mensagens cada', ...)              // 51 tokens → oldest gone; 45 messages → last 40 kept
test('clear apaga só a conversa daquele atendimento', ...)
test('forApi respeita 12 turnos, 1500 por turno e 8000 no total, começa e termina no técnico', ...)
                                                                            // 30 alternating msgs → length ≤ 12, [0].role 'user', last 'user'; a 2000-char reply is cut to 1500; total ≤ 8000
test('forApi pula erros e nunca manda dois turnos do técnico seguidos', ...)  // [user 'Resolver', assistant error, user 'tenta de novo'] → [{role:'user',content:'tenta de novo'}]
test('storage indisponível não quebra: load volta vazio e save resolve', ...) // chrome.storage.local.get/set throw → load resolves empty, save resolves
```

- [ ] **Step 2: Run** `node --test tests/reply-chat-store.test.js` — expected: fails (module missing).
- [ ] **Step 3: Implement** `modules/reply-chat-store.js`. `forApi` algorithm:
  1. Drop error messages.
  2. Collapse runs of the same role, keeping the newest.
  3. Map to `{role, content: content.trim().slice(0, 1500)}`.
  4. Keep the last 12.
  5. Drop from the front while the first is not `user` or the total exceeds 8000.
  6. Return `[]` if the last is not `user`.
- [ ] **Step 4: Run** `node --test tests/` — expected: all pass.
- [ ] **Step 5: Commit** `feat: per-attendance storage and API history for the Sugerir resposta chat`.

## Task 5: The chat window — open, chips, send, render, switch attendance

Repo: extension. This replaces the in-dock card; Task 6 adds Copiar/Inserir/Avisos on top.

**Files:**
- Rewrite: `modules/smart-reply.js` (keep `PANEL_ID = "atendeai-smart-reply"`, the `INTENTS` table, `retireLegacyProfiles`, the `setComposer`/`draftText` helpers for Task 6; drop `lockDock`, the card layout, `Direcionar`, `↻ Outra`, the editable preview)
- Rewrite: `styles/smart-reply.css` (window styles mirroring `styles/docs-chat.css`, every selector under `#atendeai-smart-reply`)
- Rewrite: `tests/smart-reply.test.js` (adapt its `harness()`: append the window to `body`, load `modules/reply-chat-store.js` into the context, keep `RecoveryBufferModule` as the failing Proxy)
- Modify: `tests/css-isolation.test.js` lines ~224–231 (old card assertions → new ones below)

**Interfaces:**
- Consumes: `ReplyChatStore` (Task 4); `ChatCaptureModule.identificarAtendimentoResposta()`, `.capturarConversaRotulada(selfName)`, `.capturarNomeCliente()`, `.observarAtendimentoResposta()`; `SmartReplyContextModule.sync()/getForCurrentChat()/onChanged()`; `StyleSamplesModule.selfName()/forRequest(text)`; `DailyNoticesModule.forRequest()`; `MessagingHelper.send`.
- Produces: `window.SmartReplyModule = { open(), close(), retireLegacyProfiles }`. `open()` toggles: if the window is open it closes it. No product pill in the context line (spec §6.2 makes it optional; nothing knows the product safely today). Class names Task 6 relies on: `.smart-reply-msg`, `.smart-reply-user`, `.smart-reply-bot`, `.smart-reply-reply` (the reply text box), `.smart-reply-msg-actions`, `.smart-reply-sources`, `.smart-reply-chips`, `.smart-reply-context`, `.smart-reply-stale`, `.smart-reply-messages`, `.smart-reply-input`, `.smart-reply-send`. Session fields: `s.token`, `s.conversation`, `s.busy`, `s.freshness = { conversation, promptComplement }` (for the latest reply).

- [ ] **Step 1: Write the failing tests** (Portuguese names, like the current file):

```js
test('abrir mostra a janela vazia com os botões rápidos e não chama a API', ...)
  // h.panel().parent === body; h.sent.length === 0; byClass('smart-reply-chips') has 5 buttons (Aviso hidden without notices); context text starts with 'Lendo o atendimento de Gabriel'
test('clicar em Resolver manda a intenção e o histórico, e a resposta aparece pronta para o cliente', ...)
  // sent[0] deepEqual { action:'gerarResposta', conversation:'Cliente (Gabriel): preciso de ajuda', intent:'resolver',
  //   messages:[{role:'user',content:'Resolver'}], promptComplement:'verificação em andamento' }   (no `regenerate` key)
  // a '.smart-reply-bot' shows label 'Resposta para o cliente' and '.smart-reply-reply'.textContent === 'Pode informar o erro exibido?'
  // the reply box is not editable (contentEditable not 'true'/'plaintext-only'); the compact chips row is present above the input
test('as páginas do manual aparecem como Base: e só links oficiais viram link', ...)
  // reply with sources [{title:'Rejeição 539',url:'https://docs.softensistemas.com.br/x'},{title:'Mal',url:'https://evil.example/'}]
  // → '.smart-reply-sources' text starts with 'Base:', exactly one <a> with href 'https://docs.softensistemas.com.br/x', target '_blank', rel 'noopener noreferrer'
  // reply without sources → '.smart-reply-sources' absent or hidden
test('mensagem livre com Enter manda o histórico inteiro com a resposta anterior', ...)
  // after one reply, type 'ela já tentou' + Enter → sent[1].messages = [user Resolver, assistant 'Pode informar…', user 'ela já tentou'], no intent key
test('Shift+Enter não envia e as teclas não chegam aos atalhos do SZ', ...)
test('a conversa fica salva por atendimento e volta ao reabrir', ...)
  // close, open again → same 2 messages rendered, no new request
test('Nova limpa só a conversa deste atendimento', ...)
test('trocar de atendimento com a janela aberta mostra a conversa do outro', ...)
  // live.name/time change + h.notify() → context shows the new name, messages empty
test('resposta que chega depois da troca vai para o atendimento de origem e não aparece no novo', ...)   // Review Focus 1
  // h.defer(); click Resolver; switch attendance + notify; h.respond('Tarde'); → no '.smart-reply-reply' visible;
  // switch back + notify → 'Tarde' rendered (store has it under the origin token)
test('falha mostra o erro com Tentar de novo, que reenvia a mesma mensagem', ...)
test('sem identidade segura não gera e mostra o aviso', ...)
test('mensagem nova do cliente mostra o aviso de atualização', ...)
  // after a reply, live.conversation += '\nGabriel: e agora?' + notify → '.smart-reply-stale' visible with the exact copy
test('retireLegacyProfiles apaga só as chaves de perfil antigas', ...)   // keep the current test as is
```

In `css-isolation.test.js`, replace the old Smart Reply assertions with:
- every selector extracted from `styles/smart-reply.css` matches `/^#atendeai-smart-reply(?:\s|$|\s*\[|\.)/`;
- the file does not contain `data-reply-open`, `smart-reply-card` or `lockDock`;
- `.smart-reply-messages` has `overflow-y: auto`;
- `#atendeai-smart-reply` has `position: fixed`.

- [ ] **Step 2: Run** `node --test tests/smart-reply.test.js tests/css-isolation.test.js` — expected: new tests fail.
- [ ] **Step 3: Implement** `modules/smart-reply.js`:
  - **Window.** `<section id="atendeai-smart-reply" class="smart-reply-window" aria-label="Sugerir resposta">` appended to `document.body`, then `ThemeModule.apply`.
  - **Rendering.** Messages render like `docs.js#renderMessages`: plain `textContent`, `white-space: pre-line` via CSS.
  - **Chips.** Shown in the empty state, plus a compact row above the input after the first reply.
  - **Sending.** `send({ text, intent })`:
    1. Push the user message and save.
    2. Capture the conversation; add `promptComplement` / `notices` / `styleSamples` exactly as the current `generate()` does.
    3. `messages: ReplyChatStore.forApi(conversation.messages)`.
    4. On success, push `{ role:'assistant', content: reply, sources }`, set `s.freshness`, then save to the **origin** token's conversation. Re-render only if `s.token` still equals the origin.
  - **Attendance switch.** The existing body `MutationObserver` (ignoring mutations inside the window) detects a token change. It then sets `s.token`, `s.conversation = await ReplyChatStore.load(newToken)` and re-renders.
  - **Stale.** Compare the current capture with `s.freshness`, as `syncChat` does today.
  - **Esc.** Esc anywhere closes the window, as today.

  `styles/smart-reply.css` positions the window like `#geminiDocsPopup` (`position: fixed; right: 20px; bottom: 130px; width: min(460px, calc(100vw - 40px)); height: min(620px, calc(100vh - 160px)); z-index: 999999`). It reuses the docs bubble look: user bubble `var(--ai-primary)`, bot block `var(--ai-surface-muted)`, reply box `var(--ai-surface)` with `var(--ai-primary-border)`.
- [ ] **Step 4: Run** `node --test tests/` — expected: all pass.
- [ ] **Step 5: Commit** `feat: Sugerir resposta opens as a chat window, one conversation per attendance`.

## Task 6: Copiar, Inserir no chat, Avisos and the adendo badge

Repo: extension.

**Files:**
- Modify: `modules/smart-reply.js`, `styles/smart-reply.css`
- Test: `tests/smart-reply.test.js` (append)

**Interfaces:**
- Consumes: Task 5 class names and session fields; `ChatCaptureModule.encontrarComposer()`; `StyleSamplesModule.noteInserted(text)`; `DailyNoticesModule.list()/add()/remove()/untilLabel()/DURATIONS/MAX_TEXT`; `navigator.clipboard.writeText`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**:

```js
test('Inserir no chat escreve no campo sem enviar, avisa as amostras e mantém a janela aberta', ...)
  // composer.value === reply; composer.events deepEqual ['input']; live.inserted === reply; h.panel() !== null
test('rascunho existente pede Substituir, Acrescentar ou Cancelar', ...)        // port the current draft test; Acrescentar → 'rascunho\nresposta'
test('Copiar copia o texto, avisa as amostras e mostra Copiado', ...)           // clipboard text === reply; live.inserted === reply; button text 'Copiado'
test('Copiar sem permissão mostra Não copiou', ...)                             // writeText rejects
test('só a resposta mais recente pode ser inserida', ...)                       // two replies → first reply's 'Inserir no chat' disabled, second enabled
test('mensagem nova do cliente trava Inserir mas Copiar continua', ...)         // Review Focus 2
test('outro atendimento ativo trava Inserir da resposta mostrada', ...)
test('Ctrl+Enter insere a resposta mais recente', ...)
test('Avisos abre o painel, adiciona e remove; Aviso só aparece com aviso ativo', ...)   // port the current notices test to the window
test('selo adendo só aparece quando o adendo foi usado', ...)                   // port the current badge test
```

- [ ] **Step 2: Run** `node --test tests/smart-reply.test.js` — expected: new tests fail.
- [ ] **Step 3: Implement.**
  - **Inserir.** Port today's `insert(s, mode, expected)`: recheck `current()`, stale and composer identity before mutating; draft choices `Substituir` / `Acrescentar` / `Cancelar`.
  - **Who may insert.** `Inserir no chat` is enabled only on the latest assistant message, and only when not busy, not stale and the token matches.
  - **Copiar and Inserir both call `noteInserted(text)`.**
  - **Avisos.** Port `buildNoticesPanel` / `refreshNotices` from the current module into the context line's `Avisos` toggle.
- [ ] **Step 4: Run** `node --test tests/` — expected: all pass.
- [ ] **Step 5: Commit** `feat: Copiar and Inserir no chat in the reply chat, with Avisos and adendo`.

## Task 7: Dock — Consultar Docs prominent, Sugerir resposta as the link; one window at a time

Repo: extension.

**Files:**
- Modify: `content.js`
  - ~782–786 and ~839–846: button construction;
  - ~898–906: group order;
  - ~547–548: remove the `data-reply-open` close in `applySize`.
- Modify: `styles/buttons.css` ~323–324: rename `.atendeai-reply-primary` → `.atendeai-primary-action`; add `.atendeai-reply-link` (inline icon + text, same metrics as `.gemini-preserved-link`).
- Modify: `modules/docs.js`: export `close()`; at the start of `exibirPainelConsultaDocs` call `globalThis.SmartReplyModule?.close?.()`.
- Modify: `modules/smart-reply.js`: `open()` calls `globalThis.DocsModule?.close?.()` first.
- Modify: `options.js` ~94–95: order and labels `{ id: "btnConsultarDocsLoop", label: "Consultar Docs" }` then `{ id: "btnSmartReply", label: "↳ Sugerir resposta" }` (defaults unchanged).
- Test: `tests/dock.test.js`, `tests/docs-chat.test.js`, `tests/smart-reply.test.js`

**Interfaces:**
- Consumes: `SmartReplyModule.close()` (Task 5).
- Produces: `DocsModule.close()`.

- [ ] **Step 1: Write the failing tests**:

```js
// dock.test.js — replace 'size, minimize and window resize close an open Smart Reply card…' with:
test('mudar tamanho, minimizar ou redimensionar não fecha a janela do Sugerir resposta', ...)   // reply.closed stays 0
test('Consultar Docs é o botão do grupo e Sugerir resposta o link embaixo', () => {
  const src = fs.readFileSync('content.js', 'utf8');
  const group = src.slice(src.indexOf("replyGroup.className"), src.indexOf("container.appendChild(replyGroup)"));
  assert.ok(group.indexOf('appendChild(botaoDocs)') < group.indexOf('appendChild(botaoSmartReply)'));
  assert.match(src, /botaoDocs\.className = 'gemini-floating-btn atendeai-primary-action'/);
  assert.match(src, /botaoSmartReply\.className = 'gemini-preserved-link atendeai-reply-link'/);
  assert.doesNotMatch(src, /data-reply-open/);
});
// docs-chat.test.js
test('abrir o Consultar Docs fecha o Sugerir resposta e close() fecha a janela', ...)
// smart-reply.test.js
test('abrir o Sugerir resposta fecha o Consultar Docs', ...)   // context.DocsModule = { close(){ closed++ } }
```

- [ ] **Step 2: Run** `node --test tests/dock.test.js tests/docs-chat.test.js tests/smart-reply.test.js` — expected: new tests fail.
- [ ] **Step 3: Implement** the changes listed under Files.
  - `botaoDocs` keeps id `btnConsultarDocsLoop` and becomes `gemini-floating-btn atendeai-primary-action`, with the `docs.png` icon via `getIconHTML("docs.png", "Consultar Docs")` + ` Consultar Docs`.
  - `botaoSmartReply` keeps id `btnSmartReply` and becomes `gemini-preserved-link atendeai-reply-link`, with the existing chat SVG at 14px + ` Sugerir resposta`.
  - In `replyGroup`, append Docs first.
- [ ] **Step 4: Run** `node --test tests/` — expected: all pass.
- [ ] **Step 5: Commit** `feat: Consultar Docs leads the dock group; Sugerir resposta becomes its link`.

## Task 8: Cost check, deploy and release 1.8.0

Both repos. Steps marked **(Felipe)** need his explicit OK in chat before running.

- [ ] **Step 1: Estimate the monthly cost** following spec §5 "Conferência de custo":
  1. Read the last 30 days of `claude_usage feature=smart_reply` lines from Cloud Run logs (`gcloud logging read` on the API service, read-only). Get the call count and the average input / output / `cacheRead` tokens.
  2. Take the current price for the model in `ANTHROPIC_MODEL` from Anthropic's official pricing page, not from memory.
  3. Add the history (up to 8000 chars ≈ 2000 tokens per call) and assume 1.5 calls per inserted reply.
  4. Write the calculation in `docs/superpowers/plans/2026-11-06-sugerir-resposta-chat.md` under a new "Custo" heading. From the same log data, note the peak calls per minute. If it gets near the 30/min `SmartReplyRateLimiter` (shared by all technicians), record that there; changing the limit is out of scope.
  5. If it is above R$20/month, change the extension and API limits from 12 to 6 turns (and if still above, send only the last exchange), rerun both test suites, and commit `chore: tighter chat history to stay under the AI budget`.
- [ ] **Step 2: Run both suites:** `./mvnw -q test` (API) and `node --test tests/` (extension). Expected: all pass.
- [ ] **Step 3: Manual check on SZ.chat (Felipe)**, with the extension loaded unpacked:
  - the dock shows Consultar Docs as the blue button and Sugerir resposta as the link;
  - the window opens empty, Resolver produces a reply, and a correction produces a new one;
  - Copiar works, Inserir writes to the composer without sending;
  - switching attendance swaps the conversation;
  - nothing covers the SZ composer or the queue card badges / counters / •••.
- [ ] **Step 4: Deploy the API (Felipe)** with `./deploy.sh` from `resumo-chat-api` **before** releasing the extension (the old API rejects `messages`). Then smoke-test: a `POST /api/gemini/responder` with `messages` returns 200.
- [ ] **Step 5: Release the extension.**
  1. Bump `manifest.json` `"version"` to `"1.8.0"` and commit `chore: release 1.8.0`.
  2. Build the zip:

     ```bash
     zip -r ../atendeai-1.8.0.zip . -x 'tests/*' 'docs/*' '.superpowers/*' '.git/*' '*.DS_Store' '*.zip'
     ```
  3. Check with `unzip -l ../atendeai-1.8.0.zip` that `modules/reply-chat-store.js` is present and `tests/` is absent.
- [ ] **Step 6: Push / merge (Felipe)** only as he directs.
