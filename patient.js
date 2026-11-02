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

  function build(eng, scn) {
    const p = eng.p, L = p.look || {}, set = scn.setting || 'ed';
    const sk = skinColour(eng);
    const sedated = p.ventilated || p.gcs < 9 || eng.flags.paralysed;
    const mottled = p.lactate > 4 || p.map < 55;
    const parts = [];
    const add = (s) => parts.push(s);
    // floor & bed
    const floor = set === 'theatre' ? '#dfe7e9' : set === 'icu' ? '#e7e4ee' : '#e9e6df';
    add(`<rect x="0" y="0" width="800" height="420" fill="${floor}"/>`);
    add(`<rect x="150" y="110" width="510" height="230" rx="18" fill="#9aa4ad"/><rect x="158" y="118" width="494" height="214" rx="14" fill="#f6f7f9"/>`);
    add(`<rect x="162" y="168" width="70" height="114" rx="16" fill="#ffffff" stroke="#d5d9de"/>`); // pillow
    // legs under blanket
    const blanket = set === 'theatre' ? '#5c9a86' : set === 'icu' ? '#8fb3d9' : '#b9c7d6';
    // arms
    add(`<g id="body">`);
    add(`<rect x="262" y="128" width="150" height="30" rx="14" fill="${sk}" />`);
    add(`<rect x="262" y="292" width="150" height="30" rx="14" fill="${sk}" />`);
    add(`<ellipse cx="420" cy="143" rx="14" ry="12" fill="${sk}"/><ellipse cx="420" cy="307" rx="14" ry="12" fill="${sk}"/>`);
    // torso (breathing)
    add(`<g class="chest" style="transform-origin:330px 225px">`);
    add(`<rect x="246" y="160" width="190" height="130" rx="40" fill="${sk}"/>`);
    if (L.gown !== false && set !== 'theatre') add(`<path d="M300 160 h136 v130 h-136 z" fill="#cfe0ee" opacity=".55"/>`);
    if (L.urticaria) { const n = 26; for (let i = 0; i < n; i++) { const x = 260 + ((i * 53) % 170), y = 168 + ((i * 37) % 115); add(`<ellipse cx="${x}" cy="${y}" rx="${5 + (i % 3) * 2}" ry="${4 + (i % 2) * 2}" fill="#d9534f" opacity=".45"/>`); } }
    // ECG electrodes
    [[275, 175], [275, 275], [410, 280]].forEach(([x, y]) => add(`<circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="#999"/><circle cx="${x}" cy="${y}" r="2" fill="#aaa"/>`));
    if (L.wound) add(`<path d="M${L.wound === 'left-chest' ? '300 250' : '330 215'} l14 6" stroke="#8b1a1a" stroke-width="4" stroke-linecap="round"/>`);
    if (eng.did('chest_drain')) add(`<path d="M330 290 C 340 330, 360 350, 380 375" stroke="#c9302c" stroke-width="5" fill="none" opacity=".8"/>`);
    if (eng.did('thoracostomy') || eng.did('needle_decompression')) add(`<circle cx="345" cy="285" r="5" fill="#a33"/>`);
    add(`</g>`);
    if (p.pregnant || L.pregnant) add(`<ellipse cx="455" cy="225" rx="62" ry="58" fill="${sk}" stroke="#d4a27c"/>`);
    // pelvis / legs + blanket
    add(`<rect x="430" y="168" width="225" height="114" rx="30" fill="${blanket}"/>`);
    add(`<path d="M440 225 H650" stroke="#00000018" stroke-width="3"/>`);
    if (mottled) add(`<text x="545" y="205" font-size="11" fill="#5b3f6c" text-anchor="middle">mottled knees</text>`);
    if (p.look.binder || eng.did('pelvic_binder')) add(`<rect x="425" y="165" width="34" height="120" rx="6" fill="#20232a"/><text x="442" y="230" fill="#fff" font-size="10" text-anchor="middle" transform="rotate(-90 442 230)">BINDER</text>`);
    if (set === 'theatre' && L.drapes !== false) add(`<rect x="300" y="150" width="355" height="150" rx="10" fill="#3f8c79" opacity=".92"/>${p.pregnant ? '<ellipse cx="455" cy="225" rx="64" ry="60" fill="#4a9a86" stroke="#2f6b5c"/>' : ''}<rect x="${L.surgField === 'lower' ? 480 : 380}" y="200" width="80" height="50" rx="6" fill="#d9a07f" stroke="#2f6b5c" stroke-width="4"/><text x="480" y="180" fill="#e9f5f1" font-size="11" text-anchor="middle">surgical drapes</text>`);
    // neck & head
    add(`<rect x="226" y="208" width="30" height="34" fill="${sk}"/>`);
    if (L.collar) add(`<rect x="222" y="200" width="30" height="50" rx="6" fill="#e9eef3" stroke="#89a" /><text x="237" y="230" font-size="8" text-anchor="middle" fill="#567" transform="rotate(-90 237 228)">COLLAR</text>`);
    if (p.cvp > 14 && !L.collar) add(`<path d="M232 210 q8 -6 16 0" stroke="#5a6aa3" stroke-width="3" fill="none"/><text x="240" y="196" font-size="10" fill="#334" text-anchor="middle">↑JVP</text>`);
    add(`<circle cx="200" cy="225" r="36" fill="${sk}"/>`);
    add(`<path d="M168 210 q-6 15 0 30" stroke="#6b4b32" stroke-width="10" fill="none" opacity=".6"/>`); // hair
    // face (eyes facing right / up)
    if (sedated) add(`<path d="M205 210 q6 3 12 0 M205 240 q6 3 12 0" stroke="#3a2a20" stroke-width="2" fill="none"/>`);
    else add(`<ellipse cx="211" cy="211" rx="4" ry="5" fill="#fff"/><circle cx="212" cy="211" r="2.4" fill="#222"/><ellipse cx="211" cy="239" rx="4" ry="5" fill="#fff"/><circle cx="212" cy="239" r="2.4" fill="#222"/>`);
    const lips = p.spo2 < 88 ? '#6a6fae' : '#b5655a';
    add(`<path d="M228 218 q6 7 0 14" stroke="${lips}" stroke-width="3" fill="none"/>`);
    if (L.sweaty || (p.sym > 0.55 && !p.ventilated)) for (let i = 0; i < 5; i++) add(`<path d="M${190 + i * 6} ${196 + (i % 2) * 52} q2 5 0 7 q-2 -2 0 -7" fill="#9fd3ff"/>`);
    if (L.facialOedema) add(`<circle cx="214" cy="225" r="20" fill="#e8726a" opacity=".25"/>`);
    // airway devices
    const vent = p.ventilated || p.sga;
    if (p.ventilated) add(`<path d="M232 226 L 245 226" stroke="#e6f0ff" stroke-width="7"/><path d="M245 226 C 260 226, 250 100, 130 95" stroke="#7da7d9" stroke-width="9" fill="none" opacity=".9"/><text x="248" y="244" font-size="10" fill="#335">ETT</text>`);
    else if (p.sga) add(`<path d="M232 226 L 248 226" stroke="#7bc96f" stroke-width="9"/><path d="M248 226 C 260 226, 250 100, 130 95" stroke="#7da7d9" stroke-width="9" fill="none"/>`);
    else if (p.assisted) add(`<ellipse cx="224" cy="225" rx="18" ry="22" fill="#cfe8ff" opacity=".75" stroke="#79a"/><rect x="238" y="214" width="34" height="22" rx="8" fill="#ffc94d" opacity=".9"/><text x="255" y="212" font-size="10" fill="#335" text-anchor="middle">BVM</text>`);
    else if (eng.flags.hfno) add(`<path d="M226 214 q10 11 0 22" stroke="#bfe3ff" stroke-width="4" fill="none"/><path d="M226 214 C 190 170, 180 120, 120 90" stroke="#bfe3ff" stroke-width="7" fill="none"/>`);
    else if (p.fio2 >= 0.6) add(`<ellipse cx="224" cy="225" rx="17" ry="21" fill="#cfe8ff" opacity=".6" stroke="#8ab"/><ellipse cx="190" cy="255" rx="14" ry="10" fill="#d6f0d6" opacity=".7" stroke="#8b8"/><text x="190" y="280" font-size="9" fill="#456" text-anchor="middle">reservoir</text>`);
    else if (p.fio2 > 0.21) add(`<path d="M226 214 q10 11 0 22" stroke="#cfe8ff" stroke-width="3" fill="none"/>`);
    if (eng.did('fona')) add(`<rect x="240" y="216" width="14" height="18" fill="#fff" stroke="#c33"/><text x="247" y="252" font-size="9" fill="#a22" text-anchor="middle">FONA</text>`);
    // lines
    add(`<path d="M395 300 C 420 360, 600 380, 700 330" stroke="#e5e5e5" stroke-width="2" fill="none"/>`); // peripheral IV to pole
    add(`<rect x="388" y="296" width="14" height="10" rx="2" fill="#f4a8c4"/>`);
    if (p.artLine) add(`<rect x="405" y="125" width="12" height="9" rx="2" fill="#e33"/><path d="M417 128 C 470 90, 600 60, 700 70" stroke="#ff8080" stroke-width="2" fill="none"/><text x="430" y="118" font-size="10" fill="#a22">art line</text>`);
    if (p.cvc) add(`<rect x="238" y="196" width="10" height="12" rx="2" fill="#4a7bd1"/><path d="M243 196 C 260 120, 600 40, 700 50" stroke="#93b4ef" stroke-width="2" fill="none"/>`);
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
    if (eng.did('pacing') || eng.did('sync_dc')) add(`<rect x="12" y="300" width="120" height="100" rx="10" fill="#f2c500"/><rect x="22" y="310" width="100" height="40" fill="#111"/><text x="72" y="335" fill="#4f4" font-size="11" text-anchor="middle">${p.rhythm === 'paced' ? 'PACING 70' : 'SYNC'}</text><text x="72" y="380" font-size="12" text-anchor="middle" fill="#222" font-weight="700">Defib</text><rect x="290" y="200" width="22" height="30" rx="4" fill="#333" opacity=".7"/>`);
    // chest drain bottle
    if (eng.did('chest_drain')) add(`<rect x="335" y="360" width="50" height="52" rx="6" fill="#ddeeff" stroke="#69a"/><rect x="340" y="${395 - (scn.drainBlood || 6)}" width="40" height="${(scn.drainBlood || 6) + 12}" fill="#c33" opacity=".6"/><text x="360" y="356" font-size="9" text-anchor="middle" fill="#345">UWSD</text>`);
    if (eng.did('inv_pocus')) add(`<rect x="160" y="350" width="80" height="60" rx="6" fill="#d8dde3" stroke="#889"/><rect x="168" y="356" width="64" height="34" fill="#111"/><path d="M200 358 l-20 30 h40 z" fill="#555"/><text x="200" y="403" font-size="9" text-anchor="middle" fill="#333">Ultrasound</text>`);
    if (eng.fluidIn.rbc >= 560 || eng.flags.mhp) add(`<rect x="250" y="362" width="70" height="46" rx="6" fill="#3b4a5c"/><text x="285" y="388" font-size="9" fill="#fff" text-anchor="middle">Rapid infuser</text>`);
    add(`</g>`);
    // breath label
    return parts.join('');
  }

  class PatientView {
    constructor(el, eng, scn) { this.el = el; this.eng = eng; this.scn = scn; this.sig = ''; this.lastRR = -1; }
    signature() {
      const p = this.eng.p;
      const pumps = Object.keys(this.eng.pools).map((k) => k + this.eng.pools[k].rate).join();
      return [skinColour(this.eng), p.ventilated, p.sga, p.assisted, p.fio2, p.artLine, p.cvc, p.rhythm === 'paced', pumps, JSON.stringify(this.eng.fluidIn), Object.keys(this.eng.done).length,
        p.spo2 < 88, p.lactate > 4 || p.map < 55, p.cvp > 14, p.sym > 0.55, p.ventRR, p.peep, Math.round(p.paw / 3), Math.round(p.autoPEEP), this.eng.flags.hfno].join('|');
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
