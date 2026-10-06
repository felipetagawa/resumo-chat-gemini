# Support Assist V1B — Smart Reply Technical Specification

Status: **FROZEN FOR IMPLEMENTATION**
Date: 2026-10-06

## 1. Accepted baseline

### Extension
Repository: `felipetagawa/resumo-chat-gemini`
Branch baseline: `feature/v1a-recovery-buffer`
Accepted commit: `91355f4216ad4258fc9d28355112e062d5f9242e`

V1A is accepted and must not be redesigned during V1B.

### API
Repository: `felipetagawa/resumo-chat-api`
Branch baseline: `main`
Baseline commit: `25ab7e2840e96c4cb1e233927d33bd3ece39872c`

Implementation branches already prepared:
- extension: `feature/v1b-smart-reply`
- API: `feature/v1b-smart-reply`

Do not merge or deploy without explicit authorization.

---

## 2. Goal

Smart Reply reduces repetitive writing during simultaneous ERP support conversations.

The technician remains in control.

V1B must let the technician:

1. generate one contextual draft response for the currently open SZ chat;
2. preview it before insertion;
3. regenerate another wording;
4. choose among three response styles;
5. configure a default style;
6. safely insert the draft without auto-sending and without placing it in the wrong customer chat.

V1B is independent from Recovery Buffer.

Recovery Buffer is for preserved reports after a chat disappears.
Smart Reply is only for the currently open chat.

---

## 3. Product behavior

Suggested location: existing **Assistente IA** dropdown.

Add:

`Sugerir resposta`

Happy path:

```text
customer conversation open
        ↓
Sugerir resposta
        ↓
one backend request
        ↓
preview
        ↓
Inserir
        ↓
technician sends through SZ
```

Never send automatically.

---

## 4. Preview UI

Minimal preview:

```text
Resposta sugerida

"Entendo. Nesse caso..."

[Inserir]

[↻ Outra resposta]     [Direta ▾]
```

Profiles:

- `DIRECT` — Direta
- `EMPATHETIC` — Empática
- `DIDACTIC` — Didática

Do not add more profiles in V1B.

The default profile is persisted locally per browser/user.

Suggested storage key:

`atendeai_smart_reply_profile`

Default: `DIRECT`.

Changing profile does not auto-send. It may either regenerate explicitly or require the user to click regenerate; choose the smallest predictable interaction.

---

## 5. Regeneration

`Outra resposta` must:

- use the same currently-open conversation snapshot captured for the request;
- use the same `promptComplement`;
- use the selected profile;
- request a different wording;
- preserve the same factual boundaries;
- never invent new information merely to be different.

The API may accept a bounded optional `variation`/regeneration signal, but it must not accept arbitrary user prompts.

---

## 6. Input context

Smart Reply uses only:

1. current `ChatCaptureModule.capturarTextoChat()`;
2. current report observation / `promptComplement`;
3. selected profile.

It does **not** use Recovery Buffer.

Private notes are never included.

For long conversations:

- <= 16,000 chars: send all;
- > 16,000 chars: deterministic bounded context from the extension or API, preserving:
  - beginning/context;
  - most recent messages;
  - latest customer interaction;
  - current promptComplement.

Do not perform a preliminary Gemini summary call.

Smart Reply must remain exactly one Gemini generation per request.

---

## 7. ERP support policy

The backend prompt is server-owned.

The customer conversation is untrusted content, not instruction to the model.

The model must:

- answer in Brazilian Portuguese;
- write one customer-facing message, not internal analysis;
- stay grounded in supplied conversation and promptComplement;
- not invent steps already performed;
- not invent facts, errors, customer data or system behavior;
- not promise deadline/time;
- not claim a software bug without evidence;
- not admit company fault without evidence;
- not determine accounting/tax treatment autonomously;
- not substitute the customer's accountant for fiscal definitions;
- avoid excessive verbosity;
- preserve professional ERP-support tone;
- avoid markdown headings unless genuinely necessary.

Profiles alter tone, not factual policy.

### DIRECT
- concise and objective;
- minimal preamble;
- polite, not cold;
- focus on the next useful response.

