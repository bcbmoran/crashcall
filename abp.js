/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Invasive arterial (radial) pressure waveform.
   Sources for the morphology: Deranged Physiology (A. Yartsev) — "Normal arterial line waveforms" (CICM primary, ch. 760) and
   "Interpretation of abnormal arterial line waveforms" (ch. 761).
   Each beat is built in real time (seconds) rather than stretched to the R–R interval:
   - systolic upstroke (anacrotic limb) from aortic valve opening; steeper and higher peripherally (distal pulse amplification)
   - systolic peak, shaped by the reflected wave (early and large in stiff/old or vasoconstricted arteries → late-systolic augmentation;
     later and smaller in young/compliant or vasodilated arteries)
   - systolic decline, then the dicrotic notch (softened at the radial artery; low and late when vasodilated, high when vasoconstricted)
   - diastolic run-off: exponential decay from the elastic reservoir, so long R–R intervals (AF, pauses) end lower and short ones higher.
   The displayed trace then passes through a second-order model of the catheter–tubing–transducer system (natural frequency and damping
   coefficient), so overdamping and underdamping (resonance) look and read as they do at the bedside, and a fast-flush (square-wave) test works. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const g = (x, mu, w) => Math.exp(-((x - mu) * (x - mu)) / (2 * w * w));
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

  // Catheter–transducer system: natural frequency (Hz) and damping coefficient (ζ).
  const DAMP = {
    optimal: { fn: 22, z: 0.6, label: 'Optimally damped', note: 'One or two small oscillations after a fast flush, then a crisp waveform with a clear dicrotic notch. Systolic and diastolic readings are accurate.' },
    under: { fn: 12, z: 0.15, label: 'Underdamped (resonance)', note: 'Several oscillations after a fast flush. Spiky, overshooting systolic peaks and extra "ringing" waves: systolic is over-read and diastolic under-read; MAP stays about right. Causes: long, stiff or extra tubing, small catheter, tachycardia. Fix: remove unnecessary tubing/three-way taps, or add a damping device.' },
    over: { fn: 7, z: 1.5, label: 'Overdamped', note: 'Slow, sloping return after a fast flush with no oscillation. Rounded, flattened trace with the dicrotic notch lost: systolic under-read and diastolic over-read (narrow pulse pressure); MAP stays about right. Causes: air bubble, clot, kinked or compliant tubing, loose connection, catheter against the vessel wall, under-inflated pressure bag. Fix: flush, de-air, check connections and the pressure bag (300 mmHg), reposition the wrist.' },
  };

  function params(e) {
    const p = e.p;
    const hr = Math.max(20, p.hrTrue || p.hr || 70);
    const age = p.paed ? 5 : p.age || 50;
    const stiff = p.abpStiff != null ? p.abpStiff : p.paed ? 0 : clamp((age - 30) / 50, 0, 1);
    const svrN = clamp((p.svr || 1100) / ((p.svrScale || 1) * 1100), 0.25, 3);
    const ce = clamp(p.contractEff || 1, 0.2, 1.6);
    const valve = p.valve || null; // 'as' | 'ar' | 'hocm' (scenario-defined)
    let Ts = clamp(0.413 - 0.0017 * hr, 0.17, 0.34); // ejection time (Weissler: LVET ≈ 413 − 1.7 × HR ms)
    let tUp = clamp(0.07 / Math.pow(ce, 0.5), 0.055, 0.15); // radial upstroke is steep; slurs with poor contractility
    let aR = clamp((p.paed ? 0.05 : 0.1 + 0.28 * stiff) * Math.pow(svrN, 0.5), 0.03, 0.45); // reflected wave size
    let tR = tUp + clamp(0.17 - 0.11 * stiff - 0.03 * (svrN - 1), 0.045, 0.2); // returns earlier in stiff arteries
    let notchRel = clamp(0.48 * Math.pow(svrN, 0.65), 0.12, 0.82); // dicrotic notch height (fraction of pulse pressure above diastolic)
    let notchD = clamp(0.06 * Math.pow(svrN, 0.4), 0.025, 0.1); // notch depth (radial: softened)
    let dicW = clamp(0.07 * Math.pow(svrN, 0.3), 0.03, 0.1); // dicrotic wave
    let floor = clamp(0.55 - 0.25 * stiff - 0.15 * (1 / svrN - 1), 0.08, 0.8); // run-off asymptote below diastolic (× PP)
    let dip = 0, dipAt = 0, dipW = 0.03;
    if (valve === 'as') { tUp = clamp(tUp * 2.4, 0.16, 0.22); Ts += 0.04; aR *= 0.4; notchD = 0.008; dicW = 0.01; }
    if (valve === 'ar') { tUp = 0.055; notchRel = 0.22; notchD = 0.01; dicW = 0.015; floor = 0.15; dip = 0.14; dipAt = tUp + 0.055; }
    if (valve === 'hocm') { tUp = 0.05; dip = 0.32; dipAt = 0.105; dipW = 0.035; aR *= 0.6; }
    return { hr, stiff, svrN, ce, valve, Ts, tUp, aR, tR, notchRel, notchD, dicW, floor, dip, dipAt, dipW };
  }

  // Systolic part in pulse-pressure units (0 at the start of the beat), before normalisation
  function sysRaw(P, t) {
    const rise = smooth(t / P.tUp);
    const fall = t <= P.tUp ? 0 : Math.pow((t - P.tUp) / (P.Ts - P.tUp), 1.25) * (1 - P.notchRel);
    let v = rise * (1 - fall) + P.aR * g(t, P.tR, 0.045) * rise;
    if (P.dip) v -= P.dip * g(t, P.dipAt, P.dipW) * rise;
    return v;
  }
  // Build one beat template: returns f(τ) in PP units where peak = 1 and end-diastole at the mean R–R = 0.
  function template(P, rrMean) {
    let peak = 0;
    for (let i = 0; i <= 60; i++) { const t = (P.Ts * i) / 60; peak = Math.max(peak, sysRaw(P, t)); }
    const endSys = sysRaw(P, P.Ts) / peak;
    const yInf = -P.floor;
    const n0 = endSys + 0.6 * P.dicW; // level the diastolic decay starts from (after the dicrotic wave)
    const dur = Math.max(0.12, rrMean - P.Ts - 0.03);
    const tau = clamp(dur / Math.log(Math.max(1.01, (n0 - yInf) / (0 - yInf))), 0.12, 6);
    return (t) => {
      if (t <= P.Ts) return sysRaw(P, t) / peak;
      const d = t - P.Ts;
      const dia = yInf + (n0 - yInf) * Math.exp(-Math.max(0, d - 0.03) / tau);
      const blend = smooth(d / 0.03);
      const base = endSys * (1 - blend) + dia * blend;
      return base - P.notchD * g(d, 0.012, 0.012) + P.dicW * g(d, 0.055, 0.025) * (1 - 0.4 * blend);
    };
  }

  // True (intravascular) radial pressure at time t, mmHg
  function truePressure(mon, t) {
    const e = mon.eng, p = e.p, rhythm = p.rhythm;
    if (p.arrested && e.flags.cpr) { // chest compressions: sharp compression spikes, low "diastolic" relaxation
      const ph = (t * 1.85) % 1, q = clamp(e.flags.cprQ != null ? e.flags.cprQ : 1, 0.3, 1.2);
      const c = ph < 0.42 ? Math.sin((ph / 0.42) * Math.PI) : 0;
      return 12 + 6 * Math.exp(-ph * 3) + Math.pow(c, 1.4) * 62 * q;
    }
    if (p.arrested) return 6;
    if (['vf', 'asystole', 'pea'].includes(rhythm) || p.map < 18) return (p.map < 18 ? clamp(p.map, 0, 18) : 10) + Math.sin(t * 9) * 0.3;
    const delay = 0.2; // QRS onset → radial upstroke (≈160–180 ms to the aortic root, a little more peripherally and through tubing)
    const [bb, nbb] = mon.beatAt(t - delay);
    if (bb == null) return p.dbp;
    const rrMean = mon.rrNow();
    const rr = (nbb ? nbb.q : bb.q + rrMean) - bb.q;
    const tau = t - delay - bb.q;
    if (!bb._abp) {
      const P = params(e); bb._abp = { P, f: template(P, Math.min(rrMean, 2)) };
      // beat-to-beat stroke volume: premature beats eject little; a beat after a long pause ejects more (post-extrasystolic potentiation / Frank–Starling in AF)
      const v = mon.gen.v, i = v.indexOf(bb), prev = i > 0 ? v[i - 1] : null;
      const rrPrev = prev ? bb.q - prev.q : rrMean;
      let sv = clamp(0.55 + 0.45 * (rrPrev / rrMean), 0.25, 1.25);
      if (bb.type === 'pvc') sv *= 0.55;
      if (prev && prev.type === 'pvc') sv *= 1.12;
      if ((p.contractEff || 1) < 0.35 && rhythm === 'sinus' && bb.n % 2) sv *= 0.82; // pulsus alternans in severe LV failure
      bb._sv = sv;
      // start pressure carries over from the previous beat's diastolic run-off
      bb._y0 = prev && prev._abp ? clamp(prev._abp.f(rrPrev) * (prev._sv || 1), -0.35, 0.5) : 0;
    }
    const resp = mon.respPhase(t);
    let mod = 1;
    if (p.ventilated) mod = 1 - clamp((1.05 - p.preload) * 0.45, 0.02, 0.25) * resp; // pulse pressure variation (hypovolaemia, IPPV)
    if (p.pulsus) mod = 1 - p.pulsus * resp; // pulsus paradoxus (tamponade, severe asthma)
    const pp = (p.sbp - p.dbp) * mod;
    const f = bb._abp.f(Math.min(tau, 2.5));
    const y0 = bb._y0 || 0, sv = bb._sv || 1;
    // blend the carried-over start level into the new beat during the upstroke
    const lift = y0 * (1 - smooth(tau / Math.max(0.1, bb._abp.P.Ts)));
    return p.dbp + pp * (f * sv + lift);
  }

  // Second-order catheter–transducer response, integrated in 0.5 ms sub-steps
  function damped(mon, t, u) {
    const st = mon._abpF || (mon._abpF = { y: u, v: 0, t });
    let dt = t - st.t;
    if (dt <= 0) return st.y;
    if (dt > 0.5) { st.y = u; st.v = 0; st.t = t; return u; }
    const mode = DAMP[mon.eng.flags.abpDamp || 'optimal'] || DAMP.optimal;
    const w = 2 * Math.PI * mode.fn;
    const n = Math.ceil(dt / 0.0005), h = dt / n;
    for (let i = 0; i < n; i++) { const a = w * w * (u - st.y) - 2 * mode.z * w * st.v; st.v += a * h; st.y += st.v * h; }
    st.t = t;
    return st.y;
  }

  // Displayed pressure (what the monitor shows), with the fast-flush square wave
  function value(mon, t) {
    const e = mon.eng;
    let u = truePressure(mon, t);
    const fl = e.flags.abpFlushT;
    if (fl != null) { // flush: pressure rises towards the pressure-bag pressure, then is released abruptly
      const dt = t - (mon._flushBase != null ? mon._flushBase : (mon._flushBase = t - (e.t - fl)));
      if (dt >= 0 && dt < 0.7) u = Math.min(260, u + (260 - u) * smooth(dt / 0.06));
      if (dt > 3) { e.flags.abpFlushT = null; mon._flushBase = null; }
    }
    const y = damped(mon, t, u);
    // track displayed peaks/troughs so the numerics read what the trace shows (damping errors included)
    const tr = mon._abpTr || (mon._abpTr = { mx: -1e9, mn: 1e9, sum: 0, n: 0, t0: t, s: null, d: null, m: null });
    const flushing = e.flags.abpFlushT != null;
    if (!flushing) { tr.mx = Math.max(tr.mx, y); tr.mn = Math.min(tr.mn, y); tr.sum += y; tr.n++; }
    if (t - tr.t0 > Math.max(1.6, 1.3 * mon.rrNow()) || t < tr.t0) {
      if (tr.n > 5) { tr.s = tr.mx; tr.d = tr.mn; tr.m = tr.sum / tr.n; }
      tr.mx = -1e9; tr.mn = 1e9; tr.sum = 0; tr.n = 0; tr.t0 = t;
    }
    return y;
  }
  function readings(mon) {
    const p = mon.eng.p, tr = mon._abpTr;
    if (!tr || tr.s == null || p.arrested || p.map < 18) return { s: p.sbp, d: p.dbp, m: p.map };
    return { s: tr.s, d: Math.max(0, tr.d), m: p.map + (tr.m - p.map) * 0.3 }; // MAP is little affected by damping
  }
  function ppv(e) {
    const p = e.p;
    if (!p.ventilated || p.rhythm !== 'sinus' || p.arrested) return null;
    const a = clamp((1.05 - p.preload) * 0.45, 0.02, 0.25);
    return Math.round((a / (1 - a / 2)) * 100);
  }

  // ---- guide (opened by clicking the ABP trace) ----
  function svgBeat(P, w = 300, h = 110, opt = {}) {
    const f = template(P, opt.rr || 0.85), pts = [];
    const T = opt.T || 1.7, rr = opt.rr || 0.85;
    for (let i = 0; i <= 300; i++) {
      const t = (T * i) / 300, tt = t % rr, k = Math.floor(t / rr);
      let v = f(tt); if (k > 0 && tt < P.Ts) v += f(rr) * (1 - smooth(tt / P.Ts));
      if (opt.ppv) v *= 1 - opt.ppv * (0.5 - 0.5 * Math.cos((2 * Math.PI * (t - tt)) / 3.2));
      pts.push(`${((i / 300) * w).toFixed(1)},${(h - 12 - v * (h - 26)).toFixed(1)}`);
    }
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;background:#000;border-radius:6px"><polyline fill="none" stroke="#ff4d4d" stroke-width="2" points="${pts.join(' ')}"/>${opt.labels || ''}</svg>`;
  }
  function guideHTML(e) {
    const base = { stiff: 0.3, svrN: 1, ce: 1, Ts: 0.3, tUp: 0.07, aR: 0.16, tR: 0.22, notchRel: 0.48, notchD: 0.06, dicW: 0.07, floor: 0.5, dip: 0, dipAt: 0, dipW: 0.03 };
    const mk = (o) => Object.assign({}, base, o);
    const lab = `<text x="2" y="70" fill="#ffd0d0" font-size="10">upstroke</text><text x="34" y="13" fill="#ffd0d0" font-size="10">peak</text><text x="96" y="52" fill="#ffd0d0" font-size="10">dicrotic notch</text><text x="150" y="82" fill="#ffd0d0" font-size="10">diastolic run-off</text>`;
    const card = (title, P, text, o) => `<div class="abp-card"><b>${title}</b>${svgBeat(P, 260, 90, o)}<p class="small">${text}</p></div>`;
    const cur = e ? currentHTML(e) : '';
    return `<div class="abp-guide">${cur}
      <h3>The normal radial arterial waveform</h3>${svgBeat(mk({}), 320, 120, { labels: lab })}
      <ul class="small">
        <li><b>Systolic upstroke</b> (anacrotic limb): ejection after the aortic valve opens. A slurred, slow upstroke suggests aortic stenosis or poor contractility.</li>
        <li><b>Systolic peak</b>: shaped by the forward wave plus the wave reflected back from high-resistance arterioles. Peripheral arteries show <i>distal pulse amplification</i>: a steeper upstroke, higher systolic and lower diastolic pressure than the aortic root, with MAP almost unchanged.</li>
        <li><b>Dicrotic notch</b>: at the aortic root a sharp incisura from valve closure; at the radial artery it is softened and later, and its height mostly reflects peripheral resistance and wave reflection. It is one of the first features lost when the system is overdamped.</li>
        <li><b>Diastolic run-off</b>: exponential decay as the elastic large arteries empty (up to ~40% of stroke volume is delivered this way). Steep in vasodilation and aortic regurgitation.</li>
        <li><b>Timing</b>: the upstroke follows the QRS by roughly 160–180 ms at the aortic root, and a little more at the radial artery.</li>
      </ul>
      <h3>Patterns you can see in CrashCall</h3><div class="abp-grid">
      ${card('Vasodilated (sepsis, anaphylaxis)', mk({ svrN: 0.45, notchRel: 0.28, notchD: 0.04, aR: 0.08, tR: 0.26, floor: 0.25 }), 'Low, late dicrotic notch and a steep diastolic run-off; low diastolic pressure.')}
      ${card('Vasoconstricted / stiff arteries (elderly, hypertension)', mk({ svrN: 1.8, stiff: 1, notchRel: 0.72, aR: 0.4, tR: 0.13, floor: 0.75 }), 'Early, large reflected wave adds a late-systolic peak (augmentation); high dicrotic notch; slow run-off.')}
      ${card('Pulse pressure variation (ventilated, hypovolaemic)', mk({}), 'Pulse pressure rises and falls with each ventilator breath. PPV &gt; 12–13% suggests fluid responsiveness (sinus rhythm, Vt ≥ 8 mL/kg, closed chest). Shown on the ABP numeric.', { T: 6.4, rr: 0.8, ppv: 0.3 })}
      ${card('Aortic stenosis (pulsus parvus et tardus)', mk({ tUp: 0.19, Ts: 0.34, aR: 0.06, notchD: 0.008, dicW: 0.01 }), 'Slow upstroke, delayed rounded low peak, notch hard to see.')}
      ${card('Aortic regurgitation', mk({ tUp: 0.055, notchRel: 0.22, notchD: 0.01, dicW: 0.015, floor: 0.15, dip: 0.14, dipAt: 0.11 }), 'Sharp upstroke, wide pulse pressure, steep diastolic fall to a low diastolic; may be bisferiens (two systolic peaks).')}
      ${card('HOCM (bisferiens / "spike and dome")', mk({ tUp: 0.05, dip: 0.32, dipAt: 0.105, dipW: 0.035, aR: 0.1 }), 'Brisk early spike, mid-systolic drop as the outflow tract obstructs, then a second dome.')}
      </div>
      <h3>Beat-to-beat changes</h3><ul class="small">
        <li><b>Pulsus paradoxus</b> (tamponade, severe asthma): systolic falls &gt; 10 mmHg with spontaneous inspiration; narrow pulse pressure in low-output states.</li>
        <li><b>AF</b>: every beat is different; long R–R intervals end lower (longer run-off) and are followed by bigger beats.</li>
        <li><b>Ectopics</b>: a premature beat ejects little (small or absent pulse); the beat after the compensatory pause is larger.</li>
        <li><b>Pulsus alternans</b>: alternate strong and weak beats in severe LV failure.</li>
        <li><b>CPR</b>: compression spikes with low relaxation pressure; aim for a diastolic (relaxation) pressure above ~25 mmHg if a line is in.</li>
      </ul>
      <h3>Damping and the fast-flush (square-wave) test</h3>
      <p class="small">Pull the flush tab (Airway &amp; procedures → <i>Arterial line: fast-flush test</i>) and watch the trace return to baseline.</p>
      <div class="abp-grid">${['optimal', 'under', 'over'].map((k) => `<div class="abp-card"><b>${DAMP[k].label}</b>${flushSVG(k)}<p class="small">${DAMP[k].note}</p></div>`).join('')}</div>
      <p class="muted small">Source: Deranged Physiology (A. Yartsev), <a href="https://derangedphysiology.com/main/cicm-primary-exam/cardiovascular-system/Chapter-760/normal-arterial-line-waveforms" target="_blank" rel="noopener">Normal arterial line waveforms</a> and <a href="https://derangedphysiology.com/main/cicm-primary-exam/cardiovascular-system/Chapter-761/interpretation-abnormal-arterial-line-waveforms" target="_blank" rel="noopener">Interpretation of abnormal arterial line waveforms</a>. Simplified models for teaching.</p></div>`;
  }
  function flushSVG(k) { // simulate a flush through each damping mode
    const m = DAMP[k], w = 2 * Math.PI * m.fn, pts = [];
    let y = 80, v = 0; const W = 260, H = 90, dtS = 0.0005, T = 0.6;
    for (let i = 0, t = 0; t < T; i++, t += dtS) {
      const u = t < 0.15 ? 80 + 140 * smooth(t / 0.02) : 80;
      const a = w * w * (u - y) - 2 * m.z * w * v; v += a * dtS; y += v * dtS;
      if (i % 4 === 0) pts.push(`${((t / T) * W).toFixed(1)},${(H - 6 - (clamp(y, 0, 260) / 260) * (H - 12)).toFixed(1)}`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;background:#000;border-radius:6px"><polyline fill="none" stroke="#ff4d4d" stroke-width="2" points="${pts.join(' ')}"/></svg>`;
  }
  function currentHTML(e) {
    const p = e.p; if (!p.artLine) return '<p class="muted small">No arterial line in place — insert one (Airway &amp; procedures) to see the live trace.</p>';
    const P = params(e), out = [];
    if (P.svrN < 0.7) out.push('low, late dicrotic notch and steep run-off — <b>vasodilated</b>');
    else if (P.svrN > 1.4) out.push('high dicrotic notch, slow run-off — <b>vasoconstricted</b>');
    if (P.stiff > 0.6 && !p.paed) out.push('early reflected wave giving late-systolic augmentation (stiff, older arteries)');
    if (P.ce < 0.6) out.push('slurred upstroke — <b>poor contractility</b>');
    const v = ppv(e); if (v != null) out.push(`pulse pressure variation about <b>${v}%</b>${v > 12 ? ' (suggests fluid responsiveness)' : ''}`);
    if (p.pulsus) out.push('<b>pulsus paradoxus</b> — pressure falls with each inspiration');
    if (p.rhythm === 'af') out.push('beat-to-beat variation from the irregular rhythm');
    if (p.valve) out.push({ as: 'aortic stenosis pattern', ar: 'aortic regurgitation pattern', hocm: 'HOCM (bisferiens) pattern' }[p.valve]);
    return `<div class="abp-now"><b>This patient now:</b> ${Math.round(p.sbp)}/${Math.round(p.dbp)} (MAP ${Math.round(p.map)}), pulse pressure ${Math.round(p.sbp - p.dbp)} mmHg${out.length ? '; ' + out.join('; ') : ''}.${e.flags.abpFixed ? ' The line has been troubleshot and is now optimally damped.' : e.flags.abpFlushed ? ' You have done a fast-flush test — compare what you saw with the damping examples at the bottom of this guide.' : ' Do a fast-flush test (Airway &amp; procedures) to check the damping before trusting the numbers.'}</div>`;
  }
  function debriefHTML(e) {
    if (!e.p.artLine || !e.flags.abpDamp0 || e.flags.abpDamp0 === 'optimal') return '';
    const d = DAMP[e.flags.abpDamp0];
    return `<h3>Arterial line</h3><p>The arterial trace was <b>${d.label.toLowerCase()}</b>. ${e.flags.abpFlushed ? 'You performed a fast-flush test' : 'A fast-flush test was not performed'}${e.flags.abpFixed ? ' and corrected the line' : ''}. ${d.note}</p>`;
  }

  S.ABP = { params, value, readings, ppv, guideHTML, debriefHTML, DAMP };
})();
