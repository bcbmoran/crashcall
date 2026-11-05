/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Physiology engine.
 * A deliberately simple, transparent lumped model built for teaching:
 *   MAP = CO × SVR / 80 + small CVP term,   CO = HR × SV
 *   SV  = SVmax × Starling(preload × (1 − obstruction)) × contractility^0.75 × filling-time × afterload terms
 *   SaO2 = (1 − shunt) × end-capillary saturation + shunt × mixed venous saturation
 * A baroreflex "sympathetic tone" state provides compensation (HR, SVR, venous tone, contractility)
 * which is blunted by anaesthesia, sympathectomy, β-blockade, etc.
 */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  S.clamp = clamp;

  // Severinghaus O2 dissociation (PO2 in mmHg)
  function sev(po2) {
    if (po2 <= 0.5) return 0;
    return 1 / (23400 / (po2 * po2 * po2 + 150 * po2) + 1);
  }
  function invSev(s) {
    let lo = 0, hi = 700;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (sev(m) < s) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  S.sev = sev; S.invSev = invSev;
  // Steep Frank–Starling relation, normalised so Starling(1) = 1
  const starling = (p) => { p = Math.max(0, p); const k = 0.5; return ((1 + k) * p * p * p) / (p * p * p + k); };
  S.starling = starling;

  const FIXED_RHYTHMS = ['svt', 'chb', 'paced', 'vt'];
  const ARREST_RHYTHMS = ['vf', 'asystole', 'pea'];

  const DEFAULTS = {
    weight: 75, age: 50, sex: 'M',
    vol: 1, leak: 0, bleed: 0, vasoplegia: 1, venodil: 0, contract: 1, obstruct: 0,
    hrBase: 72, rhythm: 'sinus', fixedRate: 0, paceRate: 70, baro: 1, atropineResp: 1, catecholResp: 1,
    shunt: 0.03, peepRecruit: 0.5, deadspace: 0.12, bronchospasm: 0, airwayPatent: true, effort: 1, rrBase: 14,
    ventilated: false, assisted: false, sga: false, fio2: 0.21, peep: 5, ventRR: 14, autoPEEP: 0,
    vco2: 1, vo2: 1, temp: 37, tempRate: 0, hb: 140, k: 4.2, na: 139, glucose: 6, lactate: 1.0, lacGen: 0,
    extraAcid: 0, bicarb: 0, coag: 0, pulmOedema: 0, oedemaProne: 0.5, pregnant: false,
    artLine: false, cvc: false, gcs: 15, conscious: 'Alert',
    // paediatric scaling & misc (defaults = adult)
    paed: false, svScale: 1, svrScale: 1, mapNormal: 82, coRef: 5.6, hrGain: 65, mapArrest: 38, hrAlarm: [45, 140], stress: 0, arrested: false, monitorOff: false,
    ecg: { st: 0, tPeak: 1, qrsW: 1, p: 1 },
    look: {},
    // state
    sym: 0, map: 80, PAO2: 100, paco2: 40, sa: 0.98, ph: 7.4, hco3: 24,
  };

  // Grade-based difficulty. prog = speed of disease progression; tol = seconds of critical hypotension/hypoxia tolerated
  // before arrest; stable = seconds targets must be held; nudge = junior prompts; complication = consultant second problem.
  S.LEVELS = {
    junior: { id: 'junior', name: 'Junior trainee', who: 'FY / CT / ACCS / ST1–2', prog: 0.7, tol: 1.5, stable: 15, nudge: 40, complication: false, showTargets: true,
      blurb: 'Slower deterioration, more time before arrest, the nurse prompts you if you stall, targets visible.' },
    senior: { id: 'senior', name: 'Senior trainee', who: 'ST3+ / registrar', prog: 1, tol: 1, stable: 20, nudge: 0, complication: false, showTargets: true,
      blurb: 'Standard physiology and timings, no prompts.' },
    consultant: { id: 'consultant', name: 'Consultant', who: 'Consultant / post-CCT', prog: 1.35, tol: 0.7, stable: 30, nudge: 0, complication: true, showTargets: false,
      blurb: 'Faster deterioration, less margin, targets hidden — stabilise to the standard you would expect, then declare the patient stable and hand over (a premature declaration is penalised). A second problem will arise mid-case.' },
  };

  // ---- Physiological consequences of harmful actions ----
  // Every harm costs 30 s on the score, but where an action would really hurt the patient it also changes the
  // physiology here, so repeated or uncorrected errors can tip the patient into arrest. Each rule fires once per
  // distinct harm (harms are de-duplicated). Rules that a scenario already models itself are left out.
  const vtBurst = (e, secs, rate) => { const p = e.p; if (p.arrested || p.rhythm === 'vf') return; const prev = p.rhythm, pr = p.fixedRate; p.rhythm = 'vt'; p.fixedRate = rate || (p.paed ? 230 : 190); e.after(secs, (en) => { if (en.p.rhythm === 'vt' && !en.p.arrested) { en.p.rhythm = prev === 'vt' ? 'sinus' : prev; en.p.fixedRate = pr; } }); };
  S.HARM_FX = [
    [/crystalloid.*(haemorrhag|bleed|trauma|obstetric)|crystalloid in variceal|More than 10 mL\/kg crystalloid/i, (e) => { e.p.coag = Math.min(1.5, e.p.coag + 0.25); e.p.bleed *= 1.15; return 'dilutional coagulopathy — bleeding faster'; }],
    [/fluid.*(cardiogenic|pulmonary oedema|ARDS|leaky|neurogenic|fluid overload)|60 mL\/kg fluid/i, (e) => { e.p.pulmOedema = Math.min(1, e.p.pulmOedema + 0.18); return 'pulmonary oedema worsening — oxygenation falling'; }],
    [/Vasopressor used as a substitute/i, (e) => { e.p.lacGen = (e.p.lacGen || 0) + 0.0006; e.p.bleed *= 1.1; return 'peripheral vasoconstriction while still bleeding — lactate rising'; }],
    [/(CT|Transfer).*(hypotens|unstable|shocked|instability)/i, (e) => { e.after(15, (en) => { if (en.outcome) return; en.p.contract *= 0.92; en.p.lactate += 1; en.p.vol = Math.max(0.3, en.p.vol - 0.04); en.say('In the scanner, away from resuscitation, the patient deteriorates.', 'bad'); }); return 'the patient deteriorates during the transfer'; }],
    [/Waiting for a CXR before decompressing/i, (e) => { e.p.obstruct = Math.min(0.9, e.p.obstruct + 0.12); return 'tension worsening while waiting'; }],
    [/positive-pressure ventilation in acute RV failure/i, (e) => { e.p.obstruct = Math.min(0.9, e.p.obstruct + 0.2); e.anaesSuppress = Math.max(e.anaesSuppress, 0.65); return 'loss of sympathetic drive and raised intrathoracic pressure — the RV is failing'; }],
    [/Large IV adrenaline bolus in a child|Arrest-dose adrenaline in a child|IM adrenaline dose too high|Large adrenaline doses impair/i, (e) => { vtBurst(e, 20); e.p.contract *= 0.95; return 'ventricular tachycardia and myocardial strain'; }],
    [/Nitrate|Vasodilator in tamponade/i, (e) => { e.p.venodil = Math.min(0.6, e.p.venodil + 0.15); return 'venodilatation — preload and blood pressure falling'; }],
    [/Diuretic in preload-dependent/i, (e) => { e.p.vol = Math.max(0.4, e.p.vol - 0.1); return 'diuresis — the preload-dependent RV is filling less'; }],
    [/Over-transfusion/i, (e) => { e.p.bleed *= 1.3; return 'portal pressure up — re-bleeding'; }],
    [/DC cardioversion (of|for) sinus rhythm|Defibrillation of a non-shockable/i, (e) => { e.p.contract *= 0.94; return 'myocardial stunning from an unnecessary shock'; }],
    [/Propofol (RSI )?in (a hypovolaemic|severe asthma)/i, (e) => { e.anaesSuppress = Math.max(e.anaesSuppress, 0.75); e.p.vol = Math.max(0.4, e.p.vol - 0.05); return 'profound hypotension after propofol with gas trapping'; }],
    [/Repeated intubation attempts/i, (e) => { e.p.shunt = Math.min(0.5, e.p.shunt + 0.1); return 'airway trauma and oedema — oxygenation worsening'; }],
    [/Vasopressin is not recommended in LAST/i, (e) => { e.p.contract *= 0.9; return 'myocardial depression worsens'; }],
    [/Deepening anaesthesia in a hypotensive/i, (e) => { e.anaesSuppress = Math.min(0.9, e.anaesSuppress + 0.3); return 'deeper anaesthesia — blood pressure falls further'; }],
    [/Oxygen re-applied while the fire/i, (e) => { e.p.shunt = Math.min(0.6, e.p.shunt + 0.15); e.p.bronchospasm = Math.min(1, (e.p.bronchospasm || 0) + 0.3); return 'airway burn — bronchospasm and hypoxaemia'; }],
    [/Patient moved without portable oxygen/i, (e) => { const p = e.p, f0 = p.fio2; p.fio2 = 0.21; p.lastFio2 = 0.21; e.after(20, (en) => { en.p.fio2 = Math.max(en.p.fio2, f0); en.p.lastFio2 = en.p.fio2; }); return 'no oxygen during the move — desaturating'; }],
    [/Magnesium above 40 mg\/kg/i, (e) => { e.p.vasoplegia *= 0.85; e.p.effort = Math.max(0.2, e.p.effort * 0.7); e.p.hrBase -= 10; return 'magnesium toxicity — hypotension, bradycardia and weak respiratory effort'; }],
    [/More than two doses of benzodiazepine/i, (e) => { e.p.effort = Math.max(0.15, e.p.effort * 0.6); return 'respiratory depression'; }],
    [/Insulin (bolus|above 0\.1)/i, (e) => { e.p.k = Math.max(2.2, e.p.k - 0.7); e.p.glucose = Math.max(2, e.p.glucose * 0.8); return 'potassium and glucose falling quickly'; }],
    [/^Bicarbonate in DKA/i, (e) => { e.p.k = Math.max(2.2, e.p.k - 0.5); return 'potassium falling (intracellular shift)'; }],
    [/DC cardioversion in digoxin toxicity/i, (e) => { e.after(3, (en) => { if (!en.outcome) { en.p.rhythm = 'vf'; en.say('The shock has precipitated ventricular fibrillation!', 'bad'); } }); return 'refractory VF after cardioversion'; }],
    [/Amiodarone prolongs QT/i, (e) => { e.p.ecg.qtc = (e.p.ecg.qtc || 480) + 40; vtBurst(e, 15, 230); return 'QT lengthens — another run of torsades'; }],
    [/Catecholamine in electrical storm/i, (e) => { vtBurst(e, 25, 210); return 'VT recurs'; }],
    [/Antiplatelets in suspected aortic dissection|Thrombolysis in aortic dissection/i, (e) => { e.p.bleed += 0.0005; e.p.obstruct = Math.min(0.8, e.p.obstruct + 0.1); return 'the dissection bleeds into the pericardium'; }],
    [/MAP reduced by more than/i, (e) => { e.p.gcs = Math.min(e.p.gcs, 11); return 'cerebral hypoperfusion — conscious level falls'; }],
    [/Potassium added with K/i, (e) => { e.p.k += 0.8; return 'potassium rising'; }],
    [/Antibiotics not given within 1 hour/i, (e) => { e.p.vasoplegia *= 0.9; e.p.lacGen = (e.p.lacGen || 0) + 0.0004; return 'sepsis progressing'; }],
    [/Thrombolysis (before CT|with BP above)/i, (e) => { e.after(25, (en) => { if (en.outcome) return; en.p.gcs = Math.min(en.p.gcs, 8); en.say('Sudden headache, vomiting and falling GCS — haemorrhagic transformation.', 'bad'); }); return 'intracranial haemorrhage risk'; }],
    [/Incision\/suction of the bite/i, (e) => { e.p.bleed += 0.0003; return 'bleeding from the wound (venom coagulopathy)'; }],
    [/Abdominal thrusts in an infant/i, (e) => { e.p.bleed += 0.0003; return 'liver injury — internal bleeding'; }],
    [/Electrical cardioversion of stable AF of > 48 h/i, (e) => { e.after(20, (en) => { if (en.outcome) return; en.p.gcs = Math.min(en.p.gcs, 12); en.say('New right-sided weakness and slurred speech — embolic stroke.', 'bad'); }); return 'embolic stroke'; }],
    [/without sedation/i, (e) => { e.p.stress = Math.min(0.6, (e.p.stress || 0) + 0.3); e.after(30, (en) => { en.p.stress = Math.max(0, en.p.stress - 0.3); }); return 'pain and distress — catecholamine surge'; }],
    [/Chest compressions on a patient with a pulse/i, (e) => { e.p.contract *= 0.97; return 'rib fractures and myocardial contusion'; }],
  ];

  class Engine {
    constructor(scn, opts) {
      this.scn = scn;
      this.L = S.LEVELS[(opts && opts.level) || 'senior'] || S.LEVELS.senior;
      this.level = this.L.id;
      this.mode = (opts && opts.mode) || 'routine'; // routine-anaesthesia cases: 'routine' | 'comp'
      this.t = 0;
      this.log = [];
      this.done = {};
      this.pools = {};
      this.timers = [];
      this.fluidQ = [];
      this.harms = [];
      this.temps = [];
      this.fluidIn = { crystalloid: 0, rbc: 0, ffp: 0, plt: 0, cryo: 0 };
      this.flags = {};
      this.outcome = null;
      this.stableTime = 0;
      this.lowMapTime = 0;
      this.lowSatTime = 0;
      this.anaesSuppress = 0; // 0..1 induction-related loss of sympathetic tone
      this.listeners = [];
      const pat = JSON.parse(JSON.stringify(scn.patient || {}));
      this.p = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), pat);
      this.p.ecg = Object.assign({}, DEFAULTS.ecg, pat.ecg || {});
      this.p.hbMass = this.p.hb * this.p.vol;
      this.p.lastFio2 = this.p.fio2;
      if (scn.init) scn.init(this);
      this.settle();
      if (scn.start) scn.start(this);
      if (this.L.complication && !scn.tutorial && !scn.ga && !this.noAutoComplication) this.after(70 + Math.random() * 50, (en) => en.complicate(), 'complication');
    }

    // ---- consultant level: a second, unannounced problem arises mid-case ----
    complicate() {
      if (this.outcome) return;
      const p = this.p, scn = this.scn;
      if (scn.complication && scn.complication(this) !== false) { this.mark('complication'); return; }
      const opts = [];
      if (Object.values(this.pools).some((pl) => pl.rate > 0) || this.fluidQ.length) opts.push('iv');
      if (p.ventilated && !p.arrested) opts.push('tube');
      if (!p.ventilated && !p.assisted && p.fio2 > 0.3 && !p.arrested && !this.flags.paralysed && p.gcs > 8) opts.push('o2');
      if (!opts.length) opts.push('iv');
      const k = opts[Math.floor(Math.random() * opts.length)];
      this.flags.compl = k; this.mark('complication');
      if (k === 'iv') { this.flags.ivDown = true; this.say('Pump alarm: OCCLUSION — the arm around the cannula is swollen. The cannula has tissued: nothing is reaching the patient.', 'bad'); }
      if (k === 'tube') { this.flags.tubeDisplaced = true; p.tubeOK = false; this.say('Patient moved for a line/pad change — capnography trace lost and the ventilator is alarming.', 'bad'); }
      if (k === 'o2') { this.flags.o2Off = p.fio2; p.fio2 = 0.21; p.lastFio2 = 0.21; this.say('Patient pulled their oxygen mask off in agitation; the tubing has disconnected from the wall.', 'bad'); }
    }

    // -------- helpers for scenarios --------
    did(id) { return !!this.done[id]; }
    count(id) { return (this.done[id] || []).length; }
    firstTime(id) { return this.done[id] ? this.done[id][0] : null; }
    E(id) { return this.pools[id] ? this.pools[id].E : 0; }
    total(id) { return this.pools[id] ? this.pools[id].total : 0; }
    rate(id) { return this.pools[id] ? this.pools[id].rate : 0; }
    after(sec, fn, key) {
      if (key && this.timers.some((t) => t.key === key)) return;
      this.timers.push({ at: this.t + sec, fn, key });
    }
    say(text, kind = 'info') { this.emit({ type: 'msg', text, kind }); }
    harm(text) {
      if (this.harms.includes(text)) return;
      this.harms.push(text); this.say('⚠ ' + text, 'bad');
      if (this.outcome) return;
      const rule = (S.HARM_FX || []).find(([re]) => re.test(text));
      if (rule) { const what = rule[1](this); if (what) { (this.harmFx = this.harmFx || []).push({ harm: text, fx: what }); this.say('↳ ' + what.charAt(0).toUpperCase() + what.slice(1) + '.', 'bad'); } }
    }
    temp(key, amount, sec) { this.temps = this.temps.filter((x) => x.key !== key); this.temps.push({ key, amount, until: this.t + sec }); }
    tempVal(key) { return this.temps.filter((x) => x.key === key && x.until > this.t).reduce((a, b) => a + b.amount, 0); }
    on(fn) { this.listeners.push(fn); }
    emit(ev) { ev.t = this.t; this.log.push(ev); this.listeners.forEach((f) => f(ev)); }
    mark(id) { (this.done[id] = this.done[id] || []).push(this.t); }
    pool(id) { return (this.pools[id] = this.pools[id] || { E: 0, depot: 0, rate: 0, total: 0, def: S.drugById[id] }); }

    // -------- interventions --------
    giveBolus(id, dose) {
      const d = S.drugById[id]; if (!d || !d.bolus || this.outcome) return;
      const pl = this.pool(id);
      const sc = this.p.paed && !/\/kg/.test(d.bolus.unit) ? 70 / this.p.weight : 1;
      const nonIV = /_im$|_neb$|_buccal$|^chlorpromazine$|^dexamethasone$|^prednisolone$/.test(id);
      if (this.flags.ivDown && !nonIV) { this.mark(id); this.emit({ type: 'drug', id, text: `${d.name} ${dose} ${d.bolus.unit} given — but the cannula has tissued`, kind: 'act' }); this.say('The drug went into the tissues — the cannula is not working.', 'bad'); return; }
      pl.depot += dose * d.bolus.E * sc; pl.total += dose;
      this.mark(id);
      this.emit({ type: 'drug', id, text: `${d.name} ${dose} ${d.bolus.unit} given`, kind: 'act' });
      this.react({ type: 'drug', id, dose });
    }
    setInfusion(id, rate) {
      const d = S.drugById[id]; if (!d || !d.inf || this.outcome) return;
      const pl = this.pool(id);
      const old = pl.rate; pl.rate = Math.max(0, rate);
      if (rate > 0) this.mark(id);
      this.emit({ type: 'inf', id, text: rate > 0 ? `${d.name} infusion ${old > 0 ? 'changed to' : 'started at'} ${rate} ${d.inf.unit}` : `${d.name} infusion stopped`, kind: 'act' });
      this.react({ type: 'inf', id, rate, old });
    }
    giveFluid(id) {
      const f = S.fluidById[id]; if (!f || this.outcome) return;
      const ml = f.perKg ? Math.round(f.perKg * this.p.weight) : f.ml;
      this.mark(id); this.mark('fluid_' + f.kind);
      if (f.kind === 'crystalloid') this.mark('fluid');
      this.fluidIn[f.kind] += ml;
      this.fluidQ.push({ kind: f.kind, left: ml, rate: f.kind === 'crystalloid' ? ml / 15 : ml / 12 });
      this.emit({ type: 'fluid', id, text: `${f.name}${f.perKg ? ' (' + ml + ' mL)' : ''} given`, kind: 'act' });
      this.react({ type: 'fluid', id, kind: f.kind, ml });
    }
    doAction(id, opts) {
      if (this.outcome) return;
      const a = S.actionById[id] || (this.scn.extraActions || []).find((x) => x.id === id) || { id, name: id };
      this.mark(id);
      this.emit({ type: 'action', id, text: a.name, kind: 'act' });
      if (id === 'resite_iv') { if (this.flags.ivDown) { this.flags.ivDown = false; this.say('New large-bore cannula sited (or IO). Infusions and fluids re-connected and running.', 'good'); } else this.say('Existing cannula flushes well — no need to re-site.'); return; }
      if (id === 'reposition_tube' && this.flags.tubeDisplaced) { this.flags.tubeDisplaced = false; this.p.tubeOK = true; this.say('Tube had slipped out to the cords — repositioned under direct vision, EtCO₂ trace back, tube re-secured.', 'good'); return; }
      if (this.flags.o2Off && ['o2_nc', 'o2_nrb', 'hfno', 'jaw_thrust_cpap', 'bvm'].includes(id)) this.flags.o2Off = 0;
      const r = this.react({ type: 'action', id, opts });
      if (!r || !r.handled) this.defaultAction(id, opts);
    }
    setVent(k, v) {
      const p = this.p; p[k] = v;
      if (k === 'fio2') p.lastFio2 = v;
      this.emit({ type: 'vent', text: `Ventilator: ${k === 'fio2' ? 'FiO₂ ' + v.toFixed(2) : k === 'peep' ? 'PEEP ' + v + ' cmH₂O' : 'RR ' + v + '/min'}`, kind: 'act' });
      this.mark('vent_' + k);
      this.react({ type: 'vent', key: k, value: v });
    }
    investigate(id) {
      this.mark('inv_' + id);
      this.emit({ type: 'inv', id, text: `Requested: ${id.toUpperCase()}`, kind: 'inv' });
      this.react({ type: 'inv', id });
    }
    react(ev) {
      let r = null;
      const preRhythm = this.p.rhythm;
      if (this.scn.onEvent) r = this.scn.onEvent(this, ev) || null;
      if (r && r.msg) this.say(r.msg, r.kind || 'info');
      if (r && r.harm) this.harm(r.harm);
      // generic harms
      if (ev.type === 'action' && ev.id === 'rsi_propofol' && this.p.map < 70 && !(r && r.noHarm)) this.harm('Propofol induction in a hypotensive/shocked patient — expect cardiovascular collapse');
      const p = this.p;
      if (ev.type === 'drug' && ev.id === 'adrenaline' && ev.dose >= 500 && !p.arrested && !(r && r.noHarm) && !this.scn.als) { this.harm('1 mg IV adrenaline given to a patient with a pulse'); this.after(6, (en) => { if (!en.outcome && en.p.contractEff < 1.6) { en.p.rhythm = en.scn.als ? 'vf' : 'vt'; en.p.fixedRate = 190; en.say('Ventricular tachycardia after the adrenaline bolus!', 'bad'); en.after(25, (e2) => { if (e2.p.rhythm === 'vt') { e2.p.rhythm = 'sinus'; e2.say('VT self-terminated.', 'warn'); } }); } }); }
      if (ev.type === 'drug' && (ev.id === 'labetalol' || ev.id === 'esmolol') && p.map < 65 && !(r && r.noHarm)) this.harm('β-blocker given to a hypotensive patient');
      if (ev.type === 'inf' && ev.id === 'gtn' && ev.rate > 0 && p.map < 65 && !(r && r.noHarm)) this.harm('Nitrate infusion in hypotension');
      if (ev.type === 'drug' && ev.id === 'adenosine' && preRhythm === 'sinus') this.harm('Adenosine given for sinus rhythm');
      return r;
    }

    defaultAction(id) {
      const p = this.p;
      const msg = (t, k) => this.say(t, k || 'info');
      switch (id) {
        case 'o2_nc': if (!p.ventilated) { p.fio2 = 0.32; p.lastFio2 = p.fio2; } msg('Nasal cannulae on at 4 L/min.'); break;
        case 'o2_nrb': if (!p.ventilated) { p.fio2 = 0.8; p.lastFio2 = p.fio2; } msg('Non-rebreathe mask on, 15 L/min.'); break;
        case 'hfno': if (!p.ventilated) { p.fio2 = 0.95; p.lastFio2 = p.fio2; this.flags.hfno = true; } msg('High-flow nasal oxygen running at 60 L/min, FiO₂ 1.0.'); break;
        case 'airway_manoeuvre': msg('Head tilt–chin lift / jaw thrust performed and adjunct inserted.'); break;
        case 'bvm':
          if (p.airwayPatent) { p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; this.flags.airway = this.flags.airway || 'bvm'; msg('Two-person BVM ventilation with good chest rise.', 'good'); }
          else msg('Unable to ventilate — no chest rise despite optimal technique.', 'bad');
          break;
        case 'sga':
          if (p.airwayPatent) { p.sga = true; p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; this.flags.airway = this.flags.airway || 'sga'; msg('i-gel inserted, ventilating with capnography trace.', 'good'); }
          else msg('SGA inserted but no capnography trace and no chest rise.', 'bad');
          break;
        case 'rsi_ketamine': case 'rsi_propofol': {
          if (p.ventilated) { msg('Patient is already intubated.'); break; }
          if (!p.airwayPatent && !this.flags.canIntubate) { msg('Grade 4 view — failed intubation. Declare failed intubation, oxygenate.', 'bad'); p.effort = 0; this.flags.paralysed = true; break; }
          p.ventilated = true; p.assisted = false; p.effort = 0; p.fio2 = 1; p.lastFio2 = 1; p.peep = 5; p.ventRR = 14;
          this.flags.paralysed = true; this.flags.airway = 'ett'; this.flags.induction = id;
          const prop = id === 'rsi_propofol';
          this.pool(prop ? '_propofol' : '_ketamine');
          const pl = this.pools[prop ? '_propofol' : '_ketamine'];
          pl.def = prop
            ? { eff: { svr: [-0.5, 0.3], ven: [-0.45, 0.3], contract: [-0.35, 0.3] }, half: 150, onset: 5, catechol: false }
            : { eff: { svr: [0.08, 0.3], hr: [8, 0.3], contract: [-0.08, 0.3], ven: [-0.1, 0.3] }, half: 200, onset: 5, catechol: false };
          pl.depot += 1;
          this.anaesSuppress = prop ? 0.7 : 0.35;
          msg(`${prop ? 'Propofol' : 'Ketamine'} + rocuronium given. Grade 1 view, tube passed, capnography confirmed. Ventilated FiO₂ 1.0, PEEP 5.`, 'good');
          break;
        }
        case 'fona':
          p.ventilated = true; p.airwayPatent = true; p.effort = 0; p.fio2 = 1; p.lastFio2 = 1; p.assisted = false; this.flags.airway = 'fona';
          msg('Scalpel–bougie–tube cricothyroidotomy performed. Cuffed 6.0 tube, capnography confirms placement.', 'good');
          break;
        case 'vent_disconnect':
          if (!p.ventilated) { msg('Patient is not ventilated.'); break; }
          p.autoPEEP = 0; msg('Ventilator disconnected for 30 s with chest compression — prolonged expiration heard.'); break;
        case 'needle_decompression': case 'thoracostomy':
          msg('No rush of air. You may have created a pneumothorax — SpO₂ dipping.', 'bad'); this.harm('Chest decompression without evidence of tension pneumothorax'); p.shunt = Math.min(0.5, p.shunt + 0.08); if (p.ventilated) p.obstruct = Math.min(0.5, p.obstruct + 0.08); break;
        case 'chest_drain': msg('Chest drain inserted — no air, but fresh blood in the tubing (intercostal vessel injury).', 'bad'); this.harm('Unindicated chest drain'); p.bleed += 0.0002; this.after(60, (en) => { en.p.bleed = Math.max(0, en.p.bleed - 0.0002); }); break;
        case 'pericardiocentesis': msg('No pericardial fluid — the needle provoked runs of ventricular ectopics.', 'bad'); this.harm('Pericardiocentesis without effusion'); p.contract *= 0.92; break;
        case 'art_line': p.artLine = true; msg('Radial arterial line inserted — continuous invasive BP now displayed.'); break;
        case 'cvc': p.cvc = true; msg('Right IJ central line inserted under US — CVP now displayed.'); break;
        case 'plr': this.temp('plr', 0.12, 45); msg('Passive leg raise performed — watch the response over the next minute.'); break;
        case 'pelvic_binder': p.look.binder = true; msg('Pelvic binder applied at the level of the greater trochanters.'); break;
        case 'vagal': msg('Modified Valsalva — no change in rhythm.'); break;
        case 'sync_dc': msg('Synchronised shock delivered — rhythm unchanged.'); if (p.rhythm === 'sinus') { this.harm('DC cardioversion for sinus rhythm'); this.anaesSuppress = Math.max(this.anaesSuppress, 0.3); } break;
        case 'pacing':
          if (p.hr < 60 || p.rhythm === 'chb') { p.rhythm = 'paced'; msg('Pacing with electrical and mechanical capture at 70/min (check femoral pulse).', 'good'); }
          else msg('Intrinsic rate exceeds pacing rate — no capture needed.');
          break;
        case 'warming': this.flags.warmed = true; p.tempRate = Math.max(p.tempRate, 0.002); msg('Forced-air warming and fluid warmer in use.'); break;
        case 'call_help': msg('Help is on the way.'); break;
        case 'mhp': this.flags.mhp = true; msg('Major haemorrhage protocol activated. MHP pack 1 (red cells + FFP) on its way.'); break;
        case 'theatre': msg('The surgeon reviews: no surgical source of haemorrhage identified.'); break;
        case 'endoscopy': msg('The endoscopist does not feel endoscopy is indicated at present.'); break;
        case 'cath_lab': msg('The cardiology registrar does not think this is an acute coronary occlusion.'); break;
        case 'icu_referral': msg('ICU registrar aware and coming to review.'); break;
        case 'source_control': msg('No obvious surgical source identified.'); break;
        case 'stop_trigger': msg('Drug infusions and suspected triggers stopped.'); break;
        case 'stop_surgery': msg('Surgeon pauses.'); break;
        case 'stop_insufflation': msg('Pneumoperitoneum released.'); break;
        case 'stop_volatile': msg('Volatile off, TIVA started, fresh gas flow maximal.'); break;
        case 'stop_la': msg('LA injection stopped.'); break;
        case 'active_cooling': p.tempRate = Math.min(p.tempRate, -0.004); msg('Active cooling started.'); break;
        case 'uterine_displacement': msg('Left uterine displacement applied.'); break;
        case 'bimanual': msg('Bimanual compression performed.'); break;
        case 'deepen_anaesthesia': msg('Anaesthesia deepened.'); break;
        case 'jaw_thrust_cpap': msg('Jaw thrust and CPAP with 100% oxygen via a tight-fitting facemask.'); if (!p.ventilated) { p.fio2 = 1; p.lastFio2 = 1; } break;
        case 'suction_tube': msg('Suction catheter passes freely — tube patent, minimal secretions.'); break;
        case 'isolate_equipment': msg('Hand-ventilating with a self-inflating bag directly on the tube: no change — the problem is not the machine or circuit.'); break;
        case 'reposition_tube': msg('Tube position checked — already at the correct depth.'); break;
        case 'replace_filter': msg('HME filter and catheter mount replaced — no change.'); break;
        case 'ngt': msg('Nasogastric tube passed; stomach decompressed.'); break;
        case 'pads_ap': msg(p.arrested ? 'Pads moved to antero-posterior position (left parasternal + left infrascapular).' : 'Pads repositioned antero-posteriorly.'); this.flags.padsAP = true; break;
        case 'cpr':
          if (!p.arrested && !this.flags.cpr && !(p.paed && p.hr < 60 && p.map < p.mapNormal * 0.8)) { msg('There is a palpable pulse — compressions are not indicated.', 'warn'); this.harm('Chest compressions on a patient with a pulse'); break; }
          if (!p.arrested && !this.flags.cpr) msg('HR < 60/min with poor perfusion in a child — treat as cardiac arrest: start compressions (RCUK PLS).', 'warn');
          this.flags.cpr = !this.flags.cpr; if (this.flags.cpr) this.mark('cpr_on');
          msg(this.flags.cpr ? (p.paed ? 'High-quality CPR started (15:2), compressions 100–120/min, one-third chest depth.' : 'High-quality CPR started: 100–120/min, 5–6 cm depth, minimal interruptions.') : 'Compressions paused.', this.flags.cpr ? 'good' : 'warn');
          break;
        case 'defib':
          if (this.shockable()) { this.shocks = (this.shocks || 0) + 1; const n = this.shocks; const en = p.paed ? (n >= 5 ? `escalated towards 8 J/kg ≈ ${Math.min(360, Math.round(8 * p.weight))} J` : `4 J/kg ≈ ${Math.round(4 * p.weight)} J`) : n === 1 ? '150–200 J biphasic' : '150–360 J biphasic'; msg(`Shock ${n} delivered (${en}). Resume CPR immediately for 2 minutes.${!p.paed && n === 3 && !this.did('pads_ap') ? ' If VF persists, consider changing to antero-posterior pads.' : ''}`, 'good'); }
          else if (p.arrested) { msg('Non-shockable rhythm — shock not indicated.', 'bad'); this.harm('Defibrillation of a non-shockable rhythm'); }
          else { msg('Unsynchronised shock delivered to a patient with a pulse — it has induced VF!', 'bad'); this.harm('Unsynchronised shock to a patient with a pulse'); p.rhythm = 'vf'; }
          break;
        case 'rhythm_check':
          if (p.arrested) msg(`Rhythm check: ${({ vf: 'ventricular fibrillation — SHOCKABLE', vt: 'pulseless VT — SHOCKABLE', pea: 'organised rhythm, no pulse (PEA) — non-shockable', asystole: 'asystole — non-shockable' })[p.rhythm] || p.rhythm}.`, 'warn');
          else msg(`Pulse present. Rhythm: ${p.rhythm === 'sinus' ? 'sinus' : p.rhythm}, HR ${p.hr}.`);
          break;
        default: msg('Done.');
      }
    }

    // -------- simulation --------
    effects() {
      const fx = { svr: 0, contract: 0, hr: 0, ven: 0, bronch: 0, vagal: 0, mast: 0 };
      const p = this.p;
      const acid = p.ph < 7.2 ? clamp(1 - (7.2 - p.ph) * 2.5, 0.3, 1) : 1;
      const cr = p.catecholResp * acid;
      for (const id in this.pools) {
        const pl = this.pools[id], d = pl.def; if (!d || pl.E < 1e-5) continue;
        for (const ch in d.eff) {
          const [emax, ec50] = d.eff[ch];
          let v = (emax * pl.E) / (pl.E + ec50);
          if (d.catechol && v > 0 && ch !== 'bronch' && ch !== 'mast') v *= cr;
          fx[ch] += v;
        }
      }
      fx.vagal *= p.atropineResp;
      fx.bronch = clamp(fx.bronch, -0.6, 0.95);
      return fx;
    }

    stepPools(dt) {
      for (const id in this.pools) {
        const pl = this.pools[id], d = pl.def; if (!d) continue;
        const ka = 1 / (d.onset || 5), ke = Math.LN2 / (d.half || 60);
        const absorbed = pl.depot * (1 - Math.exp(-ka * dt));
        pl.depot -= absorbed;
        const inf = d.inf && !this.flags.ivDown ? pl.rate * d.inf.E * (this.p.paed && !/\/kg/.test(d.inf.unit) ? 70 / this.p.weight : 1) : 0;
        pl.E += absorbed + (inf - pl.E) * (1 - Math.exp(-ke * dt));
        if (pl.E < 0) pl.E = 0;
      }
    }

    settle() { for (let i = 0; i < 300; i++) this.haemo(0.1, true); }

    haemo(dt, settling) {
      const p = this.p;
      const fx = (this.fx = this.effects());
      // Sympathetic compensation (baroreflex), blunted by anaesthesia / sympathectomy
      const symT = p.baro * (1 - this.anaesSuppress) * clamp((p.mapNormal - p.map) / (p.mapNormal * 0.39), 0, 1);
      const kCO = 5.6 / p.coRef;
      p.sym += (symT - p.sym) * Math.min(1, dt / 4);
      const acid = p.ph < 7.15 ? clamp(1 - (7.15 - p.ph) * 1.5, 0.5, 1) : 1;

      const venTone = clamp(1 - p.venodil + fx.ven + 0.22 * p.sym, 0.3, 1.8);
      let preload = p.vol * venTone + this.tempVal('plr');
      if (p.ventilated) preload *= clamp(1 - 0.012 * p.peep - 0.035 * p.autoPEEP, 0.3, 1);
      if (p.pregnant && !this.did('uterine_displacement') && p.supine !== false) preload *= p.cavalComp || 1;
      p.preload = preload;
      const fill = preload * (1 - p.obstruct);
      const s = starling(fill);
      const contractEff = clamp(p.contract * Math.max(0.2, 1 + fx.contract) * acid * (1 + 0.15 * p.sym), 0.05, 2.5);
      p.contractEff = contractEff;

      // Heart rate
      let hr;
      const tempHR = (p.temp - 37) * 6;
      const sinusHR = p.hrBase + p.hrGain * p.sym + fx.hr + fx.vagal + tempHR + 40 * p.stress;
      if (p.rhythm === 'paced') hr = p.paceRate;
      else if (p.rhythm === 'chb') hr = p.fixedRate + 0.35 * Math.max(0, fx.hr) + 0.1 * fx.vagal;
      else if (p.rhythm === 'svt' || p.rhythm === 'vt') hr = p.fixedRate;
      else if (p.rhythm === 'af') hr = p.fixedRate ? p.fixedRate + 0.3 * fx.hr : sinusHR * 1.1;
      else if (ARREST_RHYTHMS.includes(p.rhythm)) hr = p.rhythm === 'pea' ? (p.peaRate || 40) : 0;
      else hr = sinusHR;
      if (['sinus', 'pea', 'junctional'].includes(p.rhythm) || p.rhythm === 'chb') hr *= p.chrono == null ? 1 : p.chrono; // SA/AV-node depression (e.g. LA toxicity)
      hr = clamp(hr, 0, p.paed ? 300 : 220);
      p.hrTrue = hr;
      p.memStab = clamp(this.E('calcium') * 1.6, 0, 0.85); // IV calcium stabilises the myocardial membrane (ECG)

      const hf0 = p.paed ? p.hrBase + 70 : 110, hfL = p.paed ? hf0 * 0.55 : 60;
      const hrFill = hr > hf0 ? clamp(1 - (hr - hf0) / (hf0 * 1.3), 0.35, 1) : hr < hfL ? 1 + Math.min(0.3, (hfL - hr) / 80) : 1;
      const svrRel = p.vasoplegia * (1 + 0.4 * p.sym) * Math.max(0.25, 1 + fx.svr) * (1 + 0.45 * p.stress);
      const afterload = 1 / (1 + (Math.max(0, svrRel - 1) * 0.35) / Math.min(1, contractEff));
      let sv = 78 * s * Math.pow(contractEff, 0.75) * hrFill * afterload * p.svScale;
      if (p.rhythm === 'af') sv *= 0.85;
      if (p.rhythm === 'vt') sv *= 0.6;
      if (ARREST_RHYTHMS.includes(p.rhythm)) sv = 0;
      const co = (hr * sv) / 1000;
      const cvp = clamp(1 + 6 * preload + p.obstruct * 16 + Math.max(0, 1 - contractEff) * 6 + (p.ventilated ? p.peep * 0.4 : 0) + p.autoPEEP * 0.6 + (p.cvpExtra || 0), 0, 30);
      let map = (co * svrRel * 1100 * p.svrScale) / 80 + 0.3 * cvp;
      let pp = clamp((sv / p.svScale) * 0.6 * Math.pow(1 / svrRel, 0.25), 5, 90);
      let coOut = co;
      if (p.arrested) {
        const cpr = this.flags.cpr;
        coOut = cpr ? 0.25 * p.coRef : 0;
        map = cpr ? p.mapNormal * 0.36 : 4;
        pp = cpr ? 30 : 0;
      }
      // smooth MAP slightly for stability
      p.map = settling ? map : p.map + (map - p.map) * Math.min(1, dt / 1.5);
      p.sv = sv; p.co = coOut; p.svr = svrRel * 1100 * p.svrScale; p.cvp = cvp; p.pp = pp; p.hr = Math.round(hr);
      p.sbp = p.map + (2 * pp) / 3; p.dbp = p.map - pp / 3;
      if (p.map < 8) { p.sbp = p.map; p.dbp = p.map; }

      // ---- Ventilation & oxygenation ----
      const bronchEff = clamp(p.bronchospasm * (1 - fx.bronch * (1 - (p.bronchRefractory || 0))), 0, 1); // bronchRefractory: share of bronchospasm that drugs cannot relieve
      p.bronchEff = bronchEff;
      const acidDrive = clamp((24 - p.hco3) / 14, 0, 1);
      let V;
      if (p.ventilated) {
        V = (p.ventRR / 14) * (1 - 0.6 * bronchEff) * (p.tubeOK === false ? 0 : 1) * (1 - (p.ventObstruct || 0));
        const autoT = bronchEff * Math.max(0, p.ventRR - 8) * 1.1;
        p.autoPEEP += (autoT - p.autoPEEP) * Math.min(1, dt / 25);
      } else {
        const consciousOK = p.arrested ? 0 : p.effort;
        V = consciousOK * (p.airwayPatent ? 1 : 0) * (1 - 0.2 * bronchEff) * (1 + 0.8 * acidDrive);
        if (p.assisted) V = Math.max(V, p.airwayPatent ? 0.9 * (1 - 0.5 * bronchEff) : 0);
        p.autoPEEP = 0;
      }
      p.V = V;
      const paco2T = clamp((40 * p.vco2) / Math.max(V, 0.05), 18, 150);
      p.paco2 += (paco2T - p.paco2) * Math.min(1, dt / (V < 0.1 ? 40 : 12));
      const fio2 = p.fio2;
      if (V >= 0.15) {
        const target = Math.max(0, fio2 * 713 - p.paco2 / 0.8);
        p.PAO2 += (target - p.PAO2) * Math.min(1, dt / 5);
      } else {
        const tau = p.lastFio2 > 0.8 ? 110 : 40;
        p.PAO2 += (25 - p.PAO2) * Math.min(1, dt / tau);
      }
      const recruit = p.ventilated ? 1 - p.peepRecruit * Math.min(p.peep, 15) / 15 * 0.7 : this.flags.hfno ? 0.9 : 1;
      const sh = clamp(p.shunt * recruit + p.pulmOedema * 0.4 + bronchEff * 0.25, 0, 0.75);
      const sc = sev(Math.max(0, p.PAO2 - 5));
      const sv_ = clamp(1 - (0.25 * p.vo2) / Math.max(0.2, (p.co * kCO) / 5.6) / (p.hb / 140), 0.08, 0.85);
      const sa = clamp((1 - sh) * sc + sh * sv_, 0, 1);
      p.sa = settling ? sa : p.sa + (sa - p.sa) * Math.min(1, dt / 3);
      p.svo2 = sv_;
      p.spo2 = Math.round(p.sa * 100);
      p.pao2 = invSev(p.sa);
      const coN = p.co * kCO;
      const ds = clamp(p.deadspace + (coN < 4 ? (4 - coN) * 0.12 : 0) + bronchEff * 0.2, 0, 0.98);
      p.etco2 = V < 0.05 || coN < 0.3 ? (coN < 0.3 && V >= 0.05 ? 1 : 0) : p.paco2 * (1 - ds);
      if (p.ventilated) p.rr = p.ventRR;
      else if (p.assisted) p.rr = 12;
      else p.rr = Math.round(p.effort > 0 ? clamp(p.rrBase * (1 + 0.9 * acidDrive) + (p.sa < 0.9 ? (0.9 - p.sa) * 60 : 0) + bronchEff * 10 + p.sym * 6, 4, 45) * Math.min(1, p.effort * 1.5) : 0);
      p.paw = p.ventilated ? 16 + bronchEff * 28 + p.autoPEEP + p.peep + (p.pawExtra || 0) + 30 * (p.ventObstruct || 0) * (p.ventStopped ? 0 : 1) : 0;

      // ---- Acid–base ----
      p.hco3 = clamp(24 - (p.lactate - 1) - p.extraAcid + p.bicarb, 3, 40);
      p.ph = 6.1 + Math.log10(p.hco3 / (0.0307 * p.paco2));
      p.be = 0.93 * (p.hco3 - 24.4 + 14.8 * (p.ph - 7.4));
    }

    tick(dt) {
      if (this.outcome) return;
      const p = this.p;
      this.t += dt;
      this.stepPools(dt);
      // timers
      const due = this.timers.filter((x) => x.at <= this.t);
      this.timers = this.timers.filter((x) => x.at > this.t);
      due.forEach((x) => x.fn(this));
      this.temps = this.temps.filter((x) => x.until > this.t);
      this.anaesSuppress *= Math.exp(-dt / 150);
      // fluids
      for (const f of this.fluidQ) {
        if (this.flags.ivDown) break;
        const ml = Math.min(f.left, f.rate * dt); f.left -= ml;
        const bv = p.weight * 70, litre = p.weight * 13.3; // circulating volume; 'adult-litre equivalent'
        const dv = (ml / bv) * (f.kind === 'cryo' ? 0.5 : 1);
        p.vol += dv * (f.kind === 'crystalloid' ? 0.85 : 1);
        if (f.kind === 'rbc') p.hbMass += dv * 225;
        if (f.kind === 'ffp' || f.kind === 'cryo') p.coag = Math.max(0, p.coag - ml / litre);
        if (p.pulmOedema < 1 && p.contractEff < 0.75) p.pulmOedema += (ml / litre) * p.oedemaProne * (1 - p.contractEff) * 0.9;
        if (p.leak > 0) p.pulmOedema += (ml / litre) * 0.04 * p.leak * 10;
      }
      this.fluidQ = this.fluidQ.filter((f) => f.left > 0.1);
      // losses
      const bleed = this.L.prog * p.bleed * (1 + 0.6 * p.coag) * (p.map > 30 ? clamp(p.map / 70, 0.3, 1.3) : 0.2);
      p.vol -= bleed * dt;
      p.hbMass -= bleed * dt * p.hb; // lose whole blood at current Hb
      if (p.leak > 0 && p.vol > 0.55) p.vol -= this.L.prog * p.leak * (p.vol - 0.55) * dt;
      p.vol = clamp(p.vol, 0.15, 1.6);
      p.hb = clamp(p.hbMass / p.vol, 20, 200);
      // pulmonary oedema dynamics
      if (p.preload > 1.1 && p.contractEff < 0.7) p.pulmOedema += 0.0015 * dt * (p.preload - 1.0) * (1 - p.contractEff) * p.oedemaProne * 2;
      else if (p.preload < 1.0 || p.contractEff > 0.8) p.pulmOedema -= 0.0015 * dt;
      p.pulmOedema = clamp(p.pulmOedema, 0, 1);
      // temperature
      p.temp += p.tempRate * dt;
      // scenario dynamics
      if (this.scn.tick) this.scn.tick(this, dt * this.L.prog);
      if (this.outcome) return;
      this.haemo(dt, false);
      // lactate
      const do2 = p.co * 1.34 * p.hb * p.sa;
      p.do2 = do2;
      const need = 680 * p.vo2 * (p.coRef / 5.6);
      if (do2 < need) p.lactate += ((need - do2) / need) * 0.09 * dt;
      else if (do2 > need * 1.25) p.lactate -= (p.lactate - 1) * 0.003 * dt;
      if (p.map < p.mapNormal * 0.67 && !p.arrested) p.lactate += 0.01 * dt;
      if (p.arrested) p.lactate += 0.02 * dt;
      p.lactate = clamp(p.lactate + this.L.prog * p.lacGen * dt, 0.5, 25);

      // ---- outcome checks ----
      const arrestRhythm = ARREST_RHYTHMS.includes(p.rhythm) || (p.rhythm === 'vt' && p.pulseless);
      if (this.scn.als && this.alsTick(dt, arrestRhythm)) return;
      this.lowMapTime = p.map < p.mapArrest ? this.lowMapTime + dt : Math.max(0, this.lowMapTime - dt * 0.5);
      this.lowSatTime = p.sa < (this.scn.satArrest || 0.62) ? this.lowSatTime + dt : Math.max(0, this.lowSatTime - dt * 0.5);
      if (arrestRhythm || this.lowMapTime > 20 * this.L.tol || this.lowSatTime > 25 * this.L.tol || p.temp > 42.5) {
        if (!arrestRhythm) p.rhythm = p.sa < 0.62 ? 'asystole' : 'pea';
        this.outcome = 'arrest';
        this.haemo(0.1, true);
        this.emit({ type: 'end', outcome: 'arrest', text: 'Cardiac arrest — the patient has lost cardiac output.', kind: 'bad' });
        return;
      }
      if (this.critStatus().every((c) => c.done) && this.targetsMet() && !this.flags.ivDown && !this.flags.tubeDisplaced && !this.flags.o2Off) this.stableTime += dt;
      else this.stableTime = Math.max(0, this.stableTime - dt * 2);
      this.maxStable = Math.max(this.maxStable || 0, this.stableTime);
      if (this.stableTime >= this.needStable()) {
        this.outcome = 'win';
        this.emit({ type: 'end', outcome: 'win', text: 'Patient stabilised — scenario complete.', kind: 'good' });
      }
    }

    // ---- Advanced life support: arrest does not end the scenario; CPR/defib/drugs and treating the cause can achieve ROSC ----
    alsTick(dt, arrestRhythm) {
      const p = this.p, scn = this.scn;
      this.lowMapTime = p.map < p.mapArrest && !p.arrested ? this.lowMapTime + dt : Math.max(0, this.lowMapTime - dt * 0.5);
      this.lowSatTime = p.sa < (scn.satArrest || 0.62) && !p.arrested ? this.lowSatTime + dt : Math.max(0, this.lowSatTime - dt * 0.5);
      if (!p.arrested && (arrestRhythm || this.lowMapTime > 20 * this.L.tol || this.lowSatTime > 25 * this.L.tol)) {
        p.arrested = true; this.arrestT = 0; this.noCprT = 0; this.flags.cpr = false;
        if (!arrestRhythm) p.rhythm = scn.arrestRhythm ? scn.arrestRhythm(this) : p.sa < 0.62 ? 'asystole' : 'pea';
        this.mark('arrest');
        this.emit({ type: 'msg', text: scn.arrestMsg || 'CARDIAC ARREST — no pulse. Start CPR, call for help and follow the ALS algorithm.', kind: 'bad' });
      }
      if (p.arrested) {
        this.arrestT += dt;
        if (!this.flags.cpr) this.noCprT += dt;
        if (scn.rosc && scn.rosc(this)) {
          p.arrested = false; p.pulseless = false; p.rhythm = scn.roscRhythm || 'sinus'; this.flags.cpr = false;
          this.lowMapTime = 0; this.lowSatTime = 0; this.mark('rosc');
          for (const id in this.pools) { const pl = this.pools[id]; if (pl.def && pl.def.catechol && !pl.rate) { pl.E *= id === 'adrenaline' ? 0.08 : 0.3; pl.depot = 0; } }
          this.emit({ type: 'msg', text: 'ROSC — palpable pulse and rising EtCO₂. Stop compressions; start post-resuscitation care.', kind: 'good' });
        } else if (this.arrestT > (scn.arrestLimit || 300) || this.noCprT > (scn.noCprLimit || 30)) {
          this.outcome = 'arrest';
          this.emit({ type: 'end', outcome: 'arrest', text: this.noCprT > (scn.noCprLimit || 30) ? 'Resuscitation failed — prolonged interruption of chest compressions.' : 'Resuscitation unsuccessful.', kind: 'bad' });
          return true;
        }
        this.stableTime = 0;
        return true;
      }
      return false;
    }
    // Consultant grade: the player decides when the patient is ready to hand over.
    // Succeeds only if every critical action is done, the (hidden) targets are met now and have held for ≥ 5 s.
    declareStable() {
      if (this.outcome) return null;
      const reasons = [];
      if (!this.critStatus().every((c) => c.done)) reasons.push('essential management is still outstanding');
      if (!this.targetsMet()) reasons.push('the physiology is not yet at a safe target');
      else if (this.stableTime < 5) reasons.push('the improvement has not been sustained yet');
      if (this.flags.ivDown || this.flags.tubeDisplaced || this.flags.o2Off) reasons.push('there is an unresolved equipment problem');
      this.mark('declare_stable');
      if (!reasons.length) {
        this.outcome = 'win'; this.flags.declared = true;
        this.emit({ type: 'end', outcome: 'win', text: 'Declared stable and handed over — the receiving team agrees the patient is stable.', kind: 'good' });
        return true;
      }
      this.declareFails = (this.declareFails || 0) + 1;
      this.say(`Receiving team: "I'm not happy to take this patient yet — ${reasons.join('; ')}."`, 'warn');
      this.harm(`Declared the patient stable prematurely (${this.declareFails === 1 ? '1st' : this.declareFails === 2 ? '2nd' : this.declareFails + 'th'} time)`);
      return false;
    }
    needStable() { const b = this.scn.stableFor || 20; return this.scn.tutorial ? b : Math.round(b * this.L.stable / 20); }
    shockable() { return ['vf', 'vt'].includes(this.p.rhythm) && this.p.arrested; }

    critStatus() {
      return (this.scn.critical || []).filter((c) => !c.skip || !c.skip(this)).map((c) => ({ text: c.text, done: !!c.check(this), id: c.id }));
    }
    targetStatus() {
      const p = this.p, tg = Object.assign({ map: p.paed ? Math.round(p.mapNormal * 0.85) : 65, spo2: 94 }, this.scn.targets || {});
      const out = [];
      if (p.arrested) out.push({ k: 'Return of circulation', ok: false });
      if (tg.map != null) out.push({ k: `MAP ≥ ${tg.map}`, ok: p.map >= tg.map });
      if (tg.spo2Max != null) out.push({ k: `SpO₂ ≤ ${tg.spo2Max}%`, ok: p.spo2 <= tg.spo2Max });
      if (tg.etco2Min != null) out.push({ k: `EtCO₂ ≥ ${tg.etco2Min} kPa`, ok: p.etco2 / 7.5 >= tg.etco2Min });
      if (tg.gluMin != null) out.push({ k: `Glucose ≥ ${tg.gluMin}`, ok: p.glucose >= tg.gluMin });
      if (tg.mapMax != null) out.push({ k: `MAP ≤ ${tg.mapMax}`, ok: p.map <= tg.mapMax });
      if (tg.spo2 != null) out.push({ k: `SpO₂ ≥ ${tg.spo2}%`, ok: p.spo2 >= tg.spo2 });
      if (tg.hrMax != null) out.push({ k: `HR ≤ ${tg.hrMax}`, ok: p.hr <= tg.hrMax });
      if (tg.hrMin != null) out.push({ k: `HR ≥ ${tg.hrMin}`, ok: p.hr >= tg.hrMin });
      if (tg.tempMax != null) out.push({ k: `Temp ≤ ${tg.tempMax}°C`, ok: p.temp <= tg.tempMax });
      if (tg.etco2Max != null) out.push({ k: `EtCO₂ ≤ ${tg.etco2Max} kPa`, ok: p.etco2 / 7.5 <= tg.etco2Max });
      if (tg.kMin != null) out.push({ k: `K⁺ ≥ ${tg.kMin}`, ok: p.k >= tg.kMin });
      if (tg.phMin != null) out.push({ k: `pH ≥ ${tg.phMin}`, ok: p.ph >= tg.phMin });
      if (tg.kMax != null) out.push({ k: `K⁺ ≤ ${tg.kMax}`, ok: p.k <= tg.kMax });
      return out;
    }
    targetsMet() { return this.targetStatus().every((x) => x.ok); }

    // Blood gas snapshot (UK units: kPa)
    gas() {
      const p = this.p;
      const kShift = (7.4 - p.ph) * 3 * 0.3;
      return {
        ph: p.ph, pco2: p.paco2 / 7.5, po2: p.pao2 / 7.5, hco3: p.hco3, be: p.be, lactate: p.lactate,
        k: p.k + kShift, na: p.na, glucose: p.glucose, hb: p.hb, sao2: p.sa * 100, fio2: p.ventilated || p.assisted ? p.fio2 : p.fio2,
        cl: p.cl || 104, ica: p.ica || 1.15,
      };
    }
  }
  S.Engine = Engine;
})();