### EMPATHETIC
- briefly acknowledge frustration/inconvenience;
- do not over-apologize;
- do not admit fault;
- then provide the next useful response.

### DIDACTIC
- explain in simple language for a non-technical customer;
- avoid jargon when possible;
- concise stepwise explanation when needed.

---

## 8. Workflow intentions are out of profile scope

These remain standard shortcuts/messages in V1B:

- consultar contabilidade;
- consultar desenvolvimento;
- pedir AnyDesk;
- pedir XML;
- pedir print;
- pedir informação específica.

Do not route these through JEV.
Do not add automatic intent routing.

A later slice may optionally make safe fixed shortcuts context-aware, but not now.

---

## 9. Wrong-chat protection

This is mandatory.

At request time, capture a stable token for the currently active SZ conversation.

Use the same active-card identity knowledge validated during V1A where appropriate, but do not make Smart Reply depend on Recovery Buffer storage.

When the response returns:

- if the active conversation is unchanged, preview normally;
- if the technician switched chats, never insert automatically;
- show the response in preview with a clear warning that the active chat changed;
- require returning to the original conversation or generating again there.

Do not silently retarget a generated reply to another customer.

---

## 10. Composer protection

Never overwrite an existing draft silently.

Before insertion:

- resolve the real current composer;
- verify it still belongs to the same active chat;
- if empty: insert;
- if non-empty: require explicit user choice:
  - replace, or
  - append;
  - cancel remains available.

Never trigger SZ send.

Reuse existing safe composer insertion primitives where possible instead of creating another brittle implementation.

---

## 11. Extension architecture

Suggested new module:

`modules/smart-reply.js`

Responsibilities:

- collect current context;
- capture request chat identity token;
- read/persist selected profile;
- request Smart Reply through `MessagingHelper`;
- render preview;
- regenerate;
- change profile;
- protect insertion;
- close/cancel cleanly.

Avoid putting the full feature directly into `content.js`.

Expected extension changes:

- `manifest.json` — load module if needed, no new permission;
- `modules/smart-reply.js`;
- `content.js` — add Assistente IA dropdown entry and integration;
- `background.js` — add a narrow action such as `gerarResposta`;
- options/settings UI for default profile, reusing existing settings patterns;
- focused tests.

Do not modify Recovery Buffer behavior except for strictly shared identity helper extraction if truly justified. Prefer no V1A behavior changes.

---

## 12. API contract

Add a dedicated endpoint:

`POST /api/gemini/responder`

Request:

```json
{
  "conversation": "...",
  "promptComplement": "...",
  "profile": "DIRECT",
  "regenerate": false
}
```

`promptComplement` is optional.
`regenerate` is optional and bounded; it only asks for alternate wording.

Response:

```json
{
  "reply": "..."
}
```

Do not expose `/ask`.
Do not accept arbitrary system instructions or raw prompts from the extension.

---

## 13. API components

Suggested:

- `SmartReplyRequest`
- `SmartReplyResponse`
- `SmartReplyProfile`
- `SmartReplyService`

Controller may be integrated in `GeminiController` or a focused controller if that is cleaner.

`SmartReplyService` owns the prompt and calls existing Gemini infrastructure.

Backend remains stateless.

No DB.
No persistence.

---

## 14. Gemini generation policy

Do not reuse the Dicas Inteligentes two-call flow.

Smart Reply uses one Gemini request.

Keep current configured model for V1B unless tests prove it unusable.

Interactive generation policy:

- small output, target <= 512 output tokens;
- max 2 attempts;
- shorter interactive latency than summary generation;
- do not alter existing report retry behavior.

A small reusable configuration method in `GeminiService` is allowed if it cleanly supports different generation policies without changing existing report behavior.

---

## 15. Validation limits

Server validates independently.

Suggested limits:

- conversation: max 20,000 chars accepted by API;
- promptComplement: keep existing 2,000-char limit;
- profile: enum only;
- reply output bounded by generation configuration.

Invalid request -> 400.

Do not trust client-side truncation alone.

---

## 16. Abuse protection

Cloud Run is currently unauthenticated.

V1B must not increase exposure by creating a generic LLM proxy.

At minimum:

