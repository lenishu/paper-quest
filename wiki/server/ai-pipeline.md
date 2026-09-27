# AI pipeline — llm.js, prompts.js, graphUtil.js

Everything between "user clicked analyze/learn" and "valid graph/lesson on disk".

## server/llm.js — provider adapter
`callLLM(settings, messages, {json, maxTokens})` resolves the **active
connection** (`store.activeConnection`) and dispatches by the provider's `kind`
(from `store.PROVIDERS`): `openai` / `openrouter` / `anthropic` / `gemini`, all
via global `fetch`, `TIMEOUT_MS = 240000`. The `openai` kind serves OpenAI **and** any
OpenAI-compatible endpoint (Groq, Zhipu GLM, custom) — same function, the
connection's `baseUrl` (or the provider default) picks the host, and only real
OpenAI uses `max_completion_tokens` (others use `max_tokens`). On a 400 it
recovers by swapping the token param or dropping `response_format` (JSON mode).
The `openrouter` kind is OpenAI-shaped plus two extras: it sends
`reasoning: {enabled, effort}` when the connection asks for it, and it forwards
each assistant message's `reasoning_details` **unmodified**, so a reasoning model
resumes its thinking across turns (used by the lesson Q&A thread). It drops
`response_format`/`reasoning` and retries if the model rejects them.
The `gemini` kind sends the key in the `x-goog-api-key` header, never in the
URL. That is Google's documented auth, and it covers both `AQ.` auth keys and
older `AIza` standard keys. It also strips a saved `/v1beta` from the root and
a `models/` prefix from the model. `/api/settings/test` reports the model
that answered (`store.activeModel`).
`callLLMRaw` is the variant that returns `{text, message}` — callers continuing a
thread need `message.reasoning_details`; `callLLM` is the text-only wrapper.
`parseModelJSON(text)` strips fences/prose and parses the model's JSON (never
`JSON.parse` raw output). Models in JSON mode, Gemini especially, write LaTeX
with one backslash: `$A^\dagger$` is invalid JSON, and `$\frac{1}{2}$` or
`$\theta$` would parse as a form feed or tab. `escapeLatexBackslashes` runs
first: it doubles backslashes that can't be JSON escapes, and reads `\b` `\f`
(anywhere) or `\n` `\r` `\t` (inside `$…$`, `$$…$$`, `\(…\)`, `\[…\]`) as LaTeX
when a command from `LATEX_ESCAPE_CLASH` follows. Real newlines/tabs stay, and
correct JSON passes through unchanged (tests: `server/llm.test.js`).
`httpError` also lives here.
**Change here when:** adding a provider *kind* (register metadata in
`store.PROVIDERS`), changing timeouts/token limits, fixing response parsing.
Providers/keys are a list of connections — see [storage.md](storage.md).

## server/prompts.js — all prompt text
- `BASELINE` — the learner persona: competition-level high-school student.
  Tier calibration flows from this (matrix multiplication = novice). Changing
  it shifts every tier judgment.
- `truncateDoc(md, head=45000, tail=8000)` — how much paper reaches the model.
- `GRAPH_SCHEMA` / `GRAPH_EXAMPLE` / `GRAPH_RULES` — strict-JSON contract,
  few-shot example (Transformer paper), and graph-thinking rules shared by both
  graph prompts.
- `conceptExtractionMessages(paperMd, paperName)` — first paper in a project.
- `conceptMergeMessages(existingNodes, paperMd, paperName)` — later papers;
  must preserve existing node ids while weaving new concepts in.
- `lessonMessages({node, masteredNames, paperTitles, field, usageText})` —
  lesson + quiz generation; consumes the node's `usage` text from the paper.
- `lessonAskMessages({node, lesson, chat, question, mode, paperTitles, field})` —
  follow-up Q&A on an open refresher. Returns strict JSON
  `{question (paraphrase), answer (markdown), sources[]}`; prior turns are
  replayed as real user/assistant messages so reasoning carries forward.
  `mode: 'source'` swaps the final user turn for a provenance request.
**Change here when:** output quality/shape issues, persona/difficulty tuning.
Keep the mandatory-fields language (tier/branch/prereqs/usage) — sanitize
depends on it.

## server/graphUtil.js — pure functions, tested (graphUtil.test.js)
Pipeline order in the analyze route:
`sanitizeGraph(raw)` (drop junk, coerce fields, `slugify` ids, `inferBranch`
via `BRANCH_KEYWORDS`) → `isDegenerate(nodes)` (too few/disconnected ⇒ one
retry with the same prompt) → `repairGraph(nodes)` (backstop: guarantees a
connected, layered DAG whatever the model returned) → `computeDepths`.
Also: `computeStates(nodes, masteredIds)` → locked/ready/learning/mastered;
`xpForNode(node, skipped)`; `levelInfo(xp)` + `TITLES`; `effectiveTier`,
`isAdvanced`.
**Change here when:** graph shape/tier/state/XP logic. Add a test in
`graphUtil.test.js` (`node --test server/`) — these are the only tested functions.

## The analyze route (in server/index.js) ties it together
read md → `hasGraph ? conceptMergeMessages : conceptExtractionMessages`
(+ project memory from `store.readMemory`) → `callLLM` → `parseModelJSON` →
sanitize/retry/repair as above → `saveNodesSnapshot` (undo) → `saveProject` →
`logEvent` + `logAudit`.

## Reliability contract (do not weaken)
Prompt asks for strict JSON with mandatory fields → one retry if degenerate →
`repairGraph` ALWAYS yields a usable DAG. The UI assumes analyze never
produces a broken graph.
