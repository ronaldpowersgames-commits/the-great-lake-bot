(function(root) {
  const MAX_FILE = 50 * 1024 * 1024;
  const MAX_TOTAL = 100 * 1024 * 1024;
  async function unpack(JSZip, bytes) {
    if (bytes.byteLength > MAX_FILE) throw new Error('ZIP files must be 50MB or smaller.');
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    if (entries.length > 21) throw new Error('Import up to 20 TXT parts per ZIP.');
    if (entries.some(entry => !/\.txt$/i.test(entry.name) && entry.name !== 'transcript-manifest.json')) throw new Error('Transcript ZIPs may contain only TXT parts and transcript-manifest.json.');
    const parts = entries.filter(entry => /\.txt$/i.test(entry.name)).sort((a,b) => a.name.localeCompare(b.name,undefined,{numeric:true}));
    if (!parts.length || parts.length > 20) throw new Error('This ZIP must contain 1 to 20 TXT parts.');
    let total = 0;
    const files = [];
    for (const entry of parts) {
      const chunks = []; let size = 0;
      await new Promise((resolve,reject) => {
        const stream = entry.internalStream('uint8array');
        stream.on('data',chunk => {
          size += chunk.length; total += chunk.length;
          if (size > 120000 || total > MAX_TOTAL) {stream.pause();reject(new Error('Expanded TXT part is too large. Use Transcript Splitter to create parts of 30,000 characters or less.'));return;}
          chunks.push(chunk);
        }).on('error',reject).on('end',resolve).resume();
      });
      const data = new Uint8Array(size);let offset = 0;
      for (const chunk of chunks) {data.set(chunk,offset);offset += chunk.length;}
      const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);
      if (text.length > 30000) throw new Error('A TXT part exceeds 30,000 characters. Split it into smaller parts first.');
      const name = entry.name.split('/').at(-1).replace(/[\\:*?"<>|]/g,'_');
      if (files.some(file => file.name === name)) throw new Error('ZIP part filenames must be unique.');
      files.push({name,data});
    }
    return files;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {unpack};
  else root.LakeTranscriptArchive = {unpack};
})(typeof window === 'undefined' ? globalThis : window);
