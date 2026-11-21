(function () {
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
    // Build elements and text nodes without interpreting message content as HTML.
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
  window.LakeTranscriptFormat = { inlineRuns, transcriptBlocks, appendFormatted };
})();
