# Meeting Studio companion tool

The settings menu now links to `/meeting-studio/`, beside Transcript Splitter.
The static editor processes files in the visitor's browser: it does not send recordings or transcripts to the Lake's hosted server. IndexedDB keeps editable projects on that browser's origin. Downloads are portable backups; browser storage is not a substitute for backups.

The standalone local processor is separate from the Lake's cloud-hosted server. It listens only on 127.0.0.1, accepts only its own page's Origin, and holds the model-download token in memory. Open its local page to run transcription. Do not put the processor or its `.data`, `.runtime`, or `.venv` directories on the hosted Lake server.

Local project on Ronald's computer:
`C:\Users\ronpo\.codex\visualizations\2026\11\02\01a19e65-8c89-7de2-98cd-66a07b163e2e\meeting-studio`

Run `Start-Meeting-Studio.cmd` there. Local tools have been installed. Accept the pyannote Community-1 model access conditions in the user's own Hugging Face account, then enter a read token in **Process locally → One-time model access**. Recordings are processed locally; downloading model files requires internet access.

The Lake export produces a ZIP with parts of up to 29,000 characters. Use one part per request, leaving approximately 1,000 characters for the question. This does not change the Lake's existing 30,000-character total request limit.

Current implementation: recording playback; editable transcripts; speaker renaming and reassignment; split/merge turns; review flags; search/replace; undo/redo; local autosave; TXT, Markdown, DOCX, PDF, CSV, JSON, SRT, VTT, and Lake ZIP exports. A separate local worker combines a whole-recording speaker pass with checkpointed ASR chunks. Recognition quality and 90+ minute runtime have not yet been validated on representative meetings. Voice enrollment, video-based speaker evidence, live capture, and cloud inference are future work.

These changes are prepared in local source. They are not deployed to the live Lake app.
