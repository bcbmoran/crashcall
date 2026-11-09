/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Scenario library — part 1: shared helpers + Emergency Medicine.
 * Each scenario: patient parameters for the engine, dynamics (tick/onEvent), examination,
 * investigations, critical actions, targets, physiology hint and debrief. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const clamp = S.clamp;
  S.SCENARIOS = S.SCENARIOS || [];
  const add = (s) => S.SCENARIOS.push(s);
  const any = (e, ...ids) => ids.some((i) => e.did(i));
  const toward = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);
  const units = (e, kind) => Math.round(e.fluidIn[kind] / (kind === 'rbc' ? 280 : kind === 'ffp' ? 270 : 250));
  const oxygen = (e) => any(e, 'o2_nrb', 'hfno', 'bvm', 'sga', 'rsi_ketamine', 'rsi_propofol') || e.p.fio2 >= 0.6;
  const vaso = (e) => any(e, 'noradrenaline', 'metaraminol', 'phenylephrine', 'adrenaline', 'vasopressin', 'ephedrine');

  // ---- standard lab panel (UK units) ----
  function labs(e, o = {}) {
    const p = e.p;
    const v = (k, d) => (o[k] !== undefined ? (typeof o[k] === 'function' ? o[k](e) : o[k]) : d);
    const female = p.sex === 'F';
    const rows = [
      ['Full blood count'],
      ['Haemoglobin', Math.round(p.hb), 'g/L', female ? '115–165' : '130–180'],
      ['White cell count', v('wcc', 7.4), '×10⁹/L', '4.0–11.0'],
      ['Neutrophils', v('neut', 4.9), '×10⁹/L', '2.0–7.5'],
      ['Platelets', v('plt', 245), '×10⁹/L', '150–400'],
      ['Urea & electrolytes'],
      ['Sodium', v('na', Math.round(p.na)), 'mmol/L', '133–146'],
      ['Potassium', v('k', p.k.toFixed(1)), 'mmol/L', '3.5–5.3'],
      ['Urea', v('urea', 5.2), 'mmol/L', '2.5–7.8'],
      ['Creatinine', v('cr', 78), 'µmol/L', female ? '45–84' : '59–104'],
      ['eGFR', v('egfr', '>90'), 'mL/min/1.73m²', ''],
      ['Liver, bone & other'],
      ['CRP', v('crp', 3), 'mg/L', '<5'],
      ['Bilirubin', v('bili', 9), 'µmol/L', '<21'],
      ['ALT', v('alt', 24), 'U/L', '<50'],
      ['ALP', v('alp', 80), 'U/L', '30–130'],
      ['Albumin', v('alb', 40), 'g/L', '35–50'],
      ['Adjusted calcium', v('ca', 2.32), 'mmol/L', '2.20–2.60'],
      ['Glucose (lab)', v('glu', p.glucose.toFixed(1)), 'mmol/L', '3.5–11.0'],
      ['Troponin I (hs)', v('trop', 6), 'ng/L', '<34'],
      ['Lactate', p.lactate.toFixed(1), 'mmol/L', '0.5–2.0'],
      ['Coagulation'],
      ['PT', v('pt', (12 + p.coag * 9).toFixed(1)), 's', '10–14'],
      ['INR', v('inr', (1 + p.coag * 1.1).toFixed(1)), '', '0.8–1.2'],
      ['APTT', v('aptt', Math.round(30 + p.coag * 16)), 's', '25–37'],
      ['Fibrinogen', v('fib', Math.max(0.6, 3.1 - p.coag * 1.9).toFixed(1)), 'g/L', '1.5–4.0'],
    ];
    if (o.extra) rows.push(...(typeof o.extra === 'function' ? o.extra(e) : o.extra));
    return rows;
  }
  S.labs = labs;
  S.scnUtil = { add, any, toward, units, oxygen, vaso, labs };

  // =====================================================================
  // 1. Septic shock — urosepsis
  // =====================================================================
  add({
    id: 'em-sepsis-uro', qrh: ['3-14'], title: 'Septic shock: urosepsis', field: 'EM', shock: 'Distributive (septic)', difficulty: 2, setting: 'ed',
    stem: '72-year-old woman brought in by ambulance from home. 2 days of rigors, loin pain and new confusion. Background: type 2 diabetes, recurrent UTIs. Paramedics gave 250 mL crystalloid. NEWS2 = 10.',
    patient: { age: 72, sex: 'F', weight: 65, vasoplegia: 0.4, vol: 0.8, leak: 0.0007, lactate: 4.6, lacGen: 0.0015, temp: 39.1, hrBase: 82, shunt: 0.05, rrBase: 22, extraAcid: 1.5, na: 134, glucose: 11.8, gcs: 14, look: { flush: 0.35 } },
    tick(e, dt) {
      const p = e.p, t0 = e.firstTime('antibiotics');
      if (t0 != null && e.t - t0 > 40) { p.vasoplegia = toward(p.vasoplegia, e.flags.source ? 0.68 : 0.6, 0.01, dt); p.lacGen = 0; p.leak = 0.0002; }
      else p.vasoplegia = Math.max(0.3, p.vasoplegia - 0.00025 * dt);
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'source_control') {
        if (e.did('inv_ct') || e.did('inv_pocus')) { e.flags.source = true; return { handled: true, msg: 'Urology agree: obstructed infected left kidney — emergency nephrostomy arranged by IR.', kind: 'good' }; }
        return { handled: true, msg: 'Urology ask: is there evidence of obstruction? (Image the renal tract first.)' };
      }
      if (ev.type === 'inv' && ev.id === 'ct' && e.p.map < 65) return { harm: 'Transferred to CT while hypotensive — resuscitate first' };
    },
    exam: (e) => ({
      A: 'Patent. Speaking in short sentences, confused.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Chest clear, equal air entry, no added sounds.`,
      C: `HR ${e.p.hr}, warm peripheries, bounding pulses, CRT 2 s. Heart sounds normal, JVP not seen. Urine output 10 mL in the last hour.`,
      D: `GCS 14 (E4 V4 M6), disorientated to time. Capillary glucose ${e.p.glucose.toFixed(1)}. Pupils equal & reactive.`,
      E: `T ${e.p.temp.toFixed(1)} °C. Left renal angle and suprapubic tenderness. Catheter: cloudy, offensive urine. No rash, no meningism.`,
    }),
    inv: {
      bloods: (e) => labs(e, { wcc: 21.6, neut: 19.2, plt: 128, crp: 286, urea: 14.1, cr: 196, egfr: 22, bili: 24 }),
      extra: [['Urinalysis', 'Leucocytes +++, nitrites +, blood ++'], ['Blood cultures', 'Sent ×2 (results at 24–48 h)']],
      ecg: {},
      cxr: { media: 'cxr_normal', report: 'No consolidation, effusion or pneumothorax. Normal cardiomediastinal contour.' },
      ct: [{ label: 'CT abdomen/pelvis (urogram)', media: 'ct_kub', report: 'Obstructing distal ureteric calculus with upstream hydroureter/hydronephrosis, delayed nephrogram and perinephric stranding: obstructed, likely infected kidney. Needs urgent decompression.' }],
      pocus: [
        { label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Small, hyperdynamic LV with near cavity obliteration in systole. No pericardial effusion.' },
        { label: 'IVC (subcostal)', media: 'us_ivc_flat', report: 'IVC ~8 mm with >50% respiratory collapse — likely fluid responsive.' },
        { label: 'Lung (anterior)', media: 'us_lung_normal', report: 'A-line pattern with sliding bilaterally — no pulmonary oedema.' },
        { label: 'Left kidney', media: 'us_hydro', report: 'Dilated left renal pelvis (hydronephrosis). No free fluid.' },
      ],
    },
    critical: [
      { text: 'Blood cultures, bloods & lactate sent', check: (e) => e.did('inv_bloods') && (e.did('inv_gas') || e.did('inv_bloods')) },
      { text: 'IV antibiotics given', check: (e) => e.did('antibiotics') },
      { text: 'Fluid resuscitation ≥ 1 L crystalloid (with reassessment)', check: (e) => (e.fluidIn.crystalloid + e.fluidIn.colloid) >= 1000 },
      { text: 'High-flow oxygen / SpO₂ target achieved', check: (e) => e.p.spo2 >= 94 },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      leak: true,
      steps: [
        { t: 'Gram-negative infection in an obstructed left kidney', kind: 'cause', rx: 'Antibiotics within 1 h + source control (nephrostomy)' },
        { t: 'Pathogen molecules (LPS) → cytokine cascade (TNF-α, IL-1, IL-6) and inducible nitric oxide' },
        { t: 'Arteriolar vasodilatation → ↓ SVR and venodilatation → blood pools', rx: 'Noradrenaline if MAP < 65 after fluid' },
        { t: 'Endothelial injury → capillary leak → ↓ effective circulating volume', rx: 'Crystalloid 250–500 mL boluses, reassess each' },
        { t: 'Compensation: ↑HR and ↑CO — warm, bounding "hyperdynamic" shock' },
        { t: 'Microcirculatory failure + ↓DO₂ → anaerobic metabolism → lactate ↑', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Septic shock = sepsis + vasopressor requirement to keep MAP ≥ 65 mmHg and lactate > 2 mmol/L despite adequate fluid.',
        'Give broad-spectrum antibiotics within 1 hour of recognising high-risk sepsis/septic shock (NICE NG51, SSC 2026); de-escalate once cultures are back.',
        'Fluids: balanced crystalloid boluses with frequent reassessment (SSC 2026 still suggests at least 30 mL/kg in the first 3 h; crystalloid alone rather than adding albumin). Use dynamic measures (PLR, IVC) to guide further fluid, and remove excess fluid once resuscitated.',
        'Start noradrenaline early if hypotension persists — peripheral administration is acceptable short-term. SSC 2026: target MAP about 65 mmHg managed as a range (±5); 60–65 mmHg is suggested in adults aged 65 and over.',
        'Source control matters: an obstructed infected kidney needs urgent decompression (nephrostomy / stent).',
      ],
      refs: ['NICE NG51: Suspected sepsis — recognition, diagnosis and early management (2024 update)', 'HSE National Clinical Guideline No. 26: Sepsis Management for Adults (including maternity) (2021)', 'RCEM: Sepsis best practice guideline', 'Surviving Sepsis Campaign: International guidelines for management of sepsis and septic shock 2026 (co-sponsored by ESICM; endorsed by the ICS/FICM)', 'AoA QRH 3-14: Sepsis'],
    },
  });

  // =====================================================================
  // 2. Haemorrhagic shock — pelvic fracture
  // =====================================================================
  add({
    id: 'em-trauma-pelvis', qrh: ['3-2'], title: 'Major trauma: pelvic fracture haemorrhage', field: 'EM', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 3, setting: 'ed',
    eblExpected: 'Unstable (open-book) pelvic ring fracture: typically 1.5–2 L+, and the retroperitoneum can hold several litres — up to the whole blood volume.',
    stem: '34-year-old male motorcyclist, ~60 mph collision with a car. Pre-alert: "pelvic pain, HR 125, SBP 90". On arrival he is pale and clammy. Trauma team activated.',
    patient: { age: 34, sex: 'M', weight: 80, vol: 0.6, bleed: 0.0011, coag: 0.5, hb: 108, lactate: 5.2, temp: 35.3, hrBase: 78, rrBase: 24, gcs: 14, look: { sweaty: true, legs: { left: { shortRot: true, bruise: true } } } },
    init(e) { e.flags.bleedMult = 1; },
    tick(e, dt) {
      if (e.flags.ctrlAt && e.t >= e.flags.ctrlAt && e.p.bleed > 0) { e.p.bleed = 0; e.say('IR: bleeding branch of left internal iliac artery embolised — haemorrhage controlled.', 'good'); }
      if (!e.flags.warmed) e.p.temp = Math.max(34.2, e.p.temp - 0.0008 * dt);
      if (e.p.temp < 35) e.p.coag = Math.min(1.5, e.p.coag + 0.0003 * dt);
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'pelvic_binder' && !e.flags.binder) { e.flags.binder = true; p.bleed *= 0.45; p.look.binder = true; return { handled: true, msg: 'Pelvic binder applied over the greater trochanters — pelvis reduced.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'txa' && !e.flags.txa) { e.flags.txa = true; p.bleed *= 0.85; }
      if (ev.type === 'action' && ev.id === 'theatre') {
        e.flags.ctrlAt = e.t + (e.flags.binder ? 50 : 80);
        return { handled: true, msg: 'Interventional radiology accept — patient to angio suite for embolisation (continue resuscitation en route).', kind: 'good' };
      }
      if (ev.type === 'fluid' && /^(crystalloid|colloid)$/.test(ev.kind) && (e.fluidIn.crystalloid + e.fluidIn.colloid) > 1000) { p.coag += 0.25; return { harm: 'Large-volume crystalloid in haemorrhagic shock — dilutional coagulopathy and acidosis' }; }
      if ((ev.type === 'inf' || ev.type === 'drug') && ['noradrenaline', 'metaraminol', 'phenylephrine', 'vasopressin'].includes(ev.id) && p.bleed > 0) return { harm: 'Vasopressor used as a substitute for blood products in haemorrhage' };
      if (ev.type === 'inv' && ev.id === 'ct' && p.map < 60) return { harm: 'CT with ongoing haemodynamic instability — consider direct to IR/theatre' };
      if (ev.type === 'action' && ev.id === 'warming') e.flags.warmed = true;
    },
    exam: (e) => ({
      A: 'Patent, talking. C-spine immobilised.',
      B: `RR ${e.p.rr}. Trachea central, chest clear, equal expansion. SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, thready radial pulse, cool peripheries, CRT 4 s. Abdomen soft. Pelvis: bruising over perineum and scrotum, left leg shortened & externally rotated — do not spring the pelvis.`,
      D: 'GCS 14 (confused). Pupils equal and reactive. Moving all limbs.',
      E: `T ${e.p.temp.toFixed(1)} °C. Abrasions to left flank and thigh. No long-bone deformity other than above.`,
    }),
    inv: {
      bloods: (e) => labs(e, { wcc: 15.2, neut: 12.8, plt: 168, extra: [['Group & save', 'Group O RhD positive — crossmatch sent'], ['Ionised Ca²⁺ (gas)', '1.02 mmol/L (low)']] }),
      ecg: {},
      cxr: { media: 'cxr_normal', report: 'Normal trauma chest radiograph. No pneumothorax or haemothorax. Mediastinum not widened.' },
      ct: [{ label: 'AP pelvis X-ray (trauma series)', media: 'xr_pelvis', report: 'Marked widening of the pubic symphysis — open-book (APC) pelvic ring injury. Bind the pelvis.' }, { label: 'CT abdomen/pelvis with contrast', media: null, report: 'Open-book (APC III) pelvic fracture with large pelvic haematoma and active arterial contrast extravasation from a branch of the left internal iliac artery. No solid organ injury.' }],
      pocus: [
        { label: 'eFAST: RUQ (Morison\'s)', media: 'us_morison_neg', report: 'No free fluid in Morison\'s pouch.' },
        { label: 'eFAST: pelvis', media: null, report: 'No free fluid in the pelvis (note: FAST does not detect retroperitoneal haemorrhage).' },
        { label: 'eFAST: lungs', media: 'us_sliding', report: 'Lung sliding present bilaterally.' },
        { label: 'IVC', media: 'us_ivc_flat', report: 'Small, collapsing IVC.' },
      ],
    },
    critical: [
      { text: 'Pelvic binder applied', check: (e) => e.flags.binder },
      { text: 'Major haemorrhage protocol activated', check: (e) => e.did('mhp') },
      { text: 'Tranexamic acid 1 g', check: (e) => e.did('txa') },
      { text: 'Blood products: ≥ 2 units red cells + FFP', check: (e) => e.fluidIn.rbc >= 560 && e.fluidIn.ffp >= 270 },
      { text: 'Definitive haemorrhage control (IR / theatre)', check: (e) => e.did('theatre') },
      { text: 'Bleeding controlled', check: (e) => e.p.bleed === 0 },
    ],
    targets: { map: 60, spo2: 94 },
    hint: {
      steps: [
        { t: 'High-energy pelvic ring disruption tears the posterior venous plexus and iliac arterial branches', kind: 'cause', rx: 'Pelvic binder; IR embolisation / pre-peritoneal packing' },
        { t: 'Loss of circulating volume → ↓ venous return → ↓ preload', rx: 'Blood products 1:1 (red cells : FFP)' },
        { t: 'Frank–Starling: ↓ preload → ↓ stroke volume → ↓ CO' },
        { t: 'Baroreflex: ↑HR, vasoconstriction (↑SVR) — BP is maintained until ~30% loss' },
        { t: 'Lethal triad: acidosis + hypothermia + coagulopathy (worsened by crystalloid)', rx: 'TXA, warm, limit crystalloid, calcium' },
        { t: 'Tissue hypoperfusion → lactate ↑ → cardiovascular collapse', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Haemorrhage control is the definitive treatment — binder early, then angiography/embolisation or surgery.',
        'Use blood products early (1:1 red cells:FFP), minimise crystalloid. Permissive hypotension (SBP ~80–90) until bleeding controlled, unless TBI.',
        'TXA 1 g within 3 h of injury (CRASH-2), then 1 g over 8 h.',
        'FAST is negative in retroperitoneal/pelvic bleeding — a negative FAST does not exclude haemorrhage.',
        'Prevent the lethal triad: warm the patient and fluids, monitor ionised calcium, use viscoelastic testing if available.',
      ],
      refs: ['NICE NG39: Major trauma — assessment and initial management (2016)', 'BOAST: The management of patients with pelvic fractures (BOA, 2018)', 'JPAC / BSH: Major haemorrhage guidance (2022)', 'CRASH-2 trial (Lancet 2010)'],
    },
  });

  // =====================================================================
  // 3. Tension pneumothorax
  // =====================================================================
  add({
    id: 'em-tension-ptx', title: 'Tension pneumothorax after chest trauma', field: 'EM', shock: 'Obstructive', difficulty: 2, setting: 'ed',
    stem: '22-year-old man, driver in a high-speed RTC. Increasingly breathless in the ambulance. Complaining of left chest pain. On arrival: agitated, sweaty, struggling to talk.',
    patient: { age: 22, sex: 'M', weight: 72, obstruct: 0.42, shunt: 0.28, hrBase: 90, rrBase: 30, deadspace: 0.15, cvpExtra: 4, look: { sweaty: true, wound: 'left-chest' } },
    tick(e, dt) {
      const p = e.p;
      if (!e.flags.decompressed) p.obstruct = Math.min(0.74, p.obstruct + 0.0012 * dt);
      if (e.flags.fixAt && e.t >= e.flags.fixAt) { e.flags.fixAt = null; p.obstruct = 0.02; p.shunt = 0.06; p.cvpExtra = 0; e.say('Chest drain swinging and bubbling. Lung re-expanding.', 'good'); }
      if (e.flags.recurAt && e.t >= e.flags.recurAt && !e.did('chest_drain')) { e.flags.recurAt = null; e.flags.decompressed = false; p.obstruct = 0.35; e.say('Deteriorating again — the cannula has kinked. Tension re-accumulating!', 'bad'); }
      p.look.trachea = p.obstruct > 0.3;
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && (ev.id === 'needle_decompression' || ev.id === 'thoracostomy')) {
        e.flags.decompressed = true; p.obstruct = 0.05; p.shunt = 0.16; p.cvpExtra = 0;
        if (ev.id === 'needle_decompression') { e.flags.recurAt = e.t + 110; return { handled: true, msg: 'Hiss of air from the left 5th ICS anterior axillary line. Colour and BP improving. Cannula secured — needs a chest drain.', kind: 'good' }; }
        return { handled: true, msg: 'Finger thoracostomy: rush of air, lung felt. Haemodynamics improve. In a spontaneously breathing patient follow promptly with a chest drain.', kind: 'good' };
      }
      if (ev.type === 'action' && ev.id === 'chest_drain') {
        e.flags.decompressed = true; e.flags.recurAt = null;
        if (p.obstruct > 0.1) { e.flags.fixAt = e.t + 25; return { handled: true, msg: 'Inserting a chest drain takes time — decompress first in tension physiology. Drain going in now…', kind: 'warn' }; }
        e.flags.fixAt = e.t + 3;
        return { handled: true, msg: 'Size 28F chest drain inserted in the left safe triangle, connected to underwater seal.' };
      }
      if (ev.type === 'inv' && ev.id === 'cxr' && !e.flags.decompressed) return { harm: 'Waiting for a CXR before decompressing a clinical tension pneumothorax' };
    },
    exam: (e) => ({
      A: 'Patent, speaking in words only.',
      B: e.flags.decompressed || e.p.obstruct < 0.1
        ? `RR ${e.p.rr}. Improved left-sided air entry. SpO₂ ${e.p.spo2}%.`
        : `RR ${e.p.rr}, laboured. Trachea deviated to the right. Left hemithorax: reduced expansion, hyper-resonant, absent breath sounds. Surgical emphysema left chest wall. SpO₂ ${e.p.spo2}%.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. ${e.p.cvp > 12 ? 'Distended neck veins.' : 'JVP not raised.'} Cool peripheries.`,
      D: 'GCS 15, agitated. Pupils equal.',
      E: 'Seatbelt bruising across the left chest. No other injuries found.',
    }),
    inv: {
      bloods: (e) => labs(e, { wcc: 12.1 }),
      ecg: {},
      cxr: (e) => e.flags.decompressed ? { media: null, report: 'Repeat film (no image available): residual small left pneumothorax, no mediastinal shift, cannula/drain in situ.' } : { media: 'cxr_tension_left', report: 'Large left pneumothorax with complete lung collapse, mediastinal shift to the right and flattening of the left hemidiaphragm — TENSION PNEUMOTHORAX. (This should have been treated clinically.)' },
      ct: [],
      pocus: [
        { label: 'Left anterior chest (lung point)', media: 'us_lung_point', report: 'Lung point at the lateral chest wall — diagnostic of pneumothorax.' },
        { label: 'Left anterior chest', media: 'us_no_sliding', report: 'Absent lung sliding, A-lines only, "barcode" sign on M-mode — pneumothorax.' },
        { label: 'Right anterior chest', media: 'us_sliding', report: 'Normal sliding, "seashore" sign.' },
                { label: 'IVC', media: 'us_ivc_pleth', report: 'Plethoric, non-collapsing IVC (obstructed venous return).' },
      ],
    },
    critical: [
      { text: 'High-flow oxygen', check: oxygen },
      { text: 'Immediate decompression (needle or finger thoracostomy)', check: (e) => any(e, 'needle_decompression', 'thoracostomy') },
      { text: 'Chest drain inserted', check: (e) => e.did('chest_drain') },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      obstruction: 'Tension: mediastinal shift kinks great veins',
      steps: [
        { t: 'Lung/chest-wall injury creates a one-way valve', kind: 'cause' },
        { t: 'Air enters the pleural space on each breath but cannot leave → rising intrapleural pressure', rx: 'Needle decompression / finger thoracostomy' },
        { t: 'Mediastinal shift compresses and kinks the SVC/IVC → venous return falls', rx: 'Chest drain for definitive management' },
        { t: '↓ Preload → ↓ SV → ↓ CO despite ↑HR and ↑SVR (obstructive shock)' },
        { t: 'Collapsed lung → shunt → hypoxaemia', rx: 'High-flow oxygen' },
        { t: 'PEA arrest if not decompressed', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Tension pneumothorax is a clinical diagnosis — decompress before imaging.',
        'Needle decompression: 4th/5th ICS anterior-to-mid axillary line (or 2nd ICS MCL); cannulae frequently kink or are too short.',
        'Finger thoracostomy is preferred in ventilated patients; in spontaneously breathing patients follow with a chest drain.',
        'POCUS: absent sliding + barcode sign; a lung point is diagnostic.',
      ],
      refs: ['NICE NG39: Major trauma — assessment and initial management (2016)', 'BTS Guideline for pleural disease (2023)'],
    },
  });

  // =====================================================================
  // 4. Massive PE
  // =====================================================================
  add({
    id: 'em-massive-pe', title: 'High-risk (massive) pulmonary embolism', field: 'EM', shock: 'Obstructive', difficulty: 3, setting: 'ed',
    stem: '58-year-old woman, 10 days after a total knee replacement, collapsed at home. Acutely breathless, pleuritic chest pain. No anticoagulation since discharge.',
    patient: { age: 58, sex: 'F', weight: 82, rvLoad: true, obstruct: 0.44, deadspace: 0.38, shunt: 0.12, hrBase: 96, rrBase: 28, lactate: 3.8, oedemaProne: 0, cvpExtra: 3, look: { sweaty: true, legs: { left: { swollen: true, kneeDressing: true } } } },
    tick(e, dt) {
      const p = e.p;
      if (!e.flags.lysed) p.obstruct = Math.min(0.7, p.obstruct + 0.0006 * dt);
      else if (e.t - e.flags.lysed > 15) { p.obstruct = toward(p.obstruct, 0.12, 0.015, dt); p.deadspace = toward(p.deadspace, 0.15, 0.01, dt); p.shunt = toward(p.shunt, 0.05, 0.01, dt); }
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'drug' && ev.id === 'alteplase' && !e.flags.lysed) { e.flags.lysed = e.t; return { msg: 'Thrombolysis running. Monitor for bleeding.', kind: 'good' }; }
      if (ev.type === 'fluid' && (e.fluidIn.crystalloid + e.fluidIn.colloid) > 500) { p.obstruct = Math.min(0.75, p.obstruct + 0.04); return { harm: 'Further fluid in RV failure — RV dilatation worsens septal shift and LV filling' }; }
      if (ev.type === 'inv' && ev.id === 'ct' && p.map < 65) return { harm: 'Transfer of a shocked patient to CT — use bedside echo to support the diagnosis' };
      if (ev.type === 'action' && ev.id === 'cath_lab') return { handled: true, msg: 'Interventional cardiology: catheter-directed therapy not immediately available — give systemic thrombolysis now.' };
      if (ev.type === 'action' && (ev.id === 'rsi_propofol' || ev.id === 'rsi_ketamine') && !e.flags.lysed) return { harm: 'Intubation/positive-pressure ventilation in acute RV failure — high risk of arrest' };
    },
    exam: (e) => ({
      A: 'Patent.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}% on ${e.p.fio2 > 0.21 ? 'O₂' : 'air'}. Chest clear, equal air entry.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Raised JVP. Loud P2. Cool, mottled peripheries. Left calf swollen and tender.`,
      D: 'GCS 15, anxious.',
      E: 'Healing left knee wound. No rash.',
    }),
    inv: {
      bloods: (e) => labs(e, { trop: 182, extra: [['D-dimer', '>5000 ng/mL (do not wait for this)'], ['NT-proBNP', '3,450 ng/L']] }),
      ecg: { s1q3t3: true, note: 'right-heart strain pattern in the context of suspected PE (S1Q3T3 is neither sensitive nor specific).' },
      cxr: { media: 'cxr_normal', report: 'Clear lung fields (a normal CXR in a hypoxic patient should make you think PE).' },
      ct: [{ label: 'CT pulmonary angiogram', media: 'ctpa_saddle', report: 'Saddle embolus at the pulmonary bifurcation extending into both main pulmonary arteries. RV:LV ratio 1.6 with septal bowing — right heart strain.' }],
      pocus: [
        { label: 'Apical 4-chamber', media: 'us_pe_a4c', report: 'RV markedly dilated (RV > LV), McConnell\'s sign. Small, under-filled LV.' },
        { label: 'Parasternal short axis', media: 'us_pe_2', report: 'D-shaped LV (septal flattening) — RV pressure overload.' },
        { label: 'IVC', media: 'us_ivc_pleth', report: 'Plethoric IVC, no respiratory variation.' },
        { label: 'Lung', media: 'us_lung_normal', report: 'A-lines with sliding. No B-lines.' },
      ],
    },
    critical: [
      { text: 'Oxygen', check: oxygen },
      { text: 'Bedside echo showing RV dilatation', check: (e) => e.did('inv_pocus') },
      { text: 'Systemic thrombolysis (alteplase)', check: (e) => e.did('alteplase') },
      { text: 'Vasopressor support for RV perfusion (e.g. noradrenaline)', check: vaso },
    ],
    targets: { map: 65, spo2: 92 },
    hint: {
      obstruction: 'Clot in pulmonary artery: RV afterload ↑↑',
      steps: [
        { t: 'DVT embolises to the pulmonary arteries', kind: 'cause', rx: 'Thrombolysis (alteplase)' },
        { t: 'Abrupt ↑ pulmonary vascular resistance → RV afterload ↑↑' },
        { t: 'RV dilates, RV wall tension ↑, RV ischaemia (RV perfusion depends on MAP)', rx: 'Noradrenaline to maintain aortic pressure' },
        { t: 'Septal shift → LV under-filled (ventricular interdependence)', rx: 'Avoid big fluid boluses' },
        { t: '↓ LV preload → ↓ CO → hypotension — a vicious cycle' },
        { t: 'Dead space ↑ → low EtCO₂; V/Q mismatch → hypoxaemia', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'High-risk PE = PE with haemodynamic instability (SBP < 90 mmHg for >15 min, vasopressor need, or arrest).',
        'If CTPA is not immediately safe, bedside echo showing RV dysfunction is sufficient to justify thrombolysis.',
        'Alteplase 100 mg over 2 h (or 50 mg bolus peri-arrest; continue CPR 60–90 min after lysis in arrest).',
        'Cautious fluid only (≤500 mL). Noradrenaline is the first-line vasopressor to protect RV coronary perfusion.',
        'Avoid intubation if possible — induction and positive pressure can precipitate arrest in RV failure.',
      ],
      refs: ['NICE NG158: Venous thromboembolic diseases — diagnosis, management and thrombophilia testing (2023)', 'ESC/ERS 2019 Guidelines on acute pulmonary embolism (endorsed in UK practice; referenced by NICE NG158)', 'BTS: Guideline for the initial outpatient management of PE (2018)'],
    },
  });

  // =====================================================================
  // 5. Anaphylaxis (ED)
  // =====================================================================
  function anaphylaxisTick(e, dt, regen) {
    const p = e.p;
    const mast = e.fx ? clamp(e.fx.mast, 0, 1) : 0;
    p.look = p.look || {};
    p.med = clamp((p.med || 0) + (-0.009 * mast + (p.med > 0.05 ? regen : 0)) * dt, 0, 1.3);
    const m = p.med;
    p.vasoplegia = 1 - 0.6 * Math.min(m, 1.2);
    p.venodil = 0.35 * m;
    p.bronchospasm = p.bronchBase != null ? p.bronchBase * m : 0.55 * m;
    p.leak = 0.0008 * m;
    p.look.flush = 0.75 * Math.min(1, m);
    p.look.urticaria = m > 0.25;
  }
  S.anaphylaxisTick = anaphylaxisTick;

  add({
    id: 'em-anaphylaxis', title: 'Anaphylaxis: food allergy', field: 'EM', shock: 'Distributive (anaphylactic)', difficulty: 1, setting: 'ed',
    stem: '19-year-old woman with known peanut allergy ate a takeaway 20 minutes ago. Lip swelling, widespread itchy rash, wheeze and feeling faint. She did not use her auto-injector.',
    patient: { age: 19, sex: 'F', weight: 60, med: 0.75, hrBase: 88, rrBase: 26, shunt: 0.08, look: { urticaria: true, flush: 0.7, facialOedema: true } },
    init(e) { anaphylaxisTick(e, 0, 0); },
    tick(e, dt) { anaphylaxisTick(e, dt, 0.0012); },
    onEvent(e, ev) {
      if (ev.type === 'drug' && (ev.id === 'chlorphenamine' || ev.id === 'hydrocortisone') && !any(e, 'adrenaline', 'adrenaline_im')) return { harm: 'Antihistamine/steroid given before adrenaline — adrenaline is the only first-line drug' };
      if (ev.type === 'drug' && ev.id === 'adrenaline' && ev.dose >= 500) return { harm: '1 mg IV adrenaline in a patient with a pulse — risk of VF, MI and severe hypertension' };
      if (ev.type === 'drug' && ev.id === 'adrenaline' && !e.did('art_line')) return { msg: 'IV adrenaline boluses should only be given by experienced users with continuous monitoring — IM is first-line in the ED.', kind: 'warn' };
    },
    exam: (e) => ({
      A: e.p.med > 0.6 ? 'Lip and tongue swelling, hoarse voice, mild inspiratory stridor.' : e.p.med > 0.3 ? 'Mild lip swelling, voice normal.' : 'Patent, swelling settling.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. ${e.p.bronchEff > 0.3 ? 'Widespread expiratory wheeze, reduced air entry.' : e.p.bronchEff > 0.1 ? 'Scattered wheeze.' : 'Clear chest.'}`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. ${e.p.med > 0.4 ? 'Flushed, warm peripheries.' : 'Peripheries warm.'}`,
      D: `GCS ${e.p.map < 55 ? 13 : 15}. Feels "like something awful is going to happen".`,
      E: e.p.look.urticaria ? 'Widespread urticaria over trunk and limbs, facial angioedema.' : 'Rash fading.',
    }),
    inv: {
      bloods: (e) => labs(e, { extra: [['Mast cell tryptase', 'Sample 1 taken (repeat at 1–2 h and >24 h)']] }),
      ecg: {},
      cxr: { media: null, report: 'Mildly hyperinflated lungs. No consolidation or pneumothorax. (No openly-licensed example image available for this finding.)' },
      ct: [],
      pocus: [
        { label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Hyperdynamic, under-filled LV.' },
        { label: 'IVC', media: 'us_ivc_flat', report: 'Collapsing IVC — vasodilatation and capillary leak.' },
      ],
    },
    critical: [
      { text: 'IM adrenaline 500 mcg (repeat if no improvement at 5 min)', check: (e) => any(e, 'adrenaline_im', 'adrenaline') },
      { text: 'High-flow oxygen', check: oxygen },
      { text: 'IV fluid bolus (500–1000 mL)', check: (e) => (e.fluidIn.crystalloid + e.fluidIn.colloid) >= 500 },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      leak: true,
      steps: [
        { t: 'IgE-mediated reaction to peanut protein', kind: 'cause' },
        { t: 'Mast cell & basophil degranulation: histamine, tryptase, leukotrienes, PAF', rx: 'Adrenaline (β2 stabilises mast cells)' },
        { t: 'Profound vasodilatation (↓SVR) and venous pooling', rx: 'Adrenaline α1 + fluid bolus' },
        { t: 'Capillary leak → up to 35% of circulating volume lost in minutes', rx: 'Crystalloid 500–1000 mL' },
        { t: 'Bronchospasm and upper airway oedema', rx: 'Adrenaline β2; salbutamol; secure airway early' },
        { t: 'Hypoperfusion, hypoxaemia → cardiac arrest', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Adrenaline IM 500 mcg (adult) anterolateral thigh, repeated after 5 min if no improvement — it is the only first-line treatment.',
        'Refractory anaphylaxis (no improvement after 2 IM doses): start a low-dose adrenaline infusion with expert help, plus fluids.',
        'Lie the patient flat (legs raised) — sitting up can precipitate cardiovascular collapse ("empty heart").',
        'Antihistamines are for skin symptoms only and steroids are no longer routinely recommended in the acute phase (RCUK 2021).',
        'Take mast cell tryptase samples: as soon as possible, at 1–2 h, and > 24 h.',
      ],
      refs: ['Resuscitation Council UK: Emergency treatment of anaphylaxis (2021)', 'Resuscitation Council UK: Refractory anaphylaxis algorithm (2021)', 'NICE NG258: Anaphylaxis — assessment and referral after emergency treatment (2026)'],
    },
  });

  // =====================================================================
  // 6. Cardiogenic shock — anterior STEMI
  // =====================================================================
  add({
    id: 'em-cardiogenic-stemi', qrh: ['3-12'], title: 'Cardiogenic shock: anterior STEMI', field: 'EM', shock: 'Cardiogenic', difficulty: 3, setting: 'ed',
    stem: '64-year-old man, 2 hours of crushing central chest pain radiating to the jaw. Now grey, sweaty and breathless. Smoker, hypertension. Paramedics gave aspirin 300 mg.',
    patient: { age: 64, sex: 'M', weight: 88, contract: 0.32, vol: 1.06, pulmOedema: 0.35, oedemaProne: 1.4, shunt: 0.06, hrBase: 92, rrBase: 26, lactate: 3.6, look: { sweaty: true }, ecg: { st: 0.05 } },
    tick(e, dt) {
      const p = e.p;
      if (!e.flags.reperfused) p.contract = Math.max(0.26, p.contract - 0.00008 * dt);
      if (e.flags.pciAt && e.t >= e.flags.pciAt && !e.flags.reperfused) { e.flags.reperfused = true; e.say('Cath lab: proximal LAD occlusion — stented with TIMI 3 flow.', 'good'); }
      if (e.flags.reperfused) { p.contract = toward(p.contract, 0.62, 0.01, dt); p.ecg.st = toward(p.ecg.st, 0.02, 0.01, dt); }
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'action' && ev.id === 'cath_lab') {
        e.flags.pciAt = e.t + 70;
        return { handled: true, msg: 'Primary PCI team activated — door-to-balloon clock running. Continue stabilising for transfer.', kind: 'good' };
      }
      if (ev.type === 'fluid' && /^(crystalloid|colloid)$/.test(ev.kind) && (e.fluidIn.crystalloid + e.fluidIn.colloid) > 250) return { harm: 'Fluid boluses in cardiogenic shock with pulmonary oedema' };
      if (ev.type === 'inf' && ev.id === 'gtn' && ev.rate > 0 && p.map < 75) return { harm: 'Nitrate in a hypotensive patient' };
      if (ev.type === 'drug' && ev.id === 'furosemide' && p.map < 65) return { msg: 'Diuretics will not work (and may worsen hypotension) until perfusion is restored.', kind: 'warn' };
    },
    exam: (e) => ({
      A: 'Patent.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. ${e.p.pulmOedema > 0.25 ? 'Bibasal fine crackles to mid-zones.' : e.p.pulmOedema > 0.1 ? 'Bibasal crackles.' : 'Chest now clear.'}`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}, narrow pulse pressure. Cold, clammy, mottled peripheries, CRT 5 s. JVP +5 cm. Gallop rhythm (S3).`,
      D: 'GCS 15, anxious.',
      E: 'No rash. Calves soft. Urine output poor.',
    }),
    inv: {
      bloods: (e) => labs(e, { trop: 4820, cr: 132, urea: 9.4, extra: [['NT-proBNP', '6,870 ng/L']] }),
      ecg: { note: 'ST elevation V1–V5, I and aVL with reciprocal depression in III/aVF — anterior STEMI (proximal LAD).', st: { V1: 0.35, V2: 0.75, V3: 0.8, V4: 0.65, V5: 0.35, I: 0.2, aVL: 0.25, III: -0.18, aVF: -0.15, II: -0.06 } },
      cxr: (e) => ({ media: 'cxr_oedema', report: e.p.pulmOedema > 0.2 ? 'Bilateral perihilar ("bat-wing") airspace shadowing, upper lobe diversion, Kerley B lines and small effusions: pulmonary oedema.' : 'Mild upper lobe diversion only.' }),
      ct: [],
      pocus: [
        { label: 'Parasternal long axis', media: 'us_plax_poor', report: 'Dilated, severely impaired LV (EF ~20%), anterior septum akinetic. No effusion.' },
        { label: 'Apical 4-chamber', media: 'us_a4c_poor', report: 'Apical and septal akinesis. RV function preserved.' },
        { label: 'IVC', media: 'us_ivc_pleth', report: 'Plethoric IVC (>2 cm, no collapse).' },
        { label: 'Lung', media: 'us_blines', report: 'Multiple bilateral B-lines — interstitial/alveolar oedema.' },
      ],
    },
    critical: [
      { text: '12-lead ECG', check: (e) => e.did('inv_ecg') },
      { text: 'Primary PCI / cath lab activated', check: (e) => e.did('cath_lab') },
      { text: 'Inotrope ± vasopressor (dobutamine / noradrenaline)', check: (e) => any(e, 'dobutamine', 'noradrenaline', 'adrenaline', 'milrinone') },
      { text: 'Oxygen to target SpO₂ ≥ 92%', check: (e) => e.p.spo2 >= 92 },
    ],
    targets: { map: 65, spo2: 92 },
    hint: {
      steps: [
        { t: 'Proximal LAD occlusion → large anterior infarct', kind: 'cause', rx: 'Primary PCI' },
        { t: 'Loss of contracting myocardium → ↓ contractility', rx: 'Inotrope (dobutamine)' },
        { t: '↓ SV, ↓ CO; LV end-diastolic pressure ↑ → pulmonary oedema', rx: 'Avoid fluid; CPAP/oxygen; diuretic once perfusing' },
        { t: 'Compensatory vasoconstriction ↑ SVR → ↑ afterload further ↓ SV', rx: 'Noradrenaline if MAP low (maintains coronary perfusion)' },
        { t: '↓ Coronary perfusion pressure → more ischaemia (downward spiral)' },
        { t: 'Cold & wet: hypoperfusion + congestion → lactate ↑', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Cardiogenic shock complicating STEMI: emergency revascularisation (PCI) is the treatment that improves survival.',
        'The patient is "cold and wet" — fluids worsen pulmonary oedema. Small boluses only if clearly under-filled (e.g. RV infarct).',
        'Noradrenaline is preferred to maintain MAP; add an inotrope (dobutamine) for low output. Consider mechanical support (Impella/IABP) in specialist centres.',
        'Avoid nitrates and β-blockers in hypotension.',
      ],
      refs: ['NICE NG185: Acute coronary syndromes (2020)', 'ESC 2023 Guidelines for the management of acute coronary syndromes (adopted by the British Cardiovascular Society)', 'NICE CG187: Acute heart failure (2014, updated 2021)', 'ESC 2021 Heart failure guidelines and 2023 focused update — cardiogenic shock', 'AoA QRH 3-12: Massive myocardial ischaemia'],
    },
  });

  // =====================================================================
  // 7. Variceal upper GI bleed
  // =====================================================================
  add({
    id: 'em-variceal-bleed', qrh: ['3-2'], title: 'Upper GI bleed: oesophageal varices', field: 'EM', shock: 'Hypovolaemic (haemorrhagic)', difficulty: 3, setting: 'ed',
    eblExpected: 'Variceal haemorrhage: often 1–2 L before arrival, with more in the gut than is seen; restrictive transfusion (Hb 70–80 g/L) is the target.',
    bloodLoss: 'visible', bloodLossNote: 'seen in ED (plus ~1 L at home) — more remains in the gut',
    stem: '52-year-old man with alcohol-related cirrhosis. Two large haematemeses (~1 L fresh blood) at home. Pale, sweaty, mildly confused. Last drink yesterday.',
    patient: { age: 52, sex: 'M', weight: 70, vol: 0.66, bleed: 0.0009, coag: 0.9, hb: 74, lactate: 4.1, hrBase: 84, gcs: 14, rrBase: 22, look: { skin: '#e3c48e', sweaty: true } },
    tick(e, dt) {
      if (e.flags.bandAt && e.t >= e.flags.bandAt && e.p.bleed > 0) { e.p.bleed = 0; e.flags.banded = true; e.say('Endoscopy: large oesophageal varices with stigmata — 4 bands applied, haemostasis achieved.', 'good'); }
    },
    onEvent(e, ev) {
      const p = e.p;
      if (ev.type === 'drug' && ev.id === 'terlipressin' && !e.flags.terli) { e.flags.terli = true; p.bleed *= 0.5; return { msg: 'Terlipressin given — splanchnic vasoconstriction reducing portal pressure.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'endoscopy') {
        if (p.map < 60) return { handled: true, msg: 'Endoscopist: "Resuscitate first — MAP is too low for safe sedation/endoscopy." Request again once improved.', kind: 'warn' };
        e.flags.bandAt = e.t + 55;
        return { handled: true, msg: 'Endoscopist on the way — emergency OGD with band ligation in resus (airway protection considered).', kind: 'good' };
      }
      if (ev.type === 'fluid' && /^(crystalloid|colloid)$/.test(ev.kind) && (e.fluidIn.crystalloid + e.fluidIn.colloid) > 1000) return { harm: 'Excess crystalloid in variceal haemorrhage — raises portal pressure and dilutes clotting' };
      if (ev.type === 'fluid' && ev.kind === 'rbc' && p.hb > 100) return { harm: 'Over-transfusion (Hb > 100) — restrictive target 70–80 g/L reduces re-bleeding and mortality' };
    },
    exam: (e) => ({
      A: 'Patent. Blood in the mouth — suction available.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Chest clear.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Cool peripheries, CRT 4 s. Abdomen distended with shifting dullness; spider naevi, palmar erythema. PR: melaena.`,
      D: `GCS ${e.p.gcs}. Asterixis present.`,
      E: 'Jaundiced sclerae. Caput medusae. T 36.4 °C.',
    }),
    inv: {
      bloods: (e) => labs(e, { plt: 64, urea: 18.6, cr: 98, bili: 68, alt: 54, alb: 27, extra: [['Glasgow-Blatchford score', '15 (high risk)'], ['Group & save', 'Crossmatch 4 units']] }),
      ecg: {},
      cxr: { media: 'cxr_normal', report: 'No free subdiaphragmatic gas. Clear lungs.' },
      ct: [{ label: 'CT abdomen (portal venous)', media: 'ct_varices', report: 'Cirrhotic liver, splenomegaly, large oesophageal and gastric varices, moderate ascites. No active extravasation identified.' }],
      pocus: [
        { label: 'RUQ', media: 'us_fast_pos', report: 'Free fluid (ascites) around a small, nodular liver.' },
        { label: 'IVC', media: 'us_ivc_flat', report: 'Collapsing IVC.' },
        { label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Hyperdynamic LV.' },
      ],
    },
    critical: [
      { text: 'Terlipressin', check: (e) => e.did('terlipressin') },
      { text: 'Prophylactic antibiotics', check: (e) => e.did('antibiotics') },
      { text: 'Red cell transfusion (restrictive target)', check: (e) => e.fluidIn.rbc >= 280 },
      { text: 'Endoscopic band ligation', check: (e) => e.flags.banded },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      steps: [
        { t: 'Cirrhosis → portal hypertension (> 10–12 mmHg gradient)', kind: 'cause', rx: 'Terlipressin ↓ splanchnic flow & portal pressure' },
        { t: 'Porto-systemic collaterals form → fragile oesophageal varices rupture', rx: 'Endoscopic band ligation' },
        { t: 'Brisk haemorrhage → hypovolaemia → ↓ preload → ↓ CO', rx: 'Blood transfusion (target Hb 70–80)' },
        { t: 'Coagulopathy and thrombocytopenia of liver disease' },
        { t: 'Bacterial translocation → infection ↑ re-bleeding & mortality', rx: 'Prophylactic antibiotics' },
        { t: 'Shock, encephalopathy, hepatorenal syndrome', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Suspected variceal bleeding: terlipressin and prophylactic antibiotics at presentation (NICE CG141).',
        'Restrictive transfusion (Hb threshold 70, target 70–80 g/L) — over-transfusion raises portal pressure.',
        'Endoscopy immediately after resuscitation in unstable patients (within 24 h for all). Band ligation for oesophageal varices.',
        'If uncontrolled: balloon tamponade (Sengstaken–Blakemore) as a bridge to TIPSS.',
        'Do not routinely correct INR with FFP unless actively bleeding with significant coagulopathy.',
      ],
      refs: ['NICE CG141: Acute upper gastrointestinal bleeding in over 16s (2012, updated 2016)', 'British Society of Gastroenterology: UK guidelines on the management of variceal haemorrhage in cirrhotic patients (2015)', 'BSG: Acute upper GI bleeding care bundle (2019)'],
    },
  });

  // =====================================================================
  // 8. Hyperkalaemia with bradycardia
  // =====================================================================
  add({
    id: 'em-hyperkalaemia', title: 'Severe hyperkalaemia with bradycardia', field: 'EM', shock: 'Cardiogenic (arrhythmic)', difficulty: 2, setting: 'ed',
    stem: '70-year-old man on haemodialysis (Mon/Wed/Fri) missed his last two sessions. Generalised weakness and dizziness. Paramedic strip: "slow, broad complexes".',
    patient: { age: 70, sex: 'M', weight: 78, k: 7.7, hrBase: 40, baro: 0.35, contract: 0.8, atropineResp: 0.4, lactate: 2.1, extraAcid: 5, na: 135, look: { legs: { oedema: true } } },
    tick(e, dt) {
      const p = e.p;
      p.k += 0.0012 * dt;
      p.k -= (0.006 * clamp(e.E('insulin_glucose'), 0, 1) + 0.004 * clamp(e.E('salbutamol_neb') * 2, 0, 1) + 0.002 * clamp(e.E('bicarbonate') * 2, 0, 1)) * dt;
      if (e.flags.dialysis) p.k -= 0.004 * dt;
      p.k = clamp(p.k, 3.2, 9.5);
      const stab = clamp(e.E('calcium') * 1.6, 0, 0.85);
      const tox = clamp((p.k - 6) / 2.5, 0, 1) * (1 - stab);
      p.hrBase = 76 - 42 * tox;
      p.contract = 1 - 0.3 * tox;
      if (p.k > 8.3 && tox > 0.45) { p.rhythm = 'vf'; e.say('VF arrest — sine-wave rhythm degenerated.', 'bad'); }
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'icu_referral') { e.flags.dialysis = true; return { handled: true, msg: 'Renal team: emergency haemodialysis arranged — line being placed.', kind: 'good' }; }
      if (ev.type === 'action' && ev.id === 'pacing') return { msg: 'Capture is often unreliable in hyperkalaemia — treat the potassium.', kind: 'warn' };
      if (ev.type === 'drug' && ev.id === 'calcium') return { msg: 'Calcium stabilises the myocardium within minutes but does NOT lower K⁺ — repeat if ECG changes persist.', kind: 'info' };
    },
    exam: (e) => ({
      A: 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Fine bibasal crackles.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Left forearm AV fistula with good thrill. Peripheral oedema.`,
      D: 'GCS 15. Proximal muscle weakness (power 4/5).', E: 'T 36.8 °C.',
    }),
    inv: {
      bloods: (e) => labs(e, { urea: 38.2, cr: 1040, egfr: 4, na: 135, extra: [['Phosphate', '2.9 mmol/L (high)'], ['Bicarbonate (lab)', '14 mmol/L']] }),
      ecg: (e) => ({ note: `K⁺ ${e.p.k.toFixed(1)} mmol/L${e.E('calcium') > 0.2 ? ' — IV calcium has partially stabilised the membrane (QRS narrows, P waves return) but K⁺ is unchanged' : ' — hyperkalaemic ECG: treat immediately'}.` }),
      cxr: { media: null, report: 'Cardiomegaly, mild upper lobe diversion.' },
      ct: [],
      pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Moderately impaired LV, small pericardial rim (no tamponade).' }, { label: 'Lung', media: 'us_blines', report: 'Scattered B-lines bilaterally.' }],
    },
    critical: [
      { text: '12-lead ECG / continuous monitoring', check: (e) => e.did('inv_ecg') },
      { text: 'IV calcium (membrane stabilisation)', check: (e) => e.did('calcium') },
      { text: 'Insulin–glucose (shift K⁺)', check: (e) => e.did('insulin_glucose') },
      { text: 'Definitive removal: emergency dialysis (renal referral)', check: (e) => e.flags.dialysis },
    ],
    targets: { map: 65, spo2: 94, hrMin: 50, kMax: 6.5 },
    hint: {
      steps: [
        { t: 'Missed dialysis → K⁺ accumulates (+ acidosis shifts K⁺ out of cells)', kind: 'cause', rx: 'Dialysis removes K⁺' },
        { t: '↑ Extracellular K⁺ → resting membrane potential less negative', rx: 'Calcium restores the threshold gap' },
        { t: 'Partial Na⁺ channel inactivation → slow conduction: peaked T, loss of P, broad QRS', rx: 'Insulin–glucose, salbutamol shift K⁺ into cells' },
        { t: 'Bradycardia, AV block, ↓ contractility → ↓ CO' },
        { t: 'Sine wave → VF / asystole', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Protect the heart (calcium), shift K⁺ (insulin–glucose ± salbutamol), remove K⁺ (dialysis), monitor K⁺ and glucose.',
        'With ECG changes: IV calcium 6.8 mmol — 30 mL 10% calcium gluconate over 10 min, or 10 mL 10% calcium chloride over 5 min in (peri-)arrest; repeat if ECG changes persist (UKKA July 2026 downgraded this to a suggestion after the 2025 ILCOR review).',
        'Insulin 10 units with 25 g glucose IV; if pre-treatment glucose < 7.0 mmol/L follow with 10% glucose 50 mL/h for 5 h. Check glucose at 0, 30, 60, 90, 120, 180, 240, 300 and 360 min. Nebulised salbutamol 10–20 mg as an adjunct (never alone in severe hyperkalaemia).',
        'Remove K⁺: sodium zirconium cyclosilicate for severe hyperkalaemia (calcium resonium is no longer used acutely); dialysis if refractory or anuric. Recheck K⁺ at 1, 2, 4, 6 and 24 h for rebound.',
        'Pacing and atropine are often ineffective until K⁺ is treated.',
      ],
      refs: ['UK Kidney Association: Clinical practice guideline — Management of hyperkalaemia in adults (2023, updated July 2026)', 'Resuscitation Council UK 2025 Guidelines: Special circumstances — hyperkalaemia'],
    },
  });

  // =====================================================================
  // 9. β-blocker overdose
  // =====================================================================
  add({
    id: 'em-bb-overdose', title: 'β-blocker overdose', field: 'EM', shock: 'Cardiogenic (toxicological)', difficulty: 3, setting: 'ed',
    stem: '45-year-old woman found by her partner 2 hours after taking ~60 × propranolol 40 mg tablets. Drowsy, clammy. Ambulance: HR 38, BP 70/40.',
    patient: { age: 45, sex: 'F', weight: 65, contract: 0.6, hrBase: 36, catecholResp: 0.3, baro: 0.15, atropineResp: 0.35, vasoplegia: 0.95, glucose: 3.6, lactate: 3.2, gcs: 13, naBlock: 0.25, ecg: { pr: 0.245 } },
    tick(e, dt) {
      const p = e.p;
      if (!e.did('hiet') && !e.did('glucagon')) p.contract = Math.max(0.35, p.contract - 0.0003 * dt);
      if (e.did('hiet')) { p.catecholResp = toward(p.catecholResp, 0.75, 0.006, dt); p.contract = toward(p.contract, 0.75, 0.004, dt); }
      if (e.E('glucagon') > 0.05) p.hrBase = toward(p.hrBase, 50, 0.01, dt);
      if (e.did('hiet') && !e.flags.glucoseOK) { p.glucose = Math.max(2, p.glucose - 0.003 * dt); }
      if (e.did('glucose')) e.flags.glucoseOK = true, p.glucose = Math.max(p.glucose, 6);
    },
    onEvent(e, ev) {
      if (ev.type === 'drug' && ev.id === 'hiet') return { msg: 'HIET started: insulin 1 unit/kg bolus + infusion with glucose. Check glucose and K⁺ every 15–30 min.', kind: 'good' };
      if (ev.type === 'drug' && ev.id === 'glucose') return { msg: 'Glucose given/infusion running alongside insulin.' };
      if (ev.type === 'action' && ev.id === 'icu_referral') return { handled: true, msg: 'ICU accept. TOXBASE/NPIS consulted: continue HIET, consider lipid and ECMO if refractory.', kind: 'good' };
      if (ev.type === 'action' && ev.id === 'pacing') return { handled: false, msg: 'Pacing improves rate but cardiac output stays limited by poor contractility.' };
    },
    exam: (e) => ({
      A: 'Patent, snoring intermittently.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Clear chest.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Cool peripheries.`,
      D: `GCS ${e.p.gcs}. Capillary glucose ${e.p.glucose.toFixed(1)}.`, E: 'No injuries. Empty blister packs found.',
    }),
    inv: {
      bloods: (e) => labs(e, { extra: [['Paracetamol level', '<10 mg/L'], ['Salicylate', 'Not detected']] }),
      ecg: { note: 'propranolol — β-blockade (bradycardia, PR prolongation) plus sodium-channel blockade (QRS widening).' },
      cxr: { media: 'cxr_normal', report: 'Normal.' }, ct: [],
      pocus: [{ label: 'Parasternal long axis', media: 'us_plax_poor', report: 'Globally reduced LV contractility, no effusion.' }, { label: 'IVC', media: 'us_ivc_normal', report: 'Normal calibre IVC with some variation.' }],
    },
    critical: [
      { text: 'Atropine trial (first-line for bradycardia)', check: (e) => e.did('atropine') || e.did('glycopyrronium') },
      { text: 'Glucagon or high-dose insulin euglycaemic therapy', check: (e) => e.did('glucagon') || e.did('hiet') },
      { text: 'HIET with glucose monitoring/supplementation', check: (e) => e.did('hiet') && e.did('glucose') },
      { text: 'Critical care referral', check: (e) => e.did('icu_referral') },
    ],
    targets: { map: 65, spo2: 94, hrMin: 50 },
    hint: {
      steps: [
        { t: 'Propranolol blocks β1/β2 receptors (and Na⁺ channels at high dose)', kind: 'cause' },
        { t: '↓ cAMP in myocytes → ↓ Ca²⁺ entry → ↓ contractility and ↓ HR', rx: 'Glucagon & milrinone ↑ cAMP bypassing β-receptors' },
        { t: 'Catecholamines are relatively ineffective (receptors blocked)', rx: 'High-dose insulin: myocardium switches to glucose, improves inotropy' },
        { t: 'Bradycardia + ↓ SV → ↓ CO → shock', rx: 'Atropine, pacing as rescue' },
        { t: 'Refractory → lipid emulsion / ECMO', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'Seek TOXBASE/NPIS advice early. Give atropine, then glucagon (5–10 mg IV) and start HIET early.',
        'HIET: insulin 1 unit/kg bolus then 1–10 units/kg/h with glucose infusion; check glucose and K⁺ frequently.',
        'Catecholamines can be added but often have limited effect. Consider pacing, lipid emulsion and VA-ECMO for refractory shock.',
        'Propranolol is lipophilic and blocks Na⁺ channels — broad QRS may respond to sodium bicarbonate.',
      ],
      refs: ['TOXBASE (UK National Poisons Information Service): Beta-blockers', 'RCEM/NPIS: Guideline on antidote availability for emergency departments'],
    },
  });

  // =====================================================================
  // 10. Unstable SVT
  // =====================================================================
  add({
    id: 'em-unstable-svt', title: 'Tachyarrhythmia with adverse features', field: 'EM', shock: 'Cardiogenic (arrhythmic)', difficulty: 1, setting: 'ed',
    stem: '28-year-old woman with sudden-onset palpitations for 3 hours, now chest tightness and feeling faint. History of "fast heart" episodes since her teens.',
    patient: { age: 28, sex: 'F', weight: 58, rhythm: 'svt', fixedRate: 220, contract: 0.75, hrBase: 78, lactate: 2.6, look: { sweaty: true } },
    tick(e, dt) { if (e.p.rhythm === 'svt') e.p.contract = Math.max(0.55, e.p.contract - 0.0004 * dt); else e.p.contract = toward(e.p.contract, 1, 0.01, dt); },
    onEvent(e, ev) {
      const p = e.p;
      const convert = (m) => { p.rhythm = 'sinus'; p.hrBase = 80; e.mark('converted'); return { handled: true, msg: m, kind: 'good' }; };
      if (ev.type === 'action' && ev.id === 'sync_dc') {
        if (p.rhythm !== 'svt') return { handled: true, harm: 'DC cardioversion of sinus rhythm' };
        return convert('Synchronised shock 70 J under procedural sedation — converted to sinus rhythm.');
      }
      if (ev.type === 'drug' && ev.id === 'adenosine' && p.rhythm === 'svt') {
        if (ev.dose < 12 && !e.flags.aden6) { e.flags.aden6 = true; return { msg: 'Transient AV block for ~3 s, then SVT resumes. (Unstable patients should have synchronised DC shock.)', kind: 'warn' }; }
        return convert('Brief asystolic pause then sinus rhythm. Note: with adverse features, synchronised DC shock is first-line (RCUK).');
      }
      if (ev.type === 'action' && ev.id === 'vagal' && p.rhythm === 'svt') return { handled: true, msg: 'Modified Valsalva attempted — no response. Patient is unstable; proceed to synchronised cardioversion.' };
      if (ev.type === 'drug' && ev.id === 'amiodarone' && p.rhythm === 'svt') { p.fixedRate = 170; return { msg: 'Rate slows slightly to 170/min.' }; }
    },
    exam: (e) => ({
      A: 'Patent.', B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. Clear chest.`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}. Regular. Cool and clammy. ${e.p.rhythm === 'svt' ? 'Rapid neck pulsations (frog sign).' : ''}`,
      D: 'GCS 15, light-headed.', E: 'Nil else.',
    }),
    inv: {
      bloods: (e) => labs(e, { trop: 48, extra: [['TSH', '1.8 mU/L'], ['Magnesium', '0.82 mmol/L']] }),
      ecg: (e) => ({ note: e.p.rhythm === 'svt' ? 'likely AVNRT.' : 'no delta wave (no pre-excitation).' }),
      cxr: { media: 'cxr_normal', report: 'Normal.' }, ct: [],
      pocus: [{ label: 'Parasternal long axis', media: 'us_plax_normal', report: 'Very rapid rate, reduced filling time, globally hypokinetic during tachycardia.' }],
    },
    critical: [
      { text: '12-lead ECG', check: (e) => e.did('inv_ecg') },
      { text: 'Restore sinus rhythm (synchronised DC cardioversion first-line with adverse features)', check: (e) => e.p.rhythm === 'sinus' },
    ],
    targets: { map: 65, spo2: 94, hrMax: 120 },
    hint: {
      steps: [
        { t: 'Re-entry circuit within the AV node (AVNRT)', kind: 'cause', rx: 'Vagal manoeuvres / adenosine (if stable)' },
        { t: 'Ventricular rate ~200/min → diastolic filling time collapses', rx: 'Synchronised DC shock (up to 3 attempts) if adverse features' },
        { t: '↓ Preload per beat → ↓ SV; CO falls despite high HR' },
        { t: 'High O₂ demand + low diastolic coronary perfusion → ischaemia' },
        { t: 'Adverse features: shock, syncope, myocardial ischaemia, heart failure', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'RCUK 2025 tachyarrhythmia algorithm: life-threatening features (shock, syncope with ongoing hypotension, myocardial ischaemia, severe heart failure, immediately post-ROSC) → synchronised shock, up to 3 attempts, under sedation/anaesthesia.',
        'If DC fails: amiodarone 300 mg over 10–20 min and repeat shock.',
        'Stable narrow regular tachycardia: modified Valsalva, then adenosine 6 mg → 12 mg → 18 mg.',
        'Very fast rates shorten diastole — stroke volume falls so CO falls despite the high HR.',
      ],
      refs: ['Resuscitation Council UK 2025 Guidelines: Adult tachyarrhythmia algorithm (V3, March 2026)', 'REVERT trial — modified Valsalva (Lancet 2015, UK)'],
    },
  });

  // =====================================================================
  // 11. Life-threatening asthma
  // =====================================================================
  add({
    id: 'em-asthma', title: 'Life-threatening asthma', field: 'EM', shock: null, category: 'Respiratory', difficulty: 2, setting: 'ed',
    stem: '24-year-old woman with brittle asthma (2 previous ICU admissions). 6 hours of worsening breathlessness despite 20 puffs of salbutamol. Now unable to complete sentences.',
    patient: { age: 24, sex: 'F', weight: 60, bronchospasm: 0.72, shunt: 0.07, rrBase: 26, hrBase: 100, lactate: 2.2, look: { sweaty: true } },
    init(e) { e.p.load = 1; },
    tick(e, dt) {
      const p = e.p;
      const st = ['hydrocortisone', 'prednisolone'].map((d) => e.firstTime(d) ?? 1e9).reduce((a, b) => Math.min(a, b));
      if (e.t - st > 60) p.load = Math.max(0.35, p.load - 0.002 * dt);
      if (e.did('magnesium') && e.t - e.firstTime('magnesium') > 20) p.load = Math.max(0.35, p.load - 0.0006 * dt);
      p.bronchospasm = 0.72 * p.load;
      if (!p.ventilated) {
        if (p.bronchEff > 0.42) p.effort = Math.max(0.3, p.effort - 0.0016 * dt);
        else if (p.bronchEff < 0.3) p.effort = Math.min(1, p.effort + 0.003 * dt);
      }
      p.gcs = p.paco2 > 65 ? 12 : 15;
    },
    onEvent(e, ev) {
      if (ev.type === 'action' && ev.id === 'rsi_propofol') return { harm: 'Propofol in a hypovolaemic, gas-trapped asthmatic — ketamine is preferred' };
      if (ev.type === 'action' && (ev.id === 'rsi_ketamine' || ev.id === 'rsi_propofol')) e.after(1, (en) => en.say('Intubated. Watch for gas trapping — use low RR (8–10), long expiratory time, accept permissive hypercapnia.', 'warn'));
    },
    exam: (e) => ({
      A: 'Patent.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%. ${e.p.effort < 0.6 && !e.p.ventilated ? 'Exhausted, poor respiratory effort, SILENT CHEST.' : e.p.bronchEff > 0.3 ? 'Widespread polyphonic wheeze, prolonged expiration, accessory muscle use. PEF unrecordable.' : 'Scattered wheeze, moving air well.'}`,
      C: `HR ${e.p.hr}, BP ${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}.`,
      D: `GCS ${e.p.gcs}. ${e.p.paco2 > 60 ? 'Drowsy.' : 'Alert, anxious.'}`, E: 'No rash.',
    }),
    inv: {
      bloods: (e) => labs(e, { wcc: 13.1, extra: [['Peak flow', e.p.bronchEff > 0.4 ? 'Unable to perform' : `${Math.round(450 * (1 - e.p.bronchEff * 0.8))} L/min (best 450)`]] }),
      ecg: {},
      cxr: { media: null, report: 'Hyperinflated lungs, no pneumothorax, no consolidation.' }, ct: [],
      pocus: [{ label: 'Lung', media: 'us_sliding', report: 'Bilateral sliding — no pneumothorax.' }],
    },
    critical: [
      { text: 'Oxygen to SpO₂ 94–98%', check: oxygen },
      { text: 'Nebulised salbutamol (back-to-back)', check: (e) => e.count('salbutamol_neb') >= 1 || e.did('salbutamol_iv') },
      { text: 'Nebulised ipratropium 0.5 mg', check: (e) => e.did('ipratropium') },
      { text: 'Steroid immediately: prednisolone 40–50 mg PO or hydrocortisone 100 mg IV', check: (e) => e.did('hydrocortisone') || e.did('prednisolone') },
      { text: 'IV magnesium sulfate 1.2–2 g over 20 min (senior decision)', check: (e) => e.did('magnesium') },
      { text: 'Bronchospasm improving', check: (e) => e.p.bronchEff < 0.3 },
    ],
    targets: { map: 65, spo2: 94 },
    hint: {
      steps: [
        { t: 'Airway inflammation + smooth muscle constriction + mucus plugging', kind: 'cause', rx: 'β2 agonist, anticholinergic, magnesium; steroids' },
        { t: '↑ Airway resistance → slow, incomplete expiration' },
        { t: 'Gas trapping / dynamic hyperinflation (auto-PEEP)', rx: 'If ventilated: low RR, long expiration, disconnect if hypotensive' },
        { t: '↑ Intrathoracic pressure → ↓ venous return → hypotension' },
        { t: 'Respiratory muscle fatigue → normal/rising PaCO₂ = near-fatal', kind: 'end' },
      ],
    },
    debrief: {
      points: [
        'BTS/SIGN 158 (2025 amendment): life-threatening asthma = SpO₂ < 92% PLUS any one of altered conscious level, exhaustion, arrhythmia, hypotension, cyanosis, silent chest, poor respiratory effort, PEF < 33%, PaO₂ < 8 kPa or a "normal" PaCO₂ (4.6–6.0 kPa). Near-fatal = raised PaCO₂ and/or needing ventilation with raised inflation pressures. SpO₂ < 92% needs an arterial gas.',
        'Treatment: O₂ to SpO₂ 94–98%; oxygen-driven salbutamol 5 mg nebs (back-to-back if needed) with ipratropium 0.5 mg 4–6 hourly; prednisolone 40–50 mg (or hydrocortisone 100 mg IV 6-hourly) immediately and for ≥ 5 days.',
        'IV magnesium sulfate 1.2–2 g over 20 min after senior discussion. IV aminophylline (5 mg/kg load, then 0.5–0.7 mg/kg/h) only after senior consultation — little added benefit, more arrhythmias and vomiting. Heliox is not supported. IV β2 agonists only in the ventilated or in extremis.',
        'Worsening hypoxia or hypercapnia, drowsiness, exhaustion or respiratory arrest → ICU and intubation by an anaesthetist or ICU consultant. Ketamine induction; ventilate with a low rate, low Vt and long expiratory time; disconnect and decompress if pressures/BP collapse. ECMO for refractory near-fatal asthma where available.',
      ],
      refs: ['BTS/SIGN 158: British guideline on the management of asthma — acute asthma (revised November 2024, corrections May 2025)', 'BTS/NICE/SIGN NG245: Asthma — diagnosis, monitoring and chronic asthma management (2024)', 'HSE National Clinical Programme for Asthma: Model of care (Ireland)'],
    },
  });
})();
