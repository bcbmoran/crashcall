/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Tutorial scenario: a gentle, guided case that introduces every part of the simulator.
 * Steps are shown by the coach panel in app.js. A step with `check` advances automatically
 * once the learner has done it; a step without `check` waits for "Next". */
(function () {
  const S = window.Sim;
  const { labs } = S.scnUtil;

  S.SCENARIOS.unshift({
    id: 'tutorial', tutorial: true, title: 'Tutorial: how to use the simulator', field: 'Tutorial', shock: 'Hypovolaemic', difficulty: 1, setting: 'ed',
    stem: '45-year-old man with 2 days of vomiting and diarrhoea. Light-headed on standing. This is a guided tutorial: a coach in the corner will walk you through the monitor, team announcements, examination, oxygen, investigations, IV access, fluids, urine output, infusions, the hint and the reference guides. Nothing here can go badly wrong.',
    patient: { age: 45, sex: 'M', weight: 80, vol: 0.5, hrBase: 80, shunt: 0.12, lactate: 2.8, rrBase: 20, look: { sweaty: true } },
    stableFor: 20,
    start(e) {
      e.after(3, (en) => en.say('This is a team announcement. Updates from the team appear in the middle of the screen: red = alert, amber = caution, green/blue = update. They fade on their own — you can keep working underneath, or press × to close one.', 'info'));
    },
    // Urine output responds visibly to filling in the tutorial (≈0.2 → 0.6+ mL/kg/h over the first litre).
    urine: (e) => Math.min(1, 0.2 + (e.fluidIn.crystalloid / 1000) * 0.45) * Math.min(1, Math.max(0.3, (e.p.map - 45) / 20)),
    tick(e) {
      // Tutorial safety net: the patient never deteriorates to arrest.
      e.lowMapTime = 0; e.lowSatTime = 0;
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'iv_line') { return { msg: ev.g === 'IO' ? 'IO access works for fluids and drugs — but for practice, also site a large-bore cannula (18G or bigger).' : ev.g <= 18 ? `Good — a ${ev.g}G cannula. Fluids now run much faster than through the pink 20G alone.` : `A ${ev.g}G works for drugs, but is too small for rapid fluid. Try an 18G (green) or bigger.`, kind: ev.g !== 'IO' && ev.g <= 18 ? 'good' : 'warn' }; }
      if (ev.type === 'inf' && ev.id === 'noradrenaline' && ev.rate > 0) return { msg: 'Infusion running — note the pump on the drip stand and the "Running infusions" box. Now stop it: a vasopressor is not the treatment for simple dehydration.', kind: 'warn' };
    },
    exam: (e) => ({
      A: 'Patent, talking in full sentences.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}% on ${e.p.fio2 > 0.21 ? 'oxygen' : 'air'}. Chest clear.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Cool peripheries, CRT 4 s, dry mucous membranes. Flat neck veins.`,
      D: 'GCS 15. Capillary glucose 5.4.',
      E: 'T 37.4 °C. Mildly tender abdomen, no peritonism.',
    }),
    inv: {
      bloods: (e) => labs(e, { urea: 14.8, cr: 142, na: 134, extra: [] }),
      ecg: { desc: 'Sinus tachycardia, otherwise normal.' },
      cxr: { media: 'cxr_normal', report: 'Normal chest radiograph.' },
      ct: [],
      pocus: [
        { label: 'IVC', media: 'us_ivc_flat', report: 'Small IVC collapsing completely with each breath — the patient is under-filled and likely to respond to fluid.' },
        { label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Normal-sized, vigorously contracting LV.' },
      ],
    },
    critical: [
      { text: 'Examine the patient (ABCDE)', check: (e) => e.did('exam') },
      { text: 'Oxygen to SpO₂ ≥ 94%', check: (e) => e.p.fio2 >= 0.6 || e.p.spo2 >= 94 },
      { text: 'Blood gas', check: (e) => e.did('inv_gas') },
      { text: 'Fluid bolus (≥ 500 mL crystalloid)', check: (e) => e.fluidIn.crystalloid >= 500 },
      { text: 'Site a second, large-bore cannula (18G or bigger)', check: (e) => e.lines.filter((l) => l.g !== 'IO' && l.g <= 18).length >= 1 && e.lines.length >= 2 },
      { text: 'Urinary catheter to measure urine output', check: (e) => e.hasCatheter() },
      { text: 'Tutorial: practise starting/stopping an infusion and open the hint', check: (e) => e.did('noradrenaline') && e.rate('noradrenaline') === 0 && e.log.some((x) => x.type === 'hint') },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      steps: [
        { t: 'Vomiting and diarrhoea → loss of salt and water', kind: 'cause', rx: 'Crystalloid boluses (250–500 mL), reassess after each' },
        { t: '↓ Circulating volume → ↓ venous return → ↓ preload' },
        { t: 'Frank–Starling: less filling → ↓ stroke volume → ↓ cardiac output' },
        { t: 'Baroreflex: ↑ HR and vasoconstriction (cool peripheries) try to hold BP' },
        { t: 'If uncorrected → hypotension, ↓ organ perfusion, lactate ↑', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'You have used every part of the simulator: monitor, team announcements, examination, oxygen, investigations, IV access, fluids, urine output, infusions, the hint and the stabilisation bar.',
        'Cannula size matters: flow rises steeply with gauge, so a pink 20G limits how fast fluid or blood can go in. In bleeding and shock, two large-bore cannulas (18G or bigger, or IO) are a critical action.',
        'Urine output is a good guide to organ perfusion: aim for at least 0.5 mL/kg/h. It only appears once a catheter is in, and it is time-compressed in the simulator.',
        'Blood loss shows live only where it can really be measured (swabs and suction, a chest drain, visible haematemesis). Internal bleeding is concealed — the debrief tells you the estimated total afterwards.',
        'Trauma cases with a long-bone fracture add a "Limb injury" section: check neurovascular status, splint (traction for a mid-shaft femur), and re-check.',
        'Some scenarios have their own actions, which appear step by step as you complete the previous one (e.g. the CICO and obstetric airway cases).',
        'Each scenario ends when the hidden critical actions are done AND the targets shown under "Stabilisation" are held for 20 seconds — or if the patient arrests.',
        'Your time is recorded on the stopwatch; personal bests are saved in this browser.',
        'Use the feedback box below to tell us what to improve — it works with or without an account.',
        'Next: try "Practise a field" or pick a scenario from the library. At consultant grade the targets are hidden, a second problem can appear mid-case, and you declare the patient stable yourself.',
      ],
      refs: ['NICE CG174: Intravenous fluid therapy in adults in hospital'],
    },
    coach: [
      { title: 'Welcome', text: 'This tutorial takes about 4 minutes. Follow the steps in this box — most move on automatically once you have done them. The stopwatch (top right) is running but the patient is safe.', sel: '#stopwatch' },
      { title: 'The monitor', text: 'Live waveforms: ECG (green), SpO₂ pleth (blue) and capnography (yellow). Numbers on the right flash red when they alarm. Without an arterial line the BP is a cuff (NIBP) that cycles every 30 s — the "s ago" tells you how old it is.', sel: '.monitor-wrap' },
      { title: 'The patient', text: 'The patient view shows skin colour, breathing and any equipment you add (oxygen, lines, pumps, blood…). The handover below it tells you the story.', sel: '.patient-card' },
      { title: 'Your goal', text: 'The Stabilisation box shows the targets (red = not yet met). The bar fills when every target is met AND all the hidden critical actions are done. Hold it for 20 s to finish.', sel: '.status-card' },
      { title: 'Team announcements', text: 'Updates from the team appear as cards in the middle of the screen — red for alerts, amber for cautions, green/blue for updates. They fade on their own and never block the buttons underneath; press × to close one early. Everything is also kept in the Event log.', sel: '.monitor-wrap' },
      { title: 'Examine', text: 'Open the "Examine" tab to get an ABCDE examination. Re-examine at any time — findings change with the patient.', sel: '[data-tab="exam"]', check: (e) => e.did('exam') },
      { title: 'Oxygen', text: 'SpO₂ is low. Open "Airway & procedures" and apply a "Non-rebreathe mask 15 L/min".', sel: '[data-tab="actions"]', check: (e) => e.p.fio2 >= 0.6 },
      { title: 'Investigations', text: 'Open "Investigations" and request a "Blood gas" — the result pops up after ~5 s. Lab bloods take ~20 s, CXR ~15 s, CT ~40 s; ECG and ultrasound are instant. Reopen any result from the Results list.', sel: '[data-tab="inv"]', check: (e) => e.did('inv_gas') },
      { title: 'Ultrasound (optional)', text: 'Try "Point-of-care ultrasound" and look at the IVC view: real, openly-licensed clips with the report for this patient. Press Next when ready.', sel: '[data-tab="inv"]' },
      { title: 'IV access', text: 'He arrived with one pink 20G cannula. In "Airway & procedures", under Vascular access (after Circulation), site a second cannula — choose 18G (green) or bigger. Cannulas are colour-coded and the gauge sets how fast fluid can run; an IO needle is there if you can\'t get IV access.', sel: '[data-tab="actions"]', check: (e) => e.lines.length >= 2 && e.lines.some((l) => l.g !== 'IO' && l.g <= 18) },
      { title: 'Fluids', text: 'Open "Fluids & blood" and give "Hartmann\'s 500 mL bolus". Watch the BP and heart rate over the next 30 s (the NIBP will re-cycle).', sel: '[data-tab="fluids"]', check: (e) => e.fluidIn.crystalloid >= 500 },
      { title: 'Ongoing output', text: 'The "Ongoing output" box updates live. Press "Insert catheter" there (or find it under Circulation) to measure urine output — it is low now and should rise as you fill him. Blood loss and fluid balance show here too: concealed internal bleeding can\'t be measured, just as in real life.', sel: '#outCard', check: (e) => e.hasCatheter() },
      { title: 'Drugs: boluses and infusions', text: 'Open "Drugs". Bolus doses are the buttons; infusions have a rate box and "Infuse". For practice, start Noradrenaline at 0.05, then press "Stop" (here or in "Running infusions"). Tap the small "i" next to any drug for dosing notes.', sel: '[data-tab="drugs"]', check: (e) => e.did('noradrenaline') && e.rate('noradrenaline') === 0 },
      { title: 'Hint', text: 'Stuck? Press "💡 Hint" to see the mechanism, a live model of this patient\'s circulation and a Frank–Starling plot. Hint use is shown in the debrief.', sel: '#hintBtn', check: (e) => e.log.some((x) => x.type === 'hint') },
      { title: 'Reference guides', text: 'The QRH button opens the anaesthesia quick-reference handbook guides (the relevant ones listed first) and RCUK opens the Resuscitation Council algorithms. The search bar above the tabs finds any drug, procedure, fluid or test. Press Next when ready.', sel: '#qrhBtn' },
      { title: 'Finish', text: 'Close the hint. If MAP is still under 65, give another 500 mL. Once every target is green, watch the Stabilisation bar fill — after 20 s you will see the debrief, with your critical actions, any harm, the blood loss and urine output, and a box to leave feedback. Pause (❚❚) stops the clock; "End" finishes early.', sel: '.status-card' },
    ],
  });

  // =====================================================================
  // Anaesthetic tutorial: the anaesthetic machine, TCI pumps (and their models), ventilator and checklist
  // =====================================================================
  const G = S.GA;
  if (G) {
    const d = (k) => (e) => !!(e.ga && e.ga.done[k]);
    const firstT = (e, id) => (e.done[id] || [])[0];
    S.SCENARIOS.splice(1, 0, {
      id: 'tutorial-ga', tutorial: true, title: 'Anaesthetic tutorial: machine, TCI pumps and ventilator', field: 'Tutorial', shock: null, category: 'Routine anaesthesia', difficulty: 1, setting: 'theatre',
      stem: '40-year-old man, 80 kg, ASA 1, for a laparoscopic inguinal hernia repair under TIVA. This is a guided tutorial for the anaesthetic stations: the coach walks you through the checklist, the anaesthetic machine, the TCI pumps and choosing a model, the airway, the ventilator, emergence and handover. Nothing here can go badly wrong.',
      patient: { age: 40, sex: 'M', weight: 80, hrBase: 68, mapNormal: 86 },
      ga: { tci: true, exposure: 'Supine, arms out on boards; the TIVA cannula is in the left forearm with an anti-reflux valve.' },
      kit: { actions: ['call_help', 'resite_iv', 'warming'] },
      stableFor: 5, targets: { map: 65, spo2: 94 }, qrh: ['2-4', '2-6'],
      init(e) { G.setup(e, { lap: true, surgDur: 70, painNeed: 0.35, ivCheck: 'TIVA cannula: 18G in the left forearm, visible, flushing freely; both pump lines joined with an anti-reflux valve close to the cannula.', signIn: 'WHO Sign In: James Carter; laparoscopic left inguinal hernia repair, consented, site marked. No allergies. Not a predicted difficult airway. Fasted 8 h.', timeOut: 'WHO Time Out: team introduced; laparoscopic left inguinal hernia repair; antibiotics not required; ~ 30 minutes.' }); },
      tick(e, dt) { G.tick(e, dt); e.lowMapTime = 0; e.lowSatTime = 0; },
      onEvent(e, ev) { return G.onEvent(e, ev); },
      exam: (e) => G.exam(e),
      inv: { bloods: (e) => labs(e, {}), ecg: {}, cxr: { media: 'cxr_normal', report: 'Normal chest radiograph.' }, ct: [], pocus: [] },
      critical: [
        { text: 'Machine check and WHO Sign In', check: (e) => d('machine')(e) && d('signin')(e) },
        { text: 'Monitoring: standard, processed-EEG (BIS) and TOF', check: (e) => d('monitor')(e) && d('bis')(e) && d('nmt')(e) },
        { text: 'TIVA cannula checked (visible, flushing, anti-reflux valve)', check: d('ivCheck') },
        { text: 'Pre-oxygenate on 100% O₂ until EtO₂ ≥ 0.9', check: d('preoxDone') },
        { text: 'Choose TCI models and start remifentanil then propofol', check: (e) => e.did('tciRemi') && e.did('tciProp') },
        { text: 'Secure the airway: rocuronium, intubate, confirm', check: d('confirm') },
        { text: 'Start the ventilator and adjust a setting', check: (e) => d('ventOn')(e) && ['vent_ventVt', 'vent_pinsp', 'vent_ventRR', 'vent_peep', 'vent_ventMode', 'vent_ventIE'].some((k) => e.did(k)) },
        { text: 'Low fresh gas flow for maintenance; WHO Time Out', check: (e) => e.did('lowFlow') && d('timeout')(e) },
        { text: 'Morphine before stopping the remifentanil; antiemetic', check: (e) => e.did('morphine') && (e.did('ondansetron') || e.did('dexamethasone')) },
        { text: 'Stop the pumps, reverse, extubate awake', check: (e) => e.did('tciPropOff') && e.did('tciRemiOff') && d('extubate')(e) },
        { text: 'Recovery and SBAR handover', check: d('handover') },
      ],
      hint: { steps: [
        { t: 'TCI pump: you set a concentration, the pump works out the doses from the model', kind: 'cause', rx: 'Cp models (Marsh, Paedfusor, Kataria) target plasma; Ce models (Schnider, Eleveld, Minto) target the brain' },
        { t: 'Remifentanil Ce 3–4 ng/mL, then propofol Ce 4–6 µg/mL', rx: 'Titrate the propofol to loss of consciousness; depth index 40–60' },
        { t: 'Rocuronium → TOF count 0 → intubate → ventilator on', rx: 'Vt 6–8 mL/kg ideal body weight, PEEP 5, rate for EtCO₂ 4.5–5.5 kPa' },
        { t: 'Remifentanil has no tail: give morphine before you stop it', kind: 'end' },
      ] },
      debrief: {
        points: [
          'The anaesthetic tab holds the machine (fresh gas flow, O₂, vaporiser), the ventilator and the TCI pumps; the checklist sits at the bottom left (it ticks as you go at junior grade and in tutorials, otherwise in the debrief).',
          'TCI models: Marsh (Cp, weight only), Schnider (Ce, age/sex/height/weight — smaller induction dose, good for older patients), Eleveld (Ce, all ages and sizes); children: Paedfusor (Cp, 1–16 y) and Kataria (Cp, 3–16 y, ≥ 15 kg). Remifentanil: Minto (adults) or Eleveld (all ages).',
          'Changing model mid-infusion is not possible — choose before you start.',
          'The ventilator is the same everywhere in CrashCall: VCV (set Vt) or PCV (set Pinsp), rate, PEEP and I:E, with delivered Vt, minute volume, Ppeak and Pplat. In theatre the FiO₂ comes from the machine’s fresh gas.',
          'Lung-protective ventilation: 6–8 mL/kg ideal body weight, Pplat < 30 cmH₂O, PEEP ≥ 5.',
          'Next: try the four "Routine GA" scenarios, first in Routine mode, then With complications.',
        ],
        refs: ['Association of Anaesthetists & SIVA: Guidelines for the safe practice of TIVA (2018)', 'AAGBI/AoA: Recommendations for standards of monitoring during anaesthesia and recovery (2021)', 'RCoA: Initial Assessment of Competence (IAC)'],
      },
      coach: [
        { title: 'Welcome to theatre', text: 'This tutorial shows the anaesthetic stations (~6 minutes). The Anaesthetic tab (right) holds the readouts, the anaesthetic machine, the ventilator, the TCI pumps and the actions for each phase. Drugs are on the Drugs tab. The patient is safe.', sel: '[data-tab="ga"]' },
        { title: 'The checklist', text: 'The anaesthetic checklist is at the bottom of the left column: the phase you are in, then every step. In tutorials and at junior grade steps tick off as you go; at senior and consultant grade they are revealed in the debrief.', sel: '#gaCheck' },
        { title: 'Checks and Sign In', text: 'Under "Before induction" press the machine & equipment check, then WHO Sign In.', sel: '[data-tab="ga"]', check: (e) => d('machine')(e) && d('signin')(e) },
        { title: 'Monitoring', text: 'Attach standard monitoring, the processed-EEG (BIS) depth monitor and the train-of-four monitor. With TIVA and a muscle relaxant, BIS is essential (NAP5) — there is no end-tidal agent to reassure you.', sel: '[data-tab="ga"]', check: (e) => d('monitor')(e) && d('bis')(e) && d('nmt')(e) },
        { title: 'TIVA cannula', text: 'Press the IV cannula check: for TIVA it must be visible, flushing and joined to both pumps with an anti-reflux valve. If the drug isn’t reaching the patient, they are waking up.', sel: '[data-tab="ga"]', check: d('ivCheck') },
        { title: 'The anaesthetic machine', text: 'Machine sliders: fresh gas flow (L/min), % O₂ in the fresh gas (this sets the FiO₂), and the sevoflurane vaporiser (keep it at 0 for TIVA). Set the flow to 6–8 L/min and O₂ to 100%, put the facemask on and pre-oxygenate until EtO₂ ≥ 0.9.', sel: '[data-tab="ga"]', check: d('preoxDone') },
        { title: 'TCI pumps and models', text: 'Each pump has a Model menu. Propofol: Marsh targets plasma (Cp) — the brain lags; Schnider and Eleveld target the effect site (Ce) and overshoot the plasma to get there. In children you would see Paedfusor, Kataria and Eleveld. Remifentanil: Minto or Eleveld. Pick models, start remifentanil at 3 ng/mL, then propofol at 4–5 µg/mL. Watch Cp/Ce and the depth index.', sel: '.ga-tci', check: (e) => e.did('tciRemi') && e.did('tciProp') },
        { title: 'Airway', text: 'Once he is asleep (eyelash reflex gone, depth index < 60): jaw thrust + Guedel, hand-ventilate via facemask, give rocuronium 0.6 mg/kg from the Drugs tab, wait for TOF count 0, intubate and confirm the tube.', sel: '[data-tab="ga"]', check: d('confirm') },
        { title: 'The ventilator', text: 'Press "Start mechanical ventilation". The Ventilator panel is the same in ED, ICU and theatre: choose volume (VCV) or pressure control (PCV), set Vt or Pinsp, rate, PEEP and I:E. Readouts show delivered Vt (mL/kg), minute volume, Ppeak and Pplat. Change at least one setting — e.g. adjust the rate for an EtCO₂ of 4.5–5.5 kPa.', sel: '[data-tab="ga"]', check: (e) => d('ventOn')(e) && ['vent_ventVt', 'vent_pinsp', 'vent_ventRR', 'vent_peep', 'vent_ventMode', 'vent_ventIE'].some((k) => e.did(k)) },
        { title: 'Maintenance', text: 'Turn the fresh gas flow down to ≤ 1.5 L/min (low flow), tape the eyes, then do the WHO Time Out so surgery can start. Keep the depth index 40–60 by adjusting the propofol target.', sel: '[data-tab="ga"]', check: (e) => e.did('lowFlow') && d('timeout')(e) },
        { title: 'Before the end', text: 'Remifentanil’s analgesia stops within minutes of switching it off: give morphine 0.1–0.15 mg/kg now, plus paracetamol and an antiemetic (ondansetron ± dexamethasone) from the Drugs tab.', sel: '[data-tab="drugs"]', check: (e) => e.did('morphine') && (e.did('ondansetron') || e.did('dexamethasone')) },
        { title: 'Emergence', text: 'When the surgeon finishes: stop both pumps, O₂ 100% at high flow, WHO Sign Out, reverse the block (sugammadex), suction, and extubate when awake with a TOF ratio ≥ 0.9.', sel: '[data-tab="ga"]', check: (e) => e.did('tciPropOff') && e.did('tciRemiOff') && d('extubate')(e) },
        { title: 'Recovery', text: 'Transfer to recovery on O₂, then give an SBAR handover.', sel: '#gaCheck', check: d('handover') },
        { title: 'Finish', text: 'Well done. Once the targets hold for a few seconds you will see the debrief. Next, try the Routine GA scenarios — Routine mode first, then With complications.', sel: '.status-card' },
      ],
    });
  }
})();
