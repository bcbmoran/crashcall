/* Admin dashboard — only for the site owner's account (see ADMINS in account.js and isAdmin() in the
 * Firestore rules; the rules are what actually protect the data).
 * Open with the 🛠 Admin button on the home screen, or bcbmoran.github.io/crashcall/#admin */
(function () {
  const S = (window.Sim = window.Sim || {});
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (ms) => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '—');
  const LV = { junior: 'Junior', senior: 'Senior', consultant: 'Consultant' };
  const FIELD = { EM: 'EM', ICU: 'ICU', Anaes: 'Anaes', Paeds: 'Paeds' };

  let data = null, level = '', view = 'users', sel = null, loading = false, err = '';
  const A = (S.Admin = {});

  const title = 'CrashCall admin';
  const isOpen = () => { const t = document.getElementById('modalTitle'), m = document.getElementById('modal'); return m && !m.hidden && t && t.textContent === title; };

  async function load() {
    loading = true; err = ''; render();
    try { data = await S.AdminData.load(); } catch (e) { err = e && e.code === 'permission-denied' ? 'The database refused access — check the Firestore rules include the admin rule.' : String((e && e.message) || e); }
    loading = false; render();
  }

  A.open = function () {
    if (!S.ui) return;
    if (!S.AdminData) { S.ui.openModal(title, '<p>Accounts aren’t set up on this site.</p>'); return; }
    if (!S.AdminData.isAdmin()) {
      S.ui.openModal(title, `<p>This page is only for the CrashCall site owner.</p>${S.Progress && S.Progress.user ? '<p class="muted small">You are signed in with an account that doesn’t have admin access.</p>' : '<p><button class="btn primary" data-acct>Sign in</button></p>'}`);
      const b = document.querySelector('#modalBody [data-acct]'); if (b) b.onclick = () => S.Account.open();
      return;
    }
    S.ui.openModal(title, '<div id="adminHost"></div>');
    if (!data) load(); else render();
  };
  A.authChanged = function () { data = null; if (location.hash === '#admin' && S.ui) A.open(); };

  function crunch() {
    const scns = (S.SCENARIOS || []).filter((s) => !s.tutorial);
    const byId = Object.fromEntries(scns.map((s) => [s.id, s]));
    const at = data.attempts.filter((a) => byId[a.sid] && (!level || a.level === level));
    const now = Date.now();
    const users = data.users.map((u) => {
      const mine = at.filter((a) => a.uid === u.uid);
      const won = new Set(mine.filter((a) => a.outcome === 'win').map((a) => a.sid));
      const last = mine.reduce((m, a) => (a.at > m ? a.at : m), u.lastActive || '');
      return Object.assign({}, u, { n: mine.length, wins: mine.filter((a) => a.outcome === 'win').length, uniq: won.size, last, mine });
    }).sort((a, b) => (a.last < b.last ? 1 : -1));
    const active = (d) => users.filter((u) => u.last && now - new Date(u.last) < d * 864e5).length;
    const per = {};
    at.forEach((a) => {
      const p = (per[a.sid] = per[a.sid] || { n: 0, wins: 0, ms: 0, users: new Set(), crit: {} });
      p.n++; p.users.add(a.uid); if (a.outcome === 'win') { p.wins++; p.ms += a.ms || 0; }
      (a.crit || []).forEach((c) => { const x = (p.crit[c.t] = p.crit[c.t] || { seen: 0, miss: 0 }); x.seen++; if (!c.d) x.miss++; });
    });
    const scen = Object.entries(per).map(([sid, p]) => {
      const worst = Object.entries(p.crit).sort((a, b) => b[1].miss / b[1].seen - a[1].miss / a[1].seen || b[1].miss - a[1].miss)[0];
      return { sid, title: byId[sid].title, field: byId[sid].field, n: p.n, people: p.users.size, rate: p.wins / p.n, avg: p.wins ? p.ms / p.wins : null, worst: worst && worst[1].miss ? `${worst[0]} (missed ${worst[1].miss}/${worst[1].seen})` : '' };
    }).sort((a, b) => a.rate - b.rate || b.n - a.n);
    const crit = {};
    at.forEach((a) => (a.crit || []).forEach((c) => { const k = c.t + '|' + a.sid; const x = (crit[k] = crit[k] || { t: c.t, sid: a.sid, seen: 0, miss: 0 }); x.seen++; if (!c.d) x.miss++; }));
    const gaps = Object.values(crit).filter((x) => x.seen >= 2 && x.miss).sort((a, b) => b.miss / b.seen - a.miss / a.seen || b.miss - a.miss).slice(0, 15);
    return { scns, byId, at, users, scen, gaps, active, untried: scns.filter((s) => !per[s.id]) };
  }

  function render() {
    const host = document.getElementById('adminHost'); if (!host || !isOpen()) return;
    if (loading) { host.innerHTML = '<p class="muted">Loading users and results…</p>'; return; }
    if (err) { host.innerHTML = `<p class="bad">${esc(err)}</p><button class="btn" data-reload>Try again</button>`; host.querySelector('[data-reload]').onclick = load; return; }
    if (!data) return;
    const d = crunch();
    const tabs = [['users', `Users (${d.users.length})`], ['scen', 'Scenarios'], ['gaps', 'Missed actions']];
    let body = '';
    if (sel) {
      const u = d.users.find((x) => x.uid === sel);
      const list = (u ? u.mine : []).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
      const sm = S.Progress.summarise(list, '');
      body = `<p><button class="btn sm" data-back>← All users</button></p>
        <h3>${esc((u && (u.name || u.email)) || 'Unknown user')}</h3>
        <p class="muted small">${esc(u && u.email)} · joined ${day(u && u.created)} · last active ${day(u && u.last)} · ${esc((u && u.provider) || '')}</p>
        <div class="stat-row"><div class="stat"><span class="muted small">Stabilised</span><b>${sm.won.size}/${sm.scns.length}</b></div><div class="stat"><span class="muted small">Attempts</span><b>${list.length}</b></div><div class="stat"><span class="muted small">Success</span><b>${pct(list.filter((a) => a.outcome === 'win').length, list.length)}</b></div><div class="stat"><span class="muted small">Harms</span><b>${sm.harms}</b></div></div>
        ${sm.gaps.length ? `<h4>Repeatedly missed</h4><ul>${sm.gaps.map((g) => `<li>${esc(g.t)} <span class="muted small">— ${g.miss}/${g.seen}</span></li>`).join('')}</ul>` : ''}
        <table class="prog-table"><thead><tr><th>Date</th><th>Scenario</th><th>Grade</th><th>Result</th><th>Time</th><th>Critical</th><th>Harms</th><th>Hints</th></tr></thead><tbody>
        ${list.map((a) => `<tr><td>${day(a.at)}</td><td>${esc(d.byId[a.sid] ? d.byId[a.sid].title : a.sid)}</td><td>${LV[a.level] || ''}</td><td class="${a.outcome === 'win' ? 'ok' : 'miss'}">${a.outcome === 'win' ? 'Stabilised' : a.outcome === 'arrest' ? 'Arrest' : 'Ended'}</td><td>${fmt(a.ms)}</td><td>${(a.crit || []).filter((c) => c.d).length}/${(a.crit || []).length}</td><td>${a.harms || 0}</td><td>${a.hints || 0}</td></tr>`).join('')}
        </tbody></table>`;
    } else if (view === 'users') {
      body = `<table class="prog-table adm-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Last active</th><th>Attempts</th><th>Stabilised</th><th>Success</th></tr></thead><tbody>
        ${d.users.map((u) => `<tr data-user="${esc(u.uid)}"><td>${esc(u.name || '—')}</td><td>${esc(u.email || u.uid.slice(0, 8) + '…')}</td><td>${day(u.created)}</td><td>${day(u.last)}</td><td>${u.n}</td><td>${u.uniq}/${d.scns.length}</td><td>${pct(u.wins, u.n)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No users yet.</td></tr>'}
        </tbody></table><p class="muted small">Click a user to see their attempts.</p>`;
    } else if (view === 'scen') {
      body = `<p class="muted small">Hardest first (lowest success rate). ${d.untried.length} scenarios haven’t been played by anyone yet.</p>
        <table class="prog-table"><thead><tr><th>Scenario</th><th>Field</th><th>Attempts</th><th>People</th><th>Success</th><th>Avg time (wins)</th><th>Most-missed critical action</th></tr></thead><tbody>
        ${d.scen.map((s) => `<tr><td>${esc(s.title)}</td><td>${FIELD[s.field] || ''}</td><td>${s.n}</td><td>${s.people}</td><td>${Math.round(s.rate * 100)}%</td><td>${s.avg != null ? fmt(s.avg) : '—'}</td><td class="small">${esc(s.worst)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No results yet.</td></tr>'}
        </tbody></table>
        ${d.untried.length ? `<details><summary>Not played yet (${d.untried.length})</summary><p class="small">${d.untried.map((s) => esc(s.title)).join(' · ')}</p></details>` : ''}`;
    } else {
      body = `<p class="muted small">Critical actions missed most often across all users (seen at least twice).</p>
        <table class="prog-table"><thead><tr><th>Critical action</th><th>Scenario</th><th>Missed</th></tr></thead><tbody>
        ${d.gaps.map((g) => `<tr><td>${esc(g.t)}</td><td>${esc(d.byId[g.sid].title)}</td><td>${g.miss}/${g.seen} (${Math.round((100 * g.miss) / g.seen)}%)</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Not enough data yet.</td></tr>'}
        </tbody></table>`;
    }
    host.innerHTML = `<div class="admin">
      <div class="stat-row">
        <div class="stat"><span class="muted small">Users</span><b>${d.users.length}</b></div>
        <div class="stat"><span class="muted small">Active 7 days</span><b>${d.active(7)}</b></div>
        <div class="stat"><span class="muted small">Active 30 days</span><b>${d.active(30)}</b></div>
        <div class="stat"><span class="muted small">Attempts</span><b>${d.at.length}</b></div>
        <div class="stat"><span class="muted small">Success rate</span><b>${pct(d.at.filter((a) => a.outcome === 'win').length, d.at.length)}</b></div>
      </div>
      <div class="prog-filter"><div class="seg adm-tabs">${tabs.map(([k, t]) => `<button class="${!sel && view === k ? 'on' : ''}" data-view="${k}">${t}</button>`).join('')}</div>
        <span><label>Grade <select data-alevel>${[['', 'All'], ['junior', 'Junior'], ['senior', 'Senior'], ['consultant', 'Consultant']].map(([v, t]) => `<option value="${v}" ${v === level ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <button class="btn sm" data-refresh>↻ Refresh</button> <button class="btn sm" data-acsv>Download CSV</button></span></div>
      ${body}
      <p class="muted small">Only your account can see this page. Results are personal data — use them for improving CrashCall and supporting teaching, as the privacy note tells users.</p>
    </div>`;
    host.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { view = b.dataset.view; sel = null; render(); }));
    host.querySelectorAll('[data-user]').forEach((r) => (r.onclick = () => { sel = r.dataset.user; render(); }));
    const bk = host.querySelector('[data-back]'); if (bk) bk.onclick = () => { sel = null; render(); };
    host.querySelector('[data-alevel]').onchange = (ev) => { level = ev.target.value; render(); };
    host.querySelector('[data-refresh]').onclick = load;
    host.querySelector('[data-acsv]').onclick = () => csv(d);
  }

  function csv(d) {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const um = Object.fromEntries(d.users.map((u) => [u.uid, u]));
    const rows = [['Date', 'Name', 'Email', 'Scenario', 'Field', 'Grade', 'Outcome', 'Time (s)', 'Critical done', 'Critical total', 'Missed critical actions', 'Harms', 'Hints']];
    d.at.slice().sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((a) => { const u = um[a.uid] || {}, s = d.byId[a.sid], cr = a.crit || []; rows.push([a.at, u.name, u.email, s ? s.title : a.sid, s ? s.field : '', LV[a.level] || '', a.outcome, Math.round((a.ms || 0) / 1000), cr.filter((c) => c.d).length, cr.length, cr.filter((c) => !c.d).map((c) => c.t).join('; '), a.harms || 0, a.hints || 0]); });
    const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const u = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = u; l.download = 'crashcall-all-results.csv'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }

  document.addEventListener('click', (ev) => { if (ev.target.closest('#adminBtn')) A.open(); });
  window.addEventListener('hashchange', () => { if (location.hash === '#admin') A.open(); });
})();
