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
    ecg: { st: 0, tPeak: 1, qrsW: 1, p: 1 },
    look: {},
    // state
    sym: 0, map: 80, PAO2: 100, paco2: 40, sa: 0.98, ph: 7.4, hco3: 24,
  };

  class Engine {
    constructor(scn) {
      this.scn = scn;
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
    harm(text) { if (!this.harms.includes(text)) { this.harms.push(text); this.say('⚠ ' + text, 'bad'); } }
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
      pl.depot += dose * d.bolus.E; pl.total += dose;
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
      this.mark(id); this.mark('fluid_' + f.kind);
      if (f.kind === 'crystalloid') this.mark('fluid');
      this.fluidIn[f.kind] += f.ml;
      this.fluidQ.push({ kind: f.kind, left: f.ml, rate: f.kind === 'crystalloid' ? f.ml / 15 : f.ml / 12 });
      this.emit({ type: 'fluid', id, text: `${f.name} given`, kind: 'act' });
      this.react({ type: 'fluid', id, kind: f.kind, ml: f.ml });
    }
    doAction(id, opts) {
      if (this.outcome) return;
      const a = S.actionById[id] || { id, name: id };
      this.mark(id);
      this.emit({ type: 'action', id, text: a.name, kind: 'act' });
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
      if (this.scn.onEvent) r = this.scn.onEvent(this, ev) || null;
      if (r && r.msg) this.say(r.msg, r.kind || 'info');
      if (r && r.harm) this.harm(r.harm);
      // generic harms
      if (ev.type === 'action' && ev.id === 'rsi_propofol' && this.p.map < 70 && !(r && r.noHarm)) this.harm('Propofol induction in a hypotensive/shocked patient — expect cardiovascular collapse');
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
          if (p.airwayPatent) { p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; msg('Two-person BVM ventilation with good chest rise.', 'good'); }
          else msg('Unable to ventilate — no chest rise despite optimal technique.', 'bad');
          break;
        case 'sga':
          if (p.airwayPatent) { p.sga = true; p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; msg('i-gel inserted, ventilating with capnography trace.', 'good'); }
          else msg('SGA inserted but no capnography trace and no chest rise.', 'bad');
          break;
        case 'rsi_ketamine': case 'rsi_propofol': {
          if (p.ventilated) { msg('Patient is already intubated.'); break; }
          if (!p.airwayPatent && !this.flags.canIntubate) { msg('Grade 4 view — failed intubation. Declare failed intubation, oxygenate.', 'bad'); p.effort = 0; this.flags.paralysed = true; break; }
          p.ventilated = true; p.assisted = false; p.effort = 0; p.fio2 = 1; p.lastFio2 = 1; p.peep = 5; p.ventRR = 14;
          this.flags.paralysed = true;
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
          p.ventilated = true; p.airwayPatent = true; p.effort = 0; p.fio2 = 1; p.lastFio2 = 1; p.assisted = false;
          msg('Scalpel–bougie–tube cricothyroidotomy performed. Cuffed 6.0 tube, capnography confirms placement.', 'good');
          break;
        case 'vent_disconnect':
          if (!p.ventilated) { msg('Patient is not ventilated.'); break; }
          p.autoPEEP = 0; msg('Ventilator disconnected for 30 s with chest compression — prolonged expiration heard.'); break;
        case 'needle_decompression': case 'thoracostomy':
          msg('No rush of air. No change in observations.'); this.harm('Chest decompression without evidence of tension pneumothorax'); break;
        case 'chest_drain': msg('Chest drain inserted — minimal output, no bubbling.'); this.harm('Unindicated chest drain'); break;
        case 'pericardiocentesis': msg('No significant pericardial fluid aspirated.'); this.harm('Pericardiocentesis without effusion'); break;
        case 'art_line': p.artLine = true; msg('Radial arterial line inserted — continuous invasive BP now displayed.'); break;
        case 'cvc': p.cvc = true; msg('Right IJ central line inserted under US — CVP now displayed.'); break;
        case 'plr': this.temp('plr', 0.12, 45); msg('Passive leg raise performed — watch the response over the next minute.'); break;
        case 'pelvic_binder': p.look.binder = true; msg('Pelvic binder applied at the level of the greater trochanters.'); break;
        case 'vagal': msg('Modified Valsalva — no change in rhythm.'); break;
        case 'sync_dc': msg('Synchronised shock delivered — rhythm unchanged.'); if (p.rhythm === 'sinus') this.harm('DC cardioversion for sinus rhythm'); break;
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
        const inf = d.inf ? pl.rate * d.inf.E : 0;
        pl.E += absorbed + (inf - pl.E) * (1 - Math.exp(-ke * dt));
        if (pl.E < 0) pl.E = 0;
      }
    }

    settle() { for (let i = 0; i < 300; i++) this.haemo(0.1, true); }

    haemo(dt, settling) {
      const p = this.p;
      const fx = (this.fx = this.effects());
      // Sympathetic compensation (baroreflex), blunted by anaesthesia / sympathectomy
      const symT = p.baro * (1 - this.anaesSuppress) * clamp((82 - p.map) / 32, 0, 1);
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
      const sinusHR = p.hrBase + 65 * p.sym + fx.hr + fx.vagal + tempHR;
      if (p.rhythm === 'paced') hr = p.paceRate;
      else if (p.rhythm === 'chb') hr = p.fixedRate + 0.35 * Math.max(0, fx.hr) + 0.1 * fx.vagal;
      else if (p.rhythm === 'svt' || p.rhythm === 'vt') hr = p.fixedRate;
      else if (p.rhythm === 'af') hr = p.fixedRate ? p.fixedRate + 0.3 * fx.hr : sinusHR * 1.1;
      else if (ARREST_RHYTHMS.includes(p.rhythm)) hr = p.rhythm === 'pea' ? 40 : 0;
      else hr = sinusHR;
      hr = clamp(hr, 0, 220);
      p.hrTrue = hr;

      const hrFill = hr > 110 ? clamp(1 - (hr - 110) / 140, 0.35, 1) : hr < 60 ? 1 + Math.min(0.3, (60 - hr) / 80) : 1;
      const svrRel = p.vasoplegia * (1 + 0.4 * p.sym) * Math.max(0.25, 1 + fx.svr);
      const afterload = 1 / (1 + (Math.max(0, svrRel - 1) * 0.35) / Math.min(1, contractEff));
      let sv = 78 * s * Math.pow(contractEff, 0.75) * hrFill * afterload;
      if (p.rhythm === 'af') sv *= 0.85;
      if (p.rhythm === 'vt') sv *= 0.6;
      if (ARREST_RHYTHMS.includes(p.rhythm)) sv = 0;
      const co = (hr * sv) / 1000;
      const cvp = clamp(1 + 6 * preload + p.obstruct * 16 + Math.max(0, 1 - contractEff) * 6 + (p.ventilated ? p.peep * 0.4 : 0) + p.autoPEEP * 0.6 + (p.cvpExtra || 0), 0, 30);
      let map = (co * svrRel * 1100) / 80 + 0.3 * cvp;
      const pp = clamp(sv * 0.6 * Math.pow(1 / svrRel, 0.25), 5, 90);
      // smooth MAP slightly for stability
      p.map = settling ? map : p.map + (map - p.map) * Math.min(1, dt / 1.5);
      p.sv = sv; p.co = co; p.svr = svrRel * 1100; p.cvp = cvp; p.pp = pp; p.hr = Math.round(hr);
      p.sbp = p.map + (2 * pp) / 3; p.dbp = p.map - pp / 3;
      if (p.map < 8) { p.sbp = p.map; p.dbp = p.map; }

      // ---- Ventilation & oxygenation ----
      const bronchEff = clamp(p.bronchospasm * (1 - fx.bronch), 0, 1);
      p.bronchEff = bronchEff;
      const acidDrive = clamp((24 - p.hco3) / 14, 0, 1);
      let V;
      if (p.ventilated) {
        V = (p.ventRR / 14) * (1 - 0.6 * bronchEff) * (p.tubeOK === false ? 0 : 1);
        const autoT = bronchEff * Math.max(0, p.ventRR - 8) * 1.1;
        p.autoPEEP += (autoT - p.autoPEEP) * Math.min(1, dt / 25);
      } else {
        const consciousOK = p.effort;
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
      const sv_ = clamp(1 - (0.25 * p.vo2) / Math.max(0.2, co / 5.6) / (p.hb / 140), 0.08, 0.85);
      const sa = clamp((1 - sh) * sc + sh * sv_, 0, 1);
      p.sa = settling ? sa : p.sa + (sa - p.sa) * Math.min(1, dt / 3);
      p.svo2 = sv_;
      p.spo2 = Math.round(p.sa * 100);
      p.pao2 = invSev(p.sa);
      const ds = clamp(p.deadspace + (co < 4 ? (4 - co) * 0.12 : 0) + bronchEff * 0.2, 0, 0.98);
      p.etco2 = V < 0.05 || co < 0.3 ? (co < 0.3 ? 1 : 0) : p.paco2 * (1 - ds);
      if (p.ventilated) p.rr = p.ventRR;
      else if (p.assisted) p.rr = 12;
      else p.rr = Math.round(p.effort > 0 ? clamp(p.rrBase * (1 + 0.9 * acidDrive) + (p.sa < 0.9 ? (0.9 - p.sa) * 60 : 0) + bronchEff * 10 + p.sym * 6, 4, 45) * Math.min(1, p.effort * 1.5) : 0);
      p.paw = p.ventilated ? 16 + bronchEff * 28 + p.autoPEEP + p.peep + (p.pawExtra || 0) : 0;

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
        const ml = Math.min(f.left, f.rate * dt); f.left -= ml;
        const dv = (ml / 5000) * (f.kind === 'cryo' ? 0.5 : 1);
        p.vol += dv * (f.kind === 'crystalloid' ? 0.85 : 1);
        if (f.kind === 'rbc') p.hbMass += (ml / 280) * 0.06 * 200;
        if (f.kind === 'ffp' || f.kind === 'cryo') p.coag = Math.max(0, p.coag - ml / 1000);
        if (p.pulmOedema < 1 && p.contractEff < 0.75) p.pulmOedema += (ml / 1000) * p.oedemaProne * (1 - p.contractEff) * 0.9;
        if (p.leak > 0) p.pulmOedema += (ml / 1000) * 0.04 * p.leak * 10;
      }
      this.fluidQ = this.fluidQ.filter((f) => f.left > 0.1);
      // losses
      const bleed = p.bleed * (1 + 0.6 * p.coag) * (p.map > 30 ? clamp(p.map / 70, 0.3, 1.3) : 0.2);
      p.vol -= bleed * dt;
      p.hbMass -= bleed * dt * p.hb; // lose whole blood at current Hb
      if (p.leak > 0 && p.vol > 0.55) p.vol -= p.leak * (p.vol - 0.55) * dt;
      p.vol = clamp(p.vol, 0.15, 1.6);
      p.hb = clamp(p.hbMass / p.vol, 20, 200);
      // pulmonary oedema dynamics
      if (p.preload > 1.1 && p.contractEff < 0.7) p.pulmOedema += 0.0015 * dt * (p.preload - 1.0) * (1 - p.contractEff) * p.oedemaProne * 2;
      else if (p.preload < 1.0 || p.contractEff > 0.8) p.pulmOedema -= 0.0015 * dt;
      p.pulmOedema = clamp(p.pulmOedema, 0, 1);
      // temperature
      p.temp += p.tempRate * dt;
      // scenario dynamics
      if (this.scn.tick) this.scn.tick(this, dt);
      this.haemo(dt, false);
      // lactate
      const do2 = p.co * 1.34 * p.hb * p.sa;
      p.do2 = do2;
      const need = 680 * p.vo2;
      if (do2 < need) p.lactate += ((need - do2) / need) * 0.09 * dt;
      else if (do2 > need * 1.25) p.lactate -= (p.lactate - 1) * 0.003 * dt;
      if (p.map < 55) p.lactate += 0.01 * dt;
      p.lactate = clamp(p.lactate + p.lacGen * dt, 0.5, 25);

      // ---- outcome checks ----
      const arrestRhythm = ARREST_RHYTHMS.includes(p.rhythm);
      this.lowMapTime = p.map < 38 ? this.lowMapTime + dt : Math.max(0, this.lowMapTime - dt * 0.5);
      this.lowSatTime = p.sa < 0.62 ? this.lowSatTime + dt : Math.max(0, this.lowSatTime - dt * 0.5);
      if (arrestRhythm || this.lowMapTime > 20 || this.lowSatTime > 25 || p.temp > 42.5) {
        if (!arrestRhythm) p.rhythm = p.sa < 0.62 ? 'asystole' : 'pea';
        this.outcome = 'arrest';
        this.haemo(0.1, true);
        this.emit({ type: 'end', outcome: 'arrest', text: 'Cardiac arrest — the patient has lost cardiac output.', kind: 'bad' });
        return;
      }
      if (this.critStatus().every((c) => c.done) && this.targetsMet()) this.stableTime += dt;
      else this.stableTime = Math.max(0, this.stableTime - dt * 2);
      if (this.stableTime >= (this.scn.stableFor || 20)) {
        this.outcome = 'win';
        this.emit({ type: 'end', outcome: 'win', text: 'Patient stabilised — scenario complete.', kind: 'good' });
      }
    }

    critStatus() {
      return (this.scn.critical || []).map((c) => ({ text: c.text, done: !!c.check(this), id: c.id }));
    }
    targetStatus() {
      const p = this.p, tg = Object.assign({ map: 65, spo2: 94 }, this.scn.targets || {});
      const out = [];
      if (tg.map != null) out.push({ k: `MAP ≥ ${tg.map}`, ok: p.map >= tg.map });
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
