/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Scenario library — part 7: Resuscitation Council UK 2025 Guidelines.
 * Fills the gaps so that every RCUK 2025 one-page algorithm has at least one scenario that practises it:
 * traumatic cardiac arrest, cath-lab arrest, adult & paediatric choking, community BLS + AED, the stable arms of the
 * adult tachyarrhythmia algorithm (regular narrow, irregular narrow, pre-excited AF), paediatric in-hospital BLS,
 * paediatric bradycardia, shockable paediatric arrest, paediatric VT with a pulse, out-of-hospital NLS and ARNI.
 * Content written for CrashCall from the RCUK 2025 algorithms (resus.org.uk). */
(function () {
  const S = window.Sim;
  const clamp = S.clamp;
  const { add, any, toward, labs } = S.scnUtil;
  const R = 'Resuscitation Council UK 2025 Guidelines: ';
  const bp = (e) => `${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}`;
  const cxrN = { media: 'cxr_normal', report: 'No acute abnormality.' };
  const noKit = (note, actions) => ({ drugs: false, fluids: false, inv: false, actions: actions || ['cpr'], note });

  // Age-appropriate physiology (same model as the paediatric library).
  function paed(weight, age, extra) {
    const hr0 = age < 0.1 ? 140 : age < 1 ? 135 : age < 2 ? 125 : age < 5 ? 110 : age < 12 ? 95 : 82;
    const mapN = age < 0.1 ? 45 : age < 1 ? 52 : age < 2 ? 56 : age < 5 ? 60 : age < 12 ? 68 : 76;
    const svScale = weight / 70 * (72 / hr0) * 1.25;
    const coRef = (hr0 * 78 * svScale) / 1000;
    const svrScale = ((mapN - 2.5) * 80) / (coRef * 1100);
    return Object.assign({ paed: true, weight, age, svScale, svrScale, coRef, mapNormal: mapN, mapArrest: Math.round(mapN * 0.45), hrBase: hr0 - 12, hrGain: Math.round(hr0 * 0.5), hrAlarm: [Math.round(hr0 * 0.6), Math.round(hr0 * 1.45)], rrBase: age < 1 ? 40 : age < 5 ? 30 : age < 12 ? 22 : 16 }, extra || {});
  }
  const pLabs = (e, o) => labs(e, Object.assign({ cr: 30, egfr: '—' }, o));
  const perKg = (e, dose) => dose / e.p.weight;
  const pcirc = (e) => `HR ${e.p.hr}, BP ${bp(e)}, CRT ${e.p.map < e.p.mapNormal * 0.8 ? '4–5' : '2'} s.`;

  // =====================================================================
  // R1. Adult traumatic cardiac arrest (HOTT)
  // =====================================================================
  add({
    id: 'em-tca', title: 'Traumatic cardiac arrest', field: 'EM', shock: 'Obstructive + hypovolaemic (arrest)', difficulty: 3, setting: 'ed', als: true, arrestLimit: 360,
    eblExpected: 'Femoral arterial bleeding can exsanguinate in minutes; with pelvic injury, total loss in traumatic arrest often exceeds 40% of blood volume.',
    bloodLoss: 'visible', bloodLossNote: 'external haemorrhage — pelvic bleeding is concealed',
    stem: 'Pre-alert: 26-year-old motorcyclist versus car at 50 mph. Lost output in the ambulance 4 minutes ago — CPR in progress. On arrival: PEA ~130/min, arterial bleeding from an open left thigh wound, absent breath sounds on the right, unstable pelvis.',
    patient: { age: 26, sex: 'M', weight: 80, rhythm: 'pea', peaRate: 130, vol: 0.42, obstruct: 0.5, bleed: 0.0012, hb: 78, coag: 0.5, effort: 0, gcs: 3, lactate: 9, temp: 35.4, look: { collar: true, legs: { left: { wound: true, tourniquetIf: 'tca_haem' } } } },
    arrestRhythm: () => 'pea',
    roscRhythm: 'sinus',
    extraActions: [
      { id: 'tca_haem', name: 'Control catastrophic external haemorrhage (tourniquet / packing)' },
      { id: 'tca_airway', name: 'Secure airway (tracheal tube, no induction drugs) + 100% O₂' },
      { id: 'tca_thoracostomy', name: 'Bilateral finger thoracostomies' },
      { id: 'tca_thoracotomy', name: 'Resuscitative thoracotomy' },
      { id: 'tca_aortic', name: 'Proximal vascular control (manual aortic compression)' },
    ],
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (p.arrested && !f.cprInit) { f.cprInit = true; e.flags.cpr = true; e.mark('cpr_on'); e.say('Paramedics continue compressions as you take over.', 'info'); }
      if (f.haem) p.bleed = f.theatre ? 0 : Math.min(p.bleed, e.did('pelvic_binder') ? 0.00008 : 0.00025);
      if (f.decomp) p.obstruct = toward(p.obstruct, 0.04, 0.2, dt);
    },
    rosc(e) {
      const f = e.flags;
      const blood = e.fluidIn.rbc + e.fluidIn.ffp;
      if (f.haem && f.decomp && f.airway && blood >= 1100) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 6) { e.p.vol = Math.max(e.p.vol, 0.72); e.p.contract = 0.85; return true; } }
      return false;
    },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action') {
        if (ev.id === 'tca_haem') { f.haem = true; return { handled: true, msg: 'Tourniquet applied high on the left thigh and tightened until bleeding stops; time noted.', kind: 'good' }; }
        if (ev.id === 'tca_airway' || ev.id === 'rsi_ketamine' || ev.id === 'rsi_propofol') { f.airway = true; p.ventilated = true; p.effort = 0; p.fio2 = 1; p.lastFio2 = 1; e.flags.airway = 'ett'; return { handled: true, msg: 'Tracheal tube passed without drugs (no muscle tone), capnography trace with compressions, 100% O₂. Ventilate gently — avoid high intrathoracic pressure.', kind: 'good' }; }
        if (ev.id === 'tca_thoracostomy') { f.decomp = true; return { handled: true, msg: 'Bilateral finger thoracostomies: rush of air on the RIGHT (tension pneumothorax decompressed); left — lung up, small haemothorax.', kind: 'good' }; }
        if (ev.id === 'thoracostomy' || ev.id === 'needle_decompression') { if (!f.side) { f.side = true; return { handled: true, msg: 'Right side decompressed — rush of air. In traumatic cardiac arrest decompress BOTH sides (bilateral thoracostomies).', kind: 'warn' }; } f.decomp = true; return { handled: true, msg: 'Left side now decompressed too.', kind: 'good' }; }
        if (ev.id === 'tca_thoracotomy') return { handled: true, msg: 'Blunt trauma with an obstructive cause just treated: resuscitative thoracotomy is for penetrating chest trauma with suspected tamponade (ideally within 15 min of arrest) — not indicated here.', kind: 'warn' };
        if (ev.id === 'tca_aortic') { f.aortic = true; return { handled: true, msg: 'Manual aortic compression applied below the diaphragm (temporising, by a second operator).', kind: 'info' }; }
        if (ev.id === 'pelvic_binder') { p.look.binder = true; return { handled: true, msg: 'Pelvic binder applied at the greater trochanters.', kind: 'good' }; }
        if (ev.id === 'mhp') { f.mhp = true; return { handled: true, msg: 'Major haemorrhage protocol activated — 4 units red cells + 4 FFP in the room. Give blood via a rapid infuser/warmer.', kind: 'good' }; }
        if (ev.id === 'theatre') { if (p.arrested) return { handled: true, msg: 'Theatre/IR alerted for damage-control surgery once there is ROSC.', kind: 'info' }; f.theatre = true; return { handled: true, msg: 'Damage-control resuscitation & surgery: femoral artery repair, pelvic packing / IR embolisation.', kind: 'good' }; }
        if (ev.id === 'pericardiocentesis') return { handled: true, msg: 'No pericardial fluid on ultrasound — not indicated.', kind: 'warn' };
        if (ev.id === 'defib' && p.arrested) return { handled: true, harm: 'Defibrillation of a non-shockable rhythm' };
      }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && p.arrested) return { msg: 'Adrenaline has a limited role in traumatic cardiac arrest — it does not treat the cause. Prioritise HOTT: hypovolaemia, oxygenation, tension, tamponade.', kind: 'warn', noHarm: true };
      if (ev.type === 'drug' && ev.id === 'txa') return { msg: 'TXA 1 g given (CRASH-2).', kind: 'good' };
      if (ev.type === 'fluid' && ev.kind === 'crystalloid' && e.fluidIn.crystalloid > 1000) return { harm: 'Large-volume crystalloid in traumatic haemorrhage (use blood products)' };
    },
    exam: (e) => ({
      A: e.flags.airway ? 'Tracheal tube in situ, capnography trace present.' : 'Unprotected airway, blood in the oropharynx. C-collar on.',
      B: e.flags.decomp ? `Bilateral thoracostomies. Air entry both sides. ${e.p.ventilated ? 'Ventilated.' : ''}` : 'Absent breath sounds RIGHT, hyper-resonant; trachea deviated to the left; distended neck veins.',
      C: e.p.arrested ? `No central pulse. ${e.flags.haem ? 'Tourniquet on left thigh — bleeding controlled.' : 'Pulsatile bleeding from an open left thigh wound.'} Pelvis unstable${e.did('pelvic_binder') ? ' (binder on)' : ''}.` : `HR ${e.p.hr}, BP ${bp(e)}. Pelvis ${e.did('pelvic_binder') ? 'in binder' : 'unstable'}.`,
      D: 'GCS 3. Pupils 4 mm, sluggish.', E: `T ${e.p.temp.toFixed(1)} °C. Open femoral fracture left thigh.`,
    }),
    inv: { bloods: (e) => labs(e, { extra: [['Group & crossmatch', 'Sent — O-neg in use']] }), gas: true, ecg: {}, cxr: { media: 'cxr_tension', report: 'Not appropriate during arrest — this is a clinical diagnosis.' }, ct: [],
      pocus: [{ label: 'eFAST (during compressions)', media: 'us_ivc_flat', report: 'Right: no lung sliding. Left: small haemothorax. No pericardial effusion. Flat IVC. Weak cardiac activity.' }] },
    critical: [
      { text: 'Control catastrophic haemorrhage', check: (e) => e.flags.haem },
      { text: 'Airway & oxygenation', check: (e) => e.flags.airway },
      { text: 'Bilateral chest decompression', check: (e) => e.flags.decomp },
      { text: 'Pelvic splint', check: (e) => e.did('pelvic_binder') },
      { text: 'Blood products / major haemorrhage protocol', check: (e) => e.flags.mhp && e.fluidIn.rbc > 0 },
      { text: 'Damage-control surgery after ROSC', check: (e) => e.flags.theatre },
    ],
    targets: { map: 60, spo2: 94 },
    hint: { steps: [
      { t: 'High-energy blunt trauma', kind: 'cause' },
      { t: 'Hypovolaemia (femoral artery + pelvis) and tension pneumothorax', rx: 'Tourniquet, pelvic binder, blood; bilateral thoracostomies' },
      { t: 'Obstructed venous return + empty heart → PEA', rx: 'Treat reversible causes FIRST, simultaneously' },
      { t: 'Compressions cannot fill an empty or obstructed heart', rx: 'Continue CPR only if it does not delay HOTT' },
      { t: 'Death', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 traumatic cardiac arrest/peri-arrest: treat reversible causes before (or simultaneously with) chest compressions, by clinical priority rather than in a fixed order.',
      'Interventions: control external catastrophic haemorrhage; secure the airway and maximise oxygenation; bilateral chest decompression (thoracostomies); relieve tamponade (penetrating injury); proximal vascular control; pelvic splint; blood products / major haemorrhage protocol.',
      'In hospital: damage-control surgery/resuscitation and, where indicated, resuscitative thoracotomy (penetrating chest trauma). Pre-hospital: minimise scene time and transport immediately.',
      'Adrenaline and defibrillation have a limited role; if traumatic cause is unlikely (e.g. a medical collapse causing the crash), follow standard ALS.',
    ], refs: [R + 'Traumatic cardiac arrest/peri-arrest algorithm', 'NICE NG39: Major trauma — assessment and initial management (2016)', 'JRCALC Clinical Guidelines: traumatic cardiac arrest'] },
  });

  // =====================================================================
  // R2. Cardiac arrest in the cardiac catheter laboratory
  // =====================================================================
  add({
    id: 'em-cathlab-vf', title: 'VF arrest during primary PCI', field: 'EM', shock: 'Cardiogenic (arrest)', difficulty: 3, setting: 'cathlab', als: true, arrestLimit: 480,
    stem: 'Cardiac catheter laboratory: 61-year-old man undergoing primary PCI for an inferior STEMI. Defibrillator pads are on. As the wire crosses the occluded right coronary artery the monitor alarms.',
    patient: { age: 61, sex: 'M', weight: 86, hrBase: 58, contract: 0.7, artLine: true, fio2: 0.28, ecg: { st: 0.3 }, look: { sweaty: true } },
    extraActions: [
      { id: 'cl_mcpr', name: 'Mechanical chest compression device' },
      { id: 'cl_ecpr', name: 'Call for ECPR (VA-ECMO) team' },
      { id: 'cl_complete', name: 'Ask the operator to complete the PCI (stent RCA)' },
    ],
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (!f.vf && e.t > 4) { f.vf = true; f.vfAt = e.t; p.rhythm = 'vf'; }
      if (f.rosc && !f.tampAt && e.t - f.roscT > 25) { f.tampAt = e.t; e.say('BP falling again; the operator reports contrast extravasation from the RCA — coronary perforation?', 'bad'); }
      if (f.tampAt && !f.drained) { p.obstruct = toward(p.obstruct, 0.5, 0.02, dt); p.pulsus = toward(p.pulsus || 0, 0.35, 0.03, dt); }
      if (f.drained) { p.obstruct = toward(p.obstruct, 0.03, 0.2, dt); p.pulsus = toward(p.pulsus || 0, 0, 0.2, dt); }
      if (f.pci) { p.contract = toward(p.contract, 0.9, 0.01, dt); p.ecg.st = toward(p.ecg.st, 0.05, 0.01, dt); }
    },
    rosc(e) {
      const f = e.flags, n = e.shocks || 0;
      if (f.rosc) { if (f.drained && e.flags.cpr && e.did('adrenaline')) { f.rw2 = (f.rw2 || 0) + 0.1; return f.rw2 > 5; } return false; }
      if (f.stacked && n >= 3) { f.rosc = true; f.roscT = e.t; return true; }
      if (n >= 4 && e.did('adrenaline') && e.did('amiodarone') && e.flags.cpr) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 4) { f.rosc = true; f.roscT = e.t; return true; } }
      return false;
    },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action' && ev.id === 'defib' && e.shockable()) {
        f.shockT = f.shockT || []; f.shockT.push(e.t);
        const n = f.shockT.length;
        if (n === 3 && f.shockT[2] - f.vfAt < 50 && !f.cprBetween) { f.stacked = true; return { msg: 'Third stacked shock delivered — organised rhythm on the monitor with an arterial trace.', kind: 'good' }; }
        if (n < 3 && f.shockT[n - 1] - f.vfAt < 50) return { msg: `Shock ${n} — still VF. Monitored, witnessed VF with pads on: give up to 3 rapid successive (stacked) shocks before starting compressions.`, kind: 'info' };
      }
      if (ev.type === 'action' && ev.id === 'cpr' && p.arrested && (e.shocks || 0) > 0 && (e.shocks || 0) < 3) f.cprBetween = true;
      if (ev.type === 'action' && ev.id === 'cl_mcpr') { f.mcpr = true; return { handled: true, msg: 'Mechanical CPR device fitted — allows continued PCI under fluoroscopy and protects staff from radiation.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'cl_ecpr') { f.ecpr = true; return { handled: true, msg: p.arrested ? 'ECPR team activated — consider VA-ECMO for refractory arrest to allow the culprit lesion to be treated.' : 'ECPR team stood down — there is ROSC.', kind: 'info' }; }
      if (ev.type === 'action' && (ev.id === 'cl_complete' || ev.id === 'cath_lab')) { if (p.arrested) return { handled: true, msg: 'Complete the PCI once there is ROSC, or during mechanical CPR/ECPR.', kind: 'warn' }; if (f.tampAt && !f.drained) return { handled: true, msg: 'Treat the tamponade first — the patient is peri-arrest.', kind: 'warn' }; f.pci = true; return { handled: true, msg: 'Covered stent deployed across the perforation and the RCA re-opened — TIMI 3 flow.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'pericardiocentesis') { if (!f.tampAt) return; f.drained = true; return { handled: true, msg: 'Echo-guided pericardiocentesis: 180 mL blood aspirated, pigtail drain left in. BP recovering.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && p.arrested && (e.shocks || 0) < 3) return { msg: 'In VF give adrenaline after the 3rd shock.', kind: 'warn', noHarm: true };
    },
    exam: (e) => ({
      A: 'Patent, oxygen via nasal cannulae.', B: `RR ${e.p.rr}, SpO₂ ${e.p.arrested ? '—' : e.p.spo2 + '%'}.`,
      C: e.p.arrested ? 'No pulse; flat arterial trace.' : `HR ${e.p.hr}, ABP ${bp(e)}. ${e.flags.tampAt && !e.flags.drained ? 'Raised JVP, quiet heart sounds, pulsus paradoxus on the art line.' : ''}`,
      D: e.p.arrested ? 'Unresponsive.' : 'Drowsy but rousable.', E: 'Right radial sheath in situ.',
    }),
    inv: { bloods: (e) => labs(e, { trop: 3800, k: 4.2 }), gas: true, ecg: (e) => (e.p.arrested ? {} : { note: e.flags.pci ? 'resolving inferior ST elevation after PCI.' : 'inferior STEMI (RCA).', st: e.flags.pci ? {} : { II: 0.25, III: 0.35, aVF: 0.3, I: -0.1, aVL: -0.18 } }), cxr: cxrN, ct: [],
      pocus: [{ label: 'Subcostal echo', media: null, report: (e) => (e.flags.tampAt && !e.flags.drained ? 'New circumferential pericardial effusion with RV diastolic collapse — tamponade.' : 'No pericardial effusion. Inferior hypokinesia.') }] },
    critical: [
      { text: 'Up to 3 stacked shocks for monitored, witnessed VF', check: (e) => e.flags.stacked },
      { text: 'Echo for a suspected complication', check: (e) => e.did('inv_pocus') && !!e.flags.tampAt },
      { text: 'Relieve tamponade (pericardiocentesis)', check: (e) => e.flags.drained },
      { text: 'Complete the PCI', check: (e) => e.flags.pci },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Reperfusion / wire manipulation in an ischaemic myocardium', kind: 'cause' },
      { t: 'VF — monitored and witnessed, pads already on', rx: 'Up to 3 stacked shocks, then standard ALS' },
      { t: 'Procedural complications: perforation → tamponade, dissection, air embolism', rx: 'Echo early; pericardiocentesis' },
      { t: 'Refractory arrest', rx: 'Mechanical CPR, ECPR to allow the culprit lesion to be treated', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 special circumstances — cardiac catheter laboratory: for an initial shockable rhythm give 3 consecutive (stacked) shocks before starting chest compressions.',
      'Consider mechanical CPR if manual compressions are not feasible or are unsafe for staff (fluoroscopy), and ECPR in selected refractory arrests to allow critical procedures to correct the cause.',
      'Consider echocardiography for haemodynamic instability or suspected complications (perforation with tamponade, dissection, acute vessel closure); consider pacing for extreme bradycardia.',
      'Plan for arrests in the lab: safety checklists, functional emergency equipment, and regular team drills.',
    ], refs: [R + 'Special circumstances — cardiac arrest in the cardiac catheterisation laboratory', R + 'Adult advanced life support', 'British Cardiovascular Intervention Society (BCIS): Cardiac arrest in the cath lab'] },
  });

  // =====================================================================
  // R3. Adult choking (in hospital)
  // =====================================================================
  const chokeAdult = (e) => { const f = e.flags; return (f.bb || 0) >= 1 && (f.at || 0) >= 2; };
  add({
    id: 'em-choking-adult', title: 'Choking on the ward', field: 'EM', shock: null, category: 'Airway', difficulty: 2, setting: 'ward', als: true, arrestLimit: 420, satArrest: 0.55,
    stem: 'Stroke rehabilitation ward: a 72-year-old woman eating lunch suddenly clutches her throat. She cannot speak, her cough is silent, and she is becoming distressed. A healthcare assistant shouts for you.',
    patient: { age: 72, sex: 'F', weight: 64, airwayPatent: false, effort: 1, hrBase: 98, stress: 0.5, gcs: 15, look: { sweaty: true } },
    arrestRhythm: () => 'pea',
    extraActions: [
      { id: 'ch_cough', name: 'Encourage to cough' },
      { id: 'ch_backblows', name: '5 back blows (leaning forward)' },
      { id: 'ch_abdo', name: '5 abdominal thrusts' },
      { id: 'ch_sweep', name: 'Blind finger sweep' },
      { id: 'ch_magill', name: 'Laryngoscopy + Magill forceps (unconscious)' },
      { id: 'ch_review', name: 'Medical review after thrusts (check for injury, CXR)' },
    ],
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (!f.clear && !p.arrested && p.sa < 0.72 && !f.unconscious) { f.unconscious = true; p.gcs = 4; e.say('She has become unresponsive and slumps to the floor.', 'bad'); }
      if (f.clear) { p.airwayPatent = true; p.stress = toward(p.stress, 0.1, 0.05, dt); }
    },
    rosc(e) { const f = e.flags; if (f.clear && e.flags.cpr && e.p.assisted) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 6) { e.p.effort = 0.6; e.p.gcs = 8; return true; } } return false; },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type !== 'action') return;
      const conscious = !f.unconscious && !p.arrested;
      if (ev.id === 'ch_cough') return { handled: true, msg: conscious ? 'Cough is silent and ineffective — this is SEVERE airway obstruction. Give back blows.' : 'She is unconscious.', kind: 'warn' };
      if (ev.id === 'ch_backblows') { if (!conscious) return { handled: true, msg: 'Unconscious — back blows are for a conscious patient. Start CPR.', kind: 'warn' }; f.bb = (f.bb || 0) + 1; if (chokeAdult(e)) { f.clear = true; return { handled: true, msg: 'A piece of meat is expelled! She coughs and takes a big breath.', kind: 'good' }; } return { handled: true, msg: '5 firm back blows between the shoulder blades — obstruction not relieved.', kind: 'info' }; }
      if (ev.id === 'ch_abdo') { if (!conscious) return { handled: true, msg: 'Unconscious — start CPR instead of abdominal thrusts.', kind: 'warn' }; if (!f.bb) return { handled: true, msg: 'Start with 5 back blows, then 5 abdominal thrusts.', kind: 'warn' }; f.at = (f.at || 0) + 1; if (chokeAdult(e)) { f.clear = true; return { handled: true, msg: 'With the 5th thrust a piece of meat flies out! She coughs and breathes.', kind: 'good' }; } return { handled: true, msg: '5 abdominal thrusts — still obstructed. Alternate 5 back blows and 5 abdominal thrusts.', kind: 'info' }; }
      if (ev.id === 'ch_sweep') return { handled: true, harm: 'Blind finger sweep (can push the object further down)' };
      if (ev.id === 'ch_magill') { if (conscious) return { handled: true, msg: 'Not in a conscious patient — continue back blows and abdominal thrusts.', kind: 'warn' }; f.clear = true; p.airwayPatent = true; return { handled: true, msg: 'Laryngoscopy: bolus of meat at the laryngeal inlet removed with Magill forceps.', kind: 'good' }; }
      if (ev.id === 'ch_review') { f.review = true; return { handled: true, msg: 'Doctor reviews: no abdominal injury. Speech & language therapy swallow assessment and modified diet requested.', kind: 'good' }; }
      if (ev.id === 'cpr' && f.unconscious && !p.arrested && !f.clear) { f.cprUncon = true; e.flags.cpr = true; e.mark('cpr_on'); return { handled: true, msg: 'Unconscious choking: CPR 30:2 started — compressions may dislodge the obstruction. Look in the mouth before breaths.', kind: 'good' }; }
      if ((ev.id === 'bvm' || ev.id === 'sga') && !f.clear) return { handled: true, msg: 'No chest rise — the airway is still obstructed.', kind: 'bad' };
    },
    exam: (e) => {
      const f = e.flags, p = e.p;
      if (f.clear) return { A: 'Clear — coughing.', B: `RR ${p.rr}, SpO₂ ${p.spo2}%. Air entry both sides.`, C: `HR ${p.hr}, BP ${bp(e)}.`, D: p.arrested ? 'Unresponsive.' : `GCS ${p.gcs}.`, E: 'Food bolus retrieved.' };
      return { A: 'Silent cough, unable to speak, hand at throat — complete obstruction.', B: `Desperate effort but no air movement. SpO₂ ${p.spo2}%.`, C: p.arrested ? 'No central pulse.' : `HR ${p.hr}, BP ${bp(e)}.`, D: f.unconscious ? 'Unresponsive.' : 'Terrified, alert.', E: 'Plate of food on the table.' };
    },
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'No pneumothorax, no free air.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Recognise severe obstruction and call for help', check: (e) => e.did('call_help') },
      { text: '5 back blows, then 5 abdominal thrusts (repeat)', check: (e) => (e.flags.bb || 0) >= 1 && (e.flags.at || 0) >= 1 || e.flags.cprUncon },
      { text: 'Obstruction relieved', check: (e) => e.flags.clear },
      { text: 'Medical review after abdominal thrusts', check: (e) => e.flags.review },
    ],
    targets: { spo2: 94 },
    hint: { steps: [
      { t: 'Food bolus impacted at the larynx (dysphagia after stroke)', kind: 'cause' },
      { t: 'Ineffective cough = severe obstruction', rx: '5 back blows, then 5 abdominal thrusts' },
      { t: 'No ventilation → hypoxaemia → loss of consciousness', rx: 'Unconscious: CPR 30:2; laryngoscopy + Magill forceps if skilled' },
      { t: 'Hypoxic cardiac arrest', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 adult choking: mild obstruction — encourage coughing and monitor. Severe obstruction (ineffective cough) — call for help (speaker phone if alone).',
      'Conscious: 5 back blows, then 5 abdominal thrusts; keep alternating and keep checking until the obstruction is relieved.',
      'Unconscious: start CPR and follow adult BLS/ALS; skilled providers can remove the object under direct laryngoscopy with Magill forceps. Never do blind finger sweeps.',
      'Anyone who has had abdominal thrusts (or a persisting cough/difficulty swallowing) needs medical assessment for injury and retained material.',
    ], refs: [R + 'Adult choking algorithm', R + 'Adult basic life support', 'RCSLT / NICE CG162: dysphagia after stroke'] },
  });

  // =====================================================================
  // R4. Community adult BLS + AED
  // =====================================================================
  add({
    id: 'em-community-bls', title: 'Collapse in a supermarket (BLS + AED)', field: 'EM', shock: 'Cardiogenic (arrest)', difficulty: 1, setting: 'community', als: true, arrestLimit: 480, noCprLimit: 60, satArrest: 0.4, arrestMsg: 'He is unresponsive and not breathing normally. Get help: call 999 and start CPR.',
    stem: 'You are off duty, queueing at a supermarket checkout, when the man in front of you (about 55) collapses to the floor. Other shoppers are staring. There is no hospital equipment — only you, your phone, and the people around you.',
    patient: { age: 55, sex: 'M', weight: 90, rhythm: 'vf', noMonitor: true, effort: 0, gcs: 3, look: { gown: false } },
    kit: noKit('Off duty in a supermarket — no drugs, fluids or investigations. Use the scenario actions and CPR.', ['cpr', 'airway_manoeuvre']),
    extraActions: [
      { id: 'cb_safe', name: 'Check for danger; shake and shout' },
      { id: 'cb_breath', name: 'Open airway; look/listen/feel for breathing (≤ 10 s)' },
      { id: 'cb_999', name: 'Call 999 (phone on speaker)' },
      { id: 'cb_aed', name: 'Send a bystander for the store’s AED' },
      { id: 'cb_aed_on', name: 'Switch on AED and attach pads' },
      { id: 'cb_shock', name: 'Press the AED shock button (everyone clear)' },
      { id: 'cb_recovery', name: 'Recovery position and keep monitoring breathing' },
    ],
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.aedSent && !f.aedHere && e.t - f.aedSent > 40) { f.aedHere = true; e.say('A shop assistant arrives with the AED.', 'info'); }
      if (f.called && !f.amb && e.t - f.called > 170) { f.amb = true; p.noMonitor = false; e.say('Paramedics arrive and take over: monitor attached.', 'good'); }
      if (f.aedOn && p.arrested && !f.advise) { f.advise = true; e.say(p.rhythm === 'vf' ? 'AED: "Analysing… shock advised. Stand clear. Press the orange button."' : 'AED: "No shock advised. Continue CPR."', p.rhythm === 'vf' ? 'warn' : 'info'); }
    },
    rosc(e) { const f = e.flags; if (f.shocked && e.flags.cpr && f.cprResumed && e.t - f.shockT > 12) { e.p.effort = 1; e.p.shunt = 0.04; e.p.gcs = 6; return true; } return false; },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type !== 'action') return;
      const m = {
        cb_safe: () => { f.safe = true; return ['Area safe. "Are you all right?" — no response.', 'info']; },
        cb_breath: () => { f.breath = true; return ['Head tilt, chin lift: occasional slow gasps only — agonal breathing. This is cardiac arrest.', 'warn']; },
        cb_999: () => { f.called = e.t; return ['999 on speaker: "Ambulance — man collapsed, not breathing." The call handler confirms CPR and asks if there is an AED nearby.', 'good']; },
        cb_aed: () => { f.aedSent = e.t; return ['You send a shop assistant to fetch the AED from customer services.', 'good']; },
        cb_aed_on: () => { if (!f.aedHere) return ['The AED has not arrived yet — keep doing CPR.', 'warn']; f.aedOn = true; return ['AED on, pads placed (right of sternum below the clavicle; left mid-axillary line). Keep compressing while pads go on.', 'good']; },
        cb_shock: () => { if (!f.aedOn) return ['No AED attached.', 'warn']; f.cprResumed = false; if (!p.arrested || p.rhythm !== 'vf') { e.harm('Pressing shock when the AED did not advise a shock'); return ['The AED does not advise a shock.', 'bad']; } f.shocked = true; f.shockT = e.t; e.shocks = (e.shocks || 0) + 1; e.flags.cpr = false; return ['Shock delivered. AED: "Start CPR now."', 'good']; },
        cb_recovery: () => { if (p.arrested) return ['He is still in cardiac arrest — continue CPR.', 'bad']; f.recov = true; return ['Breathing normally — placed in the recovery position, breathing checked continuously, AED left attached.', 'good']; },
      };
      if (m[ev.id]) { const [t, k] = m[ev.id](); return { handled: true, msg: t, kind: k }; }
      if (ev.id === 'cpr' && f.shocked && !e.flags.cpr && e.t - f.shockT < 10) f.cprResumed = true;
      else if (ev.id === 'cpr' && f.shocked && !e.flags.cpr) e.say('Restart compressions immediately after the shock — every second without CPR matters.', 'warn');
    },
    exam: (e) => {
      const p = e.p;
      if (p.arrested) return { A: 'Head tilt / chin lift — no obstruction.', B: 'Occasional agonal gasps; not breathing normally.', C: 'No signs of life. (Lay rescuers do not check for a pulse.)', D: 'Unresponsive to voice and shaking.', E: 'Supermarket floor, shopping scattered.' };
      return { A: 'Own airway.', B: 'Breathing normally now.', C: e.flags.amb ? `HR ${p.hr}, BP ${bp(e)} (paramedic monitor).` : 'Moving, coughing.', D: `Groaning, GCS ~${p.gcs}.`, E: 'Pads still on.' };
    },
    inv: {},
    critical: [
      { text: 'Check for danger and response', check: (e) => e.flags.safe },
      { text: 'Recognise abnormal (agonal) breathing as cardiac arrest', check: (e) => e.flags.breath },
      { text: 'Call 999 (speaker phone)', check: (e) => !!e.flags.called },
      { text: 'CPR 30:2 with minimal interruptions', check: (e) => e.did('cpr_on') },
      { text: 'Send for the nearest AED and follow its prompts', check: (e) => !!e.flags.shocked },
      { text: 'After ROSC: recovery position, monitor, hand over to paramedics', check: (e) => e.flags.recov && e.flags.amb },
    ],
    targets: { map: 55, spo2: 88 },
    hint: { steps: [
      { t: 'Sudden collapse: VF arrest (ischaemic heart disease)', kind: 'cause' },
      { t: 'No coronary or cerebral flow; agonal gasps are common', rx: 'Call 999 on speaker, start CPR 30:2' },
      { t: 'Survival falls ~10% per minute without defibrillation', rx: 'Send for the AED; shock as soon as advised' },
      { t: 'Death', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 community BLS: unresponsive and not breathing normally → call 999 (speaker phone), start CPR 30:2 (100–120/min, 5–6 cm), send someone for an AED and follow its voice prompts. Continue until the ambulance arrives.',
      'Agonal (occasional, gasping) breathing is a sign of cardiac arrest, not of life.',
      'The 999 call handler can guide CPR and locate the nearest registered AED (The Circuit). Early bystander CPR and defibrillation double to quadruple survival.',
      'Untrained or unwilling rescuers should give compression-only CPR.',
    ], refs: [R + 'Adult basic life support (community)', 'The Circuit — national defibrillator network (BHF)'] },
  });

  // =====================================================================
  // R5. Stable regular narrow-complex tachycardia (SVT)
  // =====================================================================
  add({
    id: 'em-stable-svt', title: 'Palpitations in a young woman', field: 'EM', shock: null, category: 'Cardiac (arrhythmia)', difficulty: 1, setting: 'ed',
    stem: '34-year-old woman with 40 minutes of sudden-onset regular palpitations. She has had similar brief episodes before. Talking in full sentences, no chest pain or syncope.',
    patient: { age: 34, sex: 'F', weight: 62, rhythm: 'svt', fixedRate: 188, contract: 1.05, hrBase: 76, look: {} },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      const convert = (m) => { p.rhythm = 'sinus'; p.hrBase = 82; f.conv = true; return { handled: true, msg: m, kind: 'good' }; };
      if (ev.type === 'action' && ev.id === 'vagal' && p.rhythm === 'svt') { f.vag = (f.vag || 0) + 1; return { handled: true, msg: 'Modified Valsalva (strain 15 s, then lie flat with legs raised): brief slowing, then SVT continues.', kind: 'info' }; }
      if (ev.type === 'drug' && ev.id === 'adenosine' && p.rhythm === 'svt') {
        if (!e.did('inv_ecg')) e.harm('Adenosine without a 12-lead ECG / continuous recording');
        f.ad = (f.ad || 0) + 1;
        if (ev.dose < 12 && !f.ad6) { f.ad6 = true; return { msg: 'Adenosine 6 mg rapid bolus + flush: transient AV block, flushing and chest tightness, then SVT resumes. Next: 12 mg.', kind: 'warn' }; }
        return convert(`Adenosine ${ev.dose} mg: 3 s of asystole, then sinus rhythm 84/min. She feels much better.`);
      }
      if (ev.type === 'action' && ev.id === 'sync_dc') { if (p.rhythm !== 'svt') return { handled: true, harm: 'DC cardioversion of sinus rhythm' }; if (!f.ad) e.harm('Synchronised shock for a stable narrow-complex tachycardia before vagal manoeuvres / adenosine'); return convert('Synchronised shock under sedation — sinus rhythm.'); }
      if (ev.type === 'drug' && (ev.id === 'metoprolol' || ev.id === 'esmolol') && p.rhythm === 'svt' && (f.ad || 0) < 2) return { msg: 'β-blockade/verapamil are second line after vagal manoeuvres and adenosine fail.', kind: 'warn' };
    },
    exam: (e) => ({ A: 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Clear chest.`, C: `HR ${e.p.hr}, regular. BP ${bp(e)}. Warm peripheries, CRT < 2 s. No signs of heart failure.`, D: 'GCS 15, anxious.', E: 'Nil.' }),
    inv: { bloods: (e) => labs(e, { extra: [['TSH', '1.6 mU/L'], ['Magnesium', '0.86 mmol/L']] }), gas: true, ecg: (e) => ({ note: e.p.rhythm === 'svt' ? 'regular narrow-complex tachycardia, likely AVNRT.' : 'sinus rhythm; no delta wave (no pre-excitation).' }), cxr: cxrN, ct: [], pocus: [] },
    critical: [
      { text: 'Assess for life-threatening features (none)', check: (e) => e.did('exam') },
      { text: '12-lead ECG / rhythm strip', check: (e) => e.did('inv_ecg') },
      { text: 'Vagal manoeuvre (modified Valsalva)', check: (e) => e.did('vagal') },
      { text: 'Adenosine 6 mg → 12 mg (→ 18 mg)', check: (e) => (e.flags.ad || 0) >= 1 && e.flags.conv },
    ],
    targets: { hrMax: 110 },
    hint: { steps: [
      { t: 'Re-entry within the AV node (AVNRT)', kind: 'cause' },
      { t: 'No adverse features → drugs/manoeuvres are safe', rx: 'Modified Valsalva' },
      { t: 'Interrupt the circuit at the AV node', rx: 'Adenosine 6 → 12 → 18 mg rapid IV with flush, ECG recording' },
      { t: 'Persists: verapamil or β-blocker; then synchronised shock', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 tachyarrhythmia: no life-threatening features + regular narrow QRS (< 0.12 s) → vagal manoeuvres first (modified Valsalva).',
      'Then adenosine (if no pre-excitation): 6 mg rapid IV bolus, 12 mg if unsuccessful, then 18 mg — with continuous ECG recording, warning the patient about transient chest discomfort.',
      'If ineffective: verapamil or a β-blocker; if still ineffective, synchronised shock.',
      'After conversion record a 12-lead ECG in sinus rhythm to look for pre-excitation and refer to cardiology if recurrent.',
    ], refs: [R + 'Adult tachyarrhythmia algorithm (V3, March 2026)', 'REVERT trial — modified Valsalva (Lancet 2015, UK)'] },
  });

  // =====================================================================
  // R6. Stable fast AF (irregular narrow)
  // =====================================================================
  add({
    id: 'em-stable-af', title: 'Fast irregular heartbeat', field: 'EM', shock: null, category: 'Cardiac (arrhythmia)', difficulty: 1, setting: 'ed',
    stem: '72-year-old man with 3 days of palpitations and mild breathlessness on exertion. Hypertension; no known heart failure. Not anticoagulated.',
    patient: { age: 72, sex: 'M', weight: 84, rhythm: 'af', fixedRate: 148, contract: 0.95, hrBase: 76, look: { legs: { oedema: true } } },
    extraActions: [{ id: 'af_anticoag', name: 'Assess stroke risk (CHA₂DS₂-VA) and start anticoagulation' }],
    tick(e, dt) { const p = e.p; if (p.rhythm === 'af') p.fixedRate = toward(p.fixedRate, 148 - Math.min(62, 6.5 * e.total('metoprolol')), 0.03, dt); },
    onEvent(e, ev) {
      const p = e.p, f = e.flags;
      if (ev.type === 'drug' && ev.id === 'adenosine') return { harm: 'Adenosine for atrial fibrillation (not indicated)' };
      if (ev.type === 'action' && ev.id === 'sync_dc') return { handled: true, harm: 'Electrical cardioversion of stable AF of > 48 h duration without anticoagulation (stroke risk)' };
      if (ev.type === 'drug' && ev.id === 'amiodarone') return { msg: 'Amiodarone can chemically cardiovert — avoid in AF > 48 h without anticoagulation; rate control first.', kind: 'warn' };
      if (ev.type === 'drug' && ev.id === 'metoprolol') { f.rate = true; return { msg: `Metoprolol ${ev.dose} mg IV over 2 min. Repeat every 5 min if needed (max 15 mg).`, kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'af_anticoag') { f.ac = true; return { handled: true, msg: 'CHA₂DS₂-VA 3 (age, hypertension): offer a DOAC (apixaban). ORBIT bleeding score low.', kind: 'good' }; }
    },
    exam: (e) => ({ A: 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Few bibasal crackles.`, C: `HR ${e.p.hr}, irregularly irregular. BP ${bp(e)}. No signs of shock.`, D: 'GCS 15.', E: 'Ankles: mild oedema.' }),
    inv: { bloods: (e) => labs(e, { extra: [['TSH', '0.9 mU/L'], ['Magnesium', '0.79 mmol/L'], ['NT-proBNP', '640 ng/L']] }), gas: false, ecg: { note: 'AF with no pre-excitation.' }, cxr: cxrN, ct: [], pocus: [{ label: 'Focused echo', media: 'us_plax_normal', report: 'LV function grossly preserved (EF > 40%). Dilated left atrium.' }] },
    critical: [
      { text: '12-lead ECG', check: (e) => e.did('inv_ecg') },
      { text: 'Rate control with a β-blocker (EF > 40%)', check: (e) => e.flags.rate },
      { text: 'Look for precipitants (bloods incl. TFTs)', check: (e) => e.did('inv_bloods') },
      { text: 'Anticoagulation (AF > 48 h)', check: (e) => e.flags.ac },
    ],
    targets: { hrMax: 110 },
    hint: { steps: [
      { t: 'Atrial fibrillation of > 48 h (hypertensive atrial remodelling)', kind: 'cause', rx: 'Anticoagulate' },
      { t: 'Fast irregular ventricular response', rx: 'Rate control: β-blocker (EF > 40%)' },
      { t: 'Short diastole → raised LA pressure, mild congestion' },
      { t: 'Cardioversion without anticoagulation → stroke', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025: irregular narrow-complex tachycardia without life-threatening features is probably AF. Control the rate with a β-blocker, diltiazem/verapamil or digoxin if EF > 40%; with EF < 40% consider a β-blocker or digoxin.',
      'Anticoagulate if the arrhythmia has lasted more than 48 h; do not cardiovert (electrically or chemically) until anticoagulated or a TOE has excluded thrombus.',
      'Look for and treat precipitants: sepsis, thyrotoxicosis, electrolytes, alcohol, ischaemia.',
    ], refs: [R + 'Adult tachyarrhythmia algorithm (V3, March 2026)', 'NICE NG196: Atrial fibrillation — diagnosis and management (2021, updated 2025)'] },
  });

  // =====================================================================
  // R7. Pre-excited AF (irregular broad)
  // =====================================================================
  add({
    id: 'em-preexcited-af', title: 'Irregular broad-complex tachycardia in a young man', field: 'EM', shock: null, category: 'Cardiac (arrhythmia)', difficulty: 3, setting: 'ed',
    stem: '24-year-old man with sudden palpitations at the gym. Tells you he was once told he had "an extra wire" in his heart. Monitor: fast, irregular, broad complexes of varying width.',
    patient: { age: 24, sex: 'M', weight: 75, rhythm: 'af', fixedRate: 236, contract: 1, hrBase: 78, ecg: { qrs: 0.15 }, look: { sweaty: true } },
    tick(e, dt) { const p = e.p; if (p.rhythm === 'af' && e.flags.nodal) p.fixedRate = toward(p.fixedRate, 290, 0.05, dt); if (p.rhythm === 'af' && p.fixedRate > 280 && !e.flags.vf) { e.flags.vf = true; p.rhythm = 'vt'; p.fixedRate = 300; e.say('Rate now ~300/min — degenerating!', 'bad'); } },
    onEvent(e, ev) {
      const p = e.p, f = e.flags;
      const convert = (m) => { p.rhythm = 'sinus'; p.hrBase = 80; p.ecg.qrs = 0.1; f.conv = true; f.vf = false; return { handled: true, msg: m, kind: 'good' }; };
      if (ev.type === 'drug' && ['adenosine', 'metoprolol', 'esmolol', 'labetalol'].includes(ev.id)) { f.nodal = true; return { harm: 'AV-nodal blocker in pre-excited AF (accelerates conduction down the accessory pathway → VF)' }; }
      if (ev.type === 'drug' && ev.id === 'procainamide') { const k = ev.dose / p.weight; if (k < 8) return { msg: 'Underdosed — 10–15 mg/kg over 20 min.', kind: 'warn' }; e.after(20, () => { if (p.rhythm !== 'sinus') convert('Procainamide: converted to sinus rhythm with a short PR and delta wave (WPW).'); }); return { msg: 'Procainamide infusing over 20 min.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'sync_dc') { if (p.rhythm === 'sinus') return { handled: true, harm: 'DC cardioversion of sinus rhythm' }; if (!any(e, 'propofol', 'midazolam', 'ketamine', 'alfentanil')) e.harm('Cardioversion of a conscious patient without sedation'); return convert('Synchronised shock 150 J under procedural sedation — sinus rhythm with a delta wave.'); }
      if (ev.type === 'drug' && ev.id === 'amiodarone') return { msg: 'RCUK 2025 lists amiodarone only if procainamide is unavailable/contraindicated and sedation risk is high; cardioversion is preferred here.', kind: 'warn' };
      if (ev.type === 'action' && ev.id === 'defib' && p.rhythm === 'vt') return;
    },
    exam: (e) => ({ A: 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`, C: `HR ${e.p.hr}, irregular. BP ${bp(e)}. ${e.p.map < 65 ? 'Clammy.' : 'Warm.'}`, D: 'GCS 15.', E: 'Fit young man.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: (e) => ({ note: e.p.rhythm === 'sinus' ? 'short PR and delta waves — Wolff–Parkinson–White.' : 'irregular broad complexes of varying morphology at very high rates — pre-excited AF (WPW).' }), cxr: cxrN, ct: [], pocus: [] },
    critical: [
      { text: '12-lead ECG — recognise pre-excited AF', check: (e) => e.did('inv_ecg') },
      { text: 'Avoid AV-nodal blockers (adenosine, β-blockers, verapamil, digoxin)', check: (e) => !e.flags.nodal },
      { text: 'Procainamide or synchronised cardioversion', check: (e) => e.flags.conv },
      { text: 'Cardiology referral (ablation)', check: (e) => e.did('call_help') || e.did('icu_referral') },
    ],
    targets: { hrMax: 110, map: 65 },
    hint: { steps: [
      { t: 'Accessory pathway (WPW) conducting AF to the ventricles', kind: 'cause' },
      { t: 'No AV-node "filter" → ventricular rates > 250/min', rx: 'Avoid AV-nodal blockers' },
      { t: 'Risk of degeneration to VF', rx: 'Procainamide 10–15 mg/kg or synchronised cardioversion' },
      { t: 'VF arrest', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025: irregular broad-complex tachycardia may be pre-excited AF, AF with bundle branch block, or polymorphic VT.',
      'Pre-excited AF: give procainamide (10–15 mg/kg over 20 min) or cardiovert; do NOT give adenosine or other AV-nodal blockers.',
      'If sedation risk is too high and procainamide is unavailable, amiodarone can be considered (300 mg over 10–60 min); synchronised shock with expert advice if drugs fail.',
      'Refer for electrophysiology study and accessory pathway ablation.',
    ], refs: [R + 'Adult tachyarrhythmia algorithm (V3, March 2026)'] },
  });

  // =====================================================================
  // R8. Paediatric choking (infant)
  // =====================================================================
  const chokeInf = (e) => (e.flags.bb || 0) >= 1 && (e.flags.ct || 0) >= 2;
  add({
    id: 'paed-choking', title: 'Infant choking', field: 'Paeds', shock: null, category: 'Airway', difficulty: 2, setting: 'ed', als: true, arrestLimit: 420, satArrest: 0.5,
    stem: 'A mother runs into the ED waiting room with her 9-month-old son (9 kg). He was eating halved grapes in his buggy and suddenly started coughing and gagging. Now he is making no sound and his lips are going blue.',
    patient: paed(9, 0.75, { airwayPatent: false, effort: 1, stress: 0.5, look: {} }),
    arrestRhythm: () => 'pea',
    extraActions: [
      { id: 'pc_cough', name: 'Encourage coughing' },
      { id: 'pc_back', name: '5 back blows (head-down, prone along forearm)' },
      { id: 'pc_chest', name: '5 chest thrusts (infant)' },
      { id: 'pc_abdo', name: '5 abdominal thrusts' },
      { id: 'pc_sweep', name: 'Blind finger sweep' },
      { id: 'pc_rescue', name: 'Open airway + 5 rescue breaths' },
      { id: 'pc_magill', name: 'Look in the mouth / laryngoscopy + Magill forceps' },
    ],
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (!f.clear && !p.arrested && p.sa < 0.7 && !f.uncon) { f.uncon = true; p.gcs = 3; e.say('He has gone floppy and unresponsive.', 'bad'); }
      if (f.clear) p.airwayPatent = true;
    },
    rosc(e) { const f = e.flags; if (f.clear && f.rescue && e.flags.cpr) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 5) { e.p.effort = 0.8; return true; } } return false; },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type !== 'action') return;
      const conscious = !f.uncon && !p.arrested;
      if (ev.id === 'pc_cough') return { handled: true, msg: conscious ? 'Cough is silent — ineffective. Shout for help and start back blows.' : 'He is unconscious.', kind: 'warn' };
      if (ev.id === 'pc_back') { if (!conscious) return { handled: true, msg: 'Unconscious — open the airway and give 5 rescue breaths, then CPR.', kind: 'warn' }; f.bb = (f.bb || 0) + 1; if (chokeInf(e)) { f.clear = true; return { handled: true, msg: 'A grape shoots out! He coughs, then cries loudly.', kind: 'good' }; } return { handled: true, msg: '5 back blows with the heel of the hand between the shoulder blades, head lower than chest — still obstructed.', kind: 'info' }; }
      if (ev.id === 'pc_chest') { if (!conscious) return { handled: true, msg: 'Unconscious — rescue breaths and CPR now.', kind: 'warn' }; if (!f.bb) return { handled: true, msg: 'Start with 5 back blows.', kind: 'warn' }; f.ct = (f.ct || 0) + 1; if (chokeInf(e)) { f.clear = true; return { handled: true, msg: 'On the 4th chest thrust a grape is expelled — he takes a big breath and cries.', kind: 'good' }; } return { handled: true, msg: '5 chest thrusts (two fingers, lower sternum, supine head-down) — still obstructed. Alternate with back blows.', kind: 'info' }; }
      if (ev.id === 'pc_abdo') return { handled: true, harm: 'Abdominal thrusts in an infant (risk of liver/visceral injury — use chest thrusts)' };
      if (ev.id === 'pc_sweep') return { handled: true, harm: 'Blind finger sweep in a child' };
      if (ev.id === 'pc_rescue') { if (conscious) return { handled: true, msg: 'Not while conscious — back blows and chest thrusts.', kind: 'warn' }; f.rescue = true; p.assisted = f.clear; p.fio2 = 1; p.lastFio2 = 1; return { handled: true, msg: f.clear ? '5 rescue breaths with good chest rise.' : '5 rescue breaths attempted — poor chest rise. Start compressions (15:2) and look in the mouth before each set of breaths.', kind: f.clear ? 'good' : 'warn' }; }
      if (ev.id === 'pc_magill') { if (conscious) return { handled: true, msg: 'Not in a conscious infant.', kind: 'warn' }; if (!e.flags.cpr && !f.rescue) return { handled: true, msg: 'Nothing visible yet. Rescue breaths and compressions may dislodge it.', kind: 'info' }; f.clear = true; p.airwayPatent = true; p.assisted = true; return { handled: true, msg: 'Grape now visible in the pharynx — removed under direct vision with Magill forceps.', kind: 'good' }; }
    },
    exam: (e) => {
      const p = e.p, f = e.flags;
      if (f.clear) return { A: 'Clear — crying.', B: `RR ${p.rr}, SpO₂ ${p.spo2}%. Good air entry, no wheeze.`, C: pcirc(e), D: p.arrested ? 'Unresponsive.' : 'Crying, consolable.', E: 'Grape retrieved.' };
      return { A: 'Silent cough, no air movement.', B: `Marked recession, no air entry. SpO₂ ${p.spo2}%.`, C: p.arrested ? 'No signs of life.' : pcirc(e), D: f.uncon ? 'Floppy, unresponsive.' : 'Distressed, alert.', E: 'Halved grapes in his hand.' };
    },
    inv: { bloods: (e) => pLabs(e, {}), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'No retained foreign body, no hyperinflation.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Recognise ineffective cough and shout for help', check: (e) => e.did('call_help') },
      { text: 'Infant: alternate 5 back blows and 5 chest thrusts', check: (e) => (e.flags.bb || 0) >= 1 && (e.flags.ct || 0) >= 1 || e.flags.rescue },
      { text: 'No abdominal thrusts or blind finger sweeps in an infant', check: (e) => !e.harms.some((h) => /Abdominal thrusts|finger sweep/.test(h)) },
      { text: 'Obstruction relieved', check: (e) => e.flags.clear },
    ],
    targets: { spo2: 94 },
    hint: { steps: [
      { t: 'Grape impacted in the upper airway', kind: 'cause' },
      { t: 'Ineffective cough = severe obstruction', rx: 'Infant: 5 back blows, then 5 chest thrusts' },
      { t: 'No ventilation → hypoxia → bradycardia → arrest', rx: 'Unconscious: open airway, 5 rescue breaths, CPR 15:2' },
      { t: 'Hypoxic cardiac arrest', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 paediatric choking: encourage coughing while it is effective. If ineffective, shout for help / call the team (speaker phone if alone).',
      'Conscious infant: alternate 5 back blows with 5 CHEST thrusts. Conscious child: alternate 5 back blows with 5 ABDOMINAL thrusts.',
      'Unconscious: open the airway, attempt 5 rescue breaths and continue with paediatric BLS; look in the mouth and remove an object only if clearly visible. No repeated or blind finger sweeps.',
      'Children who have had thrusts or have persistent symptoms need medical assessment.',
    ], refs: [R + 'Paediatric choking algorithm', R + 'Paediatric life support (basic and advanced)'] },
  });

  // =====================================================================
  // R9. Paediatric in-hospital BLS — bradycardic arrest on the ward
  // =====================================================================
  add({
    id: 'paed-bls-ward', title: 'Infant found unresponsive on the ward', field: 'Paeds', shock: 'Hypoxic (arrest)', difficulty: 1, setting: 'ward', als: true, arrestLimit: 420, noCprLimit: 60,
    stem: 'Children’s ward: a 4-month-old (6.5 kg) admitted with bronchiolitis on high-flow. His mother calls out — he is pale, floppy and not breathing. The monitor shows HR 48 and SpO₂ 62%.',
    patient: paed(6.5, 0.33, { rhythm: 'pea', peaRate: 48, effort: 0, shunt: 0.2, lactate: 4, look: {} }),
    arrestRhythm: () => 'pea',
    extraActions: [
      { id: 'pb_airway', name: 'Open airway (infant: neutral head position, chin lift)' },
      { id: 'pb_rescue', name: '5 rescue breaths (bag-mask, 100% O₂, 2-person)' },
      { id: 'pb_pads', name: 'Attach defibrillator pads' },
      { id: 'pb_io', name: 'IO / IV access' },
    ],
    rosc(e) {
      const f = e.flags;
      if (f.rescue && e.flags.cpr) { f.cprT = (f.cprT || 0) + 0.1; if (f.cprT > (f.adr ? 8 : 18)) { e.p.effort = 0.6; e.p.shunt = 0.1; return true; } }
      return false;
    },
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action') {
        if (ev.id === 'pb_airway') { f.airwayOpen = true; return { handled: true, msg: 'Head in neutral position, chin lift; secretions suctioned.', kind: 'info' }; }
        if (ev.id === 'pb_rescue' || ev.id === 'bvm') { if (!f.airwayOpen && ev.id === 'pb_rescue') return { handled: true, msg: 'Open the airway first.', kind: 'warn' }; f.rescue = true; p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; return { handled: true, msg: '5 rescue breaths with visible chest rise. No signs of life, HR still < 60 — start compressions 15:2.', kind: 'good' }; }
        if (ev.id === 'pb_pads') { f.pads = true; return { handled: true, msg: 'Paediatric pads attached (antero-posterior). Rhythm: sinus bradycardia ~45 with no output — non-shockable.', kind: 'good' }; }
        if (ev.id === 'pb_io') { f.io = true; return { handled: true, msg: 'IO needle in the proximal tibia.', kind: 'good' }; }
        if (ev.id === 'call_help') return { handled: true, msg: '2222 — paediatric arrest call.', kind: 'good' };
        if (ev.id === 'defib' && p.arrested) return { handled: true, harm: 'Defibrillation of a non-shockable rhythm' };
        if (ev.id === 'icu_referral') return { handled: true, msg: 'PICU retrieval team contacted.', kind: 'good' };
      }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && p.arrested) { const k = perKg(e, ev.dose); if (k > 15) return { harm: 'Adrenaline overdose (10 micrograms/kg)', noHarm: true }; if (k < 7) return { msg: 'Underdosed — 10 micrograms/kg.', kind: 'warn', noHarm: true }; f.adr = true; return { msg: 'Adrenaline 10 micrograms/kg IO.', kind: 'good', noHarm: true }; }
    },
    exam: (e) => ({ A: e.flags.airwayOpen ? 'Airway open.' : 'Head flexed, secretions.', B: e.p.arrested ? (e.p.assisted ? 'Bag-mask breaths, chest rising.' : 'Apnoeic.') : `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`, C: e.p.arrested ? 'No signs of life; brachial pulse barely palpable, HR < 60.' : pcirc(e), D: e.p.arrested ? 'Floppy, unresponsive.' : 'Grimacing, moving limbs.', E: 'Bronchiolitis — copious secretions.' }),
    inv: { bloods: (e) => pLabs(e, { glu: 4.2 }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Hyperinflation, patchy atelectasis.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Call for help — 2222 paediatric arrest', check: (e) => e.did('call_help') },
      { text: 'Open airway and give 5 rescue breaths', check: (e) => e.flags.rescue },
      { text: 'HR < 60 with no signs of life: compressions 15:2', check: (e) => e.did('cpr_on') },
      { text: 'Attach defibrillator pads', check: (e) => e.flags.pads },
      { text: 'Post-ROSC: titrate O₂ (SpO₂ 94–98%) and PICU referral', check: (e) => e.did('icu_referral') },
    ],
    targets: { spo2: 94 },
    hint: { steps: [
      { t: 'Bronchiolitis → apnoea / secretion plug', kind: 'cause' },
      { t: 'Hypoxaemia → bradycardia (HR < 60) → no effective output', rx: 'Open airway, 5 rescue breaths' },
      { t: 'Bradycardia with poor perfusion IS cardiac arrest in a child', rx: 'CPR 15:2, call 2222, pads on' },
      { t: 'Asystole', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 paediatric in-hospital BLS: call for help (2222), open the airway and give 5 rescue breaths (bag-mask with oxygen if competent).',
      'If there are no signs of life (or HR < 60/min with poor perfusion), start compressions immediately at 15:2; attach a defibrillator as soon as one is available.',
      'Most paediatric arrests are hypoxic — effective ventilation is the key intervention; adrenaline 10 micrograms/kg IV/IO if there is no response.',
      'After ROSC: SpO₂ 94–98%, normocapnia, BP above the 10th centile, glucose control, avoid hypothermia/hyperthermia, PICU.',
    ], refs: [R + 'Paediatric in-hospital basic life support algorithm', R + 'Paediatric advanced life support algorithm'] },
  });

  // =====================================================================
  // R10. Paediatric bradycardia with a pulse (vagal + hypoxia)
  // =====================================================================
  add({
    id: 'paed-brady', title: 'Toddler bradycardic during suctioning', field: 'Paeds', shock: 'Cardiogenic (bradyarrhythmia)', difficulty: 2, setting: 'ward', als: true, arrestLimit: 420,
    stem: 'Children’s ward: an 18-month-old (11 kg) with a viral chest infection is having vigorous nasopharyngeal suctioning. He becomes pale and limp; the monitor shows HR 52 and SpO₂ 84%. The nurse is still suctioning.',
    patient: paed(11, 1.5, { hrBase: 50, baro: 0.3, effort: 0.45, shunt: 0.18, look: {} }),
    extraActions: [{ id: 'pbr_stop', name: 'Stop suctioning (remove the vagal stimulus)' }],
    init(e) { e.flags.suction = true; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const oxy = p.assisted || p.fio2 >= 0.6;
      let base = f.suction ? 44 : 70;
      if (oxy) base += f.suction ? 10 : 25;
      if (!oxy && !f.suction && e.t > 5) base -= 0;
      p.hrBase = toward(p.hrBase, base, 0.04, dt);
      if (oxy) { p.shunt = toward(p.shunt, 0.06, 0.03, dt); p.effort = toward(p.effort, 0.9, 0.03, dt); }
    },
    rosc(e) { const f = e.flags; if ((e.p.assisted || e.p.fio2 >= 0.6) && e.flags.cpr && (f.adr || e.did('atropine'))) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 8) { e.p.hrBase = 110; return true; } } return false; },
    arrestRhythm: () => 'pea',
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action' && ev.id === 'pbr_stop') { f.suction = false; return { handled: true, msg: 'Suction stopped. HR creeps up slightly.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'atropine') { const k = perKg(e, ev.dose); if (k < 15) return { msg: 'Atropine dose: 20 micrograms/kg (max 0.5 mg).', kind: 'warn' }; f.atr = true; return { msg: 'Atropine 20 micrograms/kg IV — for vagally mediated bradycardia.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && !p.arrested) { const k = perKg(e, ev.dose); if (k > 5) return { harm: 'Arrest-dose adrenaline in a child with a pulse (bradycardia dose 1–2 micrograms/kg)', noHarm: true }; f.adr = true; return { msg: 'Adrenaline 1 microgram/kg IV for bradycardia unresponsive to oxygenation and atropine.', kind: 'good', noHarm: true }; }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && p.arrested) { f.adr = true; return { msg: 'Adrenaline 10 micrograms/kg (arrest dose).', kind: 'good', noHarm: true }; }
      if (ev.type === 'action' && ev.id === 'pacing') return { msg: 'Pacing is rarely needed in children — treat hypoxia and vagal causes first.', kind: 'warn' };
    },
    exam: (e) => ({ A: e.flags.suction ? 'Suction catheter in the nose.' : 'Patent, some secretions.', B: `RR ${e.p.rr}, shallow. SpO₂ ${e.p.spo2}%.`, C: e.p.arrested ? 'No signs of life.' : pcirc(e) + (e.p.hr < 80 ? ' Pale, mottled.' : ' Pink.'), D: e.p.hr < 70 ? 'Floppy, responds to pain only.' : 'Crying.', E: 'T 37.9 °C.' }),
    inv: { bloods: (e) => pLabs(e, { glu: 5.1 }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Peribronchial thickening.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Remove the vagal stimulus', check: (e) => !e.flags.suction },
      { text: 'Optimise oxygenation (high-flow O₂ / bag-mask)', check: (e) => e.p.assisted || any(e, 'o2_nrb', 'hfno', 'bvm') },
      { text: 'Atropine 20 micrograms/kg (vagal) ± adrenaline 1–2 micrograms/kg', check: (e) => e.flags.atr || e.flags.adr },
      { text: 'HR restored for age', check: (e) => e.p.hr >= 90 },
    ],
    targets: { spo2: 94, hrMin: 90 },
    hint: { steps: [
      { t: 'Pharyngeal stimulation → vagal reflex; plus hypoxaemia', kind: 'cause' },
      { t: 'Sinus node slowing; hypoxia is the commonest cause in children', rx: 'Stop the stimulus; oxygenate / ventilate' },
      { t: 'Bradycardia → ↓ cardiac output (children are rate-dependent)', rx: 'Atropine 20 mcg/kg (vagal); adrenaline 1–2 mcg/kg if no response' },
      { t: 'HR < 60 with poor perfusion = arrest', rx: 'CPR 15:2, adrenaline 10 mcg/kg', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 paediatric arrhythmia — bradycardia (infant < 80/min, child > 1 year < 60/min): optimise oxygenation and consider vagal causes.',
      'If no response to oxygenation and vagal stimulation is likely: atropine 20 micrograms/kg (max 0.5 mg). No response to oxygenation or atropine: consider adrenaline 1–2 micrograms/kg or an infusion.',
      'If unconscious with HR < 60/min despite oxygenation, start chest compressions (PLS). Pacing is rarely required.',
    ], refs: [R + 'Paediatric cardiac arrhythmia algorithm', R + 'Paediatric advanced life support algorithm'] },
  });

  // =====================================================================
  // R11. Paediatric shockable arrest (VF)
  // =====================================================================
  add({
    id: 'paed-vf', title: 'VF arrest in a child', field: 'Paeds', shock: 'Cardiogenic (arrest)', difficulty: 2, setting: 'ward', als: true, arrestLimit: 480,
    stem: 'Children’s ward: a 10-year-old girl (32 kg) admitted with suspected viral myocarditis suddenly loses consciousness while talking to the nurse. Monitor: VF.',
    patient: paed(32, 10, { sex: 'F', rhythm: 'vf', contract: 0.7, effort: 0, look: {} }),
    extraActions: [{ id: 'pv_io', name: 'IO / IV access' }, { id: 'pv_cardio', name: 'Discuss with paediatric cardiology / PICU' }],
    rosc(e) {
      const f = e.flags;
      if ((e.shocks || 0) >= 4 && f.adr && f.amio && e.flags.cpr) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 4) { e.p.contract = 0.95; return true; } }
      return false;
    },
    onEvent(e, ev) {
      const f = e.flags, p = e.p, n = e.shocks || 0;
      if (ev.type === 'action' && ev.id === 'pv_io') { f.io = true; return { handled: true, msg: 'IO access, proximal tibia.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'pv_cardio') { f.card = true; return { handled: true, msg: 'Paediatric cardiology and PICU informed — echo and ECMO team on standby.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && p.arrested) { const k = perKg(e, ev.dose); if (n < 3) return { msg: 'Shockable rhythm: adrenaline after the 3rd shock.', kind: 'warn', noHarm: true }; if (k > 15) return { harm: 'Adrenaline overdose (10 micrograms/kg, max 1 mg)', noHarm: true }; if (k < 7) return { msg: 'Underdosed — 10 micrograms/kg.', kind: 'warn', noHarm: true }; f.adr = true; return { msg: 'Adrenaline 10 micrograms/kg — repeat every 3–5 min.', kind: 'good', noHarm: true }; }
      if (ev.type === 'drug' && ev.id === 'amiodarone' && p.arrested) { const k = perKg(e, ev.dose); if (n < 3) return { msg: 'Amiodarone 5 mg/kg after the 3rd shock.', kind: 'warn' }; if (k < 3.5 || k > 7) return { msg: 'Amiodarone dose: 5 mg/kg (max 300 mg).', kind: 'warn' }; f.amio = true; return { msg: 'Amiodarone 5 mg/kg; one further dose after the 5th shock if still shockable.', kind: 'good' }; }
    },
    exam: (e) => ({ A: e.p.assisted ? 'Bag-mask, good chest rise.' : 'Not breathing.', B: e.p.arrested ? 'Apnoeic.' : `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`, C: e.p.arrested ? 'No central pulse.' : pcirc(e), D: 'Unresponsive.', E: 'Nil.' }),
    inv: { bloods: (e) => pLabs(e, { trop: 940, k: 4.4 }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Mild cardiomegaly.' }, ct: [], pocus: [{ label: 'Cardiac (pulse check)', media: 'us_plax_poor', report: (e) => (e.p.arrested ? 'Fibrillating ventricle.' : 'Severely impaired LV function, small effusion.') }] },
    critical: [
      { text: 'CPR 15:2 and call the team', check: (e) => e.did('cpr_on') && e.did('call_help') },
      { text: 'Bag-mask ventilation with 100% O₂ (continue after ROSC)', check: (e) => any(e, 'bvm', 'sga', 'rsi_ketamine', 'rsi_propofol') },
      { text: 'Shock 4 J/kg, CPR 2 min between shocks', check: (e) => (e.shocks || 0) >= 3 },
      { text: 'After 3rd shock: adrenaline 10 mcg/kg + amiodarone 5 mg/kg', check: (e) => e.flags.adr && e.flags.amio },
      { text: 'Expert help (cardiology / PICU)', check: (e) => e.flags.card || e.did('icu_referral') },
    ],
    targets: { map: 55, spo2: 94 },
    hint: { steps: [
      { t: 'Myocarditis → inflamed, electrically unstable myocardium', kind: 'cause' },
      { t: 'VF — shockable', rx: 'Shock 4 J/kg; CPR 15:2 for 2 min' },
      { t: 'Refractory VF', rx: 'Adrenaline 10 mcg/kg + amiodarone 5 mg/kg after 3rd shock; escalate to 8 J/kg from the 5th' },
      { t: 'Consider ECPR / reversible causes', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 PLS shockable rhythm: shock 4 J/kg, immediately resume CPR for 2 min; for refractory VF/pVT escalate stepwise to 8 J/kg (max 360 J) from the 5th shock.',
      'After the 3rd shock: adrenaline 10 micrograms/kg (max 1 mg) then every 3–5 min, and amiodarone 5 mg/kg (max 300 mg); repeat amiodarone once more (max 150 mg) after the 5th shock.',
      'Continuous compressions once a tracheal tube/SGA is in, ventilating at 15/min for 8–12 years. Look for reversible causes (4 Hs & 4 Ts).',
      'After ROSC: SpO₂ 94–98%, normal PaCO₂, systolic and mean BP above the 10th centile, avoid hypo/hyperthermia, glucose control.',
    ], refs: [R + 'Paediatric advanced life support algorithm', 'APLS: Advanced Paediatric Life Support, 7th edn (ALSG, 2023)'] },
  });

  // =====================================================================
  // R12. Paediatric VT with a pulse (decompensated)
  // =====================================================================
  add({
    id: 'paed-vt', title: 'Teenager with broad-complex tachycardia', field: 'Paeds', shock: 'Cardiogenic (arrhythmia)', difficulty: 3, setting: 'ed', als: true, arrestLimit: 420,
    stem: '13-year-old boy (45 kg) with repaired tetralogy of Fallot. Palpitations and a faint at school. Now drowsy, grey and clammy. Monitor: regular broad-complex tachycardia ~220/min.',
    patient: paed(45, 13, { rhythm: 'vt', fixedRate: 220, contract: 0.6, gcs: 13, look: { sweaty: true } }),
    extraActions: [{ id: 'pvt_cardio', name: 'Call paediatric cardiology' }],
    tick(e, dt) { const p = e.p; if (p.rhythm === 'vt') { p.contract = Math.max(0.3, p.contract - 0.0009 * dt); if (p.map < 34) p.pulseless = true; } },
    rosc(e) { const f = e.flags; if ((e.shocks || 0) >= 2 && e.flags.cpr && (f.amio || e.did('adrenaline'))) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 5) return true; } return false; },
    onEvent(e, ev) {
      const p = e.p, f = e.flags;
      if (ev.type === 'action' && ev.id === 'pvt_cardio') { f.card = true; return { handled: true, msg: 'Paediatric cardiologist: treat as VT; synchronised cardioversion; amiodarone 5 mg/kg over > 20 min before the 3rd shock.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'sync_dc') {
        if (p.rhythm !== 'vt' || p.arrested) return p.rhythm === 'sinus' ? { handled: true, harm: 'DC cardioversion of sinus rhythm' } : undefined;
        if (!any(e, 'ketamine', 'midazolam', 'propofol')) e.harm('Synchronised cardioversion of a conscious child without sedation/analgesia');
        f.dc = (f.dc || 0) + 1;
        const J = [1, 2, 4][Math.min(2, f.dc - 1)];
        if (f.dc < 3 || !f.amio) return { handled: true, msg: `Synchronised shock ${f.dc}: ${J} J/kg (${Math.round(J * p.weight)} J) — still VT.${f.dc >= 2 && !f.amio ? ' Give amiodarone 5 mg/kg before the 3rd attempt.' : ' Next: double the energy.'}`, kind: 'warn' };
        p.rhythm = 'sinus'; p.hrBase = 95; f.conv = true; return { handled: true, msg: `Synchronised shock 3: 4 J/kg (${Math.round(4 * p.weight)} J) — sinus rhythm. Pulse strong.`, kind: 'good' };
      }
      if (ev.type === 'drug' && ev.id === 'amiodarone') { const k = perKg(e, ev.dose); if (k < 3.5 || k > 7) return { msg: 'Amiodarone 5 mg/kg (max 300 mg) by slow IV infusion over > 20 min.', kind: 'warn' }; f.amio = true; return { msg: 'Amiodarone 5 mg/kg infusing over 20 min (with expert advice).', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'adenosine' && p.rhythm === 'vt') return { msg: 'No change in rhythm. If unsure whether broad-complex tachycardia is SVT or VT, treat as VT.', kind: 'warn' };
    },
    exam: (e) => ({ A: 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`, C: e.p.arrested ? 'No pulse.' : pcirc(e) + (e.p.rhythm === 'vt' ? ' Weak, rapid pulse; grey.' : ''), D: e.p.rhythm === 'vt' ? 'Drowsy, responds to voice (V on AVPU).' : 'Alert.', E: 'Midline sternotomy scar.' }),
    inv: { bloods: (e) => pLabs(e, { k: 3.9, extra: [['Magnesium', '0.78 mmol/L']] }), gas: true, ecg: (e) => ({ note: e.p.rhythm === 'vt' ? 'monomorphic VT (repaired tetralogy — RV outflow scar).' : 'RBBB (post-repair), sinus rhythm.', morph: e.p.rhythm === 'vt' ? {} : { rbbb: 1 } }), cxr: cxrN, ct: [], pocus: [{ label: 'Cardiac', media: 'us_plax_poor', report: 'Very fast rate, poor filling; dilated RV.' }] },
    critical: [
      { text: 'Recognise decompensation (BP < 5th centile, ↓ conscious level)', check: (e) => e.did('exam') },
      { text: 'Sedation/analgesia for cardioversion (e.g. ketamine)', check: (e) => any(e, 'ketamine', 'midazolam', 'propofol') },
      { text: 'Synchronised shocks 1 J/kg → 2 J/kg → 4 J/kg', check: (e) => (e.flags.dc || 0) >= 2 || e.flags.conv },
      { text: 'Amiodarone 5 mg/kg before the 3rd shock (expert advice)', check: (e) => e.flags.amio },
      { text: 'Sinus rhythm restored', check: (e) => e.p.rhythm === 'sinus' && !e.p.arrested },
    ],
    targets: { spo2: 94, hrMax: 140 },
    hint: { steps: [
      { t: 'Scar-related re-entry (repaired tetralogy of Fallot)', kind: 'cause' },
      { t: 'VT at 220/min → no diastolic filling', rx: 'Synchronised cardioversion with sedation (do not delay for IV)' },
      { t: 'Decompensated shock (BP < 5th centile, drowsy)', rx: '1 J/kg, doubling to 4 J/kg; amiodarone 5 mg/kg before the 3rd shock' },
      { t: 'Pulseless VT', rx: 'PLS: 4 J/kg unsynchronised', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 paediatric arrhythmia: if in doubt whether a broad-complex tachycardia is SVT or VT, treat as VT.',
      'Decompensated (reduced conscious level, BP < 5th centile — 80 mmHg at 10 years, CRT > 2 s): synchronised cardioversion, 1 J/kg first, doubling each attempt to a maximum of 4 J/kg, with sedation/analgesia (IM/IN ketamine if IV access is delayed).',
      'Amiodarone 5 mg/kg by slow IV infusion over > 20 min before the 3rd cardioversion, in discussion with a paediatric cardiologist. Magnesium 25–50 mg/kg for torsades.',
      'Pulseless VT is a cardiac arrest — follow PLS (4 J/kg unsynchronised).',
    ], refs: [R + 'Paediatric cardiac arrhythmia algorithm', R + 'Paediatric advanced life support algorithm'] },
  });

  // =====================================================================
  // Newborn helpers
  // =====================================================================
  function newbornEvents(e, ev, f, p, opt) {
    const m = {
      nb_clock: () => { f.clock = true; return ['Clock started.', 'info']; },
      nb_warm: () => { f.dried = true; return [opt.home ? 'Dried, wet towels removed, hat on; undried body placed in a plastic bag next to the mother / heat pack. Room heater on.' : 'Dried, wet towel removed, hat on, under the radiant heater.', 'good']; },
      nb_airway: () => { f.airway = true; return ['Head in neutral position, jaw support.', 'info']; },
      nb_2person: () => { f.twoPerson = true; f.airway = true; return ['Two-person technique: one holds the mask with a jaw thrust, the other squeezes the bag.', 'good']; },
      nb_sga: () => { f.sga = true; f.airway = true; return ['Supraglottic airway (size 1) inserted.', 'good']; },
      nb_ett: () => { if (opt.home) return ['A tracheal tube is not part of the community kit — use 2-person mask ventilation or an SGA.', 'warn']; f.ett = true; f.airway = true; e.flags.airway = 'ett'; return ['Intubated (3.5 tube, 9.5 cm at the lips); colorimetric CO₂ change confirmed.', 'good']; },
      nb_inflation: () => {
        if (!f.airway) return ['No chest rise — position the airway first.', 'warn'];
        if (opt.hardAirway && !(f.twoPerson || f.sga || f.ett)) { f.infTried = true; return ['5 inflation breaths — NO chest rise. Check mask seal and head position, try a 2-person jaw thrust, consider SGA or tracheal tube.', 'bad']; }
        f.aerated = true; return [`5 inflation breaths (30 cmH₂O, 2–3 s each, in air${opt.home ? '' : ', PEEP 6'}) — chest rising.`, 'good'];
      },
      nb_vent: () => { if (!f.aerated) return ['Give inflation breaths with chest rise first.', 'warn']; f.vent = true; f.ventT = e.t; p.fio2 = f.comp ? 1 : 0.3; p.lastFio2 = p.fio2; p.assisted = true; return ['Ventilation breaths at 30/min, good chest rise.', 'good']; },
      nb_hr: () => [`Heart rate ~${Math.round(p.hr / 10) * 10}/min.${p.hr < 60 && f.vent && e.t - f.ventT > 25 ? ' < 60 after 30 s of effective ventilation — start compressions 3:1 with 100% O₂.' : ''}`, p.hr < 60 ? 'bad' : 'info'],
      nb_sats: () => { f.sats = true; return [`Pre-ductal SpO₂ (right hand): ${p.spo2}%.`, 'info']; },
      nb_comp: () => { if (!f.vent) return ['Ensure effective ventilation first.', 'warn']; if (p.hr >= 60) { e.harm('Neonatal chest compressions with HR ≥ 60/min'); return ['HR is above 60 — compressions not indicated.', 'warn']; } f.comp = true; p.fio2 = 1; p.lastFio2 = 1; return ['Compressions 3:1 (15 cycles/min), synchronised with breaths, 100% O₂.', 'good']; },
      nb_access: () => { f.access = true; return [opt.home ? 'Intraosseous needle in the proximal tibia.' : 'Umbilical venous catheter inserted.', 'good']; },
      nb_glucose: () => { f.glu = true; return [`Blood glucose ${p.glucose.toFixed(1)} mmol/L.`, p.glucose < 2.6 ? 'warn' : 'info']; },
      nb_parents: () => { f.parents = true; return ['Parents updated honestly and kindly about what is happening.', 'good']; },
      nb_convey: () => { if (!opt.home) return ['Admit to the neonatal unit.', 'info']; f.convey = true; return ['Pre-alert to the obstetric/neonatal unit; baby secured in a thermal wrap for blue-light conveyance with the mother.', 'good']; },
      nb_nicu: () => { f.nicu = true; return ['Neonatal team: transfer to NICU; assess for therapeutic hypothermia (HIE criteria), check glucose, avoid hyperthermia.', 'good']; },
    };
    if (ev.type === 'action' && m[ev.id]) { const [t, k] = m[ev.id](); return { handled: true, msg: t, kind: k }; }
    if (ev.type === 'action' && ev.id === 'bvm') { if (f.aerated) { f.vent = true; f.ventT = e.t; } }
    if (ev.type === 'drug' && ev.id === 'adrenaline') {
      const k = ev.dose / p.weight;
      if (!f.comp) return { harm: 'Adrenaline before effective ventilation and compressions', noHarm: true };
      if (!f.access) return { msg: 'Needs UVC/IO access first.', kind: 'warn', noHarm: true };
      if (k < 8) return { msg: 'Underdosed — 20 micrograms/kg IV.', kind: 'warn', noHarm: true };
      if (k > 35) return { harm: 'Adrenaline overdose in a newborn (20 micrograms/kg IV)', noHarm: true };
      f.adr = (f.adr || 0) + 1; f.adrT = e.t; return { msg: 'Adrenaline 20 micrograms/kg via UVC — repeat every 4 min if HR stays < 60.', kind: 'good', noHarm: true };
    }
    if (ev.type === 'drug' && ev.id === 'bicarbonate') return { harm: 'Sodium bicarbonate in newborn resuscitation (no longer recommended)' };
    if (ev.type === 'drug' && ev.id === 'glucose') { f.gluGiven = true; return { msg: 'Glucose 10% bolus given via the UVC.', kind: 'good' }; }
    if (ev.type === 'fluid') { f.volume = true; return { msg: `Volume ${ev.kind === 'rbc' ? 'O-negative blood' : '0.9% saline'} 10 mL/kg over a few minutes.`, kind: 'good' }; }
    return null;
  }
  const nbActions = (home) => [
    { id: 'nb_clock', name: 'Start the clock' },
    { id: 'nb_warm', name: home ? 'Thermal care: dry, hat, plastic bag + heat source' : 'Dry, stimulate, keep warm' },
    { id: 'nb_airway', name: 'Open airway (neutral position, jaw support)' },
    { id: 'nb_inflation', name: '5 inflation breaths (30 cmH₂O, 2–3 s, air)' },
    { id: 'nb_2person', name: 'Two-person mask ventilation with jaw thrust' },
    { id: 'nb_sga', name: 'Supraglottic airway' },
    ...(home ? [] : [{ id: 'nb_ett', name: 'Tracheal intubation' }]),
    { id: 'nb_vent', name: 'Ventilation breaths 30/min' },
    { id: 'nb_hr', name: 'Assess heart rate & chest rise' },
    { id: 'nb_sats', name: 'Pre-ductal saturation probe (right hand)' },
    { id: 'nb_comp', name: 'Chest compressions 3:1 with 100% O₂' },
    { id: 'nb_access', name: home ? 'Intraosseous access' : 'Umbilical venous catheter' },
    { id: 'nb_glucose', name: 'Check blood glucose' },
    { id: 'nb_parents', name: 'Update the parents' },
    ...(home ? [{ id: 'nb_convey', name: 'Pre-alert hospital & convey' }] : [{ id: 'nb_nicu', name: 'Handover to NICU (TABCDEF, cooling assessment)' }]),
  ];
  const nbExam = (e) => {
    const f = e.flags, p = e.p;
    return { A: f.ett ? 'Intubated.' : f.sga ? 'SGA in situ.' : f.airway ? 'Neutral position.' : 'Head flexed.', B: f.breathing ? 'Crying, breathing regularly.' : f.vent ? 'Ventilated, chest moving.' : 'Apnoeic / gasping.', C: `HR ${p.hr < 60 ? '< 60' : p.hr < 100 ? '60–100' : '> 100'}/min. ${p.hr < 100 ? 'Pale.' : 'Perfused.'}`, D: f.breathing ? 'Tone improving.' : 'Floppy.', E: `T ${p.temp.toFixed(1)} °C. ${f.dried ? 'Wrapped.' : 'Wet.'}` };
  };

  // =====================================================================
  // R13. Out-of-hospital newborn life support (home birth)
  // =====================================================================
  add({
    id: 'neo-oh-nls', title: 'Baby born before arrival at home', field: 'Paeds', shock: 'Hypoxic (perinatal)', difficulty: 2, setting: 'home', satArrest: 0.3, stableFor: 15,
    stem: 'You are the paramedic at an unplanned home birth. A term baby girl (3.2 kg) has just been born onto the bathroom floor. The room is cold. She is floppy and not breathing; the mother is well. You have a neonatal bag-valve-mask, SGA, saturation probe and IO needle.',
    patient: paed(3.2, 0.005, { sex: 'F', effort: 0, hrBase: 70, mapArrest: 10, hrGain: 8, baro: 0.2, shunt: 0.3, temp: 36.4, tempRate: -0.012, glucose: 3.2, lactate: 5, look: {} }),
    kit: { drugs: false, fluids: false, inv: false, actions: ['o2_nc'], note: 'Ambulance community kit only — no drugs or investigations for this baby (consider early conveyance).' },
    extraActions: nbActions(true),
    tick(e, dt) {
      const p = e.p, f = e.flags;
      p.tempRate = f.dried ? 0 : -0.012;
      if (f.vent) { p.assisted = true; p.shunt = toward(p.shunt, 0.08, 0.02, dt); }
      p.hrBase = toward(p.hrBase, f.vent ? 150 : f.aerated ? 90 : 60, 0.025, dt);
      if (p.hr >= 100 && f.vent && !f.breathing && e.t - f.ventT > 20) { f.breathing = true; p.effort = 1; p.assisted = false; e.say('She gasps, then cries — breathing, HR > 100.', 'good'); }
    },
    onEvent(e, ev) { return newbornEvents(e, ev, e.flags, e.p, { home: true, hardAirway: true }); },
    exam: nbExam,
    inv: {},
    critical: [
      { text: 'Start the clock; thermal care (dry, hat, plastic bag/heat)', check: (e) => e.flags.clock && e.flags.dried },
      { text: '5 inflation breaths (2–3 s, in air) and check for chest rise', check: (e) => e.flags.infTried || e.flags.aerated },
      { text: 'Chest not moving: 2-person jaw thrust / SGA, repeat inflation breaths', check: (e) => e.flags.aerated },
      { text: 'Ventilation breaths 30/min; reassess HR every 30 s', check: (e) => e.flags.vent && e.did('nb_hr') },
      { text: 'Pre-alert and convey; update the parents', check: (e) => e.flags.convey && e.flags.parents },
    ],
    targets: { spo2: 85, hrMin: 100 },
    hint: { steps: [
      { t: 'Precipitate birth; lungs still fluid-filled', kind: 'cause' },
      { t: 'Cold, wet newborn → hypothermia worsens hypoxia', rx: 'Dry, hat, plastic bag + heat source' },
      { t: 'No chest rise = airway problem', rx: '2-person jaw thrust, SGA; repeat 5 inflation breaths' },
      { t: 'Aerated lungs → HR rises', rx: 'Ventilation 30/min; convey with pre-alert', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 out-of-hospital NLS: prepare (information, briefing, equipment, thermal adjuncts); start the clock, delay cord clamping where possible, stimulate and keep warm — an undried baby in a plastic bag with a heat source.',
      'Not breathing adequately: 5 inflation breaths of 2–3 s in air, look for chest rise, use a saturation monitor if available. Chest not moving: check mask seal, head and jaw, 2-person support, consider an SGA or higher pressures, and repeat.',
      'Once the chest moves: ventilation breaths at 30/min. HR < 60 after 30 s of effective ventilation: 3:1 compressions, 100% O₂, consider IO access and immediate conveyance.',
      'Prioritise thermal care, avoid hypoxia, pre-alert the hospital and ensure safe, timely conveyance; update the parents and complete records.',
    ], refs: [R + 'Out-of-hospital newborn life support algorithm', 'JRCALC Clinical Guidelines: newborn life support'] },
  });

  // =====================================================================
  // R14. Advanced resuscitation of the newborn infant (ARNI)
  // =====================================================================
  add({
    id: 'neo-arni', title: 'Pale, shocked baby after placental abruption', field: 'Paeds', shock: 'Hypovolaemic (perinatal)', difficulty: 3, setting: 'delivery', satArrest: 0.2, stableFor: 15,
    stem: 'Delivery suite: emergency caesarean for a major placental abruption at 39 weeks. The neonatal registrar is 10 minutes away; you are leading. The baby boy (3.6 kg) is white, floppy and not breathing, HR ~40.',
    patient: paed(3.6, 0.005, { effort: 0, hrBase: 40, mapArrest: 5, hrGain: 6, baro: 0.15, shunt: 0.32, vol: 0.62, temp: 36.6, tempRate: -0.004, glucose: 1.9, lactate: 9, look: {} }),
    extraActions: nbActions(false),
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.dried) p.tempRate = 0;
      if (f.vent) { p.assisted = true; p.shunt = toward(p.shunt, 0.08, 0.02, dt); }
      if (f.volume) p.vol = toward(p.vol, 0.95, 0.05, dt);
      if (f.gluGiven) p.glucose = toward(p.glucose, 4.2, 0.05, dt);
      let target = 40;
      if (f.vent) target = f.comp ? (f.adr && f.volume ? 150 : f.adr || f.volume ? 75 : 50) : 48;
      p.hrBase = toward(p.hrBase, target, 0.025, dt);
      if (!f.vent && e.t > 150 && p.rhythm !== 'asystole') { p.rhythm = 'asystole'; e.say('Heart rate undetectable — asystole.', 'bad'); }
      if (p.hr >= 100 && f.vent && !f.breathing && f.volume && e.t - (f.adrT || 0) > 20) { f.breathing = true; p.effort = 0.6; e.say('HR now > 100 and rising; gasping efforts starting. Stop compressions; continue ventilation.', 'good'); }
    },
    onEvent(e, ev) { return newbornEvents(e, ev, e.flags, e.p, { home: false, hardAirway: true }); },
    exam: nbExam,
    inv: { bloods: (e) => pLabs(e, { glu: e.p.glucose.toFixed(1), hb: Math.round(e.p.hb * 0.75) }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Lungs aerated; tube tip at T2; no pneumothorax.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Team brief, start clock, thermal care', check: (e) => e.flags.clock && e.flags.dried },
      { text: 'Chest not moving: escalate airway (2-person / SGA / tracheal tube)', check: (e) => e.flags.aerated },
      { text: 'HR < 60 after effective ventilation: compressions 3:1, 100% O₂', check: (e) => e.flags.comp },
      { text: 'UVC: adrenaline 20 micrograms/kg (every 4 min)', check: (e) => (e.flags.adr || 0) >= 1 },
      { text: 'Volume 10 mL/kg for suspected blood loss; check & treat glucose', check: (e) => e.flags.volume && e.flags.gluGiven },
      { text: 'Post-resuscitation: TABCDEF, NICU, cooling assessment, family', check: (e) => e.flags.nicu && e.flags.parents },
    ],
    targets: { spo2: 85, hrMin: 100, gluMin: 2.6 },
    hint: { steps: [
      { t: 'Placental abruption → fetal blood loss + asphyxia', kind: 'cause' },
      { t: 'Non-aerated lungs, hypovolaemia, hypoglycaemia', rx: 'Airway escalation; inflation then ventilation breaths' },
      { t: 'HR < 60 despite effective ventilation', rx: 'Compressions 3:1, 100% O₂, UVC adrenaline 20 mcg/kg q4 min' },
      { t: 'Empty heart cannot respond', rx: 'Volume 10 mL/kg (O-neg blood), glucose 2.5 mL/kg 10%' },
      { t: 'Hypoxic–ischaemic encephalopathy', kind: 'end' },
    ] },
    debrief: { points: [
      'RCUK 2025 ARNI: prepare (team brief, equipment check), assess ABC with thermal care, follow NLS, and decide — life-threatening features (treat, CPR if needed, re-assess TABC), worrying features (call for help, consider D, E, F) or satisfactory.',
      'Airway escalation when the chest does not move: mask seal and position, 2-person jaw thrust, SGA, suction, tracheal tube (video laryngoscopy where available).',
      'D = Disability, Drugs, Dextrose: adrenaline 20 micrograms/kg IV every 4 min, volume 10 mL/kg (blood if haemorrhage), glucose; sodium bicarbonate is no longer recommended. E = Exposure/Environment. F = Family.',
      'Post-resuscitation: re-assess TABCDEF, avoid hyperthermia, glucose control, assess for therapeutic hypothermia, document and debrief.',
    ], refs: [R + 'Advanced resuscitation of the newborn infant (ARNI) algorithm', R + 'Newborn life support algorithm'] },
  });
})();
