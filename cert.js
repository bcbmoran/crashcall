/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Completion certificates: a one-page A4 PDF built in the browser (no libraries) for each successfully stabilised scenario.
   Uses the PDF standard fonts (Helvetica) with WinAnsi encoding, so nothing is embedded or downloaded. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const W = { R: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500], B: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556] };
  const FIELD = { EM: 'Emergency medicine', ICU: 'Critical care', Anaes: 'Anaesthesia', Paeds: 'Paediatrics' };
  const LV = { junior: 'Junior trainee', senior: 'Senior trainee', consultant: 'Consultant' };
  const MAP = { '—': 151, '–': 150, '’': 146, '‘': 145, '“': 147, '”': 148, '•': 149, '…': 133, '€': 128, '™': 153 };
  const MAPV = new Set(Object.values(MAP));
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '⁵': '5', '²': '2', '≥': '>=', '≤': '<=', '→': '->', '↑': 'up ', '↓': 'down ', '≈': '~', '±': '+/-', '−': '-', '✓': '', '✗': '' };
  // Convert to single-byte WinAnsi
  function enc(str) {
    let out = '';
    for (const ch of String(str == null ? '' : str)) {
      if (SUB[ch] != null) { out += SUB[ch]; continue; }
      if (MAP[ch]) { out += String.fromCharCode(MAP[ch]); continue; }
      const c = ch.charCodeAt(0);
      if (c >= 32 && c < 256 && (!(c >= 127 && c < 160) || MAPV.has(c))) { out += ch; continue; } // already encoded (idempotent)
      const n = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      out += /^[\x20-\x7e]+$/.test(n) ? n : '?';
    }
    return out;
  }
  const width = (s, font, size) => { let w = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); w += (W[font][c - 32] || 556); } return (w * size) / 1000; };
  function wrap(text, font, size, maxW) {
    const words = enc(text).split(/\s+/), lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (width(t, font, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((x) => x.toFixed(3)).join(' '); };

  // ---- page drawing ----
  function build(o) {
    const PW = 842, PH = 595, c = [];
    const col = (hex, stroke) => c.push(rgb(hex) + (stroke ? ' RG' : ' rg'));
    const text = (s, x, y, font, size, hex, align) => {
      const e = enc(s), f = font === 'B' ? '/F2' : font === 'I' ? '/F3' : '/F1';
      const w = width(e, font === 'B' ? 'B' : 'R', size);
      const xx = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x;
      col(hex || '#1b2733');
      c.push(`BT ${f} ${size} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td (${esc(e)}) Tj ET`);
    };
    const line = (x1, y1, x2, y2, hex, lw) => { col(hex, true); c.push(`${lw || 1} w ${x1} ${y1} m ${x2} ${y2} l S`); };
    const rect = (x, y, w, h, hex, fill, lw) => { col(hex, !fill); c.push(`${lw || 1} w ${x} ${y} ${w} ${h} re ${fill ? 'f' : 'S'}`); };
    const ACC = '#0b5cad', GOLD = '#b8892d', MUTED = '#5b6673';
    // background and borders
    rect(0, 0, PW, PH, '#fbfcfe', true);
    rect(22, 22, PW - 44, PH - 44, ACC, false, 3);
    rect(30, 30, PW - 60, PH - 60, GOLD, false, 0.8);
    // ECG motif
    col(ACC, true);
    const ecg = [[0, 0], [40, 0], [48, 6], [56, 0], [66, 0], [71, -6], [77, 30], [83, -14], [88, 0], [104, 0], [114, 9], [126, 0], [170, 0]];
    c.push('1.8 w 1 J 1 j ' + ecg.map(([x, y], i) => `${(PW / 2 - 85 + x).toFixed(1)} ${(PH - 78 + y).toFixed(1)} ${i ? 'l' : 'm'}`).join(' ') + ' S');
    text('CrashCall', PW / 2, PH - 112, 'B', 20, ACC, 'c');
    text('Acute and critical care simulation', PW / 2, PH - 128, 'R', 9.5, MUTED, 'c');
    text('CERTIFICATE OF COMPLETION', PW / 2, PH - 168, 'B', 26, '#1b2733', 'c');
    line(PW / 2 - 120, PH - 180, PW / 2 + 120, PH - 180, GOLD, 1.2);
    text('This is to certify that', PW / 2, PH - 206, 'I', 12, MUTED, 'c');
    text(o.name, PW / 2, PH - 240, 'B', 28, '#1b2733', 'c');
    text('successfully stabilised the simulated patient in the scenario', PW / 2, PH - 266, 'I', 12, MUTED, 'c');
    const tl = wrap(o.title, 'B', 19, PW - 200);
    tl.slice(0, 2).forEach((l, i) => text(l, PW / 2, PH - 296 - i * 22, 'B', 19, ACC, 'c'));
    let y = PH - 296 - (Math.min(2, tl.length) - 1) * 22 - 22;
    text(o.sub, PW / 2, y, 'R', 11, MUTED, 'c');
    // details boxes
    y -= 22;
    const boxes = [['Date', o.date], ['Grade', o.grade], ['Time to stabilise', o.time], ['Critical actions', o.crit], ['Hints used', String(o.hints)]];
    const bw = 128, gap = 10, bx0 = PW / 2 - (boxes.length * bw + (boxes.length - 1) * gap) / 2;
    boxes.forEach(([k, v], i) => { const x = bx0 + i * (bw + gap); rect(x, y - 34, bw, 40, '#eef3fa', true); text(k.toUpperCase(), x + bw / 2, y - 6, 'B', 7, MUTED, 'c'); text(v, x + bw / 2, y - 24, 'B', 12, '#1b2733', 'c'); });
    y -= 56;
    // learning points
    if (o.points.length) {
      text('Key learning points', 60, y, 'B', 10.5, ACC);
      y -= 14;
      o.points.forEach((p) => { const ls = wrap(p, 'R', 8.8, PW - 140); ls.slice(0, 2).forEach((l, j) => { text((j ? '   ' : '•  ') + l, 64, y, 'R', 8.8, '#2b3540'); y -= 11.5; }); y -= 2; });
    }
    // footer
    line(60, 78, PW - 60, 78, '#c9d3df', 0.6);
    text(`Certificate ID: ${o.id}`, 60, 62, 'R', 8, MUTED);
    text('crashcall.co.uk', PW - 60, 62, 'B', 8, ACC, 'r');
    wrap('Self-directed simulation for education and CPD reflection. This certificate records completion of a simulated scenario; it is not an assessment of clinical competence. Content is aligned to UK guidelines; always follow local policy.', 'R', 7.2, PW - 120).forEach((l, i) => text(l, PW / 2, 48 - i * 9, 'R', 7.2, MUTED, 'c'));
    return pdf(c.join('\n'), PW, PH, o.title);
  }

  function pdf(content, PW, PH, title) {
    const objs = [];
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].forEach((f) => objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    objs.push(`<< /Title (${esc(enc('CrashCall certificate - ' + title))}) /Creator (CrashCall) /Producer (CrashCall) >>`);
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  const fmt = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
  function details(rec, name) {
    const s = (S.SCENARIOS || []).find((x) => x.id === rec.sid) || { title: rec.sid, field: '' };
    const crit = rec.crit || [];
    const pts = ((s.debrief && s.debrief.points) || []).filter((p) => typeof p === 'string').slice(0, 3);
    const d = new Date(rec.at || Date.now());
    return {
      name: name || 'Participant', title: s.title, sub: [FIELD[s.field] || s.field, s.shock || s.category].filter(Boolean).join('  •  '),
      date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), grade: LV[rec.level] || rec.level || '',
      time: fmt(rec.ms), crit: crit.length ? `${crit.filter((c) => c.d).length} / ${crit.length}` : '-', hints: rec.hints || 0,
      points: pts, id: 'CC-' + String(rec.rid || d.getTime().toString(36)).toUpperCase().slice(0, 14),
    };
  }
  function download(rec, name) {
    const o = details(rec, name), blob = build(o);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `CrashCall certificate - ${o.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60)} - ${o.date}.pdf`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const storeName = (v) => { try { if (v != null) localStorage.setItem('crashcall.certName', v); return localStorage.getItem('crashcall.certName') || ''; } catch (e) { return v || ''; } };
  // Ask for the name to print (pre-filled from the account), then download
  function open(rec) {
    const P = S.Progress, acct = P && P.user ? P.user.name || '' : '';
    const nm = storeName() || acct;
    const esc2 = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    if (!S.ui || !S.ui.openModal) { download(rec, nm); return; }
    S.ui.openModal('Download certificate', `<p>A PDF certificate for <b>${esc2(details(rec).title)}</b>, ${esc2(details(rec).date)}. You can download it again at any time from <b>My progress</b>.</p>
      <label class="cert-name">Name on the certificate <input type="text" maxlength="60" value="${esc2(nm)}" placeholder="e.g. Dr Jane Smith" data-cert-name></label>
      <div class="row-btns"><button class="btn primary" data-cert-go>Download PDF</button></div>`);
    const body = document.getElementById('modalBody') || document;
    const inp = body.querySelector('[data-cert-name]'), go = body.querySelector('[data-cert-go]');
    if (inp) inp.focus();
    if (go) go.onclick = () => { const v = (inp && inp.value.trim()) || 'Participant'; storeName(v); download(rec, v); };
  }
  const defaultName = () => storeName() || (S.Progress && S.Progress.user ? S.Progress.user.name || '' : '');
  // Inline form (used in the debrief and My progress): name box + download button
  function formHTML(key) { const v = String(defaultName()).replace(/"/g, '&quot;'); return `<div class="cert-row"><span class="cert-ic">📄</span><label>Name on certificate <input type="text" maxlength="60" value="${v}" placeholder="e.g. Dr Jane Smith" data-cert-name="${key}"></label></div>`; }
  function nameFrom(root, key) { const i = root.querySelector(`[data-cert-name="${key}"]`); const v = (i && i.value.trim()) || defaultName() || 'Participant'; storeName(v); return v; }
  S.Cert = { open, download, formHTML, nameFrom, defaultName, build: (rec, name) => build(details(rec, name)), enc };
})();
