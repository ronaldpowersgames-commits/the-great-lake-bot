(function () {
  const get = id => document.getElementById(id);
  const dialog = get('lakeAudioDialog');
  const player = get('lakeExportPlayer');
  const voice = get('lakeAudioVoice');
  const speedInput = get('lakeAudioSpeed');
  const make = get('generateLakeAudio');
  const status = get('lakeAudioStatus');
  const actions = get('lakeAudioActions');
  const share = get('shareLakeAudio');
  const restore = get('fileAudioRestore');
  const limit = 4000;
  const maxLength = 40000;
  let source, request, file, fileUrl, keepPlaying = false;

  function split(text) {
    const parts = [];
    while (text.length > limit) {
      const head = text.slice(0, limit);
      let end = head.lastIndexOf('\n');
      if (end < limit / 2) end = head.lastIndexOf(' ');
      if (end < limit / 2) end = limit;
      if (/[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end--;
      parts.push(text.slice(0, end).trim());
      text = text.slice(end).trimStart();
    }
    if (text) parts.push(text);
    return parts;
  }

  function wav(parts) {
    const bytes = parts.reduce((total, part) => total + part.byteLength, 0);
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const label = (offset, value) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
    label(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); label(8, 'WAVE');
    label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    label(36, 'data'); view.setUint32(40, bytes, true);
    return [header, ...parts];
  }

  function clearFile() {
    player.pause();
    player.removeAttribute('src');
    player.load();
    player.hidden = actions.hidden = restore.hidden = true;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = file = null;
  }

  function open({ title, text, speed, parent }) {
    text = text.trim();
    if (!text) { showToast('Choose some text to turn into audio first.'); return; }
    request?.abort();
    request = null;
    clearFile();
    source = { title, text, parent };
    get('lakeAudioScope').textContent = title;
    speedInput.value = speed;
    try { voice.value = localStorage.getItem(storageKey('exportAudioVoice')) || 'marin'; } catch {}
    if (!voice.value) voice.value = 'marin';
    make.disabled = text.length > maxLength;
    voice.disabled = speedInput.disabled = false;
    status.textContent = make.disabled
      ? 'This selection is too long for one audio file. Choose up to 40,000 characters using Tide excerpts.'
      : '';
    if (!dialog.open) dialog.showModal();
  }

  make.onclick = async () => {
    if (!source || request || source.text.length > maxLength || !speedInput.reportValidity()) return;
    clearFile();
    const task = new AbortController();
    request = task;
    const parts = split(source.text);
    const multi = parts.length > 1;
    const format = multi ? 'pcm' : 'mp3';
    const extension = multi ? 'wav' : 'mp3';
    const type = multi ? 'audio/wav' : 'audio/mpeg';
    const speed = Number(speedInput.value);
    const selectedVoice = voice.value;
    try { localStorage.setItem(storageKey('exportAudioVoice'), selectedVoice); } catch {}
    make.disabled = voice.disabled = speedInput.disabled = true;
    try {
      const audio = [];
      for (const [index,text] of parts.entries()) {
        status.textContent = multi ? 'Generating part ' + (index + 1) + ' of ' + parts.length + '…' : 'Generating audio…';
        const response = await fetch('/audio', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ text, voice:selectedVoice, speed, format }), signal:task.signal
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not generate audio.');
        const segment = await response.arrayBuffer();
        if (!segment.byteLength || (multi && segment.byteLength % 2)) throw new Error('The voice service returned incomplete audio.');
        audio.push(segment);
      }
      if (request !== task) return;
      file = new File(multi ? wav(audio) : audio, LakeExportNames.artifact(source.title + '-audio', extension), { type });
      fileUrl = URL.createObjectURL(file);
      player.src = fileUrl;
      player.hidden = actions.hidden = false;
      try { share.hidden = !(navigator.share && navigator.canShare?.({ files:[file] })); }
      catch { share.hidden = true; }
      status.textContent = extension.toUpperCase() + ' ready · ' + selectedVoice + ' · ' + speed + '×';
    } catch (error) {
      if (request === task && error.name !== 'AbortError') status.textContent = error.message;
    } finally {
      if (request === task) {
        request = null;
        make.disabled = voice.disabled = speedInput.disabled = false;
      }
    }
  };

  player.addEventListener('play', () => {
    stopSpeech();
    if (navigator.mediaSession && typeof MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new MediaMetadata({ title:'The Great Lake', artist:'Lake audio' });
    }
  });
  get('downloadLakeAudio').onclick = () => {
    if (!file) return;
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = file.name;
    link.click();
  };
  share.onclick = async () => {
    if (!file) return;
    try { await navigator.share({ title:'The Great Lake · Audio', files:[file] }); }
    catch (error) { if (error.name !== 'AbortError') status.textContent = 'Use Download audio to attach the file manually.'; }
  };
  get('backgroundLakeAudio').onclick = async () => {
    try {
      await player.play();
      if (!dialog.open) return;
      keepPlaying = true;
      dialog.close();
      source.parent?.close();
      source.parent = null;
      restore.hidden = false;
    } catch { status.textContent = 'Press Play to start audio before switching to Background.'; }
  };
  restore.onclick = () => { restore.hidden = true; dialog.showModal(); };
  dialog.addEventListener('close', () => {
    if (keepPlaying) { keepPlaying = false; return; }
    request?.abort();
    request = null;
    clearFile();
  });
  window.LakeAudioExport = { open, pause:() => player.pause() };
})();
