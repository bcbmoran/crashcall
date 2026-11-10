/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Theatre anaesthetic machine for the anaesthetic emergency scenarios (QRH crises, obstetric theatre cases).
   The routine GA cases use the full GA model in ga.js; these scenarios keep their own physiology and scoring,
   and this layer adds the same standard machine around them:
   - fresh gas flow, O₂ fraction (sets FiO₂ when the patient is on the circuit), vaporiser (sevoflurane or desflurane)
     with Fi/Et agent and age-adjusted MAC, a propofol TCI pump, ventilator/bag selector, facemask on the circuit
   - machine controls are wired to each scenario's own actions (e.g. MH: vaporiser off + TIVA + high flow = "stop volatile";
     power failure: bag = hand-ventilate; O₂ failure: open the cylinder, low flow), so scoring is unchanged
   - a deep volatile (> ~1.2 MAC) adds vasodilatation; switching the agent off with no TIVA in a ventilated patient risks awareness. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const AGENTS = { sevo: { name: 'Sevoflurane', mac40: 2.05, max: 8, step: 0.5 }, des: { name: 'Desflurane', mac40: 6.6, max: 18, step: 1 } };
  const macOf = (agent, age) => AGENTS[agent].mac40 * Math.pow(10, -0.00269 * ((age || 40) - 40));

  // Per-scenario starting state and extra machine features
  const CFG = {
    'an-qrh-hypertension': { agent: 'des', dial: 6, empty: true, note: 'Low-agent alarm: silenced.' },
    'an-qrh-power-failure': { tiva: 4, dial: 0, battery: true },
    'an-qrh-evacuation': {},
    'an-qrh-o2-failure': { fgf: 2, o2: 0.45, pipeline: 'o2' },
    'an-qrh-fire': { circuit: false, fgf: 0 },
    'an-high-spinal': { circuit: false },
    'an-pph': {},
    'an-last': {},
    'an-cico': { circuit: false, dial: 0 },
    'an-obs-failed-intubation': { circuit: false, dial: 0 },
    'an-qrh-laryngospasm': { circuit: false, dial: 0 },
  };
  const applies = (scn) => !!scn && /^an-/.test(scn.id) && !scn.ga && scn.setting === 'theatre';
  const xa = (e, id) => (e.scn.extraActions || []).some((a) => a.id === id);
  const critText = (e, re) => (e.scn.critical || []).some((c) => re.test(c.text));

  function setup(e) {
    const p = e.p, c = CFG[e.scn.id] || {};
    const onCircuit = c.circuit != null ? c.circuit : !!(p.ventilated || p.sga);
    const agent = c.agent || 'sevo', mac = macOf(agent, p.age);
    const dial = c.dial != null ? c.dial : onCircuit ? Math.round((mac / 0.9) * 2) / 2 : 0;
    e.mach = {
      agent, dial, empty: !!c.empty, fgf: c.fgf != null ? c.fgf : onCircuit ? 1 : 6, o2: c.o2 || (onCircuit ? p.fio2 : 1),
      fi: onCircuit ? dial : 0, et: onCircuit && !c.empty ? 0.9 * dial : c.empty ? 0.07 * mac : 0,
      circuit: onCircuit, mode: p.ventilated ? 'vent' : 'bag', tiva: { on: !!c.tiva, target: c.tiva || 0 },
      eto2: onCircuit ? p.fio2 * 0.95 : 0.2, cfg: c, touched: false, awareT: 0,
    };
  }

  function tick(e, dt) {
    const m = e.mach; if (!m) return;
    const p = e.p, mac = macOf(m.agent, p.age), f = e.flags;
    if ((p.ventilated || p.sga) && !m.circuit) m.circuit = true;
    if (!p.ventilated && m.mode === 'vent') m.mode = 'bag';
    if (m.empty && (f.refilled || f.tiva)) { if (f.refilled) { m.empty = false; if (m.dial < 4) m.dial = 6; } }
    const fresh = m.cfg.pipeline === 'o2' ? (f.cylOpen || f.portable ? m.fgf : 0) : m.fgf;
    const dialEff = m.empty ? 0 : m.dial;
    const tauFi = fresh > 0 ? 120 / Math.max(0.3, fresh) : 200;
    m.fi += ((m.circuit && fresh > 0 ? dialEff : m.circuit ? m.fi * 0.98 : 0) - m.fi) * Math.min(1, dt / Math.min(60, tauFi));
    const V = p.ventilated && !p.ventStopped ? 1 : p.V || 0;
    const tauEt = V > 0.25 ? 22 / clamp(V, 0.3, 1.4) : 160;
    if (!(m.empty && !f.refilled)) m.et += ((m.circuit ? 0.9 * m.fi : 0) - m.et) * Math.min(1, dt / tauEt);
    m.eto2 += ((m.circuit && V > 0.2 ? p.fio2 * 0.95 : V > 0.2 ? 0.2 : m.eto2) - m.eto2) * Math.min(1, dt / 9);
    // Deep volatile → vasodilatation and myocardial depression (adds to the scenario's own physiology)
    const mf = m.et / mac;
    if (mf > 1.15 && !p.arrested) e.anaesSuppress = Math.max(e.anaesSuppress, clamp(0.35 * (mf - 1), 0, 0.6));
    // Awareness: a ventilated (usually paralysed) patient with no hypnotic
    const tiva = m.tiva.on || f.tiva;
    if (m.touched && p.ventilated && mf < 0.4 && !tiva && !p.arrested) {
      m.awareT += dt;
      if (m.awareT > 20 && !m.awareMsg) { m.awareMsg = true; e.say('No anaesthetic is being delivered: end-tidal agent is very low and there is no TIVA running. Risk of accidental awareness.', 'bad'); }
      if (m.awareT > 45 && !m.awareHarm) { m.awareHarm = true; e.harm('Anaesthetic agent switched off without starting TIVA — risk of accidental awareness (NAP5)'); }
    } else m.awareT = Math.max(0, m.awareT - dt);
    autoActions(e);
  }

  // Machine settings that complete a scenario action
  function autoActions(e) {
    const m = e.mach, p = e.p, tiva = m.tiva.on || e.flags.tiva;
    if (e.scn.id === 'an-mh' && !e.did('stop_volatile') && m.dial === 0 && m.fgf >= 10 && tiva) e.doAction('stop_volatile');
    if (critText(e, /turn off anaesthetic agents/i) && m.touched && m.dial === 0 && !e.did('stop_volatile')) e.doAction('stop_volatile');
    if (xa(e, 'o2_low_flow') && m.touched && m.fgf <= 1 && !e.did('o2_low_flow') && (e.flags.cylOpen || e.flags.portable)) e.doAction('o2_low_flow');
    if (xa(e, 'fire_o2_off') && m.touched && (m.fgf === 0 || m.o2 <= 0.25) && !e.did('fire_o2_off')) e.doAction('fire_o2_off');
  }

  function onAction(e, id) {
    const m = e.mach; if (!m) return;
    if (/mask|bvm|jaw_thrust_cpap|rsi_|intubat|sga|lma|^pc_|^pd_|fona/.test(id) && id !== 'oxy_nasal') { m.circuit = true; if (/mask|bvm|jaw/.test(id)) { m.o2 = Math.max(m.o2, 1); m.fgf = Math.max(m.fgf, 6); } }
    if (id === 'stop_volatile') { m.dial = 0; m.fgf = Math.max(m.fgf, 10); if (e.scn.id === 'an-mh' || /TIVA/.test((S.actionById.stop_volatile || {}).name || '')) { if (!m.tiva.on && e.scn.id === 'an-mh') m.tiva = { on: true, target: 4 }; } }
    if (['start_tiva', 'o2_tiva', 'ev_tiva'].includes(id)) m.tiva = { on: true, target: m.tiva.target || 4 };
    if (id === 'fire_o2_off') { m.fgf = 0; m.o2 = 0.21; }
    if (id === 'o2_low_flow') m.fgf = Math.min(m.fgf, 0.5);
    if (id === 'pw_handvent' || id === 'isolate_equipment') m.mode = 'bag';
    if (id === 'lighten_anaesthesia') m.dial = Math.max(0, Math.round(m.dial * 0.75 * 2) / 2);
    if (id === 'deepen_anaesthesia' && !m.empty && !m._deepSync) m.dial = Math.min(AGENTS[m.agent].max, m.dial + (m.agent === 'des' ? 2 : 1));
  }

  // ---------------- UI ----------------
  function liveHTML(e) {
    const m = e.mach, p = e.p, mac = macOf(m.agent, p.age), A = AGENTS[m.agent];
    const rd = (k, v, cls) => `<div class="ga-rd ${cls || ''}"><span>${k}</span><b>${v}</b></div>`;
    const pipeFail = m.cfg.pipeline === 'o2' && !e.flags.cylOpen;
    return `${rd('FiO₂ / EtO₂', m.circuit ? `${Math.round(p.fio2 * 100)}% / ${Math.round(m.eto2 * 100)}%` : 'not on circuit')}
      ${rd(`${A.name.slice(0, 4)} Fi / Et`, `${r1(m.fi)} / ${r1(m.et)} %`, m.et / mac < 0.5 && p.ventilated && !(m.tiva.on || e.flags.tiva) ? 'warn' : '')}
      ${rd('MAC (age-adj.)', (m.et / mac).toFixed(2), m.et / mac > 1.6 || (m.et / mac < 0.5 && p.ventilated && !(m.tiva.on || e.flags.tiva)) ? 'warn' : '')}
      ${rd('Propofol TCI', m.tiva.on || e.flags.tiva ? `${m.tiva.target || 4} µg/mL (Ce)` : 'off')}
      ${rd('Ventilation', p.ventilated ? (m.mode === 'vent' && !p.ventStopped ? `ventilator ${p.ventMode || 'VCV'}` : p.ventStopped ? '<span class="bad">ventilator stopped</span>' : 'bag (manual)') : m.circuit ? 'spontaneous / bag via facemask' : '—')}
      ${pipeFail ? rd('O₂ pipeline', '0 kPa — FAILURE', 'warn') : m.cfg.pipeline === 'o2' ? rd('O₂ supply', 'backup cylinder', '') : ''}
      ${m.cfg.battery ? rd('Mains power', e.flags.ventDead ? 'OFF — ventilator battery flat' : 'OFF — on battery', 'warn') : ''}`;
  }
  function panelHTML(e) {
    const m = e.mach, p = e.p, A = AGENTS[m.agent];
    const btn = (id, label, cls) => `<button class="btn ${cls || ''} ${e.did(id) ? 'done' : ''}" data-mact="${id}">${esc(label)}${e.did(id) ? ' ✓' : ''}</button>`;
    const extras = [];
    if (!m.circuit) extras.push(`<button class="btn" data-mach-mask>Facemask on the circuit (100% O₂, CPAP via APL)</button>`);
    if (xa(e, 'check_agent')) extras.push(btn('check_agent', 'Check vaporiser level / end-tidal agent'));
    if (xa(e, 'refill_vaporiser')) extras.push(btn('refill_vaporiser', 'Refill / replace the vaporiser'));
    if (xa(e, 'o2_open_cylinder')) extras.push(btn('o2_open_cylinder', 'Open the backup O₂ cylinder (back of machine)'));
    if (xa(e, 'o2_portable')) extras.push(btn('o2_portable', 'Portable O₂ cylinder + self-inflating bag'));
    if (xa(e, 'pw_pumps')) extras.push(btn('pw_pumps', 'Check TCI pumps are running on battery'));
    if (xa(e, 'fire_o2_off')) extras.push(btn('fire_o2_off', 'Turn the oxygen off'));
    if (p.ventilated) extras.push(btn('isolate_equipment', 'Self-inflating bag directly on the tube (bypass the machine)'));
    const tiva = m.tiva.on || e.flags.tiva;
    return `<div class="grp"><h4>Anaesthetic machine</h4>
      <div class="ga-readouts mach-live">${liveHTML(e)}</div>
      ${m.cfg.note ? `<p class="small muted">${esc(m.cfg.note)}</p>` : ''}
      <div class="ga-machine">
        <label>Fresh gas flow <output>${r1(m.fgf)} L/min</output><input type="range" min="0" max="15" step="0.5" value="${m.fgf}" data-mach="fgf"></label>
        <label>O₂ in fresh gas <output>${Math.round(m.o2 * 100)}%</output><input type="range" min="0.25" max="1" step="0.05" value="${m.o2}" data-mach="o2"></label>
        <label>${A.name} vaporiser <output>${m.agent === 'des' ? Math.round(m.dial) : r1(m.dial)}%</output><input type="range" min="0" max="${A.max}" step="${A.step}" value="${m.dial}" data-mach="dial"></label>
      </div>
      <div class="ga-pump"><b>Propofol 1% TCI (Schnider, Ce)</b>
        <label>Target <input type="number" min="0" max="8" step="0.5" value="${m.tiva.target || 4}" data-mach-tci> µg/mL</label>
        <button class="btn sm" data-mach-tiva="go">${tiva ? 'Update' : 'Start'}</button>${tiva ? '<button class="btn sm" data-mach-tiva="stop">Stop</button>' : ''}</div>
      ${p.ventilated ? `<div class="ga-mode"><span>Ventilation:</span><button class="btn sm ${m.mode === 'vent' ? 'on' : ''}" data-mach-mode="vent">Ventilator</button><button class="btn sm ${m.mode === 'bag' ? 'on' : ''}" data-mach-mode="bag">Bag (manual)</button></div>` : ''}
      ${extras.length ? `<div class="act-grid">${extras.join('')}</div>` : ''}
    </div>
    ${p.ventilated && S.Vent ? `<div class="grp"><h4>Ventilator</h4>${S.Vent.html(e, true)}</div>` : ''}
    <p class="small muted">The machine controls act on the scenario: e.g. FiO₂ follows the O₂ setting when the patient is on the circuit; vaporiser off with no TIVA risks awareness.</p>`;
  }
  function wire(body, e, guard, rerender) {
    const m = e.mach; if (!m) return;
    const p = e.p;
    body.querySelectorAll('[data-mach]').forEach((r) => {
      const out = r.parentElement.querySelector('output');
      r.oninput = () => { if (out) out.textContent = r.dataset.mach === 'o2' ? Math.round(r.value * 100) + '%' : r.dataset.mach === 'fgf' ? r1(+r.value) + ' L/min' : (m.agent === 'des' ? Math.round(r.value) : r1(+r.value)) + '%'; };
      r.onchange = () => {
        if (!guard()) return;
        const k = r.dataset.mach, v = +r.value, old = m[k]; m[k] = v; m.touched = true;
        const lab = k === 'fgf' ? `Fresh gas flow ${r1(v)} L/min` : k === 'o2' ? `O₂ ${Math.round(v * 100)}% in fresh gas` : `${AGENTS[m.agent].name} vaporiser ${r1(v)}%`;
        e.emit({ type: 'action', id: 'mach_' + k, text: lab, kind: 'act' }); e.mark('mach_' + k);
        if (k === 'o2' && m.circuit) { if (p.ventilated) e.setVent('fio2', v); else { p.fio2 = v; p.lastFio2 = v; } }
        if (k === 'dial') {
          if (v > old && !e.did('deepen_anaesthesia') && v - old >= (m.agent === 'des' ? 2 : 1)) { m._deepSync = true; e.doAction('deepen_anaesthesia'); m._deepSync = false; }
          if (v < old && xa(e, 'lighten_anaesthesia') && !e.did('lighten_anaesthesia')) { const keep = m.dial; e.doAction('lighten_anaesthesia'); m.dial = keep; }
        }
        autoActions(e); rerender();
      };
    });
    body.querySelectorAll('[data-mach-tiva]').forEach((b) => (b.onclick = () => {
      if (!guard()) return;
      const inp = body.querySelector('[data-mach-tci]'), tgt = clamp(+(inp && inp.value) || 4, 0, 8);
      if (b.dataset.machTiva === 'stop') { m.tiva = { on: false, target: tgt }; e.flags.tiva = false; e.emit({ type: 'action', id: 'mach_tci_stop', text: 'Propofol TCI stopped', kind: 'act' }); }
      else {
        const was = m.tiva.on; m.tiva = { on: true, target: tgt }; m.touched = true;
        e.emit({ type: 'action', id: 'mach_tci', text: `Propofol TCI ${was ? 'target changed to' : 'started at'} ${tgt} µg/mL (effect site)`, kind: 'act' });
        const id = ['start_tiva', 'o2_tiva', 'ev_tiva'].find((x) => xa(e, x));
        if (id && !e.did(id)) e.doAction(id); else e.flags.tiva = true;
      }
      autoActions(e); rerender();
    }));
    body.querySelectorAll('[data-mach-mode]').forEach((b) => (b.onclick = () => {
      if (!guard() || b.dataset.machMode === m.mode) return;
      m.mode = b.dataset.machMode;
      if (m.mode === 'bag') { e.emit({ type: 'action', id: 'mach_bag', text: 'Switched to bag (manual) ventilation on the circuit', kind: 'act' }); if (xa(e, 'pw_handvent')) e.doAction('pw_handvent'); }
      else { e.emit({ type: 'action', id: 'mach_vent', text: 'Switched back to the ventilator', kind: 'act' }); if (e.flags.ventDead) e.say('The ventilator has no power — keep hand-ventilating.', 'warn'); }
      rerender();
    }));
    const mask = body.querySelector('[data-mach-mask]');
    if (mask) mask.onclick = () => {
      if (!guard()) return;
      const id = ['oxy_mask', 'ob_mask'].find((x) => xa(e, x)) || 'jaw_thrust_cpap';
      e.doAction(id); m.circuit = true; m.o2 = 1; m.fgf = Math.max(m.fgf, 6); rerender();
    };
    body.querySelectorAll('[data-mact]').forEach((b) => (b.onclick = () => { if (!guard()) return; e.doAction(b.dataset.mact); rerender(); }));
  }

  S.Theatre = { applies, setup, tick, onAction, panelHTML, liveHTML, wire, macOf, AGENTS };
})();
