// Alter web UI — same app on the computer (desktop shell / browser) and on the phone (PWA).
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const view = $('#view');

// ---------- auth ----------
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let token = window.ALTER_TOKEN || store.get('alter.token');

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  if (res.status === 401 && !window.ALTER_TOKEN) {
    store.set('alter.token', null);
    token = null;
    showPairing();
    throw new Error('Not paired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

// Tiny Markdown: code blocks, inline code, bold, italics, links, lists, paragraphs.
function md(src) {
  const parts = String(src).split(/```(\w*)\n?([\s\S]*?)```/g);
  let html = '';
  for (let i = 0; i < parts.length; i += 3) {
    html += esc(parts[i])
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
    if (parts[i + 2] !== undefined) html += `<pre><code>${esc(parts[i + 2])}</code></pre>`;
  }
  return html;
}

const ago = (iso) => {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const f = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(s) < 60) return f.format(-Math.round(s), 'second');
  if (Math.abs(s) < 3600) return f.format(-Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return f.format(-Math.round(s / 3600), 'hour');
  return f.format(-Math.round(s / 86400), 'day');
};

// ---------- routing ----------
const views = { chat: renderChat, agents: renderAgents, feed: renderFeed, memory: renderMemory, settings: renderSettings };
let current = 'chat';
function go(name) {
  current = name;
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  views[name]().catch((e) => (view.innerHTML = `<div class="page"><div class="card">⚠️ ${esc(e.message)}</div></div>`));
}
document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => go(b.dataset.view)));

// ---------- chat ----------
let activeConv = null;
let sending = false;

async function renderChat() {
  const convs = await api('/api/conversations');
  view.innerHTML = `
    <div class="chat">
      <aside class="convs">
        <button class="btn" id="newConv" style="width:100%;margin-bottom:8px">＋ New chat</button>
        ${convs.map((c) => `<button data-id="${c.id}" class="${c.id === activeConv ? 'active' : ''}">${esc(c.title)}</button>`).join('')}
      </aside>
      <section class="thread">
        <div class="only-phone row" style="padding:8px 12px;border-bottom:1px solid var(--line)">
          <button class="btn" id="showConvs">☰ Chats</button><span class="grow"></span><button class="btn" id="newConv2">＋ New</button>
        </div>
        <div class="messages" id="messages"></div>
        <div class="composer">
          <form id="composer">
            <textarea id="input" rows="1" placeholder="Ask Alter anything…"></textarea>
            <button class="btn primary" id="send">Send</button>
          </form>
        </div>
      </section>
    </div>`;
  const chatEl = $('.chat');
  const newChat = () => { activeConv = null; renderChat(); };
  $('#newConv').onclick = newChat;
  $('#newConv2').onclick = newChat;
  $('#showConvs').onclick = () => chatEl.classList.toggle('show-convs');
  chatEl.querySelectorAll('.convs [data-id]').forEach((b) => (b.onclick = () => { activeConv = b.dataset.id; renderChat(); }));

  const input = $('#input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(max-width: 760px)').matches) {
      e.preventDefault();
      $('#composer').requestSubmit();
    }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px'; });
  $('#composer').onsubmit = (e) => { e.preventDefault(); send(input.value); };

  const box = $('#messages');
  if (!activeConv) {
    box.innerHTML = `<div class="empty"><span class="logo">◆</span><h2>Hi, I'm Alter.</h2>
      <p>I learn how you work and remember it — on your computer and your phone.<br>Tell me about yourself, or ask for anything.</p></div>`;
  } else {
    const c = await api(`/api/conversations/${activeConv}`);
    box.innerHTML = c.messages.map(msgHtml).join('');
    box.scrollTop = box.scrollHeight;
  }
  input.focus();
}

function msgHtml(m) {
  const who = m.role === 'user' ? 'You' : `Alter${m.provider ? ` · ${m.provider}` : ''}`;
  return `<div class="msg ${m.role}"><div class="who">${esc(who)}</div><div class="bubble">${m.role === 'user' ? esc(m.content) : md(m.content)}</div></div>`;
}

