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
  const { inlineRuns, transcriptBlocks, appendFormatted } = LakeTranscriptFormat;
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