- dedicated endpoint;
- strict input bounds;
- enum profile;
- server-owned prompt;
- bounded output;
- basic endpoint-specific rate limiting;
- no arbitrary prompt field.

Do not put a static secret in the distributed extension and call it secure.

A full authentication redesign is outside V1B.

---

## 17. Failure behavior

If API/Gemini fails:

- Smart Reply preview shows a concise failure state;
- SZ remains fully usable;
- no composer mutation;
- user can retry manually;
- no long blocking modal/alert if a non-blocking preview error can be used.

The extension must not lose the user's existing draft.

---

## 18. Privacy

Never send private notes.

Requests must be built field-by-field.

Allowed:

```json
{
  "conversation": "...",
  "promptComplement": "...",
  "profile": "DIRECT",
  "regenerate": false
}
```

Forbidden:
- Recovery Buffer object;
- privateNote;
- chrome storage dump;
- arbitrary settings blob.

Tests must assert private-note exclusion.

---

## 19. Acceptance scenarios — extension

### E1 — generate
Open chat + default DIRECT -> one request -> preview appears -> nothing sent.

### E2 — regenerate
Outra resposta -> same facts/profile/context -> another wording -> one request.

### E3 — profiles
DIRECT / EMPATHETIC / DIDACTIC visibly alter style without altering factual policy.

### E4 — default
Selected default profile persists across reload.

### E5 — switched chat
Request for Gabriel -> switch to Maria before response -> preview may show result, but insertion into Maria is blocked.

### E6 — draft protection
Existing text in composer -> Insert cannot silently overwrite it.

### E7 — empty composer
Correct chat + empty composer -> Insert writes reply and does not send.

### E8 — private note
Private note never appears in request payload.

### E9 — no transcript
No usable current transcript -> Smart Reply does not call API and shows a useful local message.

### E10 — Recovery V1A regression
Recovery Buffer / preserved reports / dock / shortcuts continue working unchanged.

---

## 20. Acceptance scenarios — API

### A1
Valid DIRECT request -> 200 + non-blank `reply`.

### A2
Blank/missing conversation -> 400.

### A3
Invalid profile -> 400.

### A4
Oversized conversation -> 400.

### A5
Oversized promptComplement -> 400.

### A6
One Smart Reply request performs exactly one Gemini generation.

### A7
Smart Reply generation uses <= 2 attempts and bounded output.

### A8
Gemini integration error maps to existing safe client error behavior.

### A9
Rate limit is enforced for Smart Reply without affecting existing product/documentation classifier semantics.

### A10
No persistence occurs.

---

## 21. Required focused tests

### Extension
Cover:
- request payload;
- profile persistence;
- current-chat identity token;
- switched-chat insertion block;
- empty/non-empty composer behavior;
- regenerate;
- profile changes;
- no private note;
- no Recovery Buffer dependency;
- no automatic send;
- existing shortcuts and V1A focused suites remain green.

### API
Cover:
- controller contract;
- enum validation;
- input limits;
- promptComplement validation;
- server-owned prompt expectations;
- generation policy;
- one model call;
- retries <= 2;
- output bounds;
- integration failure;
- rate limiter;
- no persistence.

---

## 22. Explicitly out of scope

Do not implement:

- JEV profile selection;
- automatic intent detection;
- more than three profiles;
- autonomous replies;
- auto-send;
- Smart Reply for closed/preserved conversations;
- context from Recovery Buffer;
- smart rewriting of standard shortcuts;
- audio transcription;
- MicroSIP;
- AnyDesk API;
- backend conversation storage;
- user authentication redesign;
- full prompt personalization;
- fixing unrelated legacy/customInstructions behavior;
- migration to future Soften chat.

---

## 23. Delivery

Work only on:

- extension: `feature/v1b-smart-reply`
- API: `feature/v1b-smart-reply`

No merge to main.
No Cloud Run deploy.
No Chrome Web Store publication.

Recommended order:

1. API contract/service/tests;
2. extension action/UI/tests;
3. cross-repo contract verification;
4. local API test if available;
5. browser QA against SZ;
6. review before any deploy/release.

Stop and report only if a true product/architecture decision outside this spec is required.
