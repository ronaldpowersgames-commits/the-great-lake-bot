(function (root) {
  function publicSession(session) {
    if (!session || !Array.isArray(session.history) || !session.history.length) {
      throw new Error('A conversation with messages is required');
    }
    const result = {
      name: String(session.name || 'Shared conversation').slice(0, 200),
      time: String(session.time || ''),
      history: session.history.filter(message => message && ['user', 'assistant'].includes(message.role) &&
        !['total', 'both'].includes(message.snapshot?.scope) &&
        !['snapshot-total', 'snapshot-both'].includes(message.action)).map(message => ({
        role: message.role,
        content: String(message.content || ''),
        time: String(message.time || ''),
        ...(['drip','shallow','calm','analytical','stormy'].includes(message.mood)?{mood:message.mood}:{}),
        ...(message.mirror ? {mirror:{simulated:message.role==='assistant',mode:message.mirror.mode==='lab'?'lab':'pure'}} : {}),
        attachments: Array.isArray(message.attachments) ? message.attachments.map(file => ({
          name: String(file?.name || 'Attachment').slice(0, 200),
          ...(typeof file?.data === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(file.data)
            ? { data: file.data } : {})
        })) : []
      }))
    };
    if (!result.history.length) throw new Error('No shareable conversation messages were found');
    return result;
  }

  if(typeof module==='object' && module.exports)module.exports=publicSession;
  else root.LakeSharedSession=publicSession;
})(globalThis);
