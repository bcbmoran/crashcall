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
  // Generated from the same vector model as the monitor (ecg.js), from a snapshot of the patient taken
  // when the ECG was recorded, so the tracing and its report always agree.
  I.ecgSnapshot = function (eng, spec) {
    const p = Object.assign({}, eng.p);
    p.ecg = Object.assign({}, eng.p.ecg || {});
    if (spec && spec.s1q3t3) p.ecg.s1q3t3 = true;
    if (spec && spec.lowVolt) p.ecg.lowVolt = true;
    if (spec && spec.morph) Object.assign(p.ecg, spec.morph);
    return { p, flags: Object.assign({}, eng.flags), fine: clamp(1 - (eng.arrestT || 0) / 240, 0.3, 1) };
  };
  function ecgSVG(spec, eng) {
    const snap = spec.snap || (eng ? I.ecgSnapshot(eng, spec) : { p: { rhythm: 'sinus', hrTrue: 75, ecg: {} }, flags: {} });
    const p = snap.p, M = S.ecgMorph(p);
    const gen = new S.RhythmGen(12345);
    gen.advance(10.6, p, M, true);
    const W = 1000, H = 470, colW = 250, rowH = 100;
    const o = [`<svg viewBox="0 0 ${W} ${H}" class="img-svg ecg-svg"><defs><pattern id="sm" width="3.84" height="3.84" patternUnits="userSpaceOnUse"><path d="M3.84 0H0V3.84" fill="none" stroke="#f6c6c6" stroke-width=".4"/></pattern><pattern id="lg" width="19.2" height="19.2" patternUnits="userSpaceOnUse"><rect width="19.2" height="19.2" fill="url(#sm)"/><path d="M19.2 0H0V19.2" fill="none" stroke="#eaa" stroke-width=".8"/></pattern></defs><rect width="${W}" height="${H}" fill="#fff8f8"/><rect width="${W}" height="${H}" fill="url(#lg)"/>`];
    const pxPerSec = 96, mv = 38.4; // 25 mm/s, 10 mm/mV
    const leadVal = (lead, t) => {
      const opts = { M, fine: snap.fine, tinv: !!(spec.tinv && spec.tinv.includes(lead)) };
      if (spec.st) opts.st = spec.st[lead] || 0;
      return S.ecgLead(S.ECG_LEADS[lead], t, gen, p, opts) + S.ecgArtefact(t, p, snap.flags, M);
    };
    const cal = (x0, y0) => `<path d="M${x0} ${y0} h3 v-${mv} h9.6 v${mv} h3" stroke="#111" stroke-width="1.2" fill="none"/>`;
    const grid = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
    grid.forEach((row, ri) => row.forEach((lead, ci) => {
      const x0 = ci * colW + 10, y0 = ri * rowH + 80, t0 = ci * 2.5;
      let d = '';
      for (let px = 0; px < colW - 12; px += 1.2) { const t = t0 + px / pxPerSec; d += (px === 0 ? 'M' : 'L') + (x0 + px).toFixed(1) + ' ' + (y0 - clamp(leadVal(lead, t), -1.9, 1.9) * mv).toFixed(1); }
      o.push(`<path d="${d}" stroke="#111" stroke-width="1.2" fill="none" stroke-linejoin="round"/><text x="${x0 + 4}" y="${y0 - 40}" font-size="13" font-family="Arial" fill="#222">${lead}</text>`);
      if (ci) o.push(`<path d="M${x0 - 1} ${y0 - 8} v16" stroke="#111" stroke-width="1"/>`);
    }));
    let d = '';
    for (let px = 0; px < W - 40; px += 1.2) { const t = px / pxPerSec; d += (px === 0 ? 'M' : 'L') + (28 + px).toFixed(1) + ' ' + (420 - clamp(leadVal('II', t), -1.3, 1.3) * mv).toFixed(1); }
    o.push(cal(8, 420), `<path d="${d}" stroke="#111" stroke-width="1.2" fill="none" stroke-linejoin="round"/><text x="32" y="378" font-size="13" font-family="Arial">II (rhythm strip)</text>`);
    const hr = Math.round(p.hrTrue || 0);
    o.push(`<text x="10" y="22" font-size="13" font-family="Arial" fill="#333">25 mm/s  10 mm/mV   Ventricular rate ≈ ${['vf', 'asystole'].includes(p.rhythm) || hr <= 5 ? '—' : hr} /min</text></svg>`);
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
