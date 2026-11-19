(function () {
  const element = id => document.getElementById(id);
  const status = text => { element('export-status').textContent = text; };
  const id = new URLSearchParams(location.search).get('id');
  let data;
  try {
    if (id?.startsWith('lake-transcript-')) data = JSON.parse(localStorage.getItem(id));
  } catch {}
  if (!data?.messages?.length || Date.now() - data.created > 86400000) {
    element('meta').textContent = 'Transcript unavailable. Return to The Lake and export it again.';
    return;
  }

  const title = data.title || 'Session Transcript';
  const filename = LakeExportNames.sessionTranscript('pdf', data.created, title);
  function inlineRuns(text) {
    const pattern = /(`[^`\n]+`|\*\*[^\n]+?\*\*|__[^\n]+?__|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w))/g;
    return text.split(pattern).map((value,index) => {
      if (index % 2 === 0) return { text:value };
      const tag = value.startsWith('`') ? 'code' : /^\*\*|^__/.test(value) ? 'strong' : 'em';
      const edge = tag === 'strong' ? 2 : 1;
      return { text:value.slice(edge,-edge), tag };
    });
  }
  function transcriptBlocks(text) {
    const blocks = [];
    let code = null;
    for (const line of String(text || '').split(/\r?\n/)) {
      if (/^\s*```/.test(line)) {
        if (code) code = null;
        else { code = { kind:'code', lines:[] }; blocks.push(code); }
        continue;
      }
      if (code) { code.lines.push(line); continue; }
      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      const item = line.match(/^\s*(\d+[.)]|[-*•])\s+(.+)$/);
      const check = (item?.[2] || line).match(/^\s*(\[[ xX]\]|[☐☑✅])\s+(.+)$/);
      const quote = line.match(/^\s*>\s?(.*)$/);
      if (heading) blocks.push({ kind:'heading', level:Math.min(4,heading[1].length+1), text:heading[2] });
      else if (/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) blocks.push({ kind:'rule' });
      else if (check) blocks.push({ kind:'check', checked:/[xX☑✅]/.test(check[1]), text:check[2] });
      else if (item) blocks.push({ kind:/^\d/.test(item[1])?'ordered':'bullet', marker:item[1], text:item[2] });
      else if (quote) blocks.push({ kind:'quote', text:quote[1] });
      else if (!line.trim()) { if (blocks.at(-1)?.kind !== 'gap') blocks.push({ kind:'gap' }); }
      else if (blocks.at(-1)?.kind === 'paragraph') blocks.at(-1).text += '\n' + line;
      else blocks.push({ kind:'paragraph', text:line });
    }
    return blocks;
  }
  function appendFormatted(target, blocks) {
    let list;
    for (const block of blocks) {
      const { kind } = block;
      if (kind === 'gap') { list = null; continue; }
      if (kind === 'rule') { list = null; target.append(document.createElement('hr')); continue; }
      const listTag = kind === 'ordered' ? 'ol' : ['bullet','check'].includes(kind) ? 'ul' : '';
      if (listTag && list?.localName !== listTag) {
        list = document.createElement(listTag);
        target.append(list);
      }
      if (!listTag) list = null;
      const node = document.createElement(listTag?'li':kind==='heading'?'h'+block.level:kind==='code'?'pre':kind==='quote'?'blockquote':'p');
      if (kind === 'ordered') node.value = parseInt(block.marker,10);
      if (kind === 'check') { node.className = 'check-item'; node.append(block.checked?'☑ ':'☐ '); }
      if (kind === 'code') node.textContent = block.lines.join('\n');
      else for (const run of inlineRuns(block.text)) {
        if (run.tag) {
          const span = document.createElement(run.tag);
          span.textContent = run.text;
          node.append(span);
        } else node.append(run.text);
      }
      (list || target).append(node);
    }
  }
  const formatted = data.messages.map(message => transcriptBlocks(message.text));
  document.title = title + ' · The Great Lake';
  element('title').textContent = title;
  element('meta').textContent = data.exported + ' · PDF transcript';
  for (const [index,message] of data.messages.entries()) {
    const article = document.createElement('article');
    article.className = 'msg';
    const sender = document.createElement('div');
    sender.className = 'sender ' + (message.role === 'user' ? 'user' : 'lake');
    sender.textContent = [message.sender, message.time].filter(Boolean).join(' · ');
    const text = document.createElement('div');
    text.className = 'text';
    appendFormatted(text, formatted[index]);
    article.append(sender, text);
    element('messages').append(article);
  }
  element('tools').hidden = false;

  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      status(label + ' copied.');
    } catch {
      const field = element('manual-copy');
      field.hidden = false;
      field.value = value;
      field.focus();
      field.select();
      status('Select and copy the ' + label.toLowerCase() + ' from the field.');
    }
  }
  const history = data.messages.filter(message => !message.privateSnapshot).map(message => ({
    role: message.role === 'user' ? 'user' : 'assistant', content: message.text, time: message.time
  }));
  const copyLink = element('copy-link');
  copyLink.hidden = data.localOnly || !history.length ||
    !data.messages.every(message => typeof message.privateSnapshot === 'boolean');
  let shareUrl;
  copyLink.onclick = async () => {
    if (shareUrl) return copy(shareUrl, 'Transcript link');
    if (!confirm('Create a read-only transcript link? Anyone with the link can read the shared text. Private account snapshots and attachments are excluded. The link stays active until the server restarts.')) return;
    copyLink.disabled = true;
    try {
      const response = await fetch('/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: { name: title, history } })
      });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error('Share link unavailable');
      shareUrl = new URL('/shared.html?id=' + encodeURIComponent(result.id), location.origin).href;
      await copy(shareUrl, 'Transcript link');
    } catch {
      status('Could not create a transcript link. You can still copy the text or share the PDF.');
    } finally {
      copyLink.disabled = false;
    }
  };

  const share = element('share-pdf');
  const download = element('download-pdf');
  status('Preparing PDF…');
  setTimeout(() => {
    try {
      const doc = LakeTranscriptPdf.build({ title, exported:data.exported, messages:data.messages, blocks:formatted, inlineRuns });
      const pages = doc.getNumberOfPages();
      const pdf = new File([doc.output('blob')], filename, { type: 'application/pdf' });
      element('meta').textContent += ' · ' + pages + (pages === 1 ? ' page' : ' pages') +
        ' · ' + Math.max(1, Math.round(pdf.size / 1024)) + ' KB';
      download.disabled = false;
      download.onclick = () => {
        const url = URL.createObjectURL(pdf);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = pdf.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      };
      const payload = { files: [pdf] };
      if (navigator.share && navigator.canShare?.(payload)) {
        share.disabled = false;
        share.onclick = async () => {
          share.disabled = true;
          try {
            await navigator.share({ ...payload, title });
          } catch (error) {
            if (error.name !== 'AbortError') {
              status('Could not share the PDF. Try again, or download the PDF to attach it manually.');
            }
          } finally {
            share.disabled = false;
          }
        };
        status('');
      } else {
        status('This browser cannot share PDF attachments directly. You can copy, download, or print the PDF.');
      }
      const copyPdf = element('copy-pdf');
      copyPdf.disabled = false;
      copyPdf.onclick = async () => {
        if (!navigator.clipboard?.write || !window.ClipboardItem) {
          status('This browser cannot copy PDF files. Use Download PDF to attach it manually.');
          return;
        }
        const supported = type => typeof ClipboardItem.supports !== 'function' || ClipboardItem.supports(type);
        const types = ['application/pdf', 'web application/pdf'].filter(supported);
        for (const type of types) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ [type]: pdf })]);
            status('PDF copied. Paste it into a compatible app.');
            return;
          } catch {}
        }
        status('This browser blocked PDF clipboard access. Use Download PDF to attach it manually.');
      };
    } catch {
      status('Could not prepare a PDF file. You can still print this preview.');
    }
  }, 0);
})();
