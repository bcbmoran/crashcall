/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Shared online leaderboard.
 * Scores are stored in a Google Sheet via a small Google Apps Script web app (see apps-script/Code.gs).
 * Requests use JSONP so they work from any static host without CORS set-up.
 * Ranking score = time + 30 s for each hint used + 30 s for each potentially harmful action. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const LB = (S.LB = {
    // Paste the Apps Script "Web app" URL here (ends in /exec). Leave empty to switch the leaderboard off.
    url: 'https://script.google.com/macros/s/AKfycbyIr1NwnLT2jXp7yBSLef_D5-ysqvPqROm1e9vSCVWcjGkciXw-lgqikGgj4dPeaZOj/exec',
  });
  let H = null; // helpers from app.js: { openModal, fmt, esc, store }
  LB.init = (helpers) => { H = helpers; };
  LB.enabled = () => !!LB.url && !LB.url.includes('__DEPLOYMENT_ID__');
  LB.PENALTY = 30000;
  LB.score = (ms, hints, harms) => ms + LB.PENALTY * (hints + harms);

  let seq = 0;
  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const cb = '__lb' + Date.now() + '_' + seq++;
      const s = document.createElement('script');
      const t = setTimeout(() => { cleanup(); reject(new Error('Leaderboard did not respond')); }, 12000);
      function cleanup() { clearTimeout(t); delete window[cb]; s.remove(); }
      window[cb] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error('Could not reach the leaderboard')); };
      s.src = LB.url + '?' + new URLSearchParams(Object.assign({}, params, { callback: cb, _: Date.now() }));
      document.head.append(s);
    });
  }
  LB.top = (scenario) => jsonp({ action: 'top', scenario: scenario || '', n: 10 });
  LB.add = (rec) => jsonp(Object.assign({ action: 'add' }, rec));

  // Each grade has its own board. Senior keeps the plain scenario id (compatible with earlier scores).
  const SUF = { junior: '--j', senior: '', consultant: '--c' };
  LB.key = (id, level) => id + (SUF[level] || '');
  const levelName = (lv) => (S.LEVELS && S.LEVELS[lv] ? S.LEVELS[lv].name : 'Senior trainee');
  const title = (id) => { const s = S.SCENARIOS.find((x) => x.id === id); return s ? s.title : id; };

  function scenarioTable(rows, me) {
    if (!rows || !rows.length) return '<p class="muted small">No times yet — be the first.</p>';
    return `<table class="labs lb"><thead><tr><th>#</th><th>Name</th><th>Score</th><th>Time</th><th>Hints</th><th>Harms</th><th>Date</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${me && r.name.toLowerCase() === me.toLowerCase() ? 'me' : ''}"><td>${i + 1}</td><td>${H.esc(r.name)}${r.blind ? ' <span title="Played in blind mode">🙈</span>' : ''}</td><td class="v">${H.fmt(r.score)}</td><td>${H.fmt(r.ms)}</td><td>${r.hints}</td><td>${r.harms}</td><td class="muted">${H.esc(r.when || '')}</td></tr>`).join('')}</tbody></table>`;
  }
  function overallTable(rows) {
    if (!rows || !rows.length) return '<p class="muted small">No times yet.</p>';
    return `<table class="labs lb"><thead><tr><th>#</th><th>Name</th><th>Scenarios stabilised</th><th>Total best score</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${H.esc(r.name)}</td><td class="v">${r.count}</td><td>${H.fmt(r.total)}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---- Debrief panel ----
  LB.debrief = (el, r) => {
    if (!el || !LB.enabled() || r.scn.tutorial) return;
    const score = LB.score(r.ms, r.hints, r.harms);
    const savedName = H.store.get('lbName', '');
    const canSubmit = r.outcome === 'win';
    el.innerHTML = `<h3>🏆 Leaderboard — ${levelName(r.level)} grade</h3>
      ${canSubmit ? `<div class="lb-form"><label for="lbName">Your name</label><input id="lbName" maxlength="30" autocomplete="nickname" placeholder="e.g. Ben M (ST2)" value="${H.esc(savedName)}"><button class="btn primary" id="lbSubmit">Add my time</button></div>
      <p class="muted small">Your score: <b>${H.fmt(score)}</b> = time ${H.fmt(r.ms)} + 30 s × ${r.hints} hint${r.hints === 1 ? '' : 's'} + 30 s × ${r.harms} harmful action${r.harms === 1 ? '' : 's'}${r.blind ? ' · played blind 🙈' : ''}. Names are public — don't enter patient or personal details.</p>`
      : '<p class="muted small">Only stabilised patients can go on the leaderboard. Try again!</p>'}
      <div id="lbTable"><p class="muted small">Loading leaderboard…</p></div>`;
    const key = LB.key(r.scn.id, r.level || 'senior');
    const showTop = (me) => LB.top(key).then((d) => { const t = el.querySelector('#lbTable'); if (t) t.innerHTML = d.ok ? scenarioTable(d.rows, me) : `<p class="muted small">${H.esc(d.error || 'Leaderboard unavailable')}</p>`; }).catch((err) => { const t = el.querySelector('#lbTable'); if (t) t.innerHTML = `<p class="muted small">${H.esc(err.message)}</p>`; });
    showTop(savedName);
    const btn = el.querySelector('#lbSubmit');
    if (btn) btn.onclick = () => {
      const name = el.querySelector('#lbName').value.replace(/[<>]/g, '').trim().slice(0, 30);
      if (!name) { el.querySelector('#lbName').focus(); return; }
      H.store.set('lbName', name);
      btn.disabled = true; btn.textContent = 'Saving…';
      LB.add({ name, scenario: key, ms: Math.round(r.ms), hints: r.hints, harms: r.harms, blind: r.blind ? 1 : 0 })
        .then((d) => {
          if (!d.ok) throw new Error(d.error || 'Could not save');
          btn.textContent = 'Saved ✓';
          el.querySelector('#lbTable').innerHTML = scenarioTable(d.rows, name);
        })
        .catch((err) => { btn.disabled = false; btn.textContent = 'Try again'; el.querySelector('#lbTable').insertAdjacentHTML('afterbegin', `<p class="muted small">${H.esc(err.message)}</p>`); });
    };
  };

  // ---- Leaderboard browser (home page) ----
  LB.show = () => {
    if (!LB.enabled()) { H.openModal('Leaderboard', '<p>The leaderboard has not been connected yet.</p>'); return; }
    const opts = S.SCENARIOS.filter((s) => !s.tutorial).map((s) => `<option value="${s.id}">${H.esc(s.title)}</option>`).join('');
    H.openModal('🏆 Leaderboard', `<div class="lb-form"><label for="lbSel">Show</label><select id="lbSel"><option value="">Overall — most scenarios stabilised</option>${opts}</select><label for="lbLv">Grade</label><select id="lbLv">${Object.entries(SUF).map(([k]) => `<option value="${k}" ${k === 'senior' ? 'selected' : ''}>${levelName(k)}</option>`).join('')}</select></div><div id="lbBody"><p class="muted small">Loading…</p></div><p class="muted small">Score = time + 30 s per hint and per potentially harmful action. Each person's best run per scenario and grade counts; the overall table counts every scenario-grade stabilised. 🙈 = played in blind mode.</p>`);
    const sel = document.getElementById('lbSel'), lv = document.getElementById('lbLv');
    const load = () => {
      lv.disabled = !sel.value;
      const id = sel.value ? LB.key(sel.value, lv.value) : '', body = document.getElementById('lbBody');
      body.innerHTML = '<p class="muted small">Loading…</p>';
      LB.top(id).then((d) => { body.innerHTML = !d.ok ? `<p>${H.esc(d.error || 'Unavailable')}</p>` : id ? scenarioTable(d.rows) : overallTable(d.overall); })
        .catch((err) => { body.innerHTML = `<p>${H.esc(err.message)}</p>`; });
    };
    sel.onchange = load; lv.onchange = load; load();
  };
})();
