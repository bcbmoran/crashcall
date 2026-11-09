/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Capnography: the time capnogram drawn on the monitor, the patterns it can show, a reference guide and the debrief summary.
 * Waveform phases and abnormal patterns follow the teaching of capnography.com (B.S. Kodali): phase 0 (inspiratory
 * downstroke), I (dead-space gas, CO₂-free), II (rapid S-shaped rise as dead-space and alveolar gas mix), III (alveolar
 * plateau, normally sloping gently upwards), the α angle (II→III, widens as phase III steepens — V/Q mismatch,
 * bronchospasm) and the β angle (III→0, ~90°, widens with rebreathing). Values are drawn in kPa. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---- current pattern parameters from the patient / equipment ----
  function params(e) {
    const p = e.p, f = e.flags, g = e.ga;
    const ventd = p.ventilated || p.assisted || p.sga;
    return {
      et: p.etco2 / 7.5,
      base: clamp((g && g.fico2) || p.fico2 || 0, 0, 3), // inspired CO₂ (rebreathing / exhausted absorbent)
      shark: clamp(Math.max(p.bronchEff || 0, Math.min(0.85, p.ventObstruct || 0)), 0, 1),
      biphasic: clamp(p.capnoBiphasic || 0, 0, 1),
      cleft: p.ventilated && p.effort > 0.25 && !f.paralysed && !(g && g.block > 0.7) ? clamp(p.effort, 0.25, 0.8) : 0,
      cardio: p.ventilated && !p.arrested && p.rr > 0 && p.rr <= 12 && p.hr > 30 ? 1 : 0,
      cpr: p.arrested && f.cpr ? 1 : 0,
      spont: !ventd && !p.arrested ? 1 : 0, // sampled from a mask / nasal cannula: rounded, diluted by the O₂ flow
      blunt: p.rr > 35 ? clamp((p.rr - 35) / 25, 0, 1) : 0, // fast rates (children): the sidestream analyser can't keep up
      downslope: clamp(p.capnoDownslope || 0, 0, 1),
      hr: p.hr || 0,
      oesoT: f.oesoT != null ? e.t - f.oesoT : null,
    };
  }

  // ---- one breath: x = 0..1 through the breath (inspiration first), returns PCO₂ in kPa ----
  function shape(P, x, t) {
    const { et, base } = P;
    const insp = P.spont ? 0.4 : 0.33;
    // Phase 0: inspiratory downstroke (β ≈ 90°; slanted when rebreathing), then the inspired baseline
    const down = 0.025 + (base > 0.2 ? 0.06 : 0) + P.blunt * 0.05;
    if (x < insp) {
      const v = x < down ? et + (base - et) * smooth(x / down) : base;
      return v + cardioRipple(P, t, x < 0.12 ? 1 - x / 0.12 : 0) + cprRipple(P, t);
    }
    const e = (x - insp) / (1 - insp);
    const amp = et - base;
    let v;
    if (P.shark > 0.12) {
      // Bronchospasm / obstruction: phase II and III merge and prolong — the "shark fin"; α angle widens, no plateau
      const r = 4.2 - 2.6 * P.shark; // smaller r = slower, more linear rise
      v = base + amp * (1 - Math.exp(-r * clamp(e / 0.97, 0, 1))) / (1 - Math.exp(-r));
    } else if (P.spont) {
      // Spontaneous breathing sampled at the mouth/nose: slower phase II, rounded plateau that falls off as O₂ flow dilutes it
      v = base + amp * smooth(e / 0.32) * (1 - 0.1 * smooth((e - 0.75) / 0.25));
    } else {
      // Normal: phase I (dead space) → phase II (S-shaped rise) → phase III (gently up-sloping alveolar plateau)
      const ph1 = 0.04, ph2 = 0.12;
      if (e < ph1) v = base;
      else if (e < ph1 + ph2) v = base + amp * 0.92 * smooth((e - ph1) / ph2);
      else {
        const u = (e - ph1 - ph2) / (1 - ph1 - ph2);
        v = base + amp * (0.92 + 0.08 * u - P.downslope * 0.16 * u + P.downslope * 0.08);
        if (P.biphasic > 0) v = base + amp * (u < 0.45 ? 0.92 - 0.3 * P.biphasic + 0.08 * u : (0.92 - 0.3 * P.biphasic) + (0.3 * P.biphasic + 0.05) * smooth((u - 0.45) / 0.25) + 0.03 * u);
        if (P.cleft) v -= amp * 0.42 * P.cleft * Math.exp(-Math.pow((u - 0.5) / 0.06, 2)); // curare cleft: notch in phase III
      }
    }
    if (P.blunt > 0) v = base + (v - base) * (1 - 0.35 * P.blunt * (1 - smooth(e / 0.6))); // slow response: rounded corners
    return v + cardioRipple(P, t, e > 0.85 ? (e - 0.85) / 0.15 : 0) + cprRipple(P, t);
  }
  function cardioRipple(P, t, w) { return P.cardio && w > 0 && P.et > 1 ? P.et * 0.05 * w * Math.sin(t * 2 * Math.PI * (P.hr / 60)) : 0; }
  function cprRipple(P, t) { return P.cpr && P.et > 0.3 ? Math.max(0, Math.sin(t * 2 * Math.PI * 1.85)) * Math.min(0.5, P.et * 0.18) : 0; }

  // Value for the monitor (kPa). x: position in the breath; t: time (s). When the trace is lost, returns stomach gas after an
  // oesophageal / displaced tube (a few small, shrinking waves) or a flat line.
  function value(e, x, t) {
    const p = e.p, P = params(e);
    if (P.oesoT != null && P.oesoT < 30 && (p.ventilated || p.assisted)) { const a = 1.1 * Math.exp(-P.oesoT / 8); return x < 0.33 ? 0 : a * Math.sin(Math.PI * clamp((x - 0.33) / 0.67, 0, 1)); }
    if (p.rr < 1 || P.et < 0.07) return P.cpr && p.etco2 > 0 ? cprRipple(P, t) : 0;
    return Math.max(0, shape(P, x, t));
  }

  // ---- patterns: what they look like and mean (paraphrased from capnography.com, with UK resuscitation/airway guidance) ----
  const PAT = {
    normal: { name: 'Normal capnogram', look: 'Square-topped: flat zero baseline (phase I), steep S-shaped upstroke (phase II), gently up-sloping alveolar plateau (phase III), then a near-vertical inspiratory downstroke (phase 0). The β angle is about 90°.', means: 'Ventilation and pulmonary blood flow are matched; EtCO₂ is close to arterial PaCO₂ (normally 0.3–0.7 kPa lower).', preset: {} },
    shark: { name: 'Shark fin (obstructive)', look: 'Phase II is prolonged and merges with phase III, which slopes steeply upwards with no plateau; the α angle widens.', means: 'Obstruction to expiration: bronchospasm (asthma, anaphylaxis, COPD), a kinked or blocked tube/filter, or secretions. Lung units empty at different rates, so CO₂-rich gas arrives late.', act: 'Check the circuit and tube (DOPES), hand-ventilate, suction; treat bronchospasm; allow a longer expiratory time.', preset: { shark: 0.7 } },
    rebreath: { name: 'Raised baseline (rebreathing)', look: 'The baseline does not return to zero (inspired CO₂ > 0) and the inspiratory downstroke slants — the β angle widens. EtCO₂ creeps up.', means: 'CO₂ is being rebreathed: exhausted soda lime, an incompetent valve, too little fresh gas in a Mapleson circuit, or added dead space.', act: 'Increase the fresh gas flow, change the absorbent, check the valves.', preset: { base: 0.9 } },
    cleft: { name: 'Curare cleft', look: 'A notch dips into the alveolar plateau (phase III).', means: 'The patient is making a breath of their own against the ventilator — the neuromuscular block or anaesthesia is wearing off. A partly disconnected mainstream sensor can look similar.', act: 'Check depth of anaesthesia and the train-of-four; re-dose if surgery is continuing.', preset: { cleft: 0.7 } },
    biphasic: { name: 'Biphasic plateau', look: 'Phase III has two steps.', means: 'The two lungs empty at different rates — endobronchial (one-lung) intubation, single-lung transplant or severe kyphoscoliosis. A broken sampling filter can produce a double plateau too.', act: 'Check tube depth and listen to both sides; withdraw an endobronchial tube above the carina.', preset: { biphasic: 0.8 } },
    cardio: { name: 'Cardiogenic oscillations', look: 'Small ripples at the heart rate on the end of the plateau and the downstroke.', means: 'The heart beating against the lungs moves gas in the airway when flow is low (slow ventilator rates). Harmless.', preset: { cardio: 1, hr: 80 } },
    flat: { name: 'Flat trace', look: 'No waveform.', means: 'No CO₂ is reaching the sensor: apnoea, disconnection, a displaced/blocked tube, or oesophageal intubation (a few small fading waves from stomach gas, then nothing). In cardiac arrest a flat trace with good CPR still means a misplaced tube until proven otherwise.', act: '“No trace = wrong place” (NAP4/DAS): check the tube, circuit and sampling line; if in doubt, take it out.', preset: { flat: 1 } },
    oesoph: { name: 'Oesophageal / displaced tube', look: 'A few small waves that shrink to nothing within a few breaths.', means: 'Gas in the stomach (or from mask ventilation) contains a little CO₂ that is washed out — the tube is not in the trachea.', act: 'Remove and re-intubate, oxygenating by mask or SAD in between.', preset: { oeso: 1 } },
    low: { name: 'Low EtCO₂ with a normal shape', look: 'Normal-shaped waveform, but small.', means: 'Hyperventilation, or reduced CO₂ delivery to the lungs: falling cardiac output, massive pulmonary embolism, hypovolaemia or cardiac arrest. With ventilation unchanged, a sudden fall in EtCO₂ tracks a fall in cardiac output, and the arterial–end-tidal gap widens.', act: 'Check BP and pulse; think PE, haemorrhage, tamponade, arrest.', preset: { scale: 0.45 } },
    high: { name: 'High EtCO₂', look: 'Normal-shaped, tall waveform, rising breath by breath.', means: 'Hypoventilation, or increased CO₂ production (fever, sepsis, malignant hyperthermia, thyroid storm) or absorption (laparoscopic CO₂). A rapid, unexplained rise despite more ventilation is malignant hyperthermia until proven otherwise.', act: 'Increase minute ventilation; look for the cause (temperature, muscle rigidity, insufflation).', preset: { scale: 1.6 } },
    cpr: { name: 'During CPR', look: 'Small waveforms with ripples from chest compressions.', means: 'EtCO₂ reflects cardiac output generated by CPR. Use it to confirm tube placement, monitor CPR quality and spot ROSC (a sudden sustained rise). A low value alone should not be used to stop resuscitation (RCUK).', preset: { cpr: 1, scale: 0.4 } },
    rosc: { name: 'ROSC', look: 'A sudden, sustained jump in EtCO₂ during CPR.', means: 'Return of spontaneous circulation: CO₂ that built up in the tissues is delivered to the lungs. Check rhythm and pulse at the next pause.', preset: { scale: 1.3 } },
    spont: { name: 'Spontaneous breathing via mask / nasal cannula', look: 'Rounded plateau that may fall off at the end; values can read low.', means: 'Sampling at the mouth or nose is diluted by the oxygen flow and room air, so EtCO₂ underestimates PaCO₂ — use it for trends and apnoea detection (e.g. during sedation).', preset: { spont: 1 } },
    fast: { name: 'Fast respiratory rate (children)', look: 'No proper plateau; the waveform looks rounded and low.', means: 'At fast rates a sidestream analyser cannot respond quickly enough, so EtCO₂ under-reads.', preset: { blunt: 0.9 } },
  };

  // ---- small SVG of a pattern (3 breaths) drawn with the same shape function as the monitor ----
  function svg(key, opts) {
    const pr = (PAT[key] || PAT.normal).preset, w = (opts && opts.w) || 260, h = (opts && opts.h) || 70, n = 3;
    const P = Object.assign({ et: 5 * (pr.scale || 1), base: 0, shark: 0, biphasic: 0, cleft: 0, cardio: 0, cpr: 0, spont: 0, blunt: 0, downslope: 0, hr: 80 }, pr);
    const pts = [];
    for (let i = 0; i <= 360; i++) {
      const T = (i / 360) * n, b = Math.floor(T), x = T - b;
      let v;
      if (pr.flat) v = 0;
      else if (pr.oeso) v = x < 0.33 ? 0 : 1.1 * Math.exp(-b * 1.1) * Math.sin(Math.PI * (x - 0.33) / 0.67);
      else v = shape(P, x, T * 4.3);
      pts.push(`${((i / 360) * w).toFixed(1)},${(h - 6 - (clamp(v, 0, 9) / 9) * (h - 12)).toFixed(1)}`);
    }
    return `<svg class="capno-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc((PAT[key] || PAT.normal).name)}"><rect width="${w}" height="${h}" rx="6" fill="#05070a"/><line x1="0" y1="${h - 6}" x2="${w}" y2="${h - 6}" stroke="#2a3340" stroke-width="1"/><polyline points="${pts.join(' ')}" fill="none" stroke="#ffe14d" stroke-width="1.8"/></svg>`;
  }

  // Annotated normal capnogram for the guide
  function annotated() {
    const w = 420, h = 170, P = { et: 5, base: 0, shark: 0, biphasic: 0, cleft: 0, cardio: 0, cpr: 0, spont: 0, blunt: 0, downslope: 0, hr: 80 };
    const X = (x) => 20 + x * (w - 40), Y = (v) => h - 30 - (v / 6.2) * (h - 60);
    const pts = []; for (let i = 0; i <= 300; i++) { const x = 0.25 + (i / 300) * 1.0, xx = x % 1; pts.push(`${X(i / 300).toFixed(1)},${Y(shape(P, xx, 0)).toFixed(1)}`); }
    // positions in breath fraction (shifted by 0.25): insp 0..0.33 → plotted from 0.25
    const pos = (x) => X(x - 0.25 < 0 ? x + 0.75 : x - 0.25);
    const e2x = (e) => 0.33 + e * 0.67;
    return `<svg class="capno-annot" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" role="img" aria-label="Annotated normal capnogram">
      <rect width="${w}" height="${h}" rx="8" fill="#05070a"/>
      <line x1="20" y1="${Y(0)}" x2="${w - 20}" y2="${Y(0)}" stroke="#2a3340"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="#ffe14d" stroke-width="2.2"/>
      <g font-size="11" fill="#cfe3ff" font-family="system-ui,sans-serif" text-anchor="middle">
        <text x="${pos(e2x(0.02))}" y="${Y(0) + 16}">I</text>
        <text x="${pos(e2x(0.1)) - 10}" y="${Y(2.6)}">II</text>
        <text x="${pos(e2x(0.55))}" y="${Y(5) - 10}">III</text>
        <text x="${pos(1.0) + 12}" y="${Y(2.6)}">0</text>
        <text x="${pos(e2x(0.17)) + 12}" y="${Y(4.3) + 14}" fill="#9fe39f">α</text>
        <text x="${pos(1.0) - 12}" y="${Y(4.6) + 4}" fill="#9fe39f">β</text>
        <text x="${pos(1.0) - 30}" y="${Y(5.1) - 8}" fill="#ffb4b4">EtCO₂</text>
        <text x="${pos(0.15)}" y="${h - 8}" fill="#8aa0b8">inspiration</text>
        <text x="${pos(e2x(0.5))}" y="${h - 8}" fill="#8aa0b8">expiration</text>
      </g>
      <circle cx="${pos(1.0) - 2}" cy="${Y(5)}" r="3" fill="#ff7b7b"/>
    </svg>`;
  }

  function guideHTML() {
    const card = (k) => { const q = PAT[k]; return `<div class="capno-card"><div class="capno-card-h"><b>${esc(q.name)}</b></div>${svg(k)}<p class="small"><b>Looks like:</b> ${esc(q.look)}</p><p class="small"><b>Means:</b> ${esc(q.means)}</p>${q.act ? `<p class="small"><b>Do:</b> ${esc(q.act)}</p>` : ''}</div>`; };
    return `<div class="capno-guide">
      <p class="muted small">How to read the yellow CO₂ trace on the monitor. The numeric EtCO₂ is the value at the end of phase III.</p>
      ${annotated()}
      <ul class="small capno-phases">
        <li><b>Phase I</b> — start of expiration: CO₂-free gas from the anatomical and equipment dead space.</li>
        <li><b>Phase II</b> — rapid S-shaped rise as dead-space gas mixes with alveolar gas.</li>
        <li><b>Phase III</b> — alveolar plateau. It normally slopes gently upwards because poorly ventilated (high-CO₂) alveoli empty last.</li>
        <li><b>Phase 0</b> — inspiration: CO₂ falls sharply to zero.</li>
        <li><b>α angle</b> (II→III) widens as phase III steepens — bronchospasm and V/Q mismatch. <b>β angle</b> (III→0) is about 90°; it widens with rebreathing.</li>
        <li><b>Numbers:</b> EtCO₂ is normally ~4.5–5.7 kPa and a little below PaCO₂. The gap widens when dead space rises (low cardiac output, PE, hypovolaemia, COPD). During CPR, EtCO₂ reflects the cardiac output the compressions produce.</li>
      </ul>
      <h3>Patterns</h3>
      <div class="capno-grid">${['shark', 'rebreath', 'cleft', 'biphasic', 'flat', 'oesoph', 'low', 'high', 'cpr', 'rosc', 'cardio', 'spont', 'fast'].map(card).join('')}</div>
      <p class="muted small">Sources: Kodali BS, capnography.com (time capnogram components; encyclopedia of capnograms; PETCO₂ and cardiac output); Resuscitation Council UK 2025 ALS; NAP4 (RCoA/DAS 2011). Waveforms are CrashCall’s own drawings.</p>
    </div>`;
  }

  // ---- what the capnograph showed during the case (recorded by the engine) ----
  function track(e, dt) {
    const p = e.p, P = params(e), seen = (e.capnoSeen = e.capnoSeen || {});
    const on = !p.noMonitor && !p.monitorOff && (e.scn.setting !== 'community' || p.ventilated);
    if (!on) return;
    const add = (k, c) => { if (c) seen[k] = (seen[k] || 0) + dt; };
    const airway = p.ventilated || p.assisted || p.sga;
    add('shark', P.shark > 0.25 && P.et > 0.5);
    add('rebreath', P.base > 0.3);
    add('cleft', P.cleft > 0);
    add('biphasic', P.biphasic > 0.3);
    add('cardio', P.cardio && P.et > 1);
    add('cpr', P.cpr && airway);
    add('flat', airway && !p.arrested && P.et < 0.3);
    add('oesoph', P.oesoT != null && P.oesoT < 20);
    add('low', !p.arrested && P.et > 0.3 && P.et < 3.3 && p.rr >= 8);
    add('high', !p.arrested && P.et > 6.8);
    if (e.capnoWasArrest && !p.arrested && airway && P.et > 2.5) seen.rosc = 99;
    e.capnoWasArrest = p.arrested && f(e).cpr;
    if (P.spont && P.et > 0.5) seen.spont = (seen.spont || 0) + dt;
  }
  const f = (e) => e.flags;

  function debriefHTML(e) {
    const seen = e.capnoSeen || {};
    const keys = ['oesoph', 'flat', 'shark', 'rebreath', 'cleft', 'biphasic', 'cpr', 'rosc', 'low', 'high', 'cardio'].filter((k) => (seen[k] || 0) >= 4);
    if (!keys.length) return '';
    return `<h3>Capnography in this case</h3><div class="capno-db">${keys.map((k) => `<div class="capno-db-row">${svg(k, { w: 150, h: 46 })}<div><b>${esc(PAT[k].name)}</b><br><span class="small">${esc(PAT[k].means)}</span></div></div>`).join('')}</div><p class="muted small"><a href="#" data-capno-guide>Open the capnography guide</a></p>`;
  }

  S.Capno = { params, value, svg, guideHTML, debriefHTML, track, PATTERNS: PAT };
})();
