(function(root) {
  function split(text, size = 12000) {
    if (!Number.isInteger(size) || size < 1000 || size > 30000) throw new Error('Choose 1,000 to 30,000 characters per part.');
    const parts = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const newline = text.lastIndexOf('\n', end - 1);
        if (newline >= start + size / 2) end = newline + 1;
        // Keep CRLF and surrogate pairs together without losing characters.
        if (text[end - 1] === '\r' && text[end] === '\n') end--;
        const previous = text.charCodeAt(end - 1);
        const next = text.charCodeAt(end);
        if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
      }
      parts.push({start, end, text:text.slice(start,end)});
      start = end;
    }
    return parts;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {split};
  else root.LakeTranscriptSplitter = {split};
})(typeof window === 'undefined' ? globalThis : window);
