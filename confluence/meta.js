const { createHmac } = require('node:crypto');

const apiVersion = 'v27.0';
const pageLimit = 15;
const pageId = /^\d{1,32}$/;
const recordId = /^[\w=+/-]{1,256}$/;
const graphCursor = /^[\w=+/-]{1,2048}$/;
const instagramBasic = 'instagram_business_basic';
const instagramMessages = 'instagram_business_manage_messages';
const facebookBasic = ['pages_show_list', 'pages_read_engagement'];
const facebookMessages = ['pages_manage_metadata', 'pages_messaging'];

const asArray = value => Array.isArray(value) ? value : [];
const itemText = value => typeof value === 'string' ? value.slice(0, 2500) : '';
const validToken = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const names = people => asArray(people).map(person => person?.username || person?.name || person?.id).filter(Boolean).slice(0, 20);

function permalink(value, domain) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      [domain, 'www.' + domain, 'm.' + domain].includes(url.hostname)) return url.toString();
  } catch {}
  return null;
}

function continuation(data) {
  const cursor = data?.paging?.cursors?.after;
  return data?.paging?.next && typeof cursor === 'string' && cursor.length <= 2048 ? cursor : null;
}

function createMetaProviders(env, { request, endpoint, timestamp, ConnectionError }) {
  const providers = {};
  const fail = (code, status) => { throw new ConnectionError(code, status); };

  function makeReader({ id, domain, root, inboxEnabled, graph, fields, postEdge, postText, postDate, shortLabel }) {
    const isInstagram = id === 'instagram';
    const limits = ['Search matches captions or post text within each retrieved page.'];
    const inboxLimit = isInstagram
      ? 'Instagram omits inactive message requests and limits historical message access.'
      : 'Facebook exposes conversations for the authorized Page inbox.';
    const read = (connection, path, args) => graph(path, args, connection.token);
    const inboxAllowed = connection => {
      if (!inboxEnabled || !connection.inboxGranted) fail('provider_access_limited', 403);
    };

    async function posts(connection, cursor, query) {
      const data = await read(connection, postEdge, { fields, limit: pageLimit, after: cursor });
      const terms = query?.toLocaleLowerCase();
      const records = asArray(data.data).filter(item => typeof item?.id === 'string').map(item => ({
        id: item.id,
        conversation: 'posts',
        subject: shortLabel + ' post',
        participants: [connection.display || connection.account],
        timestamp: timestamp(item[postDate]),
        text: itemText(item[postText]),
        url: permalink(item.permalink || item.permalink_url, domain)
      })).filter(item => !terms || item.text.toLocaleLowerCase().includes(terms));
      return { records, cursor: continuation(data), limits: terms ? limits : [] };
    }

    async function inbox(connection, cursor) {
      inboxAllowed(connection);
      const data = await read(connection, root + '/conversations', {
        platform: isInstagram ? 'instagram' : 'messenger',
        fields: 'id,updated_time,participants',
        limit: pageLimit,
        after: cursor
      });
      const records = asArray(data.data).filter(item => recordId.test(item?.id || '')).map(item => ({
        id: item.id, conversation: item.id, threadId: item.id, subject: shortLabel + ' conversation',
        participants: names(item.participants?.data), timestamp: timestamp(item.updated_time), text: '', url: null
      }));
      return { records, cursor: continuation(data), limits: [inboxLimit] };
    }

    async function thread(connection, threadId, cursor) {
      inboxAllowed(connection);
      if (!recordId.test(threadId)) fail('invalid_thread', 400);
      const encodedId = encodeURIComponent(threadId);
      let messages;
      if (isInstagram) {
        // Meta exposes Instagram messages as a nested edge on the conversation.
        if (cursor && !graphCursor.test(cursor)) fail('invalid_cursor', 400);
        const after = cursor ? '.after(' + JSON.stringify(cursor) + ')' : '';
        const data = await read(connection, encodedId, {
          fields: 'messages.limit(' + pageLimit + ')' + after + '{id,created_time,from,to,message}'
        });
        messages = data.messages;
      } else {
        messages = await read(connection, encodedId + '/messages', {
          fields: 'id,created_time,from,to,message', limit: pageLimit, after: cursor
        });
      }
      const records = asArray(messages?.data).filter(item => typeof item?.id === 'string').map(item => ({
        id: item.id, conversation: threadId, threadId, subject: shortLabel + ' message',
        participants: names([item.from, ...asArray(item.to?.data)]), timestamp: timestamp(item.created_time),
        text: itemText(item.message), url: null
      }));
      return { records, cursor: continuation(messages), limits: [inboxLimit] };
    }

    return {
      posts: (connection, cursor) => posts(connection, cursor),
      search: (connection, query, cursor) => posts(connection, cursor, query),
      ...(inboxEnabled && { inbox, thread })
    };
  }

  const instagramInbox = env.INSTAGRAM_ENABLE_INBOX === 'true';
  const instagramScopes = [instagramBasic, ...(instagramInbox ? [instagramMessages] : [])];
  const igGraph = (path, params, token) => request(endpoint('https://graph.instagram.com/' + apiVersion + '/' + path, params), { token, meta: true });
  providers.instagram = {
    id: 'instagram',
    label: 'Instagram Professional',
    detail: 'Creator and Business profiles. Personal accounts are outside Instagram’s direct API.',
    scopes: instagramScopes,
    capabilities: ['search', 'posts', ...(instagramInbox ? ['inbox', 'threads'] : [])],
    limitedCapabilities: ['search', 'inbox', 'threads'],
    configured: Boolean(env.INSTAGRAM_CLIENT_ID && env.INSTAGRAM_CLIENT_SECRET),
    refreshWindow: 7 * 86400000,
    authorization(state, callback) {
      return endpoint('https://www.instagram.com/oauth/authorize', {
        client_id: env.INSTAGRAM_CLIENT_ID, redirect_uri: callback, response_type: 'code', state,
        scope: instagramScopes.join(',')
      });
    },
    async exchange(code, callback) {
      const form = new FormData();
      for (const [key, value] of Object.entries({
        client_id: env.INSTAGRAM_CLIENT_ID, client_secret: env.INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code', redirect_uri: callback, code
      })) form.set(key, value);
      const response = await request('https://api.instagram.com/oauth/access_token', { form, meta: true });
      const short = response.data?.[0] || response;
      const scopes = typeof short.permissions === 'string' ? short.permissions.split(',').map(scope => scope.trim()) : asArray(short.permissions);
      if (!validToken(short.access_token) || !scopes.includes(instagramBasic)) fail('provider_access_limited', 403);
      const long = await request(endpoint('https://graph.instagram.com/access_token', {
        grant_type: 'ig_exchange_token', client_secret: env.INSTAGRAM_CLIENT_SECRET, access_token: short.access_token
      }), { meta: true });
      if (!validToken(long.access_token) || !(long.expires_in > 0)) fail('oauth_exchange_failed');
      return { ...long, refresh_token: long.access_token, inboxGranted: instagramInbox && scopes.includes(instagramMessages) };
    },
    async refresh(token) {
      const response = await request(endpoint('https://graph.instagram.com/refresh_access_token', {
        grant_type: 'ig_refresh_token', access_token: token
      }), { meta: true });
      if (!validToken(response.access_token) || !(response.expires_in > 0)) fail('reauthorization_required', 401);
      return { ...response, refresh_token: response.access_token };
    },
    async identify(token) {
      const data = await igGraph('me', { fields: 'user_id,username' }, token);
      const account = String(data.user_id || data.id || '');
      if (!pageId.test(account) || !data.username) fail('provider_account_unknown');
      return { account, workspace: null, display: '@' + data.username };
    },
    ...makeReader({
      id: 'instagram', domain: 'instagram.com', root: 'me', inboxEnabled: instagramInbox, graph: igGraph,
      postEdge: 'me/media', fields: 'id,caption,permalink,timestamp', postText: 'caption', postDate: 'timestamp', shortLabel: 'Instagram'
    })
  };

  const facebookInbox = env.FACEBOOK_ENABLE_INBOX === 'true';
  const facebookScopes = [...facebookBasic, ...(facebookInbox ? facebookMessages : [])];
  const fbGraph = (path, params, token, method) => {
    const proof = token && createHmac('sha256', env.FACEBOOK_CLIENT_SECRET).update(token).digest('hex');
    return request(endpoint('https://graph.facebook.com/' + apiVersion + '/' + path, { ...params, appsecret_proof: proof }),
      { token, method, meta: true });
  };
  const selectedPage = env.FACEBOOK_PAGE_ID;
  providers.facebook = {
    id: 'facebook',
    label: 'Facebook Page',
    detail: 'The Facebook Page you manage and authorize. Personal Messenger is outside the Page API.',
    scopes: facebookScopes,
    capabilities: ['search', 'posts', ...(facebookInbox ? ['inbox', 'threads'] : [])],
    limitedCapabilities: ['search', 'inbox', 'threads'],
    configured: Boolean(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET && pageId.test(env.FACEBOOK_LOGIN_CONFIG_ID || '') && pageId.test(selectedPage || '')),
    authorization(state, callback) {
      return endpoint('https://www.facebook.com/' + apiVersion + '/dialog/oauth', {
        client_id: env.FACEBOOK_CLIENT_ID, redirect_uri: callback, response_type: 'code', state,
        config_id: env.FACEBOOK_LOGIN_CONFIG_ID, override_default_response_type: 'true'
      });
    },
    async exchange(code, callback) {
      const client = { client_id: env.FACEBOOK_CLIENT_ID, client_secret: env.FACEBOOK_CLIENT_SECRET };
      const short = await fbGraph('oauth/access_token', { ...client, redirect_uri: callback, code });
      if (!validToken(short.access_token)) fail('oauth_exchange_failed');
      const long = await fbGraph('oauth/access_token', { ...client, grant_type: 'fb_exchange_token', fb_exchange_token: short.access_token });
      if (!validToken(long.access_token)) fail('oauth_exchange_failed');
      const authorized = await fbGraph('me/permissions', {}, long.access_token);
      const granted = asArray(authorized.data).filter(item => item?.status === 'granted').map(item => item.permission);
      if (!facebookBasic.every(scope => granted.includes(scope))) fail('provider_access_limited', 403);
      let after;
      for (let i = 0; i < 10; i++) {
        const result = await fbGraph('me/accounts', { fields: 'id,name,access_token,tasks', limit: 50, after }, long.access_token);
        const asset = asArray(result.data).find(page => page?.id === selectedPage);
        if (asset && validToken(asset.access_token)) return {
          access_token: asset.access_token, revocationToken: long.access_token,
          inboxGranted: facebookInbox && facebookMessages.every(scope => granted.includes(scope)) && asArray(asset.tasks).includes('MESSAGING')
        };
        after = continuation(result);
        if (!after) break;
      }
      fail('provider_access_limited', 403);
    },
    async identify(token) {
      const data = await fbGraph('me', { fields: 'id,name' }, token);
      if (data.id !== selectedPage) fail('provider_account_unknown');
      return { account: data.id, workspace: data.id, display: data.name || data.id };
    },
    async revoke(connection) {
      if (!validToken(connection.revocationToken)) fail('revocation_unconfirmed');
      const response = await fbGraph('me/permissions', {}, connection.revocationToken, 'DELETE');
      if (response.success !== true) fail('revocation_unconfirmed');
    },
    ...makeReader({
      id: 'facebook', domain: 'facebook.com', root: selectedPage, inboxEnabled: facebookInbox, graph: fbGraph,
      postEdge: selectedPage + '/published_posts', fields: 'id,message,permalink_url,created_time',
      postText: 'message', postDate: 'created_time', shortLabel: 'Facebook Page'
    })
  };
  return providers;
}

module.exports = { createMetaProviders };
