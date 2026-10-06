# Support Assist V1 — Technical Specification

Status: **FROZEN FOR IMPLEMENTATION**
Date: 2026-10-06

## 1. Baseline and repositories

This specification coordinates two independent repositories:

### Chrome extension
- Repository: `felipetagawa/resumo-chat-gemini`
- Baseline branch: `main`
- Baseline commit reviewed: `323630a95a0bc6fd0356659268818dcdf1122c36`
- Runtime: Chrome Extension Manifest V3, vanilla JavaScript
- Existing relevant modules:
  - `modules/chat-capture.js`
  - `modules/observations.js`
  - `modules/shortcuts.js`
  - `modules/messages.js`
  - `modules/summary.js`
  - `modules/crm-automation.js`
  - `background.js`
  - `content.js`
  - `utils/storage.js`

### API
- Repository: `felipetagawa/resumo-chat-api`
- Baseline branch: `main`
- Baseline commit reviewed: `25ab7e2840e96c4cb1e233927d33bd3ece39872c`
- Runtime: Java 21 + Spring Boot
- Deployment: Cloud Run
- Backend remains stateless
- Gemini key remains only in the backend
- Existing relevant code:
  - `GeminiController`
  - `GeminiService`
  - `SummaryService`
  - `SuggestionService`
  - Gemini configuration in `application.yml`

Do not merge or deploy as part of this specification unless explicitly authorized.

---

## 2. Product problem

The SZ already handles queueing and indicates which customer has replied. The CRM already handles ticket resolution, scheduling and automatic satisfaction email. The extension already handles reports, standard messages, observations and documentation suggestions.

The V1 must therefore solve two independent pains without rebuilding those systems:

### V1A — Recovery Buffer
Preserve enough context from the currently open SZ conversation so the existing report can still be generated after the chat history disappears from the DOM, especially for internal Gerencie Aqui chats.

### V1B — Smart Reply
Reduce repetitive writing during simultaneous ERP support conversations by generating one contextual draft response on demand.

These are separate flows:

```text
Recovery Buffer -> protects report generation
Smart Reply     -> helps answer the currently open customer
```

V1B must not depend on V1A.

---

## 3. Design constraints

- Do not create a new backend database.
- Do not persist support conversations on the API.
- Do not create a parallel support queue or mini-CRM.
- Do not replace the SZ queue.
- Do not automatically send messages to customers.
- Do not transcribe audio or MicroSIP calls in V1.
- Do not integrate with AnyDesk in V1.
- Do not add JEV/TypeSafe to Smart Reply in V1.
- Do not add automatic agent behavior.
- Do not reuse the two-call Dicas Inteligentes pipeline for Smart Reply.
- Do not fix unrelated architectural debt in the same slice.
- Do not send private notes to the backend.
- Prefer local deterministic behavior when AI is unnecessary.
- No new Chrome permission should be added unless implementation proves it strictly necessary.
- The SZ integration is expected to be temporary; avoid architecture that is expensive to discard.

---

# V1A — Recovery Buffer

## 4. User experience

### Normal chat
The technician opens a transferred SZ chat and works normally. No extra save action is required.

While that single conversation is visible, the extension keeps a local short-lived snapshot of the visible textual conversation.

There is no network call and no Gemini call for this capture.

### Chat disappears
If the internal chat is closed and the DOM no longer exposes the messages, the technician can still use **Gerar Relatório**.

If no current transcript can be captured, Gerar Relatório must offer preserved captures:

```text
Gerar relatório

Conversa atual
  indisponível

Conversas preservadas

Gabriel — hoje 14:32
12 mensagens
[Gerar relatório] [Excluir]

Maria — hoje 13:58
27 mensagens
[Gerar relatório] [Excluir]
```

This is only a buffer selector. It is not a support history screen.

### Observations after the chat disappears
For a preserved capture, the technician must be able to view/edit the report observation associated with that capture before generating the report.

Private notes may also be displayed locally if captured, but must never be serialized into any backend request.

