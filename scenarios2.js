/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Scenario library — part 2: Critical care and Anaesthesia (QRH-based). */
(function () {
  const S = window.Sim;
  const clamp = S.clamp;
  const { add, any, toward, oxygen, vaso, labs } = S.scnUtil;
  const fio2High = (e) => e.p.fio2 >= 0.9;

  // =====================================================================
  // ICU 1. Neurogenic shock
  // =====================================================================
  add({
    id: 'icu-neurogenic', title: 'Neurogenic shock after cervical cord injury', field: 'ICU', shock: 'Distributive (neurogenic)', difficulty: 2, setting: 'icu',
    stem: 'Referral from ED: 40-year-old man dived into a shallow pool. Unable to move his legs, weak hands. Hypotensive and bradycardic despite 1 L of crystalloid. You are the ICU registrar attending resus.',
    patient: { age: 40, sex: 'M', weight: 80, vasoplegia: 0.8, venodil: 0.12, baro: 0.08, hrBase: 50, effort: 0.75, rrBase: 22, temp: 36.0, lactate: 2.2, look: { collar: true } },
    init(e) { e.fluidIn.crystalloid = 0; },
    onEvent(e, ev) {
      if (ev.type === 'fluid' && ev.kind === 'crystalloid' && e.fluidIn.crystalloid > 1500) return { harm: 'Large-volume fluid in neurogenic shock — risk of pulmonary oedema; use vasopressors' };
    },
    exam: (e) => ({
      A: 'Patent, collar in situ. Talking.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Diaphragmatic (paradoxical) breathing, weak cough.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Warm, pink peripheries despite hypotension. Abdomen soft, eFAST negative.`,
      D: 'GCS 15. Sensory level C4. Power: 0/5 lower limbs, 1/5 upper limbs. Priapism. Reduced anal tone.',
      E: `T ${e.p.temp.toFixed(1)} °C (poikilothermic). Graze to forehead.`,
    }),
    inv: {
      bloods: (e) => labs(e, {}),
      ecg: {},
      cxr: { media: 'cxr_normal', report: 'Low lung volumes, otherwise normal.' },
      ct: [{ label: 'CT cervical spine', media: 'ct_cspine', report: 'Flexion-teardrop fracture: anteroinferior vertebral body fragment with retrolisthesis of the body into the canal — unstable, high risk of cord injury. MRI recommended.' }, { label: 'CT head', media: 'ct_head', report: 'No acute intracranial abnormality.' }],
      pocus: [
        { label: 'eFAST RUQ', media: 'us_morison_neg', report: 'No free fluid.' },
        { label: 'eFAST pelvis', media: null, report: 'No free fluid.' },
        { label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Normal LV function, adequately filled.' },
        { label: 'IVC', media: 'us_ivc_normal', report: 'IVC 1.5 cm with ~30% variation.' },
      ],
    },
    critical: [
      { text: 'Exclude haemorrhage (eFAST / CT)', check: (e) => e.did('inv_pocus') || e.did('inv_ct') },
      { text: 'Vasopressor (noradrenaline / metaraminol)', check: vaso },
      { text: 'Treat bradycardia (atropine / glycopyrronium)', check: (e) => any(e, 'atropine', 'glycopyrronium', 'isoprenaline') },
      { text: 'CT cervical spine', check: (e) => e.did('inv_ct') },
    ],
    targets: { map: 80, spo2: 94, hrMin: 55 },
    hint: {
      steps: [
        { t: 'Cord injury above T6 interrupts descending sympathetic pathways', kind: 'cause' },
        { t: 'Loss of sympathetic vasomotor tone → arteriolar & venous dilatation (↓SVR, ↓venous return)', rx: 'Noradrenaline (α + β1)' },
        { t: 'Cardioaccelerator fibres (T1–T4) lost; unopposed vagal tone → bradycardia', rx: 'Atropine / glycopyrronium; pacing if severe' },
        { t: 'Warm, dry, bradycardic hypotension (unlike hypovolaemia)' },
        { t: 'Cord hypoperfusion worsens secondary injury', kind: 'end', rx: 'Target MAP 80–85 mmHg' },
      ],
    },
    debrief: {
      points: [
        'Always exclude haemorrhage first — trauma patients with cord injury often have other injuries.',
        'Neurogenic shock: hypotension with bradycardia and warm peripheries due to loss of sympathetic outflow.',
        'Judicious fluid, then noradrenaline; treat bradycardia with atropine/glycopyrronium; pacing if refractory.',
        'Many centres target MAP 80–85 mmHg for the first days to optimise spinal cord perfusion.',
      ],
      refs: ['NICE NG41: Spinal injury — assessment and initial management (2016)', 'NICE NG40: Major trauma — service delivery (2016)'],
    },
  });

  // =====================================================================
  // ICU 2. Adrenal crisis
  // =====================================================================
  add({
    id: 'icu-adrenal-crisis', title: 'Adrenal crisis (outreach call)', field: 'ICU', shock: 'Distributive (endocrine)', difficulty: 2, setting: 'ward',
    stem: 'Critical care outreach call to a medical ward: 33-year-old woman with Addison\'s disease admitted with 2 days of vomiting and diarrhoea. Unable to keep her oral hydrocortisone down. Now confused and hypotensive.',
    patient: { age: 33, sex: 'F', weight: 55, vasoplegia: 0.55, vol: 0.68, catecholResp: 0.35, na: 127, k: 5.9, glucose: 2.6, hrBase: 92, lactate: 3.4, gcs: 13, temp: 37.8, look: { skin: '#c99f7a' } },
    tick(e, dt) {
      const p = e.p, t0 = e.firstTime('hydrocortisone');
      if (t0 != null && e.t - t0 > 25) { p.catecholResp = toward(p.catecholResp, 1, 0.01, dt); p.vasoplegia = toward(p.vasoplegia, 0.92, 0.008, dt); }
      if (t0 == null) { p.vasoplegia = Math.max(0.35, p.vasoplegia - 0.0004 * dt); p.vol = Math.max(0.5, p.vol - 0.0002 * dt); }
      if (!e.did('glucose')) p.glucose = Math.max(1.8, p.glucose - 0.001 * dt);
      p.gcs = p.glucose < 3.5 ? 12 : p.map < 60 ? 13 : 15;
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'glucose') { e.p.glucose = 6.5; return { msg: 'Capillary glucose now 6.5 mmol/L.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'hydrocortisone') return { msg: 'Hydrocortisone given — continue 50 mg QDS (or 200 mg/24 h infusion).', kind: 'good' };
    },
    exam: (e) => ({
      A: 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Clear chest.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Dry mucous membranes, CRT 4 s. Postural drop on earlier obs.`,
      D: `GCS ${e.p.gcs}, confused. Capillary glucose ${e.p.glucose.toFixed(1)} mmol/L.`,
      E: `T ${e.p.temp.toFixed(1)} °C. Hyperpigmented palmar creases and buccal mucosa. Steroid emergency card in purse.`,
    }),
    inv: {
      bloods: (e) => labs(e, { urea: 12.6, cr: 132, extra: [['Random cortisol', 'Sent (do not delay treatment)']] }),
      ecg: {},
      cxr: { media: 'cxr_normal', report: 'Normal.' }, ct: [],
      pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Flat, collapsing IVC.' }, { label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Small, hyperdynamic LV.' }],
    },
    critical: [
      { text: 'Hydrocortisone 100 mg IV/IM immediately', check: (e) => e.did('hydrocortisone') },
      { text: 'Fluid resuscitation ≥ 1 L', check: (e) => e.fluidIn.crystalloid >= 1000 },
      { text: 'Treat hypoglycaemia', check: (e) => e.did('glucose') },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      steps: [
        { t: 'Primary adrenal failure + intercurrent illness + missed steroid doses', kind: 'cause', rx: 'Hydrocortisone 100 mg IV/IM' },
        { t: 'Cortisol deficiency → ↓ vascular responsiveness to catecholamines (↓ α-receptor expression)', rx: 'Steroid restores pressor response' },
        { t: 'Aldosterone deficiency → Na⁺ & water loss, K⁺ retention → hypovolaemia', rx: '0.9% saline / crystalloid 1 L, then more' },
        { t: 'Impaired gluconeogenesis → hypoglycaemia', rx: 'IV glucose' },
        { t: 'Refractory distributive + hypovolaemic shock', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Suspected adrenal crisis: hydrocortisone 100 mg IV/IM immediately — never wait for cortisol results.',
        'Then 200 mg/24 h (infusion or 50 mg QDS), plus 1 L crystalloid over the first hour.',
        'Vasopressors are often ineffective until steroid is given.',
        'Check glucose, sodium and potassium; identify and treat the precipitant.',
      ],
      refs: ['Society for Endocrinology: Emergency guidance — Acute adrenal insufficiency (adrenal crisis) in adult patients (2020/2023)', 'NHS England National Patient Safety Alert: Steroid Emergency Card (2020)'],
    },
  });

  // =====================================================================
  // ICU 3. Refractory septic shock on the ventilator
  // =====================================================================
  add({
    id: 'icu-refractory-septic', qrh: ['3-14'], title: 'Refractory septic shock (ventilated pneumonia)', field: 'ICU', shock: 'Distributive (septic)', difficulty: 3, setting: 'icu',
    stem: '66-year-old man, day 1 on ICU with severe community-acquired pneumonia. Intubated, on noradrenaline 0.35 mcg/kg/min and rising. FiO₂ 0.6. Nurse calls you: MAP 58 and lactate climbing. Antibiotics given 6 h ago.',
    patient: { age: 66, sex: 'M', weight: 80, ventilated: true, fio2: 0.6, peep: 8, ventRR: 18, effort: 0, shunt: 0.3, peepRecruit: 0.6, vasoplegia: 0.27, contract: 0.6, catecholResp: 0.55, lactate: 5.8, lacGen: 0.001, temp: 38.6, hrBase: 92, artLine: true, cvc: true, vol: 0.98, leak: 0.0002, oedemaProne: 0.3 },
    init(e) { const pl = e.pool('noradrenaline'); pl.rate = 0.35; pl.E = 0.35; e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p, t0 = e.firstTime('hydrocortisone');
      if (t0 != null && e.t - t0 > 40) p.catecholResp = toward(p.catecholResp, 0.95, 0.008, dt);
      if (e.did('vasopressin') || (t0 != null && e.t - t0 > 40)) p.lacGen = 0;
      else p.vasoplegia = Math.max(0.2, p.vasoplegia - 0.0001 * dt);
    },
    onEvent(e, ev) {
      if (ev.type === 'inf' && ev.id === 'noradrenaline' && ev.rate > 0.6) return { msg: 'Very high-dose noradrenaline — add a non-catecholamine vasopressor and consider steroids.', kind: 'warn' };
      if (ev.type === 'fluid' && e.fluidIn.crystalloid > 1000) return { harm: 'Further fluid in a fluid-unresponsive, leaky patient with ARDS' };
    },
    exam: (e) => ({
      A: 'Size 8.0 ETT at 23 cm, secure.', B: `Ventilated: FiO₂ ${e.p.fio2.toFixed(2)}, PEEP ${e.p.peep}, Ppeak ${Math.round(e.p.paw)}. Bronchial breathing right base, coarse crackles bilaterally. SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, ABP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)} (MAP ${Math.round(e.p.map)}). Warm peripheries, CRT 3 s. Fluid balance +4.2 L. Urine 15 mL/h.`,
      D: 'Sedated (RASS −4), pupils equal.', E: `T ${e.p.temp.toFixed(1)} °C. Lines clean.`,
    }),
    inv: {
      bloods: (e) => labs(e, { wcc: 24.3, neut: 21.9, plt: 98, crp: 340, urea: 15.2, cr: 186, bili: 31, alb: 22, extra: [['Procalcitonin', '28 ng/mL'], ['Sputum', 'Streptococcus pneumoniae — sensitive to co-amoxiclav']] }),
      ecg: {},
      cxr: { media: 'cxr_ards', report: 'Dense right lower lobe consolidation with bilateral patchy infiltrates (ARDS). ETT 4 cm above carina, CVC tip in SVC.' },
      ct: [{ label: 'CT chest', media: 'ct_pneumonia', report: 'Right lower lobe consolidation with bilateral dependent ground-glass change. No empyema.' }],
      pocus: [
        { label: 'Parasternal long axis', media: 'us_plax_poor', report: 'Moderately-severely impaired LV (septic cardiomyopathy), EF ~30%.' },
        { label: 'IVC', media: 'us_ivc_normal', report: 'IVC 2 cm, minimal variation on ventilator — unlikely to be fluid responsive.' },
        { label: 'Lung (right base)', media: 'us_blines', report: 'Consolidation with B-lines.' },
      ],
    },
    critical: [
      { text: 'Add vasopressin (second vasopressor)', check: (e) => e.did('vasopressin') },
      { text: 'Hydrocortisone 200 mg/day', check: (e) => e.did('hydrocortisone') },
      { text: 'Echocardiography to assess cardiac function', check: (e) => e.did('inv_pocus') },
      { text: 'Oxygenation optimised (FiO₂/PEEP)', check: (e) => e.p.spo2 >= 92 },
    ],
    targets: { map: 65, spo2: 92 },
    hint: {
      leak: true,
      steps: [
        { t: 'Pneumococcal pneumonia → sepsis + ARDS', kind: 'cause' },
        { t: 'NO-mediated vasoplegia; catecholamine receptor down-regulation; relative vasopressin & cortisol deficiency', rx: 'Vasopressin (V1) — works independent of adrenoceptors' },
        { t: 'Rising noradrenaline dose with diminishing effect', rx: 'Hydrocortisone restores adrenoceptor responsiveness' },
        { t: 'Septic cardiomyopathy → ↓ contractility', rx: 'Consider dobutamine / adrenaline if low CO on echo' },
        { t: 'Shunt from consolidated/oedematous lung → hypoxaemia', rx: '↑ PEEP & FiO₂' },
        { t: 'Persistent hypoperfusion → rising lactate, multi-organ failure', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'SSC 2026: add vasopressin when noradrenaline is 0.25–0.5 mcg/kg/min rather than escalating noradrenaline alone; add adrenaline only if MAP is still inadequate (very low certainty).',
        'Hydrocortisone 200 mg/day is suggested for ongoing vasopressor requirement (ADRENAL, APROCCHSS; SSC 2026 lowered the certainty to low).',
        'Echo to look for septic cardiomyopathy — add an inotrope (dobutamine) or switch to adrenaline if CO is low.',
        'Stop fluids when no longer fluid responsive; positive balance worsens ARDS. SSC 2026 recommends active fluid removal once the shock has resolved.',
      ],
      refs: ['Surviving Sepsis Campaign: International guidelines for management of sepsis and septic shock 2026 (co-sponsored by ESICM; endorsed by the ICS/FICM)', 'HSE National Clinical Guideline No. 26: Sepsis Management for Adults (2021)', 'VANISH trial (JAMA 2016, UK)', 'FICM/ICS: Guidelines on the management of ARDS (2018)', 'AoA QRH 3-14: Sepsis'],
    },
  });

  // =====================================================================
  // ICU 4. Ventilated patient: sudden desaturation (tension PTX)
  // =====================================================================
  add({
    id: 'icu-vent-tension', qrh: ['2-3', '2-2'], title: 'Ventilated patient: sudden desaturation & hypotension', field: 'ICU', shock: 'Obstructive', difficulty: 2, setting: 'icu',
    stem: 'You are called to bed 4: 55-year-old man, day 5 of ventilation for ARDS (PEEP 10). Just had a right subclavian CVC inserted. High-pressure alarm, SpO₂ falling, BP dropping.',
    patient: { age: 55, sex: 'M', weight: 85, ventilated: true, fio2: 0.45, peep: 10, ventRR: 16, effort: 0, shunt: 0.18, peepRecruit: 0.5, artLine: true, cvc: true, hrBase: 85 },
    init(e) { e.flags.paralysed = true; },
    start(e) { const p = e.p; p.obstruct = 0.33; p.shunt = 0.36; p.pawExtra = 14; },
    tick(e, dt) {
      const p = e.p;
      if (!e.flags.decompressed) { p.obstruct = Math.min(0.7, p.obstruct + 0.0013 * dt); p.pawExtra = 10 + p.obstruct * 20; }
      if (e.flags.drainAt && e.t >= e.flags.drainAt) { e.flags.drainAt = null; p.obstruct = 0.02; p.shunt = 0.18; p.pawExtra = 0; e.say('Drain bubbling. Airway pressures back to baseline.', 'good'); }
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && (ev.id === 'needle_decompression' || ev.id === 'thoracostomy')) {
        e.flags.decompressed = true; p.obstruct = 0.04; p.shunt = 0.24; p.pawExtra = 3;
        return { handled: true, msg: ev.id === 'thoracostomy' ? 'Right finger thoracostomy: rush of air, lung re-inflates with ventilation. Pressures falling.' : 'Right needle decompression: hiss of air, improvement. Definitive drain needed.', kind: 'good' };
      }
      if (ev.type === 'action' && ev.id === 'chest_drain') { e.flags.decompressed = true; e.flags.drainAt = e.t + (p.obstruct > 0.1 ? 25 : 3); return { handled: true, msg: 'Chest drain going in (right).' }; }
      if (ev.type === 'action' && ev.id === 'vent_disconnect') return { handled: true, msg: 'Disconnected and hand-bagging with 100% O₂: very stiff bag, right side not moving. Tube position and patency confirmed with suction catheter — not a tube problem.' };
      if (ev.type === 'action' && ev.id === 'bvm') return { handled: true, msg: 'Hand-ventilating via ETT: bag very stiff, right chest not moving.' };
      if (ev.type === 'inv' && ev.id === 'cxr' && !e.flags.decompressed) return { msg: 'Portable CXR takes time to arrive — the patient is peri-arrest.', kind: 'warn' };
    },
    exam: (e) => ({
      A: 'ETT 23 cm at teeth, suction catheter passes freely, capnography present.',
      B: e.flags.decompressed ? `Bilateral air entry. Ppeak ${Math.round(e.p.paw)}. SpO₂ ${e.p.spo2}%.` : `Ppeak ${Math.round(e.p.paw)} cmH₂O. Right chest hyper-expanded, absent breath sounds right, hyper-resonant. Trachea deviated left. SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, ABP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}, CVP ${Math.round(e.p.cvp)}.`,
      D: 'Sedated and paralysed.', E: 'Fresh right subclavian CVC.',
    }),
    inv: {
      bloods: (e) => labs(e, { wcc: 14.2, crp: 120 }),
      ecg: {},
      cxr: (e) => e.flags.decompressed ? { media: 'cxr_ards', report: 'Right lung re-expanded, drain in situ. Bilateral ARDS changes.' } : { media: 'cxr_ptx_right', report: 'Large right tension pneumothorax with mediastinal shift to the left.' },
      ct: [],
      pocus: [
        { label: 'Right anterior chest', media: 'us_no_sliding', report: 'No lung sliding, barcode sign on M-mode.' },
        { label: 'Left anterior chest', media: 'us_blines', report: 'Sliding present with B-lines (ARDS).' },
        { label: 'IVC', media: 'us_ivc_pleth', report: 'Plethoric IVC.' },
      ],
    },
    critical: [
      { text: 'Increase FiO₂ to 1.0', check: fio2High },
      { text: 'Systematic DOPES check (hand-ventilate / exclude tube problem)', check: (e) => any(e, 'vent_disconnect', 'bvm') || e.did('exam') },
      { text: 'Decompression (finger thoracostomy / needle)', check: (e) => any(e, 'thoracostomy', 'needle_decompression') },
      { text: 'Chest drain', check: (e) => e.did('chest_drain') },
    ],
    targets: { map: 65, spo2: 92 },
    hint: {
      obstruction: 'Positive pressure drives air into pleura',
      steps: [
        { t: 'Iatrogenic pleural breach (subclavian line) + positive-pressure ventilation', kind: 'cause' },
        { t: 'Each breath forces air into the pleural space → rapid tension', rx: 'Finger thoracostomy (ventilated)' },
        { t: '↑ Intrathoracic pressure → ↓ venous return → ↓ CO', rx: 'Chest drain' },
        { t: 'Lung collapse → shunt + ↑ airway pressures', rx: 'FiO₂ 1.0, hand-ventilate (DOPES)' },
        { t: 'PEA arrest', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'DOPES for the deteriorating ventilated patient: Displacement, Obstruction, Pneumothorax, Equipment, Stacked breaths.',
        'Go to FiO₂ 1.0 and hand-ventilate to separate patient from ventilator problems.',
        'In ventilated patients, finger thoracostomy is fast and reliable; follow with a chest drain.',
        'New high airway pressures + hypotension after a central line or with high PEEP = tension until proven otherwise.',
      ],
      refs: ['ICS / FICM: Guidelines for the Provision of Intensive Care Services', 'BTS Pleural Disease Guideline 2023', 'DAS/ICS guidelines for tracheal intubation in critically ill adults (2018)'],
    },
  });

  // =====================================================================
  // ICU 5. Post-cardiac surgery tamponade
  // =====================================================================
  add({
    id: 'icu-cardiac-tamponade', qrh: ['3-9'], title: 'Tamponade after cardiac surgery', field: 'ICU', shock: 'Obstructive', difficulty: 3, setting: 'icu',
    stem: '68-year-old man, 4 hours after CABG ×3. Still ventilated. Mediastinal drains were draining 200 mL/h but have suddenly stopped. Rising noradrenaline, CVP climbing, urine output falling.',
    patient: { age: 68, sex: 'M', weight: 84, ventilated: true, fio2: 0.4, peep: 5, ventRR: 14, effort: 0, obstruct: 0.38, contract: 0.85, hrBase: 90, artLine: true, cvc: true, lactate: 3.1, pulsus: 0.18, temp: 36.4 },
    init(e) { const pl = e.pool('noradrenaline'); pl.rate = 0.1; pl.E = 0.1; e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p;
      if (!e.flags.opened) p.obstruct = Math.min(0.68, p.obstruct + 0.0009 * dt);
      if (e.flags.openAt && e.t >= e.flags.openAt && !e.flags.opened) { e.flags.opened = true; p.obstruct = 0.04; p.pulsus = 0; e.say('Chest re-opened on ICU: 600 mL of clot evacuated, bleeding vein graft side-branch clipped. Immediate haemodynamic improvement.', 'good'); }
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'theatre') { e.flags.openAt = e.t + 45; return { handled: true, msg: 'Cardiac surgeon called — emergency re-sternotomy on the unit. Prepping now (≈ 45 s).', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'pericardiocentesis') { p.obstruct = Math.max(0.15, p.obstruct - 0.12); return { handled: true, msg: 'Only 40 mL aspirated — post-operative collections are often clotted and loculated. Small transient improvement.', kind: 'warn' }; }
      if (ev.type === 'action' && ev.id === 'call_help') return { handled: true, msg: 'Consultant intensivist and cardiac surgeon called.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'gtn') return { harm: 'Vasodilator in tamponade' };
      if (ev.type === 'vent' && ev.key === 'peep' && ev.value > 8) return { msg: 'Higher PEEP further impairs venous return in tamponade.', kind: 'warn' };
    },
    exam: (e) => ({
      A: 'ETT secure.', B: `Ventilated, SpO₂ ${e.p.spo2}%. Equal air entry.`,
      C: `HR ${e.p.hr}, ABP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)} with marked respiratory swing. CVP ${Math.round(e.p.cvp)} mmHg. Mediastinal drains: no output for 20 min, clot visible in tubing. Muffled heart sounds. Cool peripheries.`,
      D: 'Sedated.', E: 'Sternal wound dressing dry.',
    }),
    inv: {
      bloods: (e) => labs(e, { plt: 112, extra: [['ACT', '128 s'], ['ROTEM', 'Normal clot formation']] }),
      ecg: { lowVolt: true },
      cxr: { media: 'cxr_ct_effusion', report: 'Enlarged, globular cardiac silhouette compared with the immediate post-op film — consistent with a pericardial collection.' },
      ct: [{ label: 'CT chest', media: 'cxr_ct_effusion', report: 'Large haemopericardium with clot posterior to the right atrium. (Do not take an unstable patient to CT.)' }],
      pocus: [
        { label: 'Apical 4-chamber', media: 'us_tamponade_echo', report: 'Large circumferential collection with diastolic collapse of the right heart.' },
        { label: 'Subcostal', media: 'us_tamponade', report: 'Pericardial collection with RV diastolic collapse — tamponade physiology. (TTE windows often limited post-sternotomy; TOE is definitive.)' },
        { label: 'IVC', media: 'us_ivc_pleth', report: 'Plethoric IVC, no variation.' },
      ],
    },
    critical: [
      { text: 'Call for senior/surgical help', check: (e) => e.did('call_help') },
      { text: 'Echo to confirm tamponade', check: (e) => e.did('inv_pocus') },
      { text: 'Maintain preload (fluid bolus) while preparing', check: (e) => e.fluidIn.crystalloid + e.fluidIn.rbc >= 250 },
      { text: 'Emergency re-sternotomy (cardiac surgeon)', check: (e) => e.flags.opened },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      obstruction: 'Clot in pericardium compresses RA/RV',
      steps: [
        { t: 'Mediastinal bleeding with blocked drains → blood and clot accumulate', kind: 'cause', rx: 'Re-sternotomy and evacuation' },
        { t: '↑ Pericardial pressure exceeds right-sided filling pressures' },
        { t: 'RA/RV diastolic collapse → ↓ filling (preload) despite ↑ CVP', rx: 'Fluid to maintain filling; avoid high PEEP & vasodilators' },
        { t: '↓ SV, equalisation of diastolic pressures, pulsus paradoxus' },
        { t: 'Compensatory tachycardia/vasoconstriction fail → PEA', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Post-cardiac surgery tamponade: sudden cessation of drain output, rising CVP and inotrope requirement, hypotension, pulsus paradoxus.',
        'Emergency re-sternotomy is definitive. Pericardiocentesis is often ineffective due to clot/loculation.',
        'Optimise preload, keep the heart rate up, avoid excessive PEEP and vasodilators.',
        'In cardiac arrest after cardiac surgery follow CALS: early re-sternotomy within 5 minutes.',
      ],
      refs: ['EACTS Guidelines for resuscitation in cardiac arrest after cardiac surgery (2017; adopted by the UK CALS programme / SCTS)', 'AoA QRH 3-9: Cardiac tamponade', 'Resuscitation Council UK 2025 Guidelines: Special circumstances — cardiac surgery'],
    },
  });

  // =====================================================================
  // ANAES 1. Anaphylaxis on induction (AoA QRH)
  // =====================================================================
  add({
    id: 'an-anaphylaxis', qrh: ['3-1'], title: 'Anaphylaxis after induction', field: 'Anaes', shock: 'Distributive (anaphylactic)', difficulty: 2, setting: 'theatre',
    stem: '45-year-old woman for elective laparoscopic cholecystectomy. Induction: propofol, fentanyl, rocuronium; co-amoxiclav given; gelatin infusion started. Two minutes later: BP 62/30, HR 135, rising airway pressures, flushed.',
    patient: { age: 45, sex: 'F', weight: 70, ventilated: true, fio2: 0.5, peep: 5, ventRR: 12, effort: 0, med: 0.85, bronchBase: 0.6, hrBase: 90, look: { urticaria: true, flush: 0.7, surgField: 'upper' } },
    init(e) { e.flags.paralysed = true; S.anaphylaxisTick(e, 0, 0); },
    tick(e, dt) { S.anaphylaxisTick(e, dt, e.did('stop_trigger') ? 0.0011 : 0.0018); },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'adrenaline' && ev.dose >= 500) return { harm: 'Adrenaline 1 mg IV bolus in a patient with output — use 50 mcg boluses' };
      if (ev.type === 'action' && ev.id === 'stop_trigger') return { handled: true, msg: 'Gelatin infusion stopped, no further drugs given. Chlorhexidine-coated lines? — none in use.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'stop_surgery') return { handled: true, msg: 'Surgery postponed — laparoscopy not started.' };
      if (ev.type === 'drug' && (ev.id === 'chlorphenamine' || ev.id === 'hydrocortisone') && !e.did('adrenaline')) return { harm: 'Second-line drugs before adrenaline' };
    },
    exam: (e) => ({
      A: 'ETT correctly placed (capnography).', B: `Ppeak ${Math.round(e.p.paw)}. ${e.p.bronchEff > 0.3 ? 'Widespread wheeze, slow upstroke on capnograph.' : 'Mild wheeze.'} SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Flushed, warm.`, D: 'Anaesthetised.', E: e.p.look.urticaria ? 'Urticarial rash over the chest and arms.' : 'Rash fading.',
    }),
    inv: {
      bloods: (e) => labs(e, { extra: [['Mast cell tryptase', 'Sample 1 taken — repeat at 1–2 h and > 24 h']] }),
      ecg: {},
      cxr: { media: 'cxr_normal', report: 'ETT in good position. Clear lungs.' }, ct: [],
      pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Hyperdynamic, empty LV.' }, { label: 'IVC', media: 'us_ivc_flat', report: 'Small IVC.' }],
    },
    critical: [
      { text: 'Call for help / declare emergency', check: (e) => e.did('call_help') },
      { text: 'Remove triggers (stop gelatin / drugs)', check: (e) => e.did('stop_trigger') },
      { text: 'FiO₂ 1.0', check: fio2High },
      { text: 'Adrenaline IV 50 mcg boluses (± infusion)', check: (e) => e.did('adrenaline') },
      { text: 'Rapid crystalloid bolus 500–1000 mL, repeated as needed', check: (e) => e.fluidIn.crystalloid >= 1000 },
      { text: 'Mast cell tryptase sample', check: (e) => e.did('inv_bloods') },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      leak: true,
      steps: [
        { t: 'IgE-mediated (or direct) mast cell activation by NMBA / antibiotic / gelatin / chlorhexidine', kind: 'cause', rx: 'Remove triggers' },
        { t: 'Histamine, tryptase, leukotrienes, PAF release', rx: 'Adrenaline 50 mcg IV, repeat; infusion if > 3 doses' },
        { t: 'Vasodilatation + capillary leak → ↓ SVR & ↓ preload', rx: 'Crystalloid 20 mL/kg' },
        { t: 'Bronchospasm → ↑ airway pressures, slow capnograph upstroke', rx: 'Salbutamol; adrenaline β2' },
        { t: 'Cardiovascular collapse — EtCO₂ < 2 kPa → start CPR', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'RCUK peri-operative anaphylaxis algorithm (2024) / AoA QRH 3-1: call for help, stop surgery, remove triggers, 100% O₂, adrenaline 50 mcg IV boluses ("if in doubt, give adrenaline"), rapid crystalloid 500–1000 mL repeated (3–5 L may be needed; avoid colloids), raise the legs.',
        'Start CPR if systolic BP < 50 mmHg or cardiac arrest — do not wait for pulselessness.',
        'Poor response to boluses: adrenaline infusion (0.5 mg in 50 mL at 0.5–1 mL/kg/h, peripheral if needed). Refractory: add a second vasopressor (noradrenaline or vasopressin), glucagon 1 mg IV if on β-blockers, steroids only for refractory reactions or shock, consider ECLS.',
        'Mast cell tryptase once stable, again 1–4 h after onset and ≥ 24 h later; refer to an allergy clinic, report to MHRA Yellow Card (UKFAR if fatal). NAP6: antibiotics and NMBAs are the commonest triggers — also chlorhexidine, dyes, colloids and latex.',
      ],
      refs: ['AoA QRH 3-1: Anaphylaxis', 'NAP6: Perioperative anaphylaxis (RCoA, 2018)', 'Resuscitation Council UK: Emergency treatment of anaphylaxis (2021)', 'Resuscitation Council UK: Emergency treatment of peri-operative anaphylaxis — algorithm for anaesthetists (2024)'],
    },
  });

  // =====================================================================
  // ANAES 2. Local anaesthetic systemic toxicity (LAST)
  // =====================================================================
  add({
    id: 'an-last', qrh: ['3-10', '2-1'], title: 'Local anaesthetic systemic toxicity (LAST)', field: 'Anaes', shock: 'Cardiogenic (toxicological)', difficulty: 3, setting: 'theatre',
    stem: 'Block room: 70-year-old woman (60 kg) having a fascia iliaca block for a hip fracture with 40 mL levobupivacaine 0.25%. You are injecting the final 10 mL when she becomes agitated, complains of a metallic taste, then has a generalised seizure.',
    patient: { age: 70, sex: 'F', weight: 60, hrBase: 70, effort: 0.6, vco2: 1.3, gcs: 5, fio2: 0.28, look: { drapes: false } },
    init(e) { e.p.la = 0.8; e.flags.seizing = true; },
    tick(e, dt) {
      const p = e.p;
      if (!e.did('stop_la') && e.t < 40) p.la += 0.008 * dt;
      p.la = Math.max(0, p.la - (0.0008 + 0.022 * clamp(e.E('lipid'), 0, 1)) * dt);
      const la = p.la;
      p.contract = 1 - 0.55 * Math.min(la, 1.3);
      p.hrBase = 80 - 40 * Math.min(la, 1.2);
      p.baro = 1 - 0.6 * Math.min(la, 1);
      p.vasoplegia = 1 - 0.25 * Math.min(la, 1);
      p.naBlock = 0.78 * Math.min(la, 1.3);                 // ECG: PR↑, QRS↑ (≈160 ms at la 0.8), terminal R aVR
      p.chrono = 1 - 0.42 * clamp(la, 0, 1.2);             // SA-node depression → bradycardia despite sympathetic drive
      if (la > 1.32) { p.rhythm = 'vf'; e.say('VF — LAST cardiac arrest (start CPR; lipid; prolonged resuscitation may be needed).', 'bad'); }
      if (e.flags.seizing) { p.effort = 0.7; p.vco2 = 1.3; p.gcs = 5; }
      else if (!p.ventilated) { p.effort = 0.9; p.vco2 = 1.1; p.gcs = 11; }
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'midazolam' && e.flags.seizing) { e.flags.seizing = false; return { msg: 'Seizure terminated.', kind: 'good' }; }
      if (ev.type === 'action' && (ev.id === 'rsi_ketamine' || ev.id === 'rsi_propofol') && e.flags.seizing) { e.flags.seizing = false; return { msg: 'Seizure controlled by induction agent; airway secured.' }; }
      if (ev.type === 'action' && ev.id === 'stop_la') return { handled: true, msg: 'Injection stopped — 30 mL given in total.', kind: 'good' };
      if (ev.type === 'inf' && ev.id === 'vasopressin' && ev.rate > 0) return { harm: 'Vasopressin is not recommended in LAST (AAGBI)' };
      if (ev.type === 'drug' && ev.id === 'adrenaline' && ev.dose >= 100) return { harm: 'Large adrenaline doses impair lipid rescue — use ≤ 1 mcg/kg in LAST' };
      if (ev.type === 'drug' && ev.id === 'lipid') return { msg: 'Lipid 20%: 1.5 mL/kg bolus over 1 min, infusion 15 mL/kg/h started. Repeat bolus at 5 min if needed (max 12 mL/kg).', kind: 'good' };
    },
    exam: (e) => ({
      A: e.p.ventilated || e.p.assisted ? 'Airway supported.' : 'Partially obstructed, snoring.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. ${e.p.la > 0.6 ? 'Broad-complex bradycardia on monitor.' : ''}`,
      D: e.flags.seizing ? 'Generalised tonic-clonic seizure ongoing.' : `Post-ictal, GCS ${e.p.gcs}.`, E: 'Block site groin — no haematoma.',
    }),
    inv: {
      bloods: (e) => labs(e, {}),
      ecg: (e) => ({ note: e.p.la > 0.3 ? 'cardiac sodium-channel blockade from local anaesthetic — bradycardia, PR prolongation and QRS widening that narrow as lipid takes effect.' : 'QRS narrowing as local anaesthetic toxicity resolves.' }),
      cxr: { media: 'cxr_normal', report: 'Normal.' }, ct: [],
      pocus: [{ label: 'Parasternal long axis', media: 'us_plax_poor', report: 'Globally poor LV contraction.' }],
    },
    critical: [
      { text: 'Stop injecting local anaesthetic', check: (e) => e.did('stop_la') },
      { text: 'Call for help', check: (e) => e.did('call_help') },
      { text: 'Airway & 100% oxygen (BVM / intubate)', check: (e) => any(e, 'bvm', 'rsi_ketamine', 'rsi_propofol', 'sga') },
      { text: 'Control seizures (benzodiazepine)', check: (e) => !e.flags.seizing },
      { text: 'Lipid emulsion 20% bolus + infusion', check: (e) => e.did('lipid') },
    ],
    targets: { map: 65, spo2: 94, hrMin: 50 },
    hint: {
      steps: [
        { t: 'Intravascular uptake of bupivacaine (high dose, vascular site, elderly)', kind: 'cause', rx: 'Stop injecting' },
        { t: 'CNS: excitation (tinnitus, metallic taste) → seizures → coma', rx: 'Benzodiazepine; airway & oxygen' },
        { t: 'Cardiac Na⁺ channel blockade → broad QRS, brady, VT/VF', rx: 'Lipid emulsion "lipid sink" + metabolic effects' },
        { t: 'Myocardial depression (↓contractility) + vasodilatation → shock', rx: 'Small-dose adrenaline (< 1 mcg/kg); avoid vasopressin, LA antiarrhythmics' },
        { t: 'Hypoxia/acidosis worsen toxicity — prolonged CPR may be needed (up to 1 h)', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'AAGBI LAST: stop injecting, call for help, airway & 100% O₂, control seizures (benzodiazepine/propofol/thiopental), Intralipid 20%.',
        'Lipid: 1.5 mL/kg over 1 min, then 15 mL/kg/h; up to 2 further boluses 5 min apart; double infusion rate if unstable. Max 12 mL/kg.',
        'In arrest: CPR with modified ALS (adrenaline ≤ 1 mcg/kg), avoid vasopressin, CCBs, β-blockers, lidocaine. Recovery may take > 1 h — consider ECMO.',
        'Prevention: ultrasound guidance, test doses, aspiration, maximum dose awareness (bupivacaine 2 mg/kg).',
      ],
      refs: ['AoA QRH 3-10: Local anaesthetic toxicity', 'AAGBI Safety Guideline: Management of severe local anaesthetic toxicity (2010)', 'Resuscitation Council UK 2025 Guidelines: Special circumstances — toxic agents'],
    },
  });

  // =====================================================================
  // ANAES 3. Malignant hyperthermia
  // =====================================================================
  add({
    id: 'an-mh', qrh: ['3-8', '2-8'], title: 'Malignant hyperthermia', field: 'Anaes', shock: null, category: 'Metabolic', difficulty: 3, setting: 'theatre',
    stem: '22-year-old man having ORIF of an ankle fracture under sevoflurane. 40 minutes in: EtCO₂ is creeping up despite increasing ventilation, HR rising, and the CO₂ absorbent is hot.',
    patient: { age: 22, sex: 'M', weight: 80, ventilated: true, fio2: 0.5, ventRR: 12, peep: 5, effort: 0, vco2: 2.2, vo2: 1.6, temp: 38.3, tempRate: 0.006, k: 5.6, hrBase: 100, lacGen: 0.002, look: { sweaty: true, surgField: 'lower' } },
    init(e) { e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p, dant = e.total('dantrolene');
      const ctrl = clamp(dant / 200, 0, 1);
      const off = e.did('stop_volatile');
      const drive = (1 - ctrl) * (off ? 0.5 : 1);
      p.vco2 = clamp(p.vco2 + (0.002 * drive - 0.012 * ctrl * (p.vco2 > 1.15 ? 1 : 0)) * dt, 1, 4);
      p.vo2 = 1 + (p.vco2 - 1) * 0.6;
      p.lacGen = 0.002 * drive;
      p.k = clamp(p.k + (0.0025 * drive - 0.004 * clamp(e.E('insulin_glucose'), 0, 1) - 0.001 * ctrl) * dt, 3.5, 9);
      p.tempRate = 0.006 * drive - (e.did('active_cooling') ? 0.006 : 0) - 0.002 * ctrl;
      p.hrBase = 90 + 40 * drive + (p.temp - 37) * 4;
      const stab = clamp(e.E('calcium') * 1.6, 0, 0.85);
      if (p.k > 7.3 && stab < 0.3) { p.rhythm = 'vf'; e.say('VF — hyperkalaemic arrest.', 'bad'); }
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'stop_volatile') return { handled: true, msg: 'Vaporiser off and removed, TIVA (propofol) started, fresh gas flow 15 L/min, activated charcoal filters on both limbs.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'dantrolene') return { msg: `Dantrolene ${ev.dose} mg given (total ${Math.round(e.total('dantrolene'))} mg; target 2.5 mg/kg = 200 mg, then 1 mg/kg every 5 min). Ryanodex/dantrolene reconstitution requires extra hands.`, kind: 'good' };
      if (ev.type === 'action' && ev.id === 'stop_surgery') return { handled: true, msg: 'Surgeon asked to finish quickly / stop.' };
      if (ev.type === 'vent' && ev.key === 'ventRR' && ev.value >= 18) return { msg: 'Minute ventilation increased (aim 2–3× normal).', kind: 'good' };
    },
    exam: (e) => ({
      A: 'ETT secure.', B: `Ventilated RR ${e.p.ventRR}, EtCO₂ ${(e.p.etco2 / 7.5).toFixed(1)} kPa rising. SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Ectopics. Skin hot and sweaty.`,
      D: 'Anaesthetised. Masseter and generalised muscle rigidity despite rocuronium.', E: `T ${e.p.temp.toFixed(1)} °C (core). CO₂ absorber hot to touch. Dark urine.`,
    }),
    inv: {
      bloods: (e) => labs(e, { extra: [['Creatine kinase', '18,400 U/L'], ['Myoglobin (urine)', 'Positive']] }),
      ecg: {},
      cxr: { media: 'cxr_normal', report: 'Normal.' }, ct: [], pocus: [],
    },
    critical: [
      { text: 'Declare emergency / call for help (& MH box)', check: (e) => e.did('call_help') },
      { text: 'Stop volatile, TIVA, high FGF, charcoal filters', check: (e) => e.did('stop_volatile') },
      { text: 'Hyperventilate (RR ≥ 18 / 2–3× minute volume)', check: (e) => e.p.ventRR >= 18 },
      { text: 'Dantrolene 2.5 mg/kg (≈ 200 mg)', check: (e) => e.total('dantrolene') >= 190 },
      { text: 'Active cooling', check: (e) => e.did('active_cooling') },
    ],
    targets: { map: 65, spo2: 94, etco2Max: 6.5, tempMax: 38.9, kMax: 6.5 },
    hint: {
      steps: [
        { t: 'Volatile agent / suxamethonium in a susceptible patient (RYR1 mutation)', kind: 'cause', rx: 'Remove trigger: volatile off, TIVA, charcoal filters' },
        { t: 'Uncontrolled Ca²⁺ release from sarcoplasmic reticulum', rx: 'Dantrolene blocks RyR1' },
        { t: 'Sustained muscle contraction → hypermetabolism: ↑ CO₂ & O₂ consumption, heat', rx: 'Hyperventilate, active cooling' },
        { t: 'Rhabdomyolysis → hyperkalaemia, myoglobinuria, CK ↑', rx: 'Insulin–glucose, calcium; diuresis' },
        { t: 'Acidosis, arrhythmia, DIC, death', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'AoA QRH 3-8: stop trigger agents, call for help, hyperventilate with 100% O₂ at high flow, activated charcoal filters, maintain anaesthesia with TIVA.',
        'Dantrolene 2.5 mg/kg IV, then 1 mg/kg every 5 min until controlled (up to 10 mg/kg). Each 20 mg vial needs 60 mL water.',
        'Treat hyperkalaemia (insulin–glucose, calcium), arrhythmias (amiodarone/β-blocker; avoid CCBs with dantrolene), and cool (stop at 38.5 °C).',
        'Refer patient and family to the UK MH Investigation Unit (Leeds).',
      ],
      refs: ['AoA QRH 3-8: Malignant hyperthermia crisis', 'Association of Anaesthetists: Malignant hyperthermia crisis safety guideline (2020)', 'UK MH Investigation Unit, Leeds (24-h hotline)'],
    },
  });

  // =====================================================================
  // ANAES 4. High spinal at caesarean section
  // =====================================================================
  add({
    id: 'an-high-spinal', qrh: ['3-11', '2-4'], title: 'High spinal block at caesarean section', field: 'Anaes', shock: 'Distributive (sympathectomy)', difficulty: 2, setting: 'theatre',
    stem: '31-year-old woman for category 2 caesarean. Spinal: 2.6 mL hyperbaric bupivacaine 0.5% + diamorphine. Five minutes later: "I can\'t breathe properly", weak hands, nauseated. BP 60/30 and HR drifting down.',
    patient: { age: 31, sex: 'F', weight: 78, pregnant: true, cavalComp: 0.88, venodil: 0.25, vasoplegia: 0.82, baro: 0.15, hrBase: 58, effort: 0.75, atropineResp: 1, look: { pregnant: true, surgField: 'lower' } },
    init(e) { e.p.block = 0.4; },
    tick(e, dt) {
      const p = e.p;
      p.block = Math.min(1, p.block + 0.004 * dt);
      p.venodil = 0.2 + 0.1 * p.block;
      p.hrBase = 72 - 25 * p.block;
      if (!p.ventilated) p.effort = clamp(1.6 - 1.45 * p.block, 0.08, 1);
      p.gcs = p.paco2 > 70 || p.spo2 < 85 ? 9 : 15;
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'uterine_displacement') return { handled: true, msg: 'Left uterine displacement — relieves aortocaval compression.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'rsi_propofol') return { noHarm: true, msg: 'Use a reduced induction dose — she is already profoundly vasodilated.', kind: 'warn' };
      if (ev.type === 'action' && ev.id === 'stop_surgery') return { handled: true, msg: 'Obstetrician pauses. (Delivery of the baby may help resuscitation if the mother arrests.)' };
    },
    exam: (e) => ({
      A: 'Patent, voice weak.', B: `RR ${e.p.rr}, shallow. SpO₂ ${e.p.spo2}%. ${e.p.effort < 0.4 ? 'Very weak respiratory effort, unable to speak.' : 'Speaking in short phrases.'}`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Pale, nauseated.`,
      D: `GCS ${e.p.gcs}. Block to cold: ${e.p.block > 0.85 ? 'C4 — hand grip very weak' : 'T1 — hand weakness'}.`, E: 'Term pregnancy, supine on table.',
    }),
    inv: {
      bloods: (e) => labs(e, { hb: 112 }), ecg: {}, cxr: { media: null, report: 'N/A (not indicated).' }, ct: [],
      pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Small IVC (aortocaval compression + venodilatation).' }],
    },
    critical: [
      { text: 'Call for help', check: (e) => e.did('call_help') },
      { text: 'Left uterine displacement', check: (e) => e.did('uterine_displacement') },
      { text: 'Vasopressor bolus (phenylephrine / ephedrine / metaraminol)', check: (e) => any(e, 'phenylephrine', 'ephedrine', 'metaraminol', 'adrenaline', 'noradrenaline') },
      { text: 'Treat bradycardia (atropine / glycopyrronium / ephedrine)', check: (e) => any(e, 'atropine', 'glycopyrronium', 'ephedrine') },
      { text: 'Support ventilation / secure airway', check: (e) => any(e, 'bvm', 'rsi_ketamine', 'rsi_propofol', 'sga') },
    ],
    targets: { map: 65, spo2: 94, hrMin: 55 },
    hint: {
      steps: [
        { t: 'Excess cephalad spread of intrathecal local anaesthetic', kind: 'cause' },
        { t: 'Sympathectomy → arterial & venous dilatation (↓ SVR, ↓ venous return)', rx: 'Phenylephrine / metaraminol infusion and boluses' },
        { t: 'Block of T1–T4 cardioaccelerators → bradycardia', rx: 'Atropine / glycopyrronium / ephedrine' },
        { t: 'Aortocaval compression by the gravid uterus further ↓ preload', rx: 'Left uterine displacement' },
        { t: 'C3–5 (phrenic) involvement → respiratory failure, LOC', rx: 'Ventilate; RSI if needed' },
        { t: 'Maternal & fetal hypoxia, cardiac arrest', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Recognise: hand/arm weakness, dyspnoea, difficulty speaking, hypotension and bradycardia.',
        'Call for help, left uterine displacement, vasopressors (phenylephrine first-line in obstetrics; ephedrine/atropine for bradycardia).',
        'Support ventilation early; if consciousness lost or ventilation inadequate → RSI with reduced dose induction.',
        'If cardiac arrest: CPR with LUD and perimortem caesarean section within 5 minutes.',
      ],
      refs: ['OAA/AoA: Obstetric anaesthetic emergencies QRH — high regional block / total spinal', 'AoA QRH 3-11: High central neuraxial block', 'International consensus statement on vasopressors at caesarean section (Anaesthesia 2018; UK-led, OAA-endorsed)'],
    },
  });

  // =====================================================================
  // ANAES 5. Severe bronchospasm after intubation
  // =====================================================================
  add({
    id: 'an-bronchospasm', qrh: ['3-4'], title: 'Severe bronchospasm after intubation', field: 'Anaes', shock: null, category: 'Respiratory', difficulty: 2, setting: 'theatre',
    stem: '35-year-old man with poorly controlled asthma, induced for emergency appendicectomy (propofol, suxamethonium). After intubation: airway pressure 45 cmH₂O, "shark-fin" capnograph, SpO₂ falling.',
    patient: { age: 35, sex: 'M', weight: 85, ventilated: true, fio2: 0.5, ventRR: 14, peep: 5, effort: 0, bronchospasm: 0.88, hrBase: 95, look: { surgField: 'lower' } },
    init(e) { e.p.load = 1; e.flags.paralysed = true; },
    tick(e, dt) {
      const p = e.p;
      if (e.flags.deep) p.load = Math.max(0.5, p.load - 0.0015 * dt);
      if (e.did('hydrocortisone')) p.load = Math.max(0.45, p.load - 0.0004 * dt);
      p.bronchospasm = 0.88 * p.load;
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'deepen_anaesthesia') { e.flags.deep = true; e.p.load *= 0.85; return { handled: true, msg: 'Sevoflurane increased to 2 MAC (bronchodilator); surgery delayed.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'vent_disconnect') return { handled: true, msg: 'Disconnected: prolonged expiration of trapped gas. Hand-bagging: very stiff. ETT not kinked, suction catheter passes, bilateral breath sounds with wheeze. Not oesophageal or endobronchial.' };
      if (ev.type === 'action' && ev.id === 'stop_trigger') return { handled: true, msg: 'No new drugs given. No rash — anaphylaxis less likely, but keep it in the differential.' };
    },
    exam: (e) => ({
      A: 'ETT 22 cm, capnography trace present.', B: `Ppeak ${Math.round(e.p.paw)} cmH₂O, autoPEEP ${e.p.autoPEEP.toFixed(0)}. ${e.p.bronchEff > 0.3 ? 'Widespread wheeze, poor air entry bilaterally.' : 'Improving air entry.'} SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}.`, D: 'Anaesthetised.', E: 'No rash, no oedema.',
    }),
    inv: {
      bloods: (e) => labs(e, {}), ecg: {},
      cxr: { media: null, report: 'Hyperinflated lungs, ETT above carina, no pneumothorax.' }, ct: [],
      pocus: [{ label: 'Lung (bilateral)', media: 'us_sliding', report: 'Bilateral sliding — no pneumothorax, ETT not endobronchial.' }],
    },
    critical: [
      { text: 'FiO₂ 1.0', check: fio2High },
      { text: 'Exclude mechanical causes (disconnect / check ETT)', check: (e) => any(e, 'vent_disconnect', 'exam', 'inv_pocus') },
      { text: 'Deepen anaesthesia', check: (e) => e.flags.deep },
      { text: 'Bronchodilator (salbutamol / adrenaline / magnesium / ketamine)', check: (e) => any(e, 'salbutamol_iv', 'salbutamol_neb', 'adrenaline', 'magnesium', 'ketamine') },
      { text: 'Reduce RR / prolong expiration to limit gas trapping', check: (e) => e.p.ventRR <= 12 },
    ],
    targets: { map: 65, spo2: 92 },
    hint: {
      steps: [
        { t: 'Airway instrumentation in a reactive airway under light anaesthesia', kind: 'cause', rx: 'Deepen anaesthesia (volatile)' },
        { t: 'Vagal reflex + mediator release → smooth muscle constriction', rx: 'Salbutamol, adrenaline 10–100 mcg IV, Mg, ketamine' },
        { t: '↑ Airway resistance → ↑ peak pressure, slow expiration, shark-fin capnograph' },
        { t: 'Gas trapping (auto-PEEP) → ↑ intrathoracic pressure → ↓ venous return', rx: 'Reduce RR, long I:E, disconnect if hypotensive' },
        { t: 'Hypoxaemia, hypercapnia, cardiovascular collapse', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'AoA QRH 3-4: 100% O₂, exclude mechanical causes (DOPES / kinked tube / endobronchial), deepen anaesthesia, salbutamol, consider adrenaline, magnesium, ketamine, aminophylline.',
        'Ventilate with low RR, long expiratory time; accept permissive hypercapnia.',
        'Consider anaphylaxis — look for rash, hypotension.',
      ],
      refs: ['AoA QRH 3-4: Bronchospasm', 'BTS/SIGN 158: British guideline on the management of asthma — acute asthma (revised November 2024, corrections May 2025)'],
    },
  });

  // =====================================================================
  // ANAES 6. CICO
  // =====================================================================
  add({
    id: 'an-cico', qrh: ['3-3'], title: 'Can\'t intubate, can\'t oxygenate (CICO)', field: 'Anaes', shock: null, category: 'Airway', difficulty: 3, setting: 'theatre',
    stem: 'Emergency laparotomy for a perforated viscus: 50-year-old man, BMI 42, short thick neck. He has been preoxygenated for 3 minutes (EtO₂ 0.9) and you have just given propofol and rocuronium for RSI. Your ODP has a videolaryngoscope, bougie, second-generation SADs and the eFONA set. Secure the airway — follow the DAS 2025 algorithm.',
    patient: { age: 50, sex: 'M', weight: 125, airwayPatent: true, effort: 0, fio2: 1, lastFio2: 1, shunt: 0.12, hrBase: 95, gcs: 3 },
    init(e) { const f = e.flags; f.paralysed = true; f.att = 0; f.sad = 0; f.trauma = 0; f.gaps = 0; f.oxyGap = true; },
    start(e) { e.p.PAO2 = 520; e.p.sa = 0.99; },
    complication(e) {
      if (e.p.ventilated) return false;
      e.p.shunt = Math.min(0.5, e.p.shunt + 0.15); e.flags.regurg = true;
      e.say('Gastric contents are welling up into the pharynx (perforated viscus) — suction, and keep going through the algorithm.', 'bad');
    },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      // Obesity: small FRC, high VO₂ — apnoeic desaturation is fast; HFNO apnoeic oxygenation slows it.
      if (!p.ventilated && (p.V || 0) < 0.15) p.PAO2 -= (p.PAO2 - 25) * dt / (f.hfno || e.did('hfno') ? 150 : 55);
      if (!p.ventilated) p.hrBase = p.sa < 0.75 ? Math.max(30, 95 - (0.75 - p.sa) * 200) : 95;
      else p.hrBase = toward(p.hrBase, 95, 0.02, dt);
      if (!f.lost && f.trauma >= 3) { f.lost = true; p.airwayPatent = false; p.assisted = false; e.say('The airway is now swollen and bloody — facemask ventilation is getting very difficult.', 'warn'); }
    },
    // Options appear only once the preceding DAS step has been done.
    actionStage: (e) => { const f = e.flags; return e.p.ventilated ? 'Front-of-neck airway in place.' : f.cico ? 'Plan D — front-of-neck access.' : f.finalMask ? 'Plan C failed — CICO.' : f.declared ? (f.sad ? 'Plan B — SAD attempts. Then Plan C.' : 'Failed intubation declared — Plan B.') : f.att ? `Plan A — intubation attempts: ${f.att}. Oxygenate between attempts.` : 'Plan A — tracheal intubation.'; },
    extraActions: [
      { id: 'pa_vl', name: 'Plan A: videolaryngoscopy + bougie attempt', repeat: true, primary: true, show: (e) => !e.flags.declared && !e.p.ventilated },
      { id: 'oxy_mask', name: 'Facemask ventilation, 100% O₂ (oxygenate between attempts)', repeat: true, show: (e) => e.flags.att >= 1 && !e.flags.declared && !e.p.ventilated },
      { id: 'pa_optimise', name: 'Optimise: ramp position, laryngeal manipulation, change blade', show: (e) => e.flags.att >= 1 && !e.flags.declared },
      { id: 'pa_senior', name: 'Call the most experienced anaesthetist available', show: (e) => e.flags.att >= 2 && !e.flags.declared },
      { id: 'pa_declare', name: 'Declare failed intubation and open (prime) the eFONA set', primary: true, show: (e) => e.flags.att >= 3 && !e.flags.declared },
      { id: 'pb_sad', name: 'Plan B: insert second-generation SAD (i-gel)', repeat: true, primary: true, show: (e) => e.flags.declared && !e.flags.finalMask && !e.p.ventilated },
      { id: 'pc_mask', name: 'Plan C: final two-person facemask attempt (OPA + NPA, full block)', primary: true, show: (e) => e.flags.declared && e.flags.sad >= 1 && !e.flags.finalMask },
      { id: 'pd_declare', name: 'Plan D: declare "Can\'t intubate, can\'t oxygenate"', primary: true, show: (e) => e.flags.finalMask && !e.flags.cico },
      { id: 'pd_fona', name: 'eFONA: scalpel–bougie–tube cricothyroidotomy', primary: true, show: (e) => e.flags.finalMask && !e.p.ventilated },
    ],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'drug' && ev.id === 'sugammadex') return { msg: 'Sugammadex given. Spontaneous breathing may take minutes to return and will not reliably restore a patent airway after multiple attempts — do not delay eFONA.', kind: 'warn' };
      if (ev.type !== 'action') return;
      const id = ev.id;
      // ---------- Plan A ----------
      if (id === 'pa_vl' || id === 'rsi_propofol' || id === 'rsi_ketamine' || id === 'intubate') {
        if (p.ventilated) return { handled: true, msg: 'The airway is already secured.' };
        if (f.declared) return { handled: true, harm: 'Repeated intubation attempts after failed intubation was declared (DAS)', msg: 'Another laryngoscopy: blood and oedema, no view at all.' };
        f.att++; f.trauma++; p.assisted = false;
        if (f.att > 1 && !f.oxyGap) f.noOxyGap = true;
        if (f.att > 1 && f.oxyGap) f.gaps++;
        f.oxyGap = false;
        const n = f.att;
        if (n === 4 && !f.senior) return { handled: true, harm: 'A fourth intubation attempt by the same operator (DAS: a fourth attempt only by a more experienced colleague)', msg: 'Attempt 4: no better. Grade 4 view, bleeding.' };
        if (n > 4) return { handled: true, harm: 'Repeated intubation attempts beyond the DAS limit', msg: `Attempt ${n}: the larynx is now swollen and bloody. Stop — declare failed intubation.` };
        const views = ['Attempt 1 (videolaryngoscope): epiglottis only — the bougie will not pass. SpO₂ falling during the apnoea. Oxygenate between attempts.',
          f.optimised ? 'Attempt 2 (optimised: ramped, BURP, hyperangulated blade): tip of the arytenoids only; bougie hold-up. Some blood. Oxygenate.' : 'Attempt 2: no change — you have not changed anything. Optimise position and device before the next attempt. Oxygenate.',
          'Attempt 3: grade 4 view, airway oedematous. That is three attempts — declare failed intubation.',
          'Attempt 4 (most experienced colleague, different device): still no view. Declare failed intubation now.'];
        return { handled: true, msg: views[Math.min(n, 4) - 1], kind: 'bad' };
      }
      if (id === 'pa_optimise') { f.optimised = true; return { handled: true, msg: 'Ramped to ear-to-sternal-notch, external laryngeal manipulation ready, hyperangulated blade and stylet loaded.', kind: 'good' }; }
      if (id === 'pa_senior') { f.senior = true; return { handled: true, msg: 'The consultant anaesthetist from next door is on the way — one further attempt is allowed by them only.', kind: 'good' }; }
      if (id === 'pa_declare') { f.declared = true; f.declT = e.t; return { handled: true, msg: '"This is a failed intubation." eFONA set opened and primed on the trolley; scalpel, bougie and 6.0 tube ready. Move to Plan B.', kind: 'good' }; }
      // ---------- oxygenation (facemask / HFNO) ----------
      if (id === 'bvm' || id === 'pc_mask' || id === 'oxy_mask') {
        if (p.ventilated) return { handled: true, msg: 'Already ventilating via the airway device.' };
        if (f.declared && (f.sad > 0 || id === 'pc_mask')) {
          f.finalMask = true; p.assisted = false; p.airwayPatent = false;
          return { handled: true, msg: 'Plan C — final attempt: two-person facemask with oral and nasal airways and full neuromuscular block. No chest rise, no capnography trace. This is CICO.', kind: 'bad' };
        }
        if (!p.airwayPatent) return { handled: true, msg: 'Facemask with adjuncts and two people — no chest rise, no capnography trace.', kind: 'bad' };
        p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; f.oxyGap = true;
        return { handled: true, msg: f.trauma >= 2 ? 'Two-person facemask ventilation with an oral airway — difficult, small tidal volumes, but a capnography trace. SpO₂ recovering.' : 'Facemask ventilation with 100% O₂ — chest rising, capnography trace, SpO₂ recovering.', kind: 'good' };
      }
      if (id === 'hfno') { f.hfno = true; return { handled: true, msg: 'High-flow nasal oxygen at 70 L/min left in place throughout — apnoeic oxygenation slows desaturation between attempts.', kind: 'good' }; }
      // ---------- Plan B ----------
      if (id === 'pb_sad' || id === 'sga') {
        if (p.ventilated) return { handled: true, msg: 'Airway already secured.' };
        f.sad++; f.trauma += 0.5; p.assisted = false;
        if (!f.declared) f.sadEarly = true;
        if (f.sad > 3) return { handled: true, harm: 'More than three SAD insertion attempts (DAS)', msg: `SAD attempt ${f.sad}: no trace. Stop — final facemask attempt, then CICO.` };
        const m = ['SAD attempt 1 (i-gel size 5): large leak, no capnography trace.', 'SAD attempt 2 (change size, jaw thrust, rotation): still no trace.', 'SAD attempt 3 (different second-generation device): no trace. Plan B has failed — move to Plan C.'];
        return { handled: true, msg: m[f.sad - 1], kind: 'bad' };
      }
      // ---------- Plan D ----------
      if (id === 'pd_declare') { f.cico = true; return { handled: true, msg: '"This is a CICO situation — I am performing front-of-neck access." Neck extended (pillow under the shoulders), 100% O₂ continued via the upper airway, block confirmed.', kind: 'good' }; }
      if (id === 'pd_fona') { e.mark('fona'); e.defaultAction('fona'); return f.cico ? { handled: true } : { handled: true, msg: 'You did not declare CICO out loud first — the team was not prepared for front-of-neck access.', kind: 'warn' }; }
      if (id === 'fona') {
        if (!(f.sad > 0 || f.finalMask)) return { msg: 'eFONA performed. Scalpel (No. 10), bougie, 6.0 cuffed tube; vertical skin incision (membrane impalpable), finger dissection, then a transverse stab. Capnography confirms.', harm: 'Front-of-neck access before rescue oxygenation was attempted with a SAD and a final facemask (DAS Plans B and C)', kind: 'good' };
        return { msg: 'eFONA: vertical skin incision (cricothyroid membrane impalpable), finger dissection, transverse stab with a No. 10 blade, bougie into the trachea, 6.0 cuffed tube railroaded. Sustained capnography trace — SpO₂ recovering.', kind: 'good' };
      }
    },
    exam: (e) => ({
      A: e.p.ventilated ? 'Cuffed 6.0 tube via the cricothyroid membrane, sustained capnography trace.' : e.p.assisted ? 'Facemask ventilation with an oral airway — capnography trace present.' : e.p.airwayPatent ? 'Apnoeic after RSI — no airway device in place.' : 'No capnography trace with facemask or SAD. Oedematous, bloody airway.',
      B: e.p.ventilated || e.p.assisted ? `Chest rising. SpO₂ ${e.p.spo2}%.` : `Apnoeic — no chest movement. SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}.`, D: 'Paralysed (rocuronium).', E: 'Obese, short neck; the cricothyroid membrane is not palpable — use the scalpel–finger–bougie technique with a vertical skin incision.',
    }),
    inv: { bloods: (e) => labs(e, {}), ecg: {}, cxr: { media: null, report: 'Not appropriate now.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Call for help', check: (e) => e.did('call_help') || e.flags.senior },
      { text: 'Plan A: no more than 3 attempts (a 4th only by a more experienced colleague)', check: (e) => e.flags.att >= 1 && (e.flags.att <= 3 || (e.flags.att === 4 && e.flags.senior)) },
      { text: 'Oxygenate with a facemask between intubation attempts', check: (e) => e.flags.att >= 2 && !e.flags.noOxyGap },
      { text: 'Declare failed intubation and prime the eFONA set', check: (e) => !!e.flags.declared },
      { text: 'Plan B: second-generation SAD (maximum 3 attempts)', check: (e) => e.flags.sad >= 1 && e.flags.sad <= 3 },
      { text: 'Plan C: final two-person facemask attempt', check: (e) => !!e.flags.finalMask },
      { text: 'Plan D: declare CICO out loud', check: (e) => !!e.flags.cico },
      { text: 'eFONA: scalpel–bougie–tube', check: (e) => e.did('fona') },
    ],
    targets: { map: 65, spo2: 90 },
    hint: {
      steps: [
        { t: 'Obese, short neck: difficult laryngoscopy and fast desaturation (small FRC)', kind: 'cause', rx: 'HFNO apnoeic oxygenation; ramp; VL first' },
        { t: 'Plan A: ≤ 3 attempts (+1 by a more experienced colleague), oxygenate between', rx: 'Then declare failed intubation; prime eFONA' },
        { t: 'Plan B: second-generation SAD, ≤ 3 attempts', rx: 'If it works — stop and think (wake / proceed / FONA)' },
        { t: 'Plan C: one final two-person facemask attempt with full block', rx: 'If it fails — declare CICO' },
        { t: 'Plan D: scalpel–bougie–tube eFONA (vertical incision if impalpable)', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'DAS 2025: Plan A — videolaryngoscope first-line, maximum three attempts (a fourth only by a more experienced colleague); optimise between attempts (position, laryngeal manipulation, device) and oxygenate between every attempt. Peroxygenation with HFNO slows desaturation.',
        'After failed Plan A: say "failed intubation" out loud and open (prime) the eFONA set now. Plan B — second-generation SAD, maximum three attempts. If oxygenation through the SAD works, stop and think: wake the patient, proceed with the SAD, or a controlled front-of-neck airway.',
        'Plan C — one final two-person facemask attempt with oral and nasal adjuncts and full neuromuscular block. If this fails, declare "Can\'t intubate, can\'t oxygenate" and move to Plan D without delay.',
        'eFONA (DAS 2025): scalpel (No. 10 blade), bougie, size 6.0 cuffed tube. A vertical skin incision is the default unless the cricothyroid membrane was clearly identified (palpation or ultrasound-marked) — then a transverse stab is acceptable. Continue 100% O₂ via the upper airway and confirm with capnography.',
        'Sugammadex may be considered but waking does not guarantee airway patency — it must never delay eFONA.',
      ],
      refs: ['Difficult Airway Society 2025 guidelines for management of unanticipated difficult tracheal intubation in adults (Br J Anaesth 2026)', 'AoA QRH 3-3: Can\'t intubate, can\'t oxygenate (CICO)', 'NAP4: Major complications of airway management (RCoA/DAS, 2011)'],
    },
  });

  // =====================================================================
  // ANAES 7. Major obstetric haemorrhage
  // =====================================================================
  add({
    id: 'an-pph', qrh: ['3-2'], title: 'Major obstetric haemorrhage (uterine atony)', field: 'Anaes', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 2, setting: 'theatre',
    stem: 'Obstetric theatre: 29-year-old woman, 30 min after a vaginal twin delivery following a prolonged labour. Epidural in situ. Estimated blood loss now 1.8 L and continuing; the uterus feels boggy.',
    patient: { age: 29, sex: 'F', weight: 70, obstetric: true, vol: 0.74, bleed: 0.0012, coag: 0.35, hb: 96, lactate: 3.2, hrBase: 88, look: { drapes: false, sweaty: true } },
    init(e) { e.flags.ut = new Set(); },
    tick(e, dt) {
      if (e.flags.ctrlAt && e.t >= e.flags.ctrlAt && e.p.bleed > 0) { e.p.bleed = 0; e.say('Intrauterine balloon inflated — bleeding settles.', 'good'); }
      if (e.flags.biUntil && e.t > e.flags.biUntil) { e.flags.biUntil = null; if (e.p.bleed > 0) e.p.bleed *= 2; }
    },
    onEvent(e, ev) {
      const p = e.p, ut = e.flags.ut;
      const uterotonic = (k, f, m) => {
        if (!ut.has(k)) { ut.add(k); p.bleed *= f; }
        if (ut.size >= 3 && p.bleed > 0) { p.bleed = 0; return { msg: 'Uterus now well contracted — bleeding has stopped.', kind: 'good' }; }
        return m ? { msg: m } : null;
      };
      if ((ev.type === 'drug' || ev.type === 'inf') && ev.id === 'oxytocin') return uterotonic('oxy', 0.75, ev.type === 'drug' && ev.dose >= 5 ? 'Give oxytocin bolus slowly — rapid bolus causes vasodilatation and hypotension.' : null);
      if (ev.type === 'drug' && ev.id === 'ergometrine') return uterotonic('ergo', 0.7);
      if (ev.type === 'drug' && ev.id === 'carboprost') return uterotonic('carbo', 0.7);
      if (ev.type === 'drug' && ev.id === 'txa' && !e.flags.txa) { e.flags.txa = true; p.bleed *= 0.85; }
      if (ev.type === 'action' && ev.id === 'bimanual') { if (p.bleed > 0) { p.bleed *= 0.5; e.flags.biUntil = e.t + 60; } return { handled: true, msg: 'Bimanual compression — temporary control while drugs work.' }; }
      if (ev.type === 'action' && ev.id === 'theatre') { e.flags.ctrlAt = e.t + 50; return { handled: true, msg: 'Obstetric consultant: examination under anaesthesia and Bakri balloon now.', kind: 'good' }; }
      if (ev.type === 'fluid' && ev.kind === 'crystalloid' && e.fluidIn.crystalloid > 2000) return { harm: 'Excessive crystalloid (> 2 L) in obstetric haemorrhage — switch to blood products' };
    },
    exam: (e) => ({
      A: 'Patent, talking.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Cool peripheries. Uterus ${e.p.bleed > 0 ? 'soft and boggy, fundus above umbilicus. Ongoing heavy PV bleeding.' : 'firm, well contracted. Minimal loss.'}`,
      D: 'GCS 15, anxious. Epidural working.', E: 'Placenta delivered, appears complete. No genital tract tears.',
    }),
    inv: {
      bloods: (e) => labs(e, { plt: 132, fib: (en) => Math.max(0.9, 2.4 - en.p.coag * 1.5).toFixed(1), extra: [['Fibrinogen (Clauss)', 'Low-normal for pregnancy — aim > 2 g/L']] }),
      ecg: {}, cxr: { media: null, report: 'Not indicated.' }, ct: [],
      pocus: [{ label: 'Pelvis', media: null, report: 'Bulky uterus with intrauterine clot; no free fluid.' }],
    },
    critical: [
      { text: 'Call for help / activate MOH (major haemorrhage) protocol', check: (e) => e.did('mhp') },
      { text: 'Oxytocin', check: (e) => e.did('oxytocin') },
      { text: 'Second-line uterotonic (ergometrine / carboprost)', check: (e) => any(e, 'ergometrine', 'carboprost') },
      { text: 'Tranexamic acid 1 g', check: (e) => e.did('txa') },
      { text: 'Red cell transfusion', check: (e) => e.fluidIn.rbc >= 560 },
      { text: 'Bleeding controlled', check: (e) => e.p.bleed === 0 },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      steps: [
        { t: 'Over-distended (twin) uterus + prolonged labour → uterine atony (Tone of the "4 Ts")', kind: 'cause', rx: 'Oxytocin → ergometrine → carboprost; bimanual compression' },
        { t: 'Placental bed vessels fail to constrict — up to 700 mL/min uterine blood flow at term', rx: 'Balloon tamponade / surgery if refractory' },
        { t: 'Pregnancy physiology masks early hypovolaemia (HR & BP change late)' },
        { t: 'Rapid fibrinogen consumption → coagulopathy', rx: 'TXA, blood, FFP, cryoprecipitate/fibrinogen' },
        { t: 'Haemorrhagic shock', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'The 4 Ts: Tone (commonest), Trauma, Tissue, Thrombin.',
        'Uterotonics: oxytocin 5 units slow IV then infusion, ergometrine 500 mcg, carboprost 250 mcg IM every 15 min (max 8), misoprostol.',
        'TXA 1 g IV (WOMAN trial). Use blood early; keep fibrinogen > 2 g/L; consider viscoelastic testing.',
        'Mechanical/surgical: bimanual compression, intrauterine balloon, B-Lynch, interventional radiology, hysterectomy.',
      ],
      refs: ['RCOG Green-top Guideline 52: Prevention and management of postpartum haemorrhage (2016)', 'OAA/AoA: Obstetric anaesthetic emergencies QRH — major obstetric haemorrhage', 'AoA QRH 3-2: Massive blood loss', 'HSE / RCPI Institute of Obstetricians & Gynaecologists: Clinical practice guideline — Prevention and management of primary PPH (Ireland)', 'WOMAN trial (Lancet 2017)'],
    },
  });

  // =====================================================================
  // ANAES 8. Bradycardia at laparoscopy
  // =====================================================================
  add({
    id: 'an-lap-brady', qrh: ['2-6'], title: 'Severe bradycardia at laparoscopy', field: 'Anaes', shock: 'Cardiogenic (vagal)', difficulty: 1, setting: 'theatre',
    stem: '28-year-old woman, fit and well, for diagnostic laparoscopy. As the surgeon insufflates CO₂ the heart rate drops abruptly from 75 to 32 and BP falls.',
    patient: { age: 28, sex: 'F', weight: 62, ventilated: true, fio2: 0.4, ventRR: 12, effort: 0, hrBase: 30, baro: 0.15, atropineResp: 1, look: { surgField: 'lower' } },
    init(e) { e.flags.insufflated = true; e.flags.paralysed = true; e.flags.lowHR = 0; },
    tick(e, dt) {
      const p = e.p;
      if (e.flags.insufflated) p.hrBase = Math.max(14, p.hrBase - 0.04 * dt);
      else p.hrBase = toward(p.hrBase, 74, 0.05, dt);
      e.flags.lowHR = p.hr < 22 ? e.flags.lowHR + dt : 0;
      if (e.flags.lowHR > 12) { p.rhythm = 'asystole'; e.say('Asystole — vagal arrest.', 'bad'); }
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && (ev.id === 'stop_insufflation' || ev.id === 'stop_surgery')) { e.flags.insufflated = false; return { handled: true, msg: 'Surgeon stops and releases the pneumoperitoneum — vagal stimulus removed.', kind: 'good' }; }
    },
    exam: (e) => ({ A: 'ETT secure.', B: `Ventilated. SpO₂ ${e.p.spo2}%.`, C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}.`, D: 'Anaesthetised.', E: 'Pneumoperitoneum ' + (e.flags.insufflated ? 'at 15 mmHg.' : 'released.') }),
    inv: { bloods: (e) => labs(e, {}), ecg: {}, cxr: { media: 'cxr_normal', report: 'N/A' }, ct: [], pocus: [] },
    critical: [
      { text: 'Ask surgeon to stop / release pneumoperitoneum', check: (e) => any(e, 'stop_insufflation', 'stop_surgery') },
      { text: 'Anticholinergic (glycopyrronium / atropine)', check: (e) => any(e, 'atropine', 'glycopyrronium') },
    ],
    targets: { map: 65, spo2: 94, hrMin: 50 },
    hint: {
      steps: [
        { t: 'Rapid peritoneal stretch on insufflation', kind: 'cause', rx: 'Stop the stimulus (release pneumoperitoneum)' },
        { t: 'Afferent signals → vagal nuclei → ↑ efferent vagal tone to SA/AV nodes', rx: 'Atropine / glycopyrronium' },
        { t: 'Profound bradycardia, AV block → ↓ CO', rx: 'Adrenaline / CPR if asystole' },
        { t: 'Asystole', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'AoA QRH 2-6 (bradycardia): stop the surgical stimulus, give atropine/glycopyrronium, consider adrenaline and pacing if refractory.',
        'Insufflation-induced vagal reflexes are common — warn surgeons and insufflate slowly.',
        'Also consider hypoxia, drugs (remifentanil, suxamethonium, neostigmine), high regional block.',
      ],
      refs: ['AoA QRH 2-6: Bradycardia', 'Resuscitation Council UK 2025 Guidelines: Adult bradyarrhythmia algorithm'],
    },
  });
})();
