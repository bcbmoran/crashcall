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
    constructor(canvas, eng) {
      this.c = canvas; this.ctx = canvas.getContext('2d'); this.eng = eng;
      this.tm = 0; this.x = 0; this.gen = new S.RhythmGen(); this.morph = S.ecgMorph(eng.p); this.morphAt = -1;
      this.breathStart = 0; this.nextBreath = 1;
      this.last = {}; this.nibp = null; this.nibpAt = -999; this.nibpCycle = 30;
      this.sound = false; this.actx = null;
      this.resize();
      this.measureNibp();
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.W = Math.max(300, r.width); this.H = Math.max(200, r.height);
      this.c.width = this.W * dpr; this.c.height = this.H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.W, this.H);
      this.x = 0; this.last = {};
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
      const p = this.eng.p, ch = [{ k: 'ecg', col: '#39ff6a', label: 'II' }];
      if (p.artLine) ch.push({ k: 'abp', col: '#ff4d4d', label: 'ABP' });
      ch.push({ k: 'pleth', col: '#3ee6ff', label: 'Pleth' });
      ch.push({ k: 'co2', col: '#ffe14d', label: 'CO₂' });
      return ch;
    }
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
      if (k === 'co2') {
        if (p.rr < 1 || p.etco2 < 0.5) return 0;
        let x = Math.min(1, (t - this.breathStart) / this.breathLen);
        if (x < 0) x = 1; // look-ahead scheduling: still in the previous expiration
        const et = p.etco2 / 7.5;
        const insp = 0.33;
        if (x < insp) return x < 0.04 ? et * (1 - x / 0.04) : 0;
        const e = (x - insp) / (1 - insp);
        const b = p.bronchEff || 0;
        const ob = p.ventObstruct || 0;
        if (b > 0.15 || ob > 0.25) return et * clamp(Math.pow(e / 0.9, 0.5 + Math.max(b, ob)), 0, 1);
        let v = et * clamp(e / 0.08, 0, 1) * (0.94 + 0.06 * e);
        if (p.ventilated && p.effort > 0.3 && !this.eng.flags.paralysed) v -= et * 0.35 * g(e, 0.6, 0.05); // curare cleft: patient breathing
        return v;
      }
      return 0;
    }
    respPhase(t) { const len = this.breathLen || 4; const x = ((t - this.breathStart) / len) % 1; return x < 0.35 ? Math.sin((x / 0.35) * Math.PI / 2) : Math.cos(((x - 0.35) / 0.65) * Math.PI / 2); }

    frame(dt) {
      const ctx = this.ctx, p = this.eng.p;
      if (p.noMonitor) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
        ctx.fillStyle = '#9aa'; ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.noMonitor === true ? 'No monitor — you only have your eyes, ears and hands' : String(p.noMonitor), this.W / 2, this.H / 2 - 8);
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('Look, listen and feel. Use the Examine tab.', this.W / 2, this.H / 2 + 16);
        ctx.textAlign = 'left'; this.x = 0; this.last = {}; return;
      }
      if (p.monitorOff) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
        ctx.fillStyle = '#ff5c5c'; ctx.font = '700 18px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('NO POWER — monitor off', this.W / 2, this.H / 2 - 8);
        ctx.fillStyle = '#9aa'; ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('Feel a pulse, check BP manually, or connect a battery monitor', this.W / 2, this.H / 2 + 16);
        ctx.textAlign = 'left'; this.x = 0; this.last = {}; return;
      }
      dt = Math.min(dt, 0.1);
      const speed = this.waveW / 6; // 6 s per sweep
      const chs = this.channels();
      const rowH = this.H / chs.length;
      const nx = this.x + speed * dt;
      // erase ahead
      ctx.fillStyle = '#000';
      const erase = (x0, x1) => ctx.fillRect(x0, 0, x1 - x0, this.H);
      if (nx + 14 <= this.waveW) erase(this.x + 1, nx + 14);
      else { erase(this.x + 1, this.waveW); erase(0, (nx + 14) - this.waveW); }
      const steps = Math.max(1, Math.ceil(nx - this.x));
      for (let i = 1; i <= steps; i++) {
        const xx = this.x + ((nx - this.x) * i) / steps;
        const tt = this.tm + (dt * i) / steps;
        this.tm2 = tt;
        this.scheduleTo(tt);
        chs.forEach((c, ci) => {
          const v = this.value(c.k, tt);
          const top = ci * rowH;
          let y;
          if (c.k === 'ecg') y = top + rowH * 0.62 - v * rowH * 0.42 * (p.ecgGain || 1);
          else if (c.k === 'abp') y = top + rowH * 0.92 - (clamp(v, 0, 200) / 160) * rowH * 0.85;
          else if (c.k === 'pleth') y = top + rowH * 0.85 - v * rowH * 0.6;
          else y = top + rowH * 0.9 - (clamp(v, 0, 12) / 8) * rowH * 0.75;
          let px = xx % this.waveW;
          const last = this.last[c.k];
          ctx.strokeStyle = c.col; ctx.lineWidth = 1.6;
          if (last && px > last[0] && px - last[0] < 30) { ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(px, y); ctx.stroke(); }
          this.last[c.k] = [px, y];
        });
      }
      this.tm += dt;
      this.x = nx >= this.waveW ? nx - this.waveW : nx;
      // labels / grid lines
      ctx.font = '600 11px system-ui, sans-serif';
      chs.forEach((c, ci) => {
        ctx.fillStyle = '#000'; ctx.fillRect(2, ci * rowH + 2, 46, 14);
        ctx.fillStyle = c.col; ctx.fillText(c.label, 4, ci * rowH + 13);
        if (c.k === 'abp') { ctx.fillStyle = '#000'; ctx.fillRect(this.waveW - 30, ci * rowH + 2, 28, 12); ctx.fillStyle = '#ff4d4d88'; ctx.fillText('160', this.waveW - 28, ci * rowH + 12); }
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
      const hr = arrest ? '---' : p.rhythm === 'pea' ? p.hr : p.hr;
      items.push({ lab: 'HR', val: String(hr), col: '#39ff6a', alarm: p.hr < (p.hrAlarm || [45])[0] || p.hr > (p.hrAlarm || [0, 140])[1] || arrest || p.arrested, unit: 'bpm' });
      if (p.artLine) {
        items.push({ lab: 'ABP', val: p.map < 18 ? '--/--' : `${Math.round(p.sbp)}/${Math.round(p.dbp)}`, sub: `(${Math.round(p.map)})`, col: '#ff4d4d', alarm: p.map < 60 || p.sbp > 180 });
      }
      const nb = this.nibp;
      const ago = Math.round(this.eng.t - this.nibpAt);
      items.push({ lab: 'NIBP', val: nb && nb.s ? `${nb.s}/${nb.d}` : '--/--', sub: nb && nb.m ? `(${nb.m})  ${ago}s ago` : `${ago}s ago`, col: '#f5f5f5', alarm: nb && nb.m != null && nb.m < 60, small: p.artLine });
      const lowPerf = p.map < 40 || ['vf', 'asystole', 'pea'].includes(p.rhythm);
      items.push({ lab: 'SpO₂', val: lowPerf ? '?' : String(p.spo2), col: '#3ee6ff', alarm: p.spo2 < 90 || lowPerf, unit: '%' });
      items.push({ lab: 'EtCO₂', val: (p.etco2 / 7.5).toFixed(1), sub: `RR ${p.rr}`, col: '#ffe14d', alarm: p.rr < 6 || p.rr > 30, unit: 'kPa' });
      items.push({ lab: 'Temp', val: p.temp.toFixed(1), col: '#e0a3ff', alarm: p.temp > 38.5 || p.temp < 35, unit: '°C', small: true });
      if (p.cvc) items.push({ lab: 'CVP', val: String(Math.round(p.cvp)), col: '#7aa7ff', unit: 'mmHg', small: true });
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
  }
  S.Monitor = Monitor;
})();