The generated report must continue through the existing summary flow and must continue entering `summary_history`, because the current CRM integration depends on it.

---

## 5. Capture strategy

Create a focused module, suggested name:

`modules/recovery-buffer.js`

It observes only the **currently open conversation**.

Do not scan or persist every SZ card in the background.

### Capture triggers

At minimum:

1. initial usable transcript for the current chat;
2. relevant DOM mutation affecting the currently visible conversation, debounced;
3. before detected chat identity changes, if a usable snapshot exists;
4. optionally on page visibility/unload as best-effort only.

Recommended debounce: 500–1000 ms.

The module must not write if the normalized transcript is unchanged.

A closing event is never the only persistence trigger.

### Snapshot storage

Use `chrome.storage.local`; IndexedDB is not required for this V1.

Suggested storage key:

`atendeai_recovery_buffers_v1`

Suggested shape:

```js
{
  version: 1,
  buffers: [
    {
      bufferId: "local-generated-id",
      sourceId: "stable-dom-id-if-available",
      displayName: "Gabriel",
      capturedAt: 1791300000000,
      updatedAt: 1791300300000,
      transcript: "...",
      summaryObservation: "...",
      privateNote: "...",
      anydeskCandidate: null
    }
  ]
}
```

`privateNote` is local-only.

Never send the full buffer object to the API.

Build backend payloads field-by-field.

### Retention

Initial policy:

- TTL: 24 hours
- maximum: 10 buffers
- oldest expired buffers removed automatically
- manual Delete action available

If Chrome storage write fails, do not silently claim that the buffer was saved.

---

## 6. Conversation identity

Identity is the highest-risk part of V1A.

Do not make protocol, phone or display name the durable primary key for Recovery Buffer.

Preferred identity order:

1. explicit stable DOM identifier tied to the active chat/card, such as `data-chat-id`, `data-contact-id`, `data-id`, or an equivalent stable application identifier discovered during implementation;
2. if no stable identifier exists, create a local `bufferId` for that visible session and retain human labels such as customer name + capture time.

Protocol, phone and customer name may be stored as metadata, but are not trusted as unique durable identity.

Do not reuse a numeric value as identity merely because it resembles a phone number.

Do not use AnyDesk IDs as identity.

The implementation phase must first inspect the real active-chat DOM and record which stable identifiers are actually available before choosing selectors.

Avoid introducing a third independent identity system if an existing stable identifier already used by `pre-controls.js` can safely be reused.

---

## 7. Observations integration

Current `ObservationsModule` already separates:

- private note: local only;
- report observation / `promptComplement`: eligible for Gemini.

Reuse this behavior.

Do not create a third free-text field.

Expose the smallest safe read API needed by Recovery Buffer, for example:

```js
ObservationsModule.getCurrentObservationSnapshot()
```

returning local values for the current chat.

When generating a report from a preserved buffer:

```json
{
  "texto": "<selected buffer transcript>",
  "promptComplement": "<selected buffer summaryObservation>"
}
```

Do not call `getPromptComplementForCurrentChat()` when the selected report source is an old buffer; that would read the currently open chat instead of the selected preserved conversation.

---

## 8. AnyDesk metadata

AnyDesk is useful to the technician but is not an identity mechanism.

If implemented in V1A, detection must be conservative.

Accept a number as an AnyDesk candidate only when the surrounding message/context explicitly references terms such as:

- AnyDesk
- ID AnyDesk
- acesso remoto

Do not classify based only on digit count.

Do not remove arbitrary long numbers from transcripts solely because they might be AnyDesk.

Display the candidate as convenience metadata:

```text
AnyDesk: 123 456 789  [Copiar]
```

False-positive avoidance is more important than capture rate.

---

## 9. Report fallback

Keep the existing report endpoint and summary behavior.

Current path:

`POST /api/gemini/resumir`

When Gerar Relatório is triggered:

