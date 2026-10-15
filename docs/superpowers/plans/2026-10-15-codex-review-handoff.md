# Codex review handoff — Contexto na Fila and Smart Reply

Date: 2026-10-15. Audience: Sonnet 5.5 / implementing agent.

The user requested this file so the implementing agent can address the review. **This handoff makes no implementation changes.** The original findings are preserved below; see the re-review status immediately below for which remain open. Fixes should preserve unrelated work and add regression coverage for the demonstrated cases.

## Re-review of uncommitted fixes — 2026-10-15

Findings **1, 3, 4 and 5 are addressed** in the inspected uncommitted changes and regression coverage. Finding **2 remains partially open**.

The phone and original URL reproductions are now rejected, but the broader URL exclusion still uses an incomplete suffix list. Executing the current module returns `true` for:

```text
Abra empresa.support para conferir
Acesse empresa.digital para baixar
Veja empresa.software para conferir
```

A seeded `empresa.support` sample survives `load()` in persisted storage and appears in `forRequest("")`. These two-label domains have neither a listed suffix nor the extra label/slash required by the fallback patterns. Location: `modules/smart-reply-samples.js:9-14`.

Remaining fix: cover domain detection beyond the small suffix list while preserving legitimate file references such as `nota.xml`. Add regressions for admission, persisted pruning and request selection. Merely adding the three suffixes above leaves the same class of gap.

Verification: the extension suite passed; the API suite passed 119 tests, zero failures/errors/skips; all 53 offline evaluator tests passed with Node 22.23.2. The new same-first-name attendance-switch regression was also executed with the original capture module substituted in memory: it failed by storing the previous problem and AnyDesk code under `b`. With the current implementation, the suite passes. No checkout files were reverted for that control.

No implementation edits, real provider calls or browser acceptance were performed in this re-review. Verdict remains **with fixes**, pending the URL exclusion gap and the separate manual acceptance boundaries below.

## Reviewed scope

- Extension: `dfcb9a0..8296459` (queue context and Smart Reply).
- API: `56ecda9..0a25be4` in sibling repository `/Users/felipeokamoto/Documents/Repositorios/resumo-chat-api`.
- Requirements: `docs/superpowers/specs/2026-10-15-contexto-fila-design.md` and `docs/superpowers/specs/2026-10-15-sugerir-resposta-design.md` in this extension repository.
- API handoff: `/Users/felipeokamoto/Documents/Repositorios/resumo-chat-api/docs/2026-10-15-codex-review-handoff.md`.

Line numbers refer to the reviewed revisions; locate the functions again if files have changed.

## Open findings

### 1. [P1] Context can be persisted under the wrong attendance

Location: `modules/queue-context-capture.js:31-45`.

`read()` accepts transcript ownership based on the customer's full name or first name. When changing from Ana Souza to Ana Silva, a still-visible transcript labelled `Ana` passes the check for the newly active card. The prior customer's problem and AnyDesk code can then be stored under the new attendance, and its one-shot AI request can be consumed with the wrong context.

Reproduced with `tests/queue-context-harness.js`: create active card `a` (Ana Souza), inactive card `b` (Ana Silva); add received messages from `Ana` containing `Não emite DANFE` and `123 456 789`, followed by a sent greeting. Switch the active class from `a` to `b` without changing the transcript, then mount. Stored item `b` contains that problem and code.

Required outcome: only persist when transcript ownership is reliable. A first-name match cannot establish attendance identity. Fail closed when ownership is unknown. Add a regression for this switch and preserve valid capture cases; do not invent real SZ selectors or ownership metadata without evidence.

### 2. [P2] Sensitive-data filtering admits phones and URLs

Location: `modules/smart-reply-samples.js:8-9`, `accept()`.

Executing the actual module in a VM returns `true` for both:

```text
Me liga no 34567890 depois
Abra suporte.empresa.tech/login para conferir
```

Eight-digit local phones require a hyphen in the current detector, and scheme-less domain detection enumerates only a few suffixes. A confirmed send containing these values becomes eligible for storage and inclusion in `styleSamples` for unrelated chats. This contradicts Smart Reply spec section 5.1.

Required outcome: reject these sensitive forms, cover additional representative telephone/URL forms, and preserve legitimate non-sensitive messages such as dates. Verify both admission and request selection with meaningful regression tests.

### 3. [P2] Expired samples remain persisted

Location: `modules/smart-reply-samples.js:35`, `load()` / `sanitize()`.

Loading a stored sample aged 61 days yields an in-memory count of zero but leaves the original item in `chrome.storage.local`. If no later write occurs, that excerpt remains stored indefinitely, contrary to the 60-day retention rule.

Required outcome: persist pruning through the existing serialized storage path. Assert the actual persisted state after loading expired samples, rather than only the memory count. Preserve concurrent writes and the existing storage-failure fallback.

### 4. [P2] Required queue layout admission checks were removed

Location: `modules/queue-context.js:23-39`, `safeList()` / `flowSafe()`.

The replacement adapter omits the previous adapter's flex-column parent, native vertical scrolling, dimension and left-column checks, although queue spec section 4.6 explicitly requires retaining them. It admits a list with a block parent and `overflowY: hidden`; this was reproduced in the queue harness. The overlap check does not replace admission checks for unsupported or clipping layouts.

Required outcome: restore the applicable admission checks, retaining the exception for the extension's own inline editor, normal-flow guards, sibling insertion and overlap shutdown. Add regression tests proving unsupported layouts render no strips, and that supported layouts still work.

### 5. [P2] ReplyPolish does not meet its deterministic filtering guarantee

API location: `src/main/java/com/soften/support/gemini_resumo/service/ReplyPolish.java:39-48,67-71`.

See the API handoff for reproduced inputs and expected fixes. Both ordinary closing constructions and the arbitrary three-pass removal limit need coverage.

## Verification already performed on the reviewed revisions

- Extension: `node --test tests/` — 279 passed, zero failed.
- API: Java 21, `sh mvnw -o test` — 116 passed, zero failed.
- Offline evaluator: Node 22.23.2, `node --test eval/smart-reply/*.test.mjs` — 53 passed, zero failed.
- `git diff --check` passed in both repositories.
- Reproductions used local harnesses / a temporary Java probe. No real Gemini requests or authenticated SZ testing occurred. Existing passing tests do not cover the failures above.

The contract handling, factual safeguards, role labels and stale-response protection otherwise aligned well with the inspected requirements.

## Remaining acceptance boundaries

- Real SZ transfer-message calibration and 2–3 anonymized DOM fixtures are still pending; the queue spec requires them.
- Actual browser send-confirmation timing, dock footprint, themes and real zoom need manual validation.
- Real model tone, factual accuracy, deployed configuration and observed monthly cost were not established by this review.
- No provider calls, deployment, push or store publication are authorized by this handoff itself.

Review verdict: **fix the open findings before signing off on spec compliance**. This document records findings; it does not claim fixes or browser acceptance.
