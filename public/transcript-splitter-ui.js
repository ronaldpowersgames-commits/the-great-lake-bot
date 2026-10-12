const fileInput = document.getElementById('file');
const textInput = document.getElementById('text');
const status = document.getElementById('status');
const list = document.getElementById('parts');
let filename = 'transcript.txt';
let manifest;
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text],{type}));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function invalidate() {list.replaceChildren();manifest = null;document.getElementById('manifest').hidden = true;status.textContent = '';}
textInput.addEventListener('input',invalidate);
document.getElementById('size').addEventListener('input',invalidate);
fileInput.addEventListener('change',async () => {
  invalidate();
  const file = fileInput.files[0];
  if (!file) return;
  const splitButton = document.getElementById('split');
  splitButton.disabled = true;
  try {
    // A strict decode avoids replacing invalid bytes with altered transcript text.
    textInput.value = '';
    const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
    filename = file.name;
    textInput.value = text;
    // Textareas normalize newlines; retain the original file text separately.
    textInput.originalText = text;
    status.textContent = 'File loaded locally.';
  } catch {textInput.originalText = null;status.textContent = 'Could not read this file as UTF-8. Export a UTF-8 TXT transcript and try again.';}
  finally {splitButton.disabled = false;}
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
    const stem = filename.replace(/\.txt$/i,'');
    const entries = parts.map((part,index) => ({...part,filename:`${stem}-part-${String(index+1).padStart(3,'0')}-of-${String(parts.length).padStart(3,'0')}.txt`}));
    manifest = {format:'lake-verbatim-transcript/1',filename,total_characters:text.length,part_count:parts.length,target_characters:size,character_unit:'UTF-16 code units',lossless:true,parts:entries.map(({text,...part}) => part)};
    for (const [index,part] of entries.entries()) {
      const row = document.createElement('div');row.className = 'part';
      const label = document.createElement('span');label.textContent = `Part ${index+1} of ${parts.length} · ${part.text.length.toLocaleString()} characters`;
      const button = document.createElement('button');button.textContent = 'Download TXT';
      button.onclick = () => download(part.filename,part.text,'text/plain;charset=utf-8');
      row.append(label,button);list.append(row);
    }
    document.getElementById('manifest').hidden = false;
    status.textContent = `${text.length.toLocaleString()} characters in ${parts.length} parts. Exact reconstruction verified.`;
  } catch(error) {status.textContent = error.message;}
});
document.getElementById('manifest').onclick = () => {if(manifest)download('transcript-manifest.json',JSON.stringify(manifest,null,2),'application/json');};