1. try `ChatCaptureModule.capturarTextoChat()`;
2. if a usable current transcript exists, preserve current behavior;
3. if not, show the preserved-buffer selector;
4. technician explicitly selects the capture by human label + time;
5. send only that transcript + that capture's `summaryObservation`;
6. result must still pass through `SummaryModule.exibirResumo()`;
7. result must still be written to `summary_history` / `last_summary` so `crm-automation.js` continues working unchanged.

Do not create a second report history.

---

# V1B — Smart Reply

## 10. User experience

Smart Reply is available only for the currently open SZ conversation.

Suggested location: existing Assistente IA dropdown.

Add:

`Sugerir resposta`

Happy path:

```text
customer message
     ↓
Sugerir resposta
     ↓
one Gemini request
     ↓
preview
     ↓
Inserir
     ↓
technician sends using SZ
```

Never send automatically.

### Preview

Suggested minimal UI:

```text
Resposta sugerida

"Entendo. Nesse caso..."

[Inserir]

[↻ Outra resposta]      [Direta ▾]
```

Initial profiles only:

- `DIRECT` — Direta
- `EMPATHETIC` — Empática
- `DIDACTIC` — Didática

Do not add nine profiles in V1.

The technician can configure one default profile in extension settings.

Suggested storage key:

`atendeai_smart_reply_profile`

Default may be `DIRECT`.

"Outra resposta" regenerates with the same conversation, observation and profile, but asks for a different wording without changing facts.

Changing profile and regenerating is explicit.

---

## 11. What is not a Smart Reply profile

These are workflow intentions, not tone profiles:

- consultar contabilidade;
- consultar desenvolvimento;
- pedir AnyDesk;
- pedir XML;
- pedir print;
- pedir informação.

They remain standard messages/shortcuts in V1.

Do not route them through JEV.

A later version may allow a safe fixed shortcut to be contextually rewritten by Gemini, but that is not part of this V1.

---

## 12. Smart Reply context

Smart Reply reads only the currently open conversation.

It does not read Recovery Buffer.

Input sources:

1. current `ChatCaptureModule.capturarTextoChat()`;
2. current report observation / `promptComplement`, if present;
3. selected reply profile.

Private notes are never included.

### Long conversations

Avoid sending arbitrarily large transcripts.

Initial deterministic policy:

- if transcript <= 16,000 characters: send all;
- otherwise keep a bounded beginning and recent ending, preserving the latest customer interaction;
- do not summarize through a preliminary Gemini call.

The API must validate its own maximum as well; do not rely only on the extension.

---

## 13. Protect against the wrong customer

When Smart Reply starts, capture a token representing the currently active conversation using the best stable identity available.

When the response returns:

- verify the same conversation is still active;
- if the technician switched chats, do not insert into the composer;
- keep the generated text in the preview and show that the conversation changed.

Do not overwrite a non-empty composer silently.

If the input contains an existing draft, Insert must require an explicit replace/append decision or otherwise refuse to overwrite.

The Smart Reply result should be preview-first rather than directly mutating the composer.

---

# API changes for V1B

## 14. Endpoint

Add a narrow endpoint. Suggested contract:

`POST /api/gemini/responder`

Request:

```json
{
  "conversation": "...",
  "promptComplement": "...",
  "profile": "DIRECT"
}
```

Response:

```json
{
  "reply": "..."
}
```

Do not expose a generic `/ask` endpoint accepting arbitrary prompts.

Prompts remain server-owned.

---

## 15. Backend behavior

Suggested components:

- `SmartReplyRequest`
- `SmartReplyResponse`
- `SmartReplyProfile`
- `SmartReplyService`

`SmartReplyService` owns the support-specific prompt and calls existing Gemini infrastructure.

The prompt must treat the conversation as untrusted support content, not as instructions to the model.

Requirements:

