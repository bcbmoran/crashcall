/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Bedside monitor: sweeping waveforms (ECG II, ABP, SpO2 pleth, capnography) + numerics. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const g = (x, mu, w) => Math.exp(-((x - mu) * (x - mu)) / (2 * w * w));

  function plethShape(x) { // x 0..1 of a beat
    if (x < 0) return 0;
    if (x < 0.14) return Math.sin((x / 0.14) * Math.PI / 2);
    const d = (x - 0.14) / 0.86;
    return Math.max(0, (1 - d) * 0.9 + 0.1 * Math.exp(-d * 6)) * (1 - 0.12 * g(d, 0.28, 0.05)) + 0.1 * g(d, 0.35, 0.06) - 0.05;
  }
  // svrN: SVR relative to normal (low = vasodilated: fast run-off, low dicrotic notch);
  // ce: contractility (slow upstroke when poor)
  function abpShape(x, svrN = 1, ce = 1) {
    if (x < 0) return 0;
    const up = clamp(0.12 / Math.pow(clamp(ce, 0.3, 1.6), 0.6), 0.07, 0.22);
    if (x < up) return Math.sin((x / up) * Math.PI / 2);
    const d = (x - up) / (1 - up);
    const k = clamp(2.2 / Math.pow(clamp(svrN, 0.3, 2.5), 0.8), 1.2, 4.5);
    let v = Math.exp(-d * k);
    const notch = clamp(0.12 * svrN, 0.02, 0.18);
    v -= notch * g(d, 0.22, 0.03);
    v += 0.7 * notch * g(d, 0.29, 0.05);
    return clamp((v - Math.exp(-k)) / (1 - Math.exp(-k)), 0, 1);
  }

  class Monitor {
    constructor(canvas, eng, opts) {
      this.kind = (opts && opts.kind) || 'main'; this.noCo2 = !!(opts && opts.noCo2);
      this.c = canvas; this.ctx = canvas.getContext('2d'); this.eng = eng;
      this.tm = 0; this.x = 0; this.gen = new S.RhythmGen(); this.morph = S.ecgMorph(eng.p); this.morphAt = -1;
      this.breathStart = 0; this.nextBreath = 1;
      this.last = {}; this.nibp = null; this.nibpAt = -999; this.nibpCycle = 30;
      this.sound = false; this.actx = null;
      this.resize();
      this.measureNibp();
      // Click the CO₂ trace to open the capnography guide
      canvas.addEventListener('click', (ev) => {
        const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
        const chs = this.channels(), rowH = this.H / chs.length, ci = Math.floor(y / rowH);
        if (chs[ci] && chs[ci].k === 'co2' && x < this.waveW && S.Capno && S.ui) S.ui.openModal('Capnography guide', S.Capno.guideHTML());
        if (chs[ci] && chs[ci].k === 'abp' && x < this.waveW && S.ABP && S.ui) S.ui.openModal('Arterial waveform guide', S.ABP.guideHTML(this.eng));
      });
      canvas.addEventListener('mousemove', (ev) => {
        const r = canvas.getBoundingClientRect(), y = ev.clientY - r.top, x = ev.clientX - r.left;
        const chs = this.channels(), ci = Math.floor(y / (this.H / chs.length));
        canvas.style.cursor = chs[ci] && (chs[ci].k === 'co2' || chs[ci].k === 'abp') && x < this.waveW ? 'help' : '';
      });
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.W = Math.max(300, r.width); this.H = Math.max(200, r.height);
      this.c.width = this.W * dpr; this.c.height = this.H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.W, this.H);
      this.x = 0; this.last = {}; this.cx = {};
      this.waveW = Math.round(this.W * (this.W < 560 ? 0.56 : 0.68));
    }
    measureNibp() {
      const p = this.eng.p;
      const n = (v) => Math.round(v + (Math.random() - 0.5) * 4);
      if (p.map < 25 || p.hr < 15) this.nibp = { s: null, d: null, m: null };
      else this.nibp = { s: n(p.sbp), d: n(p.dbp), m: n(p.map) };
      this.nibpAt = this.eng.t;
    }
    channels() {
      const p = this.eng.p;
      if (this.kind === 'gas') return [{ k: 'co2', col: '#ffe14d', label: 'CO₂' }, { k: 'paw', col: '#ffb347', label: 'Paw' }, { k: 'flow', col: '#7cffb2', label: 'Flow' }];
      const ch = [{ k: 'ecg', col: '#39ff6a', label: 'II' }];
      if (p.artLine) ch.push({ k: 'abp', col: '#ff4d4d', label: 'ABP' });
      ch.push({ k: 'pleth', col: '#3ee6ff', label: 'Pleth' });
      if (!this.noCo2) ch.push({ k: 'co2', col: '#ffe14d', label: 'CO₂' });
      return ch;
    }
    // seconds of signal across one screen width
    sweep(k) { return k === 'co2' ? (this.W < 560 ? 16 : 24) : k === 'paw' || k === 'flow' ? (this.W < 560 ? 9 : 12) : (this.W < 560 ? 7 : 10); }
    // ventricular beat (QRS onset) at or before t, and the one after it
    beatAt(t) { const v = this.gen.v; for (let i = v.length - 1; i >= 0; i--) if (v[i].q <= t) return [v[i], v[i + 1] || null]; return [null, null]; }
    rrNow() { const hr = this.eng.p.hrTrue; return hr > 5 ? 60 / hr : 99; }
    schedule() {
      const p = this.eng.p;
      if (this.tm - this.morphAt > 0.25 || this.tm < this.morphAt) { this.morph = S.ecgMorph(p); this.morphAt = this.tm; }
      const n0 = this.gen.n;
      this.gen.advance(this.tm + 0.3, p, this.morph);
      if (this.gen.n > n0 && this.sound && p.hrTrue > 5 && !['vf', 'asystole', 'pea'].includes(p.rhythm)) this.beep();
      while (this.nextBreath <= this.tm + 0.05) {
        this.breathStart = this.nextBreath; this.breathLen = p.rr > 1 ? 60 / p.rr : 99; this.nextBreath += Math.min(this.breathLen, 8);
      }
    }
    beep() {
      try {
        if (!this.actx) this.actx = new (window.AudioContext || window.webkitAudioContext)();
        const a = this.actx, o = a.createOscillator(), gn = a.createGain();
        const sp = this.eng.p.spo2;
        o.frequency.value = 300 + clamp(sp - 70, 0, 30) * 18;
        gn.gain.setValueAtTime(0.06, a.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.09);
        o.connect(gn); gn.connect(a.destination); o.start(); o.stop(a.currentTime + 0.1);
      } catch (e) { /* audio unavailable */ }
    }
    value(k, t) {
      const p = this.eng.p, rhythm = p.rhythm;
      if (k === 'ecg') {
        const fine = clamp(1 - (this.eng.arrestT || 0) / 240, 0.3, 1);
        return S.ecgLead(S.ECG_LEADS.II, t, this.gen, p, { fine, M: this.morph }) + S.ecgArtefact(t, p, this.eng.flags, this.morph);
      }
      const resp = this.respPhase(t);
      if (k === 'abp' && S.ABP) return S.ABP.value(this, t);
      if (k === 'pleth' || k === 'abp') {
        if (p.arrested && this.eng.flags.cpr) { const c = Math.max(0, Math.sin(t * 2 * Math.PI * 1.85)); return k === 'abp' ? 10 + c * 45 : c * 0.35; }
        if (p.arrested) return k === 'abp' ? 6 : 0;
        if (['vf', 'asystole', 'pea'].includes(rhythm) || p.map < 18) return k === 'abp' ? (p.map < 18 ? clamp(p.map, 0, 18) : 10) + Math.random() * 0.4 : 0;
        const delay = k === 'abp' ? 0.12 : 0.22;
        const [bb, nbb] = this.beatAt(t - delay);
        if (bb == null) return k === 'abp' ? p.dbp : 0;
        const b = bb.q, rr = (nbb ? nbb.q : b + this.rrNow()) - b;
        const x = (t - delay - b) / Math.max(0.3, Math.min(rr, 1.1));
        // respiratory variation: hypovolaemia (ventilated) / pulsus paradoxus (tamponade)
        let mod = 1;
        if (p.ventilated) mod = 1 - clamp((1.05 - p.preload) * 0.45, 0.02, 0.25) * resp;
        if (p.pulsus) mod = 1 - p.pulsus * resp;
        const ect = bb.type === 'pvc' ? 0.4 : rr < 0.45 * this.rrNow() ? 0.5 : 1; // premature beats eject little
        const svrN = (p.svr || 1100) / ((p.svrScale || 1) * 1100);
        if (k === 'abp') return p.dbp + (p.sbp - p.dbp) * mod * ect * abpShape(x, svrN, p.contractEff || 1);
        const amp = clamp((p.sv / 70 / (p.svScale || 1)) * Math.pow(1 / Math.max(0.3, svrN), 0.7) * (1 - 0.5 * (p.sym || 0)), 0.06, 1.4);
        const noise = amp < 0.25 ? (0.25 - amp) * 0.8 * (Math.sin(t * 23) * 0.6 + Math.sin(t * 61) * 0.4) : 0;
        return amp * mod * ect * plethShape(x) + noise;
      }
      if (this.kind === 'gas' && this.eng.ga && !this.eng.ga.circuit) return 0; // nothing connected to the breathing circuit yet
      if (k === 'paw' || k === 'flow') return this.vent(k, t);
      if (k === 'co2') {
        if (!S.Capno) return 0;
        let x = Math.min(1, (t - this.breathStart) / this.breathLen);
        if (x < 0) x = 1; // look-ahead scheduling: still in the previous expiration
        return S.Capno.value(this.eng, x, t);
      }
      return 0;
    }
    // Airway pressure (cmH₂O) and flow (L/min) at the Y-piece
    vent(k, t) {
      const e = this.eng, p = e.p;
      const len = this.breathLen || 4;
      let x = (t - this.breathStart) / len; if (x < 0 || x > 1) x = ((x % 1) + 1) % 1;
      const tb = x * len; // seconds into this breath
      const peep = p.peep || 0, auto = p.autoPEEP || 0;
      if (p.ventilated && !p.ventStopped && p.tubeOK !== false) {
        const ie = { '1:1': 1, '1:2': 2, '1:3': 3, '1:4': 4 }[p.ventIE || '1:2'] || 2;
        const Ti = Math.min(len / (1 + ie), 2.5), pc = p.ventMode === 'PCV';
        const ppk = Math.max(peep + 4, p.paw || 20), ppl = Math.max(peep + 2, Math.min(ppk, p.pplat || ppk - 4));
        const vt = (p.vtDel || 450) / 1000;
        const R = Math.max(0.05, (ppk - ppl) / Math.max(0.1, vt / Ti)) / 60; // cmH₂O per L/min
        const tauE = clamp(0.25 + auto * 0.12 + (ppk - ppl) * 0.02, 0.2, 1.6);
        if (tb < Ti) {
          if (pc) { // pressure control: square pressure, decelerating flow
            const pi = (p.pinsp || 16) + peep;
            const pr = peep + (pi - peep) * (1 - Math.exp(-tb / 0.05));
            const tauI = clamp(Ti / 3.5 * (1 + (ppk - ppl) / 20), 0.1, 1.2);
            const f0 = (vt / (tauI / 60)) / Math.max(0.2, 1 - Math.exp(-Ti / tauI));
            return k === 'paw' ? pr : Math.min(120, f0 * Math.exp(-tb / tauI));
          }
          // volume control: constant flow, pressure ramps to peak then an end-inspiratory pause to plateau
          const flowI = (vt / (Ti * 0.85)) * 60; // L/min over the flow period (last 15% is the pause)
          const tf = Ti * 0.85;
          if (tb < tf) return k === 'paw' ? peep + auto * 0.6 + (ppk - ppl) * (1 - Math.exp(-tb / 0.03)) + (ppl - peep - auto * 0.6) * (tb / tf) : flowI * (1 - Math.exp(-tb / 0.02));
          return k === 'paw' ? ppl + (ppk - ppl) * Math.exp(-(tb - tf) / 0.04) : flowI * Math.exp(-(tb - tf) / 0.015);
        }
        const te = tb - Ti;
        const pe = peep + auto + (ppl - peep - auto) * Math.exp(-te / (tauE * 0.6));
        const fe = -(vt * 60 / tauE) * Math.exp(-te / tauE) * 0.9;
        const endF = auto > 1 ? -(vt * 60 / tauE) * 0.12 * clamp(auto / 6, 0, 1) : 0; // flow still going at the end of expiration = gas trapping
        return k === 'paw' ? pe : Math.min(fe, endF);
      }
      // spontaneous breathing (face mask / SGA / tube on circuit) or apnoea
      const effort = p.arrested ? 0 : (p.V || 0);
      const base = p.ventilated ? peep : 0; // spontaneous on the circuit: APL open, ~0 cmH₂O
      if (effort < 0.05 || !(p.sga || p.assisted || e.ga)) return k === 'paw' ? base : 0;
      const ti = Math.min(len * 0.4, 1.6);
      const amp = clamp(effort, 0.2, 1.4);
      if (tb < ti) { const s = Math.sin(Math.PI * tb / ti); return k === 'paw' ? base - 2.2 * amp * s : 30 * amp * s; }
      const te = tb - ti, s = Math.sin(Math.PI * Math.min(1, te / Math.max(0.4, (len - ti) * 0.6)));
      return k === 'paw' ? base + 1.2 * amp * s : -26 * amp * s;
    }
    respPhase(t) { const len = this.breathLen || 4; const x = ((t - this.breathStart) / len) % 1; return x < 0.35 ? Math.sin((x / 0.35) * Math.PI / 2) : Math.cos(((x - 0.35) / 0.65) * Math.PI / 2); }

    frame(dt) {
      const ctx = this.ctx, p = this.eng.p;
      { const tgt = [80, 120, 160, 200, 240].find((x) => x >= p.sbp * 1.12) || 240; // auto-scale the ABP channel (with hysteresis)
        if (!this.abpScale || tgt > this.abpScale || p.sbp * 1.3 < this.abpScale) this.abpScale = tgt; }
      if (p.noMonitor && this.kind !== 'gas') {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
        ctx.fillStyle = '#9aa'; ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.noMonitor === true ? 'No monitor — you only have your eyes, ears and hands' : String(p.noMonitor), this.W / 2, this.H / 2 - 8);
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('Look, listen and feel. Use the Examine tab.', this.W / 2, this.H / 2 + 16);
        ctx.textAlign = 'left'; this.x = 0; this.last = {}; this.cx = {}; return;
      }
      if (p.monitorOff) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
        ctx.fillStyle = '#ff5c5c'; ctx.font = '700 18px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('NO POWER — monitor off', this.W / 2, this.H / 2 - 8);
        ctx.fillStyle = '#9aa'; ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('Feel a pulse, check BP manually, or connect a battery monitor', this.W / 2, this.H / 2 + 16);
        ctx.textAlign = 'left'; this.x = 0; this.last = {}; this.cx = {}; return;
      }
      dt = Math.min(dt, 0.1);
      const chs = this.channels();
      const rowH = this.H / chs.length;
      // Each channel sweeps at its own speed (ECG/ABP/pleth ~10 s per screen, capnography slower so several breaths fit)
      this.cx = this.cx || {};
      const adv = chs.map((c) => { const x0 = this.cx[c.k] != null ? this.cx[c.k] : 0; return { c, x0, nx: x0 + (this.waveW / this.sweep(c.k)) * dt }; });
      ctx.fillStyle = '#000';
      adv.forEach(({ x0, nx }, ci) => {
        const top = ci * rowH, er = (a, b) => ctx.fillRect(a, top, b - a, rowH);
        if (nx + 14 <= this.waveW) er(x0 + 1, nx + 14); else { er(x0 + 1, this.waveW); er(0, (nx + 14) - this.waveW); }
      });
      const steps = Math.max(1, Math.ceil(Math.max(...adv.map((a) => a.nx - a.x0))));
      for (let i = 1; i <= steps; i++) {
        const tt = this.tm + (dt * i) / steps;
        this.tm2 = tt;
        this.scheduleTo(tt);
        adv.forEach(({ c, x0, nx }, ci) => {
          const xx = x0 + ((nx - x0) * i) / steps;
          const v = this.value(c.k, tt);
          const top = ci * rowH;
          let y;
          if (c.k === 'ecg') y = top + rowH * 0.62 - v * rowH * 0.42 * (p.ecgGain || 1);
          else if (c.k === 'abp') y = top + rowH * 0.94 - (clamp(v, 0, this.abpScale * 1.1) / this.abpScale) * rowH * 0.82;
          else if (c.k === 'pleth') y = top + rowH * 0.85 - v * rowH * 0.6;
          else if (c.k === 'paw') y = top + rowH * 0.9 - (clamp(v, -10, 50) / 40) * rowH * 0.78;
          else if (c.k === 'flow') y = top + rowH * 0.5 - (clamp(v, -80, 80) / 80) * rowH * 0.42;
          else y = top + rowH * 0.9 - (clamp(v, 0, 10) / 10) * rowH * 0.8; // CO₂ scale 0–10 kPa
          const px = xx % this.waveW;
          const last = this.last[c.k];
          ctx.strokeStyle = c.col; ctx.lineWidth = 1.6;
          if (last && px > last[0] && px - last[0] < 30) { ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(px, y); ctx.stroke(); }
          this.last[c.k] = [px, y];
        });
      }
      this.tm += dt;
      adv.forEach(({ c, nx }) => { this.cx[c.k] = nx >= this.waveW ? nx - this.waveW : nx; });
      // labels / grid lines
      ctx.font = '600 11px system-ui, sans-serif';
      chs.forEach((c, ci) => {
        ctx.fillStyle = '#000'; ctx.fillRect(2, ci * rowH + 2, c.k === 'co2' || c.k === 'abp' ? 80 : 46, 14);
        ctx.fillStyle = c.col; ctx.fillText(c.label + (c.k === 'co2' || c.k === 'abp' ? '  ⓘ guide' : ''), 4, ci * rowH + 13);
        if (c.k === 'abp') { ctx.fillStyle = '#000'; ctx.fillRect(this.waveW - 30, ci * rowH + 2, 28, 12); ctx.fillStyle = '#ff4d4d88'; ctx.fillText(String(this.abpScale), this.waveW - 28, ci * rowH + 12); }
      });
      if (this.eng.t - this.nibpAt >= this.nibpCycle && !p.artLine) this.measureNibp();
      this.drawNumerics(chs, rowH);
    }
    scheduleTo(tt) { const save = this.tm; this.tm = tt; this.schedule(); this.tm = save; }

    drawNumerics(chs, rowH) {
      const ctx = this.ctx, p = this.eng.p, x0 = this.waveW + 4, w = this.W - x0;
      ctx.fillStyle = '#05070a'; ctx.fillRect(this.waveW, 0, this.W - this.waveW, this.H);
      ctx.fillStyle = '#1a1f26'; ctx.fillRect(this.waveW, 0, 2, this.H);
      const blink = Math.floor(performance.now() / 500) % 2 === 0;
      const arrest = ['vf', 'asystole'].includes(p.rhythm);
      const items = [];
      if (this.kind === 'gas') { this.gasItems(items); this.drawItems(items, x0, w, blink); return; }
      const hr = arrest ? '---' : p.rhythm === 'pea' ? p.hr : p.hr;
      items.push({ lab: 'HR', val: String(hr), col: '#39ff6a', alarm: p.hr < (p.hrAlarm || [45])[0] || p.hr > (p.hrAlarm || [0, 140])[1] || arrest || p.arrested, unit: 'bpm' });
      if (p.artLine) {
        const rd = S.ABP ? S.ABP.readings(this) : { s: p.sbp, d: p.dbp, m: p.map }, pv = S.ABP ? S.ABP.ppv(this.eng) : null;
        items.push({ lab: 'ABP', val: p.map < 18 ? '--/--' : `${Math.round(rd.s)}/${Math.round(rd.d)}`, sub: `(${Math.round(rd.m)})${pv != null ? '  PPV ' + pv + '%' : ''}`, col: '#ff4d4d', alarm: p.map < 60 || p.sbp > 180 });
      }
      const nb = this.nibp;
      const ago = Math.round(this.eng.t - this.nibpAt);
      items.push({ lab: 'NIBP', val: nb && nb.s ? `${nb.s}/${nb.d}` : '--/--', sub: nb && nb.m ? `(${nb.m})  ${ago}s ago` : `${ago}s ago`, col: '#f5f5f5', alarm: nb && nb.m != null && nb.m < 60, small: p.artLine });
      const lowPerf = p.map < 40 || ['vf', 'asystole', 'pea'].includes(p.rhythm);
      items.push({ lab: 'SpO₂', val: lowPerf ? '?' : String(p.spo2), col: '#3ee6ff', alarm: p.spo2 < 90 || lowPerf, unit: '%' });
      const fico2 = S.Capno ? S.Capno.params(this.eng).base : 0;
      if (!this.noCo2) items.push({ lab: 'EtCO₂', val: (p.etco2 / 7.5).toFixed(1), sub: fico2 > 0.2 ? `FiCO₂ ${fico2.toFixed(1)} · RR ${p.rr}` : `RR ${p.rr}`, col: '#ffe14d', alarm: p.rr < 6 || p.rr > 30 || fico2 > 0.5, unit: 'kPa' });
      items.push({ lab: 'Temp', val: p.temp.toFixed(1), col: '#e0a3ff', alarm: p.temp > 38.5 || p.temp < 35, unit: '°C', small: true });
      const g = this.eng.ga;
      if (g && S.GA) {
        const mac = S.GA.macAge(p);
        if (!this.noCo2 && (g.dial > 0 || g.et > 0.05)) items.push({ lab: 'Sevo', val: g.et.toFixed(1), sub: `Fi ${g.fi.toFixed(1)} · MAC ${(g.et / mac).toFixed(1)}`, col: '#ffffff', unit: '% Et', small: true, alarm: g.et / mac > 2 });
        if (g.monitors.bis) items.push({ lab: 'BIS', val: String(Math.round(g.bis)), col: '#9effd1', small: true, alarm: g.phase === 'maintenance' && g.bis > 60 });
        if (g.monitors.nmt) { const t = S.GA.tof(g); items.push({ lab: 'TOF', val: t.count < 4 ? `${t.count}/4` : `${Math.round(t.ratio * 100)}%`, sub: t.count < 4 ? 'count' : 'ratio', col: '#c9b6ff', small: true }); }
      }
      if (p.cvc) items.push({ lab: 'CVP', val: String(Math.round(p.cvp)), col: '#7aa7ff', unit: 'mmHg', small: true });
      this.drawItems(items, x0, w, blink);
    }
    drawItems(items, x0, w, blink) {
      const ctx = this.ctx;
      const h = this.H / items.length;
      items.forEach((it, i) => {
        const y = i * h;
        if (it.alarm && blink) { ctx.fillStyle = 'rgba(220,30,30,.35)'; ctx.fillRect(x0, y + 2, w - 6, h - 4); }
        ctx.fillStyle = it.col;
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(it.lab + (it.unit ? '  ' + it.unit : ''), x0 + 4, y + 13);
        const fs = Math.min(h * (it.small ? 0.42 : 0.55), w * (it.val.length > 5 ? 0.17 : 0.28));
        ctx.font = `700 ${fs}px "SF Mono", ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(it.val, this.W - 8, y + h * 0.42 + fs * 0.42);
        if (it.sub && h > 36) { ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(it.sub, this.W - 8, y + h - 5); }
        ctx.textAlign = 'left';
      });
    }
    gasItems(items) {
      const e = this.eng, p = e.p, g = e.ga;
      if (g && !g.circuit) {
        items.push({ lab: 'EtCO₂', val: '--', sub: 'not connected to the circuit', col: '#ffe14d', unit: 'kPa' });
        items.push({ lab: 'Paw', val: '--', col: '#ffb347', unit: 'cmH₂O', small: true }, { lab: 'Vte', val: '--', col: '#7cffb2', unit: 'mL', small: true });
        items.push({ lab: 'O₂', val: 'air', sub: `FGF ${(g.fgf || 0).toFixed(1)} L/min`, col: '#f5f5f5', unit: 'Fi/Et %', small: true });
        return;
      }
      const fico2 = S.Capno ? S.Capno.params(e).base : 0;
      items.push({ lab: 'EtCO₂', val: (p.etco2 / 7.5).toFixed(1), sub: `FiCO₂ ${fico2.toFixed(1)} · RR ${p.rr}`, col: '#ffe14d', alarm: p.rr < 6 || fico2 > 0.5 || (p.ventilated && p.etco2 < 7.5), unit: 'kPa' });
      if (p.ventilated) items.push({ lab: 'Paw', val: `${Math.round(p.paw)}/${Math.round(p.peep + (p.autoPEEP || 0))}`, sub: `Pplat ${p.pplat != null ? p.pplat : '—'} · ${p.ventMode || 'VCV'}`, col: '#ffb347', unit: 'peak/PEEP', alarm: p.paw > 35 || p.pplat > 30 });
      else items.push({ lab: 'Paw', val: '0', sub: p.V > 0.05 ? 'spontaneous' : 'no breaths', col: '#ffb347', unit: 'cmH₂O', small: true, alarm: !(p.V > 0.05) && !p.arrested });
      const vt = p.ventilated ? p.vtDel : Math.round((p.V || 0) * 450);
      items.push({ lab: 'Vte', val: String(vt || 0), sub: `MV ${p.ventilated ? (p.mv || 0).toFixed(1) : ((p.rr * (vt || 0)) / 1000).toFixed(1)} L/min`, col: '#7cffb2', unit: 'mL', small: true });
      if (!g) items.push({ lab: 'FiO₂', val: String(Math.round(p.fio2 * 100)), col: '#f5f5f5', unit: '%', small: true });
      if (g) {
        items.push({ lab: 'O₂', val: g.circuit ? `${Math.round(p.fio2 * 100)}/${Math.round((g.eto2 || 0) * 100)}` : 'air', sub: `FGF ${(g.fgf || 0).toFixed(1)} L/min`, col: '#f5f5f5', unit: 'Fi/Et %', small: true, alarm: g.circuit && p.fio2 < 0.25 });
        if (S.GA) { const mac = S.GA.macAge(p); items.push({ lab: 'Sevo', val: `${(g.fi || 0).toFixed(1)}/${(g.et || 0).toFixed(1)}`, sub: `MAC ${((g.et || 0) / mac).toFixed(1)}`, col: '#d9b3ff', unit: 'Fi/Et %', small: true, alarm: g.et / mac > 2 }); }
      }
    }
  }
  S.Monitor = Monitor;
})();
