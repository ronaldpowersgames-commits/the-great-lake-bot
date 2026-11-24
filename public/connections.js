'use strict';

const $ = id => document.getElementById(id);
const statusNames = {
  setup_required: 'Setup required', authorization_required: 'Authorization required', connected: 'Authorized',
  reauthorization_required: 'Reconnect required', paused: 'Paused', authorized: 'Enabled',
  authenticated: 'Authorized', supported_with_limitations: 'Authorized with limits'
};
const messages = {
  connected: 'Account connected and identity verified.',
  'connection-failed': 'Connection failed or was cancelled. Check the OAuth registration and try again.',
  'disconnect-first': 'A different account is already connected for this provider. Disconnect it first to switch accounts.',
  'signed-in': 'Lake account verified.',
  'sign-in-failed': 'The sign-in link could not be used. Request a new link in this browser.',
  connection_changed: 'The connection changed while data was being retrieved. Try again.',
  provider_rate_limited: 'The provider has rate-limited this request. Try again after the indicated wait.',
  source_paused: 'Enable the SOURCE pairing first.',
  synthesis_source_disabled: 'Model analysis is disabled for at least one selected source. The retrieved evidence is shown below.',
  analysis_unavailable: 'Analysis unavailable. The retrieved evidence is shown below.'
};
let hub;

function node(tag, value, className) {
  const element = document.createElement(tag);
  if (value != null) element.textContent = value;
  if (className) element.className = className;
  return element;
}

function describe(code) {
  return messages[code] || statusNames[code] || String(code).replaceAll('_', ' ');
}

function notify(message) {
  $('notice').textContent = message;
}

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(describe(payload.error || 'request_failed'));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function busy(control, operation) {
  control.disabled = true;
  try {
    await operation();
  } catch (error) {
    notify(error.message);
  } finally {
    control.disabled = false;
  }
}

function button(title, operation) {
  const element = node('button', title);
  element.type = 'button';
  element.addEventListener('click', () => busy(element, operation));
  return element;
}

function bindForm(id, operation) {
  $(id).addEventListener('submit', event => {
    event.preventDefault();
    busy(event.submitter || event.currentTarget.querySelector('button'), operation);
  });
}

function actions(...children) {
  const area = node('div', null, 'actions');
  area.append(...children);
  return area;
}

function link(url, label) {
  const element = node('a', label);
  const candidate = new URL(url);
  if (candidate.protocol !== 'https:' || candidate.username || candidate.password) return node('span', 'Source link unavailable');
  element.href = candidate.href;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  return element;
}

function renderProviders(list, signedIn) {
  const cards = list.map(provider => {
    const { id, status, account, capabilities, workspace } = provider;
    const card = node('article');
    card.append(node('h3', provider.label), node('p', describe(status), 'muted'));
    if (account) card.append(node('p', [account, workspace].filter(Boolean).join(' · ')));
    const labels = { search: 'Message search', threads: 'Thread retrieval', labels: 'Labels', attachment_references: 'Attachment details',
      attachment_download: 'Attachment downloads up to 5 MB' };
    const permissions = node('ul');
    for (const [name, capabilityStatus] of Object.entries(capabilities)) {
      permissions.append(node('li', (labels[name] || name) + ' · ' + describe(capabilityStatus)));
    }
    card.append(permissions);
    if (!signedIn || status === 'setup_required') return card;
    const url = '/connections/provider/' + id;
    const controls = [];
    if (['authorization_required', 'reauthorization_required'].includes(status)) {
      controls.push(button(account ? 'Reconnect' : 'Authorize read-only access', async () => {
        const result = await api('/connections/oauth/' + id, {});
        location.assign(result.url);
      }));
    }
    if (status === 'connected') {
      controls.push(button('Test connection', async () => {
        await api(url + '/test', {});
        notify(provider.label + ' identity check succeeded.');
      }));
      if (id === 'gmail') controls.push(button('Show labels', async () => {
        const { labels } = await api('/connections/gmail/labels');
        notify(labels.length ? labels.map(item => item.name).join(' · ') : 'No labels returned.');
      }));
    }
    if (['connected', 'paused'].includes(status)) {
      controls.push(button(status === 'paused' ? 'Resume' : 'Pause', async () => {
        await api(url + '/pause', { paused: status !== 'paused' });
        await loadHub();
      }));
    }
    if (account) controls.push(button('Disconnect', async () => {
      if (!window.confirm('Disconnect ' + provider.label + ' and delete its Lake credentials?')) return;
      const result = await api(url + '/disconnect', {});
      await loadHub();
      notify(result.revocation === 'unconfirmed'
        ? 'Lake credentials deleted. Remove the remaining authorization in your provider account settings.'
        : provider.label + ' disconnected.');
    }));
    card.append(actions(...controls));
    return card;
  });
  $('providers').replaceChildren(...cards);
}