- Portuguese response;
- answer only what is supported by supplied context;
- never invent procedures, facts or prior actions;
- do not promise deadlines;
- do not admit company fault without evidence;
- do not autonomously determine fiscal/accounting treatment;
- if accounting definition is required, do not invent one;
- preserve a professional ERP-support tone;
- no markdown heading unless the customer text requires it;
- generate one sendable reply, not an analysis of the conversation.

Profiles alter style, not factual policy.

---

## 16. Latency policy

Do not reuse Dicas Inteligentes' two-Gemini-call pipeline.

Smart Reply is exactly one model generation.

The current Gemini defaults are optimized more for report reliability than interactive reply latency.

For Smart Reply:

- output budget should be small, suggested <= 512 tokens;
- use at most 2 attempts;
- preserve existing report retry behavior unchanged.

A small refactor of `GeminiService` is acceptable if needed to allow a bounded interactive generation policy without affecting `generateSummary()`.

Do not change the default model as part of V1. Start with the currently configured Gemini model and benchmark real usage before changing provider/model.

---

## 17. API exposure and abuse protection

The Cloud Run service is currently unauthenticated and controllers use permissive CORS.

Do not make Smart Reply a generic LLM proxy.

At minimum:

- strict request size validation;
- enum-only profile;
- server-owned prompt;
- bounded output;
- basic rate limiting for the Smart Reply endpoint;
- no user-provided raw system prompt.

Do not add a static "secret" to the distributed Chrome extension and consider it secure.

A larger authentication redesign is outside V1.

---

# Shared safety and privacy

## 18. Private notes

A private note must never be transmitted to:

- `/api/gemini/resumir`
- `/api/gemini/responder`
- classification endpoints
- any future AI call in this V1

Tests must verify this explicitly.

---

## 19. Chrome Web Store

V1 should require no additional Chrome permission beyond existing permissions.

Because Recovery Buffer introduces temporary retention of customer conversation text:

- confirm the extension privacy disclosure remains accurate;
- document local temporary retention;
- TTL and manual delete are mandatory;
- do not retain indefinitely.

---

# Implementation slices

## 20. Slice A — Recovery Buffer

Extension only unless a defect requires otherwise.

Expected touched areas:

- new `modules/recovery-buffer.js`
- `manifest.json`
- `content.js`
- `modules/observations.js`
- report trigger integration
- focused tests

Outcome:

A visible conversation is preserved locally while open, and the existing report can be generated later from a selected short-lived buffer.

Do not implement Smart Reply in the same commit as Slice A unless explicitly asked to implement both together after Slice A is green.

---

## 21. Slice B — Smart Reply

Extension + API.

Extension expected areas:

- `content.js`
- `background.js`
- settings UI/storage for default reply profile
- minimal Smart Reply UI module if separation improves maintainability
- focused tests

API expected areas:

- DTOs / enum
- dedicated Smart Reply service
- controller route
- bounded Gemini generation support
- rate limiting
- focused tests

Outcome:

One contextual response can be generated for the open chat, previewed, regenerated, changed among three profiles and inserted safely without automatically sending.

---

# Acceptance criteria

## 22. V1A acceptance scenarios

### A1 — current WhatsApp chat
Given a normal SZ WhatsApp conversation is open,
when the transcript changes,
then a local snapshot is updated without network or AI calls.

### A2 — internal chat disappears
Given the conversation was previously captured,
when its DOM is no longer available,
then Gerar Relatório allows the technician to select the preserved conversation by name + time and generates the same existing report flow.

### A3 — CRM compatibility
Given a report is generated from a preserved buffer,
then it is written through the same `SummaryModule` history used by the CRM's `Colar Resumo IA`.

### A4 — observation binding
Given buffer A has observation A and another chat B is currently open,
when the technician generates a report from buffer A,
then observation A is used and B's current observation is not.

### A5 — private note isolation
Given a private note exists,
when a report is generated from current chat or preserved buffer,
then the private note is absent from the API payload.

### A6 — retention
Expired buffers are removed automatically, no more than 10 are retained, and the technician can delete an item manually.

