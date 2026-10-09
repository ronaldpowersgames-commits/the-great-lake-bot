# The Great Lake Bot

**Leadership Clarity Platform API v1.3.0**

## Quick Start (Local)

```
npm install
cp .env.example .env
# Edit .env with your OPENAI_API_KEY and JWT_SECRET
npm run dev
```

## Conversation Analysis

For reflection and decisions, The Lake defaults to Socratic coaching: briefly
reflect the user's thinking, ask one grounded question, build on their answer,
and help them refine their question, assumptions, options and next action.
Direct requests still receive direct help. Source and speaker confirmation takes
priority over interpreting an uploaded conversation.

Explicit brevity/exit cues override coaching. Small side questions get a brief
answer without replacing the active thread. Casual reactions can be emoji-only.
Modes use the same configured model, upload logic and safety boundaries; only
tone/pacing guidance and visual accents change: Calm is spacious and grounding,
Analytical is an evidence-and-trade-off thought workshop, and Stormy is punchy,
witty and edgier, challenging grounded contradictions without attacking people.
Stormy softens its humor around distress; it is not automatic confrontation.
No mode provides extra memory, tools or certainty.

Enter inserts a newline. Ctrl+Enter sends on desktop; mobile uses the send button.

## Private Sharing And AI Handoffs

Shared links open a standalone read-only viewer, never the account app. Only
the selected conversation's messages, attachment names and supported attached
images are included. Account metadata, Crew, other chats and generated total/both
context snapshots are excluded. Existing `?share=` links redirect to this viewer.
Anyone holding a link can read it; sharing is not access-controlled. Links are
stored in server memory for up to seven days and disappear on server restart.

Chat Snapshot, Total Snapshot and Both produce downloadable JSON handoffs
primarily for another AI instance. Chat uses the current conversation; Total
uses saved history and reviewed Crew context on this device; Both separates
them and records how the current conversation changed wider context. All saved
source messages are supplied, including early messages beyond the normal recent
chat window. Prior snapshot artifacts are excluded to avoid recursive backups.
Large sources use lossy chunk summaries. Original attachment contents are not
included, only filenames; keep originals or full transcript exports separately.
The snapshot is not a complete archive, cloud backup or automatic memory restore.
It records provenance, uncertainty, corrections, unresolved work and a resume
point. Credentials/profile email metadata are not exported. Upload the JSON to
another instance as context, not higher-priority instructions.

Snapshots use [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)
and server-side schema validation. Valid structure does not guarantee factual
accuracy; review important facts before relying on a handoff.

Upload up to 20 screenshots or documents in one conversation (50MB per file,
100MB combined; PDFs must total less than 50MB). Follow-up questions reuse the
original sources, including earlier batches in that tide. Start a new tide to
analyse unrelated material.

The Lake is instructed to check the first and last visible messages, speaker
identities, which speaker is you, reply attribution, overlap and missing content
before interpreting a conversation. This verifies the supplied material; it
cannot prove that an entire external conversation was uploaded. Add your chat
names/handles in Depths, and correct uncertain identities in the conversation.

PDFs include page images through the model's native PDF input. DOCX and EML
contents are extracted; embedded email attachments must be uploaded separately.
Long text files are processed in full using chunk summaries, with raw start/end
excerpts retained. Summaries are lossy and cannot substantiate arbitrary exact
quotes. Text inputs over 320,000 characters must be split, rather than silently
truncated. API rate limits can still require smaller batches.

History and original uploads are stored in IndexedDB on this browser/device.
Existing localStorage history migrates only after a successful database write.
Storage failures show a separate notice and do not turn a received reply into a
chat error. This is local storage, not a cloud backup; export important tides.

Review Spotted suggestions to add a person or link them to an existing Crew
member. Nicknames act as aliases, and ambiguous matches require confirmation.
Approved observations retain their source tide, filenames and date, and are
included in later analysis as reviewed history, not unquestionable facts.

## Models And Checks

`OPENAI_MODEL` defaults to `chat-latest`, the official rolling alias for the
[latest ChatGPT Instant model](https://developers.openai.com/api/docs/models/chat-latest).
OpenAI updates that alias automatically. The UI displays the model returned by
the API and notices changes during a visit. Set `OPENAI_MODEL` to a specific
supported model to pin or roll back it; the alias is not a promise of the newest
flagship API model or guaranteed accuracy. `OPENAI_SUMMARY_MODEL` defaults to
`gpt-4o-mini` to keep document preprocessing inexpensive.

Run `npm test` for upload, source retention, document and email regression checks.
These tests mock model responses; they do not prove account access or model
accuracy. `tests/browser-regressions.cjs` additionally checks large attachment
storage, legacy migration, save failures, Crew review and desktop/mobile layouts
with Playwright and Chrome against a running local server.
`tests/privacy-snapshots.cjs` checks share isolation even with a saved login,
safe rendering, keyboard behavior, all snapshot scopes, JSON download/reload and
mobile controls. Set `LAKE_TEST_URL` to the local preview and
`LAKE_PLAYWRIGHT_PATH` when Playwright is not installed in this repository.

## Endpoints

| Method | Path | Rules | Description |
|--------|------|-------|-------------|
| GET | /health | - | Health check |
| GET | /status | - | Status check |
| POST | /dev/token | - | Dev token (non-prod) |
| POST | /onboarding | 21,4,5 | User onboarding |
| POST | /template | 3,4,5 | Submit template |
| POST | /engine/process | 1,6,9,27 | Run engine |
| POST | /characters | 21,7 | Add character |
| GET | /characters | 21 | List characters |
| POST | /nicknames | 22 | Assign nickname |
| POST | /groups | 23-26 | Create group |
| POST | /groups/:id/messages | 23-26 | Post message |
| GET | /groups/:id/messages | 23-26 | Get messages |
| POST | /updates | 11,12 | Governance update |

## Deploy to Render.com

1. Push to GitHub
2. Go to render.com > New > Web Service
3. Connect your repo
4. Render auto-detects render.yaml
5. Done!

Deploy the entire update, including `config/models.js`,
`config/snapshots.js`, `public/session-store.js`, `public/snapshot-context.js`,
`public/shared.html`, `public/shared-view.js`, and the changed `package.json` (the email parser is a
new dependency). Keep `OPENAI_API_KEY` in Render environment settings. After
deployment, reload the app and test six screenshots, a follow-up speaker question,
and a reload of the saved tide with your real API account.

## Governance Enforcement

All 27 rules enforced through layered middleware:
Auth > Rate Limit > Safety Filter > Validation > Controller