function renderRestrictions(items) {
  const details = {
    whatsapp: 'Text export available below.',
    microsoft: 'Outlook and Teams connections require a Microsoft Graph integration.',
    sms: 'Requires a supported device integration and permissions.',
    imessage: 'Apple Messages extensions have limited conversation access.'
  };
  $('restricted-list').replaceChildren(...items.map(item => node('li', item.label + ' · ' + details[item.id])));
}

function renderEvidence(container, records, offset = 0, showThread = true) {
  const cards = records.map((item, index) => {
    const card = node('article');
    const title = node('h4', '[' + (offset + index + 1) + '] ' + (item.subject || item.provider));
    card.append(title, node('p', [item.provider, item.timestamp, ...item.participants].filter(Boolean).join(' · '), 'muted'),
      node('p', item.text, 'evidence'));
    for (const file of item.attachments || []) {
      if (file.size > 5 * 1024 * 1024) {
        card.append(node('p', file.name + ' · Open in Gmail to download', 'muted'));
        continue;
      }
      card.append(button('Download ' + file.name, async () => {
        const response = await fetch('/connections/gmail/attachment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: item.id, attachment: file.id })
        });
        if (!response.ok) throw new Error(describe((await response.json()).error));
        const blob = URL.createObjectURL(await response.blob());
        const download = node('a');
        download.href = blob;
        download.download = file.name;
        download.click();
        setTimeout(() => URL.revokeObjectURL(blob), 1000);
      }));
    }
    if (item.url) card.append(link(item.url, 'Open original'));
    if (showThread && item.threadId) {
      const thread = node('div');
      const load = async cursor => {
        const result = await api('/connections/provider/' + item.provider + '/thread', { threadId: item.threadId, cursor });
        const slot = node('div');
        renderEvidence(slot, result.records, thread.querySelectorAll('article').length, false);
        thread.querySelector('button')?.remove();
        thread.append(slot);
        for (const note of result.limits) thread.append(node('p', note, 'muted'));
        if (result.cursor) thread.append(button('More thread messages', () => load(result.cursor)));
      };
      thread.append(button('Read thread', () => load(undefined)));
      card.append(thread);
    }
    return card;
  });
  container.append(...cards);
}

function renderInvestigation(result, queries) {
  const target = $('investigation-result');
  target.replaceChildren();
  if (result.answer) target.append(node('h3', 'Findings'), node('p', result.answer, 'answer'));
  if (result.synthesisError) target.append(node('p', describe(result.synthesisError)));
  const coverage = node('details');
  coverage.open = true;
  coverage.append(node('summary', 'Search coverage'));
  const rows = node('ul');
  for (const item of result.coverage) {
    const label = [item.provider, item.query, item.account, item.workspace].filter(Boolean).join(' · ');
    rows.append(node('li', label + ' · ' + (item.error ? describe(item.error) : item.pages + ' page(s)' + (item.more ? ', more available' : ''))));
    if (item.limits?.length) rows.lastElementChild.append(node('p', item.limits.join(' '), 'muted'));
    if (item.thread) {
      const detail = item.thread.error ? describe(item.thread.error) : item.thread.messages + ' thread message(s)' +
        (item.thread.more ? ', more available' : '');
      rows.lastElementChild.append(node('p', detail + (item.thread.limits?.length ? '. ' + item.thread.limits.join(' ') : ''), 'muted'));
    }
  }
  coverage.append(rows);
  if (result.truncated) coverage.append(node('p', 'Showing up to 40 distinct matching messages.', 'muted'));
  target.append(coverage);
  renderEvidence(target, result.records);
  if (!result.records.length) target.append(node('p', 'No matching evidence was retrieved.'));
  const more = node('div');
  for (const entry of queries) {
    if (!result.coverage.some(item => item.provider === entry.provider && item.more)) continue;
    const load = async (cursor, trigger) => {
      const next = await api('/connections/provider/' + entry.provider + '/search', { query: entry.query, cursor });
      // Continue using the provider cursor from the most recent page.
      trigger?.remove();
      renderEvidence(more, next.records, target.querySelectorAll('article').length);
      if (next.cursor) {
        const control = button('More ' + entry.provider + ' results', () => load(next.cursor, control));
        more.append(control);
      }
    };
    const cursor = result.coverage.find(item => item.provider === entry.provider)?.cursor;
    if (cursor) {
      const control = button('More ' + entry.provider + ' results', () => load(cursor, control));
      more.append(control);
    }
  }
  target.append(more);
}

