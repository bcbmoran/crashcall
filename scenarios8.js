/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Scenario library — part 8: routine general anaesthesia for novices (Initial Assessment of Competence level).
 * Four complete anaesthetics, each practising induction, maintenance and emergence step by step:
 *   1. LMA + sevoflurane, spontaneous breathing (knee arthroscopy)
 *   2. Tracheal tube + sevoflurane + rocuronium, TOF-guided reversal (laparoscopic cholecystectomy)
 *   3. TIVA: propofol (Schnider) + remifentanil TCI, tracheal tube (laparoscopic gynaecology, high PONV risk)
 *   4. Inhalational induction for a needle-phobic adult, LMA (excision of forearm lipoma)
 * Each runs in "Routine" mode (the procedure only) or "With complications" (one problem per stage).
 * The anaesthetic model lives in ga.js. Guidance follows RCoA IAC / AAGBI–AoA monitoring, NAP5, WHO checklist,
 * DAS and the AoA Quick Reference Handbook. */
(function () {
  const S = window.Sim;
  const { add } = S.scnUtil;
  const G = S.GA;
  const d = (k) => (e) => !!e.ga.done[k];
  const did = (id) => (e) => e.did(id);
  const after = (e, id, t) => t != null && (e.done[id] || []).some((x) => x >= t);
  const anyAfter = (e, ids, t) => ids.some((id) => after(e, id, t));
  const comp = (e) => !e.ga.comp;
  const first = (e, id) => (e.done[id] || [])[0];
  const noHarm = (re) => (e) => !e.harms.some((h) => re.test(h));
  const opioidGiven = (e) => e.did('fentanyl') || e.did('alfentanil') || e.did('tciRemi');
  const KIT = { actions: ['call_help', 'resite_iv', 'stop_surgery', 'stop_insufflation', 'warming', 'art_line', 'plr', 'cpr', 'defib', 'rhythm_check'] };
  const NUDGE = { junior: 40, senior: 75 };
  const WHO = 'Anaesthetic assistant (ODP)';
  const REFS = [
    'Royal College of Anaesthetists: Initial Assessment of Competence (IAC) — 2021 curriculum, Stage 1',
    'AAGBI/AoA: Recommendations for standards of monitoring during anaesthesia and recovery (2021)',
    'Association of Anaesthetists: Checking anaesthetic equipment (2019)',
    'WHO Surgical Safety Checklist (UK version)',
    'NAP5: Accidental awareness during general anaesthesia (RCoA/AAGBI, 2014)',
    'Association of Anaesthetists Quick Reference Handbook (QRH)',
  ];
  const INV = {
    bloods: (e) => S.scnUtil.labs(e, {}),
    ecg: {},
    cxr: { media: 'cxr_normal', report: 'Normal chest radiograph.' }, ct: [], pocus: [],
  };

  // Shared steps
  const STEP = {
    machine: { text: 'Check the anaesthetic machine and equipment (AAGBI)', check: d('machine') },
    signin: { text: 'WHO Sign In', check: d('signin') },
    monitor: { text: 'Attach standard monitoring before induction (SpO₂, ECG, NIBP)', check: d('monitor') },
    nmt: { text: 'Attach the neuromuscular (TOF) monitor before giving rocuronium', check: (e) => e.ga.done.nmt && (!e.did('rocuronium') || e.ga.done.nmt <= first(e, 'rocuronium') + 0.5) },
    preox: { text: 'Pre-oxygenate on 100% O₂ until EtO₂ ≥ 0.9', check: d('preoxDone') },
    opioid: { text: 'Opioid co-induction (fentanyl 1–2 mcg/kg)', check: opioidGiven },
    induce: { text: 'Induce: propofol 2–2.5 mg/kg titrated to loss of eyelash reflex', check: d('phase_induction') },
    support: { text: 'Support the airway and ventilate if apnoeic (jaw thrust, Guedel, bag)', check: (e) => e.ga.done.jaw || e.ga.done.maskVent },
    sevoOn: { text: 'Start sevoflurane on the circuit', check: did('sevoOn') },
    lma: { text: 'Insert the i-gel only once deep enough (no eyelash reflex, jaw relaxed)', check: (e) => e.ga.done.lma && !e.ga.done.lmaLight },
    maskVent: { text: 'Confirm you can mask-ventilate before giving the muscle relaxant', check: d('maskVent') },
    roc: { text: 'Rocuronium 0.6 mg/kg once anaesthetised', check: (e) => e.did('rocuronium') && noHarm(/not anaesthetised/)(e) },
    intubate: { text: 'Intubate when TOF count is 0 (videolaryngoscope)', check: d('intubate') },
    confirm: { text: 'Confirm tube placement: sustained capnography + bilateral air entry', check: d('confirm') },
    vent: { text: 'Start mechanical ventilation (6–8 mL/kg, PEEP 5)', check: d('ventOn') },
    eyes: { text: 'Eyes taped, positioning, pressure areas, warming', check: d('eyes') },
    timeout: { text: 'WHO Time Out before knife to skin', check: d('timeout') },
    lowFlow: { text: 'Turn to low flow for maintenance (≤ 1.5 L/min), keep ~1 MAC', check: did('lowFlow'), nudgePh: ['induction', 'maintenance'] },
    noAware: { text: 'Keep anaesthesia deep enough throughout — no awareness, no movement', check: (e) => e.ga.done.surgeryDone && noHarm(/awareness/)(e) && !e.ga.done.moved },
    analgesia: { text: 'Multimodal analgesia before waking: paracetamol + an opioid', check: (e) => e.did('paracetamol') && (e.did('morphine') || anyAfter(e, ['fentanyl', 'alfentanil'], e.ga.done.timeout)) },
    ponv: { text: 'PONV prophylaxis (ondansetron ± dexamethasone)', check: (e) => e.did('ondansetron') || e.did('dexamethasone') },
    sevoOff: { text: 'End of surgery: vaporiser off, high flow (≥ 6 L/min) 100% O₂', check: (e) => e.did('sevoOff') && e.did('highFlowEnd') && e.ga.o2frac >= 0.9 },
    signout: { text: 'WHO Sign Out', check: d('signout') },
    reversal: { text: 'Check the TOF and reverse the block (sugammadex, or neostigmine if TOF count 4)', check: d('reversal') },
    suction: { text: 'Suction the oropharynx before extubation', check: d('suction') },
    extubate: { text: 'Extubate awake with TOF ratio ≥ 0.9', check: (e) => e.ga.done.extubate && noHarm(/tube removed before|residual neuromuscular/)(e) },
    lmaOut: { text: 'Remove the i-gel either deep or fully awake — never in stage 2', check: (e) => e.ga.done.lmaOut && noHarm(/stage 2/)(e) },
    recovery: { text: 'Transfer to recovery on O₂ with monitoring', check: d('toRecovery') },
    handover: { text: 'SBAR handover to the recovery nurse', check: d('handover') },
  };
  const step = (k, extra) => Object.assign({}, STEP[k], extra || {});
  const compStep = (text, check) => ({ text, check, skip: comp });

  const common = (cfg) => ({
    field: 'Anaes', setting: 'theatre', category: 'Routine anaesthesia', difficulty: 1, ga: cfg.ga || {},
    kit: cfg.kit || KIT, nudgeBy: NUDGE, nudgeWho: WHO, stableFor: 5, targets: { map: 65, spo2: 94 }, qrh: ['2-4', '2-6', '3-6', '2-2'],
    init(e) { G.setup(e, cfg.model); },
    tick(e, dt) { G.tick(e, dt); if (cfg.tick) cfg.tick(e, dt); },
    onEvent(e, ev) { return (cfg.onEvent && cfg.onEvent(e, ev)) || G.onEvent(e, ev); },
    exam: (e) => G.exam(e),
    inv: INV,
  });

  // =====================================================================
  // GA1. LMA + sevoflurane, spontaneous ventilation
  // =====================================================================
  add(Object.assign(common({
    ga: { exposure: 'Supine, right knee prepped, tourniquet on the thigh.' },
    model: {
      tourniquet: true, surgDur: 150, painNeed: 0.3,
      comps: { induction: 'hypotension', maintenance: 'light', emergence: 'laryngospasm' },
      signIn: 'WHO Sign In: Daniel Price, DOB confirmed; right knee arthroscopy, consented, site marked. No allergies. Mallampati 1, good mouth opening — not a predicted difficult airway. Fasted 8 h, low aspiration risk. Minimal blood loss.',
      timeOut: 'WHO Time Out: team introduced; right knee arthroscopy confirmed; no antibiotics needed; tourniquet to go up after Time Out. Surgeon: "About 10 minutes."',
    },
  }), {
    id: 'an-ga-lma-sevo', title: 'Routine GA 1: i-gel and sevoflurane (knee arthroscopy)',
    stem: '32-year-old man, 78 kg, ASA 1, for a day-case right knee arthroscopy. Fasted, no medical history, no allergies, good mouth opening. A 20G cannula is in the left hand. Plan: propofol induction, i-gel, spontaneous breathing on oxygen/air with sevoflurane, paracetamol and fentanyl for analgesia.',
    briefHow: 'Routine mode: work through each stage — checks, pre-oxygenation, induction, the i-gel, maintenance on sevoflurane, emergence and handover. Use the Anaesthetic tab for the machine and airway, and the Drugs tab for drugs.',
    briefComp: 'With complications: expect one problem in each stage — after induction, during surgery and on waking. Recognise it and manage it as you would in theatre.',
    patient: { age: 32, sex: 'M', weight: 78, hrBase: 66, mapNormal: 86 },
    critical: [
      step('machine'), step('signin'), step('monitor'), step('preox'), step('opioid'), step('induce'), step('support'),
      compStep('Treat post-induction hypotension (metaraminol / ephedrine, ± fluid, lighten if deep)', (e) => anyAfter(e, ['metaraminol', 'ephedrine', 'phenylephrine', 'fluid'], e.ga.done.comp_induction)),
      step('sevoOn'), step('lma'), step('eyes'), step('timeout'), step('lowFlow'),
      compStep('Joint distension: keep deep enough — if he moves, deepen (↑ sevo / propofol) and give analgesia', (e) => { const t = e.ga.done.comp_maintenance; return t != null && (anyAfter(e, ['fentanyl', 'alfentanil', 'propofol', 'ga_dial'], Math.max(t, e.ga.lastMove)) || (e.t - t > 32 && e.ga.lastMove < t)); }),
      step('analgesia'), step('ponv'), step('sevoOff'), step('signout'), step('lmaOut'),
      compStep('Laryngospasm on removal: 100% O₂, CPAP + Larson’s point; propofol 0.5 mg/kg; suxamethonium if it persists', (e) => e.ga.done.comp_emergence && !e.ga.laryngospasm && (e.ga.done.larson || after(e, 'propofol', e.ga.done.comp_emergence) || after(e, 'suxamethonium', e.ga.done.comp_emergence))),
      step('recovery'), step('handover'),
    ],
    hint: {
      steps: [
        { t: 'Before induction: machine check, Sign In, monitoring, IV, pre-oxygenation', rx: 'EtO₂ ≥ 0.9 on 100% O₂ with a tight mask seal' },
        { t: 'Induction: fentanyl 1–2 mcg/kg, then propofol 2–2.5 mg/kg titrated', rx: 'Expect apnoea — jaw thrust, Guedel, hand-ventilate' },
        { t: 'Sevoflurane on (~ 2–3% dial at higher flow) to bridge as the propofol wears off', rx: 'i-gel once the eyelash reflex is gone and the jaw is slack' },
        { t: 'Maintenance: ~ 1 MAC, low flow (≤ 1.5 L/min), spontaneous breathing', rx: 'Movement or tachycardia = too light for the stimulus → deepen ± opioid' },
        { t: 'Emergence: paracetamol + opioid, antiemetic, vaporiser off, high flow O₂', rx: 'Remove the i-gel fully awake (or deep) — never in stage 2', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'A routine anaesthetic is a sequence: check → Sign In → monitor → pre-oxygenate → induce → airway → maintain → Time Out → emergence → Sign Out → recovery handover.',
        'Pre-oxygenate until the end-tidal O₂ is ≥ 0.9 — it buys minutes of safe apnoea if the airway is difficult.',
        'Propofol causes apnoea and hypotension; be ready to support the airway and ventilate, and to give a vasopressor (metaraminol 0.5–1 mg or ephedrine 3–6 mg).',
        'Start the volatile early so it is reaching the brain as the propofol redistributes — otherwise the patient lightens just as surgery starts.',
        'Age-adjusted MAC for sevoflurane is ~2% at 40 years and falls ~6% per decade; ~1 MAC prevents movement in about half of patients — opioids reduce the requirement.',
        'Low fresh gas flow (≤ 1 L/min) once at a steady state saves volatile and reduces greenhouse-gas emissions; high flow is for wash-in and wash-out.',
        'Remove an LMA either deep (a deliberate technique) or fully awake — stimulating the airway in stage 2 provokes laryngospasm (QRH 3-6).',
      ],
      refs: REFS.concat(['AoA QRH 3-6 Laryngospasm and stridor', 'AoA QRH 2-4 Hypotension']),
    },
  }));

  // =====================================================================
  // GA2. Tracheal tube + sevoflurane + rocuronium, TOF-guided reversal
  // =====================================================================
  add(Object.assign(common({
    ga: { exposure: 'Supine, arms out, abdomen prepped for laparoscopy.' },
    model: {
      lap: true, surgDur: 170, painNeed: 0.4, slowRoc: true,
      comps: { induction: 'hypotension', maintenance: 'insuffBrady', emergence: 'residual' },
      signIn: 'WHO Sign In: Margaret Holt; laparoscopic cholecystectomy, consented. No allergies. Mallampati 2, normal neck — not predicted difficult. Fasted, no reflux. Group and save available.',
      timeOut: 'WHO Time Out: team introduced; laparoscopic cholecystectomy; co-amoxiclav given; surgeon expects ~45 minutes, low blood loss.',
    },
  }), {
    id: 'an-ga-ett-sevo', title: 'Routine GA 2: tracheal tube, sevoflurane and reversal (lap chole)',
    stem: '52-year-old woman, 70 kg, ASA 2 (well-controlled hypertension on amlodipine), for an elective laparoscopic cholecystectomy. No allergies, airway assessment normal. 20G cannula in situ. Plan: fentanyl–propofol induction, rocuronium, videolaryngoscopic intubation, ventilation with sevoflurane in O₂/air, TOF-guided reversal.',
    briefHow: 'Routine mode: practise a full anaesthetic with a tracheal tube — neuromuscular monitoring, rocuronium, intubation and confirmation, ventilation, then reversal guided by the train-of-four before extubation.',
    briefComp: 'With complications: one problem will appear after induction, one during the laparoscopy and one at the end. Recognise each and manage it.',
    patient: { age: 52, sex: 'F', weight: 70, hrBase: 72, mapNormal: 92 },
    critical: [
      step('machine'), step('signin'), step('monitor'), step('nmt'), step('preox'), step('opioid'), step('induce'),
      compStep('Treat post-induction hypotension (metaraminol / ephedrine, ± fluid)', (e) => anyAfter(e, ['metaraminol', 'ephedrine', 'phenylephrine', 'fluid'], e.ga.done.comp_induction)),
      step('maskVent'), step('roc'), step('sevoOn'), step('intubate'), step('confirm'), step('vent'), step('eyes'), step('timeout'), step('lowFlow'),
      compStep('Bradycardia on insufflation: ask the surgeon to release the pneumoperitoneum; glycopyrronium / atropine', (e) => e.ga.done.desufflate || anyAfter(e, ['glycopyrronium', 'atropine'], e.ga.done.comp_maintenance)),
      step('noAware'), step('analgesia'), step('ponv'), step('sevoOff'), step('signout'), step('reversal'),
      compStep('Deep residual block (TOF count 0–1): sugammadex 4 mg/kg — neostigmine cannot reverse it', (e) => e.total('sugammadex') >= 4 && e.ga.done.extubate && noHarm(/residual/)(e)),
      step('suction'), step('extubate'), step('recovery'), step('handover'),
    ],
    hint: {
      steps: [
        { t: 'Before induction: checks, Sign In, monitoring including the TOF monitor, pre-oxygenation', rx: 'Baseline TOF before any relaxant' },
        { t: 'Fentanyl, propofol — then check you can mask-ventilate', rx: 'Rocuronium 0.6 mg/kg and start sevoflurane at once' },
        { t: 'Intubate at TOF count 0; confirm with sustained capnography', rx: 'Ventilator on, low flow, ~1 MAC; keep the depth adequate — a paralysed patient can’t move to warn you (NAP5)' },
        { t: 'Laparoscopy: insufflation stimulates (vagal) and raises airway pressure', rx: 'Bradycardia → release the pneumoperitoneum; anticholinergic' },
        { t: 'End: analgesia, antiemetic, vaporiser off, high flow, TOF-guided reversal', rx: 'Extubate awake with TOF ratio ≥ 0.9', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Attach quantitative neuromuscular monitoring before giving a relaxant and use it until extubation — clinical signs (head lift, grip) miss residual block.',
        'Give rocuronium only once the patient is anaesthetised, and start the volatile (or TIVA) straight away: paralysis with too little anaesthetic is the commonest cause of awareness (NAP5).',
        'Confirm tracheal placement with sustained capnography — "no trace = wrong place".',
        'Reversal is guided by the TOF: sugammadex 2 mg/kg at TOF count ≥ 2, 4 mg/kg for deep block, 16 mg/kg immediately after an intubating dose. Neostigmine (+ glycopyrronium) only works once the block is recovering (TOF count 4).',
        'Extubate when awake, obeying, breathing regularly and with a TOF ratio ≥ 0.9.',
        'Pneumoperitoneum can cause profound vagal bradycardia: tell the surgeon to release the gas, then give an anticholinergic.',
      ],
      refs: REFS.concat(['Association of Anaesthetists: Recommendations for standards of monitoring (quantitative NMT, 2021)', 'AoA QRH 2-6 Bradycardia', 'Difficult Airway Society 2025 guidelines for unanticipated difficult tracheal intubation in adults']),
    },
  }));

  // =====================================================================
  // GA3. TIVA: propofol (Schnider) + remifentanil TCI
  // =====================================================================
  add(Object.assign(common({
    ga: { tci: true, exposure: 'Supine in Lloyd-Davies, arms tucked; the TIVA cannula is in the right forearm with an anti-reflux valve.' },
    model: {
      lap: true, surgDur: 160, painNeed: 0.4,
      comps: { induction: 'brady', maintenance: 'tissued', emergence: 'pain' },
      ivCheck: 'TIVA cannula: 18G in the right forearm, visible, flushing freely; propofol and remifentanil lines joined with an anti-reflux valve close to the cannula.',
      signIn: 'WHO Sign In: Sophie Ward; laparoscopic ovarian cystectomy, consented. No allergies. Previous severe PONV, non-smoker. Not predicted difficult airway. Fasted.',
      timeOut: 'WHO Time Out: team introduced; laparoscopic left ovarian cystectomy; antibiotics not required; ~ 40 minutes expected.',
    },
  }), {
    id: 'an-ga-tiva', title: 'Routine GA 3: TIVA with propofol and remifentanil TCI',
    stem: '28-year-old woman, 62 kg, ASA 1, for a laparoscopic ovarian cystectomy. She had severe post-operative nausea and vomiting after a previous anaesthetic and asks to avoid it. Non-smoker. Plan: total intravenous anaesthesia — propofol (Schnider, effect-site target) and remifentanil (Minto) TCI, rocuronium, tracheal tube, processed-EEG monitoring, double antiemetic prophylaxis.',
    briefHow: 'Routine mode: a TIVA anaesthetic. Set up the TCI pumps on the Anaesthetic tab, use processed-EEG (BIS) and TOF monitoring, keep the vaporiser off, and plan analgesia for when the remifentanil stops.',
    briefComp: 'With complications: a problem will arise at induction, during surgery and on waking — TIVA has its own particular hazards.',
    patient: { age: 28, sex: 'F', weight: 62, hrBase: 70, mapNormal: 84 },
    critical: [
      step('machine'), step('signin'), step('monitor'),
      { text: 'Processed-EEG (BIS) monitoring — essential with TIVA + muscle relaxant (NAP5)', check: (e) => e.ga.done.bis && (!e.did('rocuronium') || e.ga.done.bis <= first(e, 'rocuronium') + 0.5) },
      step('nmt'),
      { text: 'Check the TIVA cannula is visible and flushing, with an anti-reflux valve', check: d('ivCheck') },
      step('preox'),
      { text: 'Start remifentanil TCI (Ce 3–4 ng/mL)', check: did('tciRemi') },
      { text: 'Start propofol TCI (e.g. Schnider/Eleveld Ce 4–6 µg/mL, or Marsh Cp), titrate to loss of consciousness', check: (e) => e.did('tciProp') && e.ga.done.phase_induction },
      compStep('Remifentanil bradycardia: glycopyrronium / atropine (± reduce the remifentanil target)', (e) => anyAfter(e, ['glycopyrronium', 'atropine', 'tciRemi'], e.ga.done.comp_induction) && e.p.hr >= 45),
      step('maskVent'), step('roc'), step('intubate'), step('confirm'), step('vent'), step('eyes'), step('timeout'),
      { text: 'Maintain on TCI with the vaporiser off; depth index 40–60', check: (e) => e.ga.done.surgeryDone && !e.did('sevoOn') || (e.ga.comp && e.ga.done.surgeryDone) },
      compStep('TCI line occlusion / tissued cannula: re-site IV (bridge with sevoflurane if needed)', (e) => after(e, 'resite_iv', e.ga.done.comp_maintenance)),
      step('noAware'),
      { text: 'Longer-acting opioid (morphine 0.1–0.15 mg/kg) before stopping the remifentanil', check: (e) => e.did('morphine') && (!e.did('tciRemiOff') || first(e, 'morphine') <= first(e, 'tciRemiOff')) },
      { text: 'Paracetamol IV', check: did('paracetamol') },
      { text: 'Double PONV prophylaxis: ondansetron AND dexamethasone (Apfel high risk)', check: (e) => e.did('ondansetron') && e.did('dexamethasone') },
      { text: 'End of surgery: stop both TCI pumps; 100% O₂', check: (e) => e.did('tciPropOff') && e.did('tciRemiOff') && e.ga.o2frac >= 0.9 },
      step('signout'), step('reversal'), step('suction'), step('extubate'),
      compStep('Severe pain on waking: titrate morphine before handing over', (e) => after(e, 'morphine', e.ga.done.phase_emergence) || after(e, 'fentanyl', e.ga.done.phase_emergence) || (e.ga.done.handover && e.ga.pain <= 0.5)),
      step('recovery'), step('handover'),
    ],
    hint: {
      steps: [
        { t: 'TIVA set-up: dedicated visible cannula, anti-reflux valve, BIS and TOF monitoring', rx: 'If the drug isn’t reaching the patient, they are waking up' },
        { t: 'Remifentanil TCI 3–4 ng/mL, then propofol Schnider Ce 4–6 µg/mL', rx: 'Watch HR (remifentanil bradycardia) and BP' },
        { t: 'Rocuronium once asleep → intubate → ventilate; vaporiser stays off', rx: 'Depth index 40–60; adjust the propofol target' },
        { t: 'Remifentanil has no tail of analgesia', rx: 'Give morphine 0.1–0.15 mg/kg ~ 20 min before the end' },
        { t: 'End: double antiemetic, stop pumps, reverse to TOF ratio ≥ 0.9, extubate awake', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'TIVA is the technique of choice for patients at high risk of PONV, and avoids the greenhouse gases of volatile agents.',
        'With TIVA there is no end-tidal agent to tell you the drug is reaching the brain: use a dedicated, visible cannula with an anti-reflux valve and processed-EEG monitoring, especially with a muscle relaxant (NAP5, AoA/SIVA TIVA guidelines).',
        'Schnider targets the effect site (Ce) — the pump overshoots the plasma to get there faster; Marsh targets plasma (Cp) and the brain lags behind.',
        'Remifentanil is metabolised by plasma esterases (context-insensitive half-time ~ 3–4 min): when it stops, the analgesia stops — plan a longer-acting opioid in advance.',
        'Remifentanil commonly causes bradycardia and hypotension; glycopyrronium or a reduction in the target usually corrects it.',
        'A pump occlusion alarm or a swollen cannula site during TIVA is an awareness emergency: re-site the cannula, and if that is not immediate bridge with a volatile.',
      ],
      refs: REFS.concat(['Association of Anaesthetists & SIVA: Guidelines for the safe practice of total intravenous anaesthesia (TIVA) (2018)', 'Fourth consensus guidelines for the management of PONV (Gan et al., 2020)']),
    },
  }));

  // =====================================================================
  // GA4. Inhalational induction, needle-phobic adult
  // =====================================================================
  add(Object.assign(common({
    ga: { exposure: 'Supine, left arm on an arm board.' },
    kit: { actions: ['call_help', 'stop_surgery', 'warming', 'plr', 'cpr', 'defib', 'rhythm_check'] },
    model: {
      ivAtStart: false, needlePhobic: true, surgDur: 130, painNeed: 0.2,
      comps: { induction: 'laryngospasm', maintenance: 'absorbent', emergence: 'obstruct' },
      signIn: 'WHO Sign In: Tom Ellis; excision of left forearm lipoma, consented. No allergies. Severe needle phobia — agreed plan for gas induction, cannula once asleep. Airway normal. Fasted.',
      timeOut: 'WHO Time Out: team introduced; excision of left forearm lipoma; surgeon will infiltrate local anaesthetic; ~ 30 minutes.',
    },
    tick(e) { const g = e.ga; if (g.ivOK && g.done.phase_induction && g.et / G.macAge(e.p) < 1.7 && !g.done.turnDown) g.done.turnDown = e.t; },
  }), {
    id: 'an-ga-gas-induction', title: 'Routine GA 4: inhalational induction (needle-phobic adult)',
    stem: '24-year-old man, 82 kg, ASA 1, for excision of a lipoma from the left forearm. He has a severe needle phobia and has fainted at blood tests; he agreed to a gas induction with the cannula placed once he is asleep. No other history. Plan: sevoflurane induction, IV cannula once asleep, i-gel, spontaneous breathing, surgeon’s local anaesthetic infiltration.',
    briefHow: 'Routine mode: an inhalational induction. Prime the circuit with high-flow O₂ and 8% sevoflurane, coach the patient through the facemask, keep quiet during the excitement stage, cannulate once asleep, then turn the vaporiser down.',
    briefComp: 'With complications: something will go wrong during the gas induction, during surgery and when the i-gel comes out.',
    patient: { age: 24, sex: 'M', weight: 82, hrBase: 78, mapNormal: 86 },
    critical: [
      step('machine'), step('signin'),
      { text: 'Attach the monitoring he will tolerate (SpO₂, ECG, NIBP) before starting', check: d('monitor') },
      { text: 'Prime the circuit: high flow (6–8 L/min) O₂ and sevoflurane 8%', check: (e) => e.did('sevoHigh') && e.ga.fgf >= 6 || e.ga.done.phase_induction && e.did('sevoHigh') },
      { text: 'Facemask on: calm coaching, normal breaths of the gas', check: d('mask') },
      { text: 'Keep quiet and still through stage 2 — no stimulation until deep', check: (e) => e.ga.done.lma && !e.ga.done.lmaLight && noHarm(/stage 2/)(e) },
      compStep('Laryngospasm at induction: 100% O₂, CPAP + Larson’s; deepen; IV access then propofol / suxamethonium', (e) => e.ga.done.comp_induction && !e.ga.laryngospasm && e.ga.done.larson),
      { text: 'Cannulate once asleep (stage 3: eyelash reflex gone, regular breathing)', check: (e) => e.ga.done.iv && !e.ga.done.ivLight },
      { text: 'Turn the vaporiser down once asleep and IV in (aim ~1–1.5 MAC)', check: d('turnDown') },
      step('support'), step('lma'),
      { text: 'Analgesia via the new cannula (fentanyl 1 mcg/kg)', check: did('fentanyl') },
      step('eyes'), step('timeout'), step('lowFlow'),
      compStep('Rising inspired CO₂ (exhausted soda lime): change the canister (or increase the FGF)', (e) => e.ga.done.absorbent || (e.ga.done.comp_maintenance && anyAfter(e, ['ga_fgf'], e.ga.done.comp_maintenance) && e.ga.fgf >= 5)),
      { text: 'Paracetamol IV', check: did('paracetamol') }, step('ponv'), step('sevoOff'), step('signout'), step('lmaOut'),
      compStep('Obstruction after i-gel removal: jaw thrust, oropharyngeal airway, 100% O₂', (e) => e.ga.done.comp_emergence && !e.ga.obstruct && e.ga.done.larson),
      step('recovery'), step('handover'),
    ],
    hint: {
      steps: [
        { t: 'Prime the circuit (high flow, 8% sevoflurane) so the first breaths are already strong', rx: 'Mask on gently; coach slow normal breaths' },
        { t: 'Stage 2 (excitement): disinhibition, breath-holding, airway reflexes still active', rx: 'No stimulation — no Guedel, no cannula yet' },
        { t: 'Stage 3: eyelash reflex gone, regular breathing, pupils central', rx: 'Cannulate now, then turn the vaporiser down (~1–1.5 MAC)' },
        { t: 'Laryngospasm: 100% O₂, CPAP, Larson’s point, deepen; IV propofol / suxamethonium', rx: 'QRH 3-6' },
        { t: 'i-gel, maintenance at low flow; emergence on high-flow O₂; remove awake', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Inhalational induction suits needle phobia, children and some airway problems. Sevoflurane is used because it is non-pungent and fast.',
        'Prime the circuit with a high fresh gas flow and 8% sevoflurane, then coach normal breathing; vital-capacity breaths speed it up.',
        'Stage 2 (excitement) is the danger zone: airway reflexes are hyper-reactive — any stimulation (Guedel, cannula, LMA) can trigger laryngospasm.',
        'Cannulate once in stage 3, and then turn the vaporiser down — 8% left on causes marked cardiovascular depression.',
        'Laryngospasm (QRH 3-6): call for help, 100% O₂, CPAP with a tight seal, jaw thrust at Larson’s point, deepen (propofol 0.5 mg/kg), suxamethonium 0.25–0.5 mg/kg IV (4 mg/kg IM without IV access) if it persists.',
        'A purple (exhausted) soda lime canister causes rebreathing — rising inspired CO₂. Change the canister, or temporarily increase the fresh gas flow.',
      ],
      refs: REFS.concat(['AoA QRH 3-6 Laryngospasm and stridor', 'Guedel’s stages of anaesthesia — modern interpretation for volatile induction']),
    },
  }));
})();
