/* This viewer deliberately has no account, storage or app dependencies. */
(async function () {
  const title = document.getElementById('title');
  const messages = document.getElementById('messages');
  try {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('This share link is missing its conversation ID.');
    const response = await fetch('/share/' + encodeURIComponent(id), { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('This shared conversation is unavailable or has expired.');
    const { session } = await response.json();
    if (!session || !Array.isArray(session.history)) throw new Error('This shared conversation could not be read.');
    title.textContent = session.name || 'Shared conversation';
    for (const message of session.history) {
      const article = document.createElement('article');
      article.className = message.role === 'user' ? 'user' : 'assistant';
      const sender = document.createElement('div');
      sender.className = 'sender';
      sender.textContent = message.role === 'user' ? 'You (conversation author)' : 'The Lake';
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
  } catch (error) {
    title.textContent = 'Conversation unavailable';
    messages.textContent = error.message;
  }
})();