function renderSource(info) {
  $('source').hidden = false;
  $('source-status').textContent = info.status === 'setup_required' ? 'Pairing setup required.' : describe(info.status);
  $('source-controls').hidden = info.status === 'setup_required';
  if (info.status === 'setup_required') return;
  const enabled = info.status === 'authorized';
  const controls = [button(enabled ? 'Revoke SOURCE access' : 'Enable SOURCE access', async () => {
    await api('/connections/source/permission', { enabled: !enabled });
    await loadHub();
    await loadSource();
  })];
  if (enabled && info.outbound) {
    controls.push(button('Test SOURCE connection', async () => {
      await api('/connections/source/test', {});
      notify('SOURCE authenticated and returned protocol version 1.');
    }));
    controls.push(button('Retrieve SOURCE observations', async () => {
      const { results } = await api('/connections/source/pull', {});
      const accepted = results.filter(result => ['created', 'updated'].includes(result.result)).length;
      const failed = results.filter(result => result.result === 'failed').length;
      await loadSource();
      notify(accepted + ' observations added or refreshed. ' + failed + ' could not be imported.');
    }));
  }
  $('source-actions').replaceChildren(...controls);
  $('source-actions').append(button('Refresh shared records', loadSource));
}

async function loadSource() {
  const data = await api('/connections/source');
  const root = $('source-records');
  root.replaceChildren(node('h3', 'Shared with SOURCE'));
  $('context-replaces').replaceChildren(new Option('None', ''));
  for (const record of data.shared) {
    const card = node('article');
    card.append(node('h4', record.subject), node('p', record.observation, 'evidence'));
    $('context-replaces').append(new Option(record.subject, record.record_id));
    if (data.enabled && hub.source.outbound) card.append(button('Send to SOURCE', async () => {
      const result = await api('/connections/source/push/' + record.record_id, {});
      notify('SOURCE acknowledged the record · ' + result.result + '.');
    }));
    card.append(button('Withdraw from Lake sharing', async () => {
      await api('/connections/source/records/shared/' + record.record_id + '/remove', {});
      await loadSource();
    }));
    root.append(card);
  }
  if (!data.shared.length) root.append(node('p', 'No shared records.', 'muted'));
  root.append(node('h3', 'Observations from SOURCE'));
  for (const { record, review } of data.received) {
    const card = node('article');
    card.append(node('h4', record.subject), node('p', record.observation, 'evidence'),
      node('p', record.origin_system + ' · ' + record.origin_workspace + ' · ' + (record.observed_at || record.created_at), 'muted'));
    if (record.interpretation) card.append(node('p', 'SOURCE interpretation · ' + record.interpretation, 'muted'));
    if (record.confidence != null) card.append(node('p', 'SOURCE confidence · ' + Math.round(record.confidence * 100) + '%', 'muted'));
    for (const reference of record.evidence_references) {
      const label = reference.origin_system + ' · ' + reference.record_id;
      const line = node('p');
      line.append(reference.url ? link(reference.url, label) : node('span', label));
      card.append(line);
    }
    card.append(node('p', review ? 'Lake review · ' + review.status + (review.note ? ' · ' + review.note : '') : 'Awaiting Lake review.', 'muted'));
    const label = node('label', 'Correction or review note');
    const note = node('textarea');
    note.maxLength = 2000;
    note.rows = 2;
    label.append(note);
    card.append(label, actions(...[['Confirm', 'confirmed'], ['Reject', 'rejected'], ['Correct', 'superseded']].map(([title, status]) =>
      button(title, async () => {
        if (status === 'superseded' && !note.value.trim()) throw new Error('Enter the correction first.');
        await api('/connections/source/review/' + record.record_id, { status, note: note.value });
        await loadSource();
      })), button('Remove Lake copy', async () => {
      await api('/connections/source/records/received/' + record.record_id + '/remove', {});
      await loadSource();
    })));
    root.append(card);
  }
  if (!data.received.length) root.append(node('p', 'No received observations.', 'muted'));
}

async function loadHub() {
  hub = await api('/connections');
  renderProviders(hub.provider, true);
  renderRestrictions(hub.restricted);
  const connected = hub.provider.filter(provider => provider.status === 'connected');
  $('investigations').hidden = !connected.length;
  $('query-inputs').replaceChildren(...connected.map(provider => {
    const wrapper = node('div');
    const label = node('label', provider.label + ' search');
    const input = node('input');
    input.id = 'query-' + provider.id;
    input.maxLength = 500;
    input.dataset.provider = provider.id;
    label.htmlFor = input.id;
    wrapper.append(label, input);
    return wrapper;
  }));
  updateSynthesis();
  $('activity').hidden = false;
  renderSource(hub.source);
}

