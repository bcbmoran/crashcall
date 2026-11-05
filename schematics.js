/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Physiology hint schematics: mechanism flowchart, live circulation model, Frank–Starling plot, shock profiles. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const H = (S.Schematics = {});

  function wrap(text, n) {
    const words = String(text).split(' '); const lines = []; let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  // ---- 1. Mechanism flowchart ----
  H.mechanism = function (scn) {
    const steps = (scn.hint && scn.hint.steps) || [];
    const W = 640, bw = 380, x0 = 30;
    let y = 20; const o = [];
    steps.forEach((st, i) => {
      const s = typeof st === 'string' ? { t: st } : st;
      const lines = wrap(s.t, 52);
      const h = 18 + lines.length * 17;
      const fill = s.kind === 'cause' ? 'var(--sch-cause)' : s.kind === 'end' ? 'var(--sch-end)' : 'var(--sch-box)';
      o.push(`<rect x="${x0}" y="${y}" width="${bw}" height="${h}" rx="10" fill="${fill}" stroke="var(--sch-stroke)"/>`);
      lines.forEach((ln, li) => o.push(`<text x="${x0 + bw / 2}" y="${y + 22 + li * 17}" text-anchor="middle" class="sch-t">${esc(ln)}</text>`));
      if (s.rx) {
        const rl = wrap(s.rx, 26);
        o.push(`<path d="M ${x0 + bw} ${y + h / 2} H ${x0 + bw + 28}" stroke="var(--sch-rx)" stroke-width="2" marker-end="url(#arrRx)"/>`);
        o.push(`<rect x="${x0 + bw + 30}" y="${y + h / 2 - 10 - (rl.length - 1) * 8}" width="196" height="${12 + rl.length * 16}" rx="8" fill="var(--sch-rx-bg)" stroke="var(--sch-rx)"/>`);
        rl.forEach((ln, li) => o.push(`<text x="${x0 + bw + 128}" y="${y + h / 2 + 5 - (rl.length - 1) * 8 + li * 16}" text-anchor="middle" class="sch-rx">${esc(ln)}</text>`));
      }
      y += h;
      if (i < steps.length - 1) { o.push(`<path d="M ${x0 + bw / 2} ${y + 2} V ${y + 22}" stroke="var(--sch-stroke)" stroke-width="2" marker-end="url(#arr)"/>`); y += 26; }
    });
    return `<svg viewBox="0 0 ${W} ${y + 20}" class="sch-svg"><defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--sch-stroke)"/></marker><marker id="arrRx" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--sch-rx)"/></marker></defs>${o.join('')}</svg>`;
  };

  // ---- 2. Live circulation model ----
  H.circulation = function (eng, scn) {
    const p = eng.p;
    const svrN = clamp(p.svr / 1100, 0.2, 3);
    const pipeW = clamp(26 / Math.sqrt(svrN), 8, 52); // narrower pipe = higher resistance
    const tank = clamp(p.vol * (p.preload / Math.max(p.vol, 0.1)), 0.1, 1.5); // effective preload
    const tankH = clamp(tank / 1.4, 0.05, 1) * 110;
    const pump = clamp(p.contractEff, 0.1, 2);
    const heartR = 50 + 10 * clamp(1 / pump - 1, -0.5, 1);
    const heartCol = pump < 0.6 ? '#c55' : pump > 1.3 ? '#e36b2c' : '#d0473f';
    const obst = p.obstruct > 0.05;
    const leak = p.leak > 0.001 || (scn.hint && scn.hint.leak);
    const bleed = p.bleed > 0.0001;
    const o = [];
    o.push(`<svg viewBox="0 0 640 380" class="sch-svg">`);
    // arterial pipe (top)
    o.push(`<path d="M 360 150 C 420 80, 500 70, 560 110" stroke="#d9534f" stroke-width="${pipeW}" fill="none" stroke-linecap="round" opacity=".85"/>`);
    o.push(`<text x="630" y="52" text-anchor="end" class="sch-t">Arteries / arterioles</text><text x="630" y="68" text-anchor="end" class="sch-small">SVR ${Math.round(p.svr)} dyn·s·cm⁻⁵</text>`);
    // capillaries box
    o.push(`<rect x="545" y="110" width="70" height="140" rx="12" fill="var(--sch-box)" stroke="var(--sch-stroke)"/><text x="580" y="185" text-anchor="middle" class="sch-t" transform="rotate(90 580 180)">Tissues</text>`);
    if (leak) for (let i = 0; i < 4; i++) o.push(`<path d="M ${560 + i * 14} 252 q -4 10 0 16 q 4 -6 0 -16" fill="#6aa6e6"><animate attributeName="opacity" values="1;0.2;1" dur="${1.2 + i * 0.3}s" repeatCount="indefinite"/></path>`);
    if (leak) o.push(`<text x="580" y="290" text-anchor="middle" class="sch-small">capillary leak</text>`);
    // veins back to tank (bottom)
    o.push(`<path d="M 560 250 C 500 320, 260 330, 190 300" stroke="#4a6fd1" stroke-width="24" fill="none" stroke-linecap="round" opacity=".7"/>`);
    // venous reservoir tank
    o.push(`<rect x="40" y="200" width="120" height="120" rx="10" fill="none" stroke="var(--sch-stroke)" stroke-width="2"/>`);
    o.push(`<rect x="42" y="${318 - tankH}" width="116" height="${tankH}" rx="8" fill="#4a6fd1" opacity=".75"/>`);
    o.push(`<text x="100" y="342" text-anchor="middle" class="sch-t">Venous reservoir</text><text x="100" y="358" text-anchor="middle" class="sch-small">effective preload ${Math.round(tank * 100)}% · CVP ${Math.round(p.cvp)}</text>`);
    if (bleed) o.push(`<path d="M 120 322 q -5 14 0 22 q 5 -8 0 -22" fill="#b5161f"><animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite"/></path><text x="150" y="375" class="sch-small" fill="#b5161f">haemorrhage</text>`);
    // tank → heart
    o.push(`<path d="M 160 240 C 210 240, 220 190, 250 180" stroke="#4a6fd1" stroke-width="20" fill="none" opacity=".7"/>`);
    // lungs
    o.push(`<ellipse cx="300" cy="60" rx="70" ry="38" fill="${p.spo2 < 90 ? '#c8a2c8' : '#f3c1c1'}" stroke="var(--sch-stroke)"/><text x="300" y="58" text-anchor="middle" class="sch-t">Lungs</text><text x="300" y="75" text-anchor="middle" class="sch-small">SpO₂ ${p.spo2}% · FiO₂ ${p.fio2.toFixed(2)}</text>`);
    o.push(`<path d="M 270 135 V 100 M 330 100 V 135" stroke="var(--sch-stroke)" stroke-width="5"/>`);
    // heart pump
    o.push(`<g><circle cx="300" cy="175" r="${heartR}" fill="${heartCol}"><animate attributeName="r" values="${heartR};${heartR * (1 - 0.12 * clamp(pump, 0.1, 1.5))};${heartR}" dur="${(60 / Math.max(p.hr, 20)).toFixed(2)}s" repeatCount="indefinite"/></circle>`);
    o.push(`<text x="300" y="170" text-anchor="middle" class="sch-t" fill="#fff" style="fill:#fff">Pump</text><text x="300" y="188" text-anchor="middle" class="sch-small" style="fill:#fff;font-size:10px">HR ${p.hr} · SV ${Math.round(p.sv)}</text></g>`);
    if (obst) {
      const lab = (scn.hint && scn.hint.obstruction) || 'Obstruction';
      o.push(`<path d="M 225 150 L 245 215 M 205 160 L 268 200" stroke="#222" stroke-width="7" stroke-linecap="round"/><text x="200" y="138" text-anchor="middle" class="sch-warn">${esc(lab)}</text>`);
    }
    // labels for key numbers
    const CO = p.co.toFixed(1), MAP = Math.round(p.map);
    o.push(`<rect x="200" y="225" width="200" height="72" rx="10" fill="var(--sch-box)" stroke="var(--sch-stroke)"/>`);
    o.push(`<text x="300" y="247" text-anchor="middle" class="sch-t">CO = HR × SV = ${CO} L/min</text>`);
    o.push(`<text x="300" y="266" text-anchor="middle" class="sch-t">MAP ≈ CO × SVR = ${MAP} mmHg</text>`);
    o.push(`<text x="300" y="285" text-anchor="middle" class="sch-small">DO₂ ≈ ${Math.round(p.do2 || 0)} mL/min · lactate ${p.lactate.toFixed(1)}</text>`);
    o.push(`<text x="20" y="24" class="sch-small">Pipe width ∝ 1/SVR · tank level ∝ effective preload · pump size ∝ dilatation · values are live</text>`);
    o.push(`</svg>`);
    return o.join('');
  };

  // ---- 3. Frank–Starling ----
  H.starling = function (eng) {
    const p = eng.p, W = 640, Hh = 330, x0 = 60, y0 = 280, sx = 360, sy = 220;
    const curve = (c) => { let d = ''; for (let i = 0; i <= 60; i++) { const pre = (i / 60) * 1.6; const sv = 78 * S.starling(pre) * Math.pow(c, 0.75); d += (i ? 'L' : 'M') + (x0 + (pre / 1.6) * sx).toFixed(1) + ' ' + (y0 - (sv / 140) * sy).toFixed(1); } return d; };
    const fill = p.preload * (1 - p.obstruct);
    const px = x0 + (clamp(fill, 0, 1.6) / 1.6) * sx, py = y0 - (clamp(p.sv, 0, 140) / 140) * sy;
    const o = [`<svg viewBox="0 0 ${W} ${Hh}" class="sch-svg">`];
    o.push(`<path d="M ${x0} 40 V ${y0} H ${x0 + sx + 10}" stroke="var(--sch-stroke)" stroke-width="2" fill="none"/>`);
    o.push(`<text x="${x0 + sx / 2}" y="${y0 + 32}" text-anchor="middle" class="sch-t">Preload (ventricular filling) →</text><text x="20" y="${y0 - sy / 2}" class="sch-t" transform="rotate(-90 20 ${y0 - sy / 2})" text-anchor="middle">Stroke volume →</text>`);
    o.push(`<path d="${curve(1.6)}" stroke="#2c9b6a" stroke-width="2" fill="none" stroke-dasharray="5 4"/><text x="${x0 + sx + 14}" y="${y0 - (78 * S.starling(1.6) * Math.pow(1.6, 0.75) / 140) * sy}" class="sch-small">↑ inotropy</text>`);
    o.push(`<path d="${curve(1)}" stroke="var(--sch-stroke)" stroke-width="2.5" fill="none"/><text x="${x0 + sx + 14}" y="${y0 - (78 * S.starling(1.6) / 140) * sy}" class="sch-small">normal</text>`);
    o.push(`<path d="${curve(0.4)}" stroke="#c55" stroke-width="2" fill="none" stroke-dasharray="5 4"/><text x="${x0 + sx + 14}" y="${y0 - (78 * S.starling(1.6) * Math.pow(0.4, 0.75) / 140) * sy}" class="sch-small">failing heart</text>`);
    o.push(`<path d="${curve(p.contractEff)}" stroke="#d9822b" stroke-width="3" fill="none"/>`);
    o.push(`<circle cx="${px}" cy="${py}" r="8" fill="#d9822b" stroke="#fff" stroke-width="2"/><text x="${px + 12}" y="${py - 10}" class="sch-t">This patient now</text>`);
    o.push(`<rect x="${x0 + 10}" y="40" width="190" height="52" rx="8" fill="var(--sch-box)" stroke="var(--sch-stroke)"/><text x="${x0 + 20}" y="60" class="sch-small">Steep part: fluid ↑ SV (responsive)</text><text x="${x0 + 20}" y="80" class="sch-small">Flat part: fluid → congestion/oedema</text>`);
    o.push(`</svg>`);
    return o.join('');
  };

  // ---- 4. Shock profile table ----
  H.profiles = function (eng, scn) {
    const rows = [
      ['Hypovolaemic', '↓', '↑', '↓', 'Cool, flat veins', 'Volume / blood, stop the bleeding'],
      ['Distributive', '↑ / N', '↓', '↓ / N', 'Warm (early), bounding', 'Vasopressor + treat cause (fluid if under-filled)'],
      ['Cardiogenic', '↓', '↑', '↑', 'Cool, congested, crackles', 'Inotrope ± pressor, revascularise, avoid excess fluid'],
      ['Obstructive', '↓', '↑', '↑', 'Distended neck veins', 'Relieve obstruction (decompress / drain / lyse)'],
    ];
    const p = eng.p;
    const tag = scn.shock || '';
    const arrow = (v, lo, hi) => (v < lo ? '↓' : v > hi ? '↑' : 'N');
    return `<table class="prof"><thead><tr><th>Shock type</th><th>CO</th><th>SVR</th><th>CVP</th><th>Bedside</th><th>Core treatment</th></tr></thead><tbody>${rows.map((r) => `<tr class="${tag.toLowerCase().startsWith(r[0].toLowerCase().slice(0, 5)) ? 'hl' : ''}">${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
      <tr class="now"><td>This patient now</td><td>${arrow(p.co, 4, 7.5)} (${p.co.toFixed(1)})</td><td>${arrow(p.svr, 800, 1400)} (${Math.round(p.svr)})</td><td>${arrow(p.cvp, 3, 11)} (${Math.round(p.cvp)})</td><td colspan="2">MAP ${Math.round(p.map)}, HR ${p.hr}, lactate ${p.lactate.toFixed(1)}</td></tr></tbody></table>`;
  };
})();
