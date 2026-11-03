/* UI controller: menu, simulation loop, stopwatch, controls, investigations, hints and debrief. */
(function () {
  const S = window.Sim;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const FIELD = { EM: 'Emergency medicine', ICU: 'Critical care', Anaes: 'Anaesthesia', Paeds: 'Paediatrics', Tutorial: 'Tutorial' };
  const SETTING = { ed: 'ED resus', icu: 'ICU', theatre: 'Theatre', ward: 'Ward' };
  const SHOCKS = ['Hypovolaemic', 'Distributive', 'Cardiogenic', 'Obstructive', 'Other'];
  const store = {
    get(k, d) { try { const v = localStorage.getItem('resussim.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('resussim.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const fmt = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
  const shockKey = (s) => (s.shock ? s.shock.split(' ')[0] : 'Other');

  // ---------------- theme ----------------
  const savedTheme = store.get('theme', null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nx; store.set('theme', nx);
  };

  // ---------------- home ----------------
  const filt = { field: 'All', shock: 'All' };
  function chips(el, list, key) {
    el.innerHTML = ['All', ...list].map((x) => `<button class="chip ${filt[key] === x ? 'on' : ''}" data-v="${x}">${x === 'All' ? (key === 'field' ? 'All fields' : 'All types') : FIELD[x] || x}</button>`).join('');
    $$('.chip', el).forEach((b) => (b.onclick = () => { filt[key] = b.dataset.v; renderHome(); }));
  }
  function renderHome() {
    chips($('#fieldChips'), ['EM', 'ICU', 'Anaes', 'Paeds'], 'field');
    if (blindOn()) { filt.shock = 'All'; $('#shockChips').innerHTML = ''; } else chips($('#shockChips'), SHOCKS, 'shock');
    const best = store.get('best', {});
    const list = S.SCENARIOS.filter((s) => (filt.field === 'All' || s.field === filt.field) && (filt.shock === 'All' || shockKey(s) === filt.shock));
    $('#scnGrid').innerHTML = list.map((s) => `<button class="scn" data-id="${s.id}">
        <div class="meta"><span class="tag ${s.field}">${FIELD[s.field]}</span><span>${blindOn() && !s.tutorial ? '' : esc(s.shock || s.category || '')}</span></div>
        <h3>${blindOn() && !s.tutorial ? 'Hidden case ' + caseCode(s.id).toUpperCase() : esc(s.title)}</h3><p>${esc(s.stem)}</p>
        <div class="meta"><span class="diff" title="Difficulty">${'●'.repeat(s.difficulty)}${'○'.repeat(3 - s.difficulty)}</span>${best[s.id] ? `<span>Best ${fmt(best[s.id])}</span>` : ''}</div></button>`).join('') || '<p class="muted">No scenarios match these filters.</p>';
    $$('.scn').forEach((b) => (b.onclick = () => go(b.dataset.id)));
  }
  const blindOn = () => !!store.get('blind', false);
  const caseCode = (id) => (S.SCENARIOS.findIndex((x) => x.id === id) * 7919 + 1013).toString(36);
  const fromCode = (c) => { const i = (parseInt(c, 36) - 1013) / 7919; return S.SCENARIOS[i] ? S.SCENARIOS[i].id : null; };
  // ---- grade-based difficulty ----
  const levelId = () => (S.LEVELS[store.get('level', 'senior')] ? store.get('level', 'senior') : 'senior');
  function renderLevels() {
    const seg = $('#levelSeg'); if (!seg) return;
    seg.innerHTML = Object.values(S.LEVELS).map((l) => `<button role="radio" aria-checked="${l.id === levelId()}" class="${l.id === levelId() ? 'on' : ''}" data-lv="${l.id}">${l.name}<small>${l.who}</small></button>`).join('');
    $('#levelBlurb').textContent = S.LEVELS[levelId()].blurb;
    $$('[data-lv]', seg).forEach((b) => (b.onclick = () => { store.set('level', b.dataset.lv); renderLevels(); }));
  }
  renderLevels();
  const bt = $('#blindToggle'); if (bt) { bt.checked = blindOn(); bt.onchange = () => { store.set('blind', bt.checked); renderHome(); }; }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  $('#randomAll').onclick = () => go(pick(S.SCENARIOS.filter((s) => !s.tutorial)).id);
  const tb = $('#tutBtn'); if (tb) tb.onclick = () => go('tutorial');
  $$('[data-field]').forEach((b) => (b.onclick = () => go(pick(S.SCENARIOS.filter((s) => s.field === b.dataset.field)).id, b.dataset.field)));
  function go(id, field) { const s = S.SCENARIOS.find((x) => x.id === id); location.hash = blindOn() && s && !s.tutorial ? 'case/' + caseCode(id) : 'play/' + id; state.fieldMode = field || null; }

  // ---------------- sim state ----------------
  const state = { scn: null, eng: null, mon: null, pv: null, running: false, paused: true, elapsed: 0, last: 0, acc: 0, uiT: 0, hints: 0, results: [], tab: 'exam', fieldMode: null, stopAnim: null, hintTimer: null };

  function start(id) {
    const scn = S.SCENARIOS.find((s) => s.id === id);
    if (!scn) { location.hash = ''; return; }
    closeModal();
    $('#home').classList.remove('active'); $('#sim').classList.add('active');
    window.scrollTo(0, 0);
    const eng = new S.Engine(scn, { level: scn.tutorial ? 'senior' : levelId() });
    Object.assign(state, { scn, eng, running: true, paused: true, elapsed: 0, acc: 0, hints: 0, results: [], tab: 'exam', ended: false, blind: blindOn() && !scn.tutorial, nudgeT: 0 });
    const lvT = $('#scnLevel'); if (lvT) { lvT.textContent = scn.tutorial ? '' : eng.L.name; lvT.className = 'tag lvl ' + eng.level; lvT.hidden = !!scn.tutorial; }
    $('#scnTitle').textContent = state.blind ? 'Unknown case (blind mode)' : scn.title;
    $('#scnField').textContent = FIELD[scn.field]; $('#scnField').className = 'tag ' + scn.field;
    $('#stem').textContent = scn.stem;
    $('#briefField').textContent = FIELD[scn.field] + (state.blind ? '' : scn.shock ? ' · ' + scn.shock : scn.category ? ' · ' + scn.category : '');
    $('#briefField').className = 'tag ' + scn.field;
    $('#briefTitle').textContent = state.blind ? 'Unknown case' : scn.title; $('#briefStem').textContent = scn.stem + (scn.tutorial ? '' : `\n\nGrade: ${eng.L.name} — ${eng.L.blurb}`);
    $('#briefing').hidden = false;
    $('#log').innerHTML = '';
    $('#toasts').innerHTML = '';
    state.mon = new S.Monitor($('#monitor'), eng);
    state.mon.sound = store.get('sound', false);
    $('#soundBtn').textContent = state.mon.sound ? '🔊' : '🔇';
    state.pv = new S.PatientView($('#patientView'), eng, scn);
    eng.on(onEvent);
    setTab('exam', true);
    state.coachI = null; renderCoach();
    renderPumps();
    updateUI(true);
    $('#pauseBtn').textContent = '❚❚';
  }
  $('#startBtn').onclick = () => { $('#briefing').hidden = true; if (state.scn && state.scn.coach) { state.coachI = 0; renderCoach(); } state.paused = false; state.last = performance.now(); logLine(0, 'Scenario started — patient handed over.', 'info'); };

  function onEvent(ev) {
    if (ev.type === 'end') { logLine(ev.t, ev.text, ev.kind); setTimeout(() => finish(ev.outcome), 900); return; }
    logLine(ev.t, ev.text, ev.kind);
    if (ev.type === 'msg' && ev.kind !== 'act') toast(ev.text, ev.kind);
    if (['drug', 'inf', 'fluid', 'action', 'vent'].includes(ev.type)) { renderPumps(); if (!(document.activeElement && $('#tabBody').contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) renderTab(); }
  }
  function logLine(t, text, kind) {
    const li = document.createElement('li');
    li.className = kind || '';
    li.innerHTML = `<span class="t">${fmt(state.elapsed).slice(0, 5)}</span><span>${esc(text)}</span>`;
    const log = $('#log'); log.prepend(li);
  }
  function toast(text, kind) {
    const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = text;
    $('#toasts').append(d);
    setTimeout(() => d.remove(), 4200);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  }

  // ---------------- main loop ----------------
  function loop(now) {
    requestAnimationFrame(loop);
    if (!state.eng || !$('#sim').classList.contains('active')) { state.last = now; return; }
    const dt = Math.min(0.1, (now - state.last) / 1000);
    state.last = now;
    if (!state.paused) {
      if (!state.eng.outcome) state.elapsed += dt * 1000;
      state.acc += dt;
      while (state.acc >= 0.1) { state.eng.tick(0.1); state.acc -= 0.1; }
      state.mon.frame(dt);
    }
    state.uiT += dt;
    if (state.uiT > 0.25) { state.uiT = 0; updateUI(); }
  }
  requestAnimationFrame(loop);

  function updateUI(force) {
    const e = state.eng; if (!e) return;
    $('#stopwatch').textContent = fmt(state.elapsed);
    $('#stopwatch').classList.toggle('paused', state.paused);
    state.pv.update();
    const p = e.p;
    const fl = [];
    if (e.fluidIn.crystalloid) fl.push(`${e.fluidIn.crystalloid} mL crystalloid`);
    if (e.fluidIn.rbc) fl.push(`${Math.round(e.fluidIn.rbc / 280)} RBC`);
    if (e.fluidIn.ffp) fl.push(`${Math.round(e.fluidIn.ffp / 270)} FFP`);
    $('#ptMeta').innerHTML = `${p.age < 0.05 ? 'Newborn' : p.age < 1 ? Math.round(p.age * 12) + ' months' : p.age < 2 && p.paed ? p.age + ' yr' : p.age} ${p.sex} · ${p.weight} kg · ${SETTING[state.scn.setting] || ''} · ${p.ventilated ? `Ventilated FiO₂ ${p.fio2.toFixed(2)}` : p.fio2 > 0.21 ? `O₂ FiO₂ ~${p.fio2.toFixed(2)}` : 'Room air'}${fl.length ? ' · In: ' + fl.join(', ') : ''}`;
    const tg = e.targetStatus();
    $('#targets').innerHTML = e.L.showTargets || state.scn.tutorial ? tg.map((t) => `<span class="tgt ${t.ok ? 'ok' : 'no'}">${t.k}</span>`).join('') : '<span class="tgt">Consultant grade: targets hidden — decide your own end-points</span>';
    nudge(e);
    const cs = e.critStatus(), done = cs.filter((c) => c.done).length;
    $('#critCount').textContent = `Critical actions completed: ${done} / ${cs.length} (revealed in the debrief)`;
    const need = e.needStable();
    $('#stabBar').style.width = Math.min(100, (e.stableTime / need) * 100) + '%';
    coachTick();
    $('#stabTxt').textContent = e.stableTime > 0 ? `${Math.floor(e.stableTime)} / ${need} s stable` : 'Targets not yet held';
    if (!e.L.showTargets && !state.scn.tutorial) { $('#stabBar').style.width = '0%'; $('#stabTxt').textContent = 'Hidden at consultant grade'; }
  }

  // Junior grade: a senior nurse prompts the next outstanding critical action when you stall.
  function nudge(e) {
    if (!e.L.nudge || state.paused || e.outcome || state.scn.tutorial) return;
    const t = e.t, lastAct = e.log.filter((x) => x.kind === 'act').reduce((m, x) => Math.max(m, x.t), 0);
    if (t - Math.max(lastAct, state.nudgeT || 0) < e.L.nudge) return;
    const next = e.critStatus().find((c) => !c.done);
    state.nudgeT = t;
    if (next) e.say(`Senior nurse: "Do you want to think about this — ${next.text.replace(/\s*\(.*\)\s*$/, '').toLowerCase()}?"`, 'warn');
    else if (!e.targetsMet()) e.say(`Senior nurse: "Everything's done — what physiological targets are we still missing? ${e.targetStatus().filter((x) => !x.ok).map((x) => x.k).join(', ')}"`, 'warn');
  }

  // ---------------- controls ----------------
  $$('#ctlTabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  function setTab(t, auto) { state.tab = t; state.examPrompt = !!auto && t === 'exam'; $$('#ctlTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t)); renderTab(); }
  function renderTab() {
    const body = $('#tabBody'), e = state.eng; if (!e) return;
    const t = state.tab;
    if (t === 'drugs') body.innerHTML = drugsHTML();
    else if (t === 'fluids') body.innerHTML = fluidsHTML();
    else if (t === 'actions') body.innerHTML = actionsHTML();
    else if (t === 'inv') body.innerHTML = invHTML();
    else if (t === 'exam') body.innerHTML = examHTML();
    wireTab(body);
  }
  function fmtDose(d) { return d >= 1000 && d % 1000 === 0 ? d / 1000 + ' ' : String(d); }
  function drugsHTML() {
    const e = state.eng;
    const cats = S.DRUG_CATS.filter((c) => c !== 'Fluids & blood');
    return cats.map((c) => {
      const ds = S.DRUGS.filter((d) => d.cat === c);
      if (!ds.length) return '';
      return `<div class="grp"><h4>${c}</h4>${ds.map((d) => {
        const rate = e.rate(d.id);
        const w = e.p.weight, un = d.bolus ? d.bolus.unit : '';
        const rnd = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
        const lab = (x) => (x >= 1000 && un === 'mcg' ? x / 1000 + ' mg' : x + ' ' + un);
        let bol = '';
        if (d.bolus && e.p.paed && d.pd) bol = d.pd.map((k) => { const x = rnd(Math.min(d.pdMax || Infinity, k * w)); return `<button class="btn sm" data-bolus="${d.id}" data-dose="${x}" title="${k} ${un}/kg">${k} ${un}/kg <span class="muted">(${lab(x)})</span></button>`; }).join('');
        else if (d.bolus && e.p.paed && d.pdAbs) bol = d.pdAbs.map((x) => `<button class="btn sm" data-bolus="${d.id}" data-dose="${x}">${lab(x)}</button>`).join('');
        else if (d.bolus) bol = d.bolus.doses.map((x) => `<button class="btn sm" data-bolus="${d.id}" data-dose="${x}">${lab(x)}</button>`).join('');
        const inf = d.inf ? `<span class="inf"><input type="number" min="0" max="${d.inf.max}" step="${d.inf.step}" value="${rate || d.inf.presets[0]}" data-infin="${d.id}" aria-label="${d.name} infusion rate"> ${d.inf.unit} <button class="btn sm" data-inf="${d.id}">${rate ? 'Update' : 'Infuse'}</button>${rate ? `<button class="btn sm danger" data-stop="${d.id}">Stop</button>` : ''}</span>` : '';
        return `<div class="drug ${rate ? 'running' : ''}" data-d="${d.id}"><div class="dn">${esc(d.name)} <button class="info" data-info="${d.id}" title="${esc(d.info || '')}" aria-label="Info">i</button>${e.total(d.id) ? `<span class="muted small">given ${+e.total(d.id).toFixed(2)} ${d.bolus ? d.bolus.unit : ''}</span>` : ''}</div><div class="ctl">${bol}${inf}</div><div class="infotext">${esc(d.info || '')}</div></div>`;
      }).join('')}</div>`;
    }).join('');
  }
  function fluidsHTML() {
    const e = state.eng;
    const fl = S.FLUIDS.filter((f) => !!f.paed === !!e.p.paed);
    return `${e.p.paed ? `<p class="muted small">Weight ${e.p.weight} kg — volumes are calculated per kg.</p>` : ''}<div class="grp"><h4>Crystalloid</h4><div class="act-grid">${fl.filter((f) => f.kind === 'crystalloid').map((f) => `<button class="btn" data-fluid="${f.id}">${esc(f.name)}</button>`).join('')}</div></div>
      <div class="grp"><h4>Blood products</h4><div class="act-grid">${fl.filter((f) => f.kind !== 'crystalloid').map((f) => `<button class="btn" data-fluid="${f.id}">${esc(f.name)}</button>`).join('')}</div></div>
      <div class="fluid-sum">Given so far: crystalloid ${e.fluidIn.crystalloid} mL · red cells ${Math.round(e.fluidIn.rbc / 280)} u · FFP ${Math.round(e.fluidIn.ffp / 270)} u · platelets ${Math.round(e.fluidIn.plt / 250)} · cryo ${Math.round(e.fluidIn.cryo / 100)}<br>Tip: a passive leg raise (Airway &amp; procedures) tests fluid responsiveness without giving fluid.</div>`;
  }
  function actionsHTML() {
    const e = state.eng, p = e.p, scn = state.scn;
    const ok = (a) => (!a.setting || a.setting === scn.setting) && (!a.need || (a.need === 'ventilated' && p.ventilated) || (a.need === 'pregnant' && p.pregnant) || (a.need === 'obstetric' && (p.obstetric || p.pregnant)) || (a.need === 'als' && scn.als));
    const groups = [...new Set(S.ACTIONS.map((a) => a.grp))];
    const extra = scn.extraActions && scn.extraActions.length ? `<div class="grp"><h4>Scenario-specific actions</h4><div class="act-grid">${scn.extraActions.map((a) => `<button class="btn ${e.did(a.id) ? 'done' : ''}" data-act="${a.id}">${esc(a.name)}${e.did(a.id) ? ' ✓' : ''}</button>`).join('')}</div></div>` : '';
    const alsBar = scn.als ? `<div class="als-bar ${p.arrested ? 'on' : ''}">${p.arrested ? `CARDIAC ARREST · CPR ${e.flags.cpr ? 'IN PROGRESS' : 'NOT RUNNING'} · ${Math.floor(e.arrestT || 0)} s · shocks ${e.shocks || 0}` : 'Pulse present'}</div>` : '';
    let vent = '';
    if (p.ventilated) {
      vent = `<div class="grp"><h4>Ventilator</h4><div class="vent">
        <label>FiO₂ <output id="o_fio2">${p.fio2.toFixed(2)}</output><input type="range" min="0.21" max="1" step="0.05" value="${p.fio2}" data-vent="fio2"></label>
        <label>PEEP (cmH₂O) <output id="o_peep">${p.peep}</output><input type="range" min="0" max="20" step="1" value="${p.peep}" data-vent="peep"></label>
        <label>Rate (/min) <output id="o_ventRR">${p.ventRR}</output><input type="range" min="6" max="35" step="1" value="${p.ventRR}" data-vent="ventRR"></label>
        <div class="small muted">Ppeak ${Math.round(p.paw)} · autoPEEP ${p.autoPEEP.toFixed(0)} · Vt ~6–8 mL/kg IBW</div></div></div>`;
    }
    return alsBar + extra + vent + groups.map((g) => {
      const acts = S.ACTIONS.filter((a) => a.grp === g && ok(a));
      if (!acts.length) return '';
      return `<div class="grp"><h4>${g}</h4><div class="act-grid">${acts.map((a) => `<button class="btn ${e.did(a.id) ? 'done' : ''}" data-act="${a.id}">${esc(a.name)}${e.did(a.id) ? ' ✓' : ''}</button>`).join('')}</div></div>`;
    }).join('');
  }
  function invHTML() {
    const scn = state.scn, inv = scn.inv || {};
    const cts = inv.ct || [], pocus = inv.pocus || [];
    return `<div class="grp"><h4>Request</h4><div class="inv-list">
      <button class="btn" data-inv="gas">Blood gas (point-of-care, ~5 s)</button>
      <button class="btn" data-inv="bloods">Lab bloods &amp; cultures (~20 s)</button>
      <button class="btn" data-inv="ecg">12-lead ECG</button>
      <button class="btn" data-inv="cxr">Portable chest X-ray (~15 s)</button>
      ${pocus.length ? '<button class="btn" data-inv="pocus">Point-of-care ultrasound</button>' : ''}
      ${cts.map((c, i) => `<button class="btn" data-inv="ct" data-i="${i}">${esc(c.label)} (~40 s)</button>`).join('')}
      </div></div>
      <div class="grp results"><h4>Results</h4>${state.results.length ? state.results.map((r, i) => `<button class="btn sm" data-res="${i}">${esc(r.name)} · ${r.at}</button>`).join('') : '<span class="muted small">No results yet.</span>'}</div>`;
  }
  function examHTML() {
    if (state.examPrompt) return `<div class="exam"><p class="muted small">Start with an ABCDE assessment.</p><div class="row-end"><button class="btn primary" data-reexam>Examine patient (ABCDE)</button></div></div>`;
    const ex = state.scn.exam ? state.scn.exam(state.eng) : {};
    state.eng.mark('exam');
    return `<div class="exam"><p class="muted small">Examination findings now (${fmt(state.elapsed).slice(0, 5)}). Re-open this tab to re-examine.</p><dl>${['A', 'B', 'C', 'D', 'E'].map((k) => `<dt>${k}</dt><dd>${esc(ex[k] || '—')}</dd>`).join('')}</dl><div class="row-end"><button class="btn sm" data-reexam>Re-examine</button></div></div>`;
  }
  function wireTab(body) {
    const e = state.eng;
    const guard = () => { if (state.paused || e.outcome) { toast(e.outcome ? 'Scenario has ended.' : 'Press start / resume first.', 'warn'); return false; } return true; };
    $$('[data-bolus]', body).forEach((b) => (b.onclick = () => guard() && e.giveBolus(b.dataset.bolus, +b.dataset.dose)));
    $$('[data-inf]', body).forEach((b) => (b.onclick = () => { if (!guard()) return; const inp = $(`[data-infin="${b.dataset.inf}"]`, body); const d = S.drugById[b.dataset.inf]; const v = Math.max(0, Math.min(d.inf.max, +inp.value || 0)); e.setInfusion(d.id, v); }));
    $$('[data-stop]', body).forEach((b) => (b.onclick = () => guard() && e.setInfusion(b.dataset.stop, 0)));
    $$('[data-info]', body).forEach((b) => (b.onclick = () => b.closest('.drug').classList.toggle('show-info')));
    $$('[data-fluid]', body).forEach((b) => (b.onclick = () => guard() && e.giveFluid(b.dataset.fluid)));
    $$('[data-act]', body).forEach((b) => (b.onclick = () => guard() && e.doAction(b.dataset.act)));
    $$('[data-vent]', body).forEach((r) => {
      r.oninput = () => { $('#o_' + r.dataset.vent).textContent = r.dataset.vent === 'fio2' ? (+r.value).toFixed(2) : r.value; };
      r.onchange = () => guard() && e.setVent(r.dataset.vent, +r.value);
    });
    $$('[data-inv]', body).forEach((b) => (b.onclick = () => guard() && requestInv(b.dataset.inv, b.dataset.i)));
    $$('[data-res]', body).forEach((b) => (b.onclick = () => showResult(state.results[+b.dataset.res])));
    const rx = $('[data-reexam]', body); if (rx) rx.onclick = () => { if (state.paused && !state.eng.outcome) { toast('Press start / resume first.', 'warn'); return; } state.examPrompt = false; renderTab(); };
  }
  function renderPumps() {
    const e = state.eng;
    const ids = Object.keys(e.pools).filter((k) => e.pools[k].rate > 0 && S.drugById[k]);
    $('#pumpsCard').hidden = !ids.length;
    $('#pumps').innerHTML = ids.map((id) => { const d = S.drugById[id]; return `<div class="pump"><span class="nm">${esc(d.name)}</span><input type="number" min="0" max="${d.inf.max}" step="${d.inf.step}" value="${e.rate(id)}" data-pin="${id}" aria-label="rate"> <span class="muted small">${d.inf.unit}</span><button class="btn sm" data-pset="${id}">Set</button><button class="btn sm danger" data-pstop="${id}">Stop</button></div>`; }).join('');
    $$('[data-pset]').forEach((b) => (b.onclick = () => { const v = +$(`[data-pin="${b.dataset.pset}"]`).value; const d = S.drugById[b.dataset.pset]; e.setInfusion(d.id, Math.max(0, Math.min(d.inf.max, v || 0))); }));
    $$('[data-pstop]').forEach((b) => (b.onclick = () => e.setInfusion(b.dataset.pstop, 0)));
  }

  // ---------------- investigations ----------------
  const val = (x, e) => (typeof x === 'function' ? x(e) : x);
  function addResult(r) { r.at = fmt(state.elapsed).slice(0, 5); state.results.push(r); if (state.tab === 'inv') renderTab(); }
  function requestInv(kind, idx) {
    const e = state.eng, inv = state.scn.inv || {};
    e.investigate(kind === 'ct' ? 'ct' : kind);
    if (kind === 'gas') {
      e.say('Blood gas sent to the analyser…');
      e.after(5, () => { const g = e.gas(); const extra = inv.gasExtra ? inv.gasExtra(e) : []; const r = { name: `${e.p.ventilated || e.p.artLine ? 'ABG' : 'VBG/ABG'}`, kind: 'gas', g, extra, fio2: e.p.fio2 }; addResult(r); toast('Blood gas result ready', 'good'); showResult(r); });
    } else if (kind === 'bloods') {
      e.say('Bloods (incl. cultures, group & save) sent to the lab — results in ~20 s.');
      e.after(20, () => { const rows = inv.bloods ? inv.bloods(e) : S.labs(e); const r = { name: 'Lab bloods', kind: 'labs', rows, extra: inv.extra || [] }; addResult(r); toast('Lab results are back', 'good'); });
    } else if (kind === 'ecg') {
      const raw = val(inv.ecg, e) || {};
      const spec = Object.assign({}, raw);
      spec.snap = S.Imaging.ecgSnapshot(e, spec);
      spec.desc = S.ecgReport(spec.snap.p, S.ecgMorph(spec.snap.p), raw.note ? 'Clinical correlation: ' + raw.note : '');
      spec.kind = 'ecg';
      const r = { name: '12-lead ECG', kind: 'img', spec, report: spec.desc }; addResult(r); showResult(r);
    } else if (kind === 'cxr') {
      e.say('Radiographer coming with the portable X-ray (~15 s).');
      e.after(15, () => { const c = val(inv.cxr, e) || { findings: [], report: 'Normal.' }; const spec = Object.assign({ kind: 'cxr' }, c); const r = { name: 'Chest X-ray', kind: 'img', spec, report: c.report }; addResult(r); toast('Chest X-ray available', 'good'); showResult(r); });
    } else if (kind === 'ct') {
      const c = (inv.ct || [])[+idx];
      e.say(`Transfer to CT for ${c.label} (~40 s).`, e.p.map < 65 ? 'warn' : 'info');
      e.after(40, () => { const spec = Object.assign({ kind: 'ct' }, c); const r = { name: c.label, kind: 'img', spec, report: typeof c.report === 'function' ? c.report(e) : c.report }; addResult(r); toast(`${c.label} reported`, 'good'); showResult(r); });
    } else if (kind === 'pocus') {
      const r = { name: 'POCUS', kind: 'pocus', views: inv.pocus || [] }; addResult(r); showResult(r);
    }
  }
  function flag(v, ref) {
    const n = parseFloat(String(v).replace(/[<>]/g, '')); if (isNaN(n) || !ref) return '';
    let m = /^([\d.]+)–([\d.]+)$/.exec(ref); if (m) return n < +m[1] ? 'lo' : n > +m[2] ? 'hi' : '';
    m = /^<([\d.]+)$/.exec(ref); if (m) return n >= +m[1] ? 'hi' : '';
    return '';
  }
  function showResult(r) {
    if (!r) return;
    if (r.kind === 'gas') {
      const g = r.g;
      const rows = [
        ['pH', g.ph.toFixed(2), '7.35–7.45'], ['pCO₂', g.pco2.toFixed(1) + ' kPa', '4.7–6.0'], ['pO₂', g.po2.toFixed(1) + ' kPa', '10.0–13.0'], ['HCO₃⁻', g.hco3.toFixed(1) + ' mmol/L', '22–26'],
        ['Base excess', g.be.toFixed(1), '-2–2'], ['Lactate', g.lactate.toFixed(1) + ' mmol/L', '0.5–2.0'], ['Na⁺', Math.round(g.na) + ' mmol/L', '135–145'], ['K⁺', g.k.toFixed(1) + ' mmol/L', '3.5–5.0'],
        ['Glucose', g.glucose.toFixed(1) + ' mmol/L', '4.0–7.8'], ['Hb', Math.round(g.hb) + ' g/L', '115–180'], ['SaO₂', g.sao2.toFixed(0) + '%', '94–100'], ['iCa²⁺', g.ica.toFixed(2) + ' mmol/L', '1.15–1.30'],
        ...r.extra,
      ];
      const fl = (v, ref) => { const n = parseFloat(v); const m = /^(-?[\d.]+)–(-?[\d.]+)$/.exec(ref || ''); return m && !isNaN(n) ? (n < +m[1] ? 'lo' : n > +m[2] ? 'hi' : '') : ''; };
      openModal(`Blood gas — taken at ${r.at} (FiO₂ ${r.fio2.toFixed(2)})`, `<table class="labs"><tr><th>Test</th><th>Result</th><th>Range</th></tr>${rows.map(([a, b, c]) => `<tr><td>${a}</td><td class="v ${fl(b, c)}">${b}</td><td class="muted">${c || ''}</td></tr>`).join('')}</table><p class="muted small">A-a gradient and P/F ratio can be calculated from pO₂ and FiO₂. Arterial values unless no arterial access (venous pO₂ not interpretable).</p>`);
    } else if (r.kind === 'labs') {
      const rows = r.rows;
      const html = `<div class="lab-cols"><table class="labs">${rows.map((x) => x.length === 1 ? `<tr class="sec"><td colspan="3">${x[0]}</td></tr>` : `<tr><td>${esc(x[0])}</td><td class="v ${flag(x[1], x[3])}">${esc(x[1])} <span class="muted">${esc(x[2] || '')}</span></td><td class="muted">${esc(x[3] || '')}</td></tr>`).join('')}</table>${r.extra.length ? `<table class="labs"><tr class="sec"><td colspan="2">Other results</td></tr>${r.extra.map((x) => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td></tr>`).join('')}</table>` : ''}</div>`;
      openModal(`Laboratory results — reported ${r.at}`, html);
    } else if (r.kind === 'img') {
      openModal(r.name + ` — ${r.at}`, `<div class="img-wrap"><div id="imgHost"></div><div class="report"><h4>Report</h4><p>${esc(r.report || '')}</p>${r.spec.kind === 'ecg' ? '<p class="muted small">ECG generated live from the simulated patient.</p>' : '<p class="muted small">The image is a representative, openly-licensed example of the finding — not the simulated patient. The report describes this patient.</p>'}</div></div>`, () => S.Imaging.mount($('#imgHost'), r.spec, state.eng));
      if (r.spec.kind === 'ecg') $('.img-wrap').style.gridTemplateColumns = '1fr';
    } else if (r.kind === 'pocus') {
      const vs = r.views;
      if (!vs.length) { openModal('POCUS', '<p>No views available.</p>'); return; }
      openModal('Point-of-care ultrasound', `<div class="view-tabs">${vs.map((v, i) => `<button class="btn sm ${i ? '' : 'on'}" data-view="${i}">${esc(v.label)}</button>`).join('')}</div><div class="img-wrap"><div id="usHost"></div><div class="report"><h4 id="usLab"></h4><p id="usRep"></p><p class="muted small">Representative openly-licensed clip of the finding — not the simulated patient. The report describes this patient.</p></div></div>`, () => {
        const show = (i) => { if (state.stopAnim) state.stopAnim(); const v = Object.assign({ kind: 'pocus' }, vs[i]); state.stopAnim = S.Imaging.mount($('#usHost'), v, state.eng); $('#usLab').textContent = v.label; $('#usRep').textContent = typeof v.report === 'function' ? v.report(state.eng) : v.report; $$('[data-view]').forEach((b) => b.classList.toggle('on', +b.dataset.view === i)); };
        $$('[data-view]').forEach((b) => (b.onclick = () => show(+b.dataset.view)));
        show(0);
      });
    }
  }

  // ---------------- modal ----------------
  function openModal(title, html, mount) {
    if (state.stopAnim) { state.stopAnim(); state.stopAnim = null; }
    $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modal').hidden = false;
    if (mount) { const s = mount(); if (typeof s === 'function') state.stopAnim = s; }
    $('#modalClose').focus();
  }
  function closeModal() {
    if (state.stopAnim) { state.stopAnim(); state.stopAnim = null; }
    if (state.hintTimer) { clearInterval(state.hintTimer); state.hintTimer = null; }
    $('#modal').hidden = true;
  }
  $('#modalClose').onclick = closeModal;
  $('#modal').onclick = (ev) => { if (ev.target.id === 'modal') closeModal(); };
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  // ---------------- hint ----------------
  $('#hintBtn').onclick = () => {
    if (!state.eng) return;
    state.hints++;
    state.eng.emit({ type: 'hint', text: 'Hint viewed', kind: 'warn' });
    const tabs = [['mech', 'Mechanism'], ['circ', 'Live circulation'], ['fs', 'Frank–Starling'], ['prof', 'Shock profiles']];
    openModal('Physiology hint', `<div class="view-tabs">${tabs.map(([k, l], i) => `<button class="btn sm ${i ? '' : 'on'}" data-ht="${k}">${l}</button>`).join('')}</div><div id="hintHost"></div><p class="muted small" id="hintNote"></p>`, () => {
      let cur = 'mech';
      const draw = () => {
        const e = state.eng, s = state.scn;
        const host = $('#hintHost'); if (!host) return;
        if (cur === 'mech') { host.innerHTML = S.Schematics.mechanism(s); $('#hintNote').textContent = 'Green boxes show where treatments act. Your use of hints is recorded in the debrief.'; }
        if (cur === 'circ') { host.innerHTML = S.Schematics.circulation(e, s); $('#hintNote').textContent = 'Live model of this patient: updates every second.'; }
        if (cur === 'fs') { host.innerHTML = S.Schematics.starling(e); $('#hintNote').textContent = 'The orange curve is this patient\'s current contractility; the dot is where they sit on it.'; }
        if (cur === 'prof') { host.innerHTML = S.Schematics.profiles(e, s); $('#hintNote').textContent = 'Classic haemodynamic patterns. Highlighted row = the shock type in this scenario.'; }
      };
      $$('[data-ht]').forEach((b) => (b.onclick = () => { cur = b.dataset.ht; $$('[data-ht]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
      draw();
      state.hintTimer = setInterval(() => { if (cur === 'circ' || cur === 'fs' || cur === 'prof') draw(); }, 1000);
    });
  };

  // ---------------- top bar ----------------
  $('#pauseBtn').onclick = () => {
    if (!state.eng || state.eng.outcome || !$('#briefing').hidden) return;
    state.paused = !state.paused; state.last = performance.now();
    $('#pauseBtn').textContent = state.paused ? '▶' : '❚❚';
    toast(state.paused ? 'Paused — stopwatch stopped.' : 'Resumed.', 'warn');
  };
  $('#soundBtn').onclick = () => { if (!state.mon) return; state.mon.sound = !state.mon.sound; store.set('sound', state.mon.sound); $('#soundBtn').textContent = state.mon.sound ? '🔊' : '🔇'; };
  $('#endBtn').onclick = () => { if (!state.eng) return; if (state.eng.outcome) { finish(state.eng.outcome); return; } state.eng.outcome = 'ended'; finish('ended'); };
  $('#backBtn').onclick = () => { location.hash = ''; };
  window.addEventListener('resize', () => { if (state.mon && $('#sim').classList.contains('active')) state.mon.resize(); });

  // ---------------- tutorial coach ----------------
  function renderCoach() {
    let box = $('#coach');
    const steps = state.scn && state.scn.coach;
    $$('.coach-hl').forEach((x) => x.classList.remove('coach-hl'));
    if (!steps || state.coachI == null || state.coachI >= steps.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'coach'; box.className = 'coach'; box.setAttribute('role', 'status'); document.body.append(box); }
    const st = steps[state.coachI];
    const done = st.check ? !!st.check(state.eng) : true;
    const last = state.coachI === steps.length - 1;
    box.innerHTML = `<div class="coach-top"><b>Tutorial ${state.coachI + 1}/${steps.length}: ${esc(st.title)}</b><button class="btn ghost sm" id="coachHide">Hide</button></div><p>${esc(st.text)}</p><div class="coach-btns"><button class="btn sm" id="coachBack" ${state.coachI ? '' : 'disabled'}>Back</button>${st.check ? `<span class="muted small">${done ? '✓ Done' : 'Waiting for you…'}</span>` : ''}<button class="btn sm primary" id="coachNext">${last ? 'Close' : st.check && !done ? 'Skip step' : 'Next'}</button></div>`;
    const tgt = st.sel && $(st.sel); if (tgt) tgt.classList.add('coach-hl');
    $('#coachHide').onclick = () => { state.coachI = null; renderCoach(); };
    $('#coachBack').onclick = () => { state.coachI = Math.max(0, state.coachI - 1); renderCoach(); };
    $('#coachNext').onclick = () => { state.coachI++; renderCoach(); };
  }
  function coachTick() {
    const steps = state.scn && state.scn.coach;
    if (!steps || state.coachI == null || state.coachI >= steps.length || state.coachWait) return;
    const st = steps[state.coachI];
    if (st.check && st.check(state.eng)) {
      state.coachWait = true;
      setTimeout(() => { state.coachWait = false; if (state.coachI != null && steps[state.coachI] === st) { state.coachI++; renderCoach(); } }, 1200);
    }
  }

  // ---------------- debrief ----------------
  function finish(outcome) {
    const e = state.eng, s = state.scn; if (!e) return;
    state.coachI = null; renderCoach();
    state.paused = true; $('#pauseBtn').textContent = '▶';
    const ms = state.elapsed;
    let newBest = false;
    if (outcome === 'win') { const best = store.get('best', {}); if (!best[s.id] || ms < best[s.id]) { best[s.id] = ms; store.set('best', best); newBest = true; } }
    const cs = (s.critical || []).map((c) => ({ text: c.text, done: !!c.check(e) }));
    const title = outcome === 'win' ? 'Patient stabilised' : outcome === 'arrest' ? 'Cardiac arrest — scenario failed' : 'Scenario ended';
    const log = e.log.filter((x) => x.kind === 'act' || x.kind === 'good' || x.kind === 'bad' || x.type === 'inv' || x.type === 'hint');
    const html = `<div class="debrief">
      <div class="banner ${outcome === 'win' ? 'win' : 'lose'}"><span>${title}${s.tutorial ? '' : ' · ' + e.L.name + ' grade'}</span><span>⏱ ${fmt(ms)}${newBest ? ' · new personal best' : ''}</span></div>
      <div class="stat-row"><div class="stat"><span class="muted small">Time</span><b>${fmt(ms)}</b></div><div class="stat"><span class="muted small">Critical actions</span><b>${cs.filter((c) => c.done).length}/${cs.length}</b></div><div class="stat"><span class="muted small">Harmful actions</span><b>${e.harms.length}</b></div><div class="stat"><span class="muted small">Hints used</span><b>${state.hints}</b></div><div class="stat"><span class="muted small">Final MAP / SpO₂</span><b>${Math.round(e.p.map)} / ${e.p.spo2}%</b></div></div>
      <div id="lbBox" class="lb-box"></div>
      <h3>Critical actions</h3><ul>${cs.map((c) => `<li class="${c.done ? 'ok' : 'miss'}">${esc(c.text)}</li>`).join('')}</ul>
      ${e.did('complication') ? `<h3>Second problem (consultant grade)</h3><p>${e.flags.compl === 'iv' ? 'The IV cannula tissued mid-resuscitation — infusions and boluses stopped reaching the patient. Watch pump alarms and the response to drugs; re-site access (IO if needed).' : e.flags.compl === 'tube' ? 'The tracheal tube displaced during a move — loss of capnography is a displaced tube until proven otherwise (DAS / AoA QRH 2-2 and 2-3).' : e.flags.compl === 'o2' ? 'The oxygen supply was disconnected — always re-check the delivery chain when saturations fall.' : esc(e.flags.complText || 'A scenario-specific complication occurred.')} ${e.flags.ivDown || e.flags.tubeDisplaced || e.flags.o2Off ? '<b>It was not resolved.</b>' : 'You resolved it.'}</p>` : ''}
      ${e.harms.length ? `<h3>Potential harm</h3><ul>${e.harms.map((h) => `<li class="harm">${esc(h)}</li>`).join('')}</ul>` : ''}
      <h3>Learning points</h3><ul>${(s.debrief.points || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3>Guidelines &amp; further reading</h3><ul>${(s.debrief.refs || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <details><summary>Timeline (${log.length} events)</summary><ol class="log">${log.map((x) => `<li class="${x.kind}"><span class="t">${Math.floor(x.t / 60)}:${String(Math.floor(x.t % 60)).padStart(2, '0')}</span><span>${esc(x.text)}</span></li>`).join('')}</ol><p class="muted small">Timeline shows simulator time.</p></details>
      <div class="row-end"><button class="btn" id="dbMenu">Menu</button><button class="btn" id="dbHint">Review physiology</button><button class="btn" id="dbNext">${state.fieldMode ? 'Next ' + FIELD[state.fieldMode] + ' scenario' : 'Random scenario'}</button><button class="btn primary" id="dbRetry">Retry</button></div></div>`;
    openModal((state.blind ? 'Debrief — it was: ' : 'Debrief: ') + s.title, html);
    if (S.LB) S.LB.debrief($('#lbBox'), { scn: s, outcome, ms, hints: state.hints, harms: e.harms.length, blind: state.blind, level: e.level });
    $('#dbMenu').onclick = () => { closeModal(); location.hash = ''; };
    $('#dbRetry').onclick = () => { closeModal(); start(s.id); };
    $('#dbHint').onclick = () => { closeModal(); state.hints--; $('#hintBtn').click(); };
    $('#dbNext').onclick = () => { const pool = S.SCENARIOS.filter((x) => (!state.fieldMode || x.field === state.fieldMode) && x.id !== s.id && !x.tutorial); const f = state.fieldMode; closeModal(); go(pick(pool).id, f); };
  }

  // ---------------- routing ----------------
  function route() {
    const h = location.hash.replace(/^#/, '');
    if (h.startsWith('play/')) start(h.slice(5));
    else if (h.startsWith('case/')) start(fromCode(h.slice(5)));
    else {
      closeModal();
      state.paused = true;
      state.coachI = null; renderCoach();
      $('#sim').classList.remove('active'); $('#home').classList.add('active');
      renderHome();
      if (h === 'library') document.getElementById('library').scrollIntoView();
    }
  }
  window.addEventListener('hashchange', route);
  route();
  if (S.LB) S.LB.init({ openModal, fmt, esc, store });
  const qrhOpen = (ids) => openModal('📕 AoA Quick Reference Handbook', S.QRH.html(ids));
  const qh = $('#qrhHome'); if (qh) qh.onclick = () => qrhOpen([]);
  const qs = $('#qrhBtn'); if (qs) qs.onclick = () => { if (state.eng) state.eng.mark('qrh'); qrhOpen(state.scn && state.scn.qrh); };
  const lbb = $('#lbBtn'); if (lbb) { if (!(S.LB && S.LB.enabled())) lbb.hidden = true; lbb.onclick = () => S.LB && S.LB.show(); }
  S.app = state; // exposed for testing
})();
