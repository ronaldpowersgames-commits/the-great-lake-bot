const { createHash, randomBytes } = require('node:crypto');

const gmailScope = 'https://www.googleapis.com/auth/gmail.readonly';
const gmailRoot = 'https://gmail.googleapis.com/gmail/v1/users/me';
const slackScopes = ['search:read', 'channels:history', 'groups:history', 'im:history', 'mpim:history'];
const maxAttachmentBytes = 5 * 1024 * 1024;

class ConnectionError extends Error {
  constructor(code, status = 502, retryAfter) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function request(fetchImpl, url, { token, form, method, slack = false, allowEmpty = false } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: method || (form ? 'POST' : 'GET'),
      ...(form && { body: new URLSearchParams(form) }),
      ...(token && { headers: { Authorization: 'Bearer ' + token } }),
      redirect: 'error',
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new ConnectionError('provider_unreachable');
  }
  const data = await response.json().catch(() => null);
  if (response.status === 429 || data?.error === 'ratelimited') {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new ConnectionError('provider_rate_limited', 429, retryAfter > 0 ? retryAfter : undefined);
  }
  if (response.status === 401 || ['invalid_grant', 'invalid_auth', 'token_expired', 'token_revoked', 'not_authed', 'account_inactive'].includes(data?.error)) {
    throw new ConnectionError('reauthorization_required', 401);
  }
  if (response.status === 403 || ['missing_scope', 'not_in_channel', 'channel_not_found', 'no_permission'].includes(data?.error)) {
    throw new ConnectionError('provider_access_limited', 403);
  }
  if (response.status === 404 || data?.error === 'thread_not_found') throw new ConnectionError('record_unavailable', 404);
  if (!response.ok || (!data && !allowEmpty) || (slack && data?.ok !== true)) throw new ConnectionError('provider_request_failed');
  return data || {};
}

function endpoint(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  return url;
}

function timestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function slackLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname.endsWith('.slack.com') && !url.username && !url.password && !url.port && url.pathname.startsWith('/archives/')) return url.toString();
  } catch {}
  return null;
}

function slackThreadId(message) {
  const channel = message.channel?.id;
  const link = slackLink(message.permalink);
  const root = message.thread_ts || (link && new URL(link).searchParams.get('thread_ts')) || message.ts;
  return channel && root ? channel + ':' + root : null;
}

function slimSlack(message, channel, threadId, link = null) {
  return {
    id: message.ts, conversation: channel, threadId, timestamp: timestamp(Number(message.ts) * 1000),
    participants: [message.user || message.username].filter(Boolean), text: (message.text || '').slice(0, 2500),
    url: slackLink(message.permalink) || link
  };
}

function gmailEvidence(message, mailbox) {
  const header = name => message.payload?.headers?.find(item => item.name.toLowerCase() === name)?.value || '';
  const plainText = [];
  const attachments = [];
  function read(part) {
    if (part.filename && part.body?.attachmentId && attachments.length < 20) {
      attachments.push({ id: part.body.attachmentId, name: part.filename, type: part.mimeType, size: part.body.size });
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      plainText.push(Buffer.from(part.body.data.slice(0, 4800), 'base64url').toString('utf8'));
    }
    for (const child of part.parts || []) read(child);
  }
  if (message.payload) read(message.payload);
  return {
    id: message.id, threadId: message.threadId, subject: header('subject'),
    participants: [header('from'), header('to'), header('cc')].filter(Boolean),
    timestamp: timestamp(Number(message.internalDate)),
    text: (plainText.join('\n') || message.snippet || '').slice(0, 2500),
    url: 'https://mail.google.com/mail/u/' + encodeURIComponent(mailbox) + '/#all/' + encodeURIComponent(message.id),
    labels: message.labelIds || [], attachments
  };
}

