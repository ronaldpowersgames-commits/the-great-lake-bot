const fileInput = document.getElementById('file');
const textInput = document.getElementById('text');
const status = document.getElementById('status');
const list = document.getElementById('parts');
let filename = 'transcript.txt';
let manifest;
let exportEntries = [];
let loadSequence = 0;
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text],{type}));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function invalidate() {list.replaceChildren();manifest = null;exportEntries = [];document.getElementById('manifest').hidden = true;document.getElementById('zip').hidden = true;status.textContent = '';}
textInput.addEventListener('input',invalidate);
document.getElementById('size').addEventListener('input',invalidate);
async function loadFile(file) {
  if (!file) return;
  const sequence = ++loadSequence;
  invalidate();
  const splitButton = document.getElementById('split');
  if (!file.name.toLowerCase().endsWith('.txt')) {splitButton.disabled = false;status.textContent = 'Choose one UTF-8 TXT transcript.';return;}
  splitButton.disabled = true;
  try {
    // A strict decode avoids replacing invalid bytes with altered transcript text.
    const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
    if (sequence !== loadSequence) return;
    filename = file.name;
    textInput.value = text;
    // Textareas normalize newlines; retain the original file text separately.
    textInput.originalText = text;
    status.textContent = `Loaded locally: ${file.name}`;
  } catch {if(sequence === loadSequence) status.textContent = 'Could not read this file as UTF-8. Export a UTF-8 TXT transcript and try again.';}
  finally {if(sequence === loadSequence) splitButton.disabled = false;}
}
fileInput.addEventListener('change',() => loadFile(fileInput.files[0]));
const dropZone = document.querySelector('main');
const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
document.addEventListener('dragover',event => {if(isFileDrag(event))event.preventDefault();});
document.addEventListener('drop',event => {
  if(isFileDrag(event))event.preventDefault();
  dropZone.classList.remove('file-drag-over');
});
dropZone.addEventListener('dragover',event => {
  if(!isFileDrag(event))return;
  event.preventDefault();event.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('file-drag-over');
});
dropZone.addEventListener('dragleave',event => {if(!dropZone.contains(event.relatedTarget))dropZone.classList.remove('file-drag-over');});
dropZone.addEventListener('drop',event => {
  if(!isFileDrag(event))return;
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files);
  if(files.length !== 1) {status.textContent = 'Drop one TXT transcript at a time.';return;}
  if(files[0].name.toLowerCase().endsWith('.txt')) {
    try {fileInput.files = event.dataTransfer.files;} catch { /* The loaded filename remains visible in status on browsers with read-only file inputs. */ }
  }
  loadFile(files[0]);
});
textInput.addEventListener('input',() => {textInput.originalText = null;});
document.getElementById('split').addEventListener('click',() => {
  invalidate();
  try {
    const text = textInput.originalText ?? textInput.value;
    if (!text.length) {status.textContent = 'Choose a transcript first.';return;}
    const size = Number(document.getElementById('size').value);
    const parts = LakeTranscriptSplitter.split(text,size);
    if (parts.map(part => part.text).join('') !== text) throw new Error('Verification failed. No parts exported.');
    const stem = filename.replace(/\.txt$/i,'').replace(/[\\/:*?"<>|]/g,'_').trim() || 'transcript';
    const digits = Math.max(3,String(parts.length).length);
    const entries = parts.map((part,index) => ({...part,filename:`${stem}-part-${String(index+1).padStart(digits,'0')}-of-${String(parts.length).padStart(digits,'0')}.txt`}));
    exportEntries = entries;
    manifest = {format:'lake-verbatim-transcript/1',filename,total_characters:text.length,part_count:parts.length,target_characters:size,character_unit:'UTF-16 code units',lossless:true,parts:entries.map(({text,...part}) => part)};
    for (const [index,part] of entries.entries()) {
      const row = document.createElement('div');row.className = 'part';
      const label = document.createElement('span');label.textContent = `Part ${index+1} of ${parts.length} · ${part.text.length.toLocaleString()} characters`;
      const button = document.createElement('button');button.textContent = 'Download TXT';
      button.onclick = () => download(part.filename,part.text,'text/plain;charset=utf-8');
      row.append(label,button);list.append(row);
    }
    document.getElementById('manifest').hidden = false;
    document.getElementById('zip').hidden = false;
    status.textContent = `${text.length.toLocaleString()} characters in ${parts.length} parts. Exact reconstruction verified.`;
  } catch(error) {status.textContent = error.message;}
});
document.getElementById('manifest').onclick = () => {if(manifest)download('transcript-manifest.json',JSON.stringify(manifest,null,2),'application/json');};
document.getElementById('zip').onclick = async () => {
  if (!manifest || !exportEntries.length) return;
  const button = document.getElementById('zip');
  button.disabled = true;
  button.setAttribute('aria-busy','true');
  try {
    const zip = new JSZip();
    for (const part of exportEntries) zip.file(part.filename,part.text);
    zip.file('transcript-manifest.json',JSON.stringify(manifest,null,2));
    const name = manifest.filename.replace(/\.txt$/i,'').replace(/[\\/:*?"<>|]/g,'_').trim() || 'transcript';
    const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    download(`${name}-parts.zip`,blob,'application/zip');
  } catch(error) {status.textContent = 'ZIP download failed: ' + error.message;}
  finally {button.disabled = false;button.removeAttribute('aria-busy');}
};
