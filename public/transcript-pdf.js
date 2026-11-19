(function () {
  function build({ title, exported, messages, blocks, inlineRuns }) {
    const doc = new window.jspdf.jsPDF({ unit:'pt', format:'a4', compress:true });
    const { width, height } = doc.internal.pageSize;
    const colors = {
      background:'#0a1628', panel:'#0d1f3c', border:'#1e3a5f',
      text:'#c8dff0', dim:'#80a4c2', lake:'#5bc4f5', user:'#4a9eff'
    };
    const margin = 34;
    const inset = 13;
    const pageBottom = height - margin;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const glyphImages = new Map();
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;
    const graphemes = text => segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
    // Use PDF text where the built-in font supports it and the browser's fonts for other glyphs.
    const winAnsi = /^[\x20-\x7e\xa0-\xff€‘’“”–—…•™ŒœŠšŽžŸ]+$/u;
    const fontFor = (family, style, size) =>
      (style.includes('bold') ? 'bold ' : '') + (style.includes('italic') ? 'italic ' : '') +
      size + 'px ' + (family === 'courier' ? 'monospace' : 'Arial') + ', "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    let y;
    let card;

    function paintPage() {
      doc.setFillColor(colors.background);
      doc.rect(0, 0, width, height, 'F');
      y = margin;
    }
    function paintCard() {
      if (!card?.draw.length) return;
      doc.setFillColor(colors.panel);
      doc.setDrawColor(colors.border);
      doc.setLineWidth(.7);
      doc.roundedRect(margin, card.top, width - 2 * margin, y - card.top + 8, 8, 8, 'FD');
      for (const paint of card.draw) paint();
    }
    function room(space) {
      if (y + space <= pageBottom) return;
      paintCard();
      doc.addPage();
      paintPage();
      if (card) {
        card = { top:y, draw:[] };
        y += 10;
      }
    }
    function paint(draw) {
      if (card) card.draw.push(draw);
      else draw();
    }
    function rule(x, right) {
      const top = y + 4;
      paint(() => {
        doc.setDrawColor(colors.border);
        doc.setLineWidth(.7);
        doc.line(x, top, right, top);
      });
      y += 10;
    }

    function writeRuns(runs, { size=11, color=colors.text, x=margin, right=width-margin, bold=false }={}) {
      const lineHeight = size * 1.48;
      const maxWidth = right - x;
      let line = [];
      let used = 0;
      let spaces = [];

      function makePart(text, family, style, raster = false) {
        doc.setFont(family, style);
        doc.setFontSize(size);
        const font = fontFor(family, style, size);
        ctx.font = font;
        const partWidth = raster ? ctx.measureText(text).width : doc.getTextWidth(text);
        return { text, family, style, font, raster, width:partWidth };
      }
      function drawPart(part, left, baseline) {
        if (!part.raster) {
          doc.setFont(part.family, part.style);
          doc.setFontSize(size);
          doc.setTextColor(color);
          doc.text(part.text, left, baseline);
          return;
        }
        const pad = 2;
        const key = JSON.stringify([part.font, color, part.text]);
        let glyph = glyphImages.get(key);
        if (!glyph) {
          const scale = 3;
          canvas.width = Math.ceil((part.width + 2 * pad) * scale);
          canvas.height = Math.ceil(size * 1.6 * scale);
          ctx.scale(scale, scale);
          ctx.font = part.font;
          ctx.fillStyle = color;
          ctx.fillText(part.text, pad, size * 1.18);
          glyph = { image:canvas.toDataURL('image/png'), width:canvas.width / scale, height:canvas.height / scale };
          glyphImages.set(key, glyph);
        }
        doc.addImage(glyph.image, 'PNG', left - pad, baseline - size * 1.18, glyph.width, glyph.height);
      }
      function flush() {
        room(lineHeight + (card ? 8 : 0));
        const parts = line;
        const baseline = y + size;
        paint(() => {
          let left = x;
          for (const part of parts) {
            if (part.text.trim()) drawPart(part, left, baseline);
            left += part.width;
          }
        });
        y += lineHeight;
        line = [];
        used = 0;
        spaces = [];
      }
      function append(parts) {
        for (const part of parts) {
          const previous = line.at(-1);
          if (!part.raster && previous && !previous.raster &&
              part.family === previous.family && part.style === previous.style) {
            previous.text += part.text;
            previous.width += part.width;
          } else line.push({ ...part });
          used += part.width;
        }
      }
      function splitWord(word, family, style) {
        if (winAnsi.test(word)) return [makePart(word, family, style)];
        const groups = [];
        for (const glyph of graphemes(word)) {
          const raster = !winAnsi.test(glyph);
          const last = groups.at(-1);
          if (last?.raster === raster) last.text += glyph;
          else groups.push({ text:glyph, raster });
        }
        return groups.map(({ text, raster }) => makePart(text, family, style, raster));
      }
      for (const run of runs) {
        const family = run.tag === 'code' ? 'courier' : 'helvetica';
        const style = run.tag === 'em' ? (bold ? 'bolditalic' : 'italic') :
          (bold || run.tag === 'strong' ? 'bold' : 'normal');
        for (const word of String(run.text ?? '').replace(/\t/g, '    ').match(/\n|[^\S\n]+|\S+/g) || []) {
          if (word === '\n') { flush(); continue; }
          if (!word.trim()) { spaces.push(makePart(word, family, style)); continue; }
          const parts = splitWord(word, family, style);
          const tokenWidth = parts.reduce((sum, part) => sum + part.width, 0);
          const spaceWidth = spaces.reduce((sum, part) => sum + part.width, 0);
          if (used && used + spaceWidth + tokenWidth > maxWidth) flush();
          if (used || family === 'courier') append(spaces);
          spaces = [];
          if (tokenWidth <= maxWidth) { append(parts); continue; }
          for (const glyph of graphemes(word)) {
            const part = makePart(glyph, family, style, !winAnsi.test(glyph));
            if (used && used + part.width > maxWidth) flush();
            append([part]);
          }
        }
      }
      flush();
    }

    paintPage();
    writeRuns([{ text:title }], { size:23, bold:true, color:colors.lake });
    rule(margin, width - margin);
    writeRuns([{ text:exported }], { size:9, color:colors.dim });
    y += 14;
    for (const [index, message] of messages.entries()) {
      const messageBlocks = blocks[index];
      const first = messageBlocks.find(block => block.kind !== 'gap');
      room(first?.kind === 'heading' ? 83 : 56);
      writeRuns([{ text:[message.sender, message.time].filter(Boolean).join(' · ') }],
        { size:10, bold:true, color:message.role === 'user' ? colors.user : colors.lake });
      y += 3;
      card = { top:y, draw:[] };
      y += 10;
      const left = margin + inset;
      const right = width - left;
      for (const [blockIndex, block] of messageBlocks.entries()) {
        const { kind } = block;
        if (kind === 'gap') { y += 4; continue; }
        if (kind === 'rule') {
          let next = messageBlocks[blockIndex + 1];
          if (next?.kind === 'gap') next = messageBlocks[blockIndex + 2];
          room(next?.kind === 'heading' ? 64 : 22);
          rule(left, right);
          continue;
        }
        if (kind === 'heading') {
          room(50);
          y += 4;
          writeRuns(inlineRuns(block.text), { x:left, right, size:17-block.level, bold:true, color:colors.lake });
          y += 3;
          continue;
        }
        if (kind === 'code') {
          writeRuns([{ text:block.lines.join('\n'), tag:'code' }], { x:left+8, right, size:10 });
          continue;
        }
        const marker = { ordered:block.marker, bullet:'•', check:block.checked ? '☑' : '☐' }[kind];
        const textLeft = marker || kind === 'quote' ? left + Math.max(16, (marker?.length || 0) * 6 + 4) : left;
        if (marker) {
          room(41);
          const top = y;
          writeRuns([{ text:marker }], { x:left, right });
          y = top;
        }
        writeRuns(inlineRuns(block.text), { x:textLeft, right });
      }
      paintCard();
      card = null;
      y += 18;
    }
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(colors.dim);
      doc.text(page + ' / ' + pages, width - margin, height - 17, { align:'right' });
    }
    doc.setProperties({ title });
    return doc;
  }
  window.LakeTranscriptPdf = { build };
})();