function createProviders(env = process.env, fetchImpl = fetch) {
  function credentials(id, code, callback, extra = {}) {
    const prefix = id.toUpperCase();
    return { client_id: env[prefix + '_CLIENT_ID'], client_secret: env[prefix + '_CLIENT_SECRET'],
      ...(code && { code, redirect_uri: callback }), ...extra };
  }
  const gmail = {
    id: 'gmail',
    label: 'Gmail',
    scopes: [gmailScope],
    capabilities: ['search', 'threads', 'labels', 'attachment_references', 'attachment_download'],
    configured: Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET),
    authorization(state, callback, verifier) {
      return endpoint('https://accounts.google.com/o/oauth2/v2/auth', {
        client_id: env.GMAIL_CLIENT_ID, redirect_uri: callback, response_type: 'code', state,
        scope: gmailScope, access_type: 'offline', prompt: 'consent',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
      });
    },
    async exchange(code, callback, verifier) {
      const data = await request(fetchImpl, 'https://oauth2.googleapis.com/token', {
        form: credentials('gmail', code, callback, { grant_type: 'authorization_code', code_verifier: verifier })
      });
      if (!data.scope?.split(' ').includes(gmailScope)) throw new ConnectionError('provider_access_limited', 403);
      return data;
    },
    refresh(refreshToken) {
      return request(fetchImpl, 'https://oauth2.googleapis.com/token', {
        form: credentials('gmail', null, null, { grant_type: 'refresh_token', refresh_token: refreshToken })
      });
    },
    async identify(token) {
      const data = await request(fetchImpl, gmailRoot + '/profile', { token });
      if (!data.emailAddress) throw new ConnectionError('provider_account_unknown');
      return { account: data.emailAddress, workspace: null };
    },
    async search(connection, query, cursor) {
      const token = connection.token;
      const data = await request(fetchImpl, endpoint(gmailRoot + '/messages', { q: query, maxResults: 8, pageToken: cursor }), { token });
      const messages = await Promise.allSettled((data.messages || []).map(item =>
        request(fetchImpl, endpoint(gmailRoot + '/messages/' + encodeURIComponent(item.id), { format: 'full' }), { token })));
      if (messages.length && messages.every(item => item.status === 'rejected')) throw messages[0].reason;
      return {
        records: messages.filter(item => item.status === 'fulfilled').map(item => gmailEvidence(item.value, connection.account)),
        cursor: data.nextPageToken || null, limits: [
          ...(messages.some(item => item.status === 'rejected') ? ['Some matching messages could not be retrieved.'] : []),
          'Message excerpts are bounded. HTML-only messages use the provider snippet.'
        ]
      };
    },
    async thread(connection, id, cursor) {
      if (!/^[\w-]{1,200}$/.test(id)) throw new ConnectionError('invalid_thread', 400);
      const data = await request(fetchImpl, endpoint(gmailRoot + '/threads/' + encodeURIComponent(id), { format: 'full' }), { token: connection.token });
      const offset = Number(cursor || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new ConnectionError('invalid_cursor', 400);
      const messages = data.messages || [];
      return { records: messages.slice(offset, offset + 20).map(item => gmailEvidence(item, connection.account)),
        cursor: offset + 20 < messages.length ? String(offset + 20) : null, limits: ['Message excerpts are bounded.'] };
    },
    async labels(connection) {
      const data = await request(fetchImpl, gmailRoot + '/labels', { token: connection.token });
      return (data.labels || []).map(item => ({ id: item.id, name: item.name }));
    },
    async attachment(connection, messageId, attachmentId) {
      const base = gmailRoot + '/messages/' + encodeURIComponent(messageId);
      const options = { token: connection.token };
      const message = await request(fetchImpl, endpoint(base, { format: 'full' }), options);
      const file = gmailEvidence(message, connection.account).attachments.find(item => item.id === attachmentId);
      if (!file) throw new ConnectionError('record_unavailable', 404);
      if (!(file.size >= 0 && file.size <= maxAttachmentBytes)) throw new ConnectionError('attachment_too_large', 413);
      const data = await request(fetchImpl, base + '/attachments/' + encodeURIComponent(attachmentId), options);
      if (typeof data.data !== 'string' || data.data.length > Math.ceil(maxAttachmentBytes * 4 / 3) + 4) {
        throw new ConnectionError('attachment_too_large', 413);
      }
      return { name: file.name, bytes: Buffer.from(data.data, 'base64url') };
    },
    revoke(connection) {
      return request(fetchImpl, 'https://oauth2.googleapis.com/revoke', {
        form: { token: connection.refreshToken || connection.token }, allowEmpty: true
      });
    }
  };

  const slackCall = (method, token, params) => request(fetchImpl, endpoint('https://slack.com/api/' + method, params || {}), { token, slack: true });
  const slack = {
    id: 'slack',
    label: 'Slack',
    scopes: slackScopes,
    capabilities: ['search', 'threads'],
    configured: Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET),
    authorization(state, callback) {
      return endpoint('https://slack.com/oauth/v2/authorize', { client_id: env.SLACK_CLIENT_ID, state,
        redirect_uri: callback, user_scope: slackScopes.join(',') });
    },
    async exchange(code, callback) {
      const data = await request(fetchImpl, 'https://slack.com/api/oauth.v2.access', { slack: true, form: credentials('slack', code, callback) });
      if (data.authed_user?.token_type !== 'user' || !data.authed_user.scope?.split(',').includes('search:read')) {
        throw new ConnectionError('provider_access_limited', 403);
      }
      return data.authed_user;
    },
    async refresh(refreshToken) {
      return request(fetchImpl, 'https://slack.com/api/oauth.v2.access', {
        slack: true, form: credentials('slack', null, null, { grant_type: 'refresh_token', refresh_token: refreshToken })
      });
    },
    async identify(token) {
      const data = await slackCall('auth.test', token);
      if (!data.user_id || !data.team_id) throw new ConnectionError('provider_account_unknown');
      return { account: data.user_id, workspace: data.team_id, display: [data.user, data.team].filter(Boolean).join(' · ') };
    },
    async search(connection, query, cursor) {
      const page = Number(cursor || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100) throw new ConnectionError('invalid_cursor', 400);
      const data = await slackCall('search.messages', connection.token, { query, count: 15, page });
      const paging = data.messages?.paging || {};
      return {
        records: (data.messages?.matches || []).map(item => slimSlack(item, item.channel?.id, slackThreadId(item))),
        cursor: page < Math.min(paging.pages ?? data.messages?.pagination?.page_count ?? 0, 100) ? String(page + 1) : null,
        limits: ['Results depend on workspace search settings and the connected user’s access. Slack can deduplicate nearby matches.']
      };
    },
    async thread(connection, id, cursor) {
      const match = /^([A-Z0-9]+):(\d{1,16}\.\d{1,12})$/.exec(id);
      if (!match) throw new ConnectionError('invalid_thread', 400);
      const [, channel, ts] = match;
      const data = await slackCall('conversations.replies', connection.token, { channel, ts, cursor, limit: 15 });
      let link = null;
      try { link = slackLink((await slackCall('chat.getPermalink', connection.token, { channel, message_ts: ts })).permalink); } catch {}
      const next = data.response_metadata?.next_cursor || null;
      return { records: (data.messages || []).map(item => slimSlack(item, channel, id, link)),
        cursor: next, limits: data.has_more && !next ? ['Slack reported additional messages without a continuation cursor.'] : [] };
    },
    async revoke(connection) {
      const result = await request(fetchImpl, 'https://slack.com/api/auth.revoke', { slack: true, token: connection.token, form: {} });
      if (result.revoked !== true) throw new ConnectionError('revocation_unconfirmed');
    }
  };
  return { gmail, slack };
}

function oauthProof() {
  return randomBytes(32).toString('base64url');
}

module.exports = { createProviders, oauthProof, ConnectionError };
