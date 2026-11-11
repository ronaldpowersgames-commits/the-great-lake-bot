/*
 * ASPIRATIONAL PROTOTYPE — retained for future Studio exploration.
 * This is not a mature core-chat feature or a settled product design. Preserve the
 * useful generation, canvas and library learnings, but expect its eventual Studio
 * implementation and interaction model to be substantially different.
 */
(() => {
  const editor = document.getElementById('postCardEditor');
  const form = editor.querySelector('form');
  const canvas = editor.querySelector('canvas');
  const status = editor.querySelector('[role=status]');
  const nav = editor.querySelector('[data-post-nav]');
  const position = editor.querySelector('[data-slide-position]');
  const fields = ['title', 'message', 'insight', 'closing', 'theme', 'format'];
  const formats = { square: 1080, portrait: 1350, story: 1920 };
  const palettes = {
    deep: { top: '#071a2c', bottom: '#079bd2', ink: '#f7fbff', soft: '#b9e8fb', line: '#4cc9f0' },
    still: { top: '#09233a', bottom: '#17688d', ink: '#f7fbff', soft: '#c7eaf8', line: '#72d5ef' },
    dawn: { top: '#18243b', bottom: '#bd7657', ink: '#fffaf2', soft: '#ffe1c9', line: '#ffc58f' }
  };
  let drafts = [];
  let active = 0;
  let saveDraft;
  let sourceText = '';
  let revision = 0;
  let file;

  function enableHorizontalScroll(rail) {
    if (!rail || rail.dataset.horizontalRail === 'true') return;
    rail.dataset.horizontalRail = 'true';
    let drag = null;
    let suppressClick = false;
    rail.addEventListener('wheel', event => {
      if (rail.scrollWidth <= rail.clientWidth + 2) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      rail.scrollLeft += delta;
    }, { passive: false });
    rail.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      suppressClick = false;
      drag = { id: event.pointerId, x: event.clientX, left: rail.scrollLeft, moved: false };
    });
    rail.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const delta = event.clientX - drag.x;
      if (Math.abs(delta) <= 5 && !drag.moved) return;
      drag.moved = true;
      rail.setPointerCapture?.(event.pointerId);
      rail.classList.add('is-dragging');
      rail.scrollLeft = drag.left - delta;
      event.preventDefault();
    });
    const finish = event => {
      if (!drag || (event && drag.id !== event.pointerId)) return;
      suppressClick = drag.moved;
      drag = null;
      rail.classList.remove('is-dragging');
    };
    rail.addEventListener('pointerup', finish);
    rail.addEventListener('pointercancel', finish);
    rail.addEventListener('click', event => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  editor.querySelectorAll('.post-editor-nav,.post-editor-refinements,.post-editor-platforms').forEach(enableHorizontalScroll);

  function wrap(ctx, text, width) {
    const lines = [];
    let line = '';
    for (const word of String(text).trim().split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function fitLines(ctx, text, width, maxLines, startSize, weight = 750) {
    for (let size = startSize; size >= startSize * .64; size -= 2) {
      ctx.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
      const lines = wrap(ctx, text, width);
      if (lines.length <= maxLines) return { size, lines };
    }
    const size = startSize * .64;
    ctx.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    const lines = wrap(ctx, text, width).slice(0, maxLines);
    const last = lines.length - 1;
    while (last >= 0 && ctx.measureText(lines[last] + '…').width > width) lines[last] = lines[last].replace(/\s+\S+$/, '');
    if (last >= 0) lines[last] += '…';
    return { size, lines };
  }

  function drawTextLines(ctx, lines, x, y, leading) {
    for (const line of lines) { ctx.fillText(line, x, y); y += leading; }
    return y;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, width, height, radius) : ctx.rect(x, y, width, height);
  }

  function draw(card, target = canvas, slideIndex = active) {
    target.width = 1080;
    target.height = formats[card.format] || formats.portrait;
    const { width, height } = target;
    const ctx = target.getContext('2d');
    const p = palettes[card.theme] || palettes.deep;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, p.top); gradient.addColorStop(1, p.bottom);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.globalAlpha = .24; ctx.strokeStyle = p.line; ctx.lineWidth = 3;
    const rippleY = height * .55;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(width * .56, rippleY, 120 + i * 95, 34 + i * 29, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();

    const x = 82, maxWidth = width - x * 2;
    ctx.textBaseline = 'top'; ctx.fillStyle = p.ink;
    ctx.font = '800 31px system-ui, sans-serif'; ctx.fillText('🌊  THE GREAT LAKE', x, 68);
    ctx.fillStyle = p.soft; ctx.font = '600 17px system-ui, sans-serif'; ctx.fillText('CALM SURFACE · DEEP INTELLIGENCE', x + 55, 108);
    ctx.strokeStyle = p.line; ctx.lineWidth = 2; ctx.strokeRect(x, 164, 232, 38);
    ctx.font = '700 15px system-ui, sans-serif'; ctx.fillText('A THOUGHT FROM THE DEEP', x + 16, 174);

    const headline = fitLines(ctx, card.title, maxWidth, card.format === 'story' ? 4 : 3, card.format === 'square' ? 62 : 70, 820);
    ctx.fillStyle = p.ink; ctx.font = `820 ${headline.size}px system-ui, sans-serif`;
    let y = drawTextLines(ctx, headline.lines, x, 235, headline.size * 1.08) + 28;
    const blocks = [card.message, card.insight, card.closing].filter(Boolean);
    const footerY = height - 112;
    const available = footerY - y - 30;
    const boxed = blocks.length === 3 && available > 360;
    if (boxed) y += Math.max(0, Math.min(130, (available - (Math.min(170, available / 3 - 12) + 12) * 3) / 2));
    blocks.forEach((text, index) => {
      const blockHeight = boxed ? Math.min(170, available / 3 - 12) : available / blocks.length;
      if (boxed) {
        ctx.fillStyle = 'rgba(4,24,42,.48)'; ctx.strokeStyle = p.line; ctx.lineWidth = 2;
        roundRect(ctx, x, y, maxWidth, blockHeight, 18); ctx.fill(); ctx.stroke();
        ctx.fillStyle = p.line; ctx.beginPath(); ctx.arc(x + 38, y + 40, 21, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.top; ctx.font = '800 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(index + 1), x + 38, y + 27); ctx.textAlign = 'left';
      }
      const tx = boxed ? x + 78 : x;
      const tw = boxed ? maxWidth - 110 : maxWidth;
      const fitted = fitLines(ctx, text, tw, boxed ? 3 : 4, boxed ? 31 : 36, index === 2 ? 760 : 560);
      ctx.fillStyle = index === 2 ? p.ink : p.soft;
      ctx.font = `${index === 2 ? 760 : 560} ${fitted.size}px system-ui, sans-serif`;
      drawTextLines(ctx, fitted.lines, tx, y + (boxed ? 26 : 0), fitted.size * 1.2);
      y += blockHeight + (boxed ? 12 : 8);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(x, footerY - 20); ctx.lineTo(width - x, footerY - 20); ctx.stroke();
    ctx.fillStyle = p.soft; ctx.font = '600 16px system-ui, sans-serif'; ctx.fillText('DIVE DEEPER AT', x, footerY);
    ctx.fillStyle = p.ink; ctx.font = '750 21px system-ui, sans-serif'; ctx.fillText('🔗 the-great-lake-bot.onrender.com', x, footerY + 28);
    ctx.textAlign = 'right'; ctx.fillStyle = p.soft; ctx.font = '500 15px system-ui, sans-serif'; ctx.fillText(`THE GREAT LAKE  ·  ${slideIndex + 1}/${drafts.length}`, width - x, footerY + 31); ctx.textAlign = 'left';
    return true;
  }

  function readDraft() { return Object.fromEntries(fields.map(field => [field, form.elements[field].value.trim()])); }
  function disableExports() { file = null; for (const button of form.querySelectorAll('[data-post-export]')) button.disabled = true; }
  function rebuildNav() {
    position.textContent = `Slide ${active + 1} of ${drafts.length}`;
    editor.querySelector('[data-slide-prev]').disabled = active === 0;
    editor.querySelector('[data-slide-next]').disabled = active === drafts.length - 1;
    nav.replaceChildren(...drafts.map((draft, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `${index + 1} · ${draft.title.slice(0, 24)}`;
      button.setAttribute('aria-current', String(index === active)); button.onclick = () => showDraft(index); return button;
    }));
  }

  async function preview() {
    const token = ++revision;
    drafts[active] = readDraft(); disableExports();
    if (!form.checkValidity() || fields.some(field => !drafts[active][field])) { canvas.hidden = true; status.textContent = 'Complete the slide fields to preview and export.'; return; }
    draw(drafts[active]); canvas.hidden = false; rebuildNav();
    canvas.toBlob(blob => {
      if (!blob || token !== revision) return;
      file = new File([blob], `great-lake-slide-${active + 1}.png`, { type: 'image/png' });
      for (const button of form.querySelectorAll('[data-post-export]')) button.disabled = false;
      form.elements.share.disabled = !navigator.share || !navigator.canShare?.({ files: [file] });
      status.textContent = drafts.length > 1 ? `Slide ${active + 1} of ${drafts.length}. Edit only what improves it.` : 'Ready to share.';
    }, 'image/png');
  }

  function showDraft(index) {
    if (drafts[active] && form.elements.title.value) drafts[active] = readDraft();
    active = Math.max(0, Math.min(drafts.length - 1, index));
    for (const field of fields) form.elements[field].value = drafts[active][field] || (field === 'format' ? 'portrait' : field === 'theme' ? 'deep' : '');
    rebuildNav(); void preview();
  }

  function open(cards, onSave, options = {}) {
    drafts = cards.map(card => ({ theme: 'deep', format: 'portrait', ...card })); active = 0; saveDraft = onSave; sourceText = options.source || '';
    form.elements.count.value = drafts.length; form.elements.optimizeFor.value = options.optimizeFor || 'curiosity';
    showDraft(0); if (!editor.open) editor.showModal();
  }

  async function makeFiles() {
    drafts[active] = readDraft(); const files = [];
    for (let index = 0; index < drafts.length; index++) {
      const offscreen = document.createElement('canvas'); draw(drafts[index], offscreen, index);
      const blob = await new Promise(resolve => offscreen.toBlob(resolve, 'image/png'));
      files.push(new File([blob], `great-lake-carousel-${String(index + 1).padStart(2, '0')}.png`, { type: 'image/png' }));
    }
    return files;
  }

  function downloadFiles(files) {
    files.forEach((download, index) => setTimeout(() => {
      const url = URL.createObjectURL(download); const link = document.createElement('a'); link.href = url; link.download = download.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, index * 180));
  }

  async function shareFiles(platform = '') {
    const files = await makeFiles();
    const text = `${drafts[0].title}\n\nJump into The Lake: https://the-great-lake-bot.onrender.com/`;
    if (navigator.share && navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: drafts[0].title, text }); return; } catch (error) { if (error.name === 'AbortError') return; }
    }
    const lake = encodeURIComponent('https://the-great-lake-bot.onrender.com/');
    const urls = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${lake}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${lake}`, x: `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
      threads: `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`
    };
    downloadFiles(files);
    if (urls[platform]) window.open(urls[platform], '_blank', 'noopener');
    else { await navigator.clipboard?.writeText(text); status.textContent = 'Images downloaded and Lake link copied. Attach them in the destination app.'; }
  }

  form.addEventListener('input', event => { if (!['count', 'optimizeFor'].includes(event.target.name)) void preview(); });
  form.elements.count.addEventListener('change',()=>{
    const count=Math.max(1,Math.min(10,Number(form.elements.count.value)||drafts.length));
    form.elements.count.value=count;
    if(count===drafts.length)return;
    status.textContent=`Building a ${count}-slide narrative…`;
    window.generatePostCards?.(sourceText,count,form.elements.optimizeFor.value,'Walk the reader through one connected point across exactly this many slides.');
  });
  editor.querySelector('[data-slide-prev]').onclick=()=>showDraft(active-1);
  editor.querySelector('[data-slide-next]').onclick=()=>showDraft(active+1);
  editor.addEventListener('close', () => { ++revision; disableExports(); drafts = []; });
  form.elements.save.onclick = () => {
    drafts[active] = readDraft(); let saved = 0;
    drafts.forEach((draft, index) => { if (saveDraft({ ...draft }, index)) saved++; });
    status.textContent = saved === drafts.length ? `Saved ${saved} slide${saved === 1 ? '' : 's'} to Post Imagery.` : 'Some slides could not be saved on this device.';
  };
  form.elements.download.onclick = () => downloadFiles([file]);
  form.elements.downloadAll.onclick = async () => downloadFiles(await makeFiles());
  form.elements.share.onclick = () => shareFiles();
  form.elements.applyMood.onclick = () => {
    drafts[active] = readDraft();
    const theme=drafts[active].theme;drafts=drafts.map(draft=>({...draft,theme}));
    status.textContent=`Applied ${form.elements.theme.selectedOptions[0].textContent} to all ${drafts.length} slides.`;
    rebuildNav();void preview();
  };
  form.elements.regenerate.onclick = () => window.generatePostCards?.(sourceText, Number(form.elements.count.value), form.elements.optimizeFor.value);
  editor.querySelectorAll('[data-refine]').forEach(button => button.onclick = () => window.generatePostCards?.(
    drafts.map(card => [card.title, card.message, card.insight, card.closing].join('\n')).join('\n\n'),
    Number(form.elements.count.value), form.elements.optimizeFor.value, button.dataset.refine));
  editor.querySelectorAll('[data-platform]').forEach(button => button.onclick = () => shareFiles(button.dataset.platform));
  window.LakePostCards = { open };
})();
