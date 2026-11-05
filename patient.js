/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Top-down patient view with relevant equipment, drawn in SVG and updated live. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join(''); };

  function skinColour(eng) {
    const p = eng.p, L = p.look || {};
    let c = L.skin || '#e8b48c';
    const pallor = clamp((68 - p.map) / 35, 0, 1) * 0.6 + clamp((90 - p.hb) / 60, 0, 1) * 0.4;
    c = mix(c, '#efe2d6', pallor);
    const flush = typeof L.flush === 'function' ? L.flush(eng) : L.flush || 0;
    c = mix(c, '#e8726a', flush * 0.55);
    const cyan = clamp((92 - p.spo2) / 25, 0, 1);
    c = mix(c, '#8f9bc4', cyan * 0.75);
    return c;
  }

  // Who the patient is: sex (from the scenario, or guessed from the handover) and age group.
  function who(eng, scn) {
    const p = eng.p, st = (scn.stem || '').toLowerCase();
    let sex = scn.patient && scn.patient.sex;
    if (!sex) { const m = /\b(girl|daughter|woman|she|her|boy|son|man|he|his)\b/.exec(st); sex = m && /^(girl|daughter|woman|she|her)$/.test(m[1]) ? 'F' : 'M'; }
    const a = p.age == null ? 50 : p.age;
    const grp = a < 1.5 ? 'infant' : a < 8 ? 'young' : a < 16 ? 'older' : a >= 65 ? 'elderly' : 'adult';
    return { female: sex === 'F', grp, kid: grp === 'infant' || grp === 'young' || grp === 'older' };
  }
  // Smooth closed path through points (Catmull-Rom → cubic Bézier)
  function smooth(pts) {
    const n = pts.length, P = (i) => pts[(i + n) % n];
    let d = `M${P(0)[0].toFixed(1)} ${P(0)[1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }

  // Both legs, seen from above with the feet towards the end of the bed. Top of the picture = patient's right.
  // Scenario options: look.legs = { right|left: { swollen, wound, tourniquetIf: '<action id>', bite, bruise, kneeDressing, shortRot }, oedema, purpura }
  function drawLegs(eng, W, add, c) {
    const p = eng.p, L = p.look || {}, LG = L.legs || {}, G = W.grp;
    const base = {
      infant: { sep: 22, kneeX: 496, kneeOut: 24, ankleX: 552, ankleOut: 12, w: [24, 22, 16, 16, 10], foot: 17, fw: 12, splay: 40 },
      young: { sep: 24, kneeX: 520, kneeOut: 4, ankleX: 598, ankleOut: 6, w: [25, 21, 15, 16, 9], foot: 21, fw: 13, splay: 28 },
      older: { sep: 27, kneeX: 540, kneeOut: 3, ankleX: 624, ankleOut: 5, w: [27, 23, 15, 17, 9], foot: 24, fw: 14, splay: 26 },
      adult: { sep: 29, kneeX: 545, kneeOut: 2, ankleX: 626, ankleOut: 5, w: [31, 27, 18, 20, 11], foot: 25, fw: 16, splay: 26 },
      elderly: { sep: 28, kneeX: 543, kneeOut: 2, ankleX: 624, ankleOut: 5, w: [27, 22, 17, 16, 10], foot: 25, fw: 15, splay: 30 },
    }[G];
    const cool = clamp((62 - p.map) / 25, 0, 1);
    const footCol = mix(c.sk, '#9aa6c8', cool * 0.45);
    const mottle = c.mottled ? clamp((p.lactate - 2) / 6, 0.35, 1) : 0;
    [[-1, 'right'], [1, 'left']].forEach(([sd, name]) => {
      const o = Object.assign({}, LG[name] || {});
      const b = Object.assign({}, base); let [wH, wT, wK, wC, wA] = b.w;
      if (W.female && !W.kid) { wH += 1; wT += 1; wC -= 1; }
      if (LG.oedema) { wC += 3; wA += 6; }
      if (o.swollen) { wC += 6; wA += 6; wK += 2; }
      if (o.shortRot) { b.kneeX -= 10; b.ankleX -= 20; b.splay = 78; }
      const hipX = 424, hipY = 225 + sd * b.sep, kneeY = hipY + sd * b.kneeOut, ankY = 225 + sd * (b.sep + b.ankleOut);
      const lerp = (x0, y0, x1, y1, x) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      const thX = (hipX + b.kneeX) / 2, caX = b.kneeX + (b.ankleX - b.kneeX) * 0.32;
      const ctl = [[hipX, hipY, wH], [thX, lerp(hipX, hipY, b.kneeX, kneeY, thX), wT], [b.kneeX, kneeY, wK], [caX, lerp(b.kneeX, kneeY, b.ankleX, ankY, caX), wC], [b.ankleX, ankY, wA]];
      const pts = ctl.map(([x, y, w]) => [x, y - w]).concat(ctl.slice().reverse().map(([x, y, w]) => [x, y + w]));
      pts.splice(5, 0, [b.ankleX + 4, ankY]);
      const d = smooth(pts), id = 'pvLeg' + name;
      const legFill = o.swollen ? mix(c.sk, '#d86a5a', 0.18) : null;
      add(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
      add(`<path d="${d}" fill="url(#pvLimb)" stroke="${c.skD}" stroke-width=".9" filter="url(#pvShS)"/>`);
      add(`<g clip-path="url(#${id})">`);
      if (legFill) add(`<rect x="${b.kneeX - 10}" y="${ankY - 40}" width="${b.ankleX - b.kneeX + 20}" height="80" fill="${legFill}" opacity=".55"/>`);
      if (cool) add(`<rect x="${caX}" y="${ankY - 30}" width="${b.ankleX - caX + 10}" height="60" fill="#9aa6c8" opacity="${(cool * 0.35).toFixed(2)}"/>`);
      add(`<ellipse cx="${b.kneeX}" cy="${kneeY}" rx="${G === 'infant' ? 7 : 11}" ry="${(wK * 0.7).toFixed(1)}" fill="${c.skL}" opacity=".45" stroke="${c.skD}" stroke-width=".6"/>`); // kneecap
      add(`<path d="M${thX - 20} ${(hipY - sd * 4).toFixed(1)} C${thX} ${hipY - sd * 6} ${b.kneeX - 20} ${kneeY - sd * 4} ${b.kneeX - 12} ${kneeY - sd * 3}" stroke="${c.skD}" stroke-width="1" fill="none" opacity=".35"/>`); // thigh contour
      if (mottle) add(`<rect x="${b.kneeX - 22 - mottle * 60}" y="${kneeY - 40}" width="${44 + mottle * 120}" height="80" fill="url(#pvMottle)" opacity="${(0.55 + mottle * 0.4).toFixed(2)}"/>`);
      if (LG.purpura) for (let i = 0; i < 16; i++) { const x = hipX + 50 + ((i * 47 + (sd > 0 ? 19 : 0)) % (b.ankleX - hipX - 40)), y = lerp(hipX, hipY, b.ankleX, ankY, x) + (((i * 29) % 21) - 10) * 0.9; add(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.6 + (i % 3) * 0.9).toFixed(1)}" fill="#6d1f3d" opacity=".85"/>`); }
      if (LG.oedema) add(`<path d="M${b.ankleX - 30} ${ankY - sd * 3} q6 ${sd * 3} 12 0" stroke="${c.skDD}" stroke-width="1.2" fill="none" opacity=".5"/><path d="M${caX + 10} ${ankY - wA + 4} H${b.ankleX - 6}" stroke="#ffffff" stroke-width="2" opacity=".35"/>`);
      if (o.bruise) add(`<ellipse cx="${thX + 18}" cy="${hipY + sd * 4}" rx="22" ry="12" fill="#5b3d78" opacity=".38"/><ellipse cx="${thX + 26}" cy="${hipY + sd * 6}" rx="12" ry="7" fill="#9c8a3a" opacity=".3"/>`);
      if (o.kneeDressing) add(`<rect x="${b.kneeX - 24}" y="${kneeY - 6}" width="48" height="12" rx="3" fill="#fbfbfb" stroke="#c4ccd4"/><path d="M${b.kneeX - 18} ${kneeY} h36" stroke="#a7b0ba" stroke-width="1" stroke-dasharray="2 3"/>`);
      if (o.bite) add(`<ellipse cx="${b.ankleX - 8}" cy="${ankY}" rx="16" ry="${wA + 2}" fill="#7a3d6e" opacity=".3"/><circle cx="${b.ankleX - 10}" cy="${ankY - 3}" r="1.8" fill="#4a0d14"/><circle cx="${b.ankleX - 4}" cy="${ankY + 3}" r="1.8" fill="#4a0d14"/>`);
      add(`</g>`);
      if (o.wound) {
        const wx = thX + 18, wy = lerp(hipX, hipY, b.kneeX, kneeY, wx);
        const controlled = o.tourniquetIf && eng.did(o.tourniquetIf);
        add(`<path d="M${wx - 13} ${wy - 4} l6 3 5 -4 6 5 5 -3 5 4 -5 4 -6 -3 -5 4 -6 -4 -5 2z" fill="#5a0b0b" stroke="#a51d1d" stroke-width="1.5"/>`);
        if (!controlled) add(`<path d="M${wx} ${wy + sd * 6} q4 ${sd * 14} -2 ${sd * 26}" stroke="#a51d1d" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="${wx - 4}" cy="${wy + sd * 38}" rx="26" ry="9" fill="#8e1414" opacity=".75"/>`);
        if (controlled) add(`<rect x="${hipX + 18}" y="${hipY - wH - 4}" width="12" height="${2 * wH + 8}" rx="3" fill="#1d1f24"/><rect x="${hipX + 15}" y="${hipY + sd * (wH + 6) - 4}" width="18" height="8" rx="2" fill="#e04b2a"/>`);
      }
      // foot, splayed outward; toes at the far end, big toe on the inner side
      const fl = b.foot, fw = b.fw + (LG.oedema || o.swollen ? 3 : 0);
      // toes: big toe on the inner (medial) side, the rest getting smaller towards the outer side
      const toes = [0, 1, 2, 3, 4].map((i) => { const y = (-sd) * fw * 0.66 + sd * (i === 0 ? 0 : fw * 0.18 + i * fw * 0.27), r = i === 0 ? fw * 0.3 : fw * (0.19 - i * 0.018), x = fl - 2 - (i === 0 ? 0 : i * 1.8); return `<ellipse cx="${(x + r * 0.6).toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * 1.25).toFixed(1)}" ry="${r.toFixed(1)}" fill="${footCol}" stroke="${c.skD}" stroke-width=".6"/><ellipse cx="${(x + r * 1.1).toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * 0.45).toFixed(1)}" ry="${(r * 0.5).toFixed(1)}" fill="#ffffff" opacity=".35"/>`; }).join('');
      add(`<g transform="translate(${b.ankleX - 4} ${ankY}) rotate(${sd * b.splay})" filter="url(#pvShS)"><path d="M0 ${-wA} C${fl * 0.3} ${-wA - 2} ${fl * 0.55} ${-fw} ${fl - 2} ${-fw * 0.92} C${fl + 2} ${-fw * 0.6} ${fl + 2} ${fw * 0.6} ${fl - 2} ${fw * 0.92} C${fl * 0.55} ${fw} ${fl * 0.3} ${wA + 2} 0 ${wA} Z" fill="${footCol}" stroke="${c.skD}" stroke-width=".8"/><path d="M${fl * 0.25} ${-sd * wA * 0.2} C${fl * 0.5} ${-sd * fw * 0.3} ${fl * 0.7} ${-sd * fw * 0.5} ${fl - 4} ${-sd * fw * 0.6}" stroke="${c.skD}" stroke-width=".8" fill="none" opacity=".35"/>${toes}</g>`);
    });
    if (c.mottled) add(`<text x="${base.kneeX + 6}" y="${225 + 4}" font-size="9" fill="#5b3f6c" text-anchor="middle" font-style="italic">mottled</text>`);
 if (LG.purpura) add(`<text x="${base.kneeX}" y="${225 + base.sep + base.kneeOut + base.w[2] + 16}" font-size="9" fill="#6d1f3d" text-anchor="middle" font-style="italic">non-blanching rash</text>`);
  }

  function build(eng, scn) {
    const p = eng.p, L = p.look || {}, set = scn.setting || 'ed';
    const sk = skinColour(eng);
    const W = who(eng, scn), F = W.female, G = W.grp;
    const sedated = p.ventilated || p.gcs < 9 || eng.flags.paralysed;
    const mottled = p.lactate > 4 || p.map < 55;
    const parts = [];
    const add = (s) => parts.push(s);
    // ---------- defs: gradients, patterns, shadow ----------
    const skD = mix(sk, '#4a2c1c', 0.28), skDD = mix(sk, '#3a2216', 0.45), skL = mix(sk, '#ffffff', 0.22);
    const hair = L.hair || (p.age >= 70 ? (F ? '#d9d6d2' : '#bdb8b0') : p.age >= 55 ? '#8a8178' : G === 'infant' ? '#b08a5c' : p.paed ? (F ? '#8a5a2b' : '#6b4a2c') : F ? '#5a3a22' : '#3a2a1c');
    const torsoD = F && !W.kid ? 'M252 172 C252 154 268 150 290 150 L352 154 C378 158 392 166 398 172 C414 166 434 166 442 176 L442 274 C434 284 414 284 398 278 C392 284 378 292 352 296 L290 300 C268 300 252 296 252 278 Z'
      : 'M252 170 C252 150 270 144 292 144 L362 150 C402 155 430 166 440 178 L440 272 C430 284 402 295 362 300 L292 306 C270 306 252 300 252 280 Z';
    const floor = set === 'theatre' ? '#dfe7e9' : set === 'icu' ? '#e7e4ee' : '#e9e6df';
    const blanket = set === 'theatre' ? '#5c9a86' : set === 'icu' ? '#8fb3d9' : '#b9c7d6';
    add(`<defs>
      <filter id="pvSh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#1b2430" flood-opacity=".22"/></filter>
      <filter id="pvShS" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#1b2430" flood-opacity=".25"/></filter>
      <radialGradient id="pvSkin" cx="45%" cy="45%" r="65%"><stop offset="0" stop-color="${skL}"/><stop offset=".6" stop-color="${sk}"/><stop offset="1" stop-color="${skD}"/></radialGradient>
      <linearGradient id="pvLimb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skD}"/><stop offset=".35" stop-color="${skL}"/><stop offset=".7" stop-color="${sk}"/><stop offset="1" stop-color="${skDD}"/></linearGradient>
      <linearGradient id="pvNeck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skDD}"/><stop offset=".5" stop-color="${sk}"/><stop offset="1" stop-color="${skDD}"/></linearGradient>
      <radialGradient id="pvHair" cx="70%" cy="50%" r="80%"><stop offset="0" stop-color="${mix(hair, '#ffffff', 0.15)}"/><stop offset="1" stop-color="${mix(hair, '#000000', 0.3)}"/></radialGradient>
      <linearGradient id="pvBlanket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(blanket, '#000000', 0.12)}"/><stop offset=".3" stop-color="${mix(blanket, '#ffffff', 0.18)}"/><stop offset=".7" stop-color="${blanket}"/><stop offset="1" stop-color="${mix(blanket, '#000000', 0.18)}"/></linearGradient>
      <linearGradient id="pvMattress" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4e8ec"/><stop offset=".12" stop-color="#fbfcfd"/><stop offset=".88" stop-color="#f4f6f8"/><stop offset="1" stop-color="#d9dee4"/></linearGradient>
      <radialGradient id="pvPillow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset=".8" stop-color="#f1f3f6"/><stop offset="1" stop-color="#d8dde3"/></radialGradient>
      <linearGradient id="pvFloor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(floor, '#ffffff', 0.25)}"/><stop offset="1" stop-color="${mix(floor, '#000000', 0.06)}"/></linearGradient>
      <pattern id="pvTiles" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#00000010" stroke-width="1"/></pattern>
      <pattern id="pvGown" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#cfe0ee"/><path d="M7 2 l3 5 -3 5 -3 -5z" fill="#9fbcd6" opacity=".55"/></pattern>
      <pattern id="pvGownKid" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff1b8"/><path d="M8 3 l1.4 3 3.2 .3 -2.4 2.1 .8 3.1 -3 -1.7 -3 1.7 .8 -3.1 -2.4 -2.1 3.2 -.3z" fill="#f4b740" opacity=".7"/></pattern>
      <pattern id="pvStubble" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="${mix(hair, '#000000', 0.2)}" opacity=".55"/><circle cx="2.6" cy="2.5" r=".45" fill="${mix(hair, '#000000', 0.2)}" opacity=".45"/></pattern>
      <pattern id="pvMottle" width="14" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 Q3.5 0 7 6 T14 6 M0 6 Q3.5 12 7 6 T14 6" stroke="#7b4a8c" stroke-width="1.6" fill="none" opacity=".5"/></pattern>
      <clipPath id="pvHeadClip"><ellipse cx="200" cy="225" rx="37" ry="32"/></clipPath>
      <clipPath id="pvTorsoClip"><path d="${torsoD}"/></clipPath>
    </defs>`);
    // ---------- floor & bed ----------
    add(`<rect x="0" y="0" width="800" height="420" fill="url(#pvFloor)"/><rect x="0" y="0" width="800" height="420" fill="url(#pvTiles)"/>`);
    add(`<g filter="url(#pvSh)"><rect x="140" y="98" width="532" height="254" rx="22" fill="#8e99a4"/><rect x="146" y="104" width="520" height="242" rx="18" fill="#a9b3bc"/></g>`);
    add(`<rect x="152" y="110" width="508" height="230" rx="14" fill="url(#pvMattress)"/>`);
    add(`<path d="M152 124 H660 M152 326 H660" stroke="#dfe4ea" stroke-width="2"/>`); // sheet edges
    // side rails (lowered, at the bed edges)
    [96, 346].forEach((y) => add(`<rect x="250" y="${y - 4}" width="300" height="8" rx="4" fill="#c7ced6" stroke="#8d97a1"/><rect x="262" y="${y - 6}" width="8" height="12" rx="2" fill="#8d97a1"/><rect x="530" y="${y - 6}" width="8" height="12" rx="2" fill="#8d97a1"/>`));
    add(`<g filter="url(#pvShS)"><rect x="158" y="164" width="84" height="122" rx="22" fill="url(#pvPillow)"/><path d="M172 176 C190 186 190 264 172 274" stroke="#dfe3e8" stroke-width="2" fill="none"/></g>`);
    // ---------- body (scaled down for children) ----------
    const ps = p.paed ? Math.max(0.5, Math.min(1, 0.45 + p.weight / 90)) : 1;
    const bodyT = `translate(${160 * (1 - ps)} ${225 * (1 - ps)}) scale(${ps})`;
    add(`<g id="body" transform="${bodyT}">`);
    // arms (top arm drawn once, bottom arm is its mirror image about the body's midline)
    const armPath = 'M254 132 C262 118 290 112 352 116 C378 119 398 121 414 124 L414 143 C398 143 376 143 352 143 C328 144 296 152 260 168 Z';
    const hand = `<path d="M410 121 C422 116 436 117 444 122 C448 125 449 128 447 131 L460 129 C466 128 467 133 462 134 L449 136 L462 137 C467 138 467 143 461 143 L448 142 C446 146 440 148 432 148 C424 148 416 147 410 146 Z" fill="url(#pvSkin)" stroke="${skD}" stroke-width=".8"/>
      <path d="M447 126 L463 124 C468 124 468 129 463 129 L448 131" fill="url(#pvSkin)" stroke="${skD}" stroke-width=".8"/>
      <path d="M440 146 C446 150 452 153 456 152" stroke="${skD}" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M440 146 C446 150 452 153 456 152" stroke="${sk}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
      <path d="M460 126 h2 M460 131 h2 M460 140 h2" stroke="${p.spo2 < 88 ? '#7a7fb8' : mix(sk, '#ffffff', 0.4)}" stroke-width="2.2" stroke-linecap="round"/>`;
    const arm = `<g filter="url(#pvShS)"><path d="${armPath}" fill="url(#pvLimb)" stroke="${skD}" stroke-width=".8"/>${hand}</g>
      <path d="M352 119 C356 128 356 136 352 142" stroke="${skD}" stroke-width="1" fill="none" opacity=".5"/>
      ${mottled ? `<path d="M352 116 C378 119 398 121 414 124 L414 143 C398 143 376 143 352 143 Z" fill="url(#pvMottle)" opacity=".75"/>` : ''}`;
    add(`<g id="pvArmTop">${arm}</g><g transform="matrix(1 0 0 -1 0 450)">${arm}</g>`);
    // legs (visible: mottling, purpura, oedema, wounds, swelling, shortening/rotation)
    drawLegs(eng, W, add, { sk, skD, skDD, skL, mottled });
    // torso (breathing)
    add(`<g class="chest" style="transform-origin:330px 225px">`);
    const torso = torsoD;
    add(`<path d="${torso}" fill="url(#pvSkin)" stroke="${skD}" stroke-width="1" filter="url(#pvShS)"/>`);
    add(`<g clip-path="url(#pvTorsoClip)">`);
    // anatomy: clavicles, sternum, pectoral and rib-margin shading
    add(`<path d="M262 200 C270 180 280 168 292 160 M262 250 C270 270 280 282 292 290" stroke="${skD}" stroke-width="2" fill="none" opacity=".45"/>`);
    add(`<path d="M268 225 H372" stroke="${skD}" stroke-width="1.2" opacity=".35"/><path d="M372 190 C392 205 392 245 372 260" stroke="${skD}" stroke-width="2" fill="none" opacity=".3"/>`);
    add(`<ellipse cx="322" cy="186" rx="36" ry="24" fill="${skD}" opacity=".12"/><ellipse cx="322" cy="264" rx="36" ry="24" fill="${skD}" opacity=".12"/>`);
    const gowned = G !== 'infant' && (F && !W.kid || !(L.gown === false || set === 'theatre'));
    if (F && !W.kid && (G === 'adult' || G === 'elderly')) add(`<ellipse cx="${G === 'elderly' ? 340 : 332}" cy="188" rx="30" ry="22" fill="${skD}" opacity=".16"/><ellipse cx="${G === 'elderly' ? 340 : 332}" cy="262" rx="30" ry="22" fill="${skD}" opacity=".16"/>`);
    if (!gowned) {
      add(`<circle cx="338" cy="${G === 'infant' ? 190 : 184}" r="${G === 'infant' ? 2.4 : 3.5}" fill="${skDD}" opacity=".55"/><circle cx="338" cy="${G === 'infant' ? 260 : 266}" r="${G === 'infant' ? 2.4 : 3.5}" fill="${skDD}" opacity=".55"/><circle cx="416" cy="225" r="2.6" fill="${skDD}" opacity=".5"/>`);
      if (!F && (G === 'adult' || G === 'elderly')) for (let i = 0; i < 14; i++) { const x = 300 + ((i * 29) % 70), y = 195 + ((i * 17) % 60); add(`<path d="M${x} ${y} q2 -3 4 0 q2 3 4 0" stroke="${mix(hair, '#000000', 0.1)}" stroke-width=".8" fill="none" opacity=".45"/>`); }
      if (G === 'elderly') add(`<path d="M300 176 C312 172 326 172 338 176 M296 186 C310 182 326 182 342 186 M300 274 C312 278 326 278 338 274 M296 264 C310 268 326 268 342 264" stroke="${skDD}" stroke-width="1.2" fill="none" opacity=".35"/>`);
    } else {
      const gp = W.kid ? 'url(#pvGownKid)' : 'url(#pvGown)', ge = W.kid ? '#e6c25a' : '#8fb0cf';
      add(`<path d="M298 140 C318 196 318 254 298 310 L446 310 L446 140 Z" fill="${gp}" opacity=".93"/><path d="M298 140 C318 196 318 254 298 310" stroke="${ge}" stroke-width="2.5" fill="none"/><path d="M372 140 v170" stroke="${ge}" stroke-width="1.2" stroke-dasharray="3 5" opacity=".7"/>`);
      if (F && !W.kid) add(`<path d="M306 168 C318 160 344 160 360 172 M306 282 C318 290 344 290 360 278" stroke="${mix('#8fb0cf', '#000000', 0.15)}" stroke-width="1.6" fill="none" opacity=".7"/><path d="M314 200 C330 205 350 203 362 196 M314 250 C330 245 350 247 362 254" stroke="#ffffff" stroke-width="2" fill="none" opacity=".35"/>`);
    }
    if (L.urticaria) { const n = 30; for (let i = 0; i < n; i++) { const x = 258 + ((i * 53) % 178), y = 160 + ((i * 37) % 135), rx = 5 + (i % 3) * 2.5, ry = 4 + (i % 2) * 2.5; add(`<path d="M${x - rx} ${y} q${rx * 0.5} ${-ry * 1.2} ${rx} ${-ry * 0.3} q${rx * 0.9} ${-ry * 0.6} ${rx} ${ry * 0.5} q${-rx * 0.2} ${ry * 1.1} ${-rx} ${ry * 0.9} q${-rx * 0.9} ${ry * 0.2} ${-rx} ${-ry * 1.1}z" fill="#e0675f" opacity=".42" stroke="#f3a9a3" stroke-width="1.5"/>`); } }
    add(`</g>`);
    // ECG electrodes with lead wires running to the monitor
    [[275, 175, '#d9363e'], [275, 275, '#e8c22c'], [410, 280, '#3a9a4b']].forEach(([x, y, c]) => add(`<path d="M${x} ${y} C ${x - 20} ${y - 30}, 262 ${150 + (y - 175) * 0.1}, 248 ${132 + (y % 5)} S 190 ${70 + (y % 7) * 3}, 150 ${44 + (y % 5) * 5}" stroke="${c}" stroke-width="1.3" fill="none" opacity=".75"/><circle cx="${x}" cy="${y}" r="7" fill="#fdfdfd" stroke="#b9bec4" filter="url(#pvShS)"/><circle cx="${x}" cy="${y}" r="2.6" fill="${c}"/>`));
    if (L.wound) add(`<path d="M${L.wound === 'left-chest' ? '300 250' : '330 215'} l14 6" stroke="#6e1010" stroke-width="5" stroke-linecap="round"/><path d="M${L.wound === 'left-chest' ? '300 250' : '330 215'} l14 6" stroke="#b02a2a" stroke-width="2" stroke-linecap="round"/>`);
    if (eng.did('chest_drain')) add(`<path d="M330 290 C 340 330, 360 350, 380 375" stroke="#c9302c" stroke-width="5" fill="none" opacity=".8"/><rect x="322" y="282" width="18" height="12" rx="2" fill="#fff" opacity=".9" stroke="#ccc"/>`);
    if (eng.did('thoracostomy') || eng.did('needle_decompression')) add(`<circle cx="345" cy="285" r="5" fill="#a33"/>`);
    add(`</g>`);
    if (G === 'infant') add(`<path d="M424 172 C448 166 470 170 482 182 C488 204 488 246 482 268 C470 280 448 284 424 278 Z" fill="#fbfbfd" stroke="#c9d2dc" stroke-width="1.5" filter="url(#pvShS)"/><rect x="430" y="176" width="16" height="10" rx="3" fill="#9fd3f0"/><rect x="430" y="264" width="16" height="10" rx="3" fill="#9fd3f0"/><path d="M440 190 C452 210 452 240 440 260" stroke="#e1e6ec" stroke-width="2" fill="none"/>`);
    else {
      const gownedP = F && !W.kid || !(L.gown === false || set === 'theatre');
      const fillP = gownedP ? (W.kid ? 'url(#pvGownKid)' : 'url(#pvGown)') : 'url(#pvBlanket)';
      add(`<path d="M428 ${F && !W.kid ? 160 : 164} C452 158 476 160 494 168 C500 196 500 254 494 282 C476 290 452 292 428 ${F && !W.kid ? 290 : 286} Z" fill="${fillP}" filter="url(#pvShS)"/><path d="M494 168 C500 196 500 254 494 282" stroke="${gownedP ? (W.kid ? '#e6c25a' : '#8fb0cf') : '#00000030'}" stroke-width="2.5" fill="none"/>`);
    }
    if (p.pregnant || L.pregnant) add(`<g filter="url(#pvSh)"><ellipse cx="455" cy="225" rx="64" ry="60" fill="url(#pvSkin)" stroke="${skD}"/><path d="M412 225 H500" stroke="${skDD}" stroke-width="1.5" opacity=".35"/><ellipse cx="452" cy="225" rx="4" ry="3" fill="${skDD}" opacity=".4"/></g>`);
    if (p.look.binder || eng.did('pelvic_binder')) add(`<rect x="425" y="165" width="34" height="120" rx="6" fill="#20232a" filter="url(#pvShS)"/><rect x="430" y="214" width="24" height="22" rx="3" fill="#3d424d"/><text x="442" y="230" fill="#fff" font-size="10" text-anchor="middle" transform="rotate(-90 442 230)">BINDER</text>`);
    if (set === 'theatre' && L.drapes !== false) add(`<rect x="300" y="150" width="355" height="150" rx="10" fill="#3f8c79" opacity=".94" filter="url(#pvSh)"/><path d="M320 170 C400 180 520 176 640 170 M320 280 C400 270 520 274 640 280" stroke="#2f6b5c" stroke-width="2" fill="none" opacity=".6"/>${p.pregnant ? '<ellipse cx="455" cy="225" rx="64" ry="60" fill="#4a9a86" stroke="#2f6b5c"/>' : ''}<rect x="${L.surgField === 'lower' ? 480 : 380}" y="200" width="80" height="50" rx="6" fill="#d9a07f" stroke="#2f6b5c" stroke-width="4"/><text x="480" y="180" fill="#e9f5f1" font-size="11" text-anchor="middle">surgical drapes</text>`);
    // neck
    add(`<path d="M226 203 C238 202 250 198 262 192 L262 258 C250 252 238 248 226 247 Z" fill="url(#pvNeck)"/>`);
    add(`<path d="M240 210 C246 218 246 232 240 240" stroke="${skDD}" stroke-width="1.2" fill="none" opacity=".4"/>`);
    if (L.collar) add(`<path d="M238 200 C246 199 255 195 266 188 L266 262 C255 255 246 251 238 250 C242 236 242 214 238 200 Z" fill="#eef2f6" stroke="#8a99a8" stroke-width="1.5" filter="url(#pvShS)"/><rect x="246" y="215" width="12" height="20" rx="3" fill="#d3dbe3" stroke="#8a99a8"/><text x="252" y="196" font-size="8" text-anchor="middle" fill="#567">COLLAR</text>`);
    if (p.cvp > 14 && !L.collar) add(`<path d="M234 206 q10 -5 22 -2" stroke="#5a6aa3" stroke-width="3" fill="none"/><text x="244" y="194" font-size="10" fill="#334" text-anchor="middle">↑JVP</text>`);
    // head (viewed from above: crown towards the head of the bed, chin towards the chest)
    // Children have proportionally bigger heads; the head scales about the top of the neck.
    const hs = { infant: 1.42, young: 1.26, older: 1.1 }[G] || 1;
    add(`<g transform="translate(226 225) scale(${hs}) translate(-226 -225)">`);
    const hairD = mix(hair, '#000000', 0.35);
    // long hair fanned out on the pillow (adult women, older girls)
    if (F && (G === 'adult' || G === 'older')) {
      add(`<path d="M206 191 C190 166 158 158 138 170 C122 188 124 212 132 225 C124 238 122 262 138 280 C158 292 190 284 206 259 Z" fill="url(#pvHair)" filter="url(#pvShS)"/>`);
      add(`<path d="M190 182 C170 176 150 180 140 196 M186 200 C164 198 146 206 138 218 M186 250 C164 252 146 244 138 232 M190 268 C170 274 150 270 140 254" stroke="${hairD}" stroke-width="1.1" fill="none" opacity=".55"/>`);
    }
    // bunches (young girls)
    if (F && G === 'young') [[176, 182, -1], [176, 268, 1]].forEach(([x, y, d]) => add(`<ellipse cx="${x - 4}" cy="${y + d * 8}" rx="11" ry="15" transform="rotate(${d * 25} ${x - 4} ${y + d * 8})" fill="url(#pvHair)" stroke="${hairD}" stroke-width=".8"/><path d="M${x - 10} ${y + d * 4} q6 ${d * 10} 0 ${d * 18} M${x - 2} ${y + d * 4} q5 ${d * 10} 0 ${d * 18}" stroke="${hairD}" stroke-width=".8" fill="none" opacity=".6"/><circle cx="${x + 2}" cy="${y - d * 2}" r="4.5" fill="#e0457b"/>`));
    add(`<g filter="url(#pvShS)"><ellipse cx="197" cy="190" rx="8" ry="6" fill="${sk}" stroke="${skD}"/><ellipse cx="197" cy="260" rx="8" ry="6" fill="${sk}" stroke="${skD}"/>`);
    add(`<ellipse cx="200" cy="225" rx="37" ry="${G === 'infant' || G === 'young' ? 34 : 32}" fill="url(#pvSkin)" stroke="${skD}"/></g>`);
    add(`<g clip-path="url(#pvHeadClip)">`);
    if (G === 'infant') add(`<path d="M160 200 C172 204 182 212 186 225 C182 238 172 246 160 250 Z" fill="url(#pvHair)" opacity=".45"/><path d="M172 206 q8 6 10 14 M170 226 q9 0 13 2 M172 244 q8 -6 10 -14" stroke="${hairD}" stroke-width=".9" fill="none" opacity=".5"/>`);
    else if (G === 'elderly' && !F) add(`<path d="M150 180 C178 186 192 200 194 225 C192 250 178 264 150 270 Z" fill="url(#pvHair)"/><ellipse cx="176" cy="225" rx="17" ry="24" fill="url(#pvSkin)"/><ellipse cx="172" cy="216" rx="6" ry="9" fill="#ffffff" opacity=".28"/>`);
    else if (G === 'elderly' && F) { add(`<path d="M150 180 C178 186 194 200 196 225 C194 250 178 264 150 270 Z" fill="url(#pvHair)"/>`); for (let i = 0; i < 16; i++) { const y = 196 + (i % 8) * 8, x = 174 + Math.floor(i / 8) * 13 + (i % 2) * 3; add(`<circle cx="${x}" cy="${y}" r="5.5" fill="${mix(hair, '#ffffff', 0.1)}" stroke="${mix(hair, '#000000', 0.25)}" stroke-width="1"/>`); } }
    else {
      const deep = F ? 198 : 194; // women's hairline sits a little further forward
      add(`<path d="M150 180 C178 186 ${deep - 2} 200 ${deep} 225 C${deep - 2} 250 178 264 150 270 Z" fill="url(#pvHair)"/><path d="M176 194 C186 205 188 245 176 256" stroke="${hairD}" stroke-width="1" fill="none" opacity=".5"/>`);
      if (F) add(`<path d="M160 225 C172 223 184 222 ${deep} 222" stroke="${mix(hair, '#000000', 0.45)}" stroke-width="1.4" fill="none" opacity=".6"/>`); // parting
      else if (W.kid) add(`<path d="M${deep} 206 l5 3 -4 3 6 4 -5 3 6 5 -6 4 5 4 -6 3 5 4 -5 3" stroke="${hairD}" stroke-width="1.6" fill="url(#pvHair)" stroke-linejoin="round"/>`); // fringe
    }
    if (!F && G === 'adult') add(`<path d="M220 206 C232 208 240 216 240 225 C240 234 232 242 220 244 C226 236 228 230 228 225 C228 220 226 214 220 206 Z" fill="url(#pvStubble)"/>`);
    add(`<ellipse cx="226" cy="225" rx="12" ry="22" fill="${skD}" opacity=".14"/></g>`); // jaw shadow
    if (G === 'elderly') add(`<path d="M195 207 C198 216 198 234 195 243 M191 212 C193 219 193 231 191 238" stroke="${skDD}" stroke-width=".9" fill="none" opacity=".45"/><path d="M204 201 l-3 -4 M208 200 l-1 -5 M204 249 l-3 4 M208 250 l-1 5" stroke="${skDD}" stroke-width=".8" opacity=".5"/><path d="M226 216 C230 213 233 212 237 213 M226 234 C230 237 233 238 237 237" stroke="${skDD}" stroke-width=".9" fill="none" opacity=".45"/>`);
    if (G === 'infant' || G === 'young') add(`<circle cx="221" cy="205" r="6.5" fill="#f08a8a" opacity=".22"/><circle cx="221" cy="245" r="6.5" fill="#f08a8a" opacity=".22"/>`);
    // eyebrows, eyes, nose, mouth
    add(`<path d="M202 202 C204 207 204 214 202 219 M202 231 C204 236 204 243 202 248" stroke="${mix(hair, '#000000', 0.25)}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`);
    if (sedated) add(`<path d="M209 205 C214 209 214 215 209 219 M209 231 C214 235 214 241 209 245" stroke="#3a2a20" stroke-width="1.8" fill="none"/><path d="M211 207 l3 -1 M212 212 l3 0 M211 217 l3 1 M211 233 l3 -1 M212 238 l3 0 M211 243 l3 1" stroke="#3a2a20" stroke-width=".8"/>`);
    else add(`<path d="M208 205 C215 209 215 216 208 220 C204 216 204 209 208 205 Z" fill="#fbfbfb" stroke="${skDD}" stroke-width=".8"/><circle cx="210" cy="212.5" r="3" fill="#4b3a2a"/><circle cx="210.4" cy="212.5" r="1.4" fill="#111"/>
      <path d="M208 231 C215 235 215 242 208 246 C204 242 204 235 208 231 Z" fill="#fbfbfb" stroke="${skDD}" stroke-width=".8"/><circle cx="210" cy="238.5" r="3" fill="#4b3a2a"/><circle cx="210.4" cy="238.5" r="1.4" fill="#111"/>`);
    if (L.redEye && !sedated) add(`<path d="M208 205 C215 209 215 216 208 220 C204 216 204 209 208 205 Z" fill="#f3a6a0" opacity=".85"/><path d="M206 208 l3 2 M206 217 l3 -2 M213 209 l-2 2 M213 216 l-2 -2" stroke="#c4383a" stroke-width=".6"/><ellipse cx="210" cy="212.5" rx="3.2" ry="3.6" fill="#7a6a5a"/><ellipse cx="210.2" cy="212.5" rx="2.1" ry="2.6" fill="#111"/><ellipse cx="210" cy="212.5" rx="3.4" ry="3.8" fill="#dfe8ee" opacity=".45"/>`);
    if (F && G !== 'infant') add(sedated ? `<path d="M209 205 C214 209 214 215 209 219 M209 231 C214 235 214 241 209 245" stroke="#1d140e" stroke-width="2.6" fill="none"/>` : `<path d="M207 206 l-3 -2 M205.5 209 l-3.5 -1 M205 213 l-4 0 M207 232 l-3 -2 M205.5 235 l-3.5 -1 M205 239 l-4 0" stroke="#1d140e" stroke-width="1.1" stroke-linecap="round"/>`);
    add(`<path d="M214 222 C222 222 228 223 230 225 C228 227 222 228 214 228" fill="${skD}" opacity=".35"/><path d="M216 221 C224 221 229 222 231 225" stroke="${skL}" stroke-width="1.4" fill="none" opacity=".8"/><circle cx="229" cy="222.5" r="1.2" fill="${skDD}"/><circle cx="229" cy="227.5" r="1.2" fill="${skDD}"/>`);
    const lips = p.spo2 < 88 ? '#6a6fae' : mix(sk, F && !W.kid ? '#b8404f' : '#a8434a', F && !W.kid ? 0.65 : 0.55);
    add(`<path d="M233 216 C237 220 237 230 233 234 C230 230 230 220 233 216 Z" fill="${lips}"/><path d="M233 217 C235 221 235 229 233 233" stroke="${mix(lips, '#000000', 0.3)}" stroke-width=".8" fill="none"/>`);
    if (L.sweaty || (p.sym > 0.55 && !p.ventilated)) for (let i = 0; i < 6; i++) add(`<path d="M${188 + i * 6} ${198 + (i % 2) * 50} q2 5 0 7 q-2 -2 0 -7" fill="#bfe4ff" stroke="#8cc6f0" stroke-width=".5"/>`);
    if (L.facialOedema) add(`<ellipse cx="216" cy="225" rx="22" ry="26" fill="#e8726a" opacity=".22"/><path d="M233 214 C239 220 239 230 233 236" stroke="#c0565a" stroke-width="2" fill="none" opacity=".6"/>`);
    // airway devices
    const vent = p.ventilated || p.sga;
    if (p.ventilated) add(`<path d="M232 226 L 245 226" stroke="#e6f0ff" stroke-width="7"/><path d="M245 226 C 260 226, 250 100, 130 95" stroke="#7da7d9" stroke-width="9" fill="none" opacity=".9"/><text x="248" y="244" font-size="10" fill="#335">ETT</text>`);
    else if (p.sga) add(`<path d="M232 226 L 248 226" stroke="#7bc96f" stroke-width="9"/><path d="M248 226 C 260 226, 250 100, 130 95" stroke="#7da7d9" stroke-width="9" fill="none"/>`);
    else if (p.assisted) add(`<ellipse cx="224" cy="225" rx="18" ry="22" fill="#cfe8ff" opacity=".75" stroke="#79a"/><rect x="238" y="214" width="34" height="22" rx="8" fill="#ffc94d" opacity=".9"/><text x="255" y="212" font-size="10" fill="#335" text-anchor="middle">BVM</text>`);
    else if (eng.flags.hfno) add(`<path d="M226 214 q10 11 0 22" stroke="#bfe3ff" stroke-width="4" fill="none"/><path d="M226 214 C 190 170, 180 120, 120 90" stroke="#bfe3ff" stroke-width="7" fill="none"/>`);
    else if (p.fio2 >= 0.6) add(`<ellipse cx="224" cy="225" rx="17" ry="21" fill="#cfe8ff" opacity=".6" stroke="#8ab"/><ellipse cx="190" cy="255" rx="14" ry="10" fill="#d6f0d6" opacity=".7" stroke="#8b8"/><text x="190" y="280" font-size="9" fill="#456" text-anchor="middle">reservoir</text>`);
    else if (p.fio2 > 0.21) add(`<path d="M226 214 q10 11 0 22" stroke="#cfe8ff" stroke-width="3" fill="none"/>`);
    add(`</g>`); // end of head group
    if (eng.did('fona')) add(`<rect x="240" y="216" width="14" height="18" fill="#fff" stroke="#c33"/><text x="247" y="252" font-size="9" fill="#a22" text-anchor="middle">FONA</text>`);
    // lines
    add(`<path d="M395 300 C 420 360, 600 380, 700 330" stroke="#e5e5e5" stroke-width="2" fill="none"/>`); // peripheral IV to pole
    add(`<rect x="388" y="296" width="14" height="10" rx="2" fill="#f4a8c4"/>`);
    if (p.artLine) add(`<rect x="405" y="125" width="12" height="9" rx="2" fill="#e33"/><path d="M417 128 C 470 90, 600 60, 700 70" stroke="#ff8080" stroke-width="2" fill="none"/><text x="430" y="118" font-size="10" fill="#a22">art line</text>`);
    if (p.cvc) add(`<rect x="238" y="196" width="10" height="12" rx="2" fill="#4a7bd1"/><path d="M243 196 C 260 120, 600 40, 700 50" stroke="#93b4ef" stroke-width="2" fill="none"/>`);
    add(`</g>`); // end of body group — equipment below is drawn at full size
    // Ventilator / anaesthetic machine
    if (vent || set === 'theatre' || set === 'icu') {
      const lab = set === 'theatre' ? 'Anaesthetic machine' : 'Ventilator';
      add(`<rect x="12" y="20" width="135" height="165" rx="10" fill="#2b3340"/><rect x="20" y="30" width="119" height="76" rx="4" fill="#06121f"/>`);
      if (vent) {
        add(`<text x="26" y="46" fill="#9fe39f" font-size="10" font-family="monospace">FiO₂ ${p.fio2.toFixed(2)}  RR ${p.ventilated ? p.ventRR : '–'}</text>`);
        add(`<text x="26" y="61" fill="#9fe39f" font-size="10" font-family="monospace">PEEP ${p.ventilated ? p.peep : '–'}  Ppk ${Math.round(p.paw)}</text>`);
        add(`<text x="26" y="76" fill="${p.autoPEEP > 6 ? '#ff7070' : '#9fe39f'}" font-size="10" font-family="monospace">autoPEEP ${p.autoPEEP.toFixed(0)}</text>`);
        add(`<text x="26" y="94" fill="${p.paw > 35 ? '#ff7070' : '#66c'}" font-size="10" font-family="monospace">${p.paw > 35 ? 'HIGH PRESSURE' : 'VCV  Vt 450'}</text>`);
      } else add(`<text x="26" y="66" fill="#567" font-size="10" font-family="monospace">standby</text>`);
      add(`<text x="80" y="128" fill="#cdd6e0" font-size="11" text-anchor="middle">${lab}</text>`);
      if (set === 'theatre' && p.ventilated) add(`<rect x="24" y="140" width="20" height="36" rx="4" fill="${eng.did('stop_volatile') ? '#555' : '#c9a227'}"/><text x="56" y="164" fill="#cdd6e0" font-size="10">${eng.did('stop_volatile') ? 'vaporiser OFF' : 'volatile ON'}</text>`);
    } else if (p.fio2 > 0.21) {
      add(`<rect x="40" y="40" width="44" height="120" rx="18" fill="#f2f2f2" stroke="#8a8"/><rect x="40" y="40" width="44" height="22" rx="10" fill="#fff" /><text x="62" y="178" fill="#555" font-size="11" text-anchor="middle">O₂</text>`);
    }
    // infusion pumps on pole
    const infs = Object.keys(eng.pools).filter((k) => eng.pools[k].rate > 0 && S.drugById[k]);
    add(`<rect x="726" y="10" width="6" height="380" fill="#9aa"/>`);
    const nPumps = Math.max(2, infs.length);
    for (let i = 0; i < Math.min(nPumps, 7); i++) {
      const y = 22 + i * 48, id = infs[i];
      add(`<rect x="672" y="${y}" width="118" height="42" rx="6" fill="#e9edf2" stroke="#8796a6"/><rect x="678" y="${y + 6}" width="106" height="20" rx="3" fill="${id ? '#0d2a16' : '#1c2229'}"/>`);
      if (id) {
        const d = S.drugById[id];
        add(`<text x="681" y="${y + 20}" fill="#7dff9a" font-size="10" font-family="monospace">${d.name.slice(0, 15)}</text><text x="681" y="${y + 38}" fill="#234" font-size="10" font-family="monospace">${eng.pools[id].rate} ${d.inf.unit}</text>`);
      } else add(`<text x="681" y="${y + 20}" fill="#4a5a6a" font-size="10" font-family="monospace">idle</text>`);
    }
    // fluids bags
    const bags = [];
    if (eng.fluidIn.crystalloid) bags.push(['#e8f3ff', `Crystalloid ${eng.fluidIn.crystalloid} mL`]);
    if (eng.fluidIn.rbc) bags.push(['#a3182a', `Red cells ×${Math.round(eng.fluidIn.rbc / 280)}`]);
    if (eng.fluidIn.ffp) bags.push(['#f1d36b', `FFP ×${Math.round(eng.fluidIn.ffp / 270)}`]);
    if (eng.fluidIn.plt) bags.push(['#f3e6a8', 'Platelets']);
    bags.forEach(([c, t], i) => add(`<rect x="${560 - i * 62}" y="352" width="54" height="56" rx="8" fill="${c}" stroke="#889"/><text x="${587 - i * 62}" y="404" font-size="8" text-anchor="middle" fill="${c === '#a3182a' ? '#fff' : '#234'}">${t}</text>`));
    // defib / pacer
    if (eng.flags.cpr) add(`<g transform="${bodyT}"><ellipse cx="330" cy="225" rx="34" ry="20" fill="#f1c27d" stroke="#a0764a"/><ellipse cx="330" cy="225" rx="22" ry="12" fill="#e0ac69"><animate attributeName="rx" values="22;16;22" dur="0.55s" repeatCount="indefinite"/></ellipse><text x="330" y="265" font-size="12" font-weight="700" text-anchor="middle" fill="#b00">CPR</text></g>`);
    if (eng.did('pacing') || eng.did('sync_dc') || eng.did('defib')) { add(`<rect x="12" y="300" width="120" height="100" rx="10" fill="#f2c500"/><rect x="22" y="310" width="100" height="40" fill="#111"/><text x="72" y="335" fill="#4f4" font-size="11" text-anchor="middle">${p.rhythm === 'paced' ? 'PACING 70' : 'SYNC'}</text><text x="72" y="380" font-size="12" text-anchor="middle" fill="#222" font-weight="700">Defib</text>`); add(`<g transform="${bodyT}"><rect x="290" y="196" width="24" height="34" rx="5" fill="#2b2f36" opacity=".8"/><rect x="392" y="250" width="24" height="34" rx="5" fill="#2b2f36" opacity=".8"/></g>`); }
    // chest drain bottle
    if (eng.did('chest_drain')) add(`<rect x="335" y="360" width="50" height="52" rx="6" fill="#ddeeff" stroke="#69a"/><rect x="340" y="${395 - (scn.drainBlood || 6)}" width="40" height="${(scn.drainBlood || 6) + 12}" fill="#c33" opacity=".6"/><text x="360" y="356" font-size="9" text-anchor="middle" fill="#345">UWSD</text>`);
    if (eng.did('inv_pocus')) add(`<rect x="160" y="350" width="80" height="60" rx="6" fill="#d8dde3" stroke="#889"/><rect x="168" y="356" width="64" height="34" fill="#111"/><path d="M200 358 l-20 30 h40 z" fill="#555"/><text x="200" y="403" font-size="9" text-anchor="middle" fill="#333">Ultrasound</text>`);
    if (eng.fluidIn.rbc >= 560 || eng.flags.mhp) add(`<rect x="250" y="362" width="70" height="46" rx="6" fill="#3b4a5c"/><text x="285" y="388" font-size="9" fill="#fff" text-anchor="middle">Rapid infuser</text>`);
    // breath label
    return parts.join('');
  }

  class PatientView {
    constructor(el, eng, scn) { this.el = el; this.eng = eng; this.scn = scn; this.sig = ''; this.lastRR = -1; }
    signature() {
      const p = this.eng.p;
      const pumps = Object.keys(this.eng.pools).map((k) => k + this.eng.pools[k].rate).join();
      return [skinColour(this.eng), p.ventilated, p.sga, p.assisted, p.fio2, p.artLine, p.cvc, p.rhythm === 'paced', pumps, JSON.stringify(this.eng.fluidIn), Object.keys(this.eng.done).length,
        p.spo2 < 88, p.lactate > 4 || p.map < 55, p.cvp > 14, p.sym > 0.55, p.ventRR, p.peep, Math.round(p.paw / 3), Math.round(p.autoPEEP), this.eng.flags.hfno, this.eng.flags.cpr, p.arrested].join('|');
    }
    update() {
      const sig = this.signature();
      if (sig !== this.sig) {
        this.sig = sig;
        this.el.innerHTML = `<svg viewBox="0 0 800 420" class="patient-svg" role="img" aria-label="Patient on trolley with equipment">${build(this.eng, this.scn)}</svg>`;
        this.lastRR = -1;
      }
      const rr = this.eng.p.rr;
      if (Math.abs(rr - this.lastRR) > 1) {
        this.lastRR = rr;
        const chest = this.el.querySelector('.chest');
        if (chest) {
          if (rr < 2) chest.style.animation = 'none';
          else { chest.style.animation = `breathe ${(60 / rr).toFixed(2)}s ease-in-out infinite`; }
        }
      }
    }
  }
  S.PatientView = PatientView;
})();