async function send(text) {
  text = text.trim();
  if (!text || sending) return;
  sending = true;
  const box = $('#messages');
  if (!activeConv) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', content: text }));
  box.insertAdjacentHTML('beforeend', `<div class="msg assistant"><div class="who">Alter</div><div class="bubble typing" id="live"></div></div>`);
  $('#input').value = '';
  $('#send').disabled = true;
  box.scrollTop = box.scrollHeight;

  const live = $('#live');
  let acc = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversationId: activeConv, message: text }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = chunk.match(/^event: (.+)$/m)?.[1];
        const data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] ?? 'null');
        if (ev === 'meta') {
          activeConv = data.conversationId;
          live.previousElementSibling.textContent = `Alter · ${data.provider}`;
        } else if (ev === 'delta') {
          acc += data.text;
          live.innerHTML = md(acc);
          box.scrollTop = box.scrollHeight;
        } else if (ev === 'done') {
          live.innerHTML = md(data.text);
        } else if (ev === 'error') {
          throw new Error(data.message);
        }
      }
    }
  } catch (e) {
    live.innerHTML = `<span class="pill err">Error</span> ${esc(e.message)}`;
  } finally {
    live.classList.remove('typing');
    live.removeAttribute('id');
    sending = false;
    const btn = $('#send');
    if (btn) btn.disabled = false;
    refreshConvList();
  }
}

async function refreshConvList() {
  if (current !== 'chat') return;
  const convs = await api('/api/conversations');
  const aside = $('.convs');
  if (!aside) return;
  aside.querySelectorAll('[data-id]').forEach((b) => b.remove());
  aside.insertAdjacentHTML('beforeend', convs.map((c) => `<button data-id="${c.id}" class="${c.id === activeConv ? 'active' : ''}">${esc(c.title)}</button>`).join(''));
  aside.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => { activeConv = b.dataset.id; renderChat(); }));
}

// ---------- agents ----------
async function renderAgents() {
  const [agents, templates, skills, providers] = await Promise.all([api('/api/agents'), api('/api/agents/templates'), api('/api/skills'), api('/api/providers')]);
  view.innerHTML = `<div class="page">
    <h1>Agents</h1>
    <p class="sub">Agents work on a schedule, remember what they did, and learn your routine. Their results land in the Feed on every device.</p>
    <div id="agentList">${agents.length ? agents.map(agentCard).join('') : '<div class="card muted">No agents yet — start from a template below or create your own.</div>'}</div>
    <h2>Start from a template</h2>
    ${templates.map((t) => `<div class="card row"><div class="grow"><h3>${t.emoji} ${esc(t.name)}</h3><div class="muted small">${esc(t.description)}</div>
      <div class="small muted">⏱ ${esc(t.schedule)}</div></div><button class="btn" data-tpl="${t.templateId}">Add</button></div>`).join('')}
    <h2>Create your own</h2>
    <div class="card" id="agentForm">${agentForm({}, skills, providers)}</div>
  </div>`;

  view.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = async () => {
    await api('/api/agents', { method: 'POST', body: { templateId: b.dataset.tpl } });
    toast('Agent added');
    renderAgents();
  }));
  bindAgentForm($('#agentForm'), null, skills, providers);
  bindAgentCards(skills, providers);
}

function agentCard(a) {
  return `<div class="card" data-agent="${a.id}">
    <div class="row">
      <div class="grow"><h3>${a.emoji} ${esc(a.name)}</h3><div class="muted small">${esc(a.description || a.instructions.slice(0, 140))}</div></div>
      ${a.running ? '<span class="pill warn">running…</span>' : a.enabled ? '<span class="pill ok">on</span>' : '<span class="pill">off</span>'}
    </div>
    <div class="row small muted" style="margin-top:8px">
      <span>⏱ ${esc(a.schedule)}</span><span>· next ${a.nextRunAt ? new Date(a.nextRunAt).toLocaleString() : '—'}</span>
      <span>· last ${ago(a.lastRunAt)}</span><span>· ${esc(a.provider)}</span>
      ${a.skills.length ? `<span>· skills: ${a.skills.map(esc).join(', ')}</span>` : ''}
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" data-act="run" ${a.running ? 'disabled' : ''}>▶ Run now</button>
      <button class="btn" data-act="toggle">${a.enabled ? 'Pause' : 'Enable'}</button>
      <button class="btn" data-act="edit">Edit</button>
      <button class="btn" data-act="runs">History</button>
      <span class="grow"></span>
      <button class="btn danger" data-act="delete">Delete</button>
    </div>
    <div class="extra"></div>
  </div>`;
}

