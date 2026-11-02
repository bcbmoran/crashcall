/* Scenario library — part 3: Association of Anaesthetists Quick Reference Handbook (QRH) crises
 * not covered elsewhere. Every scenario cites its QRH guideline number (June 2023 edition). */
(function () {
  const S = window.Sim;
  const clamp = S.clamp;
  const { add, any, toward, vaso, labs } = S.scnUtil;
  const Q = (id) => S.QRH.ref(id);
  const fio2High = (e) => e.p.fio2 >= 0.9;
  const kPa = (e) => (e.p.etco2 / 7.5).toFixed(1);
  const noImg = { cxr: { media: 'cxr_normal', report: 'Not immediately available in theatre — portable film can be requested.' }, ct: [] };
  const vent = (e) => `Ventilated FiO₂ ${e.p.fio2.toFixed(2)}, RR ${e.p.ventRR}, PEEP ${e.p.peep}. Ppeak ${Math.round(e.p.paw)} cmH₂O. EtCO₂ ${kPa(e)} kPa. SpO₂ ${e.p.spo2}%.`;
  const circ = (e) => `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)} (MAP ${Math.round(e.p.map)}).`;

  // =====================================================================
  // QRH 1-1  Key basic plan — blocked HME filter
  // =====================================================================
  add({
    id: 'an-qrh-filter', title: 'Rising airway pressure and falling SpO₂ (key basic plan)', field: 'Anaes', shock: null, category: 'Airway / equipment', difficulty: 1, setting: 'theatre',
    stem: '58-year-old man, 2 hours into a laparoscopic colectomy with humidified gases. Over a few minutes airway pressures have risen, tidal volumes have fallen, EtCO₂ is climbing and SpO₂ is starting to drift down. The cause is not obvious.',
    qrh: ['1-1', '2-3', '2-2'],
    patient: { age: 58, sex: 'M', weight: 88, ventilated: true, fio2: 0.4, ventRR: 14, peep: 6, effort: 0, shunt: 0.15, ventObstruct: 0.45, hrBase: 84, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) { const p = e.p; if (!e.flags.fixed && !e.flags.bagging) p.ventObstruct = Math.min(0.95, p.ventObstruct + 0.0012 * dt); },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'isolate_equipment') { if (e.flags.fixed) return { handled: true, msg: 'Hand ventilation easy — pressures normal.' }; e.flags.bagging = true; e.flags.localised = true; p.ventObstruct = 0; return { handled: true, msg: 'Self-inflating bag connected directly to the catheter mount… still stiff. Bag directly onto the tube connector (filter removed): easy ventilation, chest rising! The obstruction is in the filter/HME — the problem is the equipment, not the patient.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'replace_filter') { e.flags.fixed = true; e.flags.bagging = false; p.ventObstruct = 0; return { handled: true, msg: 'HME filter replaced — the old one is sodden with condensate from the active humidifier. Back on the ventilator: pressures and tidal volumes normal.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'suction_tube') return { handled: true, msg: 'Suction catheter will not pass through the filter port; passed directly down the tube it goes freely — the tube itself is patent.' };
      if (ev.type === 'drug' && (ev.id === 'salbutamol_iv' || ev.id === 'magnesium')) return { msg: 'No wheeze — bronchodilators make no difference. Work through the key basic plan systematically.', kind: 'warn' };
    },
    exam: (e) => ({
      A: 'Size 8.0 ETT at 22 cm, cuff up, no leak. Active humidifier and HME filter in series in the circuit.',
      B: vent(e) + ` Equal, quiet air entry bilaterally. No wheeze. Capnogram: ${e.p.ventObstruct > 0.3 ? 'small, slurred plateau' : 'normal'}.`,
      C: circ(e), D: 'Anaesthetised, BIS 45. Paralysed.', E: 'Pneumoperitoneum 12 mmHg, mild head-down tilt.',
    }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus rhythm.' }, ...noImg, pocus: [{ label: 'Lung ultrasound', media: 'us_sliding', report: 'Bilateral lung sliding — no pneumothorax.' }] },
    critical: [
      { text: 'Increase FiO₂ to 1.0', check: fio2High },
      { text: 'Isolate the patient from the machine (self-inflating bag directly on the tube)', check: (e) => e.did('isolate_equipment') },
      { text: 'Replace the blocked filter/HME', check: (e) => e.flags.fixed },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Water from active humidification saturates the HME filter', kind: 'cause' },
      { t: 'Resistance to gas flow ↑ → high airway pressure, low tidal volume', rx: 'Hand-ventilate to feel compliance' },
      { t: 'Alveolar hypoventilation → ↑ PaCO₂, ↓ PAO₂', rx: '100% O₂' },
      { t: 'Bag directly on the tube bypasses the circuit: easy = equipment problem', rx: 'Isolate equipment; replace filter' },
      { t: 'Hypoxaemia → arrhythmia, arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'When the cause of a crisis is not obvious, use the QRH key basic plan: oxygen supply → airway device → breathing → circulation → depth → surgical factors.',
        'Isolating the patient from the machine with a self-inflating bag directly on the tube rapidly localises the problem to “equipment” or “patient”.',
        'An HME filter must never be used with an active humidifier — water-logging causes complete obstruction.',
        'Use the capnograph and feel of the bag; do not treat with bronchodilators without signs of bronchospasm.',
      ],
      refs: [Q('1-1'), Q('2-3'), 'Association of Anaesthetists: Checking anaesthetic equipment (2019)', 'MHRA Medical Device Alert: breathing system filters and HMEs with heated humidifiers'],
    },
  });

  // =====================================================================
  // QRH 2-1  Peri-operative cardiac arrest (VF) — ALS mode
  // =====================================================================
  add({
    id: 'an-qrh-vf-arrest', title: 'VF arrest under anaesthesia', field: 'Anaes', shock: 'Cardiogenic (arrest)', difficulty: 2, setting: 'theatre', als: true, arrestLimit: 420,
    stem: '71-year-old man with ischaemic heart disease, intubated for an emergency laparotomy. Shortly after knife-to-skin he develops runs of VT that degenerate. The monitor alarms; no arterial trace.',
    qrh: ['2-1', '3-13'],
    patient: { age: 71, sex: 'M', weight: 82, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, rhythm: 'vf', contract: 0.8, artLine: true, hrBase: 78, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; },
    rosc(e) {
      const ok = (e.shocks || 0) >= 3 && e.did('adrenaline') && e.did('amiodarone') && e.flags.cpr;
      if (ok) { e.flags.roscWait = (e.flags.roscWait || 0) + 0.1; if (e.flags.roscWait > 4) { e.p.contract = 0.72; return true; } }
      return false;
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'defib' && e.shockable()) {
        const n = (e.shocks || 0) + 1;
        if (n === 3) return { msg: 'After the 3rd shock: give adrenaline 1 mg and amiodarone 300 mg IV (RCUK).', kind: 'info' };
      }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && (e.shocks || 0) < 3 && e.p.arrested) return { msg: 'In VF/pVT, adrenaline is given after the 3rd shock (then every 3–5 min).', kind: 'warn' };
      if (ev.type === 'drug' && ev.id === 'amiodarone' && (e.shocks || 0) < 3 && e.p.arrested) return { msg: 'Amiodarone 300 mg is given after the 3rd shock.', kind: 'warn' };
      if (ev.type === 'action' && ev.id === 'stop_volatile') return { handled: true, msg: 'Volatile off, FiO₂ 1.0.', kind: 'good' };
    },
    tick(e) { if (e.did('stop_volatile') || e.did('vent_fio2')) { /* noop */ } },
    exam: (e) => ({
      A: 'ETT in situ — capnography ' + (e.flags.cpr ? 'trace present with compressions (~2.5 kPa)' : 'flat'),
      B: vent(e), C: e.p.arrested ? 'No palpable carotid pulse. Arterial line flat apart from compression artefact.' : circ(e) + ' Pulse palpable.',
      D: 'Anaesthetised.', E: 'Laparotomy wound open, minimal bleeding.',
    }),
    inv: { bloods: (e) => labs(e, { k: 4.6, trop: 2400 }), gas: true, ecg: (e) => ({ desc: e.p.arrested ? 'Coarse ventricular fibrillation.' : 'Sinus rhythm with anterior ST elevation.' }), ...noImg, pocus: [{ label: 'Subcostal (during pulse check)', media: null, report: (e) => 'No pericardial effusion. ' + (e.p.arrested ? 'Fibrillating ventricle.' : 'Poor anterior wall motion.') }] },
    critical: [
      { text: 'Start CPR within seconds', check: (e) => e.did('cpr_on') },
      { text: 'Defibrillate (3 shocks)', check: (e) => (e.shocks || 0) >= 3 },
      { text: 'Adrenaline 1 mg and amiodarone 300 mg after the 3rd shock', check: (e) => e.did('adrenaline') && e.did('amiodarone') },
      { text: 'Call for help / declare arrest', check: (e) => e.did('call_help') },
      { text: 'FiO₂ 1.0 and turn off anaesthetic agents', check: (e) => fio2High(e) || e.did('stop_volatile') },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Myocardial ischaemia + surgical catecholamine surge', kind: 'cause' },
      { t: 'Re-entrant ventricular activity → VF: no coordinated contraction', rx: 'Defibrillate, CPR 30:2 (continuous if intubated)' },
      { t: 'Zero cardiac output; coronary perfusion only during compressions', rx: 'Minimise pauses; adrenaline + amiodarone after 3rd shock' },
      { t: 'Treat reversible causes: 4 Hs, 4 Ts, plus anaesthetic causes', rx: 'Stop agents, FiO₂ 1.0, check tube' },
      { t: 'Hypoxic brain injury', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Peri-operative arrest: declare it, start compressions, call the arrest team, FiO₂ 1.0, stop anaesthetic agents and confirm the airway.',
        'Shockable rhythm: shock, 2 min CPR, re-assess; adrenaline 1 mg and amiodarone 300 mg after the 3rd shock, then adrenaline every 3–5 min (amiodarone 150 mg after the 5th).',
        'Once intubated, give continuous compressions with ventilation at 10/min; use waveform capnography for CPR quality and ROSC.',
        'After ROSC follow QRH 3-13 / RCUK post-resuscitation care: SpO₂ 94–98%, normocapnia, MAP ≥ 65, 12-lead ECG and early coronary angiography.',
      ],
      refs: [Q('2-1'), 'Resuscitation Council UK: Adult Advanced Life Support guidelines (2021)', Q('3-13')],
    },
  });

  // =====================================================================
  // QRH 2-2  Hypoxia — endobronchial intubation
  // =====================================================================
  add({
    id: 'an-qrh-endobronchial', title: 'Desaturation after positioning', field: 'Anaes', shock: null, category: 'Hypoxaemia', difficulty: 1, setting: 'theatre',
    stem: '34-year-old woman (BMI 24) for laparoscopic gynaecology. After pneumoperitoneum and steep head-down tilt the SpO₂ has fallen to 92% (and is still falling) and airway pressure has risen by 8 cmH₂O.',
    qrh: ['2-2', '1-1'],
    patient: { age: 34, sex: 'F', weight: 64, ventilated: true, fio2: 0.4, ventRR: 12, peep: 5, effort: 0, shunt: 0.38, pawExtra: 8, atel: true, hrBase: 86, look: { drapes: true, surgField: 'lower' } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) { if (!e.flags.fixed) e.p.shunt = Math.min(0.55, e.p.shunt + 0.0005 * dt); },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'reposition_tube') { if (e.flags.fixed) return { handled: true, msg: 'Tube at 21 cm — correct.' }; e.flags.fixed = true; p.shunt = 0.05; p.pawExtra = 0; return { handled: true, msg: 'Tube at 25 cm at the teeth — it has migrated into the right main bronchus with head-down tilt. Cuff down, withdrawn to 21 cm: bilateral air entry restored.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'isolate_equipment') return { handled: true, msg: 'Hand-ventilating directly on the tube: still slightly stiff and the left chest is barely moving — the problem is with the patient/tube, not the machine.' };
      if (ev.type === 'action' && ev.id === 'suction_tube') return { handled: true, msg: 'Suction catheter passes easily — tube is patent.' };
      if (ev.type === 'vent' && ev.key === 'peep' && ev.value > 8 && !e.flags.fixed) return { msg: 'More PEEP barely changes SpO₂ — one lung is not being ventilated at all.', kind: 'warn' };
    },
    exam: (e) => ({
      A: `ETT size 7.0, ${e.flags.fixed ? '21' : '25'} cm at the teeth.`,
      B: vent(e) + (e.flags.fixed ? ' Equal air entry bilaterally.' : ' Reduced chest movement and absent breath sounds on the LEFT. Trachea central. No wheeze.'),
      C: circ(e), D: 'Anaesthetised.', E: 'Steep Trendelenburg, pneumoperitoneum 14 mmHg.',
    }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus rhythm.' }, ...noImg, pocus: [{ label: 'Lung ultrasound (left)', media: 'us_sliding', report: (e) => e.flags.fixed ? 'Lung sliding present bilaterally.' : 'Left: no sliding but a lung pulse is present — lung not ventilated (not a pneumothorax).' }] },
    critical: [
      { text: '100% oxygen', check: fio2High },
      { text: 'Check tube depth / position', check: (e) => e.flags.fixed },
    ],
    targets: { map: 65, spo2: 95 },
    hint: { steps: [
      { t: 'Head-down tilt + pneumoperitoneum push the carina upward', kind: 'cause' },
      { t: 'ETT tip enters right main bronchus', rx: 'Check depth at teeth, auscultate, withdraw' },
      { t: 'Left lung perfused but not ventilated → shunt', rx: '100% O₂ (only partly helps a true shunt)' },
      { t: 'Hypoxaemia, raised airway pressure', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 2-2: pause surgery, 100% O₂, then check the airway device: position, patency and capnogram.',
        'Endobronchial migration is common with head-down tilt and pneumoperitoneum — note the tube depth at the teeth after intubation and again after positioning.',
        'Unilateral absent breath sounds: consider endobronchial intubation before pneumothorax — needle decompression of a normal chest is harmful.',
        'Shunt responds poorly to FiO₂ and PEEP; fix the cause.',
      ],
      refs: [Q('2-2'), Q('1-1'), 'Difficult Airway Society / AoA: Capnography — No trace = wrong place (2021)'],
    },
  });

  // =====================================================================
  // QRH 2-3  Increased airway pressure — mucus plug in tube
  // =====================================================================
  add({
    id: 'an-qrh-tube-plug', title: 'Sudden high airway pressure (blocked tube)', field: 'Anaes', shock: null, category: 'Airway / equipment', difficulty: 2, setting: 'theatre',
    stem: '66-year-old smoker with COPD, intubated for a laparotomy 3 hours ago with copious secretions. Peak pressure has jumped, the capnograph has a small sloping trace and the SpO₂ is falling.',
    qrh: ['2-3', '1-1', '2-2'],
    patient: { age: 66, sex: 'M', weight: 70, ventilated: true, fio2: 0.5, ventRR: 12, peep: 5, effort: 0, shunt: 0.12, ventObstruct: 0.5, hrBase: 92, vco2: 1.1, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) { if (!e.flags.fixed) e.p.ventObstruct = Math.min(0.9, e.p.ventObstruct + 0.0008 * dt); },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'isolate_equipment') { e.flags.localised = true; return { handled: true, msg: 'Self-inflating bag directly on the tube: still very stiff. The machine and circuit are NOT the problem — it is the tube or the patient.' }; }
      if (ev.type === 'action' && ev.id === 'suction_tube') { if (e.flags.fixed) return { handled: true, msg: 'Catheter passes freely.' }; e.flags.fixed = true; p.ventObstruct = 0; return { handled: true, msg: 'Suction catheter meets resistance 2 cm beyond the tip of the connector… with suction a large, tenacious mucus plug is removed. Ventilation is now easy.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'replace_filter') return { handled: true, msg: 'Filter and catheter mount changed — no difference.' };
      if (ev.type === 'drug' && ev.id === 'salbutamol_iv') return { msg: 'No wheeze on auscultation and no response to bronchodilator.', kind: 'warn' };
    },
    exam: (e) => ({
      A: 'ETT 8.0 at 22 cm, no kinks visible externally.',
      B: vent(e) + (e.flags.fixed ? ' Good bilateral air entry, scattered crackles.' : ' Very quiet chest bilaterally, equal. No wheeze. Bag feels “like a brick wall”.'),
      C: circ(e), D: 'Anaesthetised, paralysed (TOF 0).', E: 'Abdomen open, no change in surgical field.',
    }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus tachycardia.' }, ...noImg, pocus: [{ label: 'Lung ultrasound', media: 'us_sliding', report: 'Sliding present bilaterally (reduced amplitude).' }] },
    critical: [
      { text: '100% oxygen and hand ventilation', check: fio2High },
      { text: 'Isolate equipment to localise the problem', check: (e) => e.did('isolate_equipment') },
      { text: 'Pass a suction catheter down the tube', check: (e) => e.did('suction_tube') },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Thick secretions accumulate and plug the tube lumen', kind: 'cause' },
      { t: 'Airway resistance ↑↑ → Ppeak ↑, tidal volume ↓', rx: 'Isolate equipment; suction catheter test' },
      { t: 'Hypoventilation → hypercapnia & hypoxaemia', rx: '100% O₂' },
      { t: 'If unable to clear: change the tube', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 2-3: confirm high pressure by hand ventilation, then isolate the patient from the equipment to localise the problem.',
        'A suction catheter that will not pass means the tube is blocked or kinked — clear it or replace the tube.',
        'Bronchospasm needs wheeze (or a silent chest with a characteristic capnogram) — do not assume it.',
        'Consider the full differential: cuff herniation, endobronchial tube, pneumothorax, light anaesthesia/coughing, chest wall rigidity, pneumoperitoneum.',
      ],
      refs: [Q('2-3'), Q('1-1')],
    },
  });

  // =====================================================================
  // QRH 2-4  Hypotension under anaesthesia
  // =====================================================================
  add({
    id: 'an-qrh-hypotension', title: 'Hypotension after induction', field: 'Anaes', shock: 'Distributive (drug-induced)', difficulty: 1, setting: 'theatre',
    stem: '79-year-old woman with hypertension on ramipril and amlodipine (both taken this morning), nil by mouth since midnight. Induced with propofol and fentanyl, maintained on sevoflurane 1.2 MAC. BP 74/38, HR 52.',
    qrh: ['2-4', '2-6'],
    patient: { age: 79, sex: 'F', weight: 60, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, vasoplegia: 0.72, venodil: 0.14, vol: 0.9, hrBase: 50, baro: 0.5, lactate: 1.4, look: { drapes: true, surgField: 'lower' } },
    init(e) { e.flags.paralysed = true; e.anaesSuppress = 0.5; },
    tick(e, dt) {
      const p = e.p;
      if (e.did('lighten_anaesthesia')) { p.vasoplegia = toward(p.vasoplegia, 0.85, 0.01, dt); p.venodil = toward(p.venodil, 0.06, 0.01, dt); }
      else { e.anaesSuppress = Math.max(e.anaesSuppress, 0.45); p.vasoplegia = Math.max(0.5, p.vasoplegia - 0.0004 * dt); }
      if (e.did('deepen_anaesthesia')) p.vasoplegia = Math.max(0.5, p.vasoplegia - 0.0015 * dt);
    },
    extraActions: [{ id: 'lighten_anaesthesia', name: 'Reduce volatile to ~0.8 MAC (check BIS)' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'lighten_anaesthesia') return { handled: true, msg: 'Sevoflurane reduced to 0.8 MAC; BIS 48 — adequate depth maintained.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'deepen_anaesthesia') return { handled: true, harm: 'Deepening anaesthesia in a hypotensive patient without an indication' };
      if (ev.type === 'fluid' && e.fluidIn.crystalloid > 1500) return { msg: 'Large volumes — this is mainly vasodilatation; use a vasopressor.', kind: 'warn' };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e) + ' Clear chest, normal pressures.', C: circ(e) + ' Sinus rhythm.', D: `Anaesthetised, sevoflurane ${e.did('lighten_anaesthesia') ? '0.8' : '1.2'} MAC, BIS ${e.did('lighten_anaesthesia') ? 48 : 31}.`, E: 'Surgery not yet started. No blood loss.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus bradycardia 50/min, LVH.' }, ...noImg, pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Hyperdynamic, under-filled LV; no effusion.' }, { label: 'IVC', media: 'us_ivc_flat', report: 'Small IVC.' }] },
    critical: [
      { text: 'Vasopressor (metaraminol / phenylephrine / ephedrine)', check: vaso },
      { text: 'Treat bradycardia (glycopyrronium / atropine / ephedrine)', check: (e) => any(e, 'glycopyrronium', 'atropine', 'ephedrine') },
      { text: 'Fluid bolus', check: (e) => e.did('fluid') },
      { text: 'Reduce anaesthetic depth appropriately', check: (e) => e.did('lighten_anaesthesia') },
    ],
    targets: { map: 65, spo2: 94, hrMin: 55 },
    hint: { steps: [
      { t: 'ACE-i/CCB + fasting + propofol + deep volatile', kind: 'cause' },
      { t: 'Arteriolar and venous dilatation (↓SVR, ↓ venous return)', rx: 'Metaraminol / phenylephrine; reduce depth' },
      { t: 'Blunted baroreflex — HR does not rise', rx: 'Glycopyrronium / ephedrine' },
      { t: 'Relative hypovolaemia after fasting', rx: 'Fluid 250 mL' },
      { t: 'Organ hypoperfusion (AKI, myocardial injury, stroke)', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 2-4: exclude airway/breathing problems first; then check HR — treat bradycardia, give vasopressor, fluid bolus, and match anaesthetic depth to need.',
        'Elderly patients on RAS inhibitors are prone to post-induction hypotension; intra-operative MAP < 65 mmHg is associated with AKI and myocardial injury.',
        'Ephedrine is useful when hypotension and bradycardia coexist; metaraminol or phenylephrine when HR is adequate.',
        'Use processed EEG to avoid excessive depth in the elderly.',
      ],
      refs: [Q('2-4'), Q('2-6'), 'Association of Anaesthetists: Guidelines for the peri-operative care of people with frailty / older people (2021)', 'Perioperative Quality Initiative: blood pressure targets (endorsed by Royal College of Anaesthetists CPOC)'],
    },
  });

  // =====================================================================
  // QRH 2-5  Hypertension — empty vaporiser (light anaesthesia)
  // =====================================================================
  add({
    id: 'an-qrh-hypertension', title: 'Intra-operative hypertension and tachycardia', field: 'Anaes', shock: null, category: 'Hypertension', difficulty: 2, setting: 'theatre',
    stem: '45-year-old man, 90 minutes into an open hernia repair under GA with desflurane. BP has crept up to 175/105 and HR 118. He is sweating and his pupils look large. The surgeon is mid-dissection.',
    qrh: ['2-5', '1-1'],
    patient: { age: 45, sex: 'M', weight: 86, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, stress: 0.9, hrBase: 74, look: { drapes: true, surgField: 'lower', sweaty: true } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p;
      const agent = e.flags.refilled || e.flags.tiva;
      const anal = clamp(e.E('alfentanil') * 4, 0, 0.35);
      const prop = clamp(e.E('propofol') * 3, 0, 0.5);
      const target = agent ? 0 : 1.1 - anal - prop * 0.6;
      p.stress = clamp(toward(p.stress, target, agent ? 0.02 : 0.004, dt), 0, 1.3);
      if ((e.flags.lightT || 0) > 150 && !e.flags.awareHarm) { e.flags.awareHarm = true; e.harm('Prolonged inadequate anaesthesia — high risk of accidental awareness'); }
      if (!agent) e.flags.lightT = (e.flags.lightT || 0) + dt;
      p.look.sweaty = p.stress > 0.4;
    },
    extraActions: [
      { id: 'check_agent', name: 'Check end-tidal agent concentration & vaporiser' },
      { id: 'refill_vaporiser', name: 'Refill / replace the vaporiser' },
      { id: 'start_tiva', name: 'Start TIVA (propofol TCI)' },
    ],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'check_agent') { e.flags.found = true; return { handled: true, msg: 'End-tidal desflurane 0.4% (0.07 MAC)! The vaporiser is EMPTY — the low-agent alarm had been silenced. Risk of awareness.', kind: 'bad' }; }
      if (ev.type === 'action' && ev.id === 'refill_vaporiser') { e.flags.refilled = true; return { handled: true, msg: 'Vaporiser refilled, desflurane 6% delivered with high fresh gas flow — end-tidal rising to 1 MAC.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'start_tiva') { e.flags.tiva = true; return { handled: true, msg: 'Propofol TCI started — effect-site 4 mcg/mL.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'deepen_anaesthesia') { if (!e.flags.found) return { handled: true, msg: 'You turn the dial up — but the end-tidal agent does not rise. Check the agent concentration.', kind: 'warn' }; e.flags.refilled = true; return { handled: true, msg: 'Anaesthesia deepened.', kind: 'good' }; }
      if (ev.type === 'drug' && (ev.id === 'labetalol' || ev.id === 'esmolol') && !e.flags.refilled && !e.flags.tiva) return { harm: 'β-blocker used to mask signs of inadequate anaesthesia (awareness risk) before excluding the cause' };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e) + ' Clear chest. Patient not breathing against the ventilator.', C: circ(e) + ' Sinus tachycardia.', D: `Pupils ${e.p.stress > 0.4 ? 'dilated, lacrimation' : 'small'}. BIS ${e.p.stress > 0.4 ? 78 : 44}. TOF 0/4.`, E: 'Bladder not palpable. No tourniquet. Afebrile.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus tachycardia, no ischaemia.' }, ...noImg, pocus: [] },
    critical: [
      { text: 'Check end-tidal agent / vaporiser (find the cause)', check: (e) => e.did('check_agent') },
      { text: 'Re-establish anaesthesia (refill vaporiser or TIVA)', check: (e) => e.flags.refilled || e.flags.tiva },
      { text: 'Analgesia / temporising agent (alfentanil or propofol bolus)', check: (e) => any(e, 'alfentanil', 'propofol') },
    ],
    targets: { map: 65, mapMax: 105, hrMax: 100, spo2: 94 },
    hint: { steps: [
      { t: 'Empty vaporiser — agent alarm silenced', kind: 'cause', rx: 'Check end-tidal agent' },
      { t: 'Inadequate anaesthesia + surgical stimulation', rx: 'Refill / TIVA; alfentanil 10 mcg/kg' },
      { t: 'Sympathetic surge: ↑ HR, ↑ SVR, sweating, mydriasis', rx: 'Treat the cause before antihypertensives' },
      { t: 'Awareness with paralysis; myocardial ischaemia', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 2-5: recheck BP, increase anaesthesia and reduce stimulus; exclude hypoxia, hypercarbia, inadequate anaesthesia/analgesia, drug error and medical causes.',
        'Paralysed patients cannot move — tachycardia, hypertension, sweating, lacrimation and mydriasis may be the only signs of awareness. NAP5 found most awareness occurred at induction, emergence or with TIVA/agent delivery failure.',
        'Never silence agent alarms without acting. Use processed EEG when there is risk of awareness.',
        'Antihypertensives (labetalol/esmolol 0.5 mg/kg, GTN, hydralazine) are temporising once inadequate anaesthesia has been excluded.',
      ],
      refs: [Q('2-5'), 'NAP5: Accidental awareness during general anaesthesia (RCoA & AoA, 2014)', Q('1-1')],
    },
  });

  // =====================================================================
  // QRH 2-7  Tachycardia — fast AF with hypotension
  // =====================================================================
  add({
    id: 'an-qrh-fast-af', title: 'Intra-operative fast AF with hypotension', field: 'Anaes', shock: 'Cardiogenic (arrhythmic)', difficulty: 2, setting: 'theatre',
    stem: '74-year-old man having an anterior resection. After bowel mobilisation he goes into an irregular narrow-complex tachycardia at 170/min and the BP starts to fall. Pre-op K⁺ was 3.2 after bowel prep.',
    qrh: ['2-7', '2-4'],
    patient: { age: 74, sex: 'M', weight: 78, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, rhythm: 'af', fixedRate: 172, contract: 0.62, vol: 0.88, hrBase: 76, k: 3.1, artLine: true, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p;
      if (p.rhythm === 'af') {
        const ctrl = clamp(e.E('amiodarone') * 1.5 + e.E('magnesium') * 0.8, 0, 1);
        p.fixedRate = toward(p.fixedRate, 172 - 60 * ctrl, 0.02, dt);
        p.contract = Math.max(0.4, p.contract - 0.0006 * dt);
        if (ctrl > 0.8 && e.did('magnesium') && e.did('amiodarone')) { e.flags.chemo = (e.flags.chemo || 0) + dt; if (e.flags.chemo > 40) { p.rhythm = 'sinus'; p.hrBase = 84; e.say('Reverted to sinus rhythm after amiodarone and magnesium.', 'good'); } }
      } else p.contract = toward(p.contract, 1, 0.01, dt);
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'sync_dc') {
        if (p.rhythm !== 'af') return { handled: true, harm: 'DC cardioversion of sinus rhythm' };
        e.flags.dc = (e.flags.dc || 0) + 1;
        if (e.flags.dc === 1 && p.k < 3.5 && !e.did('magnesium')) return { handled: true, msg: 'Synchronised shock 120 J: brief sinus rhythm, then AF recurs. Correct electrolytes (K⁺/Mg²⁺) and shock again / give amiodarone.', kind: 'warn' };
        p.rhythm = 'sinus'; p.hrBase = 84; return { handled: true, msg: 'Synchronised shock 150 J — sinus rhythm restored.', kind: 'good' };
      }
      if (ev.type === 'drug' && ev.id === 'magnesium') { p.k = Math.max(p.k, 3.2); return { msg: 'Magnesium given (QRH: 50 mg/kg, adult 2 g over 10 min). Potassium replacement started via the central line.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'adenosine') return { msg: 'Transient slowing reveals fibrillatory waves — this is AF, not SVT. Adenosine will not cardiovert AF.', kind: 'warn' };
      if (ev.type === 'drug' && (ev.id === 'labetalol' || ev.id === 'esmolol') && p.map < 65) return { noHarm: false };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e), C: circ(e) + (e.p.rhythm === 'af' ? ' Irregularly irregular.' : ' Regular.'), D: 'Anaesthetised, adequate depth (BIS 45).', E: 'Estimated blood loss 300 mL. Warm.' }),
    inv: { bloods: (e) => labs(e, { k: e.p.k.toFixed(1), extra: [['Magnesium', '0.58 mmol/L']] }), gas: true, ecg: (e) => ({ desc: e.p.rhythm === 'af' ? `Atrial fibrillation with fast ventricular response ~${e.p.hr}/min, narrow QRS.` : 'Sinus rhythm.' }), ...noImg, pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Tachycardic, under-filled LV; no effusion.' }] },
    critical: [
      { text: '12-lead ECG / rhythm identification', check: (e) => e.did('inv_ecg') },
      { text: 'Synchronised DC cardioversion (worsening hypotension)', check: (e) => e.did('sync_dc') },
      { text: 'Correct electrolytes (magnesium ± potassium)', check: (e) => e.did('magnesium') },
      { text: 'Check K⁺ / Mg²⁺ (blood gas or labs)', check: (e) => e.did('inv_gas') || e.did('inv_bloods') },
    ],
    targets: { map: 65, spo2: 94, hrMax: 110 },
    hint: { steps: [
      { t: 'Surgical stimulation + hypokalaemia/hypomagnesaemia', kind: 'cause', rx: 'Replace K⁺ and Mg²⁺' },
      { t: 'Chaotic atrial activity; rapid AV conduction', rx: 'Synchronised DC shock if unstable' },
      { t: 'Loss of atrial kick + short diastole → ↓ SV', rx: 'Amiodarone 5 mg/kg for rate/rhythm' },
      { t: 'Hypotension, myocardial ischaemia', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 2-7: no pulse → 2-1; worsening hypotension → synchronised cardioversion (adult 50–100 J upwards; child 1 J/kg).',
        'Look for causes: hypovolaemia, light anaesthesia, central line/wire, electrolyte disturbance, ischaemia, sepsis, embolus, MH.',
        'Magnesium 50 mg/kg (adult 2 g) and amiodarone 5 mg/kg (adult 300 mg) for rate/rhythm control; correct potassium.',
        'Adenosine is diagnostic only in AF — it will not cardiovert it.',
      ],
      refs: [Q('2-7'), 'Resuscitation Council UK ALS Guidelines 2021: Tachycardia algorithm', 'NICE NG196: Atrial fibrillation (2021)'],
    },
  });

  // =====================================================================
  // QRH 2-8  Peri-operative hyperthermia — serotonin syndrome
  // =====================================================================
  add({
    id: 'an-qrh-serotonin', title: 'Rising temperature under anaesthesia', field: 'Anaes', shock: null, category: 'Metabolic', difficulty: 3, setting: 'theatre',
    stem: '48-year-old woman on high-dose sertraline, having a parathyroidectomy. She received tramadol at induction and methylthioninium chloride (methylene blue) to localise the gland. Under a forced-air warmer her temperature is now 39.4 °C and rising, HR 132.',
    qrh: ['2-8', '3-8'],
    patient: { age: 48, sex: 'F', weight: 68, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, temp: 39.4, tempRate: 0.004, stress: 0.5, vasoplegia: 0.9, vco2: 1.25, vo2: 1.25, hrBase: 90, lacGen: 0.0006, look: { drapes: true, sweaty: true, flush: 0.4 } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p;
      const benzo = clamp(e.E('midazolam') * 2 + e.E('lorazepam') * 1.5, 0, 0.6);
      const cpz = clamp(e.E('chlorpromazine') * 4, 0, 0.6);
      const drive = (e.did('stop_trigger') ? 0.4 : 1) * (1 - benzo) * (1 - cpz);
      const heat = e.flags.warmerOff ? 0 : 0.0018;
      p.tempRate = 0.005 * drive + heat - (e.did('active_cooling') ? 0.006 : 0) - (p.temp > 38 ? 0.0008 : 0);
      p.stress = clamp(0.6 * drive, 0, 1); p.vco2 = 1 + 0.25 * drive; p.vo2 = p.vco2; p.lacGen = 0.0007 * drive;
      if (p.temp < 38 && e.did('active_cooling') && !e.flags.cooledMsg) { e.flags.cooledMsg = true; e.say('Core temperature below 38.5 °C — stop active cooling to avoid overshoot.', 'warn'); }
      if (p.temp < 37.2) p.tempRate = Math.max(0, p.tempRate);
    },
    extraActions: [{ id: 'remove_warming', name: 'Turn off forced-air warmer, remove blankets' }, { id: 'core_temp', name: 'Measure core temperature (oesophageal probe)' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'remove_warming') { e.flags.warmerOff = true; return { handled: true, msg: 'Forced-air warmer off, blankets removed, theatre temperature lowered.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'core_temp') return { handled: true, msg: `Oesophageal temperature ${e.p.temp.toFixed(1)} °C.` };
      if (ev.type === 'action' && ev.id === 'stop_trigger') return { handled: true, msg: 'No further serotonergic drugs (tramadol, methylthioninium, ondansetron, fentanyl) will be given.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'dantrolene') return { msg: 'Dantrolene given. EtCO₂ is only mildly raised, no rigidity and the absorber is not hot — MH is unlikely; dantrolene will not treat serotonin toxicity.', kind: 'warn' };
      if (ev.type === 'drug' && ev.id === 'chlorpromazine') return { msg: 'Chlorpromazine (QRH 2-8: 25–50 mg IM) for suspected serotonin syndrome — watch for hypotension.', kind: 'good' };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e), C: circ(e) + ' Warm, flushed, vasodilated peripheries.', D: 'Anaesthetised. Pupils dilated. Inducible ankle clonus and hyper-reflexia bilaterally; no masseter or generalised rigidity.', E: `Temp ${e.p.temp.toFixed(1)} °C. ${e.flags.warmerOff ? 'Warmer off.' : 'Forced-air warmer set to 43 °C on the upper body.'} Profuse sweating.` }),
    inv: { bloods: (e) => labs(e, { k: 4.4, extra: [['Creatine kinase', '420 U/L'], ['Calcium (adjusted)', '2.71 mmol/L']] }), gas: true, ecg: { desc: 'Sinus tachycardia.' }, ...noImg, pocus: [] },
    critical: [
      { text: 'Remove external heating', check: (e) => e.flags.warmerOff },
      { text: 'Stop serotonergic drugs', check: (e) => e.did('stop_trigger') },
      { text: 'Benzodiazepine and/or chlorpromazine', check: (e) => any(e, 'midazolam', 'lorazepam', 'chlorpromazine') },
      { text: 'Active cooling (≥ 39 °C)', check: (e) => e.did('active_cooling') },
    ],
    targets: { map: 65, spo2: 94, tempMax: 38.5, hrMax: 110 },
    hint: { steps: [
      { t: 'SSRI + tramadol + methylthioninium (MAOI)', kind: 'cause', rx: 'Stop serotonergic drugs' },
      { t: 'Excess CNS serotonin (5-HT2A) → autonomic & neuromuscular hyperactivity', rx: 'Benzodiazepine; chlorpromazine' },
      { t: 'Clonus, hyper-reflexia, mydriasis, sweating, tachycardia', rx: 'Remove warming, active cooling' },
      { t: 'Hyperthermia → rhabdomyolysis, DIC, multi-organ failure', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 2-8: call for help, measure core temperature, remove heating; decide between fever and non-febrile hyperthermia and consider MH (QRH 3-8).',
        'Serotonin toxicity: clonus and hyper-reflexia distinguish it from MH (rigidity, rapidly rising EtCO₂, hot absorber).',
        'Methylthioninium chloride is an MAO inhibitor — avoid with SSRIs/SNRIs (MHRA warning).',
        'Cool actively if ≥ 39 °C and stop at ~38.5 °C; benzodiazepines for agitation/shivering; chlorpromazine (or cyproheptadine orally) for serotonin syndrome.',
      ],
      refs: [Q('2-8'), Q('3-8'), 'MHRA Drug Safety Update: Methylthioninium chloride — CNS toxicity with serotonergic drugs (2010)', 'TOXBASE (NPIS): Serotonin syndrome'],
    },
  });

  // =====================================================================
  // QRH 3-5  Circulatory embolus — CO₂ gas embolism at laparoscopy
  // =====================================================================
  add({
    id: 'an-qrh-gas-embolism', title: 'Collapse during laparoscopic insufflation', field: 'Anaes', shock: 'Obstructive (gas embolism)', difficulty: 3, setting: 'theatre',
    stem: '52-year-old woman for laparoscopic hysterectomy. Seconds after the Veress needle insufflation starts, EtCO₂ falls from 4.8 to 2.1 kPa, SpO₂ drops and BP crashes to 60/30. A central line is in situ for poor access.',
    qrh: ['3-5', '2-1'],
    patient: { age: 52, sex: 'F', weight: 72, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, obstruct: 0.55, deadspace: 0.45, shunt: 0.12, cvc: true, artLine: true, hrBase: 94, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; e.flags.insufflating = true; },
    tick(e, dt) {
      const p = e.p;
      if (e.flags.insufflating) { p.obstruct = Math.min(0.7, p.obstruct + 0.0015 * dt); return; }
      const pos = e.did('position_embolus') ? 1 : 0.5, asp = e.did('aspirate_cvc') ? 1.4 : 1, o2 = p.fio2 >= 0.9 ? 1.2 : 0.8;
      p.obstruct = Math.max(0, p.obstruct - 0.0035 * pos * asp * o2 * dt);
      p.deadspace = 0.12 + p.obstruct * 0.6; p.shunt = 0.04 + p.obstruct * 0.15;
    },
    extraActions: [{ id: 'position_embolus', name: 'Head-down, left lateral (Durant) position' }, { id: 'aspirate_cvc', name: 'Aspirate gas via the central line' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && (ev.id === 'stop_insufflation' || ev.id === 'stop_surgery')) { e.flags.insufflating = false; return { handled: true, msg: 'Insufflation stopped and pneumoperitoneum released. The Veress needle was in a vessel.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'aspirate_cvc') return { handled: true, msg: e.flags.insufflating ? 'Some gas aspirated — but more keeps coming. Stop the insufflation!' : '20 mL of frothy blood/gas aspirated from the CVC.', kind: e.flags.insufflating ? 'warn' : 'good' };
      if (ev.type === 'action' && ev.id === 'position_embolus') return { handled: true, msg: 'Left lateral head-down: gas trapped in the right atrial apex, away from the RVOT.', kind: 'good' };
      if (ev.type === 'vent' && ev.key === 'fio2' && ev.value >= 0.9) return { msg: 'FiO₂ 1.0 (also stop nitrous oxide if used).', kind: 'good' };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e) + ' Clear chest.', C: circ(e) + (e.p.obstruct > 0.25 ? ' “Mill-wheel” murmur heard. Neck veins distended, CVP high.' : ' Improving.'), D: 'Anaesthetised.', E: e.flags.insufflating ? 'Insufflator running.' : 'Pneumoperitoneum released.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus tachycardia with right-heart strain.' }, ...noImg, pocus: [{ label: 'Subcostal / TOE', media: null, report: (e) => e.p.obstruct > 0.25 ? 'Echo-bright gas in the right heart; RV dilated and hypokinetic.' : 'RV function recovering, no further gas.' }] },
    critical: [
      { text: 'Stop insufflation / release pneumoperitoneum', check: (e) => !e.flags.insufflating },
      { text: 'FiO₂ 1.0', check: fio2High },
      { text: 'Head-down left lateral position', check: (e) => e.did('position_embolus') },
      { text: 'Support the RV (vasopressor ± fluid)', check: (e) => vaso(e) || e.did('fluid') },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Veress needle in a vein — CO₂ entrained under pressure', kind: 'cause', rx: 'Stop insufflation' },
      { t: 'Gas lock in RV outflow → ↓ pulmonary blood flow', rx: 'Left lateral head-down; aspirate CVC' },
      { t: '↑ Dead space → EtCO₂ falls; V/Q mismatch → hypoxaemia', rx: 'FiO₂ 1.0' },
      { t: 'RV failure, obstructive shock', rx: 'Noradrenaline / adrenaline; CPR if arrest' },
      { t: 'Cardiac arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 3-5: a sudden fall in EtCO₂ with hypotension and hypoxia suggests embolism — gas, thrombus, cement or amniotic fluid.',
        'Gas embolism: stop the source (insufflation, flood the field), FiO₂ 1.0, stop N₂O, head-down left lateral, aspirate via CVC, support the RV; CPR helps break up gas.',
        'CO₂ is very soluble and small amounts are tolerated; entrainment under pressure is the danger.',
        'Hyperbaric oxygen may be considered for air (not CO₂) embolism with neurological signs.',
      ],
      refs: [Q('3-5'), Q('2-1')],
    },
  });

  // =====================================================================
  // QRH 3-6  Laryngospasm (adult, at extubation)
  // =====================================================================
  add({
    id: 'an-qrh-laryngospasm', title: 'Stridor after extubation', field: 'Anaes', shock: null, category: 'Airway', difficulty: 2, setting: 'theatre',
    stem: '24-year-old man after septorhinoplasty, extubated “light” with blood in the pharynx. Within seconds he has inspiratory stridor, then silence, with chest–abdominal see-saw movement. SpO₂ 88% and falling.',
    qrh: ['3-6', '2-2'],
    patient: { age: 24, sex: 'M', weight: 78, effort: 1, airwayPatent: false, fio2: 0.6, hrBase: 98, rrBase: 20, look: { drapes: false } },
    tick(e, dt) {
      const p = e.p;
      if (!p.airwayPatent && !e.flags.relieved) { e.flags.spasmT = (e.flags.spasmT || 0) + dt; }
      if (e.flags.sux && e.t - e.flags.sux > 3) { p.effort = 0; e.flags.paralysed = true; if (!e.flags.suxMsg) { e.flags.suxMsg = true; e.say('Paralysed — the cords are relaxed. You must ventilate the patient now (BVM).', 'warn'); } }
      if (e.flags.sux && e.t - e.flags.sux > 120) { p.effort = 1; e.flags.paralysed = false; }
      if (e.flags.relieved && !p.assisted && !e.flags.sux) p.airwayPatent = true;
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && (ev.id === 'jaw_thrust_cpap' || ev.id === 'airway_manoeuvre')) { p.fio2 = 1; p.lastFio2 = 1; e.flags.cpap = true; return { handled: true, msg: 'Jaw thrust (Larson’s point) and CPAP with 100% O₂ via a tight facemask: small flicker of the bag, but still no effective ventilation. Blood suctioned from the pharynx.', kind: 'warn' }; }
      if (ev.type === 'drug' && ev.id === 'propofol') { if (ev.dose >= 20) { e.flags.relieved = true; p.airwayPatent = true; return { msg: 'Propofol: the laryngospasm breaks — the bag moves freely and the chest rises.', kind: 'good' }; } return { msg: 'Too little propofol to break the spasm (0.25–0.5 mg/kg).', kind: 'warn' }; }
      if (ev.type === 'drug' && ev.id === 'suxamethonium') { e.flags.relieved = true; e.flags.sux = e.t; p.airwayPatent = true; return { msg: 'Suxamethonium given. Cords relaxing.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'bvm' && e.flags.sux) { p.airwayPatent = true; }
      if (ev.type === 'action' && (ev.id === 'rsi_propofol' || ev.id === 'rsi_ketamine') && !e.did('suxamethonium') && !e.flags.relieved) { e.flags.relieved = true; p.airwayPatent = true; return { msg: 'Re-intubated (larynx relaxed by the induction agent and relaxant).', kind: 'good' }; }
    },
    exam: (e) => ({ A: e.p.airwayPatent ? 'Airway open.' : 'Complete obstruction: no stridor, no gas movement, tracheal tug.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. ${e.p.airwayPatent ? 'Air entry bilaterally.' : 'Paradoxical see-saw breathing, no air entry.'}`, C: circ(e), D: 'Semi-conscious, moving.', E: 'Nasal packs in situ; blood in the oropharynx.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus tachycardia.' }, ...noImg, pocus: [] },
    critical: [
      { text: '100% O₂, jaw thrust and CPAP', check: (e) => e.flags.cpap },
      { text: 'Deepen with propofol or give suxamethonium', check: (e) => any(e, 'propofol', 'suxamethonium') },
      { text: 'Call for help', check: (e) => e.did('call_help') },
      { text: 'Ventilate if apnoeic after suxamethonium', check: (e) => !e.did('suxamethonium') || any(e, 'bvm', 'sga', 'rsi_propofol', 'rsi_ketamine') },
    ],
    targets: { spo2: 94, map: 65 },
    hint: { steps: [
      { t: 'Blood/secretions on the cords at a light plane of anaesthesia', kind: 'cause', rx: 'Suction; remove stimulus' },
      { t: 'Reflex adduction of true (± false) vocal cords', rx: 'Jaw thrust + CPAP 100% O₂' },
      { t: 'Complete obstruction → rapid desaturation', rx: 'Propofol 0.25–0.5 mg/kg' },
      { t: 'Persisting: suxamethonium 0.25–0.5 mg/kg IV (4 mg/kg IM), then ventilate', rx: 'Atropine ready' },
      { t: 'Hypoxic arrest; negative-pressure pulmonary oedema', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 3-6: call for help, remove the stimulus, 100% O₂ with CPAP, jaw thrust at Larson’s point, suction.',
        'If not resolving: propofol 0.25–0.5 mg/kg, then suxamethonium 0.25–0.5 mg/kg IV (or 4 mg/kg IM) — and be ready to ventilate/intubate.',
        'Watch for negative-pressure pulmonary oedema afterwards; observe for at least 2 hours.',
        'Extubate either deep or fully awake, after suctioning the pharynx.',
      ],
      refs: [Q('3-6'), 'Difficult Airway Society: Extubation guidelines (2012)'],
    },
  });

  // =====================================================================
  // QRH 3-7  Patient fire
  // =====================================================================
  add({
    id: 'an-qrh-fire', title: 'Fire on the operating table', field: 'Anaes', shock: null, category: 'Theatre emergency', difficulty: 2, setting: 'theatre',
    stem: '69-year-old man having excision of a facial skin lesion under sedation with 4 L/min nasal oxygen under the drapes. The skin was prepped with alcoholic chlorhexidine. As the surgeon uses diathermy, there is a flash and the drapes around the face catch fire.',
    qrh: ['3-7'],
    patient: { age: 69, sex: 'M', weight: 76, fio2: 0.35, hrBase: 88, stress: 0.35, look: { drapes: true } },
    init(e) { e.flags.fire = true; e.flags.o2on = true; e.flags.burn = 0; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.fire) { f.burn += dt * (f.o2on ? 1.6 : 0.6) * (f.drapesOff ? 0.4 : 1); p.stress = 1; }
      else p.stress = toward(p.stress, 0.1, 0.02, dt);
      if (f.burn > 25 && !f.airwayBurn) { f.airwayBurn = true; p.shunt = 0.25; e.say('Facial and inhalational burns — stridor developing.', 'bad'); }
      if (f.airwayBurn && !p.ventilated) { p.airwayPatent = f.burn < 45; p.shunt = Math.min(0.4, p.shunt + 0.0005 * dt); }
    },
    extraActions: [
      { id: 'fire_o2_off', name: 'Turn off / disconnect the oxygen supply' },
      { id: 'fire_drapes', name: 'Remove burning drapes and materials' },
      { id: 'fire_extinguish', name: 'Extinguish with saline / water' },
      { id: 'fire_assess', name: 'Assess for airway & inhalational injury' },
    ],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action' && ev.id === 'fire_o2_off') { f.o2on = false; p.fio2 = 0.21; p.lastFio2 = 0.21; return { handled: true, msg: 'Oxygen turned off at the flowmeter and nasal cannulae removed — the flames die down.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'fire_drapes') { f.drapesOff = true; return { handled: true, msg: 'Burning drapes pulled off and thrown to the floor away from the patient.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'fire_extinguish') { if (f.o2on) return { handled: true, msg: 'Saline poured on — but the oxygen-enriched flame reignites. Stop the oxygen!', kind: 'bad' }; f.fire = false; return { handled: true, msg: 'Fire extinguished with saline. Smoke clearing.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'fire_assess') { f.assessed = true; return { handled: true, msg: f.burn > 25 ? 'Singed nasal hair, soot in the nostrils, hoarse voice — significant inhalational injury: secure the airway early.' : 'Superficial facial burns only, no airway involvement. Cool with saline, cover, and refer to burns.' }; }
      if (ev.type === 'action' && ['o2_nc', 'o2_nrb', 'hfno'].includes(ev.id) && f.fire) return { handled: true, harm: 'Oxygen re-applied while the fire is still burning' };
      if (ev.type === 'action' && ['o2_nc', 'o2_nrb', 'hfno'].includes(ev.id) && !f.fire) { p.fio2 = ev.id === 'o2_nc' ? 0.32 : 0.8; p.lastFio2 = p.fio2; return { handled: true, msg: 'Oxygen restarted now the fire is out.', kind: 'good' }; }
    },
    exam: (e) => ({ A: e.flags.airwayBurn ? (e.p.airwayPatent ? 'Hoarse, early stridor.' : 'Severe stridor / obstruction.') : 'Talking (distressed).', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`, C: circ(e), D: 'Sedated but rousable, in pain.', E: e.flags.fire ? 'FLAMES around the face and drapes!' : `Fire out. ${e.flags.burn > 25 ? 'Partial-thickness burns to face, singed nasal hair.' : 'Erythema over the cheek.'}` }),
    inv: { bloods: (e) => labs(e, { extra: [['Carboxyhaemoglobin', e.flags.burn > 25 ? '6%' : '2%']] }), gas: true, ecg: { desc: 'Sinus tachycardia.' }, ...noImg, pocus: [] },
    critical: [
      { text: 'Stop the oxygen flow first', check: (e) => e.did('fire_o2_off') },
      { text: 'Remove burning drapes', check: (e) => e.did('fire_drapes') },
      { text: 'Extinguish with saline', check: (e) => !e.flags.fire },
      { text: 'Assess airway / inhalational injury', check: (e) => e.flags.assessed },
    ],
    targets: { spo2: 94, map: 65 },
    hint: { steps: [
      { t: 'Fire triangle: ignition (diathermy) + fuel (alcohol prep, drapes) + oxidiser (O₂ under drapes)', kind: 'cause' },
      { t: 'Oxygen-enriched atmosphere → intense, fast-spreading fire', rx: 'Turn off O₂ first' },
      { t: 'Burning materials on the patient', rx: 'Remove drapes; saline' },
      { t: 'Thermal / inhalational airway injury → oedema, obstruction', rx: 'Assess; early intubation' },
      { t: 'Airway loss, burns shock', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 3-7: stop the gas flow (turn off O₂ / disconnect the circuit), remove burning material, extinguish with saline or water, then re-establish ventilation with air until the fire is out.',
        'Prevention: let alcoholic prep dry, avoid open oxygen under drapes (use the lowest FiO₂ possible or a sealed airway), use bipolar diathermy near the airway.',
        'Assess for airway burns — early intubation before oedema develops if inhalational injury is suspected.',
        'Report as a never-event-type serious incident and refer to the regional burns service.',
      ],
      refs: [Q('3-7'), 'NHS England: Surgical fires — National Patient Safety Alert guidance'],
    },
  });

  // =====================================================================
  // QRH 3-13  Neuroprotection after cardiac arrest
  // =====================================================================
  add({
    id: 'an-qrh-post-rosc', title: 'Post-cardiac-arrest care after ROSC', field: 'Anaes', shock: 'Cardiogenic (post-arrest)', difficulty: 2, setting: 'theatre',
    stem: '62-year-old woman, ROSC after 9 minutes of VF arrest during a hip revision. Intubated. She is being bagged at 25/min on FiO₂ 1.0, temperature 38.1 °C, MAP in the low 70s and drifting down. The surgeon has packed the wound. You are leading post-resuscitation care.',
    qrh: ['3-13', '2-1'],
    patient: { age: 62, sex: 'F', weight: 70, ventilated: true, fio2: 1, ventRR: 25, peep: 5, effort: 0, shunt: 0.08, contract: 0.7, vasoplegia: 0.66, temp: 38.1, tempRate: 0.0015, lactate: 5.2, artLine: true, hrBase: 98, glucose: 13.5, look: { drapes: true, surgField: 'lower' } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) { const p = e.p; if (e.did('active_cooling') || e.did('paracetamol')) p.tempRate = e.did('active_cooling') ? (p.temp > 36.5 ? -0.004 : 0) : -0.0006; p.contract = toward(p.contract, 0.8, 0.002, dt); if (!vaso(e)) p.vasoplegia = Math.max(0.5, p.vasoplegia - 0.0003 * dt); },
    onEvent(e, ev) {
      if (ev.type === 'vent' && ev.key === 'fio2' && ev.value <= 0.5) return { msg: 'FiO₂ reduced — titrate to SpO₂ 94–98%.', kind: 'good' };
      if (ev.type === 'vent' && ev.key === 'ventRR' && ev.value <= 16) return { msg: 'Ventilation reduced — aim for normocapnia (PaCO₂ 4.5–6.0 kPa).', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'active_cooling') return { handled: true, msg: 'Temperature control device applied — target ≤ 37.5 °C, avoid fever for at least 72 h.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'cath_lab') return { handled: true, msg: 'Cardiology: 12-lead shows no ST elevation; they will review for angiography after CT if no non-cardiac cause.', kind: 'info' };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e), C: circ(e), D: 'GCS 3 (sedated). Pupils 3 mm, reactive.', E: `T ${e.p.temp.toFixed(1)} °C. Glucose ${e.p.glucose.toFixed(1)} mmol/L. Hip wound packed.` }),
    inv: { bloods: (e) => labs(e, { trop: 820, k: 4.1 }), gas: true, ecg: { desc: 'Sinus tachycardia, no ST elevation.' }, cxr: { media: 'cxr_normal', report: 'ETT 4 cm above carina; no pneumothorax.' }, ct: [{ label: 'CT head', media: 'ct_head', report: 'No acute intracranial abnormality; no early hypoxic changes.' }], pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Moderately impaired LV, no effusion, RV normal size.' }] },
    critical: [
      { text: 'Titrate FiO₂ to SpO₂ 94–98%', check: (e) => e.p.fio2 < 0.7 },
      { text: 'Normocapnia (reduce ventilation)', check: (e) => e.p.ventRR <= 18 },
      { text: 'Vasopressor to MAP ≥ 65', check: vaso },
      { text: 'Temperature control (avoid fever)', check: (e) => any(e, 'active_cooling', 'paracetamol') },
      { text: '12-lead ECG', check: (e) => e.did('inv_ecg') },
    ],
    targets: { map: 65, spo2: 94, spo2Max: 98, etco2Min: 4.0, etco2Max: 6.0, tempMax: 37.8 },
    stableFor: 25,
    hint: { steps: [
      { t: 'Global ischaemia–reperfusion during arrest', kind: 'cause' },
      { t: 'Hyperoxia ↑ free-radical injury; hypocapnia → cerebral vasoconstriction', rx: 'SpO₂ 94–98%, PaCO₂ 4.5–6.0' },
      { t: 'Myocardial stunning + vasoplegia → hypotension', rx: 'Noradrenaline ± dobutamine, MAP ≥ 65' },
      { t: 'Fever, hyperglycaemia, seizures worsen brain injury', rx: 'Avoid T > 37.7 °C; glucose ≤ 10' },
      { t: 'Secondary hypoxic–ischaemic brain injury', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 3-13 / RCUK post-resuscitation care: SpO₂ 94–98%, normocapnia (PaCO₂ 4.5–6.0 kPa), MAP ≥ 65 mmHg, prevent fever (> 37.7 °C) for at least 72 h.',
        'Maintain glucose ≤ 10 mmol/L, treat seizures, avoid hypotension and hypoxaemia.',
        '12-lead ECG; emergency coronary angiography if STEMI; CT head ± CTPA if no obvious cardiac cause.',
        'Delay prognostication for at least 72 h (multimodal).',
      ],
      refs: [Q('3-13'), 'Resuscitation Council UK: Post-resuscitation care guidelines (2021)', 'ERC–ESICM post-resuscitation care guidelines 2021 (basis of the RCUK guidance)'],
    },
  });

  // =====================================================================
  // QRH 4-1  Oxygen supply failure
  // =====================================================================
  add({
    id: 'an-qrh-o2-failure', title: 'Oxygen pipeline failure', field: 'Anaes', shock: null, category: 'Equipment', difficulty: 2, setting: 'theatre',
    stem: '60-year-old man (BMI 38), ventilated under GA with sevoflurane in O₂/air for a laparoscopic cholecystectomy. The oxygen failure alarm sounds, the pipeline pressure gauge reads zero, and the gas-driven ventilator’s bellows have stopped moving.',
    qrh: ['4-1', '1-1'],
    patient: { age: 60, sex: 'M', weight: 118, ventilated: true, fio2: 0.45, ventRR: 14, peep: 8, effort: 0, shunt: 0.16, hrBase: 82, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; e.flags.pipe = false; e.flags.cyl = 0; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.cylOpen) { f.cyl += dt * (f.lowFlow ? 0.4 : 1.6); p.fio2 = toward(p.fio2, 1, 0.1, dt); if (f.cyl > 100 && !f.cylEmpty) { f.cylEmpty = true; f.cylOpen = false; e.say('The machine’s backup O₂ cylinder is EMPTY — high fresh gas flows used it up.', 'bad'); } }
      else if (f.selfBag) p.fio2 = toward(p.fio2, f.portable ? 1 : 0.21, 0.1, dt);
      else if (f.portable) p.fio2 = toward(p.fio2, 1, 0.1, dt);
      else p.fio2 = toward(p.fio2, 0.21, 0.02, dt);
      p.lastFio2 = p.fio2;
      p.ventObstruct = f.cylOpen || f.selfBag || f.portable ? 0 : 1; p.ventStopped = p.ventObstruct === 1;
      if (!f.tiva && !f.cylOpen && !f.portable && !f.awareMsg && e.t > 45) { f.awareMsg = true; e.say('Without fresh gas flow, no volatile is being delivered — risk of awareness.', 'warn'); }
    },
    extraActions: [
      { id: 'o2_open_cylinder', name: 'Open the machine’s backup O₂ cylinder' },
      { id: 'o2_low_flow', name: 'Reduce fresh gas flow to minimum (≤ 1 L/min)' },
      { id: 'o2_portable', name: 'Get a full portable O₂ cylinder + self-inflating bag' },
      { id: 'o2_tiva', name: 'Convert to TIVA (propofol infusion)' },
      { id: 'o2_estates', name: 'Inform theatre coordinator / estates (other theatres affected)' },
    ],
    onEvent(e, ev) {
      const f = e.flags;
      const m = { o2_open_cylinder: ['Backup cylinder opened — O₂ flowing again. Check its contents gauge.', 'good', () => { if (!f.cylEmpty) f.cylOpen = true; }],
        o2_low_flow: ['Fresh gas flow reduced to 0.5 L/min O₂ — conserving the cylinder.', 'good', () => { f.lowFlow = true; }],
        o2_portable: ['Full portable CD cylinder brought in, self-inflating bag with reservoir connected to the tube. Hand-ventilating with 100% O₂.', 'good', () => { f.portable = true; f.selfBag = true; }],
        o2_tiva: ['Propofol TCI started — anaesthesia no longer depends on gas flow.', 'good', () => { f.tiva = true; }],
        o2_estates: ['Estates and the theatre coordinator informed: a contractor isolated the main by mistake — supply restored in ~10 minutes. Other theatres warned.', 'good', () => { f.informed = true; }] };
      if (ev.type === 'action' && m[ev.id]) { m[ev.id][2](); return { handled: true, msg: m[ev.id][0], kind: m[ev.id][1] }; }
      if (ev.type === 'action' && ev.id === 'bvm') { f.selfBag = true; return { handled: true, msg: f.portable ? 'Hand-ventilating with the portable O₂.' : 'Hand-ventilating with a self-inflating bag on room air — keeps the patient ventilated, but FiO₂ is only 0.21.' }; }
      if (ev.type === 'vent' && ev.key === 'fio2') return { msg: 'Turning up the O₂ flowmeter does nothing — there is no oxygen supply.', kind: 'warn' };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e), C: circ(e), D: `Anaesthetised. ${e.flags.tiva ? 'TIVA running.' : 'Volatile delivery dependent on fresh gas flow.'}`, E: 'Pipeline gauge: O₂ 0 kPa; air 400 kPa.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus rhythm.' }, ...noImg, pocus: [] },
    critical: [
      { text: 'Ventilate: open backup cylinder or hand-ventilate with a self-inflating bag', check: (e) => e.flags.cylOpen || e.flags.portable || e.flags.selfBag || e.flags.cylEmpty },
      { text: 'Minimise O₂ consumption (low flow) or use portable supply', check: (e) => e.flags.lowFlow || e.flags.portable },
      { text: 'Convert to TIVA', check: (e) => e.flags.tiva },
      { text: 'Inform theatre coordinator / estates', check: (e) => e.flags.informed },
    ],
    targets: { spo2: 94, map: 65 },
    hint: { steps: [
      { t: 'Loss of central O₂ supply (pipeline)', kind: 'cause', rx: 'Open backup cylinder; inform estates' },
      { t: 'FiO₂ falls to that of air (or a hypoxic mixture)', rx: 'Portable O₂ + self-inflating bag' },
      { t: 'Obese patient with shunt → desaturates quickly', rx: 'Conserve O₂: low flows' },
      { t: 'No gas flow = no volatile', rx: 'Convert to TIVA' },
      { t: 'Hypoxaemia / awareness', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 4-1: open the backup cylinder, check its contents, reduce O₂ flow to the minimum, use a self-inflating bag with portable O₂ if needed, and switch to TIVA.',
        'Ventilators driven by O₂ can exhaust the cylinder — use an electrically driven ventilator or hand-ventilate.',
        'Inform estates and the theatre coordinator: a pipeline failure affects every theatre.',
        'Do the daily machine check, including cylinder contents (AoA checking guidelines).',
      ],
      refs: [Q('4-1'), 'Association of Anaesthetists: Checking anaesthetic equipment (2019)', 'HTM 02-01: Medical gas pipeline systems (NHS England)'],
    },
  });

  // =====================================================================
  // QRH 4-2  Mains electricity failure
  // =====================================================================
  add({
    id: 'an-qrh-power-failure', title: 'Power failure in theatre', field: 'Anaes', shock: null, category: 'Equipment', difficulty: 2, setting: 'theatre',
    stem: '38-year-old woman under GA (TIVA) for a laparoscopic appendicectomy. The lights go out and the monitor screen goes blank. The ventilator shows “battery” and the emergency lighting is dim. The generator has not started.',
    qrh: ['4-2', '1-1'],
    patient: { age: 38, sex: 'F', weight: 66, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, monitorOff: true, hrBase: 80, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (!f.handVent && e.t > 40 && !f.ventDead) { f.ventDead = true; p.ventObstruct = 1; p.ventStopped = true; e.say('The ventilator battery is exhausted — ventilation has stopped.', 'bad'); }
      if (f.handVent) { p.ventObstruct = 0; }
      if (!f.pumpCheck && e.t > 60 && !f.lightMsg) { f.lightMsg = true; e.say('The propofol pumps are on battery — check they are still running.', 'warn'); }
    },
    extraActions: [
      { id: 'pw_torch', name: 'Get a torch / laryngoscope light' },
      { id: 'pw_handvent', name: 'Hand-ventilate (bag / self-inflating bag)' },
      { id: 'pw_monitor', name: 'Use a battery transport monitor' },
      { id: 'pw_pulse', name: 'Feel a pulse / manual BP' },
      { id: 'pw_pumps', name: 'Check TIVA pumps are on battery and running' },
      { id: 'pw_estates', name: 'Call estates; check UPS / generator' },
    ],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      const m = { pw_torch: () => { f.light = true; return 'Torch and laryngoscope light — you can see the patient and equipment.'; },
        pw_handvent: () => { f.handVent = true; p.ventStopped = false; return 'Hand-ventilating with the circuit bag / self-inflating bag with portable O₂.'; },
        pw_monitor: () => { f.mon = true; p.monitorOff = false; return 'Transport monitor attached: SpO₂, ECG, NIBP and capnography displayed.'; },
        pw_pulse: () => `Radial pulse ${p.hr}/min, ${p.map > 65 ? 'good volume' : 'weak'}.`,
        pw_pumps: () => { f.pumpCheck = true; return 'Both TCI pumps on battery — running, ~2 hours remaining.'; },
        pw_estates: () => { f.informed = true; return 'Estates: the generator failed to transfer. Power expected in 15 min. Surgeon asked to pause/finish safely.'; } };
      if (ev.type === 'action' && m[ev.id]) return { handled: true, msg: m[ev.id](), kind: 'good' };
      if (ev.type === 'action' && ev.id === 'bvm') { f.handVent = true; p.ventStopped = false; }
    },
    exam: (e) => ({ A: 'ETT secure.', B: e.flags.handVent ? 'Hand-ventilated, good chest movement.' : (e.flags.ventDead ? 'NOT being ventilated — the ventilator has stopped!' : 'Ventilator running on battery.'), C: e.flags.mon ? circ(e) : 'No monitor. Feel a pulse.', D: 'Anaesthetised (TIVA).', E: e.flags.light ? 'Visible by torchlight.' : 'Theatre dark.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus rhythm (on transport monitor).' }, ...noImg, pocus: [] },
    critical: [
      { text: 'Light source', check: (e) => e.flags.light },
      { text: 'Ensure ventilation (hand-ventilate)', check: (e) => e.flags.handVent },
      { text: 'Restore monitoring (battery monitor)', check: (e) => e.flags.mon },
      { text: 'Confirm anaesthesia delivery (pumps on battery)', check: (e) => e.flags.pumpCheck },
      { text: 'Inform estates / check UPS', check: (e) => e.flags.informed },
    ],
    targets: { spo2: 94, map: 65 },
    hint: { steps: [
      { t: 'Mains failure, generator not transferring', kind: 'cause', rx: 'Call estates; torch' },
      { t: 'Monitors off; ventilator on limited battery', rx: 'Transport monitor; clinical monitoring' },
      { t: 'Ventilator stops when battery fails', rx: 'Hand-ventilate' },
      { t: 'Pumps must have battery for TIVA', rx: 'Check pumps; volatile needs no power on some machines' },
      { t: 'Hypoxia / awareness', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 4-2: get light, check the patient clinically (pulse, chest movement, colour), hand-ventilate, use battery monitors and maintain anaesthesia.',
        'Know which equipment is on the UPS (red sockets) and how long each battery lasts.',
        'Ask the surgeon to stop or finish safely; inform estates and the theatre coordinator.',
      ],
      refs: [Q('4-2'), 'HTM 06-01: Electrical services supply and distribution (NHS England)'],
    },
  });

  // =====================================================================
  // QRH 4-3  Emergency evacuation
  // =====================================================================
  add({
    id: 'an-qrh-evacuation', title: 'Theatre evacuation mid-operation', field: 'Anaes', shock: null, category: 'Theatre emergency', difficulty: 3, setting: 'theatre',
    stem: '55-year-old man, ventilated under sevoflurane, 40 minutes into an open bowel resection. The fire alarm sounds continuously and smoke is entering theatre from the corridor. The fire officer says the theatre must be evacuated now.',
    qrh: ['4-3', '3-7'],
    patient: { age: 55, sex: 'M', weight: 84, ventilated: true, fio2: 0.5, ventRR: 12, effort: 0, hrBase: 82, artLine: true, look: { drapes: true, surgField: 'abdo' } },
    init(e) { e.flags.paralysed = true; e.flags.smoke = 0; },
    tick(e, dt) {
      const f = e.flags, p = e.p;
      if (!f.evacuated) f.smoke += dt;
      if (f.smoke > 150 && !f.evacuated && !e.outcome) { e.outcome = 'fail'; e.emit({ type: 'end', outcome: 'fail', text: 'Smoke has filled the theatre before the patient was evacuated.', kind: 'bad' }); }
      if (f.smoke > 80 && !f.smokeMsg && !f.evacuated) { f.smokeMsg = true; e.say('Smoke is getting thicker — you must move soon.', 'bad'); }
      if (f.evacuated && !f.portO2) { p.fio2 = 0.21; p.lastFio2 = 0.21; p.ventObstruct = 1; }
      else p.ventObstruct = 0;
    },
    extraActions: [
      { id: 'ev_declare', name: 'Declare evacuation; allocate roles' },
      { id: 'ev_pack', name: 'Surgeon packs / temporarily closes the wound' },
      { id: 'ev_tiva', name: 'Switch to TIVA on battery pumps' },
      { id: 'ev_o2', name: 'Portable O₂ + self-inflating bag / transport ventilator' },
      { id: 'ev_monitor', name: 'Transfer to battery transport monitor' },
      { id: 'ev_go', name: 'Evacuate along the planned route (horizontal first)' },
    ],
    onEvent(e, ev) {
      const f = e.flags;
      const m = { ev_declare: () => { f.decl = true; return 'Evacuation declared. Roles: airway, drugs, surgeon, trolley, route leader.'; },
        ev_pack: () => { f.pack = true; return 'Abdomen packed and covered with an occlusive dressing.'; },
        ev_tiva: () => { f.tiva = true; return 'Propofol and remifentanil TCI on battery pumps; vaporiser off.'; },
        ev_o2: () => { f.portO2 = true; return 'Transport ventilator on a full portable cylinder (~45 min at current settings).'; },
        ev_monitor: () => { f.mon = true; return 'Transport monitor with SpO₂, ECG, art line and capnography.'; },
        ev_go: () => { f.evacuated = true; if (!f.portO2) e.harm('Patient moved without portable oxygen / ventilation'); if (!f.tiva) e.harm('Patient moved without portable anaesthesia (awareness risk)'); return 'Patient moved through the fire doors to the adjacent recovery area — a safe compartment.'; } };
      if (ev.type === 'action' && m[ev.id]) return { handled: true, msg: m[ev.id](), kind: 'good' };
    },
    exam: (e) => ({ A: 'ETT secure.', B: vent(e), C: circ(e), D: e.flags.tiva ? 'TIVA running.' : 'Sevoflurane via the anaesthetic machine.', E: e.flags.evacuated ? 'In a safe compartment.' : `Smoke in theatre (${Math.round(e.flags.smoke)} s).` }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: { desc: 'Sinus rhythm.' }, ...noImg, pocus: [] },
    critical: [
      { text: 'Declare evacuation and allocate roles', check: (e) => e.flags.decl || e.did('call_help') },
      { text: 'Pack / close the wound', check: (e) => e.flags.pack },
      { text: 'Portable anaesthesia (TIVA)', check: (e) => e.flags.tiva },
      { text: 'Portable O₂ and ventilation', check: (e) => e.flags.portO2 },
      { text: 'Portable monitoring', check: (e) => e.flags.mon },
      { text: 'Evacuate the patient', check: (e) => e.flags.evacuated },
    ],
    targets: { spo2: 94, map: 65 },
    hint: { steps: [
      { t: 'Fire in the theatre complex', kind: 'cause' },
      { t: 'Staff safety first; decide stay vs go with the fire officer', rx: 'Declare; allocate roles' },
      { t: 'Patient must remain anaesthetised, oxygenated, monitored', rx: 'TIVA, portable O₂, transport monitor' },
      { t: 'Move horizontally to the next fire compartment', rx: 'Pack wound, evacuate' },
      { t: 'Smoke inhalation / harm to patient and staff', kind: 'end' },
    ] },
    debrief: {
      points: [
        'QRH 4-3: confirm the need with the fire officer, declare and allocate roles, make the patient portable (TIVA, O₂, ventilation, monitoring), close/pack the wound and move horizontally through fire doors.',
        'Know your theatre’s evacuation routes and where portable equipment is kept.',
        'Staff safety comes first — do not delay evacuation for non-essential tasks.',
      ],
      refs: [Q('4-3'), 'NHS England HTM 05-01: Managing healthcare fire safety'],
    },
  });
})();
