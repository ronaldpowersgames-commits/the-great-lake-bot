/* Lake McDonald artwork by GlacierNPS, public domain.
 * Dawn: https://commons.wikimedia.org/wiki/File:Sunrise_at_Lake_McDonald_(50248930332).jpg
 * Twilight: https://commons.wikimedia.org/wiki/File:Hazy_Sunset_from_Lake_McDonald_(20669265221).jpg
 */
(() => {
  const editor = document.getElementById('postCardEditor');
  const form = editor.querySelector('form');
  const canvas = editor.querySelector('canvas');
  const status = editor.querySelector('[role=status]');
  const fields = ['title', 'message', 'insight', 'closing', 'theme', 'artwork', 'format'];
  const formats = { square: 1080, portrait: 1350, story: 1920 };
  const artworks = {};
  let drafts = [];
  let active = 0;
  let saveDraft;
  let revision = 0;
  let file;

  function artwork(name) {
    if (!artworks[name]) {
      const image = new Image();
      image.src = '/post-card-' + name + '.webp';
      artworks[name] = image.decode().then(() => image).catch(() => null);
    }
    return artworks[name];
  }

  function wrap(ctx, text, width) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (ctx.measureText(word).width > width) return null;
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function draw(card, image) {
    canvas.width = 1080;
    canvas.height = formats[card.format];
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    const twilight = card.artwork === 'twilight';
    const background = twilight ? '#101e28' : '#112723';
    const accent = twilight ? '#eed0a0' : '#c7d7a9';
    const x = 84;
    const photoHeight = Math.round(height * .34);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    if (image) {
      const cropHeight = Math.min(image.height, image.width * photoHeight / width);
      const cropWidth = cropHeight * width / photoHeight;
      ctx.drawImage(image, (image.width - cropWidth) / 2, (image.height - cropHeight) * .48,
        cropWidth, cropHeight, 0, 0, width, photoHeight);
      const shade = ctx.createLinearGradient(0, photoHeight * .5, 0, photoHeight);
      shade.addColorStop(0, 'transparent');
      shade.addColorStop(1, background);
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, photoHeight);
    }
    const blocks = [
      { text: card.title, size: 73, color: '#fff8e9', family: 'Georgia, serif' },
      { text: card.message, size: 39, color: '#fff8e9', family: 'Georgia, serif' },
      { text: card.insight, size: 29, color: '#e0e9e2', family: 'system-ui, sans-serif' },
      { text: card.closing, size: 30, color: accent, family: 'Georgia, serif' }
    ];
    const start = photoHeight + 39;
    const end = height - 111;
    for (let scale = 1; scale >= .65; scale -= .05) {
      const layout = blocks.map(block => {
        const font = Math.round(block.size * scale) + 'px ' + block.family;
        ctx.font = font;
        return { ...block, font, lines: wrap(ctx, block.text, width - x * 2), leading: block.size * scale * 1.24 };
      });
      if (layout.some(block => !block.lines)) continue;
      const contentHeight = layout.reduce((sum, block) => sum + block.lines.length * block.leading + 20, 0);
      if (start + contentHeight > end) continue;
      let y = start + (end - start - contentHeight) * .28;
      ctx.textBaseline = 'top';
      ctx.fillStyle = accent;
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillText(card.theme.toUpperCase(), x, y - 31, width - x * 2);
      for (const block of layout) {
        ctx.font = block.font;
        ctx.fillStyle = block.color;
        for (const line of block.lines) {
          ctx.fillText(line, x, y);
          y += block.leading;
        }
        y += 20;
      }
      ctx.fillStyle = accent;
      ctx.fillRect(x, height - 88, 50, 2);
      ctx.font = '600 21px system-ui, sans-serif';
      ctx.fillText('THE GREAT LAKE', x, height - 66);
      return true;
    }
    return false;
  }

  function readDraft() {
    return Object.fromEntries(fields.map(field => [field, form.elements[field].value.trim()]));
  }

  function disableExports() {
    file = null;
    for (const button of form.querySelectorAll('[data-post-export]')) button.disabled = true;
  }

  async function preview() {
    const token = ++revision;
    const draft = drafts[active] = readDraft();
    disableExports();
    if (!form.checkValidity() || fields.some(field => !draft[field])) {
      canvas.hidden = true;
      status.textContent = 'Complete all card fields to preview and export.';
      return;
    }
    const image = await artwork(draft.artwork);
    if (token !== revision) return;
    const fits = draw(draft, image);
    canvas.hidden = !fits;
    if (!fits) {
      status.textContent = 'Shorten the copy or choose a taller layout.';
      return;
    }
    status.textContent = image ? '' : 'The photo could not load. The card uses a solid background.';
    form.elements.save.disabled = false;
    canvas.toBlob(blob => {
      if (!blob || token !== revision) return;
      file = new File([blob], 'great-lake-post-card-' + draft.format + '.png', { type: 'image/png' });
      form.elements.download.disabled = false;
      form.elements.share.disabled = !navigator.share || !navigator.canShare?.({ files: [file] });
      if (form.elements.share.disabled && !status.textContent) status.textContent = 'Use Download PNG to share this card from your device.';
    }, 'image/png');
  }

  function showDraft(index) {
    active = index;
    for (const field of fields) form.elements[field].value = drafts[index][field];
    void preview();
  }

  function open(cards, onSave) {
    drafts = cards.map(card => ({ artwork: 'dawn', format: 'portrait', ...card }));
    saveDraft = onSave;
    const picker = form.elements.draft;
    picker.replaceChildren(...drafts.map((_card, index) => new Option('Card ' + (index + 1), index)));
    picker.value = '0';
    picker.parentElement.hidden = drafts.length === 1;
    showDraft(0);
    if (!editor.open) editor.showModal();
  }

  form.addEventListener('input', event => {
    if (event.target === form.elements.draft) showDraft(Number(event.target.value));
    else void preview();
  });
  editor.addEventListener('close', () => { ++revision; disableExports(); drafts = []; });
  form.elements.save.onclick = () => {
    status.textContent = saveDraft({ ...drafts[active] }, active)
      ? 'Saved to Post Cards.' : 'Could not save this card on this device.';
  };
  form.elements.download.onclick = () => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  form.elements.share.onclick = async () => {
    try {
      await navigator.share({ files: [file], title: drafts[active].title });
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Could not share the card. Use Download PNG.';
    }
  };
  window.LakePostCards = { open };
})();
