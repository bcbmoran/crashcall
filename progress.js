/* Progress tracking.
 * Every finished scenario is recorded on this device (localStorage). When the user is signed in
 * (account.js + Firebase), attempts are also saved to their account so progress follows them
 * across devices. No patient data is involved — only scenario results. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const KEY = 'resussim.history';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const save = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-1500))); } catch (e) { /* storage unavailable */ } };
  const fmt = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const FIELD = { EM: 'Emergency medicine', ICU: 'Critical care', Anaes: 'Anaesthesia', Paeds: 'Paediatrics' };
  const LV = { junior: 'Junior', senior: 'Senior', consultant: 'Consultant' };

  const P = (S.Progress = {
    user: null, // { uid, name, email } when signed in
    remote: null, // { add(rec), list(), removeAll() } supplied by account.js
    cloud: null, // attempts loaded from the account
    enabled: false, // true once Firebase is configured
  });

  P.attempts = () => (P.user && P.cloud ? P.cloud : load().filter((a) => !a.owner || !P.user || a.owner === P.user.uid));

  P.record = async function (rec) {
    rec.rid = rec.rid || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const loc = load();
    const entry = Object.assign({}, rec);
    if (P.user) entry.owner = P.user.uid;
    loc.push(entry); save(loc);
    if (P.user && P.remote) {
      try { await P.remote.add(rec); if (P.cloud) P.cloud.push(rec); markSynced([rec.rid], P.user.uid); return 'cloud'; } catch (e) { console.warn('Could not save to account', e); return 'local-error'; }
    }
    return 'local';
  };
  function markSynced(ids, uid) { const loc = load(); loc.forEach((a) => { if (ids.includes(a.rid)) { a.synced = uid; a.owner = uid; } }); save(loc); }

  // On sign-in: upload attempts made on this device as a guest, then load the account's history.
  P.signedIn = async function (user) {
    P.user = user; P.cloud = null;
    let added = 0;
    try {
      const pending = load().filter((a) => !a.synced && (!a.owner || a.owner === user.uid));
      for (const a of pending) { const r = Object.assign({}, a); delete r.synced; delete r.owner; await P.remote.add(r); added++; }
      if (pending.length) markSynced(pending.map((a) => a.rid), user.uid);
      P.cloud = await P.remote.list();
    } catch (e) { console.warn('Progress sync failed', e); }
    P.refreshUI();
    return added;
  };
  P.signedOut = function () { P.user = null; P.cloud = null; P.refreshUI(); };
  // Forget this device's copy of an account's attempts (used when the account is deleted).
  P.forgetLocal = function (uid) { save(load().filter((a) => a.owner !== uid && a.synced !== uid)); };

  P.refreshUI = function () {
    const b = document.getElementById('acctBtn');
    if (b) { b.hidden = !P.enabled; b.textContent = P.user ? '👤 ' + (P.user.name || P.user.email || 'Account').split(' ')[0] : '👤 Sign in'; }
    if (P.isOpen && P.isOpen()) P.open();
  };

  // ---------------- summary maths ----------------
  function summarise(list, level) {
    const scns = (S.SCENARIOS || []).filter((s) => !s.tutorial);
    const byId = Object.fromEntries(scns.map((s) => [s.id, s]));
    const at = list.filter((a) => byId[a.sid] && (!level || a.level === level)).sort((a, b) => (a.at < b.at ? -1 : 1));
    const per = {};
    at.forEach((a) => {
      const p = (per[a.sid] = per[a.sid] || { n: 0, wins: 0, best: null, last: null, lastOutcome: null });
      p.n++; p.last = a.at; p.lastOutcome = a.outcome;
      if (a.outcome === 'win') { p.wins++; if (p.best == null || a.ms < p.best) p.best = a.ms; }
    });
    const won = new Set(Object.keys(per).filter((k) => per[k].wins));
    const fields = Object.keys(FIELD).map((f) => { const all = scns.filter((s) => s.field === f); return { f, total: all.length, done: all.filter((s) => won.has(s.id)).length }; });
    // critical actions missed repeatedly (seen at least twice, missed at least half the time)
    const crit = {};
    at.slice(-150).forEach((a) => (a.crit || []).forEach((c) => { const k = c.t; const x = (crit[k] = crit[k] || { t: k, seen: 0, miss: 0, sids: new Set() }); x.seen++; if (!c.d) { x.miss++; x.sids.add(a.sid); } }));
    const gaps = Object.values(crit).filter((x) => x.seen >= 2 && x.miss / x.seen >= 0.5).sort((a, b) => b.miss - a.miss || b.seen - a.seen).slice(0, 8);
    const harms = at.reduce((n, a) => n + (a.harms || 0), 0);
    const rcuk = (S.RCUK ? S.RCUK.sets : []).flatMap((s) => s.items.filter((it) => it[2] && it[2].length).map((it) => ({ set: s.title, name: it[0], ids: it[2], done: it[2].some((id) => won.has(id)), tried: it[2].some((id) => per[id]) })));
    return { scns, byId, at, per, won, fields, gaps, harms, rcuk, totalMs: at.reduce((n, a) => n + (a.ms || 0), 0) };
  }

  P.summarise = summarise;
  // ---------------- page ----------------
  let level = '';
  P.html = function () {
    const blind = (() => { try { return JSON.parse(localStorage.getItem('resussim.blind') || 'false'); } catch (e) { return false; } })();
    const d = summarise(P.attempts(), level);
    const who = P.user
      ? `<p class="muted small">Signed in as <b>${esc(P.user.name || P.user.email)}</b> — progress is saved to your account and follows you across devices.</p>`
      : `<p class="muted small">You're not signed in, so this progress is saved <b>on this device only</b>.${P.enabled ? ' <button class="btn sm" data-acct>Sign in or create an account</button> to keep it across devices.' : ''}</p>`;
    const name = (sid) => { const s = d.byId[sid]; return s ? esc(s.title) : esc(sid); };
    const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
    const recent = d.at.slice(-12).reverse();
    const played = Object.entries(d.per).sort((a, b) => (a[1].last < b[1].last ? 1 : -1));
    const unplayed = d.scns.filter((s) => !d.per[s.id]);
    return `<div class="prog">
      ${who}
      <div class="prog-filter"><label>Grade <select data-plevel>${[['', 'All grades'], ['junior', 'Junior'], ['senior', 'Senior'], ['consultant', 'Consultant']].map(([v, t]) => `<option value="${v}" ${v === level ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${d.at.length ? '<button class="btn sm" data-pcsv>Download CSV</button>' : ''}</div>
      ${!d.at.length ? '<p>No scenarios finished yet' + (level ? ' at this grade' : '') + '. Your results appear here after each debrief.</p>' : `
      <div class="stat-row">
        <div class="stat"><span class="muted small">Scenarios stabilised</span><b>${d.won.size}/${d.scns.length}</b></div>
        <div class="stat"><span class="muted small">Attempts</span><b>${d.at.length}</b></div>
        <div class="stat"><span class="muted small">Success rate</span><b>${pct(d.at.filter((a) => a.outcome === 'win').length, d.at.length)}%</b></div>
        <div class="stat"><span class="muted small">Time in resus</span><b>${Math.round(d.totalMs / 60000)} min</b></div>
        <div class="stat"><span class="muted small">Harmful actions</span><b>${d.harms}</b></div>
      </div>
      <h3>By field</h3>
      <div class="prog-bars">${d.fields.map((f) => `<div class="pbar"><span>${FIELD[f.f]}</span><div class="pbar-track"><div class="pbar-fill" style="width:${pct(f.done, f.total)}%"></div></div><span class="muted small">${f.done}/${f.total}</span></div>`).join('')}</div>
      <h3>RCUK 2025 algorithms practised</h3>
      <p class="muted small">${d.rcuk.filter((r) => r.done).length} of ${d.rcuk.length} algorithms have at least one scenario stabilised.</p>
      <ul class="prog-rcuk">${d.rcuk.map((r) => `<li class="${r.done ? 'ok' : r.tried ? 'part' : ''}">${esc(r.name)}</li>`).join('')}</ul>
      <h3>Things you keep missing</h3>
      ${d.gaps.length ? `<ul class="prog-gaps">${d.gaps.map((g) => `<li><b>${esc(g.t)}</b> <span class="muted small">— missed ${g.miss} of ${g.seen} times${blind ? '' : ' (' + [...g.sids].map(name).join(', ') + ')'}</span></li>`).join('')}</ul>` : '<p class="muted small">Nothing repeated yet — critical actions you miss more than once will show here.</p>'}
      <h3>Recent attempts</h3>
      <table class="prog-table"><thead><tr><th>When</th><th>Scenario</th><th>Grade</th><th>Result</th><th>Time</th><th>Critical</th></tr></thead><tbody>
      ${recent.map((a) => `<tr><td>${new Date(a.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td><td>${name(a.sid)}</td><td>${LV[a.level] || ''}</td><td class="${a.outcome === 'win' ? 'ok' : 'miss'}">${a.outcome === 'win' ? 'Stabilised' : a.outcome === 'arrest' ? 'Arrest' : 'Ended'}</td><td>${fmt(a.ms)}</td><td>${(a.crit || []).filter((c) => c.d).length}/${(a.crit || []).length}</td></tr>`).join('')}
      </tbody></table>
      <details><summary>All scenarios played (${played.length})</summary>
      <table class="prog-table"><thead><tr><th>Scenario</th><th>Attempts</th><th>Stabilised</th><th>Best time</th><th>Last played</th></tr></thead><tbody>
      ${played.map(([sid, p]) => `<tr><td>${name(sid)}</td><td>${p.n}</td><td>${p.wins}</td><td>${p.best != null ? fmt(p.best) : '—'}</td><td>${new Date(p.last).toLocaleDateString('en-GB')}</td></tr>`).join('')}
      </tbody></table></details>
      ${blind ? `<p class="muted small">${unplayed.length} scenarios not tried yet (names hidden in blind mode).</p>` : `<details><summary>Not tried yet (${unplayed.length})</summary><div class="prog-todo">${unplayed.map((s) => `<button class="btn sm" data-pplay="${s.id}">${esc(s.title)}</button>`).join('')}</div></details>`}`}
    </div>`;
  };

  P.open = function () {
    if (!S.ui) return;
    S.ui.openModal('My progress', P.html());
    const body = document.getElementById('modalBody');
    const sel = body.querySelector('[data-plevel]'); if (sel) sel.onchange = () => { level = sel.value; P.open(); };
    const a = body.querySelector('[data-acct]'); if (a) a.onclick = () => S.Account && S.Account.open();
    const c = body.querySelector('[data-pcsv]'); if (c) c.onclick = csv;
    body.querySelectorAll('[data-pplay]').forEach((b) => (b.onclick = () => { S.ui.closeModal(); S.ui.go(b.dataset.pplay); }));
  };
  P.isOpen = () => { const m = document.getElementById('modal'), t = document.getElementById('modalTitle'); return m && !m.hidden && t && t.textContent === 'My progress'; };

  function csv() {
    const d = summarise(P.attempts(), level);
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Date', 'Scenario', 'Field', 'Grade', 'Outcome', 'Time (s)', 'Critical actions done', 'Critical actions total', 'Missed critical actions', 'Harmful actions', 'Hints']];
    d.at.forEach((a) => { const s = d.byId[a.sid]; const cr = a.crit || []; rows.push([a.at, s ? s.title : a.sid, s ? FIELD[s.field] : '', LV[a.level] || '', a.outcome, Math.round(a.ms / 1000), cr.filter((c) => c.d).length, cr.length, cr.filter((c) => !c.d).map((c) => c.t).join('; '), a.harms || 0, a.hints || 0]); });
    const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const u = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = u; l.download = 'crashcall-progress.csv'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('#progBtn')) P.open();
    else if (ev.target.closest('#acctBtn')) S.Account && S.Account.open();
  });
})();