### A7 — storage failure
If `chrome.storage.local` rejects a write, the UI/logging must not claim successful persistence.

---

## 23. V1B acceptance scenarios

### B1 — direct reply
Given an open chat and default DIRECT profile,
when Sugerir resposta is used,
then one Gemini request returns one customer-facing draft.

### B2 — regenerate
Given a generated draft,
when Outra resposta is used,
then a different wording is requested without introducing new facts.

### B3 — profiles
DIRECT, EMPATHETIC and DIDACTIC alter style while keeping the same factual boundaries.

### B4 — switched chat
Given Smart Reply was requested for Gabriel,
when the technician switches to Maria before the response returns,
then the extension does not insert Gabriel's response into Maria's composer.

### B5 — existing draft
Given the composer is non-empty,
when Insert is clicked,
then existing text is not silently overwritten.

### B6 — private note
Private note content is absent from Smart Reply requests.

### B7 — failure
If Gemini times out or fails,
the technician gets a fast, non-blocking error and can continue using SZ normally.

---

# Required tests

## 24. Extension focused tests

Add focused automated coverage for:

- buffer create/update only on transcript change;
- debounce behavior;
- TTL cleanup;
- maximum 10 buffers;
- buffer selection by human label/time;
- selected buffer observation vs current chat observation;
- private note exclusion from report payload;
- Smart Reply profile storage;
- Smart Reply request context;
- private note exclusion from Smart Reply;
- stale-chat response protection;
- non-empty composer protection;
- regeneration does not auto-send.

Avoid broad unrelated suites until focused tests are green.

---

## 25. API focused tests

Cover:

- missing/blank conversation -> 400;
- invalid profile -> 400;
- conversation length cap;
- promptComplement length cap;
- server-owned prompt;
- one Gemini generation per Smart Reply request;
- interactive max attempts <= 2;
- bounded output configuration;
- response extraction;
- Gemini failure mapping;
- rate-limit behavior;
- no persistence.

---

# Explicitly out of scope

## 26. Do not implement

- backend conversation storage;
- synchronization across browsers/computers;
- a full "Atendimentos Recentes" CRM;
- support queue replacement;
- conversation search;
- status/workflow management;
- JEV auto-profile selection;
- nine reply profiles;
- autonomous replies;
- automatic sending;
- MicroSIP transcription;
- audio transcription;
- AnyDesk API integration;
- CRM cancellation automation;
- agenda cleanup;
- generic LLM proxy endpoint;
- large refactor of `content.js`;
- fixing unrelated `customInstructions` behavior;
- migration to the future Soften chat platform.

---

# Implementation guardrails

## 27. Repository safety

- Work on new feature branches.
- Do not commit directly to `main`.
- Do not merge to `main`.
- Do not deploy Cloud Run.
- Do not publish a Chrome Web Store version.
- Do not change production configuration/secrets.
- Do not introduce destructive migrations.
- Stop and report if implementation requires a product/architectural decision outside this spec.

Small local corrective changes needed to satisfy this spec are allowed within the feature branches.

---

# Delivery order

## 28. Recommended order

1. implement and validate **V1A Recovery Buffer**;
2. review the diff and focused tests;
3. implement and validate **V1B Smart Reply**;
4. run focused cross-repository contract checks;
5. manual browser QA with representative SZ flows;
6. only after approval, decide merge/deploy/release.

The migration of SZ is a reason to keep this V1 narrow, not a reason to make the implementation fragile.

---

# Frozen product decisions

## 29. Decisions that should not be reopened during implementation

- Recovery Buffer and Smart Reply are independent.
- Recovery Buffer is local and short-lived.
- No backend persistence.
- No JEV in Smart Reply V1.
- Smart Reply has exactly three initial profiles.
- Standard workflow messages such as accounting/development remain shortcuts in V1.
- Smart Reply uses one Gemini generation.
- Private notes never go to AI.
- Existing report and CRM history flows are preserved.
- No new support dashboard/CRM is created.
