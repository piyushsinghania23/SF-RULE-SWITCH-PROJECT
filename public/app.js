const state = {
  me: null,
  rules: [],
  configOk: false
};

const meEl = document.getElementById('me');
const statusEl = document.getElementById('opStatus');
const rulesBody = document.getElementById('rulesBody');

const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const getRulesBtn = document.getElementById('getRulesBtn');
const deployBtn = document.getElementById('deployBtn');
const enableAllBtn = document.getElementById('enableAllBtn');
const disableAllBtn = document.getElementById('disableAllBtn');
const objectApiNameEl = document.getElementById('objectApiName');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#9c2a2a' : '#17202a';
}

function pendingChanges() {
  return state.rules.filter((r) => r.active !== r.pendingActive);
}

function updateButtons() {
  const authed = Boolean(state.me);
  loginBtn.disabled = state.configOk === false;
  logoutBtn.disabled = !authed;
  getRulesBtn.disabled = !authed;
  enableAllBtn.disabled = !authed || state.rules.length === 0;
  disableAllBtn.disabled = !authed || state.rules.length === 0;
  deployBtn.disabled = !authed || pendingChanges().length === 0;
}

function renderMe() {
  if (!state.me) {
    meEl.textContent = 'Not logged in.';
    return;
  }
  meEl.innerHTML = `Logged in as <b>${state.me.username}</b> (${state.me.displayName}) | Org: <b>${state.me.organizationId}</b> | URL: <b>${state.me.instanceUrl}</b>`;
}

function badge(active) {
  return `<span class="badge ${active ? 'on' : 'off'}">${active ? 'Active' : 'Inactive'}</span>`;
}

function renderRules() {
  rulesBody.innerHTML = '';
  for (const rule of state.rules) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rule.name}</td>
      <td>${rule.objectApiName}</td>
      <td>${badge(rule.active)}</td>
      <td>${badge(rule.pendingActive)}</td>
      <td><button data-id="${rule.id}" class="secondary">Toggle</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => {
      rule.pendingActive = !rule.pendingActive;
      renderRules();
      updateButtons();
      const c = pendingChanges().length;
      setStatus(c ? `${c} pending change(s). Click Deploy Changes to apply in Salesforce.` : 'No pending changes.');
    });
    rulesBody.appendChild(tr);
  }
}

async function api(path, opts = {}) {
  const resp = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function loadSession() {
  try {
    const config = await api('/api/config-status');
    state.configOk = Boolean(config.salesforceConfigured);
    if (!config.salesforceConfigured) {
      setStatus('Salesforce OAuth is not configured. Set SF_CLIENT_ID and SF_CLIENT_SECRET in .env, then restart server.', true);
      renderMe();
      updateButtons();
      return;
    }
  } catch {
    setStatus('Backend is not reachable. Start server with: node server.js', true);
    state.configOk = false;
    updateButtons();
    return;
  }

  try {
    const me = await api('/api/me');
    state.me = me;
    renderMe();
    setStatus('Authenticated. Fetch validation rules to begin.');
  } catch {
    state.me = null;
    renderMe();
  }
  updateButtons();
}

loginBtn.addEventListener('click', () => {
  if (!state.configOk) {
    setStatus('Cannot login yet. Configure Salesforce OAuth in .env first.', true);
    return;
  }
  setStatus('Redirecting to Salesforce login...');
  window.location.href = '/auth/login';
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
    state.me = null;
    state.rules = [];
    renderMe();
    renderRules();
    setStatus('Logged off successfully.');
    updateButtons();
  } catch (e) {
    setStatus(e.message, true);
  }
});

getRulesBtn.addEventListener('click', async () => {
  const objectApiName = (objectApiNameEl.value || 'Account').trim();
  try {
    setStatus('Fetching validation rules...');
    const data = await api(`/api/validation-rules?object=${encodeURIComponent(objectApiName)}`);
    state.rules = data.records.map((r) => ({ ...r, pendingActive: r.active }));
    renderRules();
    updateButtons();
    setStatus(`Loaded ${state.rules.length} validation rule(s) for ${objectApiName}.`);
  } catch (e) {
    setStatus(e.message, true);
  }
});

enableAllBtn.addEventListener('click', () => {
  for (const rule of state.rules) rule.pendingActive = true;
  renderRules();
  updateButtons();
  setStatus('All rules marked Active (pending deploy).');
});

disableAllBtn.addEventListener('click', () => {
  for (const rule of state.rules) rule.pendingActive = false;
  renderRules();
  updateButtons();
  setStatus('All rules marked Inactive (pending deploy).');
});

deployBtn.addEventListener('click', async () => {
  const changes = pendingChanges().map((r) => ({ id: r.id, active: r.pendingActive }));
  if (!changes.length) {
    setStatus('No pending changes to deploy.');
    return;
  }

  try {
    setStatus(`Deploying ${changes.length} rule change(s) to Salesforce...`);
    const result = await api('/api/validation-rules/deploy', {
      method: 'POST',
      body: JSON.stringify({ rules: changes })
    });

    for (const item of result.results) {
      if (!item.success) continue;
      const rule = state.rules.find((r) => r.id === item.id);
      if (rule) rule.active = item.active;
    }

    renderRules();
    updateButtons();
    setStatus(`Deploy complete. Success: ${result.successCount}, Failed: ${result.failureCount}` + (result.failureCount ? ' (check browser console payload if needed)' : ''));
    if (result.failureCount) {
      console.warn('Deploy failures:', result.results.filter((r) => !r.success));
    }
  } catch (e) {
    setStatus(e.message, true);
  }
});

loadSession();
