/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Scenario library — part 6: trauma, obstetric/GI haemorrhage, burns and toxicology. */
(function () {
  const S = window.Sim;
  const clamp = S.clamp;
  const { add, any, toward, vaso, labs } = S.scnUtil;
  const bp = (e) => `${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}`;
  const ex = (o) => (e) => { const v = (x) => (typeof x === 'function' ? x(e) : x || ''); return { A: v(o.A) || 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. ${v(o.B)}`, C: `HR ${e.p.hr}, BP ${bp(e)}. ${v(o.C)}`, D: v(o.D) || `GCS ${e.p.gcs}.`, E: v(o.E) || `T ${e.p.temp.toFixed(1)} °C.` }; };
  const units = (e, k) => Math.round(e.fluidIn[k] / (k === 'rbc' ? 280 : 270));
  const cxrN = { media: 'cxr_normal', report: 'No acute abnormality.' };
  const bloodGiven = (e) => e.fluidIn.rbc > 0;
  const crystalHarm = (e, ev, lim = 1000) => (ev.type === 'fluid' && ev.kind === 'crystalloid' && e.fluidIn.crystalloid > lim ? { harm: 'Large-volume crystalloid in haemorrhagic shock — use blood products' } : null);
  const TRAUMA_REFS = ['NICE NG39: Major trauma — assessment and initial management (2016)', 'JPAC / BSH: Major haemorrhage guidance (2022)'];

  // =====================================================================
  // Severe traumatic brain injury
  // =====================================================================
  add({
    id: 'em-tbi', title: 'Head injury after a fall from height', field: 'EM', shock: null, category: 'Neurotrauma', difficulty: 3, setting: 'ed',
    stem: '25-year-old man fell from a fourth-floor balcony. GCS 7 (E1 V2 M4), snoring, right pupil 6 mm and sluggish. Bradycardic and hypertensive (Cushing response). C-spine immobilised, on a non-rebreathe mask.',
    patient: { age: 25, sex: 'M', weight: 80, effort: 0.55, airwayPatent: true, vasoplegia: 1.35, hrBase: 52, baro: 0.5, gcs: 7, shunt: 0.08, fio2: 0.6, look: { collar: true, wound: true } },
    init(e) { e.p.icp = 28; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const co2 = p.paco2 / 7.5;
      let d = 0.02 + (co2 > 5.5 ? (co2 - 5.5) * 0.04 : 0) + (p.sa < 0.92 ? 0.06 : 0) + (p.map < 75 ? 0.04 : 0);
      if (f.evac) d = -0.12;
      d -= f.osmo ? 0.04 : 0; d -= f.headUp ? 0.01 : 0; d -= co2 < 4.3 ? 0.03 : 0;
      p.icp = clamp(p.icp + d * dt, 8, 70);
      p.vasoplegia = 1 + clamp((p.icp - 20) / 50, 0, 0.6); p.hrBase = p.icp > 30 ? 48 : 70;
      p.gcs = p.ventilated ? 3 : p.icp > 35 ? 5 : 7;
      if (!p.ventilated) p.effort = clamp(1.05 - p.icp / 50, 0.15, 0.8);
      if (p.icp > 55 && !f.cone) { f.cone = true; e.say('Bilateral fixed dilated pupils — coning.', 'bad'); p.vasoplegia = 0.5; }
    },
    extraActions: [{ id: 'tbi_osmo', name: 'Hypertonic saline 3% 250 mL (or mannitol 0.5 g/kg)' }, { id: 'tbi_headup', name: 'Head up 30°, collar loosened (tape/blocks)' }, { id: 'tbi_neuro', name: 'Neurosurgical referral' }],
    onEvent(e, ev) {
      const f = e.flags;
      if (ev.type === 'action' && ev.id === 'tbi_osmo') { f.osmo = true; return { handled: true, msg: 'Hypertonic saline given — right pupil reacting a little better.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'tbi_headup') { f.headUp = true; return { handled: true, msg: 'Head up 30°, collar replaced with blocks and tape (venous drainage).', kind: 'good' }; }
      if (ev.type === 'action' && (ev.id === 'tbi_neuro' || ev.id === 'theatre')) { if (!e.did('inv_ct')) return { handled: true, msg: 'Neurosurgery: send the CT head.' }; f.evac = true; return { handled: true, msg: 'Neurosurgery: right extradural haematoma — straight to theatre for craniotomy.', kind: 'good' }; }
      if (ev.type === 'vent' && ev.key === 'ventRR' && ev.value >= 22) return { msg: 'Prolonged hyperventilation causes cerebral vasoconstriction/ischaemia — only as a brief bridge for herniation.', kind: 'warn' };
    },
    exam: ex({ A: (e) => (e.p.ventilated ? 'ETT secured; C-spine protected.' : 'Snoring; jaw thrust improves it. C-spine immobilised.'), C: 'No external haemorrhage. Abdomen soft, pelvis stable.', D: (e) => `GCS ${e.p.ventilated ? 'sedated' : e.p.gcs}. Right pupil ${e.p.icp > 35 ? '7 mm fixed' : '6 mm sluggish'}, left 3 mm. Extensor posturing on the left.`, E: 'Boggy right temporal scalp haematoma.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: {}, cxr: cxrN, ct: [{ label: 'CT head + C-spine', media: 'ct_edh_right', report: 'Right temporal extradural haematoma 2.8 cm with 9 mm midline shift and effaced basal cisterns. Overlying skull fracture. C-spine normal.' }], pocus: [{ label: 'eFAST', media: 'us_morison_neg', report: 'Negative.' }] },
    critical: [
      { text: 'RSI with neuroprotective technique', check: (e) => e.p.ventilated },
      { text: 'Normocapnia (PaCO₂ 4.5–5.0 kPa) and SpO₂ ≥ 94%', check: (e) => e.p.ventilated && e.p.paco2 / 7.5 < 5.6 },
      { text: 'Osmotherapy for signs of herniation', check: (e) => e.flags.osmo },
      { text: 'CT head and neurosurgery', check: (e) => e.flags.evac },
    ],
    targets: { map: 80, spo2: 94, etco2Min: 3.8, etco2Max: 5.3 },
    hint: { steps: [
      { t: 'Middle meningeal artery bleed → extradural haematoma', kind: 'cause', rx: 'Craniotomy' },
      { t: 'Monro–Kellie: mass ↑ → ICP ↑ → CPP = MAP − ICP falls', rx: 'MAP ≥ 80, head up, osmotherapy' },
      { t: 'Hypoxia / hypercapnia → vasodilatation → more ICP', rx: 'RSI; normocapnia' },
      { t: 'Cushing response → uncal herniation', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE NG232: intubate if GCS ≤ 8, loss of protective reflexes or ventilatory failure; CT head immediately.',
        'Avoid secondary brain injury: SpO₂ ≥ 94%, PaCO₂ 4.5–5.0 kPa, MAP ≥ 80 mmHg, head up 30°, avoid tight collars.',
        'Signs of herniation: hypertonic saline or mannitol and brief hyperventilation as a bridge to surgery.',
      ],
      refs: ['NICE NG232: Head injury — assessment and early management (2023)', 'Association of Anaesthetists / Neuro Anaesthesia and Critical Care Society: Safe transfer of the brain-injured patient (2019/2024)', ...TRAUMA_REFS.slice(0, 1)],
    },
  });

  // =====================================================================
  // Subdural on a DOAC
  // =====================================================================
  add({
    id: 'em-sdh-doac', title: 'Elderly fall on an anticoagulant', field: 'EM', shock: null, category: 'Neurotrauma', difficulty: 2, setting: 'ed',
    stem: '84-year-old woman tripped at home and hit her head 3 hours ago. On apixaban for AF. Initially GCS 15; now drowsy and repetitive. BP 168/88.',
    patient: { age: 84, sex: 'F', weight: 58, vasoplegia: 1.2, gcs: 13, rhythm: 'af', fixedRate: 88, look: { wound: true } },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const rate = f.neuro ? -0.02 : f.reversed ? 0.002 : 0.02;
      f.gcsF = clamp((f.gcsF ?? 13) - rate * dt, 3, 15); p.gcs = Math.round(f.gcsF);
      if (!p.ventilated) { p.effort = p.gcs <= 6 ? 0.45 : 1; p.airwayPatent = p.gcs > 5 || e.did('airway_manoeuvre'); }
    },
    extraActions: [{ id: 'doac_reverse', name: 'Reverse apixaban (PCC ± andexanet if locally approved)' }, { id: 'sdh_neuro', name: 'Neurosurgical referral' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'doac_reverse') { if (!e.did('inv_ct')) return { handled: true, msg: 'Haematology: confirm the bleed on CT, but do not delay if deteriorating.' }; e.flags.reversed = true; return { handled: true, msg: 'Prothrombin complex concentrate 50 units/kg given — anticoagulation reversed.', kind: 'good' }; }
      if (ev.type === 'action' && (ev.id === 'sdh_neuro' || ev.id === 'theatre')) { if (!e.flags.reversed) return { handled: true, msg: 'Neurosurgery will operate once anticoagulation is reversed.' }; e.flags.neuro = true; return { handled: true, msg: 'Neurosurgery accept for burr-hole / craniotomy.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'txa') return { msg: 'TXA within 2 h in mild–moderate TBI (CRASH-3) — she is beyond 3 h.', kind: 'info' };
    },
    exam: ex({ C: 'Irregularly irregular.', D: (e) => `GCS ${e.p.gcs}. Left pupil ${e.p.gcs < 10 ? 'dilated' : 'normal'}. Mild right drift.`, E: 'Left frontal bruise and laceration.' }),
    inv: { bloods: (e) => labs(e, { extra: [['Apixaban level (anti-Xa)', '178 ng/mL'], ['Group & save', 'Sent']] }), gas: true, ecg: {}, cxr: cxrN, ct: [{ label: 'CT head', media: 'ct_sdh_left', report: 'Left acute subdural haematoma 14 mm with 7 mm midline shift.' }], pocus: [] },
    critical: [
      { text: 'CT head within 1 hour (anticoagulated)', check: (e) => e.did('inv_ct') },
      { text: 'Reverse the anticoagulant', check: (e) => e.flags.reversed },
      { text: 'Neurosurgical referral', check: (e) => e.flags.neuro },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Bridging vein tear + anticoagulation', kind: 'cause', rx: 'Reverse (PCC / andexanet)' },
      { t: 'Expanding subdural → ICP ↑', rx: 'Neurosurgery' },
      { t: 'Falling GCS, pupil change', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE NG232: anticoagulated patients with any head injury need CT within 8 h; within 1 h if GCS < 15, deterioration or other risk features.',
        'Reverse anticoagulation for intracranial haemorrhage: for apixaban/rivaroxaban give PCC 50 units/kg (andexanet alfa only where locally approved — NICE TA697 covers life-threatening GI bleeding, not ICH); idarucizumab for dabigatran; PCC + IV vitamin K for warfarin.',
        'Early neurosurgical discussion; watch for deterioration and airway compromise.',
      ],
      refs: ['NICE NG232: Head injury (2023)', 'British Society for Haematology: Guideline on the reversal of antithrombotic drugs in major bleeding', 'NICE TA697: Andexanet alfa (2021) — recommended for life-threatening GI bleeding only'],
    },
  });

  // =====================================================================
  // Elderly major trauma on a β-blocker
  // =====================================================================
  add({
    id: 'em-elderly-trauma', title: 'Elderly pedestrian struck by a car', field: 'EM', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 3, setting: 'ed',
    stem: '79-year-old man struck by a car at low speed. Complaining of pelvic and left thigh pain. HR 72, BP 104/66 — “looks stable”. He takes bisoprolol and ramipril.',
    patient: { age: 79, sex: 'M', weight: 72, vol: 0.76, bleed: 0.0008, hrBase: 64, hrGain: 12, baro: 0.6, lactate: 5.6, hb: 104, look: { wound: true, legs: { left: { shortRot: true, bruise: true } } } },
    tick(e, dt) { if (e.flags.ctrl) e.p.bleed = toward(e.p.bleed, 0, 0.05, dt); else if (e.flags.binder) e.p.bleed = Math.max(0.0005, e.p.bleed - 0.00002 * dt); },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'pelvic_binder') { e.flags.binder = true; return { msg: 'Binder applied; the left leg is also splinted in traction.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'theatre') { if (!(e.did('inv_ct') || e.did('inv_pocus'))) return { handled: true, msg: 'Trauma team: where is the bleeding? Image first.' }; e.flags.ctrl = true; return { handled: true, msg: 'IR: embolisation of bleeding pelvic arteries; orthopaedics splint the femur.', kind: 'good' }; }
      if (ev.type === 'inv' && ev.id === 'gas') e.after(6, (en) => en.say(`Lactate ${en.p.lactate.toFixed(1)} — occult shock despite a "normal" HR (β-blocked).`, 'warn'));
      return crystalHarm(e, ev);
    },
    exam: ex({ C: 'Cool peripheries, CRT 4 s. Pelvis tender; left thigh swollen and shortened.', D: 'GCS 15.', E: 'Abrasions.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: {}, cxr: cxrN, ct: [{ label: 'CT trauma (whole body)', media: 'xr_pelvis', report: 'Lateral compression pelvic fracture with arterial blush; left femoral shaft fracture; no head or chest injury.' }], pocus: [{ label: 'eFAST', media: 'us_morison_neg', report: 'No intraperitoneal fluid.' }] },
    critical: [
      { text: 'Recognise shock (lactate / gas)', check: (e) => e.did('inv_gas') },
      { text: 'Pelvic binder', check: (e) => e.flags.binder },
      { text: 'Major haemorrhage protocol and blood', check: (e) => e.did('mhp') && bloodGiven(e) },
      { text: 'TXA', check: (e) => e.did('txa') },
      { text: 'Haemorrhage control (IR)', check: (e) => e.flags.ctrl },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'Pelvic + femoral fractures', kind: 'cause', rx: 'Binder; traction splint' },
      { t: 'Haemorrhage', rx: 'MHP, 1:1 red cells : plasma, TXA' },
      { t: 'β-blocker + age blunt tachycardia — HR is falsely reassuring', rx: 'Use lactate, CRT, shock index' },
      { t: 'Sudden decompensation', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Older trauma patients may not mount a tachycardia (β-blockers, pacemakers, reduced reserve) — a "normal" HR and SBP can hide significant haemorrhage.',
        'TARN/Major Trauma Networks: use lactate/base deficit and lower thresholds for trauma-team activation in older people ("Silver Trauma").',
        'Manage bleeding with blood products, TXA and early haemorrhage control.',
      ],
      refs: [...TRAUMA_REFS, 'Trauma Audit & Research Network (TARN): Major trauma in older people (2017)', 'BOAST: The management of patients with pelvic fractures (BOA, 2018)'],
    },
  });

  // =====================================================================
  // Penetrating chest — massive haemothorax
  // =====================================================================
  add({
    id: 'em-stab-haemothorax', title: 'Stab wound to the left chest (haemothorax)', field: 'EM', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 2, setting: 'ed',
    stem: '24-year-old man stabbed in the left lateral chest. Breathless, pale and sweaty, SpO₂ 90%. Reduced breath sounds and dull percussion on the left.',
    patient: { age: 24, sex: 'M', weight: 75, vol: 0.66, bleed: 0.0009, shunt: 0.28, lactate: 4.2, look: { wound: true } },
    tick(e, dt) { if (e.flags.ctrl) e.p.bleed = toward(e.p.bleed, 0, 0.05, dt); if (e.flags.drain) e.p.shunt = toward(e.p.shunt, 0.06, 0.02, dt); },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'chest_drain') { e.flags.drain = true; return { handled: true, msg: 'Left chest drain: 1,600 mL of blood immediately, still draining briskly — massive haemothorax. Thoracotomy indicated.', kind: 'warn' }; }
      if (ev.type === 'action' && ev.id === 'theatre') { e.flags.ctrl = true; return { handled: true, msg: 'Cardiothoracic surgeon: thoracotomy — bleeding intercostal artery and lung laceration repaired.', kind: 'good' }; }
      if (ev.type === 'action' && (ev.id === 'needle_decompression' || ev.id === 'thoracostomy')) return { msg: 'Blood, not air — this is a haemothorax.', kind: 'warn' };
      return crystalHarm(e, ev);
    },
    exam: ex({ B: 'Left: reduced expansion, dull to percussion, absent breath sounds. Trachea central.', C: 'Cool, pale, CRT 4 s.', D: 'GCS 15, anxious.', E: '2 cm stab wound, left 5th intercostal space, mid-axillary line.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: {}, cxr: { media: 'cxr_ct_effusion', report: 'Large left haemothorax (white-out of the lower two-thirds).' }, ct: [], pocus: [{ label: 'eFAST — left thorax', media: 'us_effusion_sub', report: 'Large anechoic left pleural collection with spine sign.' }, { label: 'Subxiphoid', media: 'us_plax_normal', report: 'No pericardial effusion.' }] },
    critical: [
      { text: 'Oxygen and eFAST', check: (e) => e.did('inv_pocus') },
      { text: 'Large-bore chest drain', check: (e) => e.flags.drain },
      { text: 'MHP and blood products', check: (e) => e.did('mhp') && bloodGiven(e) },
      { text: 'Thoracotomy for massive haemothorax', check: (e) => e.flags.ctrl },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Intercostal / lung vessel laceration', kind: 'cause', rx: 'Thoracotomy' },
      { t: 'Blood in the pleural space → lung collapse → shunt', rx: 'Chest drain' },
      { t: '> 1,500 mL initially or > 200 mL/h → surgical bleeding', rx: 'MHP, blood 1:1' },
      { t: 'Haemorrhagic shock', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Massive haemothorax: > 1,500 mL on drain insertion or ongoing > 200 mL/h — thoracotomy.',
        'Resuscitate with blood products (permissive hypotension in penetrating trauma until haemorrhage control).',
        'eFAST quickly distinguishes haemothorax, pneumothorax and pericardial fluid.',
      ],
      refs: [...TRAUMA_REFS, 'BTS Guideline for pleural disease (2023)'],
    },
  });

  // =====================================================================
  // Penetrating chest — cardiac tamponade
  // =====================================================================
  add({
    id: 'em-stab-tamponade', title: 'Stab wound over the heart', field: 'EM', shock: 'Obstructive (tamponade)', difficulty: 3, setting: 'ed',
    stem: '30-year-old man with a single stab wound just left of the sternum. Agitated, then drowsy. HR 132, BP 78/60, distended neck veins. Chest clear bilaterally.',
    patient: { age: 30, sex: 'M', weight: 78, obstruct: 0.52, vol: 0.9, bleed: 0.0002, lactate: 4.0, look: { wound: true } },
    tick(e, dt) { const p = e.p; if (!e.flags.relieved) p.obstruct = Math.min(0.8, p.obstruct + 0.001 * dt); else p.obstruct = 0; },
    extraActions: [{ id: 'clamshell', name: 'Resuscitative clamshell thoracotomy (ED)' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'clamshell') { if (e.p.map > 40) return { handled: true, msg: 'He still has output — get him to theatre for sternotomy instead.', kind: 'warn' }; e.flags.relieved = true; return { handled: true, msg: 'Clamshell thoracotomy: pericardium opened, clot evacuated, RV laceration controlled with a finger — output returns. To theatre.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'theatre') { e.flags.relieved = true; return { handled: true, msg: 'Cardiothoracic surgeon: median sternotomy — 2 cm RV laceration repaired.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'pericardiocentesis') { e.p.obstruct = Math.max(0.3, e.p.obstruct - 0.15); return { handled: true, msg: 'Only 15 mL aspirated — clotted blood. Pericardiocentesis is a temporising measure at best in trauma; surgery is needed.', kind: 'warn' }; }
      return crystalHarm(e, ev, 1500);
    },
    exam: ex({ B: 'Equal air entry, clear chest.', C: 'Raised JVP, muffled heart sounds, pulsus paradoxus.', D: (e) => (e.p.map < 50 ? 'Drowsy.' : 'Agitated.'), E: '2 cm wound, left 4th intercostal space parasternal.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'Subxiphoid', media: 'us_tamponade', report: 'Pericardial collection with RV diastolic collapse.' }, { label: 'eFAST lungs', media: 'us_sliding', report: 'Bilateral lung sliding.' }] },
    critical: [
      { text: 'eFAST — pericardial fluid', check: (e) => e.did('inv_pocus') },
      { text: 'Surgical decompression (sternotomy / thoracotomy)', check: (e) => e.flags.relieved },
      { text: 'Call for help / MHP', check: (e) => any(e, 'mhp', 'call_help') },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'Penetrating cardiac injury', kind: 'cause', rx: 'Surgery (sternotomy/thoracotomy)' },
      { t: 'Blood fills the rigid pericardium (rapidly clots)', rx: 'Pericardiocentesis rarely works' },
      { t: '↑ Pericardial pressure → ↓ diastolic filling → ↓ SV', rx: 'Modest volume; avoid excess' },
      { t: 'Obstructive shock → PEA arrest', rx: 'Resuscitative thoracotomy', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Penetrating chest trauma with shock and pericardial fluid on eFAST → immediate surgical decompression.',
        'Traumatic cardiac arrest from penetrating trauma: resuscitative thoracotomy (clamshell) within 10 min of losing output; address reversible causes before chest compressions (RCUK traumatic arrest algorithm).',
        'Pericardiocentesis is unreliable in trauma because blood clots.',
      ],
      refs: ['Resuscitation Council UK 2025 Guidelines: Traumatic cardiac arrest/peri-arrest algorithm', ...TRAUMA_REFS],
    },
  });

  // =====================================================================
  // Ruptured ectopic pregnancy
  // =====================================================================
  add({
    id: 'em-ectopic', title: 'Collapse with abdominal pain', field: 'EM', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 2, setting: 'ed',
    stem: '28-year-old woman collapsed at work with sudden lower abdominal pain and right shoulder-tip pain. Last period 7 weeks ago. Pale, sweaty and tachycardic.',
    patient: { age: 28, sex: 'F', weight: 60, vol: 0.64, bleed: 0.001, lactate: 3.8, look: { sweaty: true } },
    tick(e, dt) { if (e.flags.ctrl) e.p.bleed = toward(e.p.bleed, 0, 0.05, dt); },
    extraActions: [{ id: 'hcg', name: 'Urine / serum hCG' }, { id: 'gynae', name: 'Gynaecology — emergency laparoscopy' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'hcg') { e.flags.hcg = true; return { handled: true, msg: 'Urine hCG POSITIVE.', kind: 'warn' }; }
      if (ev.type === 'action' && (ev.id === 'gynae' || ev.id === 'theatre')) { if (!e.flags.hcg) return { handled: true, msg: 'Gynaecology: is she pregnant?' }; e.flags.ctrl = true; return { handled: true, msg: 'Emergency laparoscopy: ruptured right tubal ectopic — salpingectomy. 1.8 L haemoperitoneum.', kind: 'good' }; }
      return crystalHarm(e, ev);
    },
    exam: ex({ C: 'Cool, pale, CRT 4 s.', D: 'GCS 15, faint.', E: 'Distended, tender lower abdomen with guarding. Shoulder-tip pain.' }),
    inv: { bloods: (e) => labs(e, { extra: [['Serum hCG', '3,400 IU/L'], ['Rhesus', 'RhD negative']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'FAST — RUQ', media: 'us_morison_ectopic', report: 'Free fluid in Morison’s pouch.' }, { label: 'FAST — pelvis', media: 'us_pelvis_fluid', report: 'Empty uterus; large volume free fluid in the pouch of Douglas.' }] },
    critical: [
      { text: 'Pregnancy test', check: (e) => e.flags.hcg },
      { text: 'FAST / POCUS', check: (e) => e.did('inv_pocus') },
      { text: 'MHP and blood', check: (e) => e.did('mhp') && bloodGiven(e) },
      { text: 'Emergency surgery', check: (e) => e.flags.ctrl },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'Tubal ectopic pregnancy ruptures', kind: 'cause', rx: 'Laparoscopy / laparotomy' },
      { t: 'Intraperitoneal haemorrhage (diaphragmatic irritation → shoulder-tip pain)', rx: 'Blood products, MHP' },
      { t: 'Haemorrhagic shock', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Any woman of reproductive age with abdominal pain or collapse needs a pregnancy test.',
        'Haemodynamically unstable ectopic: resuscitate with blood and go straight to theatre — do not wait for formal imaging.',
        'Give anti-D immunoglobulin to RhD-negative women having surgical management (NICE NG126).',
      ],
      refs: ['NICE NG126: Ectopic pregnancy and miscarriage (2019, updated 2023)', 'RCOG Green-top Guideline 21: Diagnosis and management of ectopic pregnancy (2016)', 'HSE / RCPI Institute of Obstetricians & Gynaecologists: Ectopic pregnancy guideline (Ireland)'],
    },
  });

  // =====================================================================
  // Non-variceal upper GI bleed
  // =====================================================================
  add({
    id: 'em-ugib-ulcer', title: 'Haematemesis on NSAIDs', field: 'EM', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 2, setting: 'ed',
    stem: '70-year-old man taking ibuprofen for back pain and aspirin. Two large haematemeses and black stools today. Pale and clammy. Glasgow–Blatchford score 14.',
    patient: { age: 70, sex: 'M', weight: 80, vol: 0.67, bleed: 0.0007, hb: 72, lactate: 3.0, look: {} },
    tick(e, dt) { if (e.flags.ctrl) e.p.bleed = toward(e.p.bleed, 0, 0.05, dt); },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'endoscopy') { if (e.p.map < 60) return { handled: true, msg: 'Endoscopist: resuscitate a little more before sedation — MAP too low.' }; e.flags.ctrl = true; return { handled: true, msg: 'Endoscopy: posterior duodenal ulcer with a visible vessel — adrenaline injection + clips; IV PPI after endoscopy.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'txa') return { harm: 'Tranexamic acid in GI bleeding (HALT-IT: no benefit, ↑ VTE)' };
      if (ev.type === 'fluid' && ev.kind === 'rbc' && e.p.hb > 95 && units(e, 'rbc') > 2) return { msg: 'Restrictive transfusion: aim Hb 70–100 g/L unless massive haemorrhage.', kind: 'warn' };
      return crystalHarm(e, ev, 1500);
    },
    exam: ex({ C: 'Cool peripheries.', D: 'GCS 15.', E: 'Epigastric tenderness. Melaena on PR.' }),
    inv: { bloods: (e) => labs(e, { urea: 18.6, extra: [['Group & crossmatch', '4 units']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Flat IVC.' }] },
    critical: [
      { text: 'Blood transfusion', check: (e) => bloodGiven(e) },
      { text: 'Urgent endoscopy after resuscitation', check: (e) => e.flags.ctrl },
      { text: 'No tranexamic acid', check: (e) => !e.did('txa') },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'NSAID + aspirin → peptic ulcer erodes an artery', kind: 'cause', rx: 'Endoscopic therapy' },
      { t: 'Upper GI haemorrhage', rx: 'Red cells (± MHP); restrictive Hb targets' },
      { t: 'Failed endoscopy', rx: 'IR embolisation / surgery' },
      { t: 'Haemorrhagic shock', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE CG141: offer endoscopy immediately after resuscitation if unstable; within 24 h otherwise. Use Glasgow–Blatchford/Rockall scores.',
        'Do not offer PPIs before endoscopy; give them after endoscopic haemostasis. Do not use tranexamic acid (HALT-IT).',
        'Restrictive transfusion strategy (Hb 70–100 g/L) unless massive bleeding.',
      ],
      refs: ['NICE CG141: Acute upper GI bleeding in over 16s (2012, updated 2016)', 'BSG: Acute upper GI bleeding care bundle (2019)', 'HALT-IT trial (Lancet 2020)'],
    },
  });

  // =====================================================================
  // Major burns
  // =====================================================================
  add({
    id: 'em-major-burns', title: 'Major burns from a house fire', field: 'EM', shock: 'Hypovolaemic (burns)', difficulty: 3, setting: 'ed',
    stem: '35-year-old man rescued from a house fire after 15 minutes indoors. Full-thickness burns to the chest, both arms and face (~40% TBSA). Hoarse voice, soot in the mouth, singed nasal hair.',
    patient: { age: 35, sex: 'M', weight: 80, vol: 0.92, leak: 0.0018, shunt: 0.1, lactate: 4.5, stress: 0.5, look: { facialOedema: true } },
    init(e) { e.p.narrow = 0.3; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (!p.ventilated) { p.narrow = Math.min(1, p.narrow + 0.004 * dt); p.effort = clamp(1 - p.narrow * 0.8, 0.1, 1); if (p.narrow > 0.85) p.airwayPatent = false; }
      if (p.ventilated && !f.escharotomy) p.ventObstruct = 0.4; else p.ventObstruct = 0;
      if (e.fluidIn.crystalloid > 2500) p.leak = 0.001;
    },
    extraActions: [{ id: 'burn_escharotomy', name: 'Chest escharotomies' }, { id: 'burn_refer', name: 'Refer to regional burns centre' }, { id: 'burn_cover', name: 'Cling-film dressings, warming, analgesia' }, { id: 'burn_hydroxo', name: 'Hydroxocobalamin 5 g (suspected cyanide)' }],
    onEvent(e, ev) {
      const f = e.flags;
      if (ev.type === 'action' && (ev.id === 'rsi_ketamine' || ev.id === 'rsi_propofol')) { if (e.p.narrow > 0.8) { e.p.airwayPatent = false; return { handled: true, msg: 'Severe glottic oedema — cannot pass the tube. CICO: front-of-neck access!', kind: 'bad' }; } e.after(1, (en) => en.say('Uncut tube secured with ties (face will swell). Ventilation is stiff — circumferential chest burns.', 'warn')); }
      if (ev.type === 'action' && ev.id === 'burn_escharotomy') { if (!e.p.ventilated) return { handled: true, msg: 'Secure the airway first; escharotomy if ventilation is restricted.' }; f.escharotomy = true; return { handled: true, msg: 'Bilateral chest escharotomies — ventilation pressures fall.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'burn_refer') { f.refer = true; return { handled: true, msg: 'Burns centre accept: transfer once stabilised. Fluid plan per the centre (e.g. Parkland 2–4 mL/kg/%TBSA over 24 h).', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'burn_cover') return { handled: true, msg: 'Cling film applied; warmed; IV morphine/ketamine analgesia.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'burn_hydroxo') return { handled: true, msg: 'Hydroxocobalamin given (lactate > 8 with smoke inhalation suggests cyanide).', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'suxamethonium' && e.t > 0) return { msg: 'Suxamethonium is safe in the first 24–48 h after burns (hyperkalaemia risk later).', kind: 'info' };
    },
    exam: ex({ A: (e) => (e.p.ventilated ? 'ETT secured (uncut).' : e.p.narrow > 0.6 ? 'Stridor, hoarse, swollen lips and tongue.' : 'Hoarse voice, soot in the oropharynx.'), B: 'Circumferential full-thickness chest burns.', C: 'Peripheries cool.', D: 'GCS 15.', E: 'Burns ~40% TBSA (face, chest, both arms). COHb 18%.' }),
    inv: { bloods: (e) => labs(e, { extra: [['Carboxyhaemoglobin', '18%'], ['Creatine kinase', '1,900 U/L']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [] },
    critical: [
      { text: 'High-flow oxygen (CO poisoning)', check: (e) => e.p.fio2 >= 0.6 },
      { text: 'Early intubation before airway oedema progresses', check: (e) => e.p.ventilated },
      { text: 'IV fluid resuscitation (Hartmann’s)', check: (e) => e.fluidIn.crystalloid >= 1000 },
      { text: 'Escharotomy for restricted ventilation', check: (e) => e.flags.escharotomy },
      { text: 'Burns centre referral', check: (e) => e.flags.refer },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Thermal + smoke injury', kind: 'cause' },
      { t: 'Upper-airway oedema peaks at 12–36 h', rx: 'Early intubation (uncut tube)' },
      { t: 'CO binds Hb (SpO₂ falsely normal); cyanide blocks mitochondria', rx: '100% O₂; hydroxocobalamin' },
      { t: 'Capillary leak → burns shock', rx: 'Hartmann’s per formula, titrate to urine output' },
      { t: 'Circumferential eschar restricts ventilation', rx: 'Escharotomy', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Signs of inhalational injury (stridor, hoarse voice, soot, facial burns) → early intubation by the most experienced operator with an uncut tube.',
        'Start fluids (Hartmann’s) for burns ≥ 15% TBSA in adults (≥ 10% children) — e.g. Parkland 2–4 mL/kg/%TBSA over 24 h, half in the first 8 h — and titrate to urine output.',
        'Give 100% oxygen for CO; consider hydroxocobalamin for cyanide. Refer early to the regional burns service.',
      ],
      refs: ['National Network for Burn Care (NNBC): National burn care referral guidance (2012)', 'British Burn Association: Pre-hospital/ED burns management', 'NICE CKS: Burns and scalds'],
    },
  });

  // =====================================================================
  // Hydrofluoric acid burn
  // =====================================================================
  add({
    id: 'em-hf-burn', title: 'Chemical burn at work', field: 'EM', shock: null, category: 'Toxicology', difficulty: 3, setting: 'ed',
    stem: '41-year-old glass-etching technician splashed concentrated hydrofluoric acid over both hands and forearms (~5% TBSA) 40 minutes ago. Severe pain out of proportion to the skin findings. Now perioral tingling.',
    patient: { age: 41, sex: 'M', weight: 82, stress: 0.5, k: 5.4, look: {} },
    init(e) { e.p.ica = 0.92; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const absorb = (f.irrigated ? 0.5 : 1) * (f.gel ? 0.4 : 1) * (f.local ? 0.5 : 1);
      p.ica = clamp(p.ica - 0.0009 * absorb * dt + clamp(e.E('calcium') * 0.02, 0, 0.02) * dt, 0.4, 1.3);
      p.k = clamp(p.k + 0.0012 * absorb * dt, 4, 7.5);
      p.ecg = Object.assign({}, p.ecg, { tPeak: p.k > 6 ? 1.8 : 1 });
      if (p.ica < 0.62 && !f.vf) { f.vf = true; p.rhythm = 'vf'; e.say('VF — fluoride-induced hypocalcaemia / hyperkalaemia!', 'bad'); }
      p.stress = f.gel ? 0.15 : 0.5;
    },
    extraActions: [{ id: 'hf_irrigate', name: 'Copious water irrigation (PPE)' }, { id: 'hf_gel', name: 'Calcium gluconate 2.5% gel to burns' }, { id: 'hf_local', name: 'Intra-arterial / Bier block calcium gluconate (specialist)' }, { id: 'hf_tox', name: 'TOXBASE / NPIS' }],
    onEvent(e, ev) {
      const f = e.flags;
      const m = { hf_irrigate: () => { f.irrigated = true; return 'Irrigated with water for 15+ min (staff in PPE).'; }, hf_gel: () => { f.gel = true; return 'Calcium gluconate gel massaged into the burns under gloves — pain improving.'; }, hf_local: () => { f.local = true; return 'Plastic surgeons: intra-arterial calcium gluconate for the digits.'; }, hf_tox: () => { f.tox = true; return 'TOXBASE: systemic toxicity likely (> 1% TBSA concentrated HF or hand burns) — monitor Ca²⁺, Mg²⁺, K⁺ and ECG; give IV calcium.'; } };
      if (ev.type === 'action' && m[ev.id]) return { handled: true, msg: m[ev.id](), kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'calcium') { e.p.ica = Math.min(1.2, e.p.ica + 0.08); return { msg: `IV calcium given — ionised Ca²⁺ now ${e.p.ica.toFixed(2)} mmol/L.`, kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'magnesium') return { msg: 'Magnesium replaced (fluoride also chelates Mg²⁺).', kind: 'good' };
    },
    exam: ex({ C: 'Ectopics on the monitor.', D: 'GCS 15, perioral paraesthesia, positive Chvostek sign.', E: 'Hands and forearms: blanched, grey areas with severe pain.' }),
    inv: { bloods: (e) => labs(e, { k: e.p.k.toFixed(1), ca: (e.p.ica * 2).toFixed(2), extra: [['Ionised calcium', `${e.p.ica.toFixed(2)} mmol/L`], ['Magnesium', '0.55 mmol/L']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [] },
    critical: [
      { text: 'Irrigation (with PPE)', check: (e) => e.flags.irrigated },
      { text: 'Topical calcium gluconate gel', check: (e) => e.flags.gel },
      { text: 'IV calcium for systemic hypocalcaemia', check: (e) => e.did('calcium') },
      { text: 'TOXBASE / NPIS', check: (e) => e.flags.tox },
      { text: 'Ionised Ca²⁺ ≥ 1.0 mmol/L', check: (e) => e.p.ica >= 1.0 },
    ],
    targets: { map: 65, kMax: 6 },
    hint: { steps: [
      { t: 'HF penetrates skin; fluoride ions released', kind: 'cause', rx: 'Irrigate; calcium gel' },
      { t: 'Fluoride binds Ca²⁺ and Mg²⁺ → liquefactive necrosis, severe pain', rx: 'IV/IA calcium' },
      { t: 'Systemic hypocalcaemia, hypomagnesaemia, hyperkalaemia → long QT', rx: 'Monitor and replace' },
      { t: 'VF arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'HF burns are deceptive: modest skin signs but deep tissue injury and systemic fluoride toxicity.',
        'Irrigate (staff in PPE), apply calcium gluconate gel, and treat systemic toxicity with IV calcium and magnesium guided by levels and ECG.',
        'Discuss with TOXBASE/NPIS and plastic surgery; hand burns may need intra-arterial calcium.',
      ],
      refs: ['TOXBASE (UK National Poisons Information Service): Hydrofluoric acid', 'UKHSA: Hydrogen fluoride / hydrofluoric acid — incident management (2024)'],
    },
  });

  // =====================================================================
  // Organophosphate poisoning
  // =====================================================================
  add({
    id: 'em-organophosphate', title: 'Pesticide ingestion', field: 'EM', shock: null, category: 'Toxicology', difficulty: 3, setting: 'ed',
    stem: '45-year-old farm worker found with an empty bottle of organophosphate insecticide. Drooling, vomiting, sweating, pinpoint pupils, wheezy with copious secretions. Bradycardic, hypotensive, SpO₂ in the 80s.',
    patient: { age: 45, sex: 'M', weight: 76, hrBase: 40, hrGain: 15, baro: 0.5, vasoplegia: 0.75, shunt: 0.32, bronchospasm: 0.35, atropineResp: 1, lactate: 3.0, look: { sweaty: true } },
    init(e) { e.p.musc = 1; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const atro = e.total('atropine') / 1000; // mg
      p.musc = clamp(1 - atro / 9, 0, 1);
      p.shunt = 0.05 + 0.3 * p.musc; p.bronchospasm = 0.35 * p.musc; p.hrBase = 40 + 55 * (1 - p.musc); p.vasoplegia = 0.75 + 0.2 * (1 - p.musc);
      if (!p.ventilated) p.effort = f.oxime ? 0.9 : Math.max(0.45, p.effort - 0.0008 * dt);
    },
    extraActions: [{ id: 'op_ppe', name: 'PPE and decontamination (remove clothes)' }, { id: 'op_oxime', name: 'Pralidoxime (per TOXBASE)' }, { id: 'op_tox', name: 'TOXBASE / NPIS' }],
    onEvent(e, ev) {
      const f = e.flags;
      if (ev.type === 'action' && ev.id === 'op_ppe') { f.ppe = true; return { handled: true, msg: 'Staff in gloves/aprons, clothes removed and bagged, skin washed.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'op_oxime') { f.oxime = true; return { handled: true, msg: 'Pralidoxime started — may help nicotinic weakness.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'op_tox') { f.tox = true; return { handled: true, msg: 'TOXBASE: atropine 0.6–2 mg IV, double the dose every 5 min until atropinised (clear chest, HR > 80, SBP > 80, dry axillae).', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'atropine') { const mg = e.total('atropine') / 1000; return { msg: `Total atropine ${mg.toFixed(1)} mg. ${mg >= 8 ? 'Atropinised: chest clearing, HR rising.' : 'Still bronchorrhoea — double the next dose.'}`, kind: mg >= 8 ? 'good' : 'warn' }; }
      if (ev.type === 'drug' && ev.id === 'suxamethonium') return { harm: 'Suxamethonium in organophosphate poisoning (prolonged paralysis — use rocuronium)' };
    },
    exam: ex({ A: 'Copious oral secretions.', B: (e) => (e.p.musc > 0.3 ? 'Widespread wheeze and coarse crackles (bronchorrhoea).' : 'Chest clearing.'), C: 'Bradycardic, sweaty.', D: (e) => `GCS 13. Pupils ${e.p.musc > 0.3 ? '1 mm' : '4 mm'}. Fasciculations.`, E: 'Smells of solvent. Incontinent of urine and faeces.' }),
    inv: { bloods: (e) => labs(e, { extra: [['Red cell cholinesterase', 'Markedly reduced (sent)']] }), gas: true, ecg: { morph: { qtc: 0.49 }, note: 'organophosphate: muscarinic bradycardia and QT prolongation.' }, cxr: { media: 'cxr_ards', report: 'Bilateral perihilar opacities (secretions/aspiration).' }, ct: [], pocus: [] },
    critical: [
      { text: 'PPE and decontamination', check: (e) => e.flags.ppe },
      { text: 'Atropine — doubling doses until atropinised (≥ 8 mg here)', check: (e) => e.total('atropine') >= 8000 },
      { text: 'Oxygen / airway support', check: (e) => e.p.fio2 >= 0.6 },
      { text: 'TOXBASE / NPIS advice', check: (e) => e.flags.tox },
    ],
    targets: { map: 65, spo2: 92, hrMin: 80 },
    hint: { steps: [
      { t: 'Organophosphate inhibits acetylcholinesterase', kind: 'cause' },
      { t: 'Muscarinic excess: bronchorrhoea, bronchospasm, bradycardia (“killer Bs”)', rx: 'Atropine, doubling doses' },
      { t: 'Nicotinic: fasciculations → weakness, respiratory failure', rx: 'Oxime; intubate (rocuronium)' },
      { t: 'Hypoxic cardiac arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Organophosphate toxicity: SLUDGE/BBB muscarinic features plus nicotinic weakness.',
        'Atropine 0.6–2 mg IV, doubling every 5 min until the chest is clear, HR > 80 and SBP > 80; then infusion. Large doses may be needed.',
        'Protect staff (PPE, decontamination). Avoid suxamethonium; consider oximes per TOXBASE.',
      ],
      refs: ['TOXBASE (UK National Poisons Information Service): Organophosphate insecticides', 'RCEM/NPIS: Guideline on antidote availability for emergency departments', 'UKHSA: Organophosphates — incident management'],
    },
  });

  // =====================================================================
  // Adder (Vipera berus) envenomation
  // =====================================================================
  add({
    id: 'em-adder-bite', title: 'Snake bite on a country walk', field: 'EM', shock: 'Distributive (envenomation)', difficulty: 2, setting: 'ed',
    stem: '32-year-old woman bitten on the ankle by a snake (zig-zag markings) while walking in the New Forest 45 minutes ago. Vomiting, abdominal pain, faint, lips swelling. Leg swollen to the knee. BP 76/40.',
    patient: { age: 32, sex: 'F', weight: 60, vasoplegia: 0.5, venodil: 0.18, leak: 0.0007, lactate: 3.2, look: { facialOedema: true, legs: { left: { bite: true, swollen: true } } } },
    tick(e, dt) { const p = e.p; if (e.flags.av) { p.vasoplegia = toward(p.vasoplegia, 0.92, 0.01, dt); p.venodil = toward(p.venodil, 0, 0.01, dt); p.leak = 0.0001; } else p.vasoplegia = Math.max(0.35, p.vasoplegia - 0.0002 * dt); },
    extraActions: [{ id: 'av_vipera', name: 'ViperaTAb antivenom 8 mL IV' }, { id: 'av_tox', name: 'TOXBASE / NPIS' }, { id: 'av_immob', name: 'Immobilise and elevate limb; mark swelling' }],
    onEvent(e, ev) {
      const f = e.flags;
      if (ev.type === 'action' && ev.id === 'av_vipera') { f.av = true; return { handled: true, msg: 'ViperaTAb given (indications: hypotension, spreading swelling, systemic features). BP recovering.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'av_tox') { f.tox = true; return { handled: true, msg: 'NPIS: systemic envenoming with hypotension — give ViperaTAb; treat anaphylactoid features with adrenaline.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'av_immob') return { handled: true, msg: 'Limb immobilised and elevated; swelling margin marked hourly. No tourniquet.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'source_control') return { handled: true, harm: 'Incision/suction of the bite wound' };
    },
    exam: ex({ C: 'Warm, vasodilated.', D: 'GCS 15.', E: 'Two puncture marks at the ankle; swelling and bruising to the knee; tender groin nodes.' }),
    inv: { bloods: (e) => labs(e, { wcc: 18, extra: [['20-min whole-blood clotting test', 'Normal'], ['CK', '640 U/L']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Collapsing IVC.' }] },
    critical: [
      { text: 'Fluid resuscitation', check: (e) => e.fluidIn.crystalloid >= 1000 },
      { text: 'Antivenom (ViperaTAb)', check: (e) => e.flags.av },
      { text: 'TOXBASE / NPIS', check: (e) => e.flags.tox },
      { text: 'IM adrenaline if angioedema/anaphylactoid features', check: (e) => any(e, 'adrenaline_im', 'adrenaline') },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'Adder venom (Vipera berus)', kind: 'cause', rx: 'ViperaTAb antivenom' },
      { t: 'Vasoactive mediators + anaphylactoid release → vasodilation', rx: 'Adrenaline IM; fluids' },
      { t: 'Local tissue toxins → swelling, fluid shift', rx: 'Immobilise, elevate' },
      { t: 'Shock, coagulopathy (rare in UK)', kind: 'end' },
    ] },
    debrief: {
      points: [
        'The adder is the UK’s only native venomous snake. Most bites cause local symptoms only.',
        'Antivenom (ViperaTAb) for hypotension, spreading swelling beyond the wrist/ankle within 4 h, ECG changes, leucocytosis, metabolic acidosis or bleeding — discuss with NPIS.',
        'Treat anaphylactoid features with IM adrenaline; immobilise the limb; avoid incision, suction or tourniquets.',
      ],
      refs: ['TOXBASE (UK National Poisons Information Service): Adder (Vipera berus) envenomation', 'RCEM/NPIS: Guideline on antidote availability (ViperaTAb)'],
    },
  });
})();
