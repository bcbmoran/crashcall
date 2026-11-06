/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Scenario library — part 4: Paediatrics (APLS / RCUK PLS & NLS / NICE / BTS / BSPED). Doses are weight-based. */
(function () {
  const S = window.Sim;
  const clamp = S.clamp;
  const { add, any, toward, vaso, labs } = S.scnUtil;
  const Q = (id) => S.QRH.ref(id);

  // Age-appropriate physiology for the lumped model (normal values per APLS).
  function paed(weight, age, extra) {
    const hr0 = age < 0.1 ? 140 : age < 1 ? 135 : age < 2 ? 125 : age < 5 ? 110 : age < 12 ? 95 : 82;
    const mapN = age < 0.1 ? 45 : age < 1 ? 52 : age < 2 ? 56 : age < 5 ? 60 : age < 12 ? 68 : 76;
    const svScale = weight / 70 * (72 / hr0) * 1.25;
    const coRef = (hr0 * 78 * svScale) / 1000;
    const svrScale = ((mapN - 2.5) * 80) / (coRef * 1100);
    return Object.assign({ paed: true, weight, age, svScale, svrScale, coRef, mapNormal: mapN, mapArrest: Math.round(mapN * 0.45), hrBase: hr0 - 12, hrGain: Math.round(hr0 * 0.5), hrAlarm: [Math.round(hr0 * 0.6), Math.round(hr0 * 1.45)], rrBase: age < 1 ? 40 : age < 5 ? 30 : age < 12 ? 22 : 16 }, extra || {});
  }
  const perKg = (e, id) => e.total(id) / e.p.weight; // total given per kg (in the drug's bolus unit)
  const mlkg = (e, kind = 'crystalloid') => e.fluidIn[kind] / e.p.weight;
  const ageTxt = (p) => (p.age < 1 ? `${Math.round(p.age * 12)}-month-old` : `${p.age}-year-old`);
  const circ = (e) => `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}, CRT ${e.p.map < e.p.mapNormal * 0.85 || e.p.vol < 0.85 ? '4–5' : '2'} s.`;
  const resp = (e) => `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`;
  const pLabs = (e, o) => labs(e, Object.assign({ cr: 30, egfr: '—' }, o));
  const noCT = { ct: [] };

  // =====================================================================
  // P1. Infant septic shock
  // =====================================================================
  add({
    id: 'paed-septic-shock', title: 'Septic shock in an infant', field: 'Paeds', shock: 'Distributive (septic)', difficulty: 2, setting: 'ed',
    stem: '9-month-old boy (8.5 kg), 12 hours of fever, now floppy and mottled with a few non-blanching spots on the legs. Parents say he has not had a wet nappy since this morning.',
    qrh: [],
    patient: paed(8.5, 0.75, { vol: 0.74, leak: 0.0009, contract: 0.78, vasoplegia: 1.05, lactate: 5.4, lacGen: 0.0015, temp: 39.4, glucose: 2.6, shunt: 0.05, gcs: 11, sex: 'M', look: { urticaria: false, legs: { purpura: true } } }),
    tick(e, dt) {
      const p = e.p, t0 = e.firstTime('antibiotics');
      if (t0 != null && e.t - t0 > 40) { p.leak = 0.0002; p.lacGen = 0; p.contract = toward(p.contract, 0.95, 0.004, dt); }
      else p.contract = Math.max(0.45, p.contract - 0.0005 * dt);
      if (!e.did('glucose')) p.glucose = Math.max(1.6, p.glucose - 0.001 * dt);
      p.gcs = p.glucose < 3 ? 9 : p.map < 40 ? 10 : 13;
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'glucose') { e.p.glucose = Math.min(8, e.p.glucose + perKg(e, 'glucose') * 2.2); return { msg: `Glucose now ${e.p.glucose.toFixed(1)} mmol/L.`, kind: 'good' }; }
      if (ev.type === 'fluid' && mlkg(e) > 60 && !any(e, 'adrenaline', 'noradrenaline')) return { harm: 'More than 60 mL/kg fluid without starting an inotrope/vasopressor (fluid overload)' };
      if (ev.type === 'fluid' && ev.id === 'cryst20') return { msg: '20 mL/kg given. NICE NG51/APLS: give 10 mL/kg boluses and reassess after each (crackles, hepatomegaly).', kind: 'warn' };
    },
    exam: (e) => ({
      A: 'Patent, grunting.', B: resp(e) + ' Mild recession, clear chest.',
      C: circ(e) + ` Cool, mottled to the knees; central CRT ${e.p.map < 45 ? 5 : 3} s. Liver edge ${mlkg(e) > 40 ? '3 cm — hepatomegaly developing' : '1 cm'}.`,
      D: `AVPU: ${e.p.gcs > 12 ? 'V' : 'P'}. Fontanelle normal. Glucose ${e.p.glucose.toFixed(1)} mmol/L.`,
      E: `T ${e.p.temp.toFixed(1)} °C. Scattered petechiae/purpura on the legs.`,
    }),
    inv: {
      bloods: (e) => pLabs(e, { wcc: 2.1, plt: 88, crp: 168, extra: [['Blood culture', 'Sent'], ['Meningococcal PCR', 'Sent']] }), gas: true,
      ecg: {}, cxr: { media: 'cxr_normal', report: 'Normal.' }, ...noCT,
      pocus: [{ label: 'Cardiac (subcostal)', media: 'us_plax_normal', report: (e) => (e.p.contract < 0.8 ? 'Under-filled, reduced contractility.' : 'Hyperdynamic, under-filled.') }, { label: 'IVC', media: 'us_ivc_flat', report: (e) => (mlkg(e) > 40 ? 'IVC now distended.' : 'Collapsing IVC.') }],
    },
    critical: [
      { text: 'IV/IO antibiotics within 1 hour (ceftriaxone 80 mg/kg)', check: (e) => e.did('antibiotics') },
      { text: 'Fluid bolus 10 mL/kg and reassess (≥ 20 mL/kg)', check: (e) => mlkg(e) >= 20 },
      { text: 'Treat hypoglycaemia (2 mL/kg 10% glucose)', check: (e) => e.did('glucose') },
      { text: 'Start adrenaline (or noradrenaline) if fluid-refractory', check: (e) => mlkg(e) < 40 || any(e, 'adrenaline', 'noradrenaline') },
    ],
    targets: { map: 48, spo2: 94, hrMax: 170, gluMin: 3.5 },
    hint: { steps: [
      { t: 'Invasive bacterial infection (e.g. meningococcus)', kind: 'cause', rx: 'Antibiotics within 1 h' },
      { t: 'Capillary leak → hypovolaemia; myocardial depression → “cold shock”', rx: '10 mL/kg boluses, reassess' },
      { t: 'Infants compensate with tachycardia & vasoconstriction — hypotension is late', rx: 'Peripheral adrenaline 0.05–0.3 mcg/kg/min' },
      { t: 'Low glycogen stores → hypoglycaemia', rx: '10% glucose 2 mL/kg' },
      { t: 'Decompensated shock → arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Recognise shock by tachycardia, prolonged CRT, mottling and altered conscious level — hypotension is a pre-terminal sign in children.',
        'NICE NG51 / APLS: give 10 mL/kg crystalloid boluses, reassess after each; by 40–60 mL/kg start inotropes (adrenaline peripherally is acceptable) and involve PICU/retrieval early.',
        'Give IV/IO antibiotics within 1 hour (ceftriaxone 80 mg/kg); check and treat glucose (2 mL/kg 10% glucose).',
        'SSC children 2026: where intensive care is available, up to 40–60 mL/kg in the first hour (ideal body weight), balanced crystalloid, reassessing for overload; start vasoactives peripherally rather than waiting for central access; antibiotics within 1 h in septic shock (within 3 h after rapid assessment if sepsis without shock). Sepsis is now defined by the Phoenix criteria (organ dysfunction).',
      ],
      refs: ['NICE NG51: Suspected sepsis — recognition, diagnosis and early management (2024 update)', 'APLS: Advanced Paediatric Life Support, 7th edn (ALSG, 2023)', 'HSE National Clinical Programme for Paediatrics: Paediatric sepsis pathway and Paediatric Sepsis Form (Ireland)', 'Surviving Sepsis Campaign International Guidelines for the management of sepsis and septic shock in children (2026), co-sponsored by ESICM'],
    },
  });

  // =====================================================================
  // P2. Life-threatening asthma (child)
  // =====================================================================
  add({
    id: 'paed-asthma', title: 'Life-threatening asthma in a child', field: 'Paeds', shock: null, category: 'Respiratory', difficulty: 2, setting: 'ed',
    stem: '6-year-old girl (20 kg) with known asthma. 2 days of coryza, now too breathless to talk, using accessory muscles. Ten puffs of salbutamol via spacer at home have not helped.',
    patient: paed(20, 6, { sex: 'F', bronchospasm: 0.7, shunt: 0.07, lactate: 2.0, stress: 0.3, look: { sweaty: true } }),
    init(e) { e.p.load = 1; },
    // Consultant grade: refractory asthma — despite full medical therapy she tires and needs intubating.
    tick(e, dt) {
      const p = e.p, f = e.flags, refr = e.level === 'consultant';
      const floor = refr ? 0.85 : 0.3;
      if (refr) p.bronchRefractory = 0.5;
      if (any(e, 'prednisolone', 'hydrocortisone', 'dexamethasone') && e.t - Math.min(...['prednisolone', 'hydrocortisone', 'dexamethasone'].map((d) => e.firstTime(d) ?? 1e9)) > 60) p.load = Math.max(floor, p.load - 0.002 * dt);
      if (e.did('magnesium') && e.t - e.firstTime('magnesium') > 20) p.load = Math.max(floor, p.load - 0.0008 * dt);
      // Dynamic hyperinflation on the ventilator: progressive auto-PEEP → falling venous return → PEA arrest
      if (refr && p.ventilated && !p.arrested) {
        if (p.autoPEEP > 6) { f.trapT = (f.trapT || 0) + dt; if (f.trapT > 25 && !f.trapMsg) { f.trapMsg = true; e.say('Airway pressures climbing, the capnograph never returns to baseline and the BP is falling — gas trapping.', 'bad'); } if (f.trapT > 40) p.obstruct = Math.min(0.75, p.obstruct + 0.004 * dt); }
        else { f.trapT = Math.max(0, (f.trapT || 0) - dt * 2); p.obstruct = Math.max(0, p.obstruct - 0.01 * dt); }
      }
      if (refr && !p.ventilated && !p.arrested && e.t > 80) {
        p.effort = Math.max(0.06, p.effort - 0.0022 * dt);
        if (p.effort < 0.6 && !f.tiring) { f.tiring = true; e.say('She is tiring: quieter chest, head bobbing, harder to rouse. CO₂ is climbing.', 'bad'); }
        if (p.effort < 0.25 && !f.preArrest) { f.preArrest = true; e.say('Nurse: "Her breathing is very shallow now — I can hardly hear anything on the chest."', 'bad'); }
      }
      if (!any(e, 'prednisolone', 'hydrocortisone', 'dexamethasone')) p.load = Math.min(1.2, p.load + 0.0002 * dt);
      p.bronchospasm = 0.7 * p.load * (refr && p.ventilated ? 1.45 : 1); // refractory: severe gas trapping once on positive pressure
      if (!p.ventilated && !refr) { if (p.bronchEff > 0.42) p.effort = Math.max(0.3, p.effort - 0.0016 * dt); else if (p.bronchEff < 0.3) p.effort = Math.min(1, p.effort + 0.003 * dt); }
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'magnesium' && perKg(e, 'magnesium') > 0.06) return { harm: 'Magnesium above 40 mg/kg (max 2 g)' };
      if (ev.type === 'action' && ev.id === 'rsi_propofol') return { harm: 'Propofol RSI in severe asthma — ketamine is preferred' };
      if (ev.type === 'action' && (ev.id === 'rsi_ketamine' || ev.id === 'rsi_propofol')) {
        if (e.level === 'consultant') e.after(1, (en) => { en.p.ventRR = 24; en.say('Ventilator connected on the default paediatric settings: RR 24, PEEP 5. Watch the capnograph, airway pressures and blood pressure.', 'warn'); });
        else e.after(1, (en) => en.say('Intubated: low rate, long expiratory time, accept permissive hypercapnia; anaesthetist/PICU involved.', 'warn'));
      }
    },
    exam: (e) => ({ A: 'Patent.', B: resp(e) + ` ${e.p.effort < 0.6 && !e.p.ventilated ? 'Exhausted, SILENT CHEST.' : e.p.bronchEff > 0.3 ? 'Widespread wheeze, marked recession, unable to speak. PEF not possible.' : 'Mild wheeze, talking in sentences.'}`, C: circ(e), D: `${e.p.paco2 > 60 ? 'Drowsy.' : 'Alert, anxious.'}`, E: 'No rash. Afebrile.' }),
    inv: { bloods: (e) => pLabs(e, { k: 3.4 }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Hyperinflated, no pneumothorax.' }, ...noCT, pocus: [{ label: 'Lung ultrasound', media: 'us_sliding', report: 'Lung sliding bilaterally — no pneumothorax.' }] },
    critical: [
      { text: 'Oxygen to SpO₂ 94–98% (face mask / nasal prongs)', check: (e) => e.p.fio2 >= 0.6 },
      { text: 'Oxygen-driven salbutamol 5 mg nebs, repeated every 20–30 min', check: (e) => e.count('salbutamol_neb') >= 2 },
      { text: 'Ipratropium 0.25 mg added to the nebs', check: (e) => e.did('ipratropium') },
      { text: 'Steroid: oral prednisolone 30–40 mg (> 5 y), or IV hydrocortisone 4 mg/kg if vomiting', check: (e) => any(e, 'prednisolone', 'hydrocortisone', 'dexamethasone') },
      { text: 'Not responding: IV magnesium sulfate 40 mg/kg (max 2 g) over 20 min', check: (e) => e.did('magnesium') },
      { text: 'IV salbutamol bolus 15 micrograms/kg', check: (e) => e.did('salbutamol_iv'), skip: (e) => e.level !== 'consultant' },
      { text: 'Recognise exhaustion / rising CO₂: call anaesthetist & PICU, ketamine RSI', check: (e) => e.did('rsi_ketamine') || e.did('rsi_propofol'), skip: (e) => e.level !== 'consultant' },
      { text: 'Ventilate for gas trapping: low rate (≤ 16), long expiration, accept permissive hypercapnia', check: (e) => e.p.ventilated && e.p.ventRR <= 16, skip: (e) => e.level !== 'consultant' },
    ],
    targets: { spo2: 94 },
    hint: { steps: [
      { t: 'Viral trigger → airway inflammation', kind: 'cause', rx: 'Steroids' },
      { t: 'Bronchial smooth muscle constriction', rx: 'Salbutamol (back-to-back) + ipratropium' },
      { t: 'Air trapping, ↑ work of breathing, V/Q mismatch', rx: 'O₂; IV magnesium / IV salbutamol' },
      { t: 'Fatigue → hypoventilation, rising CO₂ (silent chest)', rx: 'Senior anaesthetist, ketamine RSI' },
      { t: 'Respiratory arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'BTS/SIGN 158 (revised 2024, corrected 2025) — child > 5 y: acute severe = SpO₂ < 92%, too breathless to talk or eat, HR > 125, RR > 30, accessory muscles; life-threatening = SpO₂ < 92% plus any of silent chest, poor respiratory effort, confusion, cyanosis or PEF < 33%. (2–5 y: HR > 140, RR > 40; agitation also counts.)',
        'O₂ to SpO₂ 94–98%; oxygen-driven salbutamol 5 mg (2.5 mg if 2–5 y) every 20–30 min with ipratropium 0.25 mg; consider adding 150 mg magnesium sulfate to each neb in the first hour if SpO₂ < 92% with a short history.',
        'Oral prednisolone is the steroid of choice: 20 mg (2–5 y), 30–40 mg (> 5 y), 2 mg/kg (max 60 mg) if on maintenance steroids. IV hydrocortisone 4 mg/kg only if unable to retain oral medication. Dexamethasone has no proven advantage over prednisolone.',
        'Not responding: discuss with senior / PICU, consider HDU/PICU, and add IV magnesium sulfate 40 mg/kg (max 2 g) over 20 min, a single IV salbutamol bolus 15 micrograms/kg over 10 min ± infusion 1–5 micrograms/kg/min, or IV aminophylline 5 mg/kg over 20 min then 1 mg/kg/h with ECG monitoring — assess the response before each new treatment.',
        'Exhaustion, silent chest or rising PaCO₂ → involve a clinician with airway and critical-care skills early (BTS/SIGN 158 §9.9.5); intubate with ketamine induction (APLS) and a low ventilator rate. Note SIGN found no evidence for ketamine as a treatment in non-intubated children — its role here is as the induction agent.',
        'Some children deteriorate despite maximal medical therapy. Intubation in severe asthma is high-risk: ketamine is preferred, and ventilating at a normal paediatric rate causes gas trapping (auto-PEEP) → falling venous return, hypotension and arrest. Use a low rate, long expiratory time and accept a high CO₂; disconnect and decompress the chest if the blood pressure falls.',
      ],
      refs: ['BTS/SIGN 158: British guideline on the management of asthma — acute asthma (revised November 2024, corrections May 2025)', 'BTS/NICE/SIGN NG245: Asthma — diagnosis, monitoring and chronic asthma management (2024)', 'APLS: Advanced Paediatric Life Support, 7th edn (ALSG, 2023)'],
    },
  });

  // =====================================================================
  // P3. Anaphylaxis (child)
  // =====================================================================
  add({
    id: 'paed-anaphylaxis', title: 'Anaphylaxis in a child', field: 'Paeds', shock: 'Distributive (anaphylactic)', difficulty: 1, setting: 'ed',
    stem: '4-year-old boy (16 kg) at a birthday party ate cake containing nuts. Now lip swelling, hoarse cry, wheeze and very pale and floppy. No auto-injector available.',
    patient: paed(16, 4, { med: 0.85, shunt: 0.07, bronchBase: 0.55, look: { urticaria: true, flush: 0.7, facialOedema: true } }),
    init(e) { S.anaphylaxisTick(e, 0, 0); },
    tick(e, dt) { S.anaphylaxisTick(e, dt, 0.0013); },
    onEvent(e, ev) {
      if (ev.type === 'drug' && (ev.id === 'chlorphenamine' || ev.id === 'hydrocortisone') && !any(e, 'adrenaline', 'adrenaline_im')) return { harm: 'Antihistamine/steroid before adrenaline' };
      if (ev.type === 'drug' && ev.id === 'adrenaline_im' && ev.dose > 300) return { harm: 'IM adrenaline dose too high for age (6 months–6 years: 150 micrograms)' };
      if (ev.type === 'drug' && ev.id === 'adrenaline_im' && ev.dose < 150) return { msg: 'Underdosed — RCUK: 150 micrograms IM for 6 months to 6 years.', kind: 'warn' };
      if (ev.type === 'drug' && ev.id === 'adrenaline' && perKg(e, 'adrenaline') > 3) return { harm: 'Large IV adrenaline bolus in a child with a pulse (use 1 mcg/kg titrated, by experts only)' };
    },
    exam: (e) => ({ A: e.p.med > 0.6 ? 'Lip and tongue swelling, hoarse voice, mild stridor.' : 'Swelling settling.', B: resp(e) + (e.p.bronchEff > 0.25 ? ' Widespread wheeze.' : ' Clear.'), C: circ(e) + ' Pale.', D: e.p.map < 45 ? 'Floppy, responds to pain.' : 'Alert, crying.', E: 'Widespread urticaria.' }),
    inv: { bloods: (e) => pLabs(e, { extra: [['Mast cell tryptase', 'Sent (repeat at 1–2 h)']] }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Normal.' }, ...noCT, pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Collapsing IVC.' }] },
    critical: [
      { text: 'IM adrenaline 150 micrograms (age 6 months–6 years)', check: (e) => e.did('adrenaline_im') },
      { text: 'High-flow oxygen', check: (e) => e.p.fio2 >= 0.6 },
      { text: 'Fluid bolus 10 mL/kg', check: (e) => mlkg(e) >= 10 },
      { text: 'Repeat IM adrenaline after 5 min if no improvement', check: (e) => e.count('adrenaline_im') >= 2 || e.did('adrenaline') },
    ],
    targets: { map: 52, spo2: 94 },
    hint: { steps: [
      { t: 'IgE-mediated mast-cell degranulation (nut allergy)', kind: 'cause', rx: 'IM adrenaline' },
      { t: 'Vasodilatation + capillary leak → distributive shock', rx: 'Fluid 10 mL/kg' },
      { t: 'Airway oedema and bronchospasm', rx: 'O₂; repeat adrenaline every 5 min' },
      { t: 'Refractory: two IM doses failed', rx: 'Low-dose adrenaline infusion (expert)' },
      { t: 'Cardiorespiratory arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'RCUK 2021 IM adrenaline doses: < 6 months 100–150 micrograms, 6 months–6 years 150 micrograms, 6–12 years 300 micrograms, > 12 years 500 micrograms. Repeat after 5 min if not improving.',
        'Refractory anaphylaxis (no response after two IM doses): adrenaline infusion with expert help, plus fluid 10 mL/kg boluses.',
        'Antihistamines and steroids are no longer part of emergency treatment.',
        'Observe, measure tryptase, prescribe two auto-injectors and refer to a paediatric allergy service (NICE NG258, 2026).',
      ],
      refs: ['Resuscitation Council UK: Emergency treatment of anaphylaxis (2021)', 'Resuscitation Council UK: Refractory anaphylaxis algorithm (2021)', 'NICE NG258: Anaphylaxis — assessment and referral after emergency treatment (2026)'],
    },
  });

  // =====================================================================
  // P4. SVT in an infant
  // =====================================================================
  add({
    id: 'paed-svt', title: 'Infant with a very fast heart rate', field: 'Paeds', shock: 'Cardiogenic (arrhythmic)', difficulty: 2, setting: 'ed',
    stem: '7-week-old girl (4.5 kg), 12 hours of poor feeding, sweaty and irritable. Triage nurse could not count the heart rate. Monitor shows a regular narrow-complex tachycardia at 280/min.',
    patient: paed(4.5, 0.15, { sex: 'F', rhythm: 'svt', fixedRate: 280, contract: 0.8, lactate: 2.8, look: { sweaty: true } }),
    tick(e, dt) { const p = e.p; if (p.rhythm === 'svt') p.contract = Math.max(0.3, p.contract - 0.0012 * dt); else p.contract = toward(p.contract, 1, 0.01, dt); },
    onEvent(e, ev) {
      const p = e.p;
      const convert = (m) => { p.rhythm = 'sinus'; p.hrBase = 130; e.mark('converted'); return { handled: true, msg: m, kind: 'good' }; };
      if (ev.type === 'action' && ev.id === 'vagal' && p.rhythm === 'svt') return { handled: true, msg: 'Ice-water bag applied to the face (diving reflex) for 10 s — brief slowing, then SVT continues.' };
      if (ev.type === 'drug' && ev.id === 'adenosine' && p.rhythm === 'svt') {
        const k = ev.dose / p.weight;
        if (k < 0.09) return { msg: 'Dose too small — no effect (start at 100–200 micrograms/kg).', kind: 'warn' };
        if (k < 0.28 && !e.flags.ad1) { e.flags.ad1 = true; return { msg: 'Brief AV block then SVT resumes. After at least 1 min, give 300 micrograms/kg.', kind: 'warn' }; }
        return convert('Adenosine: a few seconds of asystole, then sinus rhythm 150/min.');
      }
      if (ev.type === 'action' && ev.id === 'sync_dc') {
        if (p.rhythm !== 'svt') return { handled: true, harm: 'DC cardioversion of sinus rhythm' };
        if (p.map > 42) return { handled: true, msg: 'Synchronised shock 1 J/kg under sedation — converted. (In a compensated infant adenosine is first-line; DC is for decompensated SVT.)', kind: 'warn', ...(convert('Sinus rhythm.') && {}) };
        return convert('Synchronised shock 1 J/kg — sinus rhythm restored.');
      }
    },
    exam: (e) => ({ A: 'Patent.', B: resp(e) + ' Mild tachypnoea, clear chest.', C: circ(e) + (e.p.rhythm === 'svt' ? ' Liver 3 cm below costal margin. Mottled.' : ' Pink, CRT 2 s.'), D: 'Irritable, fontanelle flat.', E: 'Afebrile.' }),
    inv: { bloods: (e) => pLabs(e, { glu: 4.1 }), gas: true, ecg: (e) => ({ note: e.p.rhythm === 'svt' ? 'likely AVRT (commonest infant SVT).' : 'no pre-excitation.' }), cxr: { media: 'cxr_normal', report: 'Mild cardiomegaly.' }, ...noCT, pocus: [{ label: 'Cardiac', media: 'us_plax_poor', report: (e) => (e.p.rhythm === 'svt' ? 'Very fast, reduced function.' : 'Function improving.') }] },
    critical: [
      { text: '12-lead ECG', check: (e) => e.did('inv_ecg') },
      { text: 'Vagal manoeuvre (ice to face)', check: (e) => e.did('vagal') },
      { text: 'Adenosine 100–200 → 300 micrograms/kg', check: (e) => e.did('adenosine') || e.did('sync_dc') },
      { text: 'Sinus rhythm restored', check: (e) => e.p.rhythm === 'sinus' },
    ],
    targets: { map: 48, spo2: 94, hrMax: 180 },
    hint: { steps: [
      { t: 'Accessory pathway re-entry (AVRT) — common in infants', kind: 'cause' },
      { t: 'Rate 220–300 → no filling time', rx: 'Vagal: ice-water to face' },
      { t: 'Heart failure develops over hours (hepatomegaly, poor feeding)', rx: 'Adenosine 0.1–0.2 → 0.3 mg/kg' },
      { t: 'Decompensated shock', rx: 'Synchronised DC 1 J/kg, doubling to max 4 J/kg', kind: 'end' },
    ] },
    debrief: {
      points: [
        'SVT in infants often presents with poor feeding and heart failure; rate is typically > 220/min with fixed R–R.',
        'RCUK 2025 paediatric arrhythmia algorithm: compensated SVT — vagal manoeuvres (ice-water bag to the face in infants), then adenosine via a large proximal vein with rapid flush: 100–200 micrograms/kg, then 300 micrograms/kg after ≥ 1 min (max 12–18 mg).',
        'Decompensated: synchronised cardioversion 1 J/kg, doubling each attempt to a maximum of 4 J/kg, with sedation/analgesia (IM/IN ketamine if no IV) — do not delay for IV access; consider amiodarone 5 mg/kg over > 20 min with expert advice before the 3rd shock.',
        'Discuss with paediatric cardiology for ongoing prophylaxis.',
      ],
      refs: ['Resuscitation Council UK 2025 Guidelines: Paediatric cardiac arrhythmia algorithm', 'APLS: Advanced Paediatric Life Support, 7th edn (ALSG, 2023)'],
    },
  });

  // =====================================================================
  // P5. Convulsive status epilepticus
  // =====================================================================
  add({
    id: 'paed-status', title: 'Prolonged convulsion', field: 'Paeds', shock: null, category: 'Neurological', difficulty: 2, setting: 'ed',
    stem: '3-year-old boy (14 kg), generalised tonic–clonic seizure for 15 minutes. Paramedics gave buccal midazolam 5 mg 10 minutes ago. IV access has just been obtained.',
    patient: paed(14, 3, { stress: 0.7, temp: 38.6, shunt: 0.1, effort: 0.7, lactate: 3.2, glucose: 6.4, gcs: 3, look: { sweaty: true } }),
    init(e) { e.flags.seizing = true; e.flags.benzo = 1; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const lev = e.E('levetiracetam') > 0.004 || e.E('phenytoin') > 0.004;
      if (f.seizing) {
        p.stress = 0.7; p.effort = Math.max(0.35, (p.effort ?? 0.7) - 0.0006 * dt); p.lacGen = 0.0012; p.vo2 = 1.3; p.vco2 = 1.3;
        if (f.benzo >= 2 && e.t - (f.benzoT || 0) > 20 && lev) { f.seizing = false; e.say('The seizure has stopped. Recovery position, monitor airway and breathing.', 'good'); }
        if (p.ventilated) { f.seizing = false; e.say('Seizure terminated with RSI.', 'good'); }
      } else { p.stress = toward(p.stress, 0, 0.02, dt); p.lacGen = 0; p.vo2 = 1; p.vco2 = 1; if (!p.ventilated) p.effort = Math.min(f.benzo > 2 ? 0.5 : 0.9, p.effort + 0.002 * dt); }
      p.gcs = f.seizing ? 3 : 9;
    },
    onEvent(e, ev) {
      const f = e.flags;
      if (ev.type === 'drug' && (ev.id === 'lorazepam' || ev.id === 'midazolam' || ev.id === 'midazolam_buccal')) {
        f.benzo = (f.benzo || 0) + 1; f.benzoT = e.t; e.p.effort = Math.max(0.3, e.p.effort - 0.15);
        if (f.benzo > 2) return { harm: 'More than two doses of benzodiazepine (respiratory depression) — move to second-line agent' };
        return { msg: `Benzodiazepine dose ${f.benzo} (including pre-hospital). Still seizing — if it continues 5 min after this, give a second-line drug.`, kind: 'warn' };
      }
      if (ev.type === 'drug' && ev.id === 'levetiracetam') return { msg: 'Levetiracetam 40 mg/kg over 5 min (APLS 2022).', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'phenytoin') return { msg: 'Phenytoin 20 mg/kg over 20 min with ECG monitoring.', kind: 'good' };
    },
    exam: (e) => ({ A: e.flags.seizing ? 'Secretions, snoring; jaw clenched.' : 'Patent with positioning.', B: resp(e), C: circ(e), D: e.flags.seizing ? 'Generalised rhythmic jerking, eyes deviated, unresponsive.' : 'Post-ictal, responds to voice. Pupils equal.', E: `T ${e.p.temp.toFixed(1)} °C. Glucose ${e.p.glucose.toFixed(1)}. No rash.` }),
    inv: { bloods: (e) => pLabs(e, { extra: [['Ionised calcium', '1.18 mmol/L'], ['Magnesium', '0.84 mmol/L']] }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Normal.' }, ct: [{ label: 'CT head', media: 'ct_head', report: 'Normal.' }], pocus: [] },
    critical: [
      { text: 'Airway manoeuvre + high-flow oxygen', check: (e) => e.p.fio2 >= 0.6 || any(e, 'airway_manoeuvre', 'bvm') },
      { text: 'Check glucose (blood gas / labs)', check: (e) => e.did('inv_gas') || e.did('inv_bloods') },
      { text: 'Second benzodiazepine (IV lorazepam 0.1 mg/kg)', check: (e) => e.flags.benzo >= 2 },
      { text: 'Second-line: levetiracetam 40 mg/kg (or phenytoin)', check: (e) => any(e, 'levetiracetam', 'phenytoin') },
      { text: 'Seizure terminated', check: (e) => !e.flags.seizing },
    ],
    targets: { spo2: 94, map: 55 },
    hint: { steps: [
      { t: 'Febrile illness / epilepsy → failure of seizure-terminating mechanisms', kind: 'cause' },
      { t: 'GABA-A receptors internalise → benzodiazepine resistance with time', rx: 'Max two benzodiazepine doses' },
      { t: '↑ O₂ demand, airway compromise, lactic acidosis', rx: 'Airway, O₂, glucose' },
      { t: 'Refractory status → neuronal injury', rx: 'Levetiracetam / phenytoin, then RSI (anaesthetist)' },
      { t: 'Hypoxic brain injury', kind: 'end' },
    ] },
    debrief: {
      points: [
        'APLS 2022 / NICE NG217: after 5 min give a benzodiazepine (buccal midazolam or IV lorazepam 0.1 mg/kg); repeat once after a further 5 min.',
        'Then second-line: levetiracetam 40 mg/kg (max 3 g) over 5 min — or phenytoin 20 mg/kg or phenobarbital.',
        'If still seizing 5 min after the second-line drug, give another second-line agent, then RSI (anaesthetist/PICU) at about 45 min from onset.',
        'Count pre-hospital doses — more than two benzodiazepine doses increases respiratory depression without benefit.',
      ],
      refs: ['APLS: Status epilepticus algorithm (ALSG, 2022)', 'NICE NG217: Epilepsies in children, young people and adults (2022)'],
    },
  });

  // =====================================================================
  // P6. Major trauma haemorrhage (child)
  // =====================================================================
  add({
    id: 'paed-trauma', title: 'Child hit by a car', field: 'Paeds', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 2, setting: 'ed',
    eblExpected: 'Grade IV splenic laceration: a child can lose 25–40% of circulating volume (blood volume ~80 mL/kg ≈ 2 L at 26 kg, so ~500–800 mL) before the BP falls.',
    stem: '8-year-old boy (26 kg), struck by a car at 30 mph. Complaining of left shoulder-tip and abdominal pain. Pale, cool, tachycardic. Pre-alert: “HR 150, BP not obtained”.',
    patient: paed(26, 8, { vol: 0.74, bleed: 0.0011, lactate: 4.2, coag: 0.15, hb: 98, look: { wound: true } }),
    tick(e, dt) { const p = e.p; if (e.flags.controlled) p.bleed = toward(p.bleed, 0, 0.05, dt); if (mlkg(e) > 20) p.coag = Math.min(1, p.coag + 0.0004 * dt); if (e.fluidIn.ffp > 0) p.coag = Math.max(0, p.coag - 0.0005 * dt); },
    onEvent(e, ev) {
      if (ev.type === 'action' && (ev.id === 'theatre' || ev.id === 'source_control')) {
        if (e.fluidIn.rbc > 0 && (e.did('inv_ct') || e.did('inv_pocus'))) { e.flags.controlled = true; return { handled: true, msg: 'Paediatric surgeon/IR: grade IV splenic laceration with active bleeding — taken for splenic embolisation/surgery now.', kind: 'good' }; }
        return { handled: true, msg: 'Surgeon: where is the bleeding? Start blood and image the abdomen.' };
      }
      if (ev.type === 'fluid' && ev.kind === 'crystalloid' && mlkg(e) > 10) return { harm: 'More than 10 mL/kg crystalloid in haemorrhagic shock — use blood products' };
      if (ev.type === 'inv' && ev.id === 'ct' && e.p.map < 45) return { harm: 'CT while haemodynamically unstable' };
    },
    exam: (e) => ({ A: 'Talking.', B: resp(e) + ' Clear, equal chest. Bruising left lower ribs.', C: circ(e) + ' Pale. Abdomen distended, tender left upper quadrant.', D: 'GCS 14, anxious.', E: 'Tyre mark on the left flank. Grazes.' }),
    inv: { bloods: (e) => pLabs(e, {}), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'No pneumothorax; left lower rib fractures.' }, ct: [{ label: 'CT abdomen', media: null, report: 'Grade IV splenic laceration with active contrast extravasation, moderate haemoperitoneum.' }], pocus: [{ label: 'eFAST LUQ', media: 'us_fast_pos', report: 'Free fluid around the spleen.' }, { label: 'eFAST RUQ', media: 'us_fast_pos', report: 'Free fluid in Morison’s pouch.' }] },
    critical: [
      { text: 'Activate major haemorrhage protocol', check: (e) => e.did('mhp') },
      { text: 'Blood 10 mL/kg boluses (red cells + FFP)', check: (e) => e.fluidIn.rbc > 0 && e.fluidIn.ffp > 0 },
      { text: 'Tranexamic acid 15 mg/kg', check: (e) => e.did('txa') },
      { text: 'Identify source (eFAST / CT) and definitive control', check: (e) => e.flags.controlled },
    ],
    targets: { map: 55, spo2: 94 },
    hint: { steps: [
      { t: 'Blunt splenic injury', kind: 'cause', rx: 'IR / surgery' },
      { t: 'Haemorrhage: children maintain BP until ~30–40% loss (tachycardia, CRT)', rx: 'Blood 10 mL/kg boluses' },
      { t: 'Trauma-induced coagulopathy; crystalloid dilutes', rx: 'FFP, TXA 15 mg/kg' },
      { t: 'Sudden decompensation', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE NG39: in children with active bleeding use blood products (red cells:plasma 1:1) in 10 mL/kg aliquots rather than crystalloid; give TXA 15 mg/kg (max 1 g) within 3 h.',
        'Children compensate well — tachycardia and CRT are early, hypotension is late.',
        'Use eFAST to guide but not exclude; CT only once stable enough; early involvement of the major trauma centre and paediatric surgeons/IR.',
      ],
      refs: ['NICE NG39: Major trauma — assessment and initial management (2016)', 'NICE NG40: Major trauma — service delivery', 'APLS: Advanced Paediatric Life Support, 7th edn (ALSG, 2023)'],
    },
  });

  // =====================================================================
  // P7. Laryngospasm at gas induction (child)
  // =====================================================================
  add({
    id: 'paed-laryngospasm', title: 'Laryngospasm at gas induction', field: 'Paeds', shock: null, category: 'Airway', difficulty: 2, setting: 'theatre',
    stem: '4-year-old girl (16 kg) with a recent cold, gas induction with sevoflurane for dental extractions. A cannula has just been sited. During excitement phase she develops stridor, then complete obstruction. SpO₂ 85% and falling.',
    qrh: ['3-6', '2-6'],
    patient: paed(16, 4, { sex: 'F', effort: 1, airwayPatent: false, fio2: 0.8, look: {} }),
    tick(e, dt) {
      const p = e.p;
      if (p.sa < 0.75) p.hrBase = Math.max(40, p.hrBase - 0.4 * dt); else p.hrBase = toward(p.hrBase, 98, 0.02, dt);
      if (e.flags.sux && e.t - e.flags.sux > 3) { p.effort = 0; e.flags.paralysed = true; }
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && (ev.id === 'jaw_thrust_cpap' || ev.id === 'airway_manoeuvre')) { e.flags.cpap = true; p.fio2 = 1; p.lastFio2 = 1; return { handled: true, msg: 'Jaw thrust and CPAP 100% O₂ — no improvement, still no gas movement.', kind: 'warn' }; }
      if (ev.type === 'drug' && ev.id === 'propofol') { if (ev.dose / p.weight >= 0.9) { p.airwayPatent = true; e.flags.relieved = true; return { msg: 'Propofol breaks the spasm — chest rising with CPAP.', kind: 'good' }; } return { msg: 'Not enough propofol (1 mg/kg in children).', kind: 'warn' }; }
      if (ev.type === 'drug' && ev.id === 'suxamethonium') { p.airwayPatent = true; e.flags.sux = e.t; e.flags.relieved = true; return { msg: 'Suxamethonium given — cords relaxing. Ventilate! (Atropine for bradycardia.)', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'atropine') { p.hrBase = Math.max(p.hrBase, 110); return { msg: 'Atropine 20 mcg/kg — HR recovering.', kind: 'good' }; }
    },
    exam: (e) => ({ A: e.p.airwayPatent ? 'Airway open.' : 'Complete obstruction — no stridor now, tracheal tug.', B: resp(e) + (e.p.airwayPatent ? '' : ' See-saw movement, no air entry.'), C: `HR ${e.p.hr}${e.p.hr < 80 ? ' — BRADYCARDIC' : ''}.`, D: 'Under sevoflurane.', E: 'Runny nose.' }),
    inv: { bloods: (e) => pLabs(e, {}), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'N/A' }, ...noCT, pocus: [] },
    critical: [
      { text: 'Call for help; CPAP 100% O₂ with jaw thrust', check: (e) => e.flags.cpap },
      { text: 'Propofol 1 mg/kg or suxamethonium', check: (e) => any(e, 'propofol', 'suxamethonium') },
      { text: 'Atropine for bradycardia', check: (e) => e.did('atropine') || e.p.hr >= 80 },
      { text: 'Ventilate after suxamethonium', check: (e) => !e.did('suxamethonium') || any(e, 'bvm', 'sga', 'rsi_propofol', 'rsi_ketamine') },
    ],
    targets: { spo2: 94, hrMin: 80 },
    hint: { steps: [
      { t: 'Light plane + recent URTI → irritable larynx', kind: 'cause' },
      { t: 'Cord adduction → complete obstruction', rx: 'CPAP + jaw thrust' },
      { t: 'Children desaturate fast (↑ VO₂, ↓ FRC)', rx: 'Propofol 1 mg/kg' },
      { t: 'Hypoxia → bradycardia', rx: 'Suxamethonium 1–2 mg/kg IV (4 mg/kg IM) + atropine 20 mcg/kg' },
      { t: 'Cardiac arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Laryngospasm is commonest in children, especially with recent URTI and airway surgery.',
        'QRH 3-6 / APA: call for help, 100% O₂ with CPAP and jaw thrust, deepen with propofol; if persisting give suxamethonium (IV, or IM 4 mg/kg if no access) and atropine.',
        'Hypoxic bradycardia in a child is pre-arrest — oxygenate and give atropine; start CPR if HR < 60 with poor perfusion.',
      ],
      refs: [Q('3-6'), 'Association of Paediatric Anaesthetists of GB & Ireland / DAS: Paediatric difficult airway guidelines — unanticipated laryngospasm (2015)', Q('2-6')],
    },
  });

  // =====================================================================
  // P8. Severe croup
  // =====================================================================
  add({
    id: 'paed-croup', title: 'Severe croup', field: 'Paeds', shock: null, category: 'Airway', difficulty: 1, setting: 'ed',
    stem: '2-year-old boy (12 kg), barking cough for 2 days, worse tonight. Stridor at rest, marked sternal recession, agitated. SpO₂ 92% in air.',
    patient: paed(12, 2, { stress: 0.5, shunt: 0.08, look: {} }),
    init(e) { e.p.narrow = 0.6; },
    tick(e, dt) {
      const p = e.p;
      const neb = clamp(e.E('adrenaline_neb') * 6, 0, 0.45);
      if (any(e, 'dexamethasone', 'hydrocortisone') && e.t - (e.firstTime('dexamethasone') ?? e.firstTime('hydrocortisone')) > 40) p.narrow = Math.max(0.15, p.narrow - 0.002 * dt);
      else p.narrow = Math.min(0.85, p.narrow + 0.0005 * dt);
      const n = Math.max(0, p.narrow - neb) + (e.flags.upset ? 0.15 : 0);
      if (!p.ventilated) { p.effort = clamp(1 - n * 0.85, 0.15, 1); p.stress = n; }
      if (e.flags.upset && e.t - e.flags.upsetT > 30) e.flags.upset = false;
    },
    extraActions: [{ id: 'croup_examine', name: 'Examine the throat with a tongue depressor' }, { id: 'croup_calm', name: 'Keep calm on parent’s lap; minimal handling' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'croup_examine') { e.flags.upset = true; e.flags.upsetT = e.t; return { handled: true, harm: 'Examining the throat in severe upper-airway obstruction (can precipitate complete obstruction)' }; }
      if (ev.type === 'action' && ev.id === 'croup_calm') return { handled: true, msg: 'Child calmer on mum’s lap; mask held by parent.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'adrenaline_neb') return { msg: 'Nebulised adrenaline 400 micrograms/kg — improvement within minutes, lasts ~2 h. Observe for rebound; involve anaesthesia/ENT.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'salbutamol_neb') return { msg: 'Salbutamol does not help croup (no bronchospasm).', kind: 'warn' };
    },
    exam: (e) => ({ A: `${e.p.effort < 0.6 ? 'Loud stridor at rest, tracheal tug.' : e.p.effort < 0.85 ? 'Stridor at rest.' : 'Stridor only when upset.'} Barking cough. Not drooling.`, B: resp(e) + ` ${e.p.effort < 0.6 ? 'Severe sternal and subcostal recession.' : 'Mild recession.'}`, C: circ(e), D: e.p.paco2 > 55 ? 'Drowsy — concerning.' : 'Agitated.', E: 'T 38.0 °C.' }),
    inv: { bloods: (e) => pLabs(e, {}), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Not indicated in croup.' }, ...noCT, pocus: [] },
    critical: [
      { text: 'Dexamethasone 0.15 mg/kg (0.6 mg/kg if severe)', check: (e) => any(e, 'dexamethasone', 'hydrocortisone') },
      { text: 'Nebulised adrenaline 0.4 mL/kg of 1:1000 (max 5 mL)', check: (e) => e.did('adrenaline_neb') },
      { text: 'Oxygen', check: (e) => e.p.fio2 > 0.3 },
      { text: 'Minimal handling (do not examine the throat)', check: (e) => !e.did('croup_examine') },
    ],
    targets: { spo2: 94 },
    hint: { steps: [
      { t: 'Parainfluenza virus → subglottic mucosal oedema', kind: 'cause', rx: 'Dexamethasone' },
      { t: 'Small airway radius: resistance ∝ 1/r⁴', rx: 'Nebulised adrenaline (vasoconstriction)' },
      { t: 'Agitation ↑ turbulent flow → worse obstruction', rx: 'Keep calm, minimal handling' },
      { t: 'Fatigue, hypoxia, rising CO₂', rx: 'Senior anaesthetist/ENT for intubation (smaller tube)' },
      { t: 'Complete obstruction', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE CKS / APLS: single dose oral dexamethasone 0.15 mg/kg for all severities (0.6 mg/kg in severe croup; IM/nebulised budesonide if vomiting).',
        'Severe croup: oxygen, nebulised adrenaline 400 micrograms/kg (0.4 mL/kg 1:1000, max 5 mL), minimal handling and early senior anaesthetic/ENT involvement.',
        'Do not examine the throat or upset the child; observe at least 2–3 h after nebulised adrenaline for rebound.',
      ],
      refs: ['NICE CKS: Croup (2023)', 'APLS: Advanced Paediatric Life Support, 7th edn (ALSG, 2023)'],
    },
  });

  // =====================================================================
  // P9. Diabetic ketoacidosis (child)
  // =====================================================================
  add({
    id: 'paed-dka', title: 'Diabetic ketoacidosis', field: 'Paeds', shock: 'Hypovolaemic (osmotic diuresis)', difficulty: 3, setting: 'ed',
    stem: '12-year-old girl (40 kg), 1 week of thirst and weight loss, now vomiting with abdominal pain and deep sighing breathing. Capillary glucose “HI”, ketones 6.2 mmol/L.',
    patient: paed(40, 12, { sex: 'F', vol: 0.86, extraAcid: 18, glucose: 32, k: 5.4, na: 133, lactate: 1.8, gcs: 14, look: {} }),
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const ins = e.rate('insulin_inf') > 0 && !e.flags.ivDown ? clamp(e.rate('insulin_inf') / 0.1, 0, 1) : 0;
      if (ins > 0) { p.extraAcid = Math.max(2, p.extraAcid - 0.03 * ins * dt); p.glucose = Math.max(4, p.glucose - 0.04 * ins * dt); p.k = Math.max(2.4, p.k - (f.kFluid ? 0.0015 : 0.006) * ins * dt); }
      if (f.kFluid) p.k = Math.min(5, p.k + 0.002 * dt);
      if (!e.did('fluid') && ins === 0) { p.extraAcid = Math.min(24, p.extraAcid + 0.008 * dt); p.vol = Math.max(0.7, p.vol - 0.0002 * dt); }
      p.gcs = p.ph < 7.0 ? 13 : 15;
      if (p.k < 3) { p.ecg = Object.assign({}, p.ecg, { tPeak: 0.4 }); if (!f.kMsg) { f.kMsg = true; e.say('ECG: flattened T waves, U waves — hypokalaemia.', 'bad'); } }
      if (p.k < 2.6 && !f.vf) { f.vf = true; p.rhythm = 'vt'; p.fixedRate = 200; }
      // cerebral oedema risk
      if (f.oedemaRisk > 2 && !f.ce) { f.ce = true; e.say('She complains of headache and becomes confused; HR falling to 60, BP rising — CEREBRAL OEDEMA.', 'bad'); p.gcs = 10; p.hrBase = 50; p.stress = 0.6; }
    },
    complication(e) { e.flags.ce = true; e.flags.complText = 'Cerebral oedema developed during treatment — treat immediately with hypertonic saline or mannitol and involve PICU.'; e.say('She complains of severe headache, becomes agitated then drowsy; HR 55, BP rising — CEREBRAL OEDEMA.', 'bad'); e.p.hrBase = 45; e.p.stress = 0.6; return true; },
    extraActions: [{ id: 'dka_hts', name: 'Hypertonic saline 2.7% 2.5–5 mL/kg (or mannitol 0.5–1 g/kg)' }],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'fluid' && ev.id === 'salineK') { f.kFluid = true; return { msg: 'Maintenance + deficit fluid with 40 mmol/L KCl running.', kind: 'good' }; }
      if (ev.type === 'fluid' && mlkg(e) > 20 && p.map > 55) { f.oedemaRisk = (f.oedemaRisk || 0) + 1; return { harm: 'More than 20 mL/kg bolus in a non-shocked child with DKA (cerebral oedema risk)' }; }
      if (ev.type === 'inf' && ev.id === 'insulin_inf' && ev.rate > 0 && !e.did('fluid')) { f.oedemaRisk = (f.oedemaRisk || 0) + 1; return { harm: 'Insulin started before IV fluids' }; }
      if (ev.type === 'inf' && ev.id === 'insulin_inf' && ev.rate > 0.1) return { harm: 'Insulin above 0.1 units/kg/h' };
      if (ev.type === 'drug' && ev.id === 'insulin_glucose') return { harm: 'Insulin bolus in paediatric DKA' };
      if (ev.type === 'drug' && ev.id === 'bicarbonate') { f.oedemaRisk = (f.oedemaRisk || 0) + 1; return { harm: 'Bicarbonate in DKA (increases cerebral oedema risk)' }; }
      if (ev.type === 'action' && ev.id === 'dka_hts') { if (!f.ce) return { handled: true, harm: 'Hypertonic saline without cerebral oedema' }; f.ce = false; f.ceTreated = true; p.hrBase = 92; p.stress = 0; p.gcs = 14; f.oedemaRisk = 0; return { handled: true, msg: 'Hypertonic saline given, head up 30°, fluids reduced; PICU on the way. Conscious level improving.', kind: 'good' }; }
    },
    exam: (e) => ({ A: 'Patent.', B: resp(e) + ' Deep, sighing (Kussmaul) respiration; ketotic breath.', C: circ(e) + ' Dry mucous membranes; ~5% dehydration.', D: `GCS ${e.p.gcs}. ${e.flags.ce ? 'Headache, irritable, pupils sluggish.' : 'Tired.'}`, E: 'Abdomen soft, mild diffuse tenderness.' }),
    inv: { bloods: (e) => pLabs(e, { urea: 9.8, cr: 88, extra: [['Blood ketones', `${Math.max(0.4, (e.p.extraAcid / 3)).toFixed(1)} mmol/L`]] }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Normal.' }, ct: [{ label: 'CT head', media: 'ct_head', report: (e) => (e.flags.ce ? 'Effacement of sulci and basal cisterns — cerebral oedema.' : 'Normal.') }], pocus: [] },
    critical: [
      { text: 'Blood gas / ketones / potassium', check: (e) => e.did('inv_gas') },
      { text: 'IV fluid: 10 mL/kg bolus then deficit + maintenance with potassium', check: (e) => e.flags.kFluid },
      { text: 'Fixed-rate insulin 0.05–0.1 units/kg/h after fluids', check: (e) => e.did('insulin_inf') },
      { text: 'No insulin bolus, no bicarbonate', check: (e) => !e.did('insulin_glucose') && !e.did('bicarbonate') },
      { text: 'Treat cerebral oedema if it occurs', check: (e) => !e.flags.ce },
    ],
    targets: { map: 60, phMin: 7.15, kMin: 3.5, spo2: 94 },
    hint: { steps: [
      { t: 'Insulin deficiency', kind: 'cause', rx: 'Insulin infusion 0.05–0.1 u/kg/h (after fluids)' },
      { t: 'Lipolysis → ketoacids → metabolic acidosis (Kussmaul)', rx: 'Do not give bicarbonate' },
      { t: 'Hyperglycaemia → osmotic diuresis → dehydration, total body K⁺ depletion', rx: 'Fluids with 40 mmol/L KCl' },
      { t: 'Rapid osmolar shifts → cerebral oedema', rx: 'Avoid excess fluid; hypertonic saline/mannitol' },
      { t: 'Coma, death', kind: 'end' },
    ] },
    debrief: {
      points: [
        'BSPED 2021 (v3): if IV fluids are needed and not shocked, give 10 mL/kg 0.9% saline over 30 min (subtracted from the deficit). If shocked, 10 mL/kg over 15 min, reassess and repeat; consider inotropes at 40 mL/kg. Then deficit (5% mild/moderate, 10% severe) over 48 h plus Holliday–Segar maintenance, with 40 mmol/L KCl.',
        'Start insulin 0.05 units/kg/h (0.1 if severe or per local policy) 1–2 hours after IV fluids begin; never give an insulin bolus. Defer insulin if K⁺ < 3.0. Do not give bicarbonate (only after intensivist discussion for life-threatening hyperkalaemia or severe acidosis with poor contractility).',
        'Watch for cerebral oedema (headache, bradycardia, hypertension, falling GCS): hypertonic saline 2.7% or 3% 2.5–5 mL/kg over 10–15 min or mannitol 20% 0.5–1 g/kg, restrict fluids to half maintenance, then PICU.',
        'Monitor K⁺ hourly at first — insulin drives it into cells.',
      ],
      refs: ['BSPED: Guideline for the management of children and young people under 18 years with DKA (2021, v3 updated November 2024)', 'NICE NG18: Diabetes (type 1 and type 2) in children and young people (2023)'],
    },
  });

  // =====================================================================
  // P10. Bronchiolitis with apnoeas
  // =====================================================================
  add({
    id: 'paed-bronchiolitis', title: 'Bronchiolitis with apnoeas', field: 'Paeds', shock: null, category: 'Respiratory', difficulty: 2, setting: 'ed',
    stem: '6-week-old boy (4 kg), born at 34 weeks. 3 days of cough and coryza, poor feeding. Mother noticed he “stopped breathing and went blue” twice today. SpO₂ 86% in air, RR 70.',
    patient: paed(4, 0.12, { shunt: 0.22, rrBase: 64, stress: 0.2, look: {} }),
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const support = f.cpap ? 0.15 : e.flags.hfno ? 0.5 : 1;
      p.shunt = clamp((f.cpap ? 0.1 : e.flags.hfno ? 0.14 : 0.22) + (f.suctioned ? -0.03 : 0), 0.05, 0.3);
      f.apT = (f.apT || 0) + dt;
      if (!f.apnoea && f.apT > 30 / support && !p.ventilated) { f.apnoea = true; f.apT = 0; p.effort = 0; e.say('APNOEA — no breathing, HR dropping, going blue.', 'bad'); }
      if (f.apnoea) { p.hrBase = Math.max(55, p.hrBase - 1.2 * dt); if (f.apT > 14 || p.assisted) { f.apnoea = false; f.apT = 0; p.effort = 1; p.assisted = false; e.say(p.assisted ? 'Breathing again after stimulation/breaths.' : 'He starts breathing again spontaneously.', 'warn'); } }
      else p.hrBase = toward(p.hrBase, 150, 0.05, dt);
    },
    extraActions: [{ id: 'br_stimulate', name: 'Stimulate (during apnoea)' }, { id: 'br_suction', name: 'Nasal suction' }, { id: 'br_cpap', name: 'Nasal CPAP 6–8 cmH₂O' }],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action' && ev.id === 'br_stimulate') { if (f.apnoea) { f.apnoea = false; f.apT = 0; p.effort = 1; return { handled: true, msg: 'Stimulated — he gasps and starts breathing.', kind: 'good' }; } return { handled: true, msg: 'Breathing already.' }; }
      if (ev.type === 'action' && ev.id === 'br_suction') { f.suctioned = true; return { handled: true, msg: 'Thick secretions suctioned from the nares — breathing easier.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'br_cpap') { f.cpap = true; p.fio2 = 0.5; p.lastFio2 = 0.5; return { handled: true, msg: 'Nasal CPAP 7 cmH₂O with FiO₂ 0.5 — work of breathing improving. Discuss with PICU/retrieval.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'bvm' && f.apnoea) { f.apnoea = false; f.apT = 0; p.effort = 1; }
      if (ev.type === 'drug' && ['salbutamol_neb', 'adrenaline_neb', 'ipratropium', 'hydrocortisone', 'dexamethasone'].includes(ev.id)) return { msg: 'NICE NG9: do not use bronchodilators, adrenaline or steroids in bronchiolitis.', kind: 'warn' };
      if (ev.type === 'drug' && ev.id === 'antibiotics') return { msg: 'Antibiotics are not routinely indicated in bronchiolitis.', kind: 'warn' };
    },
    exam: (e) => ({ A: 'Copious nasal secretions.', B: resp(e) + (e.flags.apnoea ? ' NOT BREATHING.' : ' Head bobbing, subcostal recession, widespread fine crackles and wheeze.'), C: circ(e), D: 'Lethargic, fontanelle normal.', E: 'T 37.8 °C.' }),
    inv: { bloods: (e) => pLabs(e, {}), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Hyperinflation, peribronchial cuffing, patchy atelectasis.' }, ...noCT, pocus: [{ label: 'Lung ultrasound', media: 'us_blines', report: 'Bilateral B-lines and subpleural consolidations.' }] },
    critical: [
      { text: 'Oxygen / high-flow', check: (e) => e.p.fio2 > 0.3 },
      { text: 'Respond to apnoea (stimulate / bag-mask)', check: (e) => any(e, 'br_stimulate', 'bvm') },
      { text: 'CPAP for apnoeas / impending respiratory failure', check: (e) => e.flags.cpap },
      { text: 'Nasal suction', check: (e) => e.flags.suctioned },
    ],
    targets: { spo2: 92 },
    hint: { steps: [
      { t: 'RSV infection of small airways in a premature infant', kind: 'cause' },
      { t: 'Mucus plugging & oedema → air trapping, atelectasis', rx: 'Nasal suction; O₂' },
      { t: 'Immature respiratory control → central apnoeas', rx: 'Stimulate; bag-mask if needed' },
      { t: 'Fatigue → respiratory failure', rx: 'CPAP (or HFNO) and PICU' },
      { t: 'Hypoxic bradycardia, arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE NG9: give O₂ if SpO₂ < 92%; consider CPAP for impending respiratory failure; nasal suction for secretions/apnoea.',
        'Do not use salbutamol, adrenaline, ipratropium, steroids, hypertonic saline or antibiotics routinely.',
        'Risk factors: prematurity, < 3 months, chronic lung disease, congenital heart disease. Apnoea is an indication for admission and senior review.',
      ],
      refs: ['NICE NG9: Bronchiolitis in children — diagnosis and management (2021)', 'HSE National Clinical Guideline No. 12: Irish Paediatric Early Warning System (PEWS)'],
    },
  });

  // =====================================================================
  // P11. Paediatric cardiac arrest (hypoxic, non-shockable) — PLS
  // =====================================================================
  add({
    id: 'paed-arrest', title: 'Paediatric cardiac arrest', field: 'Paeds', shock: 'Hypoxic (arrest)', difficulty: 2, setting: 'ed', als: true, arrestLimit: 420,
    stem: '3-year-old girl (14 kg) pulled from a garden pond after an unknown time. Paramedics started CPR on scene; on arrival she is unresponsive, not breathing, no pulse. They hand over to you.',
    patient: paed(14, 3, { sex: 'F', rhythm: 'asystole', temp: 34.8, effort: 0, lactate: 6, contract: 0.75, look: {} }),
    extraActions: [{ id: 'pls_rescue', name: '5 rescue breaths (bag-mask, 100% O₂)' }, { id: 'pls_io', name: 'Intraosseous access' }],
    rosc(e) {
      const f = e.flags, ok = f.rescue && e.flags.cpr && f.adr && e.p.assisted;
      if (ok) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 25) { e.p.contract = 0.8; return true; } }
      return false;
    },
    arrestRhythm: () => 'asystole',
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action' && ev.id === 'pls_rescue') { f.rescue = true; p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; return { handled: true, msg: '5 rescue breaths given with good chest rise. Continue 15:2.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'bvm') f.rescue = true;
      if (ev.type === 'action' && ev.id === 'pls_io') { f.io = true; return { handled: true, msg: 'IO needle in the proximal tibia — flushes well.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && p.arrested) {
        const k = ev.dose / p.weight;
        if (k > 15) return { harm: 'Adrenaline overdose (10 micrograms/kg, max 1 mg)', noHarm: true };
        if (k < 7) return { msg: 'Underdosed — 10 micrograms/kg.', kind: 'warn', noHarm: true };
        f.adr = true; return { msg: 'Adrenaline 10 mcg/kg IO — repeat every 3–5 min.', kind: 'good', noHarm: true };
      }
      if (ev.type === 'fluid' && p.arrested) return { msg: 'Fluid 10 mL/kg for possible hypovolaemia.', kind: 'info' };
    },
    exam: (e) => ({ A: e.p.assisted ? 'Bag-mask, good chest rise.' : 'Not breathing.', B: e.p.arrested ? 'Apnoeic.' : resp(e), C: e.p.arrested ? 'No central pulse (brachial/femoral).' : circ(e), D: 'Unresponsive. Pupils 4 mm.', E: `T ${e.p.temp.toFixed(1)} °C. Wet clothes.` }),
    inv: { bloods: (e) => pLabs(e, { k: 4.8 }), gas: true, ecg: {}, cxr: { media: 'cxr_ards', report: 'Bilateral patchy opacities (aspiration).' }, ...noCT, pocus: [{ label: 'Cardiac (during pulse check)', media: null, report: (e) => (e.p.arrested ? 'No cardiac motion.' : 'Moderately impaired function.') }] },
    critical: [
      { text: '5 rescue breaths', check: (e) => e.flags.rescue },
      { text: 'CPR 15:2', check: (e) => e.did('cpr_on') },
      { text: 'IO / IV access', check: (e) => e.flags.io || e.did('resite_iv') },
      { text: 'Adrenaline 10 micrograms/kg as soon as possible (non-shockable)', check: (e) => e.flags.adr },
      { text: 'Do not shock asystole', check: (e) => !e.harms.some((h) => /non-shockable/.test(h)) },
    ],
    targets: { map: 50, spo2: 94 },
    hint: { steps: [
      { t: 'Drowning → hypoxia (most paediatric arrests are respiratory)', kind: 'cause', rx: '5 rescue breaths, oxygenate' },
      { t: 'Hypoxic bradycardia → asystole / PEA', rx: 'CPR 15:2' },
      { t: 'Coronary perfusion only with compressions', rx: 'Adrenaline 10 mcg/kg IO every 3–5 min' },
      { t: 'Consider 4 Hs & 4 Ts (hypothermia!)', rx: 'Warm; treat causes' },
      { t: 'Death / hypoxic brain injury', kind: 'end' },
    ] },
    debrief: {
      points: [
        'RCUK PLS 2025: open the airway, 5 rescue breaths (bag-mask with oxygen, 2-person), then 15 compressions : 2 breaths at 100–120/min, one-third of chest depth; continuous compressions once a tube/SGA is in, ventilating at 25/min (infant), 20 (1–8 y), 15 (8–12 y) or 10 (> 12 y).',
        'Non-shockable rhythm: adrenaline 10 micrograms/kg (max 1 mg) IV/IO as soon as possible, then every 3–5 min.',
        'Shockable: 4 J/kg (escalate stepwise to 8 J/kg, max 360 J, from the 5th shock); adrenaline 10 micrograms/kg and amiodarone 5 mg/kg after the 3rd shock, adrenaline every 3–5 min thereafter, amiodarone repeated once after the 5th shock.',
        'Drowning: oxygenation is key; consider hypothermia and prolong resuscitation if cold.',
      ],
      refs: ['Resuscitation Council UK 2025 Guidelines: Paediatric life support (basic and advanced)', 'Resuscitation Council UK 2025 Guidelines: Paediatric special circumstances — drowning', 'APLS: Advanced Paediatric Life Support, 7th edn (ALSG, 2023)'],
    },
  });

  // =====================================================================
  // P12. Newborn life support
  // =====================================================================
  add({
    id: 'paed-nls', title: 'Newborn not breathing at birth', field: 'Paeds', shock: 'Hypoxic (perinatal)', difficulty: 2, setting: 'ward', satArrest: 0.3,
    stem: 'Term baby boy (3.5 kg) born by emergency caesarean section for fetal bradycardia. At birth he is pale, floppy and not breathing. The midwife puts him on the resuscitaire and starts the clock.',
    patient: paed(3.5, 0.01, { effort: 0, hrBase: 55, mapArrest: 10, hrGain: 8, baro: 0.2, shunt: 0.3, temp: 36.6, tempRate: -0.002, lactate: 7, look: {} }),
    extraActions: [
      { id: 'nls_dry', name: 'Dry, stimulate, wrap / warm' },
      { id: 'nls_airway', name: 'Open airway (neutral position, jaw support)' },
      { id: 'nls_inflation', name: '5 inflation breaths (30 cmH₂O, 2–3 s each)' },
      { id: 'nls_vent', name: 'Ventilation breaths (30/min) for 30 s' },
      { id: 'nls_hr', name: 'Assess heart rate (stethoscope)' },
      { id: 'nls_comp', name: 'Chest compressions 3:1 with 100% O₂' },
      { id: 'nls_uvc', name: 'Umbilical venous catheter' },
    ],
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.dried) p.tempRate = 0;
      if (f.aerated && f.vent) { p.assisted = true; p.shunt = toward(p.shunt, 0.08, 0.02, dt); }
      let target = 50;
      if (f.aerated && f.vent) target = f.compNeeded ? (f.comp ? (f.adr ? 140 : 70) : 55) : 140;
      p.hrBase = toward(p.hrBase, target, 0.02, dt);
      if (p.hr >= 100 && f.vent && !f.breathing && e.t - f.ventT > 25) { f.breathing = true; p.effort = 1; p.assisted = false; e.say('He gasps, then cries — breathing spontaneously, HR > 100, pinking up.', 'good'); }
    },
    init(e) { e.flags.compNeeded = Math.random() < 0.5; },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      const m = {
        nls_dry: () => { f.dried = true; return ['Dried, wet towel removed, wrapped and hat on. Still not breathing.', 'info']; },
        nls_airway: () => { f.airway = true; return ['Head in neutral position, jaw support.', 'info']; },
        nls_inflation: () => { if (!f.airway) return ['No chest rise — open the airway first (neutral position / jaw thrust).', 'warn']; f.aerated = true; return ['5 inflation breaths with visible chest rise.', 'good']; },
        nls_vent: () => { if (!f.aerated) return ['Give inflation breaths first.', 'warn']; f.vent = true; f.ventT = e.t; p.fio2 = f.comp ? 1 : 0.3; p.lastFio2 = p.fio2; return ['Ventilation breaths 30/min with good chest rise.', 'good']; },
        nls_hr: () => [`Heart rate ~${Math.round(p.hr / 10) * 10}/min.${p.hr < 60 && f.vent ? ' Still < 60 after 30 s of effective ventilation — start compressions 3:1 and increase O₂ to 100%.' : ''}`, p.hr < 60 ? 'bad' : 'info'],
        nls_comp: () => { if (!f.vent || p.hr >= 60) { if (p.hr >= 60) e.harm('Neonatal chest compressions with HR ≥ 60/min'); return [p.hr >= 60 ? 'HR is above 60 — compressions are not indicated.' : 'Ensure effective ventilation first.', 'warn']; } f.comp = true; p.fio2 = 1; p.lastFio2 = 1; return ['Chest compressions 3:1 (90 compressions : 30 breaths per minute), 100% O₂.', 'good']; },
        nls_uvc: () => { f.uvc = true; return ['Umbilical venous catheter inserted.', 'good']; },
      };
      if (ev.type === 'action' && m[ev.id]) { const [t, k] = m[ev.id](); return { handled: true, msg: t, kind: k }; }
      if (ev.type === 'action' && ev.id === 'bvm') { if (f.aerated) { f.vent = true; f.ventT = e.t; } }
      if (ev.type === 'drug' && ev.id === 'adrenaline') { const k = ev.dose / p.weight; if (!f.comp) return { harm: 'Adrenaline before effective ventilation and compressions', noHarm: true }; if (k < 8) return { msg: 'Underdosed — 20 micrograms/kg IV.', kind: 'warn', noHarm: true }; f.adr = true; const pl = e.pools.adrenaline; if (pl) pl.depot *= 0.02; return { msg: 'Adrenaline 20 mcg/kg via UVC.', kind: 'good', noHarm: true }; }
    },
    exam: (e) => ({ A: e.flags.airway ? 'Neutral position.' : 'Head flexed.', B: e.flags.breathing ? 'Crying, breathing regularly.' : e.flags.vent ? 'Ventilated, chest moving.' : 'Apnoeic.', C: `HR ${e.p.hr < 60 ? '< 60' : e.p.hr < 100 ? '60–100' : '> 100'}/min. ${e.p.hr < 100 ? 'Pale.' : 'Pink centrally.'}`, D: e.flags.breathing ? 'Tone improving.' : 'Floppy.', E: `T ${e.p.temp.toFixed(1)} °C. ${e.flags.dried ? 'Wrapped.' : 'Wet.'}` }),
    inv: { bloods: (e) => pLabs(e, { glu: 2.8, hb: 160 }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'N/A' }, ...noCT, pocus: [] },
    critical: [
      { text: 'Dry, stimulate, keep warm', check: (e) => e.flags.dried },
      { text: 'Open airway, 5 inflation breaths', check: (e) => e.flags.aerated },
      { text: 'Ventilation breaths and reassess HR', check: (e) => e.flags.vent && e.did('nls_hr') },
      { text: 'Compressions 3:1 (+ adrenaline 20 mcg/kg) only if HR < 60 after effective ventilation', check: (e) => !e.flags.compNeeded || (e.flags.comp && e.flags.adr) },
    ],
    targets: { spo2: 85, hrMin: 100 },
    hint: { steps: [
      { t: 'Perinatal hypoxia (fetal bradycardia)', kind: 'cause' },
      { t: 'Fluid-filled lungs must be aerated', rx: 'Airway + 5 inflation breaths (30 cmH₂O)' },
      { t: 'Bradycardia in the newborn = hypoxia', rx: 'Ventilation breaths 30/min, reassess HR' },
      { t: 'HR < 60 despite good ventilation', rx: 'Compressions 3:1, 100% O₂, adrenaline 20 mcg/kg UVC' },
      { t: 'Hypoxic–ischaemic encephalopathy', kind: 'end' },
    ] },
    debrief: {
      points: [
        'RCUK NLS 2025: start the clock, delay cord clamping where possible, dry/stimulate and keep warm; assess breathing and heart rate (colour is no longer used to guide care).',
        'Not breathing adequately: open the airway and give 5 inflation breaths (30 cmH₂O, 2–3 s, in air for ≥ 32 weeks) with PEEP 6 cmH₂O if possible; check for chest rise, then ventilation breaths at 30/min. Reassess HR and chest rise every 30 s.',
        'Chest not moving: mask seal, head and jaw position, 2-person jaw thrust; consider an SGA, higher pressures, suction or a tracheal tube; repeat inflation breaths.',
        'HR < 60/min after 30 s of effective ventilation: 3 compressions : 1 breath (15 cycles/min) with 100% O₂. Via UVC/IO: adrenaline 20 micrograms/kg every 4 min, volume 10 mL/kg, check glucose. Sodium bicarbonate is no longer recommended.',
        'Pre-ductal SpO₂ targets: 70–75% at 3 min, 80–85% at 5 min, 85–95% at 10 min.',
      ],
      refs: ['Resuscitation Council UK 2025 Guidelines: Newborn resuscitation and support of transition of infants at birth'],
    },
  });
})();
