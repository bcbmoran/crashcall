/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Tutorial scenario: a gentle, guided case that introduces every part of the simulator.
 * Steps are shown by the coach panel in app.js. A step with `check` advances automatically
 * once the learner has done it; a step without `check` waits for "Next". */
(function () {
  const S = window.Sim;
  const { labs } = S.scnUtil;

  S.SCENARIOS.unshift({
    id: 'tutorial', tutorial: true, title: 'Tutorial: how to use the simulator', field: 'Tutorial', shock: 'Hypovolaemic', difficulty: 1, setting: 'ed',
    stem: '45-year-old man with 2 days of vomiting and diarrhoea. Light-headed on standing. This is a guided tutorial: a coach in the corner will walk you through the monitor, examination, oxygen, investigations, fluids, infusions and the hint button. Nothing here can go badly wrong.',
    patient: { age: 45, sex: 'M', weight: 80, vol: 0.5, hrBase: 80, shunt: 0.12, lactate: 2.8, rrBase: 20, look: { sweaty: true } },
    stableFor: 20,
    tick(e) {
      // Tutorial safety net: the patient never deteriorates to arrest.
      e.lowMapTime = 0; e.lowSatTime = 0;
    },
    onEvent(e, ev) {
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
        'You have used every part of the simulator: monitor, examination, oxygen, investigations, fluids, infusions, the hint and the stabilisation bar.',
        'Each scenario ends when the hidden critical actions are done AND the targets shown under "Stabilisation" are held for 20 seconds — or if the patient arrests.',
        'Your time is recorded on the stopwatch; personal bests are saved in this browser.',
        'Next: try "Practise a field" or pick a scenario from the library.',
      ],
      refs: ['NICE CG174: Intravenous fluid therapy in adults in hospital'],
    },
    coach: [
      { title: 'Welcome', text: 'This tutorial takes about 3 minutes. Follow the steps in this box — most move on automatically once you have done them. The stopwatch (top right) is running but the patient is safe.', sel: '#stopwatch' },
      { title: 'The monitor', text: 'Live waveforms: ECG (green), SpO₂ pleth (blue) and capnography (yellow). Numbers on the right flash red when they alarm. Without an arterial line the BP is a cuff (NIBP) that cycles every 30 s — the "s ago" tells you how old it is.', sel: '.monitor-wrap' },
      { title: 'The patient', text: 'The patient view shows skin colour, breathing and any equipment you add (oxygen, lines, pumps, blood…). The handover below it tells you the story.', sel: '.patient-card' },
      { title: 'Your goal', text: 'The Stabilisation box shows the targets (red = not yet met). The bar fills when every target is met AND all the hidden critical actions are done. Hold it for 20 s to finish.', sel: '.status-card' },
      { title: 'Examine', text: 'Open the "Examine" tab to get an ABCDE examination. Re-examine at any time — findings change with the patient.', sel: '[data-tab="exam"]', check: (e) => e.did('exam') },
      { title: 'Oxygen', text: 'SpO₂ is low. Open "Airway & procedures" and apply a "Non-rebreathe mask 15 L/min".', sel: '[data-tab="actions"]', check: (e) => e.p.fio2 >= 0.6 },
      { title: 'Investigations', text: 'Open "Investigations" and request a "Blood gas" — the result pops up after ~5 s. Lab bloods take ~20 s, CXR ~15 s, CT ~40 s; ECG and ultrasound are instant. Reopen any result from the Results list.', sel: '[data-tab="inv"]', check: (e) => e.did('inv_gas') },
      { title: 'Ultrasound (optional)', text: 'Try "Point-of-care ultrasound" and look at the IVC view: real, openly-licensed clips with the report for this patient. Press Next when ready.', sel: '[data-tab="inv"]' },
      { title: 'Fluids', text: 'Open "Fluids & blood" and give "Hartmann\'s 500 mL bolus". Watch the BP and heart rate over the next 30 s (the NIBP will re-cycle).', sel: '[data-tab="fluids"]', check: (e) => e.fluidIn.crystalloid >= 500 },
      { title: 'Drugs: boluses and infusions', text: 'Open "Drugs". Bolus doses are the buttons; infusions have a rate box and "Infuse". For practice, start Noradrenaline at 0.05, then press "Stop" (here or in "Running infusions"). Tap the small "i" next to any drug for dosing notes.', sel: '[data-tab="drugs"]', check: (e) => e.did('noradrenaline') && e.rate('noradrenaline') === 0 },
      { title: 'Hint', text: 'Stuck? Press "💡 Hint" to see the mechanism, a live model of this patient\'s circulation and a Frank–Starling plot. Hint use is shown in the debrief.', sel: '#hintBtn', check: (e) => e.log.some((x) => x.type === 'hint') },
      { title: 'Finish', text: 'Close the hint. If MAP is still under 65, give another 500 mL. Once every target is green, watch the Stabilisation bar fill — after 20 s you will see the debrief. Pause (❚❚) stops the clock; "End" finishes early.', sel: '.status-card' },
    ],
  });
})();
