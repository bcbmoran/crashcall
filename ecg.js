/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* CrashCall ECG engine — a vector (dipole) model of cardiac electrical activity.
 *
 * Each wave (P, septal/main/basal QRS forces, terminal forces, ST injury current, T, U, J) is a
 * time-profile multiplied by a 3-D direction (x = patient's left, y = inferior, z = anterior).
 * A lead is the projection of that vector onto the lead axis, so every lead — the monitor's lead II
 * and all twelve leads of the printed ECG — is generated from the same heart. Intervals are in real
 * seconds (PR, QRS, QT/QTc via Bazett) and are driven by the simulated physiology.
 *
 * ECG criteria follow the LITFL ECG Library (litfl.com): hyperkalaemia, hypokalaemia, hypo/hyper-
 * calcaemia, hypothermia (Osborn waves), sodium-channel blocker toxicity (broad QRS, terminal R in aVR),
 * digoxin effect/toxicity, PE (RV strain, S1Q3T3), pericardial effusion (low voltage, alternans),
 * raised ICP, β-blocker/CCB toxicity (PR prolongation, AV block).
 */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const g = (x, mu, w) => Math.exp(-((x - mu) * (x - mu)) / (2 * w * w));
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const fr = (deg, z = 0) => { const a = (deg * Math.PI) / 180; return norm([Math.cos(a), Math.sin(a), z]); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, k) => norm([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
  const TAU = 2 * Math.PI;

  // ---- Lead axes (frontal hexaxial + precordial in the horizontal plane; precordial gain = proximity) ----
  const hz = (deg, gain) => { const a = (deg * Math.PI) / 180; return [Math.cos(a) * gain, 0, Math.sin(a) * gain]; };
  const LEADS = {
    I: [1, 0, 0], II: fr(60), III: fr(120), aVR: fr(-150), aVL: fr(-30), aVF: fr(90),
    V1: hz(118, 1.35), V2: hz(96, 1.9), V3: hz(76, 1.8), V4: hz(56, 1.6), V5: hz(32, 1.3), V6: hz(8, 1.05),
  };
  S.ECG_LEADS = LEADS;

  // ---- Fixed vectors ----
  const SEPT = norm([-0.45, 0.15, 0.85]);        // septal activation: left→right, anterior (q in I/V6, r in V1)
  const BASAL = norm([-0.25, -0.55, -0.5]);      // late basal forces (small s in II, V6)
  const NAV = norm([-0.82, -0.42, 0.2]);         // Na-channel block: terminal rightward/superior (R' aVR, S in I/aVL)
  const RBBBV = norm([-0.55, 0.05, 0.85]);       // RBBB: late rightward/anterior (RSR' V1, slurred S I/V6)
  const JV = norm([0.65, 0.65, 0.12]);           // Osborn wave (negative in aVR and V1)
  const PRA = norm([0.25, 0.8, 0.55]);           // right-atrial half of P (anterior)
  const PLA = norm([0.8, 0.45, -0.45]);          // left-atrial half of P (posterior) → biphasic P in V1
  const AFV = norm([0.1, 0.35, 0.9]);            // fibrillatory waves: best seen in V1
  const FLV = norm([0.05, 0.95, -0.3]);          // flutter: negative sawtooth in II, III, aVF
  const DIGV = norm([0.6, 0.7, 0.35]);           // digoxin "reverse tick" (lateral/inferior)
  const TV_N = fr(42, 0.32);                     // normal T axis (concordant with QRS)
  const TV_RV = norm([0.6, -0.25, -0.75]);       // RV strain: TWI V1–V4, III, aVF
  const TV_JUV = norm([0.72, 0.62, -0.3]);       // juvenile T pattern: TWI V1–V3
  const TV_LVH = norm([-0.55, 0.25, 0.55]);      // LV strain: TWI I, aVL, V5–V6
  const ST_DEP = norm([0.55, 0.75, 0.2]);        // diffuse subendocardial ischaemia (ST↓ widespread, ST↑ aVR)
  const ST_INF = norm([0.05, 0.95, 0.25]);       // inferior injury current
  // ventricular-origin complexes: two sequential forces (A then B), T discordant
  const VT_V = [norm([-0.3, -0.75, 0.6]), norm([0.25, -0.6, 0.5])];       // scar VT: RBBB-like, superior axis
  const PVC_V = [norm([0.3, 0.85, -0.45]), norm([0.5, 0.7, -0.5])];       // RVOT ectopic: LBBB-like, inferior axis
  const PACE_V = [norm([0.3, -0.7, -0.6]), norm([0.6, -0.6, -0.55])];     // RV apical pacing: LBBB-like, superior axis
  const ESC_V = [norm([0.5, 0.35, -0.75]), norm([0.7, 0.15, -0.65])];     // ventricular escape

  const stScale = (dir) => 1 / Math.max(0.2, dot(dir, LEADS.II)); // ST values are specified as lead-II millivolts

  // ===================================================================================================
  // Morphology from physiology
  // ===================================================================================================
  function ecgMorph(p) {
    const e = p.ecg || {};
    const paed = !!p.paed, age = p.age == null ? 40 : p.age;
    const M = {
      pr: paed ? (age < 1 ? 0.10 : age < 8 ? 0.12 : 0.14) : 0.16,
      qrs: paed ? (age < 1 ? 0.06 : age < 8 ? 0.07 : 0.08) : 0.09,
      qtc: paed ? 0.40 : 0.41,
      axis: paed ? (age < 0.1 ? 120 : age < 1 ? 80 : age < 8 ? 65 : 60) : 50,
      pAmp: 1, pW: 1, tAmp: 1, tSharp: 0, u: 0, j: 0, st: 0, stDem: 0, dig: 0, nb: 0, amp: 1, alt: false, sine: 0,
      rbbb: 0, rv: 0, lvh: !!e.lvh, oldQ: !!e.oldQ, s1q3t3: !!e.s1q3t3, juv: paed && age > 0.05 && age < 12, cerebral: 0,
      escape: e.escape || null, atrial: e.atrial || null, bidir: !!e.bidir, avb: e.avb || null, poly: !!e.poly,
      shiver: 0, ectopy: 0,
    };
    const f = [];
    // --- explicit scenario overrides / legacy fields ---
    if (e.pr) M.pr = e.pr;
    if (e.qrs) M.qrs = e.qrs;
    if (e.qrsW > 1) M.qrs = Math.max(M.qrs, 0.09 * e.qrsW);
    if (e.qtc) M.qtc = e.qtc;
    if (e.qt) M.qtc = Math.max(M.qtc, 0.41 * (1 + (e.qt - 1) * 0.55));
    if (e.tPeak != null) M.tAmp *= e.tPeak;
    if (e.p != null) M.pAmp *= e.p;
    if (e.st) M.st += e.st;
    if (e.u) M.u += e.u;
    if (e.j) M.j += e.j;
    if (e.amp) M.amp *= e.amp;
    if (e.dig) M.dig = e.dig;
    if (e.rbbb) M.rbbb = e.rbbb === true ? 1 : e.rbbb;
    if (e.axis != null) M.axis = e.axis;
    if (e.lowVolt) M.amp *= 0.45;

    // --- Potassium (LITFL: peaked T >5.5; P flattening, PR↑, QRS widening ≥6–6.5; brady/escape; sine wave ≥9) ---
    const k = p.k || 4.2;
    const ms = clamp(p.memStab || 0, 0, 0.9);     // IV calcium: membrane stabilisation (narrows QRS, restores P)
    if (k >= 5.5) {
      const x = k - 5.5;
      M.tAmp *= 1 + Math.min(2.0, x * 1.0); M.tSharp = clamp(x / 1.2, 0, 1);
      f.push('tall, narrow-based peaked T waves');
    }
    if (k >= 6.0) {
      const x = (k - 6.0) * (1 - ms);
      M.pAmp *= clamp(1 - x * 0.55, 0, 1); M.pW *= 1 + Math.min(0.6, x * 0.35); M.pr += Math.min(0.08, x * 0.035);
      if (x > 0.2) f.push(M.pAmp < 0.2 ? 'P waves absent' : 'flattened, widened P waves with PR prolongation');
    }
    if (k >= 6.5) {
      const x = (k - 6.5) * (1 - ms);
      M.qrs += Math.min(0.16, x * 0.055); M.axis -= Math.min(45, x * 18);
      if (x > 0.3) f.push('broad, bizarre QRS (intraventricular conduction delay)');
    }
    if (k >= 8.7) { M.sine = clamp(((k - 8.7) / 0.8) * (1 - ms), 0, 1); if (M.sine > 0.3) f.push('QRS merging with T — sine-wave pattern (pre-arrest)'); }
    if (k < 3.5) {
      const x = 3.5 - k;
      M.tAmp *= Math.max(0.12, 1 - x * 0.75); M.u += Math.min(1.6, x * 1.1);
      if (k < 3.0) M.stDem -= Math.min(0.08, (3.0 - k) * 0.12);
      if (k < 2.8) { M.pAmp *= 1 + (2.8 - k) * 0.7; M.pr += 0.02; }
      f.push(k < 3.0 ? 'flattened T waves, ST depression, prominent U waves (apparent long QT = QU)' : 'reduced T-wave amplitude, small U waves');
    }
    // --- Calcium (hypocalcaemia: QTc↑ by ST lengthening, T unchanged; hypercalcaemia: short QT, Osborn waves) ---
    const ica = p.ica || 1.15;
    if (ica < 1.05) { M.qtc += Math.min(0.2, (1.1 - ica) * 0.55); f.push('QTc prolonged by a long, flat ST segment (hypocalcaemia)'); }
    if (ica > 1.4) { M.qtc -= Math.min(0.1, (ica - 1.35) * 0.25); if (ica > 1.9) M.j += 0.12; f.push('short QT (hypercalcaemia)'); }
    // --- Sodium-channel blockade (LA toxicity, TCA, propranolol, flecainide…) ---
    const nb = clamp((p.naBlock || 0) + (e.naBlock || 0), 0, 1.5);
    if (nb > 0) {
      M.nb = nb; M.qrs += 0.13 * nb; M.pr += 0.06 * nb; M.qtc += 0.05 * nb;
      if (nb > 0.15) f.push('terminal R wave in aVR with deep slurred S in I and aVL (terminal rightward axis) — sodium-channel blockade');
      if (nb > 0.55) f.push('QRS > 160 ms — high risk of VT/VF');
    }
    // --- Temperature (LITFL: Osborn wave height ∝ hypothermia; PR/QRS/QT prolongation; shivering artefact) ---
    const T = p.temp == null ? 37 : p.temp;
    if (T < 35) {
      const x = 35 - T;
      M.pr += Math.min(0.1, x * 0.012); M.qrs += Math.min(0.05, x * 0.004); M.qtc += Math.min(0.14, x * 0.016);
      if (T < 33.5) { M.j += clamp((33.5 - T) * 0.075, 0, 0.55); f.push('Osborn (J) waves'); }
      f.push('prolonged PR, QRS and QT (hypothermia)');
    }
    if (T < 35.6 && T > 30.5) M.shiver = clamp((35.6 - T) / 2, 0, 1) * clamp((T - 30.5) / 1.5, 0, 1);
    // --- Ischaemia: supply/demand (tachycardia + hypotension, or hypoxaemia) ---
    const hrHi = paed ? (p.hrBase || 110) + 75 : 130;
    const dem = clamp(((p.hr || 80) - hrHi) / 50, 0, 1) * clamp((65 - (p.map || 80) / (paed ? (p.mapNormal || 76) / 76 : 1)) / 20, 0, 1) + clamp((0.82 - (p.sa || 0.98)) * 3, 0, 1)
      + (p.rhythm === 'svt' ? clamp(((p.hr || 0) - 160) / 80, 0, 0.6) : 0);
    if (dem > 0.12 && !(e.st > 0.05)) { M.stDem -= 0.13 * Math.min(1, dem); f.push(p.rhythm === 'svt' ? 'rate-related ST depression' : 'widespread ST depression with ST elevation in aVR (demand ischaemia)'); }
    if (e.st > 0.05) f.push('ST elevation');
    // --- Digoxin effect ---
    if (M.dig > 0) { M.qtc -= 0.04 * M.dig; M.tAmp *= 1 - 0.55 * M.dig; f.push('"reverse tick" sagging ST depression, short QT (digoxin effect)'); }
    // --- Pericardial fluid / tamponade: low voltage ± electrical alternans ---
    if ((p.pulsus || 0) > 0.15) { M.amp *= clamp(1 - p.pulsus * 1.3, 0.35, 0.7); M.alt = p.pulsus > 0.25; f.push(M.alt ? 'low-voltage QRS with electrical alternans' : 'low-voltage QRS complexes'); }
    // --- RV pressure load (PE): RV strain T waves, incomplete RBBB, right axis ---
    else if ((p.obstruct || 0) > 0.28 && p.rvLoad) { // PE / gas embolism (not tension pneumothorax)
      M.rv = clamp((p.obstruct - 0.28) * 2.2, 0, 1);
      if (M.rv > 0.35) { M.rbbb = Math.max(M.rbbb, 0.5 * M.rv); M.axis += 35 * M.rv; }
      f.push('T-wave inversion V1–V4 and III (RV strain)');
      if (M.rbbb > 0.25) f.push('incomplete RBBB, rightward axis');
    }
    // --- Raised ICP: cerebral T waves, QT prolongation (bradycardia is in the engine: Cushing) ---
    if ((p.icp || 0) > 28) { M.cerebral = clamp((p.icp - 28) / 15, 0, 1); M.qtc += 0.06 * M.cerebral; if (M.cerebral > 0.3) f.push('widespread deep T-wave inversion with long QT ("cerebral T waves")'); }
    if (M.s1q3t3) f.push('S1Q3T3');
    if (M.lvh) f.push('LVH by voltage with lateral strain pattern');
    if (M.oldQ) f.push('pathological Q waves V1–V3 (old anterior infarct)');
    if (M.rbbb > 0.6 && !f.some((x) => /RBBB/.test(x))) f.push('RBBB');
    if (M.juv) f.push('T-wave inversion V1–V3 (normal juvenile pattern)');
    // --- Ectopy ---
    M.ectopy = clamp((k - 6.5) * 0.04, 0, 0.06) + clamp((0.82 - (p.sa || 0.98)) * 0.8, 0, 0.25) + (dem > 0.5 ? 0.06 : 0)
      + (k < 3.0 ? (3.0 - k) * 0.12 : 0) + (M.dig > 0.5 ? 0.12 : 0) + (e.ectopy || 0);
    M.qtc = clamp(M.qtc, 0.3, 0.75);
    M.qrs = clamp(M.qrs, 0.05, 0.3);
    M.pr = clamp(M.pr, 0.08, 0.42);
    // T-wave direction
    let tv = TV_N;
    if (M.juv) tv = TV_JUV;
    if (M.lvh) tv = mix(tv, TV_LVH, 0.75);
    if (M.rv) tv = mix(tv, TV_RV, M.rv);
    if (M.cerebral) { tv = [-tv[0], -tv[1], -tv[2]]; M.tAmp *= 1 + 1.6 * M.cerebral; }
    M.tv = tv;
    M.findings = f;
    return M;
  }
  S.ecgMorph = ecgMorph;

  // ===================================================================================================
  // Rhythm generator: schedules atrial and ventricular events (shared by the monitor and the 12-lead)
  // ===================================================================================================
  class RhythmGen {
    constructor(seed) { this.s = seed || 1 + Math.floor(Math.random() * 2147483000); this.v = []; this.a = []; this.tNext = 0.25; this.aNext = 0.2; this.wk = 0; this.n = 0; }
    rnd() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }
    advance(T, p, M, keep) {
      while (this.tNext <= T) this.beat(p, M);
      if (p.rhythm === 'chb' && M.atrial !== 'af') {
        while (this.aNext <= T) { this.a.push({ t: this.aNext, M }); this.aNext += 60 / (p.atrialRate || 78); }
      } else this.aNext = Math.max(this.aNext, T);
      if (keep) return;
      while (this.v.length && this.v[0].q < T - 4) this.v.shift();
      while (this.a.length && this.a[0].t < T - 4) this.a.shift();
    }
    push(type, q, M, rr, extra) { const b = Object.assign({ q, type, M, rr, n: this.n++ }, extra || {}); this.v.push(b); return b; }
    beat(p, M) {
      const r = p.rhythm, t = this.tNext, hr = p.hrTrue || 0;
      const rr = hr > 5 ? 60 / hr : 99;
      if (r === 'vf' || r === 'asystole' || hr <= 5) { this.tNext = t + 0.25; return; }
      if (r === 'vt') { this.push(M.poly || M.qtc > 0.48 ? 'tdp' : 'vt', t, M, rr); this.tNext = t + rr; return; }
      if (r === 'paced') { this.push('paced', t, M, rr); this.tNext = t + rr; return; }
      if (r === 'svt' || r === 'junctional') { this.push('n', t, M, rr); this.tNext = t + rr; return; }
      if (r === 'chb') {
        const junc = M.escape === 'junctional' || (!M.escape && hr >= 40);
        this.push(junc ? 'n' : 'esc', t, M, rr); this.tNext = t + rr; return;
      }
      if (r === 'af' || r === 'flutter') {
        const k = r === 'af' ? 0.6 + this.rnd() * 0.8 : 1;
        this.push('n', t, M, rr * k);
        if (this.rnd() < M.ectopy * 0.6) { this.push('pvc', t + rr * k * 0.62, M, rr * 0.62); this.tNext = t + rr * k * 1.7; return; }
        this.tNext = t + rr * k; return;
      }
      // sinus-driven rhythms (sinus, PEA)
      if (M.avb === 'wenck') { // 4:3 Wenckebach
        const pp = rr * 0.75, i = this.wk++ % 4;
        if (i < 3) this.push('n', t + M.pr + [0, 0.1, 0.15][i], M, rr, { pAt: t }); else this.a.push({ t, M });
        this.tNext = t + pp; return;
      }
      if (M.avb === '2to1') { const pp = rr / 2; if (this.wk++ % 2 === 0) this.push('n', t + M.pr, M, rr, { pAt: t }); else this.a.push({ t, M }); this.tNext = t + pp; return; }
      this.push('n', t + M.pr, M, rr, { pAt: t });
      if (r === 'sinus' && this.rnd() < M.ectopy) {
        // PVC with full compensatory pause; the next sinus P falls on the PVC's T wave (not conducted)
        this.push('pvc', t + M.pr + rr * 0.6, M, rr * 0.6); this.a.push({ t: t + rr, M }); this.tNext = t + 2 * rr; return;
      }
      this.tNext = t + rr;
    }
  }
  S.RhythmGen = RhythmGen;

  // ===================================================================================================
  // Waveform synthesis
  // ===================================================================================================
  function asymT(tau, tEnd, sl, sr) { const pk = tEnd - 2.4 * sr; return tau < pk ? g(tau, pk, sl) : g(tau, pk, sr); }
  function qtOf(M, rr) { return clamp(M.qtc * Math.sqrt(clamp(rr, 0.3, 2.0)), 0.2, 0.78); }

  function pwave(L, x, M) {
    if (x < -0.005 || x > 0.2) return 0;
    const w = M.pW, a = 0.11 * M.pAmp;
    return a * (dot(PRA, L) * g(x, 0.035 * w, 0.017 * w) + dot(PLA, L) * g(x, 0.066 * w, 0.019 * w));
  }

  // normally conducted (supraventricular) complex — tau from QRS onset
  function normalComplex(L, tau, b, o) {
    const M = b.M, dq = M.qrs, d = dq + 0.045 * M.rbbb;
    const main = fr(M.axis, M.lvh ? -0.62 : -0.38);
    let q = 0;
    if (M.oldQ) q += 0.45 * dot([0.15, 0.1, -0.95], L) * g(tau, 0.18 * dq, 0.08 * dq);
    else q += 0.22 * dot(M.s1q3t3 ? norm([0.1, -0.9, 0.3]) : SEPT, L) * g(tau, 0.13 * dq, 0.065 * dq);
    const br = clamp((dq - 0.1) / 0.1, 0, 1); // slowed conduction: slurred, lower-amplitude main force
    q += (M.lvh ? 1.95 : 1.25) * (1 - 0.35 * br) * dot(main, L) * g(tau, 0.42 * dq, (0.13 + 0.07 * br) * dq);
    q += 0.32 * dot(BASAL, L) * g(tau, 0.78 * dq, 0.09 * dq);
    if (M.nb) q += 0.8 * Math.min(1.2, M.nb) * dot(NAV, L) * g(tau, 0.8 * dq, 0.12 * dq);
    if (M.rbbb) q += 0.6 * M.rbbb * dot(RBBBV, L) * g(tau, dq + 0.012, 0.019);
    if (M.s1q3t3) q += 0.45 * dot(norm([-0.85, 0.3, 0.1]), L) * g(tau, 0.82 * dq, 0.09 * dq);
    if (M.alt && b.n % 2) q *= 0.6;
    let v = q;
    if (M.j) v += M.j * dot(JV, L) * g(tau, d + 0.01, 0.016);
    // ST segment + T + U
    const QT = qtOf(M, b.rr), sr = 0.042 + 0.004 * M.tSharp, sl = 0.066 - 0.02 * M.tSharp; // peaked T: tall, symmetrical, narrow-based
    const tPk = QT - 2.4 * sr;
    const win = smooth(tau, d, d + 0.02) * (1 - smooth(tau, tPk - 0.03, QT));
    let st = M.stDem * dot(ST_DEP, L) * stScale(ST_DEP);
    if (o && o.st != null) st += o.st; else if (M.st) st += M.st * dot(M.st > 0 ? ST_INF : ST_DEP, L) * stScale(M.st > 0 ? ST_INF : ST_DEP);
    v += st * win;
    if (M.dig) {
      const s = clamp((tau - d) / Math.max(0.05, QT - d), 0, 1);
      const sag = s < 0.78 ? Math.pow(s / 0.78, 0.55) : 1 - (s - 0.78) / 0.22;
      v -= 0.17 * M.dig * dot(DIGV, L) * sag * (s > 0 && s < 1 ? 1 : 0);
    }
    const tsign = o && o.tinv ? -1 : 1;
    v += tsign * 0.4 * M.tAmp * dot(M.tv, L) * asymT(tau, QT, sl, sr) * (M.alt && b.n % 2 ? 0.85 : 1);
    if (M.u) v += 0.17 * M.u * dot(TV_N, L) * g(tau, QT + 0.075, 0.034);
    if (M.sine) { const s = M.sine, x = clamp(tau / b.rr, 0, 1); v = (1 - s) * v + s * 1.05 * dot(main, L) * Math.sin(TAU * x) * (tau >= 0 && tau < b.rr ? 1 : 0); }
    return v * M.amp;
  }

  // ventricular-origin complex (VT, torsades, PVC, paced, ventricular escape)
  function ventComplex(L, tau, b, t) {
    const M = b.M;
    let V = b.type === 'vt' ? VT_V : b.type === 'paced' ? PACE_V : b.type === 'esc' ? ESC_V : PVC_V;
    let d = b.type === 'vt' ? 0.16 : 0.15, amp = 1;
    if (b.type === 'tdp') { // QRS axis twisting around the baseline
      const th = (TAU * b.q) / 2.5;
      V = [norm([Math.cos(th), Math.sin(th), 0.35]), norm([Math.cos(th + 0.5), Math.sin(th + 0.5), 0.3])];
      d = 0.13; amp = 0.4 + 0.75 * Math.abs(Math.sin((Math.PI * b.q) / 2.5));
    }
    if (b.type === 'vt' && M.bidir && b.n % 2) V = V.map((x) => [x[0] * -0.4, -x[1], x[2]]);
    d = Math.max(d, M.qrs + 0.05);
    let v = 1.15 * dot(V[0], L) * g(tau, 0.3 * d, 0.17 * d) + 0.85 * dot(V[1], L) * g(tau, 0.66 * d, 0.17 * d);
    if (b.type !== 'tdp') {
      const td = norm([-(V[0][0] + V[1][0]), -(V[0][1] + V[1][1]), -(V[0][2] + V[1][2])]);
      const QT = clamp(0.36 * Math.sqrt(clamp(b.rr, 0.3, 2)) + 0.07, 0.27, 0.62);
      v += 0.45 * dot(td, L) * asymT(tau, QT, 0.07, 0.05);
    }
    if (b.type === 'paced' && tau > -0.006 && tau < -0.003) v += 1.6;
    if (M.sine) v *= 1 - 0.3 * M.sine;
    return v * amp * M.amp;
  }

  function fwave(t) { return (Math.sin(TAU * 5.7 * t) + 0.7 * Math.sin(TAU * 7.9 * t + 1.3) + 0.5 * Math.sin(TAU * 9.6 * t + 0.4)) * (0.75 + 0.25 * Math.sin(TAU * 0.4 * t)); }
  function saw(t) { const f = (t * 5) % 1; return f < 0.8 ? 0.5 - f / 0.8 : -0.5 + (f - 0.8) / 0.2; }
  function vfVec(t) {
    return [
      0.55 * Math.sin(TAU * 4.3 * t) + 0.3 * Math.sin(TAU * 6.1 * t + 1.1) + 0.2 * Math.sin(TAU * 2.9 * t + 2),
      0.5 * Math.sin(TAU * 5.1 * t + 0.6) + 0.35 * Math.sin(TAU * 3.7 * t + 2.4) + 0.2 * Math.sin(TAU * 7.3 * t),
      0.45 * Math.sin(TAU * 4.7 * t + 2.2) + 0.3 * Math.sin(TAU * 6.7 * t + 0.3),
    ];
  }

  // Value (mV) of lead L at time t.  o: { st (per-lead ST override, mV), tinv, fine (VF amplitude 0–1), M (current morph) }
  function leadValue(L, t, gen, p, o) {
    o = o || {};
    const r = p.rhythm;
    if (r === 'vf') { const amp = (0.25 + 0.55 * (o.fine == null ? 1 : o.fine)) * (0.65 + 0.35 * Math.sin(TAU * 0.33 * t)); return amp * dot(vfVec(t), L); }
    let v = 0;
    for (let i = gen.v.length - 1; i >= 0; i--) {
      const b = gen.v[i], tau = t - b.q;
      if (b.pAt != null) v += pwave(L, t - b.pAt, b.M);
      if (tau < -0.01) continue;
      if (tau > 1.1) break;
      v += b.type === 'n' ? normalComplex(L, tau, b, o) : ventComplex(L, tau, b, t);
    }
    for (let i = gen.a.length - 1; i >= 0; i--) { const x = t - gen.a[i].t; if (x > 0.25) break; v += pwave(L, x, gen.a[i].M); }
    const M = o.M || (gen.v.length ? gen.v[gen.v.length - 1].M : null);
    if (r === 'af' || (r === 'chb' && M && M.atrial === 'af')) v += 0.055 * dot(AFV, L) * fwave(t);
    if (r === 'flutter') v += 0.2 * dot(FLV, L) * saw(t);
    return v;
  }
  S.ecgLead = leadValue;

  // Artefact common to all leads: CPR, seizure/muscle tremor, shivering, baseline wander
  function artefact(t, p, flags, M) {
    let v = 0.012 * Math.sin(TAU * 0.23 * t) + 0.008 * Math.sin(TAU * 0.07 * t + 1);
    if (p.arrested && flags.cpr) v += 0.55 * Math.max(0, Math.sin(TAU * 1.85 * t)) - 0.17;
    const paralysed = flags.paralysed || p.paralysed;
    const hf = () => Math.sin(TAU * 41.3 * t) * 0.5 + Math.sin(TAU * 57.7 * t + 1) * 0.3 + Math.sin(TAU * 73.1 * t + 2) * 0.2 + Math.sin(TAU * 29.3 * t) * 0.3;
    if (flags.seizing && !paralysed) v += 0.13 * hf() * (0.6 + 0.4 * Math.sin(TAU * 2.1 * t)) + 0.06 * Math.sin(TAU * 3.3 * t);
    else if (M && M.shiver && !paralysed && !p.ventilated) v += 0.05 * M.shiver * hf();
    return v;
  }
  S.ecgArtefact = artefact;

  // ===================================================================================================
  // Measurements + report (what an experienced reader would say about THIS tracing)
  // ===================================================================================================
  function frontalAxis(M) {
    const dq = M.qrs, main = fr(M.axis, -0.38);
    const forces = [[0.22 * 0.065 * dq, M.s1q3t3 ? norm([0.1, -0.9, 0.3]) : SEPT], [1.25 * 0.13 * dq * (M.lvh ? 1.55 : 1), main], [0.32 * 0.09 * dq, BASAL]];
    if (M.nb) forces.push([0.8 * Math.min(1.2, M.nb) * 0.12 * dq, NAV]);
    if (M.rbbb) forces.push([0.6 * M.rbbb * 0.019, RBBBV]);
    if (M.s1q3t3) forces.push([0.45 * 0.09 * dq, norm([-0.85, 0.3, 0.1])]);
    let x = 0, y = 0;
    forces.forEach(([a, d]) => { x += a * d[0]; y += a * d[1]; });
    return Math.round((Math.atan2(y, x) * 180) / Math.PI);
  }

  function ecgReport(p, M, notes) {
    const r = p.rhythm, hr = Math.round(p.hrTrue || p.hr || 0);
    const out = [];
    const resp = (x) => (x < 60 ? 'slow' : x > 110 ? 'rapid' : 'controlled');
    let organised = true, conductedP = false;
    if (r === 'vf') { out.push('Ventricular fibrillation — chaotic irregular deflections, no identifiable QRS complexes.'); organised = false; }
    else if (r === 'asystole' || hr <= 5) { out.push('Asystole — no ventricular electrical activity.'); organised = false; }
    else if (r === 'vt') {
      if (M.poly || M.qtc > 0.48) { out.push(`Polymorphic VT ~${hr}/min with QRS axis twisting around the baseline — torsades de pointes.`); organised = false; }
      else if (M.bidir) out.push(`Bidirectional VT ~${hr}/min — beat-to-beat alternation of the QRS axis (classically digoxin toxicity).`);
      else out.push(`Regular monomorphic broad-complex tachycardia ~${hr}/min (QRS ~160 ms, RBBB-like morphology, superior axis) — VT until proven otherwise.`);
    } else if (r === 'paced') out.push(`Ventricular paced rhythm ${hr}/min — pacing spikes followed by broad LBBB-like QRS with discordant T waves.`);
    else if (r === 'svt') out.push(`Regular narrow-complex tachycardia ${hr}/min, no visible P waves.`);
    else if (r === 'junctional') out.push(`Junctional rhythm ${hr}/min — narrow QRS, no preceding P waves.`);
    else if (r === 'af') out.push(`Atrial fibrillation with ${resp(hr)} ventricular response (~${hr}/min) — irregularly irregular, no P waves, fibrillatory baseline.`);
    else if (r === 'flutter') out.push(`Atrial flutter — sawtooth flutter waves ~300/min (negative in II, III, aVF) with ${Math.max(1, Math.round(300 / Math.max(hr, 30)))}:1 block, ventricular rate ${hr}/min.`);
    else if (r === 'chb') {
      const junc = M.escape === 'junctional' || (!M.escape && hr >= 40);
      if (M.atrial === 'af') out.push(`Atrial fibrillation with complete heart block — regular ${junc ? 'narrow junctional' : 'broad ventricular'} escape rhythm ~${hr}/min ("regularised AF").`);
      else out.push(`Complete (third-degree) heart block — P waves ~${p.atrialRate || 78}/min marching through, dissociated from a regular ${junc ? 'narrow-complex junctional' : 'broad-complex ventricular'} escape rhythm ~${hr}/min.`);
    } else {
      const noP = M.pAmp < 0.2;
      conductedP = !noP;
      const base = noP ? `Slow regular rhythm ~${hr}/min with no visible P waves${M.qrs > 0.12 ? ' and broad QRS' : ''}`
        : hr < 60 ? `Sinus bradycardia ${hr}/min` : hr > 100 ? `Sinus tachycardia ${hr}/min` : `Sinus rhythm ${hr}/min`;
      if (M.avb === 'wenck') out.push(`${base}: second-degree AV block, Mobitz I (Wenckebach) — progressive PR prolongation then a dropped QRS.`);
      else if (M.avb === '2to1') out.push(`${base}: 2:1 AV block (every other P wave not conducted).`);
      else out.push(base + (M.ectopy > 0.08 ? ' with frequent ventricular ectopics.' : '.'));
      if (r === 'pea') out.push('NB: organised electrical activity — if there is no palpable pulse this is PEA.');
    }
    if (organised && r !== 'vt' && r !== 'paced') {
      const vEsc = r === 'chb' && !(M.escape === 'junctional' || (!M.escape && hr >= 40));
      const d = vEsc ? Math.max(0.15, M.qrs + 0.05) : M.qrs + 0.045 * M.rbbb, rr = hr > 5 ? 60 / hr : 1, qt = vEsc ? clamp(0.36 * Math.sqrt(clamp(rr, 0.3, 2)) + 0.07, 0.27, 0.62) : qtOf(M, rr);
      const parts = [];
      if (conductedP && M.avb !== 'wenck') parts.push(`PR ${Math.round(M.pr * 1000)} ms${M.pr > 0.205 ? ' (first-degree AV block)' : ''}`);
      parts.push(`QRS ${Math.round(d * 1000)} ms${d > 0.12 ? ' (broad)' : d > 0.105 ? ' (intraventricular conduction delay)' : ''}`);
      if (!M.sine && !vEsc) parts.push(`QT ${Math.round(qt * 1000)} ms, QTc ${Math.round(M.qtc * 1000)} ms${M.qtc > 0.5 ? ' (markedly prolonged — torsades risk)' : M.qtc > 0.46 ? ' (prolonged)' : M.qtc < 0.35 ? ' (short)' : ''}`);
      const ax = frontalAxis(M);
      const axTxt = p.paed ? '' : ax < -30 ? ' (left axis deviation)' : ax > 90 ? ' (right axis deviation)' : '';
      if (r !== 'chb' || M.escape === 'junctional') parts.push(`axis ${ax}°${axTxt}`);
      out.push(parts.join('; ') + '.');
    }
    const noP = ['af', 'flutter', 'svt', 'junctional', 'vt', 'paced', 'chb'].includes(r);
    const fx = (M.findings || []).filter((x) => {
      if (['vf', 'asystole'].includes(r) || (r === 'vt' && !/sodium/.test(x)) || r === 'paced') return false;
      if (noP && /P wave/.test(x)) return false;
      if (/peaked T/.test(x) && M.tAmp < 1.3) return false;
      return true;
    });
    if (fx.length) out.push(fx.map((x, i) => (i ? x : x[0].toUpperCase() + x.slice(1))).join('; ') + '.');
    if (notes) out.push(notes);
    return out.join(' ');
  }
  S.ecgReport = ecgReport;
})();