function updateSynthesis() {
  const fields = [...$('query-inputs').querySelectorAll('input')];
  const chosen = fields.filter(input => input.value.trim());
  const eligible = input => hub?.synthesisProviders.includes(input.dataset.provider);
  const show = chosen.length ? chosen.every(eligible) : fields.some(eligible);
  $('analyze-label').hidden = !show;
  if (!show) $('analyze').checked = false;
}

$('query-inputs').addEventListener('input', updateSynthesis);

async function loadAudit(offset = 0) {
  const result = await api('/connections/audit?offset=' + offset);
  const root = $('audit-log');
  if (!offset) root.replaceChildren();
  root.querySelector('button')?.remove();
  for (const item of result.entries) {
    const parts = [item.time, describe(item.operation), item.connection, item.account, item.outcome,
      item.retained ? 'retained' : null, item.shared ? 'shared' : null, item.error && describe(item.error)];
    root.append(node('p', parts.filter(Boolean).join(' · ')));
  }
  if (!result.entries.length && !offset) root.append(node('p', 'No recorded operations.'));
  if (result.next) root.append(button('More activity', () => loadAudit(result.next)));
}

bindForm('sign-in', async () => {
  await api('/account/link', { email: $('email').value, remember: $('remember').checked });
  notify('Open the email sign-in link in this browser.');
});
$('sign-out').addEventListener('click', event => busy(event.currentTarget, async () => {
  await api('/account/logout', {});
  location.replace('/connections.html');
}));
bindForm('investigate', async () => {
  const queries = [...$('query-inputs').querySelectorAll('input')].filter(input => input.value.trim())
    .map(input => ({ provider: input.dataset.provider, query: input.value.trim() }));
  if (!queries.length) throw new Error('Enter at least one source search.');
  $('investigation-result').replaceChildren(node('p', 'Retrieving selected evidence…'));
  try {
    const result = await api('/connections/investigate', { question: $('question').value, queries,
      includeThreads: $('include-threads').checked, analyze: $('analyze').checked });
    renderInvestigation(result, queries);
  } catch (error) {
    $('investigation-result').replaceChildren();
    throw error;
  }
});
bindForm('publish', async () => {
  await api('/connections/source/publish', { record_type: $('context-type').value, subject: $('context-subject').value,
    observation: $('context-observation').value, supersedes: $('context-replaces').value || null });
  $('publish').reset();
  await loadSource();
});
$('show-activity').addEventListener('click', event => busy(event.currentTarget, () => loadAudit()));

bindForm('import', async () => {
  const file = $('export-file').files[0];
  if (!file || file.size > 5_000_000) throw new Error('Choose a WhatsApp text export under 5 MB.');
  const query = $('export-query').value.trim().toLowerCase();
  const records = LakeWhatsAppExport.parseExport(await file.text(), $('export-date-order').value);
  const found = records.filter(record => [record.participant, record.text, record.originalTimestamp]
    .some(value => value?.toLowerCase().includes(query)));
  const target = $('import-results');
  target.replaceChildren(node('p', records.length + ' timestamped entries parsed. ' + found.length + ' matches. Showing up to 50.', 'muted'));
  for (const item of found.slice(0, 50)) {
    const card = node('article');
    card.append(node('h3', item.participant || 'System message'), node('p', item.originalTimestamp + ' · export line ' + item.id +
      (item.timestamp ? ' · local time' : ' · date order did not validate'), 'muted'), node('p', item.text, 'evidence'));
    target.append(card);
  }
});
$('import').addEventListener('reset', () => $('import-results').replaceChildren());
$('export-file').addEventListener('change', () => $('import-results').replaceChildren());

async function start() {
  const status = new URLSearchParams(location.search).get('status');
  if (status && Object.hasOwn(messages, status)) notify(messages[status]);
  if (status) history.replaceState(null, '', '/connections.html');
  const results = await Promise.allSettled([api('/connections/catalog'), api('/account/config')]);
  const [catalog, config] = results.map(result => result.status === 'fulfilled' ? result.value : null);
  const session = config?.enabled ? await api('/account/session').catch(error => { notify(error.message); return null; }) : null;
  if (catalog) {
    renderProviders(catalog.provider, false);
    renderRestrictions(catalog.restricted);
    $('source').hidden = false;
    $('source-status').textContent = describe(catalog.source);
  }
  if (session?.user) {
    $('account-status').textContent = session.user.email;
    $('sign-out').hidden = false;
    if (catalog?.ready) {
      try {
        await loadHub();
        if (hub.source.status !== 'setup_required') await loadSource();
      } catch (error) { notify(error.message); }
    } else notify('Connection storage setup is required.');
  } else {
    $('account-status').textContent = !config?.enabled ? 'Lake account setup required.' : 'Sign in to manage direct connections.';
    $('sign-in').hidden = !config?.enabled;
  }
}
start().catch(error => notify(error.message));
