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
Ordinary document analysis sends original extracted text, never automatic
summaries. The total selected text plus the message is limited to 30,000
characters per request; oversized batches are explicitly rejected. Use Settings
> Transcript Splitter to produce lossless TXT parts (29,000 characters by default,
preferring line boundaries). Parts concatenate exactly to the original UTF-8
source, including blank lines and CRLF. A manifest records offsets and part order.
Drop a UTF-8 TXT file onto the splitter or choose it with the file picker. The
default leaves about 1,000 characters for the question; select one part at a time.
The optional "Part Index" download is the manifest, not additional source text.
"Download All ZIP" saves all numbered TXT parts and their index together. ZIP
creation stays in the browser; the transcript is not uploaded to make the archive.
The same ZIP can be dropped or attached in chat: up to 20 UTF-8 TXT parts are
unpacked locally, the first is active, and other/previous sources are paused.
All imported parts are saved with the message; Sources selects originals for
later questions. Archives with other file types, duplicate filenames, oversized
parts or invalid text are rejected rather than partially imported. Transcript
discussions guide users to this workflow when relevant without repeated tutorials.

## Meeting Currents

The Meeting Currents button searches original TXT/LOG attachments in the current
profile's saved device history, including inactive source parts. This is an
explicit archive search; ordinary chat requests still send only selected files.
Keywords and reviewed Crew aliases select verbatim passages with filenames,
source IDs and character ranges. Broad queries sample dated passages across
meetings. Duplicate identical uploads are not independent evidence. Coverage and
source-chat links accompany the result; the model does not receive the whole
archive at once. This is lexical retrieval, not exhaustive semantic analysis,
automatic commitment tracking, account-wide cloud memory or proof of model accuracy.

Meeting dates are parsed from transcript filenames (ISO dates, unambiguous numeric
dates and English month names). Ambiguous dates remain unresolved, and Sources
allows a user-reviewed date correction. Call dates stay separate from upload and
observation timestamps. Named transcript speaker labels create Spotted suggestions
with dated original evidence. Review a fuzzy match against the existing Crew
directory to save its label as an alias; no identities are silently merged.
Date corrections, reviewed observations and aliases survive full backups and
are included in applicable snapshot handoffs. Crew-card questions use archived
transcript evidence when available.
Use Sources beside Snapshot to include/exclude previously attached originals
for the next question without deleting them. Not every stored part is in model
context at once, and earlier assistant analysis is not exact transcript evidence.
API token/rate limits can still require smaller batches.

History and original uploads are stored in IndexedDB on this browser/device.
Desktop files can be dropped onto the composer or selected with the attachment
button; both paths enforce the same 20-file and 50MB-per-file limits.
Existing localStorage history migrates only after a successful database write.
Storage failures show a separate notice and do not turn a received reply into a
chat error. This is local storage, not a cloud backup; export important tides.

AI snapshot-export chunk summaries retry output-limit failures with bounded larger
budgets. Completed summaries are reused for identical sources and processing
purpose for up to ten minutes in a bounded server-memory cache. Failed or
incomplete summaries are never cached or passed off as complete source coverage.

Settings includes **Export Full Data + Transfer Prompt**: a private JSON archive
of all conversations, original stored attachments, Crew, profile and settings
available for the current profile on this device. It is not an AI summary and
does not truncate history. The included transfer prompt guides another AI through
the archive; import/automatic restoration is not implemented. Keep exports private.

Switching moods preserves the conversation ID, history, uploads and Crew context.
Normal model requests still use a bounded recent-message window. Replies arriving
after navigation are saved to their originating chat, with a tappable reply-ready
notice; deleting an in-progress chat does not resurrect it when the reply arrives.

Review Spotted suggestions to add a person or link them to an existing Crew
member. Nicknames act as aliases, and ambiguous matches require confirmation.
Approved observations retain their source tide, filenames and date, and are
included in later analysis as reviewed history, not unquestionable facts.

## Tides And Crew Organization

Transcript chats default to the original TXT/LOG filename, without splitter part
suffixes. Manually renamed chats keep their names. Past Tides supports nested
folders, chat moves, and search by folder, filename or chat text. These are virtual
folders inside the app, not changes to Windows folders. Removing a folder moves
its chats and subfolders to its parent; it does not delete their contents.

Drag the separator between Past Tides and Crew to resize their sidebar space.
Touch dragging and keyboard arrow keys work too; the split is saved per profile.
Double-click the separator to restore its default split.

The bottom cog opens Crew management, with a Settings tab alongside it. Edit
roles, nicknames/aliases and notes, or hide a member from the sidebar. Hidden
members remain available to analysis and backups. Connecting duplicate members
requires explicit confirmation and preserves aliases, notes and dated evidence;
original transcript speaker labels are unchanged. Full backups include folders,
Crew visibility and roles, and the sidebar split.

## Prompt Types

The welcome carousel has seven Types: Social, Still Waters, Internal, Podcast
Style, Parent, Learn and Hypnotist. Each has twelve quick prompts in two vertically
scrolling, snap-aligned groups of six. Swipe horizontally or use the labelled dots
to choose a Type. Every second group includes Use This Type, a practical usage
guide. Long-press a prompt to save that Type as the welcome default.

Types choose starting prompts; they do not select separate models, clear chat
context or replace the Calm/Analytical/Stormy response style. Learn includes quiz
and flashcard generation in chat, not automatic flashcard storage. Hypnotist
supports educational explanations and voluntary scripts, with consent, stop
options, clear endings and no clinical or guaranteed-effect claims.

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
`tests/conversation-continuity.cjs` checks mood continuity, delayed replies,
cross-profile isolation, deleted in-progress chats and full-data downloads.
`tests/transcript-splitter.cjs` checks lossless UTF-8 part downloads, mobile
layout and persistent source selection without deleting original attachments.
`tests/meeting-memory.cjs` checks date corrections, fuzzy speaker review, alias
linking, dated cross-meeting retrieval, profile isolation and source navigation.
`tests/library-organization.cjs` checks transcript titles, manual names, nested
folders, safe folder removal, Crew management, backups, profile isolation and
mouse/touch/keyboard sidebar resizing.
`tests/prompt-types.cjs` checks all seven Types, twelve prompts each, usage-guide
actions, new-session resets, wheel/touch group scrolling and mobile layouts.

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
