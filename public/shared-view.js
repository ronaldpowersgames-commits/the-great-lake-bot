/* This viewer deliberately has no account, storage or app dependencies. */
(async function () {
  const title = document.getElementById('title');
  const messages = document.getElementById('messages');
  function unlockShare(url, prompt) {
    const dialog = document.getElementById('unlockDialog');
    const form = document.getElementById('unlockForm');
    const input = document.getElementById('unlockPassphrase');
    const error = document.getElementById('unlockError');
    const submit = form.querySelector('button[type="submit"]');
    document.getElementById('unlockPrompt').textContent = prompt || 'Enter the passphrase from the sender.';
    title.textContent = 'Passphrase-protected conversation';
    return new Promise((resolve, reject) => {
      dialog.addEventListener('close', () => {
        input.value = '';
        reject(new Error('A passphrase is required to open this shared conversation.'));
      }, { once: true });
      document.getElementById('cancelUnlock').onclick = () => dialog.close();
      form.onsubmit = async event => {
        event.preventDefault();
        const passphrase = input.value.trim();
        if (!passphrase || submit.disabled) return;
        submit.disabled = true;
        error.textContent = '';
        try {
          const response = await fetch(url, {
            cache: 'no-store', credentials: 'omit', headers: { 'x-lake-passphrase': passphrase }
          });
          if (!dialog.open) return;
          if (response.status === 401) {
            error.textContent = 'That passphrase didn’t unlock this share. Try again.';
            input.select();
            input.focus();
            return;
          }
          resolve(response);
          dialog.close();
        } catch {
          if (dialog.open) error.textContent = 'Could not check the passphrase. Please try again.';
        } finally {
          submit.disabled = false;
        }
      };
      dialog.showModal();
    });
  }
  try {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('This share link is missing its conversation ID.');
    const url = '/share/' + encodeURIComponent(id);
    let response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (response.status === 401) {
      const locked = await response.json().catch(() => ({}));
      response = await unlockShare(url, locked.unlockPrompt);
    }
    if (!response.ok) throw new Error('This shared conversation is unavailable or has expired.');
    const { session } = await response.json();
    if (!session || !Array.isArray(session.history)) throw new Error('This shared conversation could not be read.');
    title.textContent = session.name || 'Shared conversation';
    document.title = LakeExportNames.sessionTranscript('pdf',session.time,session.name).replace(/\.pdf$/,'');
    for (const message of session.history) {
      const article = document.createElement('article');
      article.className = message.role === 'user' ? 'user' : 'assistant';
      if(['drip','shallow','calm','analytical','stormy'].includes(message.mood)) article.dataset.sentMood=message.mood;
      const sender = document.createElement('div');
      sender.className = 'sender';
      sender.textContent = message.role === 'user' ? (message.mirror?'You (Mirror exercise)':'You (conversation author)') : (message.mirror?'The Lake · Mirror exercise':'The Lake');
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      // Construct formatting with text nodes, never untrusted HTML.
      for (const paragraph of String(message.content || '').split(/\n\s*\n/)) {
        const p = document.createElement('p');
        const pieces = paragraph.split(/(\*\*[^*]+\*\*)/g);
        for (const piece of pieces) {
          if (piece.startsWith('**') && piece.endsWith('**')) {
            const strong = document.createElement('strong');
            strong.textContent = piece.slice(2, -2);
            p.appendChild(strong);
          } else p.appendChild(document.createTextNode(piece));
        }
        bubble.appendChild(p);
      }
      for (const file of message.attachments || []) {
        const label = document.createElement('div');
        label.className = 'attachment';
        label.textContent = file.name || 'Attachment';
        bubble.appendChild(label);
        if (typeof file.data === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(file.data)) {
          const image = document.createElement('img');
          image.src = file.data;
          image.alt = file.name || 'Shared image';
          image.loading = 'lazy';
          bubble.appendChild(image);
        }
      }
      article.append(sender, bubble);
      if (message.time) {
        const time = document.createElement('time');
        time.textContent = message.time;
        article.appendChild(time);
      }
      messages.appendChild(article);
    }
    document.getElementById('rideWaveFooter').hidden = false;
  } catch (error) {
    title.textContent = 'Conversation unavailable';
    messages.textContent = error.message;
  }
})();
