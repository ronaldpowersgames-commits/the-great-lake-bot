const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const names=require('../public/export-names');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const splitter=fs.readFileSync(path.join(root,'public','transcript-splitter-ui.js'),'utf8');
const printPage=fs.readFileSync(path.join(root,'public','transcript-print.html'),'utf8');

test('Lake exports share one clear sortable naming convention',()=>{
  const date=new Date(2026,10,6,12,0,0);
  assert.equal(names.sessionTranscript('txt',date),'the-great-lake-session-transcript-2026-11-06.txt');
  assert.equal(names.sessionTranscript('pdf',date,'Patterns Across Chats'),'the-great-lake-session-transcript-patterns-across-chats-2026-11-06.pdf');
  assert.equal(names.sessionTranscript('pdf',date),'the-great-lake-session-transcript-2026-11-06.pdf');
  assert.equal(names.aiHandoff('both',date),'the-great-lake-ai-handoff-both-2026-11-06.json');
  assert.equal(names.fullBackup(date),'the-great-lake-full-backup-2026-11-06.json');
});

test('transcript split files preserve a safe source label under the Lake prefix',()=>{
  assert.equal(names.transcriptPart('Weekly UA Sync.txt',1,3),'the-great-lake-transcript-weekly-ua-sync-part-001-of-003.txt');
  assert.equal(names.transcriptIndex('Weekly UA Sync.txt'),'the-great-lake-transcript-weekly-ua-sync-part-index.json');
  assert.equal(names.transcriptZip('Weekly UA Sync.txt'),'the-great-lake-transcript-weekly-ua-sync-parts.zip');
  assert.equal(names.transcriptPart('../../🔥.txt',2,12),'the-great-lake-transcript-transcript-part-002-of-012.txt');
});

test('every main Lake download path uses the shared naming helper',()=>{
  assert.match(index,/LakeExportNames\.aiHandoff/);
  assert.match(index,/LakeExportNames\.fullBackup/);
  assert.match(index,/LakeExportNames\.sessionTranscript\('txt',undefined,currentExportTitle\(\)\)/);
  assert.match(splitter,/LakeExportNames\.transcriptPart/);
  assert.match(splitter,/LakeExportNames\.transcriptIndex/);
  assert.match(splitter,/LakeExportNames\.transcriptZip/);
  assert.match(printPage,/LakeExportNames\.sessionTranscript\('pdf'/);
  assert.doesNotMatch(index,/download = `lake-/);
  assert.doesNotMatch(index,/download = 'lake-session-/);
});