function bindAgentCards(skills, providers) {
  view.querySelectorAll('[data-agent]').forEach((card) => {
    const id = card.dataset.agent;
    card.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
      const act = b.dataset.act;
      const extra = $('.extra', card);
      if (act === 'run') { await api(`/api/agents/${id}/run`, { method: 'POST' }); toast('Agent started — result will appear in the Feed'); renderAgents(); }
      if (act === 'toggle') { const a = await api(`/api/agents/${id}`); await api(`/api/agents/${id}`, { method: 'PUT', body: { enabled: !a.enabled } }); renderAgents(); }
      if (act === 'delete' && confirm('Delete this agent and its history?')) { await api(`/api/agents/${id}`, { method: 'DELETE' }); renderAgents(); }
      if (act === 'edit') {
        const a = await api(`/api/agents/${id}`);
        extra.innerHTML = `<div style="margin-top:12px">${agentForm(a, skills, providers)}</div>`;
        bindAgentForm(extra, id, skills, providers);
      }
      if (act === 'runs') {
        const runs = await api(`/api/runs?agentId=${id}`);
        extra.innerHTML = runs.length ? runs.map(runHtml).join('') : '<p class="muted small">No runs yet.</p>';
      }
    }));
  });
}

function agentForm(a, skills, providers) {
  return `<form>
    <div class="row"><div style="width:70px"><label>Icon</label><input name="emoji" value="${esc(a.emoji || '🤖')}"></div>
      <div class="grow"><label>Name</label><input name="name" required value="${esc(a.name || '')}" placeholder="e.g. Invoice chaser"></div></div>
    <label>What should it do?</label>
    <textarea name="instructions" required placeholder="Every Friday, check which invoices are unpaid and draft polite reminders…">${esc(a.instructions || '')}</textarea>
    <label>Short description</label><input name="description" value="${esc(a.description || '')}">
    <div class="row">
      <div class="grow"><label>Schedule</label><input name="schedule" value="${esc(a.schedule || 'daily 08:00')}" placeholder="manual · every 30m · daily 08:00 · weekdays 09:00 · weekly mon 10:00"></div>
      <div class="grow"><label>AI</label><select name="provider">
        <option value="default">Default</option>
        ${providers.map((p) => `<option value="${p.id}" ${a.provider === p.id ? 'selected' : ''}>${esc(p.name)}${p.installed ? '' : ' (not connected)'}</option>`).join('')}
      </select></div>
    </div>
    <label>Skills (overlays)</label>
    <div class="row">${skills.map((s) => `<label class="pill" style="margin:0;cursor:pointer" title="${esc(s.description)}"><input type="checkbox" name="skill" value="${s.id}" style="width:auto" ${(a.skills || []).includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div>
    <label>Tools it may use unattended (Claude only, comma separated — e.g. WebSearch, mcp__gmail__*)</label>
    <input name="tools" value="${esc((a.tools || []).join(', '))}">
    <label class="row" style="color:var(--text)"><input type="checkbox" name="learns" style="width:auto" ${a.learns === false ? '' : 'checked'}> Learn from what this agent finds</label>
    <div class="row" style="margin-top:12px"><button class="btn primary">${a.id ? 'Save' : 'Create agent'}</button></div>
  </form>`;
}

function bindAgentForm(root, id) {
  const form = $('form', root);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const body = {
      emoji: f.get('emoji'), name: f.get('name'), instructions: f.get('instructions'), description: f.get('description'),
      schedule: f.get('schedule'), provider: f.get('provider'), skills: f.getAll('skill'),
      tools: String(f.get('tools') || '').split(',').map((s) => s.trim()).filter(Boolean), learns: f.get('learns') === 'on',
    };
    try {
      await api(id ? `/api/agents/${id}` : '/api/agents', { method: id ? 'PUT' : 'POST', body });
      toast(id ? 'Saved' : 'Agent created');
      renderAgents();
    } catch (err) { toast(err.message, 6000); }
  };
}

function runHtml(r) {
  const status = r.status === 'done' ? '<span class="pill ok">done</span>' : r.status === 'error' ? '<span class="pill err">error</span>' : '<span class="pill warn">running…</span>';
  return `<div class="card">
    <div class="row"><b class="grow">${esc(r.agent_emoji || '🤖')} ${esc(r.agent_name || 'Agent')}</b>${status}</div>
    <div class="small muted">${new Date(r.started_at).toLocaleString()} · ${esc(r.trigger)}${r.provider ? ` · ${esc(r.provider)}` : ''}</div>
    ${r.output ? `<div class="output bubble">${md(r.output)}</div>` : ''}
    ${r.error ? `<div class="output" style="color:var(--err)">${esc(r.error)}</div>` : ''}
  </div>`;
}

// ---------- feed ----------
async function renderFeed() {
  const runs = await api('/api/runs');
  view.innerHTML = `<div class="page"><h1>Feed</h1><p class="sub">Everything your agents did, newest first.</p>
    ${runs.length ? runs.map(runHtml).join('') : '<div class="card muted">Nothing yet. Add an agent and press “Run now”.</div>'}</div>`;
}

// ---------- memory ----------
async function renderMemory(q = '') {
  const mems = await api(`/api/memories${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  view.innerHTML = `<div class="page">
    <h1>Memory</h1>
    <p class="sub">What Alter has learned about you. It picks this up from chats and agent runs — you can edit or remove anything.</p>
    <div class="row"><input id="memQ" class="grow" placeholder="Search memory…" value="${esc(q)}"></div>
    <form class="card" id="memAdd" style="margin-top:12px">
      <div class="row"><select name="kind" style="width:140px">${['profile', 'preference', 'routine', 'project', 'person', 'fact'].map((k) => `<option>${k}</option>`).join('')}</select>
      <input name="content" class="grow" placeholder="Teach Alter something, e.g. “I edit reels every afternoon”"><button class="btn primary">Add</button></div>
    </form>
    ${mems.map((m) => `<div class="card row" data-mem="${m.id}"><span class="pill">${m.kind}</span><div class="grow">${esc(m.content)}
      <div class="small muted">${'★'.repeat(m.importance)} · ${esc(m.source || '')} · ${ago(m.updatedAt)}</div></div>
      <button class="btn danger" data-del>✕</button></div>`).join('') || '<div class="card muted">No memories yet.</div>'}
  </div>`;
  let t;
  $('#memQ').oninput = (e) => { clearTimeout(t); t = setTimeout(() => renderMemory(e.target.value).then(() => { const i = $('#memQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 250); };
  $('#memAdd').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!String(f.get('content')).trim()) return;
    await api('/api/memories', { method: 'POST', body: { kind: f.get('kind'), content: f.get('content'), importance: 4 } });
    renderMemory(q);
  };
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    await api(`/api/memories/${b.closest('[data-mem]').dataset.mem}`, { method: 'DELETE' });
    b.closest('[data-mem]').remove();
  }));
}

// ---------- settings ----------
async function renderSettings() {
  const [status, devices] = await Promise.all([api('/api/status'), api('/api/devices')]);
  const isComputer = status.you.kind === 'computer';
  view.innerHTML = `<div class="page">
    <h1>Settings</h1>
    <p class="sub">${isComputer ? 'This is the computer running Alter — your hub.' : `This device: ${esc(status.you.name)}. Everything connected on your computer works here too.`}</p>

    <h2>AI subscriptions</h2>
    <p class="muted small">Alter uses the official apps of each AI company, logged in with your own account — no API keys, no extra cost beyond your subscription. Connect once on the computer, use it everywhere.</p>
    ${status.providers.filter((p) => p.id !== 'demo').map((p) => `<div class="card row">
      <div class="grow"><h3>${esc(p.name)} ${p.isDefault ? '<span class="pill ok">default</span>' : ''}</h3>
        <div class="small muted">${esc(p.subscription)}</div>
        <div class="small muted">${p.installed ? `● ${esc(p.version)} — ${esc(p.loginHint)}` : `○ not installed`}</div></div>
      <button class="btn" data-connect="${p.id}">${p.installed ? 'Sign in' : 'Install & sign in'}</button>
      ${p.installed && !p.isDefault ? `<button class="btn" data-default="${p.id}">Make default</button>` : ''}
    </div>`).join('')}
    <div class="row"><button class="btn" id="refreshProv">↻ Re-check</button></div>

    <h2>Learning</h2>
    <label class="row card" style="color:var(--text);margin:0"><input type="checkbox" id="learning" style="width:auto" ${status.settings.learning ? 'checked' : ''}>
      <span>Learn from my chats and agents (builds the Memory page, uses a little of your subscription in the background)</span></label>

    <h2>Devices</h2>
    ${isComputer ? `<div class="card"><p style="margin-top:0">Put Alter on your phone: phone and computer on the same Wi‑Fi, then pair.</p>
      <button class="btn primary" id="pair">Pair a phone</button><div id="pairBox"></div></div>` : ''}
    ${devices.map((d) => `<div class="card row"><div class="grow"><h3>📱 ${esc(d.name)}</h3><div class="small muted">paired ${ago(d.pairedAt)} · last seen ${ago(d.lastSeen)}</div></div>
      ${isComputer ? `<button class="btn danger" data-revoke="${d.id}">Remove</button>` : ''}</div>`).join('') || '<div class="card muted">No paired devices.</div>'}
    ${!isComputer ? '<button class="btn danger" id="unpair">Disconnect this device</button>' : ''}

    <p class="small muted" style="margin-top:32px">Alter ${esc(status.version)} · ${status.counts.memories} memories · ${status.counts.agents} agents · open source (AGPL-3.0)</p>
  </div>`;

  view.querySelectorAll('[data-connect]').forEach((b) => (b.onclick = async () => {
    const r = await api(`/api/providers/${b.dataset.connect}/connect`, { method: 'POST' });
    toast(`A terminal opened on your computer: ${r.command}. Finish signing in there, then press Re-check.`, 9000);
  }));
  view.querySelectorAll('[data-default]').forEach((b) => (b.onclick = async () => {
    await api('/api/settings', { method: 'PUT', body: { defaultProvider: b.dataset.default } });
    renderSettings();
  }));
  $('#refreshProv').onclick = async () => { await api('/api/providers?refresh=1'); renderSettings(); };
  $('#learning').onchange = (e) => api('/api/settings', { method: 'PUT', body: { learning: e.target.checked } });
  view.querySelectorAll('[data-revoke]').forEach((b) => (b.onclick = async () => { await api(`/api/devices/${b.dataset.revoke}`, { method: 'DELETE' }); renderSettings(); }));
  const unpair = $('#unpair');
  if (unpair) unpair.onclick = () => { store.set('alter.token', null); location.reload(); };
  const pair = $('#pair');
  if (pair) pair.onclick = async () => {
    const p = await api('/api/pair/start', { method: 'POST' });
    const url = p.urls[0];
    $('#pairBox').innerHTML = `<p>On your phone open <b>${esc(url || '(no network found)')}</b> or scan the code, and enter:</p>
      <div class="code">${p.code}</div><div class="small muted">valid for 5 minutes</div><div id="qr" class="qr" ${url ? '' : 'hidden'}></div>
      ${p.urls.slice(1).map((u) => `<div class="small muted">also: ${esc(u)}</div>`).join('')}`;
    if (url) renderQr($('#qr'), url);
  };
}

async function renderQr(el, text) {
  try {
    if (!window.QRCode) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    new window.QRCode(el, { text, width: 180, height: 180 });
  } catch { el.hidden = true; }
}

// ---------- pairing (phone side) ----------
function showPairing() {
  const fromHash = location.hash.match(/pair=(\d{6})/)?.[1] || '';
  document.querySelector('.nav').style.display = 'none';
  view.innerHTML = `<div class="page" style="max-width:420px;padding-top:12vh">
    <div class="empty" style="padding:0 0 20px"><span class="logo">◆</span><h1>Connect to Alter</h1>
    <p>On your computer open Alter → Settings → <b>Pair a phone</b>, then enter the 6-digit code.</p></div>
    <form class="card" id="pairForm">
      <label>Pairing code</label><input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" value="${fromHash}" required>
      <label>Name this device</label><input name="name" value="${esc(/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : 'My device')}">
      <button class="btn primary" style="width:100%;margin-top:14px">Connect</button>
    </form></div>`;
  $('#pairForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const res = await fetch('/api/pair/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: f.get('code'), name: f.get('name') }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      token = data.token;
      store.set('alter.token', token);
      history.replaceState(null, '', '/');
      location.reload();
    } catch (err) { toast(err.message); }
  };
}

// ---------- live sync between devices ----------
function connectEvents() {
  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  es.addEventListener('run.finished', (e) => {
    const r = JSON.parse(e.data);
    toast(`${r.agent_emoji || '🤖'} ${r.agent_name} ${r.status === 'done' ? 'finished' : 'failed'}`);
    if (current === 'feed' || current === 'agents') go(current);
  });
  es.addEventListener('run.started', () => { if (current === 'agents') go('agents'); });
  es.addEventListener('memory.added', (e) => { if (current === 'memory') go('memory'); else toast(`🧠 Learned: ${JSON.parse(e.data).content}`); });
  es.addEventListener('conversation.updated', () => { if (current === 'chat' && !sending) refreshConvList(); });
  es.addEventListener('device.paired', (e) => { toast(`📱 ${JSON.parse(e.data).name} connected`); if (current === 'settings') go('settings'); });
  es.onerror = () => { es.close(); setTimeout(connectEvents, 5000); };
}

// ---------- boot ----------
if (!token) showPairing();
else {
  go('chat');
  connectEvents();
}
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
