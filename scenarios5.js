/* Scenario library — part 5: further emergency medicine & critical care cases
 * (topics broadened to match common simulation curricula; all content written for CrashCall and referenced to UK/Irish guidance). */
(function () {
  const S = window.Sim;
  const clamp = S.clamp;
  const { add, any, toward, oxygen, vaso, labs } = S.scnUtil;
  const bp = (e) => `${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}`;
  const B = (e, t) => `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. ${t || ''}`;
  const C = (e, t) => `HR ${e.p.hr}, BP ${bp(e)}. ${t || ''}`;
  const ex = (o) => (e) => { const v = (x) => (typeof x === 'function' ? x(e) : x || ''); return { A: v(o.A) || 'Patent.', B: B(e, v(o.B)), C: C(e, v(o.C)), D: v(o.D) || `GCS ${e.p.gcs}.`, E: v(o.E) || `T ${e.p.temp.toFixed(1)} °C.` }; };
  const fluidL = (e) => e.fluidIn.crystalloid / 1000;
  const cxrN = { media: 'cxr_normal', report: 'No acute abnormality.' };

  // =====================================================================
  // Complete heart block
  // =====================================================================
  add({
    id: 'em-chb', title: 'Bradycardia with syncope', field: 'EM', shock: 'Cardiogenic (bradyarrhythmia)', difficulty: 1, setting: 'ed',
    stem: '78-year-old man, two blackouts today without warning. Grey and clammy, HR in the 30s. Background: hypertension. Medications: amlodipine, ramipril.',
    patient: { age: 78, sex: 'M', weight: 76, rhythm: 'chb', fixedRate: 33, contract: 0.95, lactate: 2.6, look: { sweaty: true } },
    tick(e, dt) { const p = e.p; if (p.rhythm === 'chb') { p.fixedRate = Math.max(22, p.fixedRate - 0.012 * dt); if (p.fixedRate < 24 && !e.flags.pause) { e.flags.pause = true; e.say('Ventricular standstill for 6 s — he loses consciousness briefly.', 'bad'); } } },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'atropine') return { msg: 'Atropine: P-wave rate increases but the ventricular rate barely changes — block is infranodal.', kind: 'warn' };
      if (ev.type === 'action' && ev.id === 'cath_lab') { e.flags.cardio = true; return { handled: true, msg: 'Cardiology: temporary transvenous wire in the cath lab now, then permanent pacemaker.', kind: 'good' }; }
    },
    exam: ex({ C: (e) => (e.p.rhythm === 'chb' ? 'Slow, regular pulse; cannon a-waves in the JVP. Cool peripheries.' : 'Paced rhythm, good volume.'), D: 'GCS 15, light-headed.', E: 'No trauma from falls.' }),
    inv: { bloods: (e) => labs(e, { k: 4.6, trop: 22 }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Good LV function, slow rate, no effusion.' }] },
    critical: [
      { text: '12-lead ECG', check: (e) => e.did('inv_ecg') },
      { text: 'Atropine 500 micrograms (repeat to 3 mg)', check: (e) => e.did('atropine') },
      { text: 'Isoprenaline / adrenaline infusion or transcutaneous pacing', check: (e) => any(e, 'isoprenaline', 'adrenaline', 'pacing') },
      { text: 'Cardiology for transvenous / permanent pacing', check: (e) => e.flags.cardio },
    ],
    targets: { map: 65, hrMin: 50 },
    hint: { steps: [
      { t: 'Degenerative conduction disease (His–Purkinje)', kind: 'cause' },
      { t: 'No AV conduction → slow ventricular escape (25–40/min)', rx: 'Atropine (often ineffective infranodally)' },
      { t: 'CO = HR × SV falls despite ↑SV', rx: 'Isoprenaline 5 mcg/min / adrenaline 2–10 mcg/min' },
      { t: 'Pauses → syncope (Stokes–Adams), asystole risk', rx: 'Transcutaneous → transvenous pacing' },
      { t: 'Asystole', kind: 'end' },
    ] },
    debrief: {
      points: [
        'RCUK bradycardia algorithm: adverse features (shock, syncope, ischaemia, heart failure) → atropine 500 micrograms IV, repeat to 3 mg.',
        'Risk of asystole: Mobitz II, complete heart block with broad QRS, recent asystole or ventricular pause > 3 s — arrange transvenous pacing.',
        'Interim measures: isoprenaline 5 micrograms/min, adrenaline 2–10 micrograms/min, or transcutaneous pacing (with analgesia/sedation).',
        'Look for reversible causes: drugs (β-blockers, rate-limiting CCBs, digoxin), hyperkalaemia, inferior MI.',
      ],
      refs: ['Resuscitation Council UK ALS 2021: Bradycardia algorithm', 'NICE NG185 / ESC 2021 Pacing guidelines (adopted by BHRS)'],
    },
  });

  // =====================================================================
  // Digoxin toxicity
  // =====================================================================
  add({
    id: 'em-digoxin', title: 'Digoxin toxicity', field: 'EM', shock: 'Cardiogenic (toxic)', difficulty: 2, setting: 'ed',
    stem: '84-year-old woman on digoxin and furosemide for AF and heart failure. Three days of vomiting and confusion; she says everything looks yellow. HR 38. Creatinine was high at her GP last week.',
    patient: { age: 84, sex: 'F', weight: 52, rhythm: 'chb', fixedRate: 38, contract: 0.8, k: 6.3, gcs: 14, lactate: 2.4, ecg: { dig: 0.9, escape: 'junctional', atrial: 'af', bidir: true, ectopy: 0.08 }, look: {} },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.fab) { if (p.rhythm !== 'af') { p.rhythm = 'af'; p.fixedRate = 84; } p.k = toward(p.k, 4.8, 0.01, dt); p.ecg.dig = toward(p.ecg.dig, 0.35, 0.01, dt); p.ecg.ectopy = 0; return; }
      f.vtT = (f.vtT || 0) + dt;
      if (p.rhythm === 'vt' && f.vtT > 9) { p.rhythm = 'chb'; p.fixedRate = 38; f.vtT = 0; e.say('Bidirectional VT self-terminates; back to slow junctional rhythm.', 'warn'); }
      else if (p.rhythm !== 'vt' && f.vtT > 45) { p.rhythm = 'vt'; p.fixedRate = 165; f.vtT = 0; e.say('Run of BIDIRECTIONAL VT on the monitor!', 'bad'); }
      p.k = Math.min(7.2, p.k + 0.0006 * dt);
    },
    extraActions: [{ id: 'digifab', name: 'Digoxin-specific antibody fragments (DigiFab)' }, { id: 'toxbase', name: 'Check TOXBASE / call NPIS' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'digifab') { e.flags.fab = true; return { handled: true, msg: 'DigiFab given (dose from TOXBASE calculator). Within minutes the arrhythmia settles: AF ~85/min.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'toxbase') { e.flags.tox = true; return { handled: true, msg: 'TOXBASE: life-threatening arrhythmia or K⁺ > 6 in chronic toxicity — give digoxin-specific antibody fragments.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'atropine') return { msg: 'Atropine gives a small, transient rise in rate.', kind: 'info' };
      if (ev.type === 'action' && ev.id === 'sync_dc' && e.p.rhythm === 'vt') return { handled: true, harm: 'DC cardioversion in digoxin toxicity (risk of refractory VF) — use antibody fragments' };
    },
    exam: ex({ C: 'Slow, regular pulse; cool peripheries. Mild ankle oedema.', D: (e) => `GCS ${e.p.gcs}, confused. Xanthopsia.`, E: 'Dry mucous membranes.' }),
    inv: { bloods: (e) => labs(e, { k: e.p.k.toFixed(1), urea: 21, cr: 214, egfr: 18, extra: [['Digoxin level', '4.2 µg/L (therapeutic 0.5–2.0)'], ['Magnesium', '0.68 mmol/L']] }), gas: true, ecg: (e) => ({ note: e.flags.fab ? 'after DigiFab: AV conduction restored (underlying AF).' : 'digoxin toxicity — increased automaticity with AV block (LITFL: "regularised AF", frequent PVCs, bidirectional VT).' }), cxr: { media: 'cxr_normal', report: 'Cardiomegaly, no oedema.' }, ct: [], pocus: [] },
    critical: [
      { text: '12-lead ECG and potassium', check: (e) => e.did('inv_ecg') && (e.did('inv_gas') || e.did('inv_bloods')) },
      { text: 'Discuss with TOXBASE / NPIS', check: (e) => e.flags.tox },
      { text: 'Digoxin-specific antibody fragments', check: (e) => e.flags.fab },
    ],
    targets: { map: 65, hrMin: 50, kMax: 6 },
    hint: { steps: [
      { t: 'AKI + diuretic → digoxin accumulation', kind: 'cause' },
      { t: 'Na⁺/K⁺-ATPase inhibition → ↑ intracellular Ca²⁺, ↑ automaticity; ↑ vagal tone', rx: 'DigiFab' },
      { t: 'AV block + ectopy, bidirectional VT; hyperkalaemia', rx: 'Atropine/pacing as bridge' },
      { t: 'VF / asystole', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Chronic digoxin toxicity is often precipitated by AKI, dehydration, hypokalaemia/hypomagnesaemia or interacting drugs.',
        'TOXBASE: give digoxin-specific antibody fragments for life-threatening arrhythmias, haemodynamic compromise or significant hyperkalaemia; dose by level or empirically.',
        'Atropine and pacing are temporising; DC cardioversion risks refractory VF.',
      ],
      refs: ['TOXBASE (UK National Poisons Information Service): Digoxin', 'RCEM/NPIS: Guideline on antidote availability for emergency departments'],
    },
  });

  // =====================================================================
  // Torsades de pointes
  // =====================================================================
  add({
    id: 'em-torsades', title: 'Recurrent syncope with a long QT', field: 'EM', shock: 'Cardiogenic (arrhythmic)', difficulty: 2, setting: 'ed',
    stem: '56-year-old woman on citalopram, started clarithromycin and ondansetron for a chest infection with vomiting. Three collapses today. On the monitor: sinus 54/min with very long QT — then a run of polymorphic VT.',
    patient: { age: 56, sex: 'F', weight: 64, hrBase: 54, k: 2.9, lactate: 1.8, ecg: { qt: 1.8, ectopy: 0.12 }, look: {} },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const supp = e.did('magnesium') && (e.E('magnesium') > 0.02 || f.mgT) ? 1 : 0;
      if (supp) f.mgT = true;
      const over = p.hr >= 90 && any(e, 'isoprenaline', 'pacing');
      f.t = (f.t || 0) + dt;
      if (p.rhythm === 'vt') { if (f.t > 8) { p.rhythm = 'sinus'; f.t = 0; e.say('Torsades self-terminates. Patient comes round.', 'warn'); } }
      else if (!supp && !over && f.t > (f.n ? 28 : 12)) { f.n = (f.n || 0) + 1; f.t = 0; if (f.n >= 5) { p.rhythm = 'vf'; e.say('Torsades degenerates into VF!', 'bad'); } else { p.rhythm = 'vt'; p.fixedRate = 240; e.say('TORSADES DE POINTES — patient unresponsive.', 'bad'); } }
      if (e.did('iv_potassium')) p.k = toward(p.k, 4.2, 0.004, dt);
      if (e.did('stop_trigger')) p.ecg.qt = toward(p.ecg.qt, 1.35, 0.003, dt);
      p.ecg.ectopy = f.mgT ? 0.02 : 0.12;
    },
    extraActions: [{ id: 'iv_potassium', name: 'IV potassium replacement (via pump)' }],
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'magnesium') return { msg: 'Magnesium sulfate 2 g IV over 10 min — first-line for torsades.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'amiodarone') return { harm: 'Amiodarone prolongs QT — contraindicated in torsades' };
      if (ev.type === 'action' && ev.id === 'stop_trigger') return { handled: true, msg: 'Citalopram, clarithromycin and ondansetron stopped.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'iv_potassium') return { handled: true, msg: 'Potassium chloride 40 mmol in 1 L over 4 h (central/large vein), aim K⁺ 4.5–5.0.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'defib' && e.p.rhythm === 'vt') { e.p.rhythm = 'sinus'; e.flags.t = 0; return { handled: true, msg: 'Unsynchronised shock — sinus rhythm (but torsades will recur unless treated).', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'pacing') { e.p.rhythm = 'paced'; e.p.paceRate = 100; return { handled: true, msg: 'Overdrive pacing at 100/min.', kind: 'good' }; }
    },
    exam: ex({ C: 'Pulse regular, slow between runs.', D: (e) => (e.p.rhythm === 'vt' ? 'Unresponsive during the run.' : 'GCS 15 between episodes.'), E: 'Afebrile.' }),
    inv: { bloods: (e) => labs(e, { k: e.p.k.toFixed(1), extra: [['Magnesium', '0.52 mmol/L'], ['Adjusted calcium', '2.18 mmol/L']] }), gas: true, ecg: (e) => ({ note: 'acquired long QT (clarithromycin + hypokalaemia + hypomagnesaemia).' }), cxr: { media: 'cxr_rll', report: 'Right lower-lobe consolidation.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Magnesium sulfate 2 g IV', check: (e) => e.did('magnesium') },
      { text: 'Stop QT-prolonging drugs', check: (e) => e.did('stop_trigger') },
      { text: 'Correct potassium (aim 4.5–5.0)', check: (e) => e.did('iv_potassium') },
      { text: '12-lead ECG (QTc)', check: (e) => e.did('inv_ecg') },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'QT-prolonging drugs + hypokalaemia/hypomagnesaemia + bradycardia', kind: 'cause' },
      { t: 'Prolonged repolarisation → early after-depolarisations', rx: 'Magnesium 2 g' },
      { t: 'R-on-T → polymorphic VT (torsades)', rx: 'Increase HR (isoprenaline / overdrive pacing)' },
      { t: 'VF', rx: 'Defibrillate', kind: 'end' },
    ] },
    debrief: {
      points: [
        'RCUK: polymorphic VT with long QT — magnesium sulfate 2 g IV, stop QT-prolonging drugs, correct electrolytes (K⁺ 4.5–5.0).',
        'Recurrent torsades: increase the heart rate (isoprenaline or overdrive pacing). Pulseless torsades → defibrillate.',
        'Avoid amiodarone and other class III drugs. Check credible meds lists for QT risk.',
      ],
      refs: ['Resuscitation Council UK ALS 2021: Tachycardia algorithm — polymorphic VT', 'MHRA Drug Safety Update: QT prolongation (citalopram/escitalopram, 2011)'],
    },
  });

  // =====================================================================
  // Electrical storm
  // =====================================================================
  add({
    id: 'icu-electrical-storm', title: 'Electrical storm (recurrent VT)', field: 'ICU', shock: 'Cardiogenic (arrhythmic)', difficulty: 3, setting: 'icu',
    stem: '66-year-old man with ischaemic cardiomyopathy (EF 25%) and an ICD, admitted to CCU after six ICD shocks in an hour. He is terrified. Monitor: monomorphic VT 180/min with a weak pulse.',
    patient: { age: 66, sex: 'M', weight: 82, rhythm: 'vt', fixedRate: 180, contract: 0.6, hrBase: 80, k: 3.4, stress: 0.6, lactate: 2.8, artLine: true, ecg: { oldQ: true }, look: { sweaty: true } },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const ctrl = (e.E('amiodarone') > 0.15 ? 1 : 0) + (any(e, 'esmolol', 'labetalol') ? 1 : 0) + (any(e, 'midazolam', 'propofol') || p.ventilated ? 1 : 0);
      p.stress = ctrl >= 3 ? 0 : any(e, 'midazolam', 'propofol') ? 0.15 : 0.6;
      if (p.rhythm === 'sinus') { f.sr = (f.sr || 0) + dt; if (ctrl < 3 && f.sr > 30 - ctrl * 8) { f.sr = 0; f.recur = (f.recur || 0) + 1; p.rhythm = 'vt'; p.fixedRate = 180; e.say(`VT recurs (episode ${f.recur + 1}) — the ICD shocks him again.`, 'bad'); } }
      if (p.rhythm === 'vt') p.contract = Math.max(0.4, p.contract - 0.0006 * dt); else p.contract = toward(p.contract, 0.6, 0.01, dt);
    },
    extraActions: [{ id: 'icd_check', name: 'Interrogate ICD (cardiac physiologist)' }],
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'sync_dc') { if (p.rhythm !== 'vt') return { handled: true, harm: 'DC cardioversion of sinus rhythm' }; p.rhythm = 'sinus'; e.flags.sr = 0; return { handled: true, msg: 'Synchronised shock 150 J under sedation — sinus rhythm.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'amiodarone') { if (p.rhythm === 'vt' && ev.dose >= 150) e.after(20, (en) => { if (en.p.rhythm === 'vt') { en.p.rhythm = 'sinus'; en.flags.sr = 0; en.say('VT terminates after amiodarone.', 'good'); } }); return { msg: 'Amiodarone 300 mg over 10–20 min then 900 mg/24 h.', kind: 'good' }; }
      if (ev.type === 'drug' && (ev.id === 'esmolol' || ev.id === 'labetalol')) return { msg: 'β-blockade blunts the sympathetic drive sustaining the storm.', kind: 'good', noHarm: true };
      if (ev.type === 'drug' && ev.id === 'midazolam') return { msg: 'Sedation reduces catecholamine surge — consider intubation/deep sedation if refractory.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'icd_check') { e.flags.icd = true; return { handled: true, msg: 'ICD log: 7 appropriate shocks for monomorphic VT; ATP failed. Programming adjusted.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'magnesium') { p.k = Math.max(p.k, 4.0); return { msg: 'Magnesium given and potassium replaced to K⁺ > 4.5.', kind: 'good' }; }
      if (ev.type === 'drug' && (ev.id === 'adrenaline' || ev.id === 'isoprenaline' || ev.id === 'dobutamine')) return { harm: 'Catecholamine in electrical storm (pro-arrhythmic)' };
    },
    exam: ex({ C: (e) => (e.p.rhythm === 'vt' ? 'Weak thready pulse. Cool and clammy. Bibasal crackles.' : 'Pulse regular. Cool peripheries.'), D: 'GCS 15, very anxious.', E: 'ICD box left chest.' }),
    inv: { bloods: (e) => labs(e, { k: e.p.k.toFixed(1), trop: 180, extra: [['Magnesium', '0.61 mmol/L']] }), gas: true, ecg: (e) => ({ note: 'ischaemic cardiomyopathy with ICD (scar-related VT).' }), cxr: { media: 'cxr_oedema', report: 'Cardiomegaly, ICD in situ, mild interstitial oedema.' }, ct: [], pocus: [{ label: 'Parasternal long axis', media: 'us_plax_poor', report: 'Severely impaired, dilated LV.' }] },
    critical: [
      { text: 'Synchronised DC cardioversion for unstable VT', check: (e) => e.did('sync_dc') },
      { text: 'Amiodarone', check: (e) => e.did('amiodarone') },
      { text: 'β-blockade (esmolol / labetalol; propranolol orally)', check: (e) => any(e, 'esmolol', 'labetalol') },
      { text: 'Sedation (± intubation)', check: (e) => any(e, 'midazolam', 'propofol') || e.p.ventilated },
      { text: 'Correct K⁺/Mg²⁺', check: (e) => e.did('magnesium') },
    ],
    targets: { map: 65, hrMax: 110 },
    stableFor: 25,
    hint: { steps: [
      { t: 'Scar-related re-entry in ischaemic cardiomyopathy', kind: 'cause' },
      { t: 'Each shock → pain, fear → catecholamine surge', rx: 'Sedation; β-blockade' },
      { t: '↑ Sympathetic tone + low K⁺/Mg²⁺ → recurrent VT', rx: 'Amiodarone; correct electrolytes' },
      { t: 'Falling EF with each episode → cardiogenic shock', rx: 'Ablation / mechanical support (specialist)' },
      { t: 'Refractory VF / death', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Electrical storm (≥ 3 episodes of VT/VF in 24 h): treat unstable VT with synchronised cardioversion, then suppress recurrence.',
        'Sympathetic blockade is key: sedation (± intubation), β-blockers (propranolol/esmolol) and amiodarone; correct K⁺ and Mg²⁺; treat ischaemia.',
        'Avoid catecholamine inotropes where possible; involve electrophysiology early (ICD reprogramming, catheter ablation).',
      ],
      refs: ['Resuscitation Council UK ALS 2021: Tachycardia algorithm', 'ESC 2022 Guidelines for ventricular arrhythmias and prevention of SCD (adopted by BHRS/British Cardiovascular Society)'],
    },
  });

  // =====================================================================
  // SCAPE — sympathetic crashing acute pulmonary oedema
  // =====================================================================
  add({
    id: 'em-scape', title: 'Flash pulmonary oedema', field: 'EM', shock: null, category: 'Cardiorespiratory', difficulty: 2, setting: 'ed',
    stem: '74-year-old woman woke at 3 am gasping. Sitting bolt upright, pink frothy sputum, can only say single words. BP 215/120, SpO₂ 84% on a non-rebreathe mask.',
    patient: { age: 74, sex: 'F', weight: 70, contract: 0.68, vasoplegia: 1.7, vol: 1.15, pulmOedema: 0.6, oedemaProne: 1.2, shunt: 0.12, stress: 0.6, fio2: 0.8, rrBase: 32, lactate: 3.0, look: { sweaty: true } },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      p.stress = clamp(0.6 - (f.cpap ? 0.25 : 0) - clamp(e.E('gtn') * 1.2, 0, 0.35), 0, 0.6);
      if (f.cpap) p.shunt = toward(p.shunt, 0.04, 0.02, dt);
      if (!f.cpap && !e.did('gtn')) p.pulmOedema = Math.min(0.95, p.pulmOedema + 0.0008 * dt);
      if (!p.ventilated && p.pulmOedema > 0.55 && !f.cpap) p.effort = Math.max(0.4, p.effort - 0.001 * dt);
    },
    extraActions: [{ id: 'niv_cpap', name: 'CPAP 10 cmH₂O (NIV) via full face mask' }, { id: 'sit_up', name: 'Sit upright, legs dependent' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'niv_cpap') { e.flags.cpap = true; e.p.fio2 = 0.6; e.p.lastFio2 = 0.6; return { handled: true, msg: 'CPAP 10 cmH₂O, FiO₂ 0.6 — reduces preload and afterload, recruits flooded alveoli.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'sit_up') return { handled: true, msg: 'Sat upright with legs dependent.', kind: 'good' };
      if (ev.type === 'fluid') return { harm: 'IV fluid in acute pulmonary oedema' };
      if (ev.type === 'inf' && ev.id === 'gtn' && ev.rate > 0) return { msg: 'High-dose GTN (titrate quickly upwards; SBP is high).', kind: 'good', noHarm: true };
    },
    exam: ex({ A: 'Speaking single words.', B: (e) => (e.p.pulmOedema > 0.3 ? 'Crackles to the mid-zones bilaterally, pink frothy sputum.' : 'Basal crackles only.'), C: 'Hypertensive, sweaty, cool peripheries. JVP raised.', D: 'GCS 15, agitated.', E: 'Mild ankle oedema.' }),
    inv: { bloods: (e) => labs(e, { trop: 68, extra: [['NT-proBNP', '8,400 ng/L']] }), gas: true, ecg: { morph: { lvh: true }, note: 'no acute ST elevation.' }, cxr: { media: 'cxr_oedema', report: 'Bilateral alveolar oedema, upper-lobe diversion, small effusions.' }, ct: [], pocus: [{ label: 'Lung ultrasound', media: 'us_blines', report: 'Diffuse bilateral B-lines.' }, { label: 'Parasternal long axis', media: 'us_plax_poor', report: 'Moderately impaired LV; no effusion.' }] },
    critical: [
      { text: 'CPAP / NIV', check: (e) => e.flags.cpap },
      { text: 'High-dose nitrate', check: (e) => e.did('gtn') },
      { text: '12-lead ECG (exclude STEMI)', check: (e) => e.did('inv_ecg') },
    ],
    targets: { spo2: 94, mapMax: 115 },
    hint: { steps: [
      { t: 'Hypertensive surge in a stiff LV (afterload mismatch)', kind: 'cause', rx: 'High-dose GTN' },
      { t: '↑ LVEDP → ↑ pulmonary capillary pressure', rx: 'CPAP (↓ preload & afterload)' },
      { t: 'Alveolar flooding → shunt → hypoxia → more sympathetic drive', rx: 'Diuretic is a later, smaller player' },
      { t: 'Respiratory failure', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Hypertensive acute pulmonary oedema is an afterload problem: sit up, CPAP and high-dose IV nitrates, titrated to blood pressure.',
        'NICE CG187: do not routinely give opiates; consider NIV in cardiogenic pulmonary oedema with severe dyspnoea and acidaemia; loop diuretic for fluid overload.',
        'Exclude ACS with an early ECG; avoid IV fluids.',
      ],
      refs: ['NICE CG187: Acute heart failure — diagnosis and management (2014, updated 2021)', 'BTS/ICS: Guideline for ventilatory management of acute hypercapnic respiratory failure (2016)', 'ESC 2021 Heart failure guidelines (endorsed by the British Society for Heart Failure)'],
    },
  });

  // =====================================================================
  // Inferior STEMI with RV infarction
  // =====================================================================
  add({
    id: 'em-inferior-rv', title: 'Inferior STEMI with hypotension', field: 'EM', shock: 'Cardiogenic (RV infarct)', difficulty: 2, setting: 'ed',
    stem: '62-year-old man with 40 minutes of central chest pain. Paramedics gave aspirin and two sprays of GTN, after which he became grey and dizzy. Hypotensive and bradycardic, chest clear.',
    patient: { age: 62, sex: 'M', weight: 88, contract: 0.62, venodil: 0.28, hrBase: 44, hrGain: 10, baro: 0.6, lactate: 2.7, ecg: { st: 0.3 }, look: { sweaty: true } },
    tick(e, dt) {
      const p = e.p;
      p.venodil = Math.max(0, p.venodil - 0.0008 * dt);
      if (e.flags.reperfused) { p.contract = toward(p.contract, 0.9, 0.006, dt); p.hrBase = toward(p.hrBase, 72, 0.02, dt); p.ecg.st = toward(p.ecg.st, 0.05, 0.004, dt); }
      else p.contract = Math.max(0.45, p.contract - 0.0003 * dt);
      p.ecg.avb = p.hr < 55 && !e.flags.reperfused ? 'wenck' : null; // AV-nodal ischaemia (RCA) → Mobitz I
    },
    extraActions: [{ id: 'rv_leads', name: 'Right-sided ECG (V4R)' }, { id: 'acs_load', name: 'Antiplatelet loading (ticagrelor/prasugrel)' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'cath_lab') { e.flags.reperfused = true; return { handled: true, msg: 'Primary PCI: occluded proximal RCA opened and stented.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'rv_leads') { e.flags.rv = true; return { handled: true, msg: 'V4R: 1.5 mm ST elevation — right-ventricular infarction.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'acs_load') return { handled: true, msg: 'P2Y12 inhibitor loaded per PPCI protocol.', kind: 'good' };
      if (ev.type === 'inf' && ev.id === 'gtn' && ev.rate > 0) return { harm: 'Nitrate in RV infarction with hypotension' };
      if (ev.type === 'drug' && ev.id === 'furosemide') return { harm: 'Diuretic in preload-dependent RV infarction' };
      if (ev.type === 'fluid' && e.fluidIn.crystalloid > 2000) return { msg: 'Rising JVP — further fluid unlikely to help; consider inotrope.', kind: 'warn' };
    },
    exam: ex({ B: 'Chest clear.', C: 'Raised JVP with clear lungs. Cool, clammy.', D: 'GCS 15.', E: 'Nil.' }),
    inv: { bloods: (e) => labs(e, { trop: 1250 }), gas: true, ecg: (e) => ({ note: 'ST elevation II, III, aVF (III > II) with reciprocal depression in I/aVL and ST elevation in V1 — inferior STEMI with RV involvement: record V4R; avoid nitrates.', st: { II: 0.25, III: 0.35, aVF: 0.3, I: -0.12, aVL: -0.2, V1: 0.12 } }), cxr: cxrN, ct: [], pocus: [{ label: 'Apical 4-chamber', media: 'us_plax_poor', report: 'Dilated, hypokinetic RV; LV inferior hypokinesia; no effusion.' }] },
    critical: [
      { text: '12-lead and right-sided ECG', check: (e) => e.did('inv_ecg') && e.flags.rv },
      { text: 'Fluid bolus (preload-dependent RV)', check: (e) => e.did('fluid') },
      { text: 'Primary PCI', check: (e) => e.flags.reperfused },
      { text: 'Treat bradycardia (atropine / pacing)', check: (e) => any(e, 'atropine', 'pacing') || e.p.hr >= 55 },
    ],
    targets: { map: 65, hrMin: 50 },
    hint: { steps: [
      { t: 'Proximal RCA occlusion', kind: 'cause', rx: 'Primary PCI' },
      { t: 'RV infarct → RV can’t pump preload across the lungs', rx: 'Fluid boluses' },
      { t: 'Nitrates ↓ venous return → profound hypotension', rx: 'Avoid nitrates/diuretics' },
      { t: 'AV-nodal ischaemia → bradycardia', rx: 'Atropine; pacing' },
      { t: 'Cardiogenic shock', kind: 'end' },
    ] },
    debrief: {
      points: [
        'In inferior STEMI record right-sided leads (V4R); RV infarction makes the patient preload-dependent.',
        'Avoid nitrates and diuretics; give cautious fluid boluses; treat bradycardia; consider inotropes if fluid fails.',
        'NICE NG185: primary PCI if presenting within 12 h and achievable within 120 min of when fibrinolysis could be given.',
      ],
      refs: ['NICE NG185: Acute coronary syndromes (2020)', 'ESC 2023 ACS guidelines (adopted by the British Cardiovascular Society)', 'Resuscitation Council UK ALS 2021: Bradycardia algorithm'],
    },
  });

  // =====================================================================
  // Acute aortic dissection
  // =====================================================================
  add({
    id: 'em-dissection', title: 'Tearing chest pain', field: 'EM', shock: null, category: 'Vascular', difficulty: 3, setting: 'ed',
    stem: '58-year-old man with poorly controlled hypertension. Sudden “tearing” chest pain going through to his back 45 minutes ago. BP 196/108 in the right arm, 152/90 in the left. He is writhing in pain.',
    patient: { age: 58, sex: 'M', weight: 92, vasoplegia: 1.12, stress: 0.8, hrBase: 86, lactate: 1.6, artLine: false, look: { sweaty: true } },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      p.stress = clamp(0.8 - (f.opioid ? 0.4 : 0) - clamp(e.E('labetalol') * 1.5 + e.E('esmolol') * 2, 0, 0.4), 0, 0.8);
      if (!f.repaired) { f.risk = (f.risk || 0) + dt * Math.max(0, (p.map - 90) / 40) + dt * Math.max(0, (p.hr - 70) / 120); if (f.risk > 90 && !f.ruptured) { f.ruptured = true; p.obstruct = 0.55; p.bleed = 0.0006; e.say('Sudden collapse — haemopericardium from proximal extension!', 'bad'); } }
      if (f.ruptured && f.repaired) { p.obstruct = 0; p.bleed = 0; }
    },
    extraActions: [{ id: 'iv_opioid', name: 'IV morphine titrated' }, { id: 'aspirin_load', name: 'Aspirin 300 mg + P2Y12 inhibitor' }, { id: 'ct_surgeon', name: 'Refer to cardiothoracic surgery' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'iv_opioid') { e.flags.opioid = true; return { handled: true, msg: 'Morphine titrated — pain easing.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'aspirin_load') return { handled: true, harm: 'Antiplatelets in suspected aortic dissection' };
      if (ev.type === 'drug' && ev.id === 'alteplase') return { harm: 'Thrombolysis in aortic dissection' };
      if (ev.type === 'action' && ev.id === 'cath_lab') return { handled: true, harm: 'Cath lab activation for suspected ACS in aortic dissection' };
      if (ev.type === 'action' && (ev.id === 'ct_surgeon' || ev.id === 'theatre')) { if (!e.did('inv_ct')) return { handled: true, msg: 'Cardiothoracic: we need the CT aorta first.' }; e.flags.repaired = true; return { handled: true, msg: 'Stanford type A dissection accepted — emergency transfer for surgical repair.', kind: 'good' }; }
      if (ev.type === 'drug' && (ev.id === 'labetalol' || ev.id === 'esmolol')) return { msg: 'Rate-control first: target HR ≤ 60 and SBP 100–120 mmHg.', kind: 'good', noHarm: true };
      if (ev.type === 'inf' && ev.id === 'gtn' && ev.rate > 0 && !any(e, 'labetalol', 'esmolol')) return { msg: 'Vasodilator before β-blockade → reflex tachycardia increases shear stress.', kind: 'warn' };
    },
    exam: ex({ C: 'Radial pulse delay on the left. Early diastolic murmur at the left sternal edge.', D: 'GCS 15. No focal deficit.', E: 'Abdomen soft.' }),
    inv: { bloods: (e) => labs(e, { trop: 18, extra: [['D-dimer', '4,800 ng/mL']] }), gas: true, ecg: { morph: { lvh: true }, note: 'no acute ST elevation (a normal ECG does not exclude dissection).' }, cxr: { media: 'cxr_normal', report: 'Widened mediastinum.' }, ct: [{ label: 'CT aortogram', media: null, report: 'Stanford type A dissection from the aortic root to the iliac bifurcation; small pericardial effusion.' }], pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Dilated aortic root (5.1 cm) with an intimal flap; small effusion.' }] },
    critical: [
      { text: 'Analgesia', check: (e) => e.flags.opioid },
      { text: 'IV β-blocker first (labetalol/esmolol) to HR ≤ 60', check: (e) => any(e, 'labetalol', 'esmolol') },
      { text: 'CT aortogram', check: (e) => e.did('inv_ct') },
      { text: 'Cardiothoracic surgery referral', check: (e) => e.flags.repaired },
      { text: 'No antiplatelets / anticoagulation / thrombolysis', check: (e) => !e.did('aspirin_load') && !e.did('alteplase') },
    ],
    targets: { map: 60, mapMax: 90, hrMax: 70 },
    hint: { steps: [
      { t: 'Hypertension → intimal tear', kind: 'cause' },
      { t: 'Blood propagates in the media; shear stress ∝ dP/dt', rx: 'β-blockade first (↓ HR & dP/dt)' },
      { t: 'Branch malperfusion, AR, tamponade', rx: 'Then vasodilator to SBP 100–120' },
      { t: 'Rupture into pericardium → tamponade', rx: 'Emergency surgery', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Suspect dissection with tearing pain, pulse/BP differentials, neurological deficit or a new AR murmur — CT aortogram (often with a triple-rule-out protocol).',
        'Impulse control: IV β-blocker first (labetalol or esmolol) to HR ≤ 60, then vasodilator if needed to SBP 100–120; strong analgesia.',
        'Type A → emergency cardiothoracic surgery; avoid antiplatelets, anticoagulants and thrombolysis.',
      ],
      refs: ['RCEM / HSSIB: Acute aortic dissection — national safety recommendations (2021)', 'ESC 2024 Guidelines for peripheral arterial and aortic diseases', 'Royal College of Emergency Medicine: Aortic dissection learning resources'],
    },
  });

  // =====================================================================
  // Hypertensive emergency
  // =====================================================================
  add({
    id: 'em-htn-emergency', title: 'Severe hypertension with confusion', field: 'EM', shock: null, category: 'Hypertensive emergency', difficulty: 2, setting: 'ed',
    stem: '46-year-old man who stopped his antihypertensives months ago. Two days of headache and vomiting, now confused. BP 230/135. Fundoscopy: bilateral papilloedema and flame haemorrhages.',
    patient: { age: 46, sex: 'M', weight: 96, vasoplegia: 2.7, hrBase: 84, gcs: 13, lactate: 1.4, look: {} },
    init(e) { e.flags.start = null; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.start == null) f.start = p.map;
      p.gcs = p.map > 150 ? 13 : 15;
      if (p.map < f.start * 0.65 && !f.tooFast) { f.tooFast = true; e.harm('MAP reduced by more than 25–35% — risk of cerebral/renal ischaemia'); }
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'labetalol' && e.p.map > 140) return { msg: 'Labetalol bolus. In hypertensive emergency a titratable infusion is preferred.', kind: 'info' };
    },
    exam: ex({ C: 'Bounding pulse. Heaving apex.', D: (e) => `GCS ${e.p.gcs}, disorientated. No focal deficit. Papilloedema.`, E: 'Afebrile.' }),
    inv: { bloods: (e) => labs(e, { urea: 14, cr: 228, egfr: 28, plt: 110, extra: [['Blood film', 'Schistocytes (MAHA)'], ['Urine dipstick', 'Protein 3+, blood 2+']] }), gas: true, ecg: { morph: { lvh: true } }, cxr: cxrN, ct: [{ label: 'CT head', media: 'ct_head', report: 'No haemorrhage. Subtle bilateral parieto-occipital white-matter low density — consider PRES; MRI recommended.' }], pocus: [] },
    critical: [
      { text: 'Titratable IV antihypertensive (labetalol / GTN infusion)', check: (e) => e.rate('labetalol') > 0 || e.rate('gtn') > 0 },
      { text: 'Arterial line', check: (e) => e.p.artLine },
      { text: 'CT head (exclude haemorrhage)', check: (e) => e.did('inv_ct') },
      { text: 'Controlled reduction — no more than ~25% in the first hour', check: (e) => !e.flags.tooFast },
    ],
    targets: { map: 115, mapMax: 150 },
    hint: { steps: [
      { t: 'Severe uncontrolled hypertension', kind: 'cause' },
      { t: 'Cerebral autoregulation overwhelmed → hyperperfusion, oedema (encephalopathy/PRES)', rx: 'Labetalol infusion' },
      { t: 'Autoregulation curve is shifted right', rx: 'Lower MAP by ≤ 25% in 1 h' },
      { t: 'Too-rapid fall → watershed ischaemia', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Hypertensive emergency = severe BP with acute target-organ damage (encephalopathy, AKI, MAHA, retinopathy, heart failure, dissection).',
        'Admit to a monitored area with an arterial line; use a titratable IV agent (labetalol, GTN; nicardipine/clevidipine in some centres).',
        'Reduce MAP by no more than ~25% in the first hour, then towards 160/100 over 2–6 h (exceptions: dissection, pre-eclampsia, phaeochromocytoma).',
      ],
      refs: ['NICE NG136: Hypertension in adults (2019, updated 2023) — accelerated hypertension referral', 'ESC/ESH 2023 Guidelines for arterial hypertension — hypertensive emergencies (endorsed by the British and Irish Hypertension Society)'],
    },
  });

  // =====================================================================
  // Autonomic dysreflexia
  // =====================================================================
  add({
    id: 'icu-autonomic-dysreflexia', title: 'Pounding headache after spinal injury', field: 'ICU', shock: null, category: 'Hypertensive emergency', difficulty: 1, setting: 'ward',
    stem: 'Outreach call: 31-year-old man with a complete T4 spinal cord injury (2 years ago) admitted for a pressure sore. Sudden pounding headache, flushed and sweaty above the nipples, BP 190/105 (his usual is 95/60), HR 46.',
    patient: { age: 31, sex: 'M', weight: 70, vasoplegia: 2.9, hrBase: 46, baro: 0.3, lactate: 1.0, look: { flush: 0.5, sweaty: true } },
    tick(e, dt) { const p = e.p; if (e.flags.relieved) p.vasoplegia = toward(p.vasoplegia, 0.85, 0.02, dt); else p.vasoplegia = Math.min(3.3, p.vasoplegia + 0.0005 * dt); },
    extraActions: [{ id: 'ad_sit', name: 'Sit upright, lower legs, loosen clothing' }, { id: 'ad_catheter', name: 'Check catheter — flush / replace' }, { id: 'ad_bowel', name: 'Check for faecal loading (lidocaine gel)' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'ad_sit') return { handled: true, msg: 'Sat upright, legs down, tight leg bag straps loosened — BP drops slightly.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'ad_catheter') { e.flags.relieved = true; return { handled: true, msg: 'The catheter is kinked under the leg and blocked with debris. Replaced (lidocaine gel) — 900 mL of urine drains. Headache easing.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'ad_bowel') return { handled: true, msg: 'Rectum empty.' };
      if (ev.type === 'inf' && ev.id === 'gtn' && ev.rate > 0) return { msg: 'GTN while you look for the trigger (nifedipine 10 mg bite-and-swallow is an alternative).', kind: 'good', noHarm: true };
      if (ev.type === 'drug' && ev.id === 'atropine') return { msg: 'Bradycardia is reflex vagal — it will resolve when the trigger is removed.', kind: 'info' };
    },
    exam: ex({ C: 'Bradycardic, bounding. Pale and cool below the lesion; flushed above.', D: 'GCS 15, severe headache, blurred vision.', E: 'Abdomen: distended, dull suprapubic area. Catheter bag empty.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'Bladder scan', media: null, report: 'Bladder volume ~900 mL.' }] },
    critical: [
      { text: 'Sit upright, loosen clothing', check: (e) => e.did('ad_sit') },
      { text: 'Find and remove the trigger (catheter)', check: (e) => e.flags.relieved },
    ],
    targets: { map: 60, mapMax: 100 },
    hint: { steps: [
      { t: 'Noxious stimulus below the lesion (blocked catheter)', kind: 'cause', rx: 'Remove trigger' },
      { t: 'Unchecked spinal sympathetic reflex → vasoconstriction below T6', rx: 'Sit up (orthostatic pooling)' },
      { t: 'Baroreceptors → vagal bradycardia & vasodilation above lesion only', rx: 'GTN / nifedipine if persists' },
      { t: 'Stroke, seizure, MI', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Autonomic dysreflexia occurs with injuries at or above T6: a stimulus below the level triggers uncontrolled sympathetic vasoconstriction.',
        'Sit the patient up, loosen clothing, and look for the trigger — bladder first (catheter), then bowel, skin, ingrown toenail.',
        'If SBP remains > 150 mmHg: GTN or nifedipine; monitor for rebound hypotension when the trigger is removed.',
      ],
      refs: ['Multidisciplinary Association of Spinal Cord Injured Professionals (MASCIP): Autonomic dysreflexia guidance', 'NICE NG41: Spinal injury — assessment and initial management'],
    },
  });

  // =====================================================================
  // Adult DKA
  // =====================================================================
  add({
    id: 'em-dka-adult', title: 'Diabetic ketoacidosis (adult)', field: 'EM', shock: 'Hypovolaemic (osmotic diuresis)', difficulty: 2, setting: 'ed',
    stem: '24-year-old woman with type 1 diabetes, vomiting for 24 hours with abdominal pain, has not taken insulin. Kussmaul breathing. Capillary glucose 28, ketones 6.1, BP 86/52.',
    patient: { age: 24, sex: 'F', weight: 60, vol: 0.78, extraAcid: 17, glucose: 28, k: 5.6, na: 131, lactate: 2.2, gcs: 14, look: {} },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      const ins = e.rate('insulin_inf') > 0 && !f.ivDown ? clamp(e.rate('insulin_inf') / 0.1, 0, 1) : 0;
      if (ins > 0) { p.extraAcid = Math.max(2, p.extraAcid - 0.035 * ins * dt); p.glucose = Math.max(f.dex ? 8 : 1.8, p.glucose - (f.dex ? 0.02 : 0.06) * ins * dt); p.k = Math.max(2.3, p.k - (f.kcl ? 0.001 : 0.006) * ins * dt); }
      else { p.extraAcid = Math.min(24, p.extraAcid + 0.004 * dt); p.vol = Math.max(0.65, p.vol - 0.00015 * dt); }
      if (f.kcl) p.k = Math.min(5.2, p.k + 0.0015 * dt);
      if (p.glucose < 3.5 && !f.hypo) { f.hypo = true; e.harm('Iatrogenic hypoglycaemia — add 10% glucose when glucose < 14 mmol/L'); p.gcs = 10; }
      if (p.k < 2.8 && !f.hypok) { f.hypok = true; e.harm('Severe hypokalaemia — potassium not replaced'); p.rhythm = 'vt'; p.fixedRate = 190; e.after(12, (en) => { en.p.rhythm = 'sinus'; }); }
      p.gcs = f.hypo && p.glucose < 3.5 ? 10 : p.ph < 7.1 ? 14 : 15;
    },
    extraActions: [{ id: 'add_kcl', name: 'Add KCl 40 mmol/L to fluids' }, { id: 'add_dex', name: 'Add 10% glucose 125 mL/h alongside saline' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'add_kcl') { if (e.p.k > 5.5) return { handled: true, harm: 'Potassium added with K⁺ > 5.5 mmol/L' }; e.flags.kcl = true; return { handled: true, msg: 'KCl 40 mmol/L added to the 0.9% saline.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'add_dex') { e.flags.dex = true; if (e.p.glucose > 14) return { handled: true, msg: '10% glucose started (usually when glucose < 14 mmol/L).', kind: 'info' }; return { handled: true, msg: '10% glucose at 125 mL/h alongside 0.9% saline; continue the FRIII.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'bicarbonate') return { harm: 'Bicarbonate in DKA' };
      if (ev.type === 'drug' && ev.id === 'insulin_glucose') return { harm: 'Insulin bolus — use a fixed-rate infusion' };
      if (ev.type === 'inf' && ev.id === 'insulin_inf' && ev.rate > 0.11) return { harm: 'Insulin above 0.1 units/kg/h' };
    },
    exam: ex({ B: 'Deep sighing respiration, ketotic breath.', C: 'Dry mucous membranes, cool peripheries, CRT 4 s.', E: 'Diffuse abdominal tenderness, no peritonism.' }),
    inv: { bloods: (e) => labs(e, { urea: 11, cr: 128, wcc: 16.2, extra: [['Blood ketones', `${Math.max(0.3, e.p.extraAcid / 2.8).toFixed(1)} mmol/L`], ['hCG', 'Negative']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Collapsing IVC.' }] },
    critical: [
      { text: 'Fluid: 500 mL 0.9% over 15 min (SBP < 90), then 1 L/h', check: (e) => fluidL(e) >= 1 },
      { text: 'Fixed-rate IV insulin 0.1 units/kg/h', check: (e) => e.rate('insulin_inf') > 0 },
      { text: 'Potassium replacement once K⁺ < 5.5', check: (e) => e.flags.kcl },
      { text: 'Add 10% glucose when glucose < 14', check: (e) => e.flags.dex },
      { text: 'No bicarbonate', check: (e) => !e.did('bicarbonate') },
    ],
    targets: { map: 65, phMin: 7.2, kMin: 3.5, gluMin: 4 },
    hint: { steps: [
      { t: 'Insulin omission ± intercurrent illness', kind: 'cause', rx: 'FRIII 0.1 units/kg/h' },
      { t: 'Ketogenesis → metabolic acidosis', rx: 'Insulin switches off ketogenesis' },
      { t: 'Osmotic diuresis → hypovolaemia; total-body K⁺ depletion', rx: '0.9% saline; KCl once K⁺ < 5.5' },
      { t: 'Insulin drives glucose & K⁺ into cells', rx: '10% glucose when < 14; monitor K⁺ hourly' },
      { t: 'Arrhythmia, hypoglycaemia, cerebral oedema', kind: 'end' },
    ] },
    debrief: {
      points: [
        'JBDS 2023: if SBP < 90 give 500 mL 0.9% saline over 10–15 min (repeat), then 1 L over the first hour; FRIII 0.1 units/kg/h; continue long-acting basal insulin.',
        'Add KCl 40 mmol/L when K⁺ 3.5–5.5; senior review if < 3.5. Add 10% glucose at 125 mL/h when glucose < 14 mmol/L.',
        'Resolution: ketones < 0.6 mmol/L and pH > 7.3. Bicarbonate is not recommended.',
      ],
      refs: ['Joint British Diabetes Societies for Inpatient Care: The management of diabetic ketoacidosis in adults (2023)', 'NICE NG17: Type 1 diabetes in adults (2022)'],
    },
  });

  // =====================================================================
  // Alcohol withdrawal seizure
  // =====================================================================
  add({
    id: 'em-alcohol-withdrawal', title: 'Seizure in the waiting room', field: 'EM', shock: null, category: 'Neurological / toxicology', difficulty: 1, setting: 'ed',
    stem: '48-year-old man brought in tremulous and sweating, last drink 36 hours ago (usually 2 bottles of wine a day). In the waiting room he has a generalised tonic–clonic seizure lasting 4 minutes so far.',
    patient: { age: 48, sex: 'M', weight: 68, stress: 0.4, glucose: 3.0, temp: 37.8, effort: 0.7, lactate: 3.8, gcs: 3, look: { sweaty: true } },
    init(e) { e.flags.seizing = true; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.seizing) { p.lacGen = 0.001; p.vo2 = 1.3; if (any(e, 'lorazepam', 'midazolam') && e.t - Math.min(...['lorazepam', 'midazolam'].map((d) => e.firstTime(d) ?? 1e9)) > 12) { f.seizing = false; e.say('Seizure stops.', 'good'); } }
      else { p.lacGen = 0; p.vo2 = 1; p.stress = any(e, 'lorazepam', 'midazolam') && e.t - (f.lastBz || 0) < 120 ? 0.1 : 0.4; }
      p.gcs = f.seizing ? 3 : p.glucose < 3.5 ? 11 : 13;
    },
    extraActions: [{ id: 'pabrinex', name: 'IV Pabrinex (high-dose thiamine)' }, { id: 'ciwa', name: 'CIWA-Ar score; symptom-triggered chlordiazepoxide' }],
    onEvent(e, ev) {
      if (ev.type === 'drug' && (ev.id === 'lorazepam' || ev.id === 'midazolam')) { e.flags.lastBz = e.t; return { msg: 'Benzodiazepine given.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'pabrinex') { e.flags.thiamine = true; return { handled: true, msg: 'Pabrinex 2 pairs IV TDS (Wernicke’s prophylaxis/treatment).', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'ciwa') return { handled: true, msg: 'CIWA-Ar 24: symptom-triggered chlordiazepoxide prescribed.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'glucose') { e.p.glucose = 6.5; if (!e.flags.thiamine) return { msg: 'Glucose 6.5 now — give thiamine as soon as possible (do not delay glucose for it).', kind: 'warn' }; return { msg: 'Glucose 6.5 mmol/L.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'phenytoin') return { msg: 'Phenytoin is ineffective for withdrawal seizures — benzodiazepines are the treatment.', kind: 'warn' };
    },
    exam: ex({ A: (e) => (e.flags.seizing ? 'Snoring, trismus.' : 'Patent.'), C: 'Tachycardic, sweaty.', D: (e) => (e.flags.seizing ? 'Generalised tonic–clonic seizure.' : `GCS ${e.p.gcs}, post-ictal. Coarse tremor. Nystagmus.`), E: 'Spider naevi, palmar erythema. Smells of alcohol.' }),
    inv: { bloods: (e) => labs(e, { na: 131, plt: 96, alt: 84, extra: [['Magnesium', '0.58 mmol/L'], ['Phosphate', '0.6 mmol/L'], ['Ethanol', '<10 mg/dL']] }), gas: true, ecg: { morph: { qtc: 0.47 } }, cxr: cxrN, ct: [{ label: 'CT head', media: 'ct_head', report: 'Generalised atrophy; no haemorrhage.' }], pocus: [] },
    critical: [
      { text: 'Benzodiazepine to terminate seizure', check: (e) => any(e, 'lorazepam', 'midazolam') },
      { text: 'Check and treat glucose', check: (e) => e.did('glucose') },
      { text: 'IV Pabrinex (thiamine)', check: (e) => e.flags.thiamine },
      { text: 'Ongoing withdrawal management (CIWA)', check: (e) => e.did('ciwa') },
    ],
    targets: { spo2: 94, map: 65, gluMin: 4 },
    hint: { steps: [
      { t: 'Chronic alcohol → GABA-A down-regulation, NMDA up-regulation', kind: 'cause' },
      { t: 'Abrupt cessation → CNS hyperexcitability (6–48 h)', rx: 'Benzodiazepine' },
      { t: 'Seizures; delirium tremens later (48–72 h)', rx: 'Symptom-triggered chlordiazepoxide' },
      { t: 'Thiamine deficiency → Wernicke’s', rx: 'IV Pabrinex' },
      { t: 'Status epilepticus, DTs, death', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE CG100: treat alcohol withdrawal seizures with a quick-acting benzodiazepine (e.g. lorazepam); offer symptom-triggered chlordiazepoxide.',
        'Give parenteral thiamine (Pabrinex) to anyone at risk of Wernicke’s — do not delay glucose for hypoglycaemia.',
        'Check glucose, electrolytes (Mg, phosphate) and consider CT head after trauma or a first/atypical seizure.',
      ],
      refs: ['NICE CG100: Alcohol-use disorders — diagnosis and management of physical complications (2010, updated 2017)', 'NICE NG217: Epilepsies — status epilepticus'],
    },
  });

  // =====================================================================
  // Neutropenic sepsis
  // =====================================================================
  add({
    id: 'em-neutropenic-sepsis', title: 'Fever after chemotherapy', field: 'EM', shock: 'Distributive (septic)', difficulty: 2, setting: 'ed',
    stem: '38-year-old woman, day 10 after her second cycle of chemotherapy for breast cancer. Rigors at home, temperature 39.0 °C. Pale and shivering. BP 84/46. She has a PICC line.',
    patient: { age: 38, sex: 'F', weight: 62, vasoplegia: 0.45, vol: 0.82, leak: 0.0006, lactate: 3.6, lacGen: 0.0018, temp: 39.0, hrBase: 90, look: {} },
    tick(e, dt) {
      const p = e.p, t0 = e.firstTime('antibiotics');
      if (t0 != null && e.t - t0 > 40) { p.vasoplegia = toward(p.vasoplegia, 0.66, 0.01, dt); p.lacGen = 0; p.leak = 0.0002; }
      else p.vasoplegia = Math.max(0.28, p.vasoplegia - 0.0004 * dt);
      if (t0 == null && e.t > 60 && !e.flags.late) { e.flags.late = true; e.harm('Antibiotics not given within 1 hour of arrival (neutropenic sepsis door-to-needle)'); }
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'antibiotics') return { msg: 'Piperacillin–tazobactam 4.5 g IV (per local neutropenic sepsis policy).', kind: 'good' };
      if (ev.type === 'inv' && ev.id === 'bloods' && !e.did('antibiotics')) return { msg: 'Do not wait for the neutrophil count — treat empirically.', kind: 'warn' };
    },
    exam: ex({ B: 'Clear chest.', C: 'Warm peripheries, bounding pulse. PICC site: mild erythema.', D: 'GCS 15.', E: (e) => `T ${e.p.temp.toFixed(1)} °C. Mouth ulcers. Alopecia.` }),
    inv: { bloods: (e) => labs(e, { wcc: 0.4, neut: 0.1, plt: 64, hb: 92, crp: 182, extra: [['Blood cultures', 'Peripheral + PICC lumens'], ['Procalcitonin', '6.1 µg/L']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Collapsing IVC.' }, { label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Hyperdynamic LV.' }] },
    critical: [
      { text: 'Empirical antibiotics within 1 hour (piperacillin–tazobactam)', check: (e) => e.did('antibiotics') && !e.flags.late },
      { text: 'Fluid resuscitation', check: (e) => fluidL(e) >= 1 },
      { text: 'Vasopressor if hypotension persists', check: (e) => fluidL(e) < 2 || vaso(e) },
      { text: 'Blood cultures (peripheral and line)', check: (e) => e.did('inv_bloods') },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'Chemotherapy → neutropenia + mucositis + indwelling line', kind: 'cause', rx: 'Antibiotics within 1 h' },
      { t: 'Bacteraemia (Gram-negatives incl. Pseudomonas)', rx: 'Piperacillin–tazobactam' },
      { t: 'Vasodilatation + capillary leak', rx: 'Fluids, noradrenaline' },
      { t: 'Septic shock, multi-organ failure', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE CG151: treat suspected neutropenic sepsis as an emergency — piperacillin–tazobactam within 1 hour of arrival, without waiting for the FBC.',
        'Take peripheral and line cultures; assess with NEWS2/MASCC; involve acute oncology.',
        'Standard septic shock resuscitation applies (NICE NG51; HSE NCG 26 in Ireland).',
      ],
      refs: ['NICE CG151: Neutropenic sepsis — prevention and management in people with cancer (2012)', 'NICE NG51: Suspected sepsis (2024)', 'HSE National Clinical Guideline No. 26: Sepsis Management for Adults (2021)'],
    },
  });

  // =====================================================================
  // Intra-abdominal sepsis on steroids (Crohn's)
  // =====================================================================
  add({
    id: 'em-crohns-sepsis', title: 'Abdominal pain and shock in Crohn’s disease', field: 'EM', shock: 'Distributive (septic)', difficulty: 3, setting: 'ed',
    stem: '29-year-old man with Crohn’s disease on prednisolone 20 mg daily and azathioprine. Five days of worsening right-sided abdominal pain, now rigid abdomen, fever and BP 82/40. He stopped his prednisolone 3 days ago because of vomiting.',
    patient: { age: 29, sex: 'M', weight: 64, vasoplegia: 0.42, vol: 0.8, leak: 0.0006, catecholResp: 0.45, lactate: 4.4, lacGen: 0.0018, temp: 38.7, hrBase: 92, na: 132, glucose: 4.1, look: {} },
    tick(e, dt) {
      const p = e.p, f = e.flags, ab = e.firstTime('antibiotics'), hc = e.firstTime('hydrocortisone');
      if (hc != null && e.t - hc > 25) p.catecholResp = toward(p.catecholResp, 1, 0.01, dt);
      if (ab != null && e.t - ab > 40 && f.source) { p.vasoplegia = toward(p.vasoplegia, 0.75, 0.01, dt); p.lacGen = 0; p.leak = 0.0002; }
      else if (ab != null && e.t - ab > 40) p.vasoplegia = Math.max(0.35, p.vasoplegia - 0.0001 * dt);
      else p.vasoplegia = Math.max(0.28, p.vasoplegia - 0.0004 * dt);
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && (ev.id === 'source_control' || ev.id === 'theatre')) { if (!e.did('inv_ct')) return { handled: true, msg: 'Surgical registrar: CT first please — is this perforation or an abscess?' }; e.flags.source = true; return { handled: true, msg: 'Emergency laparotomy: perforated terminal ileum with faecal contamination — resected, washout, stoma.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'hydrocortisone') return { msg: 'Hydrocortisone 100 mg IV — steroid cover for presumed adrenal insufficiency.', kind: 'good' };
      if (ev.type === 'inf' && ev.id === 'noradrenaline' && ev.rate > 0.4 && !e.did('hydrocortisone')) return { msg: 'Poor response to noradrenaline — he is steroid-dependent and has missed doses.', kind: 'warn' };
    },
    exam: ex({ B: 'Shallow breathing (pain).', C: 'Warm, bounding.', D: 'GCS 15.', E: (e) => `T ${e.p.temp.toFixed(1)} °C. Board-like rigidity, guarding RIF. Previous laparotomy scar.` }),
    inv: { bloods: (e) => labs(e, { wcc: 18.6, crp: 310, alb: 24, extra: [['Random cortisol', 'Sent']] }), gas: true, ecg: {}, cxr: { media: 'cxr_normal', report: 'Erect CXR: free air under the right hemidiaphragm.' }, ct: [{ label: 'CT abdomen/pelvis', media: null, report: 'Free gas and fluid; thickened terminal ileum with a contained perforation and 6 cm pelvic collection.' }], pocus: [{ label: 'FAST', media: 'us_fast_pos', report: 'Free fluid in the pelvis.' }] },
    critical: [
      { text: 'Antibiotics within 1 hour', check: (e) => e.did('antibiotics') },
      { text: 'Fluids and vasopressor', check: (e) => fluidL(e) >= 1 && vaso(e) },
      { text: 'Hydrocortisone (steroid-dependent)', check: (e) => e.did('hydrocortisone') },
      { text: 'CT then source control (surgery)', check: (e) => e.flags.source },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'Crohn’s perforation → faecal peritonitis', kind: 'cause', rx: 'Antibiotics; source control' },
      { t: 'Septic vasodilatation', rx: 'Fluids, noradrenaline' },
      { t: 'Chronic steroids + missed doses → HPA suppression', rx: 'Hydrocortisone 100 mg' },
      { t: 'Catecholamine-refractory shock', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Patients on long-term steroids who miss doses or are acutely unwell need hydrocortisone 100 mg IV (NHS Steroid Emergency Card).',
        'Steroids and immunosuppression mask peritonism — maintain a low threshold for CT.',
        'Sepsis needs source control: NCEPOD/NELA standards — antibiotics within 1 h and surgery within the timeframe set by urgency.',
      ],
      refs: ['Society for Endocrinology: Adrenal crisis emergency guidance (2020/2023)', 'NHS England National Patient Safety Alert: Steroid Emergency Card (2020)', 'NICE NG51: Suspected sepsis (2024)', 'National Emergency Laparotomy Audit (NELA) standards'],
    },
  });

  // =====================================================================
  // Toxic shock syndrome
  // =====================================================================
  add({
    id: 'em-toxic-shock', title: 'Fever, rash and shock in a young woman', field: 'EM', shock: 'Distributive (toxin-mediated)', difficulty: 2, setting: 'ed',
    stem: '21-year-old woman, 24 hours of high fever, vomiting, diarrhoea and myalgia. She is on day 3 of her period. Diffuse red rash like sunburn. BP 78/40.',
    patient: { age: 21, sex: 'F', weight: 58, vasoplegia: 0.38, vol: 0.78, leak: 0.0009, lactate: 4.0, lacGen: 0.0018, temp: 39.6, hrBase: 96, look: { flush: 0.6 } },
    tick(e, dt) {
      const p = e.p, f = e.flags, ab = e.firstTime('antibiotics');
      const cont = f.removed ? 0 : 1, tox = f.clinda ? 0.5 : 1;
      if (ab != null && e.t - ab > 30 && f.removed) { p.vasoplegia = toward(p.vasoplegia, 0.75, 0.008 / tox, dt); p.lacGen = 0; p.leak = 0.0002; }
      else p.vasoplegia = Math.max(0.25, p.vasoplegia - 0.0004 * cont * dt);
    },
    extraActions: [{ id: 'tss_remove', name: 'Speculum examination — remove retained tampon' }, { id: 'tss_clinda', name: 'Add clindamycin (anti-toxin)' }, { id: 'tss_ivig', name: 'Consider IV immunoglobulin (microbiology)' }],
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'tss_remove') { e.flags.removed = true; return { handled: true, msg: 'Retained tampon removed (sent for culture).', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'tss_clinda') { e.flags.clinda = true; return { handled: true, msg: 'Clindamycin 1.2 g IV QDS added to flucloxacillin/broad-spectrum cover — suppresses toxin production.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'tss_ivig') return { handled: true, msg: 'Microbiology agree IVIG for refractory toxic shock.', kind: 'good' };
    },
    exam: ex({ C: 'Warm, vasodilated.', D: 'GCS 14, drowsy.', E: (e) => `T ${e.p.temp.toFixed(1)} °C. Diffuse macular erythroderma, conjunctival injection, strawberry tongue.` }),
    inv: { bloods: (e) => labs(e, { wcc: 19, plt: 92, cr: 186, egfr: 31, bili: 38, crp: 290, extra: [['Creatine kinase', '3,800 U/L'], ['hCG', 'Negative']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'IVC', media: 'us_ivc_flat', report: 'Flat IVC.' }] },
    critical: [
      { text: 'Remove the source (retained tampon)', check: (e) => e.flags.removed },
      { text: 'Antibiotics including clindamycin', check: (e) => e.did('antibiotics') && e.flags.clinda },
      { text: 'Fluids and noradrenaline', check: (e) => fluidL(e) >= 1 && vaso(e) },
    ],
    targets: { map: 65 },
    hint: { steps: [
      { t: 'S. aureus colonising a retained tampon', kind: 'cause', rx: 'Remove source' },
      { t: 'Superantigen (TSST-1) → massive T-cell cytokine release', rx: 'Clindamycin (protein synthesis inhibitor); IVIG' },
      { t: 'Vasodilatation + capillary leak + multi-organ failure', rx: 'Fluids, noradrenaline' },
      { t: 'Refractory shock', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Toxic shock: fever, diffuse erythroderma, hypotension and multi-organ involvement — look for the source (tampon, wound, packing).',
        'Remove the source; give broad-spectrum antibiotics plus clindamycin to switch off toxin production; consider IVIG for severe streptococcal/staphylococcal TSS.',
        'Report and notify UKHSA for invasive group A streptococcal disease.',
      ],
      refs: ['UKHSA: Guidelines for the public health management of invasive group A streptococcal infections (2023)', 'NICE NG51: Suspected sepsis (2024)'],
    },
  });

  // =====================================================================
  // CAP with hypoxaemic respiratory failure
  // =====================================================================
  add({
    id: 'em-cap-hypoxia', title: 'Severe pneumonia with hypoxia', field: 'EM', shock: null, category: 'Respiratory', difficulty: 2, setting: 'ed',
    stem: '67-year-old man, 4 days of productive cough and fever, now confused. RR 36, SpO₂ 81% on air. Urea 9.8. BP 98/58. CURB-65 = 4.',
    patient: { age: 67, sex: 'M', weight: 78, shunt: 0.36, peepRecruit: 0.6, vasoplegia: 0.72, vol: 0.9, leak: 0.0002, lactate: 2.8, lacGen: 0.0006, temp: 38.9, rrBase: 30, gcs: 14, look: { sweaty: true } },
    tick(e, dt) {
      const p = e.p, ab = e.firstTime('antibiotics');
      if (ab != null && e.t - ab > 60) { p.shunt = Math.max(0.2, p.shunt - 0.0002 * dt); p.lacGen = 0; }
      else p.shunt = Math.min(0.5, p.shunt + 0.0002 * dt);
      if (!p.ventilated) { if (p.sa < 0.88) p.effort = Math.max(0.35, p.effort - 0.0012 * dt); else p.effort = Math.min(1, p.effort + 0.001 * dt); }
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'antibiotics') return { msg: 'Co-amoxiclav + clarithromycin IV (high-severity CAP).', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'hfno') return { handled: false, msg: 'HFNO 60 L/min FiO₂ 1.0 — reassess within 1 hour; early ICU referral.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'icu_referral') { e.flags.icu = true; }
    },
    exam: ex({ B: 'Bronchial breathing and coarse crackles right base. Tiring.', C: 'Warm peripheries.', D: (e) => `GCS ${e.p.gcs}, new confusion.`, E: (e) => `T ${e.p.temp.toFixed(1)} °C.` }),
    inv: { bloods: (e) => labs(e, { wcc: 21, crp: 286, urea: 9.8, extra: [['Legionella / pneumococcal urinary antigens', 'Sent']] }), gas: true, ecg: {}, cxr: { media: 'cxr_rll', report: 'Dense right lower-lobe consolidation with air bronchograms.' }, ct: [{ label: 'CT chest', media: 'ct_pneumonia', report: 'Right lower-lobe consolidation, small parapneumonic effusion.' }], pocus: [{ label: 'Lung ultrasound (right base)', media: 'us_blines', report: 'Hepatisation with dynamic air bronchograms; B-lines.' }] },
    critical: [
      { text: 'Oxygen escalated to HFNO (target 94–98%)', check: (e) => e.did('hfno') || e.p.ventilated },
      { text: 'Antibiotics within 4 h (1 h if septic)', check: (e) => e.did('antibiotics') },
      { text: 'Chest X-ray', check: (e) => e.did('inv_cxr') },
      { text: 'ICU referral', check: (e) => e.did('icu_referral') },
    ],
    targets: { spo2: 92, map: 65 },
    hint: { steps: [
      { t: 'Pneumococcal lobar pneumonia', kind: 'cause', rx: 'Antibiotics' },
      { t: 'Alveoli filled with exudate → shunt', rx: 'HFNO (PEEP effect, high FiO₂)' },
      { t: 'High work of breathing → fatigue', rx: 'Early ICU referral; intubation if failing' },
      { t: 'Type 1 → type 2 respiratory failure → arrest', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE NG138/NG250 & BTS: high-severity CAP (CURB-65 3–5) — co-amoxiclav plus clarithromycin IV, within 4 h (1 h if septic).',
        'Target SpO₂ 94–98% (88–92% if at risk of hypercapnia); escalate to HFNO and involve critical care early.',
        'Signs of failure on HFNO (rising RR, falling SpO₂, exhaustion, ROX index) → intubation should not be delayed.',
      ],
      refs: ['NICE NG250: Pneumonia — diagnosis and management (2025) / NICE NG138', 'BTS Guideline for the management of community-acquired pneumonia in adults (2009, annotated 2015)', 'BTS Guideline for oxygen use in healthcare and emergency settings (2017)'],
    },
  });

  // =====================================================================
  // ACE-inhibitor angioedema
  // =====================================================================
  add({
    id: 'em-acei-angioedema', title: 'Tongue swelling without a rash', field: 'EM', shock: null, category: 'Airway', difficulty: 3, setting: 'ed',
    stem: '63-year-old Afro-Caribbean woman on ramipril. Woke with a swollen lip that has spread to her tongue over 3 hours. Now drooling with a muffled voice. No itch, no urticaria. Paramedics gave IM adrenaline 500 micrograms with no improvement.',
    patient: { age: 63, sex: 'F', weight: 82, stress: 0.4, look: { facialOedema: true } },
    init(e) { e.p.narrow = 0.45; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (f.secured) return;
      const slow = (f.icatibant ? 0.3 : 1) * (e.fluidIn.ffp > 0 ? 0.6 : 1);
      p.narrow = Math.min(1, p.narrow + 0.0016 * slow * dt);
      if (f.icatibant && e.t - f.icT > 60) p.narrow = Math.max(0.3, p.narrow - 0.002 * dt);
      p.effort = clamp(1 - p.narrow * 0.9, 0.05, 1); p.stress = p.narrow * 0.6;
      if (p.narrow >= 0.95) { p.airwayPatent = false; if (!f.obsMsg) { f.obsMsg = true; e.say('Complete airway obstruction!', 'bad'); } }
    },
    extraActions: [{ id: 'ae_ent', name: 'Call senior anaesthetist + ENT (difficult airway)' }, { id: 'ae_afoi', name: 'Awake fibreoptic / videolaryngoscopic intubation' }, { id: 'ae_icatibant', name: 'Icatibant 30 mg SC (or C1-esterase inhibitor)' }, { id: 'ae_nasendo', name: 'Nasendoscopy' }],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action' && ev.id === 'ae_ent') { f.help = true; return { handled: true, msg: 'Consultant anaesthetist and ENT on their way; front-of-neck access kit opened.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'ae_nasendo') return { handled: true, msg: p.narrow > 0.6 ? 'Massive tongue base and supraglottic oedema; glottis barely visible.' : 'Oedema of tongue and floor of mouth; supraglottis mildly swollen.' };
      if (ev.type === 'action' && ev.id === 'ae_icatibant') { f.icatibant = true; f.icT = e.t; return { handled: true, msg: 'Icatibant (bradykinin B2-receptor antagonist) given — may slow progression; not a substitute for securing the airway.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'ae_afoi') { if (!f.help) return { handled: true, msg: 'Get senior airway help and ENT before attempting this.', kind: 'warn' }; if (p.narrow > 0.9) return { handled: true, msg: 'Too swollen — no view. This is now CICO: front-of-neck access.', kind: 'bad' }; f.secured = true; p.ventilated = true; p.effort = 0; p.fio2 = 0.6; p.lastFio2 = 0.6; p.airwayPatent = true; e.flags.paralysed = true; return { handled: true, msg: 'Awake tracheal intubation (topicalised, sedated) with ENT scrubbed for FONA — tube confirmed with capnography.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'fona') { f.secured = true; }
      if (ev.type === 'action' && (ev.id === 'rsi_ketamine' || ev.id === 'rsi_propofol') && !f.secured) { if (p.narrow > 0.55) { p.effort = 0; p.airwayPatent = false; e.harm('Rapid sequence induction in a rapidly swelling airway (can’t intubate, can’t oxygenate)'); return { handled: true, msg: 'After induction: grade 4 view, can’t ventilate by mask — CICO!', kind: 'bad' }; } }
      if (ev.type === 'drug' && (ev.id === 'adrenaline_im' || ev.id === 'chlorphenamine' || ev.id === 'hydrocortisone')) return { msg: 'No response — this is bradykinin-mediated, not histamine-mediated.', kind: 'warn' };
    },
    exam: ex({ A: (e) => (e.flags.secured ? 'Tube secured.' : e.p.narrow > 0.8 ? 'Huge protruding tongue, stridor, drooling, cannot speak.' : 'Swollen tongue and lips, muffled voice, drooling.'), C: 'Normotensive.', D: 'GCS 15, frightened.', E: 'No urticaria.' }),
    inv: { bloods: (e) => labs(e, { extra: [['Mast cell tryptase', 'Normal'], ['C4', 'Normal']] }), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [] },
    critical: [
      { text: 'Early senior anaesthetic + ENT help', check: (e) => e.flags.help },
      { text: 'Secure the airway (awake intubation or FONA)', check: (e) => e.flags.secured },
      { text: 'Stop the ACE inhibitor (and consider icatibant / C1-INH / FFP)', check: (e) => e.flags.icatibant || e.fluidIn.ffp > 0 || e.did('stop_trigger') },
    ],
    targets: { spo2: 94, map: 65 },
    hint: { steps: [
      { t: 'ACE inhibition ↓ bradykinin breakdown', kind: 'cause', rx: 'Stop ACE-i' },
      { t: 'Bradykinin → vascular permeability (no histamine)', rx: 'Icatibant / C1-INH / FFP (limited evidence)' },
      { t: 'Progressive tongue/supraglottic oedema; adrenaline/steroids ineffective', rx: 'Senior airway team early' },
      { t: 'Complete obstruction / CICO', rx: 'Awake intubation; FONA', kind: 'end' },
    ] },
    debrief: {
      points: [
        'ACE-inhibitor angioedema is bradykinin-mediated: no urticaria or itch, and poor response to adrenaline, antihistamines and steroids.',
        'Assess with nasendoscopy and plan the airway early with senior anaesthetics and ENT; awake tracheal intubation with FONA backup (DAS).',
        'Icatibant or C1-esterase inhibitor may be considered (off-label); stop the ACE inhibitor permanently.',
      ],
      refs: ['Difficult Airway Society: Guidelines for awake tracheal intubation in adults (2020)', 'Difficult Airway Society 2015: unanticipated difficult intubation / CICO', 'MHRA/BNF: ACE inhibitors — angioedema'],
    },
  });

  // =====================================================================
  // PEA arrest — hypovolaemia (ALS)
  // =====================================================================
  add({
    id: 'em-pea-arrest', title: 'PEA arrest on the ward', field: 'EM', shock: 'Hypovolaemic (arrest)', difficulty: 2, setting: 'ward', als: true, arrestLimit: 420,
    stem: 'Cardiac arrest call: 71-year-old man, day 1 after an open right hemicolectomy, found unresponsive. The nurse says he has been increasingly tachycardic overnight and his drain has filled. Monitor shows sinus rhythm at 120 — no pulse.',
    patient: { age: 71, sex: 'M', weight: 74, rhythm: 'pea', peaRate: 120, vol: 0.5, hb: 70, bleed: 0.0004, lactate: 7, look: { wound: true } },
    arrestRhythm: () => 'pea',
    rosc(e) {
      const f = e.flags, ok = e.flags.cpr && e.did('adrenaline') && (e.fluidIn.rbc + e.fluidIn.crystalloid >= 1000) && f.found;
      if (ok) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 15) { e.p.vol = Math.max(e.p.vol, 0.72); return true; } }
      return false;
    },
    tick(e) { if (e.flags.ctrl) e.p.bleed = 0; },
    onEvent(e, ev) {
      if (ev.type === 'inv' && ev.id === 'pocus') e.flags.found = true;
      if (ev.type === 'action' && ev.id === 'theatre') { e.flags.ctrl = true; return { handled: true, msg: 'Surgeons: bleeding from the ileocolic pedicle — straight back to theatre.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'rhythm_check' && e.p.arrested) e.flags.found = e.flags.found || false;
      if (ev.type === 'drug' && ev.id === 'adrenaline' && e.p.arrested) return { msg: 'Adrenaline 1 mg IV — non-shockable rhythm: give as soon as access is available.', kind: 'good', noHarm: true };
    },
    exam: ex({ A: 'Bag-mask ventilation.', B: 'Bilateral chest rise.', C: (e) => (e.p.arrested ? 'No central pulse. Abdomen distended; drain full of fresh blood.' : 'Weak pulse.'), D: 'Unresponsive.', E: 'Laparotomy wound oozing.' }),
    inv: { bloods: (e) => labs(e, {}), gas: true, ecg: {}, cxr: cxrN, ct: [], pocus: [{ label: 'Subcostal (pulse check)', media: 'us_ivc_flat', report: 'Small hyperdynamic “kissing” ventricles; flat IVC; no effusion.' }, { label: 'FAST', media: 'us_fast_pos', report: 'Large volume free fluid.' }] },
    critical: [
      { text: 'High-quality CPR', check: (e) => e.did('cpr_on') },
      { text: 'Adrenaline 1 mg ASAP (non-shockable)', check: (e) => e.did('adrenaline') },
      { text: 'Identify cause (POCUS during pulse check — 4 Hs & 4 Ts)', check: (e) => e.flags.found },
      { text: 'Treat hypovolaemia: blood / fluid', check: (e) => e.fluidIn.rbc > 0 || e.fluidIn.crystalloid >= 1000 },
      { text: 'Definitive haemorrhage control', check: (e) => e.flags.ctrl },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Post-operative intra-abdominal haemorrhage', kind: 'cause', rx: 'Surgery' },
      { t: 'Severe hypovolaemia → no stroke volume (PEA)', rx: 'Blood & fluid via large-bore access' },
      { t: 'Electrical activity without output', rx: 'CPR + adrenaline 1 mg every 3–5 min' },
      { t: 'Death', kind: 'end' },
    ] },
    debrief: {
      points: [
        'PEA: start CPR, give adrenaline 1 mg as soon as possible, then every 3–5 min; check rhythm every 2 min.',
        'Survival depends on finding and treating the cause — 4 Hs (hypoxia, hypovolaemia, hypo/hyperkalaemia, hypothermia) and 4 Ts (thrombosis, tension, tamponade, toxins).',
        'Focused echo during pulse checks (≤ 10 s) helps identify hypovolaemia, tamponade or RV dilatation.',
      ],
      refs: ['Resuscitation Council UK: Adult Advanced Life Support (2021)', 'Resuscitation Council UK: Special circumstances (2021)'],
    },
  });

  // =====================================================================
  // Acute ischaemic stroke — thrombolysis
  // =====================================================================
  add({
    id: 'em-stroke', title: 'Acute stroke — thrombolysis decision', field: 'EM', shock: null, category: 'Neurological', difficulty: 2, setting: 'ed',
    stem: 'Pre-alert: 71-year-old woman, right-sided weakness and expressive dysphasia, last seen well 70 minutes ago. On arrival BP 208/112, glucose 7.2. NIHSS 14. Not anticoagulated.',
    patient: { age: 71, sex: 'F', weight: 66, vasoplegia: 1.65, hrBase: 82, rhythm: 'af', gcs: 14, look: {} },
    tick(e, dt) { const f = e.flags; if (f.lysed && !f.better && e.t - f.lysedT > 60) { f.better = true; e.say('Speech improving — NIHSS now 8.', 'good'); } },
    extraActions: [{ id: 'cta', name: 'CT angiogram (head & neck)' }, { id: 'thrombectomy', name: 'Refer for mechanical thrombectomy' }],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'drug' && ev.id === 'alteplase') {
        if (!e.did('inv_ct')) return { harm: 'Thrombolysis before CT excluded haemorrhage' };
        if (p.sbp > 185 || p.dbp > 110) return { harm: 'Thrombolysis with BP above 185/110 mmHg' };
        f.lysed = true; f.lysedT = e.t; return { msg: 'Alteplase 0.9 mg/kg (10% bolus, rest over 1 h) — or tenecteplase 0.25 mg/kg bolus.', kind: 'good' };
      }
      if (ev.type === 'action' && ev.id === 'cta') { f.cta = true; return { handled: true, msg: 'CTA: left M1 occlusion — large vessel occlusion.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'thrombectomy') { if (!f.cta) return { handled: true, msg: 'Neuro-interventional: please send the CTA.' }; f.mt = true; return { handled: true, msg: 'Accepted for mechanical thrombectomy — transfer to the neuroscience centre.', kind: 'good' }; }
    },
    exam: ex({ C: 'Irregularly irregular pulse.', D: (e) => (e.flags.better ? 'GCS 15. Mild dysphasia, right arm drift.' : 'GCS 14 (expressive dysphasia). Right face, arm and leg weakness (power 1–2/5). Left gaze preference.'), E: 'No head injury.' }),
    inv: { bloods: (e) => labs(e, { extra: [['INR', '1.0'], ['Platelets', '262']] }), gas: false, ecg: { note: 'new-onset AF — likely cardioembolic source.' }, cxr: cxrN, ct: [{ label: 'CT head (non-contrast)', media: 'ct_head', report: 'No haemorrhage. Hyperdense left MCA sign; ASPECTS 8.' }], pocus: [] },
    critical: [
      { text: 'CT head to exclude haemorrhage', check: (e) => e.did('inv_ct') },
      { text: 'Lower BP to < 185/110 before thrombolysis (labetalol)', check: (e) => any(e, 'labetalol', 'gtn') },
      { text: 'Thrombolysis (alteplase / tenecteplase) within 4.5 h', check: (e) => e.flags.lysed },
      { text: 'CTA and thrombectomy referral (LVO)', check: (e) => e.flags.mt },
    ],
    targets: { map: 75, mapMax: 140 },
    hint: { steps: [
      { t: 'New AF → cardioembolic occlusion of the left MCA', kind: 'cause' },
      { t: 'Ischaemic core + salvageable penumbra (time is brain)', rx: 'Thrombolysis within 4.5 h' },
      { t: 'High BP increases haemorrhagic transformation after lysis', rx: 'Labetalol to < 185/110' },
      { t: 'Large vessel occlusion', rx: 'Thrombectomy (up to 24 h if imaging favourable)', kind: 'end' },
    ] },
    debrief: {
      points: [
        'NICE NG128: thrombolysis (alteplase or tenecteplase) within 4.5 h of onset once haemorrhage is excluded; BP must be < 185/110 before treatment.',
        'Thrombectomy for proximal anterior circulation occlusion — within 6 h (or up to 24 h with favourable imaging) — CTA should be done with the first CT.',
        'Aim for door-to-needle < 60 min (SSNAP standard).',
      ],
      refs: ['NICE NG128: Stroke and TIA in over 16s — diagnosis and initial management (2019, updated 2022)', 'National Clinical Guideline for Stroke for the UK and Ireland (ICSWP, 2023)'],
    },
  });
})();
