/* Imaging viewer.
 * - CXR, CT and ultrasound: real, openly-licensed images/clips from Wikimedia Commons (see media.js),
 *   shown with author and licence attribution.
 * - 12-lead ECG: generated live from the simulated patient's rhythm and morphology. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const I = (S.Imaging = {});

  function mediaHTML(key) {
    const m = S.mediaInfo(key);
    if (!m) return '<div class="no-img">No openly-licensed example image is available for this finding — see the report.</div>';
    const viewer = m.video
      ? `<video class="med-video" autoplay loop muted playsinline controls preload="auto">${m.video.map((v) => `<source src="${v.src}" type="${v.type}">`).join('')}</video>`
      : `<img class="med-img" src="${m.img}" alt="${esc(m.d)}" loading="eager" referrerpolicy="no-referrer">`;
    return `<figure class="med">${viewer}<figcaption><b>Example image:</b> ${esc(m.d)}.<br><a href="${m.page}" target="_blank" rel="noopener">${esc(m.f)}</a> — ${esc(m.by)}, <a href="${m.lu}" target="_blank" rel="noopener">${esc(m.lic)}</a>, via Wikimedia Commons.</figcaption></figure>`;
  }
  I.mediaHTML = mediaHTML;

  // ============================== 12-LEAD ECG ==============================
  const LEADS = {
    I: { r: 0.7, s: 0.15 }, II: { r: 1, s: 0.2 }, III: { r: 0.45, s: 0.2 }, aVR: { r: 0.8, s: 0.2, inv: true }, aVL: { r: 0.4, s: 0.3 }, aVF: { r: 0.75, s: 0.2 },
    V1: { r: 0.25, s: 1.6, t: 0.4 }, V2: { r: 0.4, s: 1.7 }, V3: { r: 0.8, s: 0.9 }, V4: { r: 1.4, s: 0.5 }, V5: { r: 1.3, s: 0.25 }, V6: { r: 1.0, s: 0.12 },
  };
  function beatTimes(rhythm, rate, dur, seed) {
    let s = seed || 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const out = []; let t = 0.15; const rr = 60 / Math.max(rate, 10);
    while (t < dur) { out.push(t); t += rhythm === 'af' ? rr * (0.65 + rnd() * 0.7) : rr; }
    return out;
  }
  function ecgSVG(spec, eng) {
    const p = eng ? eng.p : { rhythm: 'sinus', hrTrue: 80, ecg: {} };
    const rhythm = spec.rhythm || p.rhythm, rate = spec.rate || Math.max(20, Math.round(p.hrTrue || 80));
    const base = Object.assign({}, p.ecg || {}, spec.morph || {});
    const W = 1000, H = 470, colW = 250, rowH = 100;
    const o = [`<svg viewBox="0 0 ${W} ${H}" class="img-svg ecg-svg"><defs><pattern id="sm" width="3.84" height="3.84" patternUnits="userSpaceOnUse"><path d="M3.84 0H0V3.84" fill="none" stroke="#f6c6c6" stroke-width=".4"/></pattern><pattern id="lg" width="19.2" height="19.2" patternUnits="userSpaceOnUse"><rect width="19.2" height="19.2" fill="url(#sm)"/><path d="M19.2 0H0V19.2" fill="none" stroke="#eaa" stroke-width=".8"/></pattern></defs><rect width="${W}" height="${H}" fill="#fff8f8"/><rect width="${W}" height="${H}" fill="url(#lg)"/>`];
    const pxPerSec = 96, mv = 38.4;
    const beats = beatTimes(rhythm, rate, 10.5, 11);
    const pbeats = rhythm === 'chb' ? beatTimes('sinus', 78, 10.5) : [];
    const leadVal = (lead, t, beatIdxForAlt) => {
      const L = LEADS[lead];
      if (rhythm === 'vf') return 0.4 * Math.sin(t * 31 + lead.length) * (0.6 + 0.4 * Math.sin(t * 2.3)) + 0.2 * Math.sin(t * 47);
      if (rhythm === 'asystole') return 0;
      let b = null, nb = null, bi = -1;
      for (let i = beats.length - 1; i >= 0; i--) if (beats[i] <= t) { b = beats[i]; nb = beats[i + 1]; bi = i; break; }
      let v = 0;
      if (b != null) {
        const st = (spec.st && spec.st[lead]) || 0;
        const tinv = spec.tinv && spec.tinv.includes(lead) ? -1 : 1;
        const m = Object.assign({}, base, { rAmp: L.r * (base.rAmp || 1), sAmp: L.s / 0.22 * 0.22 * (base.sAmp || 1) * 4.5, st: st, tPeak: (base.tPeak || 1) * (L.t || 1) * tinv });
        if (spec.s1q3t3) { if (lead === 'I') m.sAmp *= 3; if (lead === 'III') { m.tPeak = -1; m.qAmp = 1; } }
        v = S.ecgBeat(t - b, (nb || b + 60 / rate) - b, m, rhythm);
        if (spec.s1q3t3 && lead === 'III') v -= 0.25 * Math.exp(-Math.pow(t - b - 0.168, 2) / (2 * 0.008 * 0.008));
        if (spec.lowVolt) v *= 0.45;
        if (spec.alternans && bi % 2) v *= 0.6;
      }
      if (rhythm === 'chb') { for (let i = pbeats.length - 1; i >= 0; i--) if (pbeats[i] <= t) { v += 0.13 * Math.exp(-Math.pow(t - pbeats[i] - 0.08, 2) / (2 * 0.022 * 0.022)); break; } }
      if (rhythm === 'af') v += 0.03 * Math.sin(t * 37 + lead.length) + 0.02 * Math.sin(t * 53);
      return L.inv ? -v : v;
    };
    const grid = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
    grid.forEach((row, ri) => row.forEach((lead, ci) => {
      const x0 = ci * colW + 10, y0 = ri * rowH + 70, t0 = ci * 2.5;
      let d = '';
      for (let px = 0; px < colW - 12; px += 1.5) { const t = t0 + px / pxPerSec; d += (px === 0 ? 'M' : 'L') + (x0 + px).toFixed(1) + ' ' + (y0 - leadVal(lead, t) * mv).toFixed(1); }
      o.push(`<path d="${d}" stroke="#111" stroke-width="1.3" fill="none"/><text x="${x0 + 4}" y="${y0 - 30}" font-size="13" font-family="Arial" fill="#222">${lead}</text>`);
    }));
    let d = '';
    for (let px = 0; px < W - 20; px += 1.5) { const t = px / pxPerSec; d += (px === 0 ? 'M' : 'L') + (10 + px).toFixed(1) + ' ' + (410 - leadVal('II', t) * mv).toFixed(1); }
    o.push(`<path d="${d}" stroke="#111" stroke-width="1.3" fill="none"/><text x="14" y="372" font-size="13" font-family="Arial">II</text>`);
    o.push(`<text x="10" y="22" font-size="13" font-family="Arial" fill="#333">25 mm/s  10 mm/mV   Rate ≈ ${rhythm === 'vf' || rhythm === 'asystole' ? '—' : rate} /min</text></svg>`);
    return o.join('');
  }

  I.mount = function (el, spec, eng) {
    if (spec.kind === 'ecg') { el.innerHTML = ecgSVG(spec, eng); return () => {}; }
    el.innerHTML = mediaHTML(spec.media);
    const v = el.querySelector('video');
    if (v) { v.play && v.play().catch(() => {}); return () => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } }; }
    const img = el.querySelector('img');
    if (img) img.onerror = () => { el.innerHTML = '<div class="no-img">Image could not be loaded (are you offline?). See the report.</div>'; };
    return () => {};
  };
})();
