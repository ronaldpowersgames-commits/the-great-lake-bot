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
  const transcript = [title, 'Exported ' + data.exported, ...data.messages.map(message =>
    [message.sender, message.time].filter(Boolean).join(' · ') + '\n' + message.text
  )].join('\n\n');
  document.title = title + ' · The Great Lake';
  element('title').textContent = title;
  element('meta').textContent = data.exported + ' · PDF transcript';
  for (const message of data.messages) {
    const article = document.createElement('article');
    article.className = 'msg';
    const sender = document.createElement('div');
    sender.className = 'sender ' + (message.role === 'user' ? 'user' : 'lake');
    sender.textContent = [message.sender, message.time].filter(Boolean).join(' · ');
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = message.text;
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
    if (!confirm('Create a read-only transcript link? Anyone with the link can read the shared text. Private account snapshots and attachments are excluded. The link lasts up to seven days or until the server restarts.')) return;
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
      function write(text, size, bold, color) {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor(color);
        // Helvetica in PDF supports WinAnsi. The print preview keeps the original text.
        const printable = text.replace(/[^\x20-\x7e\xa0-\xff\r\n\t€‘’“”–—…•™ŒœŠšŽžŸ]/gu, () => {
          unsupportedText = true;
          return '?';
        }).replace(/\t/g, '    ');
        for (const line of doc.splitTextToSize(printable, width - 2 * margin)) {
          if (y > height - margin) { doc.addPage(); y = margin; }
          doc.text(line, margin, y);
          y += size * 1.45;
        }
      }
      write(title, 21, true, '#123650');
      write(data.exported, 10, false, '#536880');
      for (const message of data.messages) {
        y += 14;
        write([message.sender, message.time].filter(Boolean).join(' · '), 10, true, '#075985');
        write(message.text, 11, false, '#172033');
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
