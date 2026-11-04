/* Routine general anaesthesia — a step-by-step anaesthetic for novices (IAC level).
 * Adds to the physiology engine:
 *   - an anaesthetic machine: fresh gas flow, FiO₂ (O₂/air), sevoflurane vaporiser, circuit on mask / LMA / tube
 *   - sevoflurane uptake (FiAA → EtAA) and age-adjusted MAC (Mapleson)
 *   - propofol: manual boluses and target-controlled infusion (Marsh = plasma target, Schnider = effect-site target)
 *   - remifentanil TCI (Minto, effect-site), fentanyl and morphine boluses
 *   - a processed-EEG depth index ("BIS"), movement / sympathetic responses to surgical stimulation
 *   - rocuronium block with train-of-four monitoring, sugammadex and neostigmine reversal
 *   - the phases: checks → induction → airway → maintenance → emergence → recovery handover
 * Time is compressed (roughly ×3–5) so that a whole anaesthetic takes about 10 minutes.
 * Pharmacology is simplified for teaching; numbers are representative, not a TCI pump. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = S.clamp || ((x, a, b) => Math.max(a, Math.min(b, x)));
  const fr = (c, c50) => (c > 0 ? c / (c + c50) : 0);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

  const PHASES = [
    ['pre', 'Before induction'],
    ['induction', 'Induction & airway'],
    ['maintenance', 'Maintenance & surgery'],
    ['emergence', 'Emergence'],
    ['recovery', 'Recovery & handover'],
  ];

  // Actions offered on the Anaesthetic tab, grouped by phase.
  const ACTIONS = [
    { id: 'ga_machine', ph: 'pre', name: 'Machine & equipment check (AAGBI): O₂ supply, vaporiser, circuit leak test, suction, airway kit' },
    { id: 'ga_signin', ph: 'pre', name: 'WHO Sign In: identity, consent, site, allergies, airway / aspiration risk, blood loss' },
    { id: 'ga_monitor', ph: 'pre', name: 'Attach standard monitoring: SpO₂, ECG, NIBP (cycle every 2.5 min)' },
    { id: 'ga_bis', ph: 'pre', name: 'Attach processed-EEG (BIS) depth monitor' },
    { id: 'ga_nmt', ph: 'pre', name: 'Attach quantitative neuromuscular monitor (train-of-four)' },
    { id: 'ga_iv', ph: 'pre', name: 'IV cannula: site it, or check it flushes (TIVA: visible, anti-reflux valve)' },
    { id: 'ga_mask_on', ph: 'pre', name: 'Facemask on the circuit, tight seal' },
    { id: 'ga_preox', ph: 'pre', name: 'Pre-oxygenate: 100% O₂, high flow, until EtO₂ ≥ 0.9' },
    { id: 'ga_jaw', ph: 'induction', name: 'Open the airway: jaw thrust + oropharyngeal (Guedel) airway' },
    { id: 'ga_mask_vent', ph: 'induction', name: 'Hand-ventilate via facemask (bag on the circuit)' },
    { id: 'ga_lma', ph: 'induction', name: 'Insert i-gel (size 4) when deep enough: no eyelash reflex, jaw relaxed' },
    { id: 'ga_intubate', ph: 'induction', name: 'Intubate: videolaryngoscope, cuffed tube (needs full neuromuscular block)' },
    { id: 'ga_confirm', ph: 'induction', name: 'Confirm tube: sustained capnography, bilateral air entry, tie' },
    { id: 'ga_vent_on', ph: 'induction', name: 'Start mechanical ventilation (VCV 6–8 mL/kg, PEEP 5)' },
    { id: 'ga_spont', ph: 'induction', name: 'Let the patient breathe spontaneously on the circuit' },
    { id: 'ga_eyes', ph: 'induction', name: 'Tape eyes, position, pressure areas, forced-air warming' },
    { id: 'ga_timeout', ph: 'maintenance', name: 'WHO Time Out, then tell the surgeon they can start' },
    { id: 'ga_absorbent', ph: 'maintenance', name: 'Change CO₂ absorbent (soda lime) canister' },
    { id: 'ga_resite', ph: 'maintenance', name: 'Check the drip site / re-site the IV cannula' },
    { id: 'ga_desufflate', ph: 'maintenance', name: 'Ask the surgeon to release the pneumoperitoneum', lap: true },
    { id: 'ga_signout', ph: 'emergence', name: 'WHO Sign Out' },
    { id: 'ga_suction', ph: 'emergence', name: 'Suction the oropharynx under direct vision' },
    { id: 'ga_extubate', ph: 'emergence', name: 'Extubate (awake: eyes open, obeying, TOF ratio ≥ 0.9, regular breathing)' },
    { id: 'ga_lma_out', ph: 'emergence', name: 'Remove the i-gel' },
    { id: 'ga_larson', ph: 'emergence', name: 'Laryngospasm: 100% O₂, jaw thrust at Larson’s point, CPAP via facemask' },
    { id: 'ga_recovery_o2', ph: 'recovery', name: 'Transfer to recovery on facemask O₂, monitoring on' },
    { id: 'ga_handover', ph: 'recovery', name: 'Handover to recovery (SBAR: procedure, drugs, analgesia, PONV, concerns)' },
  ];
  S.GA_ACTIONS = ACTIONS;
  // Short names for the event log
  if (S.actionById) ACTIONS.forEach((a) => { if (!S.actionById[a.id]) S.actionById[a.id] = { id: a.id, name: a.name.split(/: | \(/)[0] }; });

  // ---------------- set-up ----------------
  function setup(e, cfg) {
    const p = e.p;
    const comp = (e.mode || 'routine') === 'comp';
    e.ga = Object.assign({
      phase: 'pre', comp, cfg,
      airway: 'none', // none | mask | maskHeld | lma | ett
      circuit: false, // patient connected to the breathing system (facemask held on, LMA or tube)
      fgf: 0, o2frac: 1, dial: 0, fi: 0, et: 0, ce: 0, // fresh gas L/min, O₂ fraction, sevo dial %, FiAA, EtAA, brain
      tciP: { on: false, model: 'Schnider', target: 0, cp: 0, ce: 0, mg: 0 },
      tciR: { on: false, target: 0, ce: 0, mcg: 0 },
      pbA: 0, pbCe: 0, // propofol bolus: plasma-equivalent and effect site (µg/mL)
      fA: 0, fCe: 0, mA: 0, mCe: 0, // fentanyl / morphine (fentanyl-equivalent ng/mL)
      roc: 0, rocCe: 0, block: 0, neoUntil: -1, // rocuronium body load (mg/kg) and effect site
      preoxT: 0, preox: false, eto2: 0.21, bis: 96, stim: 0, lastMove: -99, stimEvents: [],
      surgery: null, absorbentOK: true, fico2: 0, laryngospasm: false, obstruct: false,
      pain: 0, awakeAt: null, moved: 0, aware: 0, baseVaso: p.vasoplegia, baseContract: p.contract, baseHR: p.hrBase,
      monitors: { std: false, bis: false, nmt: false }, ivOK: cfg.ivAtStart !== false, done: {},
      roc50: cfg.slowRoc && comp ? 0.16 : 0.12, rocHalf: cfg.slowRoc && comp ? 320 : 150,
      sens: cfg.cvSensitive && comp ? 1.9 : 1,
    }, cfg.ga || {});
    p.noMonitor = 'Monitoring not yet attached — attach standard monitoring (Anaesthetic tab)';
    p.fio2 = 0.21; p.lastFio2 = 0.21; p.ga = true;
    p.look = Object.assign({ drapes: false, gown: true }, p.look || {});
    e.noAutoComplication = true;
  }

  // ---------------- helpers ----------------
  const macAge = (p) => 2.05 * Math.pow(10, -0.00269 * ((p.age || 40) - 40));
  const propCe = (g) => g.pbCe + g.tciP.ce;
  function opioid(g) { return 1 - (1 - fr(g.fCe, 1.2)) * (1 - fr(g.mCe, 1.4)) * (1 - fr(g.tciR.ce, 2.5)); }
  function hyp(e) { const g = e.ga; return propCe(g) / 3.3 + g.ce / macAge(e.p); }
  function immob(e) { const g = e.ga; return (g.ce / macAge(e.p) + propCe(g) / 4.5) / (1 - 0.65 * opioid(g)); }
  function tof(g) {
    const b = g.block;
    if (b > 0.95) return { count: 0, ratio: 0 };
    if (b > 0.9) return { count: 1, ratio: 0 };
    if (b > 0.82) return { count: 2, ratio: 0 };
    if (b > 0.75) return { count: 3, ratio: 0 };
    return { count: 4, ratio: clamp(1 - b / 0.72, 0, 1) };
  }
  const awake = (e) => e.ga.bis > 80 && e.ga.block < 0.5;
  const stage2 = (e) => e.ga.bis >= 58 && e.ga.bis <= 80;
  function mark(e, k) { if (!e.ga.done[k]) e.ga.done[k] = e.t; }
  function setPhase(e, ph) { if (e.ga.phase === ph) return; e.ga.phase = ph; mark(e, 'phase_' + ph); }
  // Stimulation episodes: [start, end, level]
  function stimulate(e, level, secs) { e.ga.stimEvents.push([e.t, e.t + secs, level]); }

  // ---------------- per-tick model ----------------
  function tick(e, dt) {
    const g = e.ga; if (!g) return;
    const p = e.p, w = p.weight, mac = macAge(p);
    const ivOK = g.ivOK && !e.flags.ivDown;

    // Anaesthetic gases
    const connected = g.circuit && g.fgf > 0;
    const fiT = connected ? g.dial : 0;
    const tauFi = g.fgf > 0 ? 120 / Math.max(0.3, g.fgf) : 200;
    g.fi += (fiT - g.fi) * Math.min(1, dt / Math.min(60, tauFi));
    if (!g.circuit) g.fi = 0;
    const V = p.ventilated || p.assisted ? Math.max(p.V || 0, 0.6) : (p.V || 0);
    const tauEt = V > 0.25 ? 22 / clamp(V, 0.3, 1.4) : 160;
    g.et += ((g.circuit ? 0.9 * g.fi : 0) - g.et) * Math.min(1, dt / tauEt);
    g.ce += (g.et - g.ce) * Math.min(1, dt / 8);

    // Oxygen: circuit FiO₂, pre-oxygenation reserve
    const fio2 = connected ? clamp(g.o2frac, 0.21, 1) : (g.airway === 'none' ? 0.21 : 0.21);
    p.fio2 = g.recoveryO2 ? 0.5 : fio2;
    const breathingIn = V > 0.25;
    if (connected && fio2 >= 0.9 && breathingIn && !p.ventilated) g.preoxT += dt; else if (!connected) g.preoxT = Math.max(0, g.preoxT - dt * 0.5);
    g.eto2 += ((breathingIn ? (connected ? fio2 : 0.21) * 0.95 : g.eto2) - g.eto2) * Math.min(1, dt / 9);
    if (g.preoxT > 25) { if (!g.preox) { g.preox = true; mark(e, 'preoxDone'); } }
    p.lastFio2 = g.preox || g.eto2 > 0.85 ? Math.max(fio2, 0.9) : fio2;

    // Propofol: boluses and TCI
    g.pbCe += (g.pbA - g.pbCe) * Math.min(1, dt / 12);
    g.pbA *= Math.exp(-dt / 85);
    const T = g.tciP;
    if (T.on && ivOK) {
      if (T.model === 'Marsh') { T.cp += (T.target - T.cp) * Math.min(1, dt / 5); T.ce += (T.cp - T.ce) * Math.min(1, dt / 40); }
      else { T.ce += (T.target - T.ce) * Math.min(1, dt / 18); T.cp = Math.max(T.ce, T.target * 1.15); }
      T.mg += (T.target * 2.8 * w / 3600) * dt * 4 + Math.max(0, T.target - T.ce) * 0.03 * w * dt / 10;
    } else { T.ce *= Math.exp(-dt / 70); T.cp *= Math.exp(-dt / 50); }
    // Remifentanil TCI
    const R = g.tciR;
    if (R.on && ivOK) { R.ce += (R.target - R.ce) * Math.min(1, dt / 16); R.mcg += R.target * 0.1 * w * dt / 60 * 4; }
    else R.ce *= Math.exp(-dt / 25);
    // Fentanyl and morphine (fentanyl-equivalent ng/mL)
    g.fCe += (g.fA - g.fCe) * Math.min(1, dt / 45); g.fA *= Math.exp(-dt / 260);
    g.mCe += (g.mA - g.mCe) * Math.min(1, dt / 90); g.mA *= Math.exp(-dt / 900);
    const O = opioid(g);

    // Rocuronium
    g.rocCe += (g.roc - g.rocCe) * Math.min(1, dt / 22);
    g.roc *= Math.exp((-dt * Math.LN2) / g.rocHalf);
    const c50 = g.roc50 * (e.t < g.neoUntil ? 2.6 : 1);
    g.block = g.rocCe > 0.005 ? Math.pow(g.rocCe, 4) / (Math.pow(g.rocCe, 4) + Math.pow(c50, 4)) : 0;
    if (e.flags.suxBlock && e.t < e.flags.suxBlock) g.block = Math.max(g.block, 0.97);

    // Stimulation
    g.stimEvents = g.stimEvents.filter((s) => s[1] > e.t);
    let stim = g.stimEvents.reduce((m, s) => Math.max(m, s[2]), 0);
    if (g.surgery && g.surgery.on) stim = Math.max(stim, g.surgery.level);
    g.stim = stim;

    // Depth index (BIS-like)
    const h = hyp(e);
    const im = immob(e);
    let bis = 96 / (1 + Math.pow(h / 1.05, 2.6));
    const light = Math.max(0, stim * 1.1 - im);
    bis += light * 25;
    bis = clamp(bis + (Math.sin(e.t * 0.7) + Math.sin(e.t * 0.23)) * 1.5, 8, 98);
    g.bis += (bis - g.bis) * Math.min(1, dt / 4);

    // Movement and sympathetic response when too light for the stimulus
    if (stim >= 0.45 && g.block < 0.8 && im < 0.55 + 0.5 * stim && e.t - g.lastMove > 25 && g.bis < 80) {
      g.lastMove = e.t; g.moved++;
      e.say(g.airway === 'ett' ? 'The patient coughs on the tube and moves — anaesthesia is too light for the stimulus.' : 'The patient moves and grimaces — anaesthesia is too light for the stimulus.', 'warn');
      mark(e, 'moved');
    }
    if (g.block > 0.8 && g.bis > 65 && ['induction', 'maintenance'].includes(g.phase) && g.airway !== 'none') {
      g.aware += dt;
      if (g.aware > 6 && !g.awareMsg) { g.awareMsg = true; e.say('Lacrimation, sweating and a rising heart rate — and the patient is paralysed. Is the anaesthetic reaching the brain?', 'bad'); }
      if (g.aware > 15) e.harm('Paralysed while anaesthesia was too light (depth index > 65) — risk of accidental awareness (NAP5)');
    }
    if (g.block > 0.8 && h < 0.45 && !g.done.phase_induction) e.harm('Neuromuscular blocker given to a patient who was not anaesthetised');

    // Pain on emergence
    if (g.phase === 'emergence' || g.phase === 'recovery') {
      const need = g.comp && (g.cfg.comps || {}).emergence === 'pain' ? 0.62 : g.cfg.painNeed || 0.35;
      g.pain = clamp((need - O) / need, 0, 1) * (awake(e) ? 1 : 0.3);
    } else g.pain = 0;

    // Haemodynamics (TCI / volatile; propofol boluses act through the drug pool)
    const cv = Math.min(2, (g.tciP.ce / 3.3) * 0.9 + g.ce / mac);
    if (g.sens > 1.25 && g.done.timeout) g.sens -= dt * 0.004; // post-induction sensitivity eases once surgery is under way
    p.vasoplegia = g.baseVaso * clamp(1 - 0.2 * cv * g.sens, 0.5, 1.2);
    p.contract = g.baseContract * (1 - 0.06 * cv);
    e.anaesSuppress = Math.max(e.anaesSuppress, clamp(0.45 * Math.min(1, cv + g.pbCe / 3.3) * g.sens, 0, 0.85));
    p.hrBase = g.baseHR * (1 - 0.25 * fr(R.ce, 3) - 0.06 * fr(g.fCe, 1.5)) - (g.bradyExtra || 0);
    p.stress = clamp(light * 0.8 + g.pain * 0.5 + (g.laryngospasm ? 0.3 : 0), 0, 0.6);

    // Breathing
    const bolusApnoea = g.pbCe > 2.3 ? 0.06 : 1;
    let effort = clamp(1 - 0.1 * Math.min(h, 1.5) - 0.3 * fr(g.fCe + g.mCe * 0.8, 1.2) - 0.85 * fr(R.ce, 1.8), 0, 1) * bolusApnoea * clamp(1 - g.block * 1.05, 0, 1);
    if (g.laryngospasm) effort *= 0.15;
    p.effort = effort;
    p.rrBase = 14 * (1 - 0.35 * O);
    const unconscious = g.bis < 72;
    p.airwayPatent = !g.laryngospasm && !g.obstruct && (!unconscious || ['maskHeld', 'lma', 'ett'].includes(g.airway) || g.recoveryJaw);
    p.gcs = g.bis > 85 ? 15 : g.bis > 75 ? 12 : g.bis > 65 ? 8 : 3;
    p.conscious = g.bis > 85 ? 'Alert' : g.bis > 75 ? 'Drowsy, rousable to voice' : 'Unconscious';

    // Rebreathing (exhausted absorbent)
    g.fico2 = g.absorbentOK ? 0 : g.fgf >= 5 ? Math.max(0, g.fico2 - dt * 0.03) : clamp(g.fico2 + dt * 0.02 * (2 / Math.max(0.5, g.fgf)), 0, 1.2);
    // Laryngospasm during a gas induction eases once deeper, with CPAP
    if (g.laryngospasm && g.ce / mac > 1.2 && g.done.larson && e.t - g.done.larson > 6 && g.phase === 'induction') { g.laryngospasm = false; e.say('Deeper now — with CPAP and 100% O₂ the spasm eases and the chest starts to move.', 'good'); }
    // Leaving the vaporiser high once asleep
    if (g.et / mac > 2.2) { g.hiMac = (g.hiMac || 0) + dt; if (g.hiMac > 45) e.harm('Sevoflurane left above 2 MAC for a prolonged period — turn the vaporiser down once asleep (cardiovascular depression)'); } else g.hiMac = Math.max(0, (g.hiMac || 0) - dt);
    p.vco2 = 1 + g.fico2 * 0.35 + light * 0.1;

    // Pre-oxygenation / apnoea messages
    if (g.phase === 'induction' && effort < 0.1 && !p.ventilated && !p.assisted && !g.apnoeaMsg && g.bis < 70) {
      g.apnoeaMsg = true; e.say('The patient has stopped breathing after induction — support the airway and ventilate.', 'warn');
    }

    // Phase progression
    if (g.phase === 'pre' && g.bis < 70) setPhase(e, 'induction');
    if (g.surgery) surgeryTick(e, dt);

    // Complications
    compTick(e, dt);

    // Drapes during surgery
    p.look.drapes = g.phase === 'maintenance' && !!g.surgery;
  }

  // ---------------- surgery timeline ----------------
  function surgeryTick(e) {
    const g = e.ga, s = g.surgery, c = g.cfg;
    const t = e.t - s.t0;
    if (!s.on && t > 4 && !s.done) { s.on = true; s.level = 1; e.say('Surgeon: "Knife to skin."', 'info'); stimulate(e, 1, 14); }
    if (s.on) {
      s.level = t < 18 ? 1 : (c.lap && t > 22 && t < 40 ? 0.75 : 0.6);
      if (c.lap && t > 22 && !s.insuff) { s.insuff = true; e.say('Surgeon: "Insufflating now." Pneumoperitoneum 12 mmHg.', 'info'); }
      if (c.tourniquet && t > 8 && !s.tq) { s.tq = true; e.say('Tourniquet inflated to 300 mmHg.', 'info'); }
      const dur = c.surgDur || 150;
      if (t > dur - 35 && !s.closing) { s.closing = true; e.say('Surgeon: "About 5 minutes to go — we’re closing."', 'info'); }
      if (t > dur) { s.on = false; s.done = true; s.level = 0; e.say('Surgeon: "All done — dressings on. Over to you."', 'good'); setPhase(e, 'emergence'); mark(e, 'surgeryDone'); }
    }
  }

  // ---------------- complications (mode "with complications") ----------------
  function compTick(e) {
    const g = e.ga; if (!g.comp) return;
    const c = g.cfg.comps || {}, p = e.p;
    // Induction stage
    if (c.induction && !g.c1 && g.done.phase_induction && e.t - g.done.phase_induction > (c.induction === 'laryngospasm' ? 6 : 14)) {
      g.c1 = true; e.flags.compl1 = c.induction; mark(e, 'comp_induction');
      if (c.induction === 'hypotension') { g.sens = 1.9; e.say('NIBP cycling… the blood pressure is falling after induction.', 'warn'); }
      if (c.induction === 'brady') { g.bradyExtra = 34; e.say('Heart rate is slowing markedly since the remifentanil started.', 'warn'); }
      if (c.induction === 'laryngospasm') { g.laryngospasm = true; e.say('Excitement phase: the patient breath-holds, then makes a high-pitched crowing noise — no chest movement.', 'bad'); }
    }
    // Maintenance stage
    if (c.maintenance && !g.c2 && g.surgery && g.surgery.on && e.t - g.surgery.t0 > (g.cfg.surgDur || 150) * 0.35) {
      g.c2 = true; e.flags.compl2 = c.maintenance; mark(e, 'comp_maintenance');
      if (c.maintenance === 'light') { stimulate(e, 1.25, 30); e.say('Surgeon: "Inserting the arthroscope and distending the joint now."', 'info'); }
      if (c.maintenance === 'insuffBrady') { g.bradyExtra = 44; e.flags.insuffBrady = true; e.say('Surgeon re-insufflates rapidly — the heart rate drops abruptly.', 'bad'); }
      if (c.maintenance === 'tissued') { e.flags.ivDown = true; e.say('Pump alarm: OCCLUSION on the TCI line. The arm around the cannula looks swollen.', 'bad'); }
      if (c.maintenance === 'absorbent') { g.absorbentOK = false; e.say('The CO₂ absorbent has turned purple. Inspired CO₂ is starting to rise.', 'warn'); }
    }
  }

  // ---------------- events ----------------
  function onEvent(e, ev) {
    const g = e.ga; if (!g) return null;
    const p = e.p, w = p.weight;
    const say = (t, k) => e.say(t, k || 'info');
    if (ev.type === 'drug') {
      const d = ev.dose;
      if (!g.ivOK && !/_im$|_neb$/.test(ev.id) && !e.flags.ivDown) { say('There is no IV access yet — nothing reached the patient.', 'bad'); return { handled: true }; }
      if (e.flags.ivDown) return null;
      if (ev.id === 'propofol') { g.pbA += (d / w) * 2.1; stimulate(e, 0, 1); if (d / w > 1.2 && g.phase === 'pre') setPhase(e, 'induction'); }
      if (ev.id === 'fentanyl') g.fA += (d / w) * 0.75;
      if (ev.id === 'morphine') g.mA += (d * 10 / w) * 0.75;
      if (ev.id === 'alfentanil') g.fA += (d / w) * 0.12;
      if (ev.id === 'rocuronium') { g.roc += d / w; mark(e, 'roc'); }
      if (ev.id === 'suxamethonium') { e.flags.suxBlock = e.t + 60; if (g.laryngospasm) { g.laryngospasm = false; say('Cords relax after suxamethonium — ventilate with 100% O₂.', 'good'); } }
      if (ev.id === 'sugammadex') {
        const cap = d * 0.25; // mg/kg roc encapsulated per mg/kg sugammadex
        const had = g.roc + g.rocCe; g.roc = Math.max(0, g.roc - cap); g.rocCe = Math.max(0, g.rocCe - cap);
        mark(e, 'reversal');
        say(had > cap ? 'Partial reversal only — not enough sugammadex for the depth of block.' : 'Sugammadex given — train-of-four recovering.', had > cap ? 'warn' : 'good');
      }
      if (ev.id === 'neostigmine') {
        const t = tof(g);
        g.neoUntil = e.t + 360; mark(e, 'reversal');
        if (t.count < 2) { say('Neostigmine given with a train-of-four count < 2 — it cannot reverse a block this deep.', 'warn'); g.neoUntil = e.t + 60; }
      }
      if (ev.id === 'glycopyrronium' || ev.id === 'atropine') { if (g.bradyExtra) g.bradyExtra = Math.max(0, g.bradyExtra - (ev.id === 'atropine' ? 35 : 28)); }
      if (ev.id === 'propofol' && g.laryngospasm && d / w >= 0.4) { g.laryngospasm = false; g.pbCe = Math.max(g.pbCe, g.pbA * 0.8); g.bis = Math.min(g.bis, 70); g.recoveryJaw = true; if (g.airway === 'none') g.airway = 'maskHeld'; say('Laryngospasm breaks after the propofol — hold the mask with a jaw thrust and give gentle positive pressure with 100% O₂.', 'good'); }
      return null;
    }
    if (ev.type === 'vent' && ev.key === 'fio2') { g.o2frac = ev.value; return null; }
    if (ev.type !== 'action') return null;
    const id = ev.id;
    const act = (fn) => { fn(); return { handled: true }; };
    switch (id) {
      case 'ga_machine': return act(() => { mark(e, 'machine'); say('Machine check complete: pipeline O₂ 4 bar, backup cylinder full, vaporiser seated and filled, circuit passes the leak test, suction working, ventilator checked.', 'good'); });
      case 'ga_signin': return act(() => { mark(e, 'signin'); say(g.cfg.signIn || 'WHO Sign In done: identity, procedure and consent confirmed; no known allergies; not a difficult airway; low aspiration risk; minimal blood loss expected.', 'good'); });
      case 'ga_monitor': return act(() => { g.monitors.std = true; p.noMonitor = false; mark(e, 'monitor'); say('SpO₂, 3-lead ECG and NIBP attached — baseline observations recorded.', 'good'); });
      case 'ga_bis': return act(() => { g.monitors.bis = true; mark(e, 'bis'); say('Processed-EEG sensor on the forehead — depth index showing.', 'good'); });
      case 'ga_nmt': return act(() => { g.monitors.nmt = true; mark(e, 'nmt'); say('Quantitative TOF monitor on the ulnar nerve — baseline recorded.', 'good'); });
      case 'ga_iv': return act(() => {
        if (g.ivOK && !e.flags.ivDown) { mark(e, 'ivCheck'); say(g.cfg.ivCheck || 'The cannula is in and flushes easily without swelling.', 'good'); return; }
        if (e.flags.ivDown) { e.flags.ivDown = false; e.mark('resite_iv'); mark(e, 'resite'); say('New cannula sited in the other arm — the pumps are re-connected and running.', 'good'); return; }
        if (g.cfg.needlePhobic && g.bis > 70) { say('The patient pulls away, distressed — “Please, no needles until I’m asleep.”', 'warn'); return; }
        g.ivOK = true; mark(e, 'iv');
        if (g.cfg.needlePhobic && g.bis > 58) { mark(e, 'ivLight'); stimulate(e, 0.6, 6); say('Cannula sited, but he pulls his hand away and coughs — still in stage 2. Wait until deeper next time.', 'warn'); if (g.comp && (g.cfg.comps || {}).induction === 'laryngospasm' && !g.c1) { g.c1 = true; e.flags.compl1 = 'laryngospasm'; mark(e, 'comp_induction'); g.laryngospasm = true; e.say('The cannulation triggers laryngospasm — high-pitched crowing, then silence; no chest movement.', 'bad'); } return; }
        say('20G cannula sited in the back of the hand and flushed.', 'good');
      });
      case 'ga_mask_on': return act(() => {
        if (g.fgf <= 0) { say('The facemask is on but there is no fresh gas flowing — set the O₂ flow on the machine.', 'warn'); }
        g.circuit = true; if (g.airway === 'none') g.airway = 'mask'; mark(e, 'mask');
        if (g.fgf > 0) say('Facemask held with a good seal; the reservoir bag moves with each breath.', 'good');
      });
      case 'ga_preox': return act(() => {
        if (!g.circuit || g.fgf < 4 || g.o2frac < 0.9) { say('To pre-oxygenate you need the facemask on the circuit, 100% O₂ and a high fresh gas flow (≥ 6 L/min).', 'warn'); return; }
        mark(e, 'preoxStart'); say('Pre-oxygenating: tight seal, 100% O₂ — watch the end-tidal O₂ climb towards 0.9.', 'good');
      });
      case 'ga_jaw': return act(() => {
        if (!g.circuit) { g.circuit = true; }
        g.airway = g.airway === 'lma' || g.airway === 'ett' ? g.airway : 'maskHeld'; mark(e, 'jaw');
        say(g.bis > 75 ? 'The patient is still awake — they gag on the Guedel airway. Wait until they are deeper.' : 'Airway open: jaw thrust with a size 3 Guedel airway, two-handed mask seal.', g.bis > 75 ? 'warn' : 'good');
        if (g.bis > 75) { stimulate(e, 0.6, 6); g.airway = 'mask'; }
      });
      case 'ga_mask_vent': return act(() => {
        if (!['maskHeld', 'mask'].includes(g.airway) && !g.laryngospasm) { say('Facemask ventilation is for before an airway device is in.'); return; }
        if (g.laryngospasm) { say('No chest movement — the cords are shut. Gentle CPAP, 100% O₂ and deepen.', 'bad'); return; }
        if (g.airway === 'mask' && g.bis < 72) { say('Hard to ventilate — the airway is obstructed. Open it with a jaw thrust and Guedel first.', 'warn'); return; }
        p.assisted = true; g.circuit = true; mark(e, 'maskVent'); say('Hand-ventilating via the facemask: good chest rise, capnography trace present.', 'good');
      });
      case 'ga_lma': return act(() => {
        if (g.airway === 'lma') { say('The i-gel is already in.'); return; }
        if (g.bis > 62 || immob(e) < 0.7) {
          stimulate(e, 0.7, 8); mark(e, 'lmaLight');
          if (g.bis > 70) { say('The patient bites and gags — far too light to insert an i-gel. Deepen anaesthesia first.', 'bad'); return; }
          say('Insertion provokes coughing and breath-holding — the patient was too light. Deepen before trying again.', 'warn'); return;
        }
        g.airway = 'lma'; g.circuit = true; p.sga = true; mark(e, 'lma'); stimulate(e, 0.5, 6);
        say('i-gel size 4 inserted: square capnograph, no leak, chest moving. Secure it.', 'good');
      });
      case 'ga_intubate': return act(() => {
        if (g.airway === 'ett') { say('Already intubated.'); return; }
        if (g.bis > 65) { say('The patient is not deep enough — laryngoscopy now would be dangerous. Deepen first.', 'bad'); stimulate(e, 0.9, 8); return; }
        if (g.block < 0.95 && !(e.flags.suxBlock && e.t < e.flags.suxBlock)) { say('The cords are moving and the jaw is tight — train-of-four not yet 0. Wait for full neuromuscular block (or give more).', 'warn'); stimulate(e, 0.9, 8); return; }
        g.airway = 'ett'; g.circuit = true; p.assisted = true; p.sga = false; mark(e, 'intubate'); stimulate(e, 0.9, 12);
        say('Grade 1 view with the videolaryngoscope. Size 7.5 cuffed tube through the cords, cuff inflated.', 'good');
      });
      case 'ga_confirm': return act(() => {
        if (g.airway !== 'ett') { say('No tube to confirm.'); return; }
        mark(e, 'confirm'); say('Sustained capnography over 6 breaths, equal bilateral air entry, tube tied at 22 cm at the lips.', 'good');
      });
      case 'ga_vent_on': return act(() => {
        if (!['ett', 'lma'].includes(g.airway)) { say('Secure the airway before starting the ventilator.', 'warn'); return; }
        p.ventilated = true; p.assisted = false; p.ventRR = 12; p.peep = 5; mark(e, 'ventOn');
        say('Ventilator on: VCV 500 mL × 12/min, PEEP 5 cmH₂O, I:E 1:2.', 'good');
      });
      case 'ga_spont': return act(() => {
        if (g.airway !== 'lma' && g.airway !== 'maskHeld') { say('Spontaneous breathing is used with an LMA or facemask.'); return; }
        p.assisted = false; p.ventilated = false; mark(e, 'spont');
        say(p.effort < 0.3 ? 'The patient is not breathing enough yet — keep assisting until breathing returns.' : 'Spontaneous breathing on the circuit — watch the bag, capnograph and respiratory rate.', p.effort < 0.3 ? 'warn' : 'good');
        if (p.effort < 0.3) p.assisted = true;
      });
      case 'ga_eyes': return act(() => { mark(e, 'eyes'); say('Eyes taped, limbs padded and positioned, forced-air warmer on, temperature probe placed.', 'good'); });
      case 'ga_timeout': return act(() => {
        if (!['lma', 'ett'].includes(g.airway)) { say('Secure the airway before Time Out and surgery.', 'warn'); return; }
        mark(e, 'timeout'); setPhase(e, 'maintenance');
        say(g.cfg.timeOut || 'WHO Time Out: team introductions, patient, procedure and site confirmed; antibiotics given; no critical events expected.', 'good');
        if (!g.surgery) g.surgery = { t0: e.t, on: false };
      });
      case 'ga_resite': case 'resite_iv': return act(() => {
        if (e.flags.ivDown) { e.flags.ivDown = false; e.mark('resite_iv'); mark(e, 'resite'); say('The old cannula has tissued — new 18G cannula sited in the other arm, flushed and the pumps re-connected. Drugs are reaching the patient again.', 'good'); }
        else if (!g.ivOK) say('There is no cannula yet.');
        else say('The cannula flushes easily — no swelling at the site.');
      });
      case 'ga_desufflate': case 'stop_insufflation': return act(() => {
        mark(e, 'desufflate');
        if (g.bradyExtra && e.flags.insuffBrady) { say('Surgeon releases the pneumoperitoneum — heart rate recovering. They re-insufflate slowly at a lower pressure.', 'good'); g.bradyExtra = Math.max(0, g.bradyExtra - 30); e.flags.insuffBrady = false; }
        else say('Pneumoperitoneum released briefly, then re-established.');
      });
      case 'stop_surgery': return act(() => { if (g.surgery) { g.stimEvents = []; } say('Surgeon pauses for a moment.'); });
      case 'ga_absorbent': return act(() => { g.absorbentOK = true; g.fico2 = 0; mark(e, 'absorbent'); say('New soda lime canister fitted — inspired CO₂ back to zero.', 'good'); });
      case 'ga_signout': return act(() => { mark(e, 'signout'); say('WHO Sign Out: procedure recorded, counts correct, specimens labelled, recovery concerns discussed.', 'good'); });
      case 'ga_suction': return act(() => { mark(e, 'suction'); say('Oropharynx suctioned under direct vision — small amount of clear secretions.', 'good'); if (stage2(e)) stimulate(e, 0.4, 5); });
      case 'ga_extubate': return act(() => {
        if (g.airway !== 'ett') { say('There is no tube in.'); return; }
        const t = tof(g);
        if (g.phase !== 'emergence' && g.phase !== 'recovery') { say('Surgery isn’t finished — don’t extubate yet.', 'bad'); return; }
        g.airway = 'none'; p.ventilated = false; p.assisted = false; g.circuit = true; mark(e, 'extubate');
        if (g.bis < 80) {
          if (stage2(e) || g.comp) { g.laryngospasm = true; say('Extubated while still in the excitement stage — laryngospasm! High-pitched noise, then silence; SpO₂ falling.', 'bad'); }
          else { g.obstruct = true; say('Extubated before waking — the airway obstructs and SpO₂ starts to fall.', 'bad'); }
          e.harm('Tracheal tube removed before the patient was awake');
          return;
        }
        if (t.count < 4 || t.ratio < 0.9) {
          e.harm('Extubated with residual neuromuscular block (TOF ratio < 0.9)');
          g.obstruct = t.ratio < 0.6; say(`Extubated with TOF ratio ${Math.round(t.ratio * 100)}% — weak, shallow breathing, can’t lift their head.`, 'bad'); return;
        }
        say('Extubated awake: eyes open, obeying commands, regular breathing on 100% O₂ by facemask.', 'good');
        setPhase(e, 'recovery');
      });
      case 'ga_lma_out': return act(() => {
        if (g.airway !== 'lma') { say('There is no i-gel in.'); return; }
        if (g.phase !== 'emergence' && g.phase !== 'recovery') { say('Surgery isn’t finished yet.', 'bad'); return; }
        g.airway = 'none'; p.sga = false; p.ventilated = false; p.assisted = false; g.circuit = true; mark(e, 'lmaOut');
        const forced = g.comp && (g.cfg.comps || {}).emergence === 'laryngospasm';
        if (stage2(e) || forced) { g.laryngospasm = true; if (forced) mark(e, 'comp_emergence'); say('As the i-gel comes out the patient coughs, then stridor and silence — laryngospasm. SpO₂ falling.', 'bad'); if (!forced) e.harm('Airway device removed during the excitement stage (stage 2)'); return; }
        if (g.bis < 58) { g.obstruct = (g.cfg.comps || {}).emergence === 'obstruct' && g.comp; if (g.obstruct) mark(e, 'comp_emergence'); say(g.obstruct ? 'Removed deep — the patient snores, then the airway obstructs with paradoxical chest movement.' : 'Removed deep: breathing quietly via facemask with a jaw thrust. Watch closely until awake.', g.obstruct ? 'bad' : 'warn'); g.recoveryJaw = !g.obstruct; return; }
        if ((g.cfg.comps || {}).emergence === 'obstruct' && g.comp) { g.obstruct = true; mark(e, 'comp_emergence'); say('Removed awake, but the patient drifts back to sleep and obstructs — snoring, then silent, SpO₂ falling.', 'bad'); return; }
        say('i-gel removed awake: coughing appropriately, breathing quietly on facemask O₂.', 'good'); setPhase(e, 'recovery');
      });
      case 'ga_larson': return act(() => {
        mark(e, 'larson'); g.circuit = true; g.recoveryJaw = true; g.o2frac = 1; g.fgf = Math.max(g.fgf, 8); p.assisted = true;
        if (g.obstruct) { g.obstruct = false; g.recoveryJaw = true; say('Jaw thrust and an oropharyngeal airway relieve the obstruction — chest moving, SpO₂ recovering.', 'good'); return; }
        if (g.laryngospasm) { say('CPAP with 100% O₂ and firm pressure at Larson’s point… partial improvement. If it doesn’t break: propofol 0.5 mg/kg, then suxamethonium.', 'warn'); e.after(8, (en) => { if (en.ga.laryngospasm && Math.random() < 0.35) { en.ga.laryngospasm = false; en.say('The spasm breaks with CPAP — chest moving again.', 'good'); } }); return; }
        say('Airway supported with 100% O₂.', 'info');
      });
      case 'ga_recovery_o2': return act(() => {
        if (!awake(e) || ['lma', 'ett'].includes(g.airway) || g.laryngospasm || g.obstruct) { say('Not ready for recovery: the patient must be awake, airway device out and breathing comfortably.', 'warn'); return; }
        g.recoveryO2 = true; p.assisted = false; mark(e, 'toRecovery'); setPhase(e, 'recovery'); say('Transferred to recovery on facemask O₂ 5 L/min with full monitoring.', 'good');
      });
      case 'ga_handover': return act(() => {
        if (!g.done.toRecovery) { say('Get the patient safely to recovery first.', 'warn'); return; }
        if (g.pain > 0.5) { say('Recovery nurse: "They’re in a lot of pain (9/10) — can you sort the analgesia before you go?"', 'warn'); return; }
        if (p.spo2 < 94) { say('Recovery nurse: "SpO₂ is only ' + p.spo2 + '% — I’m not happy to take them yet."', 'warn'); return; }
        mark(e, 'handover'); say('SBAR handover given: procedure, airway, drugs and doses, analgesia and antiemetic plan, fluids, concerns. Recovery nurse happy to take over.', 'good');
      });
      default: return null;
    }
  }

  // ---------------- machine panel ----------------
  function panelHTML(e, level) {
    const g = e.ga, p = e.p; if (!g) return '';
    const t = tof(g), mac = macAge(p);
    const ph = PHASES.findIndex((x) => x[0] === g.phase);
    const showList = level === 'junior';
    const steps = (e.scn.critical || []).filter((c) => !c.skip || !c.skip(e)).map((c) => ({ text: c.text, done: !!c.check(e) }));
    const phaseBar = `<div class="ga-phases">${PHASES.map(([k, n], i) => `<span class="${i < ph ? 'done' : i === ph ? 'on' : ''}">${n}</span>`).join('')}</div>`;
    const list = showList ? `<details class="ga-steps" open><summary>Steps (junior grade)</summary><ol>${steps.map((s) => `<li class="${s.done ? 'ok' : ''}">${esc(s.text)}</li>`).join('')}</ol></details>` : '';
    const rd = (k, v, cls) => `<div class="ga-rd ${cls || ''}"><span>${k}</span><b>${v}</b></div>`;
    const readouts = `<div class="ga-readouts">
      ${rd('FiO₂ / EtO₂', g.circuit ? `${r1(p.fio2 * 100).replace('.0', '')}% / ${Math.round(g.eto2 * 100)}%` : 'room air')}
      ${rd('Sevo Fi / Et', `${r1(g.fi)} / ${r1(g.et)} %`)}
      ${rd('MAC (age-adj.)', (g.et / mac).toFixed(2), g.et / mac > 1.6 ? 'warn' : '')}
      ${rd('Depth index', g.monitors.bis ? Math.round(g.bis) : '—', g.monitors.bis && (g.bis > 60 && g.phase === 'maintenance') ? 'warn' : '')}
      ${rd('TOF', g.monitors.nmt ? (t.count < 4 ? `count ${t.count}` : `${t.count} · ratio ${Math.round(t.ratio * 100)}%`) : '—')}
      ${rd('Propofol Ce', g.tciP.on || propCe(g) > 0.2 ? `${r1(propCe(g))} µg/mL` : '—')}
      ${rd('Remi Ce', g.tciR.on || g.tciR.ce > 0.2 ? `${r1(g.tciR.ce)} ng/mL` : '—')}
      ${g.absorbentOK ? '' : rd('FiCO₂', `${r1(g.fico2)} kPa`, 'warn')}
    </div>`;
    const machine = `<div class="grp"><h4>Anaesthetic machine</h4><div class="ga-machine">
      <label>Fresh gas flow <output>${r1(g.fgf)} L/min</output><input type="range" min="0" max="10" step="0.5" value="${g.fgf}" data-ga="fgf"></label>
      <label>O₂ in fresh gas <output>${Math.round(g.o2frac * 100)}%</output><input type="range" min="0.3" max="1" step="0.05" value="${g.o2frac}" data-ga="o2frac"></label>
      <label>Sevoflurane vaporiser <output>${r1(g.dial)}%</output><input type="range" min="0" max="8" step="0.5" value="${g.dial}" data-ga="dial"></label>
    </div></div>`;
    const T = g.tciP, R = g.tciR;
    const tci = (e.scn.ga && e.scn.ga.tci) || T.on || R.on ? `<div class="grp"><h4>TCI pumps</h4><div class="ga-tci">
      <div class="ga-pump"><b>Propofol 1%</b>
        <select data-ga-model><option ${T.model === 'Schnider' ? 'selected' : ''}>Schnider</option><option ${T.model === 'Marsh' ? 'selected' : ''}>Marsh</option></select>
        <span class="small muted">${T.model === 'Marsh' ? 'plasma (Cp) target' : 'effect-site (Ce) target'}</span>
        <label>Target <input type="number" min="0" max="8" step="0.5" value="${T.target || 0}" data-ga-t="p"> µg/mL</label>
        <button class="btn sm" data-ga-go="p">${T.on ? 'Update' : 'Start'}</button>${T.on ? '<button class="btn sm" data-ga-stop="p">Stop</button>' : ''}
        <span class="small muted">${T.on ? 'Running · ' : ''}${Math.round(T.mg)} mg given</span></div>
      <div class="ga-pump"><b>Remifentanil 50 mcg/mL</b><span class="small muted">Minto, effect-site target</span>
        <label>Target <input type="number" min="0" max="10" step="0.5" value="${R.target || 0}" data-ga-t="r"> ng/mL</label>
        <button class="btn sm" data-ga-go="r">${R.on ? 'Update' : 'Start'}</button>${R.on ? '<button class="btn sm" data-ga-stop="r">Stop</button>' : ''}
        <span class="small muted">${R.on ? 'Running · ' : ''}${Math.round(R.mcg)} mcg given</span></div>
    </div></div>` : '';
    const groups = PHASES.map(([k, n]) => {
      const acts = ACTIONS.filter((a) => a.ph === k && (!a.lap || g.cfg.lap) && (!e.scn.ga.hide || !e.scn.ga.hide.includes(a.id)));
      return acts.length ? `<div class="grp"><h4>${n}</h4><div class="act-grid">${acts.map((a) => `<button class="btn ${e.did(a.id) ? 'done' : ''}" data-act="${a.id}">${esc(a.name)}${e.did(a.id) ? ' ✓' : ''}</button>`).join('')}</div></div>` : '';
    }).join('');
    return `<div class="ga-panel"><div class="ga-live">${phaseBar}${list}${readouts}</div>${machine}${tci}${groups}
      <p class="muted small">Give drugs (propofol, fentanyl, rocuronium, reversal, antiemetics, analgesia, vasopressors) from the Drugs tab. Time is compressed: a whole anaesthetic takes about 10 minutes.</p></div>`;
  }

  // Just the live part (phase bar, checklist, readouts) — refreshed every second without disturbing the controls.
  function liveHTML(e, level) { const m = /<div class="ga-live">([\s\S]*?)<\/div><div class="grp">/.exec(panelHTML(e, level)); return m ? m[1] : ''; }

  function wire(body, e, guard, rerender) {
    const g = e.ga; if (!g) return;
    body.querySelectorAll('[data-ga]').forEach((r) => {
      const out = r.parentElement.querySelector('output');
      r.oninput = () => { const v = +r.value; out.textContent = r.dataset.ga === 'o2frac' ? Math.round(v * 100) + '%' : r1(v) + (r.dataset.ga === 'fgf' ? ' L/min' : '%'); };
      r.onchange = () => {
        if (!guard()) return;
        const k = r.dataset.ga, v = +r.value; const old = g[k]; g[k] = v;
        const lab = k === 'fgf' ? `Fresh gas flow ${r1(v)} L/min` : k === 'o2frac' ? `O₂ ${Math.round(v * 100)}% in fresh gas` : `Sevoflurane vaporiser ${r1(v)}%`;
        e.mark('ga_' + k); e.emit({ type: 'action', id: 'ga_set_' + k, text: lab, kind: 'act' });
        if (k === 'dial') { if (v > 0) e.mark('sevoOn'); if (v === 0 && old > 0) { e.mark('sevoOff'); } if (v >= 6) e.mark('sevoHigh'); }
        if (k === 'fgf' && v <= 1.5 && v > 0) e.mark('lowFlow');
        if (k === 'fgf' && v >= 6 && e.ga.phase === 'emergence') e.mark('highFlowEnd');
        rerender();
      };
    });
    const sel = body.querySelector('[data-ga-model]'); if (sel) sel.onchange = () => { if (g.tciP.on) { sel.value = g.tciP.model; e.say('Stop the pump before changing model.', 'warn'); return; } g.tciP.model = sel.value; rerender(); };
    body.querySelectorAll('[data-ga-go]').forEach((b) => (b.onclick = () => {
      if (!guard()) return;
      const k = b.dataset.gaGo, inp = body.querySelector(`[data-ga-t="${k}"]`), v = clamp(+inp.value || 0, 0, k === 'p' ? 8 : 10);
      const P = k === 'p' ? g.tciP : g.tciR;
      if (!g.ivOK) { e.say('There is no IV access for the pump.', 'bad'); return; }
      P.on = v > 0; P.target = v;
      const name = k === 'p' ? `Propofol TCI (${g.tciP.model}) target ${v} µg/mL` : `Remifentanil TCI (Minto) target ${v} ng/mL`;
      e.mark(k === 'p' ? 'tciProp' : 'tciRemi'); e.emit({ type: 'action', id: k === 'p' ? 'ga_tci_p' : 'ga_tci_r', text: name, kind: 'act' });
      if (k === 'p' && v >= 3 && g.phase === 'pre') setPhase(e, 'induction');
      rerender();
    }));
    body.querySelectorAll('[data-ga-stop]').forEach((b) => (b.onclick = () => {
      if (!guard()) return;
      const k = b.dataset.gaStop, P = k === 'p' ? g.tciP : g.tciR; P.on = false; P.target = 0;
      e.mark(k === 'p' ? 'tciPropOff' : 'tciRemiOff'); e.emit({ type: 'action', id: 'ga_stop_' + k, text: k === 'p' ? 'Propofol TCI stopped' : 'Remifentanil TCI stopped', kind: 'act' });
      rerender();
    }));
  }

  // ---------------- examination ----------------
  function exam(e) {
    const g = e.ga, p = e.p, t = tof(g);
    const bp = `${Math.round(p.sbp)}/${Math.round(p.dbp)}`;
    const A = g.laryngospasm ? 'Laryngospasm: high-pitched inspiratory noise then silence, tracheal tug, no air movement.'
      : g.obstruct ? 'Obstructed: snoring then silent, see-saw chest movement.'
        : g.airway === 'ett' ? 'Cuffed tracheal tube, tied; capnography trace present.' : g.airway === 'lma' ? 'i-gel in place, square capnograph, no leak.'
          : g.airway === 'maskHeld' ? 'Facemask with jaw thrust and Guedel airway.' : g.bis > 85 ? 'Talking, airway patent.' : g.bis > 72 ? 'Drowsy, maintaining own airway.' : 'Unconscious: soft-tissue obstruction unless the airway is supported.';
    const B = p.ventilated ? `Ventilated, RR ${p.rr}, SpO₂ ${p.spo2}%, EtCO₂ ${(p.etco2 / 7.5).toFixed(1)} kPa, Ppeak ${Math.round(p.paw)} cmH₂O.` : p.effort < 0.1 && !p.assisted ? `Apnoeic. SpO₂ ${p.spo2}%.` : `${p.assisted ? 'Assisted' : 'Spontaneous'} breathing, RR ${p.rr}, SpO₂ ${p.spo2}%${g.circuit ? ', EtCO₂ ' + (p.etco2 / 7.5).toFixed(1) + ' kPa' : ''}.`;
    const C = `HR ${p.hr}, BP ${bp}. ${p.map < 65 ? 'Peripherally cool.' : 'Warm peripheries.'}`;
    const depth = g.bis > 85 ? 'Awake and orientated' : g.bis > 75 ? 'Drowsy, opens eyes to voice' : g.bis > 58 ? 'Lightly anaesthetised: eyelash reflex present, may respond to stimulation' : g.bis > 40 ? 'Anaesthetised: eyelash reflex absent, pupils central' : 'Deeply anaesthetised';
    const D = `${depth}. ${g.monitors.nmt ? 'TOF ' + (t.count < 4 ? 'count ' + t.count : 'ratio ' + Math.round(t.ratio * 100) + '%') + '.' : ''}${g.pain > 0.4 ? ' Grimacing, in pain.' : ''}`;
    const E = `${(e.scn.ga && e.scn.ga.exposure) || 'Theatre.'} Temp ${p.temp.toFixed(1)} °C.`;
    return { A, B, C, D, E };
  }

  S.GA = { setup, tick, onEvent, panelHTML, liveHTML, wire, exam, tof, macAge, hyp, awake, propCe, opioid, PHASES };
})();
