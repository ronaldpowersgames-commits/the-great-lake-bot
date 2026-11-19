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
      const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const margin = 52;
      const { width, height } = doc.internal.pageSize;
      let y = margin;
      let unsupportedText = false;
      function printableText(text) {
        // Helvetica in PDF supports WinAnsi. The print preview keeps the original text.
        return text.replace(/[^\x20-\x7e\xa0-\xff\r\n\t€‘’“”–—…•™ŒœŠšŽžŸ]/gu, () => {
          unsupportedText = true;
          return '?';
        }).replace(/\t/g, '    ');
      }
      function room(extra=0) {
        if (y+extra > height-margin) { doc.addPage(); y=margin; }
      }
      function writeRuns(runs, {size=11, color='#172033', indent=0, bold=false}={}) {
        doc.setFontSize(size);
        doc.setTextColor(color);
        const maxWidth=width-2*margin-indent;
        let line=[], used=0, space='';
        const font=(family,style)=>doc.setFont(family,style);
        const flush=()=>{
          room();
          let x=margin+indent;
          for (const part of line) {
            font(part.family,part.style);
            doc.text(part.text,x,y);
            x+=doc.getTextWidth(part.text);
          }
          y+=size*1.45;
          line=[];used=0;space='';
        };
        for (const run of runs) {
          const family=run.tag==='code'?'courier':'helvetica';
          const style=run.tag==='em'?(bold?'bolditalic':'italic'):bold || run.tag==='strong'?'bold':'normal';
          for (const word of printableText(run.text).match(/\n|[^\S\n]+|\S+/g) || []) {
            if (word==='\n') { flush(); continue; }
            if (!word.trim()) { space+=word; continue; }
            font(family,style);
            const tokenWidth=doc.getTextWidth(word);
            if (used && used+doc.getTextWidth(space)+tokenWidth>maxWidth) { flush(); font(family,style); }
            const parts=tokenWidth>maxWidth?doc.splitTextToSize(word,maxWidth):[word];
            for (const [i,part] of parts.entries()) {
              const text=(used || family==='courier'?space:'')+part;
              const previous=line.at(-1);
              if (previous?.family===family && previous.style===style) previous.text+=text;
              else line.push({family,style,text});
              used+=doc.getTextWidth(text);
              space='';
              if (i<parts.length-1) { flush(); font(family,style); }
            }
          }
        }
        flush();
      }
      writeRuns([{text:title}], {size:21,bold:true,color:'#123650'});
      writeRuns([{text:data.exported}], {size:10,color:'#536880'});
      for (const [index,message] of data.messages.entries()) {
        y += 14;
        room(36);
        writeRuns([{text:[message.sender, message.time].filter(Boolean).join(' · ')}], {size:10,bold:true,color:'#075985'});
        for (const block of formatted[index]) {
          const {kind}=block;
          if (kind==='gap') { y+=6; continue; }
          if (kind==='rule') { room(12); doc.setDrawColor('#cbd8e5'); doc.line(margin,y-2,width-margin,y-2); y+=8; continue; }
          if (kind==='heading') {
            y+=5;
            room(30);
            writeRuns(inlineRuns(block.text), {size:17-block.level,bold:true,color:'#123650'});
            continue;
          }
          if (kind==='code') {
            writeRuns([{text:block.lines.join('\n'),tag:'code'}], {size:10,indent:12});
            continue;
          }
          const marker=kind==='ordered'?block.marker+' ':kind==='bullet'?'• ':kind==='check'?(block.checked?'[x] ':'[ ] '):'';
          writeRuns([{text:marker},...inlineRuns(block.text)], {indent:marker || kind==='quote'?12:0});
        }
      }
      const pages = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.setTextColor('#536880');
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.text(page + ' / ' + pages, width - margin, height - 25, { align: 'right' });
      }
      const pdf = new File([doc.output('blob')], filename, { type: 'application/pdf' });
      element('meta').textContent += ' · ' + pages + (pages === 1 ? ' page' : ' pages') +
        ' · ' + Math.max(1, Math.round(pdf.size / 1024)) + ' KB';
      const fontNotice = unsupportedText ? 'Use Print to preserve characters outside the PDF font.' : '';
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
        status(fontNotice);
      } else {
        status('This browser cannot share PDF attachments directly. You can copy, download, or print the PDF. ' + fontNotice);
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
