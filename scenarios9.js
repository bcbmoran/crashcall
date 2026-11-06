/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Scenario library — part 9: obstetric anaesthesia (failed obstetric intubation, maternal cardiac arrest, eclampsia).
 * Scenario-specific options are revealed stage by stage (show(e)) so the player has to complete each step of the algorithm. */
(function () {
  const S = window.Sim;
  const clamp = S.clamp;
  const { add, any, toward, labs } = S.scnUtil;
  const bp = (e) => `${Math.round(e.p.sbp)}/${Math.round(e.p.dbp)}`;
  const OBS_REFS = ['OAA Obstetric Anaesthetic Emergencies Quick Reference Handbook (v1.2, 2024)'];

  // =====================================================================
  // OBS 1. Failed tracheal intubation at category 1 caesarean (OAA/DAS 2015)
  // =====================================================================
  add({
    id: 'an-obs-failed-intubation', title: 'Failed intubation at category 1 caesarean', field: 'Anaes', shock: null, category: 'Obstetric anaesthesia', difficulty: 3, setting: 'theatre',
    stem: 'Category 1 caesarean: 32-year-old, 39 weeks, cord prolapse with a persistent fetal bradycardia of 60/min. BMI 36, no epidural. She was preoxygenated (EtO₂ 0.88) and you have just given thiopental and rocuronium with cricoid pressure applied. The obstetrician is scrubbed and waiting. Secure the airway — follow the OAA/DAS obstetric guideline.',
    patient: { age: 32, sex: 'F', weight: 98, pregnant: true, cavalComp: 0.85, airwayPatent: true, effort: 0, fio2: 1, lastFio2: 1, shunt: 0.08, hrBase: 100, gcs: 3, look: { pregnant: true, surgField: 'lower' } },
    init(e) { const f = e.flags; f.paralysed = true; f.att = 0; f.sad = 0; f.oxyGap = true; f.cricoid = true; f.fetalT = 0; },
    start(e) { e.p.PAO2 = 480; e.p.sa = 0.99; e.say('Uterine displacement wedge in place. Cricoid pressure on. Fetal heart rate 60/min.', 'warn'); },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      // Pregnancy: reduced FRC and raised O₂ consumption — apnoeic desaturation is fast (HFNO / nasal O₂ slows it).
      if (!p.ventilated && (p.V || 0) < 0.15) p.PAO2 -= (p.PAO2 - 25) * dt / (e.did('hfno') || f.nasalO2 ? 140 : 50);
      if (!p.ventilated) p.hrBase = p.sa < 0.75 ? Math.max(35, 100 - (0.75 - p.sa) * 200) : 100;
      if (!f.delivered) f.fetalT += dt;
      // Proceeding on a SAD: anaesthesia must be maintained (thiopental wears off — awareness risk).
      if (f.decision === 'proceed' && !f.maintained && e.t - f.decT > 45 && !f.awareWarn) { f.awareWarn = true; e.say('BP and HR rising, lacrimation — she is getting light. Maintain anaesthesia (volatile).', 'bad'); p.hrBase += 20; }
    },
    complication(e) {
      if (e.flags.sadOK && !e.flags.delivered) { e.flags.regurg = true; e.p.shunt = Math.min(0.4, e.p.shunt + 0.12); e.say('Gastric fluid is coming up the drain tube of the SAD. Suction the drain, keep the head-up position — and reconsider: is proceeding still safe?', 'bad'); return; }
      return false;
    },
    actionStage: (e) => { const f = e.flags; if (f.delivered) return 'Baby delivered — maintain anaesthesia and the SAD; plan for emergence.'; if (f.decision === 'wake') return 'Waking the mother.'; if (f.sadOK) return 'Oxygenation via the SAD. STOP AND THINK: wake or proceed?'; if (f.declared) return 'Failed intubation — maintain oxygenation (SAD / facemask).'; return f.att ? `Intubation attempts: ${f.att} (obstetric maximum 2; a 3rd only by an experienced colleague). Oxygenate between attempts.` : 'Tracheal intubation.'; },
    extraActions: [
      { id: 'ob_vl', name: 'Videolaryngoscopy + bougie attempt', repeat: true, primary: true, show: (e) => !e.flags.declared && !e.p.ventilated },
      { id: 'ob_mask', name: 'Facemask ventilation, 100% O₂ (oxygenate between attempts)', repeat: true, show: (e) => e.flags.att >= 1 && !e.flags.declared },
      { id: 'ob_nasal', name: 'Nasal oxygen 15 L/min (apnoeic oxygenation)', show: (e) => !e.flags.declared },
      { id: 'ob_cricoid_off', name: 'Release cricoid pressure', show: (e) => e.flags.cricoid && (e.flags.att >= 1 || e.flags.declared) },
      { id: 'ob_senior', name: 'Call the most experienced anaesthetist', show: (e) => e.flags.att >= 1 && !e.flags.declared },
      { id: 'ob_declare', name: 'Declare failed intubation', primary: true, show: (e) => e.flags.att >= 2 && !e.flags.declared },
      { id: 'ob_sad', name: 'Insert second-generation SAD (i-gel / ProSeal)', repeat: true, primary: true, show: (e) => e.flags.declared && !e.flags.sadOK && !e.flags.decision },
      { id: 'ob_wake', name: 'Decision: WAKE — reverse with sugammadex, left lateral, deliver under regional', primary: true, show: (e) => e.flags.sadOK && !e.flags.decision },
      { id: 'ob_proceed', name: 'Decision: PROCEED with surgery on the SAD', primary: true, show: (e) => e.flags.sadOK && !e.flags.decision },
      { id: 'ob_sugammadex', name: 'Sugammadex 16 mg/kg IV (reverse rocuronium)', primary: true, show: (e) => e.flags.decision === 'wake' && !e.flags.reversed },
      { id: 'ob_maintain', name: 'Maintain anaesthesia: sevoflurane ~1 MAC via the SAD', show: (e) => e.flags.decision === 'proceed' && !e.flags.maintained },
      { id: 'ob_deliver', name: 'Tell the obstetrician to start — deliver the baby', primary: true, show: (e) => e.flags.decision === 'proceed' && !e.flags.delivered },
    ],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'drug' && ev.id === 'sugammadex') {
        if (f.decision === 'wake') { f.reversed = true; return { msg: 'Sugammadex 16 mg/kg — spontaneous breathing returns within 2 minutes. Left lateral, head up; she wakes. The baby is delivered under a spinal 15 minutes later.', kind: 'good' }; }
        return { msg: 'Sugammadex given — but you have not decided to wake her. Make the wake-or-proceed decision first.', kind: 'warn' };
      }
      if (ev.type !== 'action') return;
      const id = ev.id;
      if (id === 'ob_vl' || id === 'rsi_propofol' || id === 'rsi_ketamine') {
        if (p.ventilated) return { handled: true, msg: 'Already intubated.' };
        if (f.declared) return { handled: true, harm: 'Further laryngoscopy after failed intubation was declared (OAA/DAS)', msg: 'Another attempt: blood in the airway, no view.' };
        f.att++; p.assisted = false;
        if (f.att > 1 && !f.oxyGap) f.noOxyGap = true;
        f.oxyGap = false;
        if (f.att === 3 && !f.senior) return { handled: true, harm: 'A third intubation attempt not by a more experienced anaesthetist (OAA/DAS obstetric maximum is 2)', msg: 'Attempt 3: no better — grade 4 view.' };
        if (f.att > 3) return { handled: true, harm: 'Repeated intubation attempts beyond the OAA/DAS limit', msg: `Attempt ${f.att}: the airway is now oedematous. Declare failed intubation.` };
        const m = ['Attempt 1 (videolaryngoscope): only the epiglottis — the bougie will not pass. Laryngeal oedema of pregnancy. Oxygenate.',
          f.cricoid ? 'Attempt 2: still no view of the cords. Cricoid pressure may be distorting the view. That is two attempts — declare failed intubation.' : 'Attempt 2 (cricoid released): epiglottis only. That is two attempts — declare failed intubation.',
          'Attempt 3 (experienced colleague, different blade): grade 4 view. Declare failed intubation.'];
        return { handled: true, msg: m[f.att - 1], kind: 'bad' };
      }
      if (id === 'ob_mask' || id === 'bvm') {
        if (f.declared && !f.sadOK) { p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; return { handled: true, msg: 'Two-person facemask ventilation — capnography trace. Use it to oxygenate while you place a SAD.', kind: 'good' }; }
        p.assisted = true; p.fio2 = 1; p.lastFio2 = 1; f.oxyGap = true;
        return { handled: true, msg: f.cricoid ? 'Facemask ventilation with cricoid applied — small breaths but a trace. SpO₂ recovering.' : 'Facemask ventilation — chest rising, SpO₂ recovering.', kind: 'good' };
      }
      if (id === 'ob_nasal' || id === 'hfno') { f.nasalO2 = true; return { handled: true, msg: 'Nasal oxygen 15 L/min left in place — apnoeic oxygenation slows desaturation.', kind: 'good' }; }
      if (id === 'ob_cricoid_off') { f.cricoid = false; return { handled: true, msg: 'Cricoid pressure released (suction ready, head-up) — this can improve the view, mask ventilation and SAD placement.', kind: 'good' }; }
      if (id === 'ob_senior') { f.senior = true; return { handled: true, msg: 'The consultant anaesthetist is coming in from the next theatre.', kind: 'good' }; }
      if (id === 'ob_declare') { f.declared = true; return { handled: true, msg: '"Failed intubation." Inform the team — the obstetrician must NOT start. Maintain oxygenation: second-generation SAD.', kind: 'good' }; }
      if (id === 'ob_sad' || id === 'sga') {
        if (!f.declared) return { handled: true, msg: 'Declare failed intubation first so the whole team knows the plan has changed.', kind: 'warn' };
        f.sad++; p.assisted = false;
        if (f.cricoid) { if (f.sad >= 2) f.sadCricoid = true; return { handled: true, msg: `SAD attempt ${f.sad}: will not seat — cricoid pressure is in the way. Release cricoid pressure to place the SAD.`, kind: 'bad' }; }
        if (f.sad > 2) f.tooManySad = true;
        f.sadOK = true; p.sga = true; p.assisted = true; p.fio2 = 1; p.lastFio2 = 1;
        return { handled: true, msg: 'i-gel inserted with cricoid released — good seal, square capnography trace, gastric drain tube passed. SpO₂ recovering. STOP AND THINK.', kind: 'good' };
      }
      if (id === 'ob_sugammadex') { e.giveBolus('sugammadex', Math.round(16 * p.weight)); return { handled: true }; }
      if (id === 'ob_wake') { f.decision = 'wake'; f.decT = e.t; return { handled: true, msg: 'Decision: wake. Obstetrician stops. Give sugammadex 16 mg/kg (rocuronium), maintain oxygenation via the SAD, then left lateral and head up.', kind: 'info' }; }
      if (id === 'ob_proceed') { f.decision = 'proceed'; f.decT = e.t; return { handled: true, msg: 'Decision: proceed. Mother well oxygenated via a well-seated SAD, no regurgitation, and the baby is at immediate risk — Table 1 favours proceeding. Maintain anaesthesia and tell the obstetrician to start.', kind: 'good' }; }
      if (id === 'ob_maintain' || id === 'deepen_anaesthesia') { f.maintained = true; p.hrBase = 100; return { handled: true, msg: 'Sevoflurane 1 MAC in 50% oxygen via the SAD; hand ventilation with low airway pressures; minimise fundal pressure.', kind: 'good' }; }
      if (id === 'ob_deliver') {
        if (!f.maintained) f.unmaintained = true;
        f.delivered = true; const mins = Math.round(f.fetalT / 30);
        return { handled: true, msg: `Baby delivered ${mins <= 4 ? 'quickly' : 'after a delay'} — ${mins <= 4 ? 'cries after inflation breaths.' : 'needs full newborn resuscitation.'} Oxytocin 3 units slow IV.`, kind: mins <= 4 ? 'good' : 'warn' };
      }
      if (id === 'fona' && f.sadOK) return { harm: 'Front-of-neck access while the SAD was oxygenating well (not CICO)' };
    },
    exam: (e) => ({
      A: e.p.sga ? 'Second-generation SAD in place, square capnography trace.' : e.p.assisted ? 'Facemask ventilation in progress.' : 'Apnoeic after RSI — no airway device.',
      B: `SpO₂ ${e.p.spo2}%. ${e.p.assisted || e.p.sga ? 'Chest rising.' : 'No ventilation.'}`,
      C: `HR ${e.p.hr}, BP ${bp(e)}. Fetal HR ${e.flags.delivered ? '— delivered' : '60/min (persistent bradycardia)'}.`,
      D: 'Paralysed (rocuronium).', E: 'Term pregnancy, wedge in place. Large breasts, short neck.',
    }),
    inv: { bloods: (e) => labs(e, { hb: 118, plt: 210 }), ecg: {}, cxr: { media: null, report: 'Not appropriate now.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Call for help (most experienced anaesthetist)', check: (e) => e.did('call_help') || e.flags.senior },
      { text: 'Maximum 2 intubation attempts (a 3rd only by an experienced colleague)', check: (e) => e.flags.att >= 1 && (e.flags.att <= 2 || (e.flags.att === 3 && e.flags.senior)) },
      { text: 'Oxygenate with a facemask between attempts', check: (e) => e.flags.att >= 2 && !e.flags.noOxyGap },
      { text: 'Declare failed intubation (obstetrician told not to start)', check: (e) => !!e.flags.declared },
      { text: 'Release cricoid pressure to place the SAD', check: (e) => !e.flags.cricoid && !!e.flags.sadOK },
      { text: 'Oxygenation via a second-generation SAD', check: (e) => !!e.flags.sadOK },
      { text: 'Stop and think: decide to wake or proceed (OAA/DAS Table 1)', check: (e) => !!e.flags.decision },
      { text: 'Act on it: proceed with maintained anaesthesia and deliver — or wake with sugammadex', check: (e) => (e.flags.decision === 'proceed' && e.flags.maintained && e.flags.delivered) || (e.flags.decision === 'wake' && e.flags.reversed) },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Pregnancy: airway oedema, large breasts, full stomach, ↓ FRC and ↑ O₂ use', kind: 'cause', rx: 'Head-up, preoxygenate, nasal O₂' },
      { t: 'Failed intubation is ~8× commoner in obstetrics', rx: '≤ 2 attempts (3rd by an experienced colleague); oxygenate between' },
      { t: 'Declare failed intubation; release cricoid if it hinders the SAD', rx: 'Second-generation SAD' },
      { t: 'Stop and think — wake or proceed (Table 1: maternal and fetal condition, airway, aspiration)', rx: 'Proceed: maintain anaesthesia and deliver. Wake: sugammadex, left lateral' },
      { t: 'If oxygenation fails at any point → CICO → front-of-neck access', kind: 'end' },
    ] },
    debrief: {
      points: [
        'OAA/DAS obstetric guideline: plan before induction (including whether you would wake or proceed); head-up position, preoxygenate to EtO₂ ≥ 0.9 with nasal oxygen; cricoid pressure 10 N awake → 30 N after loss of consciousness.',
        'Maximum two attempts at laryngoscopy (a third only by a more experienced anaesthetist). Oxygenate with a facemask between attempts. Then declare failed intubation and tell the team — the obstetrician must not start.',
        'Maintain oxygenation with a second-generation SAD; release cricoid pressure if it hinders SAD placement or ventilation (with suction ready).',
        'Stop and think — Table 1: maternal condition (cardiac arrest, haemorrhage, hypoxia favour proceeding), fetal condition (sustained bradycardia, cord prolapse, abruption favour proceeding), anaesthetist experience, obesity, surgical complexity, aspiration risk and airway quality. A well-seated SAD with no regurgitation and a baby at immediate risk favours proceeding.',
        'If proceeding: maintain anaesthesia (volatile — awareness is a real risk; NAP5 found obstetrics had the highest incidence), low airway pressures, minimal fundal pressure. If waking: sugammadex 16 mg/kg, left lateral, then regional or awake tracheal intubation. If oxygenation fails at any point: CICO → front-of-neck access.',
      ],
      refs: ['Obstetric Anaesthetists\' Association & Difficult Airway Society: Guidelines for the management of difficult and failed tracheal intubation in obstetrics (2015)', ...OBS_REFS, 'NAP5: Accidental awareness during general anaesthesia (RCoA/AAGBI, 2014)'],
    },
  });

  // =====================================================================
  // OBS 2. Maternal cardiac arrest — resuscitative hysterotomy (perimortem caesarean)
  // =====================================================================
  add({
    id: 'an-obs-arrest', title: 'Maternal cardiac arrest on the labour ward', field: 'Anaes', shock: 'Hypovolaemic (arrest)', category: 'Obstetric anaesthesia', difficulty: 3, setting: 'ward', als: true, arrestLimit: 480,
    stem: 'Obstetric emergency call to the antenatal ward: 34-year-old, 36 weeks, complained of severe constant abdominal pain and then collapsed. The midwife says she is not breathing. The monitor shows a narrow-complex rhythm at 110 — no pulse.',
    patient: { age: 34, sex: 'F', weight: 82, pregnant: true, cavalComp: 0.55, rhythm: 'pea', peaRate: 110, vol: 0.58, hb: 82, bleed: 0.0004, coag: 0.35, lactate: 6, look: { pregnant: true } },
    arrestRhythm: () => 'pea',
    arrestMsg: 'MATERNAL CARDIAC ARREST — no pulse. Declare it, start CPR with uterine displacement, call the obstetric and neonatal teams.',
    rosc(e) {
      const f = e.flags;
      const ok = f.cpr && e.did('uterine_displacement') && e.did('adrenaline') && f.pmcs && (e.fluidIn.rbc + e.fluidIn.crystalloid >= 1000);
      if (ok) { f.rw = (f.rw || 0) + 0.1; if (f.rw > 12) { e.p.vol = Math.max(e.p.vol, 0.72); return true; } }
      return false;
    },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      if (p.arrested && f.cpr && !e.did('uterine_displacement')) f.cprNoLud = (f.cprNoLud || 0) + dt;
      if (f.cprNoLud > 45 && !f.ludHarm) { f.ludHarm = true; e.harm('CPR without manual uterine displacement — aortocaval compression makes compressions ineffective'); }
      if (p.arrested && !f.pmcs && (e.arrestT || 0) > 300 && !f.lateHarm) { f.lateHarm = true; e.harm('Resuscitative hysterotomy not performed within 5 minutes of arrest'); }
      if (f.haem >= 2) p.bleed = toward(p.bleed, 0, 0.05, dt);
    },
    actionStage: (e) => { const f = e.flags, p = e.p; if (!p.arrested && e.did('rosc')) return 'ROSC — now control the haemorrhage (MHP, uterotonics, TXA).'; if (f.pmcs) return 'Baby delivered — continue ALS; treat the cause (haemorrhage).'; if (f.declared) return `Arrest time ${Math.floor(e.arrestT || 0)} s — resuscitative hysterotomy by 5 minutes if no ROSC.`; return 'Declare maternal cardiac arrest.'; },
    extraActions: [
      { id: 'ob_declare_arrest', name: 'Declare obstetric cardiac arrest — call obstetric, anaesthetic & neonatal teams; start the clock', primary: true, show: (e) => !e.flags.declared },
      { id: 'ob_lud', name: 'Manual left uterine displacement (keep it on during CPR)', primary: true, show: (e) => !!e.flags.declared && !e.did('uterine_displacement') && !e.flags.pmcs },
      { id: 'ob_iv_above', name: 'Large-bore IV access above the diaphragm (or humeral IO)', show: (e) => !!e.flags.declared },
      { id: 'ob_pmcs_prep', name: 'Open the perimortem caesarean pack here (scalpel)', show: (e) => !!e.flags.declared && !e.flags.prep },
      { id: 'ob_transfer', name: 'Move her to theatre for the caesarean', show: (e) => !!e.flags.declared && !e.flags.pmcs && !e.flags.transferHarm },
      { id: 'ob_pmcs', name: 'Resuscitative hysterotomy (perimortem caesarean) where she lies', primary: true, show: (e) => !!e.flags.prep && !e.flags.pmcs },
      { id: 'ob_uterotonic', name: 'Uterine massage + bimanual compression', show: (e) => !!e.flags.pmcs },
      { id: 'ob_haem', name: 'Obstetric haemostasis: abruption bed, uterine sutures (to theatre after ROSC)', primary: true, show: (e) => !!e.flags.pmcs && !e.p.arrested && !e.flags.haemDone },
    ],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'action') {
        switch (ev.id) {
          case 'ob_lud': e.mark('uterine_displacement'); return { handled: true, msg: 'Second person manually displacing the uterus to the left throughout compressions — aortocaval compression relieved.', kind: 'good' };
          case 'ob_declare_arrest': f.declared = true; return { handled: true, msg: '"Obstetric cardiac arrest — time 00:00." Obstetric, anaesthetic, neonatal and theatre teams called. Note the time for the 5-minute target.', kind: 'good' };
          case 'ob_iv_above': f.ivAbove = true; return { handled: true, msg: 'Two large-bore cannulae in the antecubital fossae — drugs and fluid reach the heart (femoral lines are blocked by the gravid uterus).', kind: 'good' };
          case 'ob_pmcs_prep': f.prep = true; return { handled: true, msg: 'Perimortem caesarean pack open on the bed. Obstetric registrar scrubbing — no need to move her or wait for skin prep.', kind: 'good' };
          case 'ob_transfer': f.transferHarm = true; f.prep = true; return { handled: true, harm: 'Moving the woman to theatre for a perimortem caesarean — it should be done where she is, without delay', msg: 'Transfer to theatre interrupts compressions and wastes the 5-minute window. Do it here.' };
          case 'ob_pmcs': {
            f.pmcs = true; f.pmcsT = e.arrestT || 0; p.pregnant = false; p.cavalComp = 1; p.vol = Math.min(0.8, p.vol + 0.06);
            const good = f.pmcsT <= 300;
            return { handled: true, msg: `Resuscitative hysterotomy at ${Math.floor(f.pmcsT / 60)} min ${Math.floor(f.pmcsT % 60)} s: baby delivered and handed to the neonatal team${good ? ' — heart rate 80, responding to inflation breaths' : ' — floppy, no heart rate; full newborn resuscitation'}. Aortocaval compression relieved. A large retroplacental clot — placental abruption.`, kind: good ? 'good' : 'warn' };
          }
          case 'ob_uterotonic': case 'bimanual': f.haem = (f.haem || 0) + 0.5; return { handled: true, msg: 'Uterine massage and bimanual compression — uterus firming.', kind: 'good' };
          case 'ob_haem': f.haemDone = true; f.haem = (f.haem || 0) + 2; return { handled: true, msg: 'Obstetricians control the placental bed and close the uterus. Bleeding slowing.', kind: 'good' };
        }
      }
      if (ev.type === 'drug' && (ev.id === 'oxytocin' || ev.id === 'carboprost' || ev.id === 'txa')) { if (f.pmcs) f.haem = (f.haem || 0) + 0.6; }
      if (ev.type === 'drug' && ev.id === 'adrenaline' && p.arrested) return { msg: 'Adrenaline 1 mg IV — standard doses in pregnancy.', kind: 'good', noHarm: true };
      if (ev.type === 'fluid' && ev.kind === 'crystalloid' && e.fluidIn.crystalloid > 1500) return { harm: 'Large-volume crystalloid in obstetric haemorrhage — use blood products' };
    },
    exam: (e) => ({
      A: 'Bag-mask ventilation (aspiration risk — early SAD or tracheal tube).',
      B: e.p.arrested ? 'No spontaneous breathing.' : `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.`,
      C: e.p.arrested ? `No central pulse. ${e.flags.pmcs ? 'Uterus empty.' : 'Uterus hard and tender ("woody") — fundus above the umbilicus.'}` : `HR ${e.p.hr}, BP ${bp(e)}.`,
      D: e.p.arrested ? 'Unresponsive.' : `GCS ${e.p.gcs}.`, E: 'Small amount of dark PV bleeding — much less than her collapse would suggest (concealed abruption).',
    }),
    inv: { bloods: (e) => labs(e, { hb: 82, plt: 96, fib: '1.1' }), gas: true, ecg: {}, cxr: { media: null, report: 'Not appropriate during arrest.' }, ct: [], pocus: [{ label: 'Subcostal (pulse check)', media: 'us_ivc_flat', report: 'Small, hyperdynamic ventricles; no effusion — hypovolaemia.' }] },
    critical: [
      { text: 'Declare obstetric arrest; call obstetric and neonatal teams', check: (e) => !!e.flags.declared },
      { text: 'High-quality CPR', check: (e) => e.did('cpr_on') },
      { text: 'Manual left uterine displacement during CPR', check: (e) => e.did('uterine_displacement') },
      { text: 'Adrenaline 1 mg (non-shockable)', check: (e) => e.did('adrenaline') },
      { text: 'Resuscitative hysterotomy where she lies, by 5 minutes', check: (e) => e.flags.pmcs && e.flags.pmcsT <= 300 },
      { text: 'Blood / major haemorrhage protocol', check: (e) => e.did('mhp') && e.fluidIn.rbc > 0 },
      { text: 'Control the haemorrhage after ROSC (uterotonics, TXA, surgical)', check: (e) => (e.flags.haem || 0) >= 2 },
    ],
    targets: { map: 65, spo2: 94 },
    hint: { steps: [
      { t: 'Concealed placental abruption → hypovolaemia', kind: 'cause', rx: 'MHP, blood, surgery' },
      { t: 'Gravid uterus compresses IVC/aorta → almost no venous return during CPR', rx: 'Manual left uterine displacement' },
      { t: 'No ROSC by 4 minutes', rx: 'Resuscitative hysterotomy where she lies — baby out by 5 minutes' },
      { t: 'Emptying the uterus restores venous return and treats the cause', rx: 'Then uterotonics, TXA, fibrinogen' },
      { t: 'Maternal and fetal death', kind: 'end' },
    ] },
    debrief: {
      points: [
        'Declare "obstetric cardiac arrest", call the obstetric, anaesthetic and neonatal teams, and start the clock. Standard ALS drugs, doses and shock energies apply.',
        'Relieve aortocaval compression from the start: lie her flat and displace the uterus manually to the left (or 15–30° left tilt on a firm surface). Without it, compressions generate very little cardiac output after 20 weeks.',
        'Resuscitative hysterotomy (perimortem caesarean) at ≥ 20 weeks: perform it where she lies — no transfer, no skin prep — if there is no ROSC, aiming to deliver by 5 minutes. Do it immediately for fatal maternal injury or prolonged pre-hospital arrest. It is done primarily to save the mother.',
        'Airway: early SAD or tracheal tube by an experienced operator (aspiration, difficult airway); waveform capnography. IV access above the diaphragm.',
        'Think about causes: haemorrhage (including concealed abruption), PE, amniotic fluid embolism, local anaesthetic or magnesium toxicity, eclampsia, sepsis, cardiac disease. After ROSC expect haemorrhage: MHP, oxytocin and further uterotonics, TXA 1 g, fibrinogen.',
      ],
      refs: ['Resuscitation Council UK 2025 Guidelines: Special circumstances — cardiac arrest in pregnancy', 'OAA Obstetric QRH 1-1: Obstetric cardiac arrest (v2, 2024)', 'MBRRACE-UK: Saving Lives, Improving Mothers\' Care', 'RCOG Green-top Guideline 56: Maternal collapse in pregnancy and the puerperium'],
    },
  });

  // =====================================================================
  // OBS 3. Eclampsia (NICE NG133 / OAA QRH 2-1)
  // =====================================================================
  const mgLevel = (e) => e.flags.mg || 0.8;
  add({
    id: 'an-obs-eclampsia', title: 'Seizure on the antenatal ward at 34 weeks', field: 'Anaes', shock: null, category: 'Obstetric anaesthesia', difficulty: 2, setting: 'ward',
    stem: 'Emergency call: 27-year-old, 34 weeks, first pregnancy, admitted this morning with headache and BP 158/104. She has just had a tonic-clonic seizure lasting about a minute and is now drowsy. BP 184/116. The midwife has the eclampsia box.',
    patient: { age: 27, sex: 'F', weight: 72, pregnant: true, cavalComp: 0.92, vasoplegia: 0.92, contract: 1.7, hrBase: 100, gcs: 9, look: { pregnant: true } },
    init(e) { const f = e.flags; f.mg = 0.8; f.mgLoad = 0; f.nextSeiz = 75; f.sbpHi = 0; },
    tick(e, dt) {
      const p = e.p, f = e.flags;
      // Magnesium: bolus load decays (compressed t½ ~ 4 min); the infusion maintains a level.
      f.mgLoad *= Math.exp(-dt / 350);
      const inf = e.rate('magnesium') || 0;
      const tgt = 0.8 + 0.42 * f.mgLoad + 1.5 * inf;
      f.mg = toward(f.mg, tgt, 0.05, dt);
      const mg = f.mg, ca = f.caT && e.t - f.caT < 240;
      // Toxicity: loss of reflexes (> ~5), respiratory depression (> ~6), conduction block (> ~7.5) — calcium antagonises temporarily.
      const tox = ca ? 0 : clamp((mg - 5) / 3, 0, 1);
      if (!p.ventilated) p.effort = clamp(1 - 0.8 * tox - (f.seizing ? 0.7 : 0), 0.15, 1);
      p.hrBase = 104 - 30 * tox;
      if (tox > 0.2 && !f.toxSaid) { f.toxSaid = true; e.say('Midwife: "Her knee reflexes have gone and her breathing is slow." Magnesium toxicity?', 'bad'); }
      // Seizures recur unless magnesium is therapeutic (~2–4 mmol/L).
      if (f.seizing && e.t > f.seizEnd) { f.seizing = false; e.say('Seizure stopped. She is post-ictal.', 'warn'); }
      if (!f.seizing && e.t > f.nextSeiz) {
        if (mg < 1.9) { f.seizing = true; f.seizEnd = e.t + 45; f.seizCount = (f.seizCount || 0) + 1; e.say(`Another tonic-clonic seizure! (Mg ${mg.toFixed(1)} mmol/L)`, 'bad'); }
        f.nextSeiz = e.t + 110;
      }
      p.gcs = f.seizing ? 3 : tox > 0.5 ? 9 : mg < 1.9 ? 11 : 14;
      if (f.seizing && !p.ventilated) p.airwayPatent = e.did('airway_manoeuvre') || e.did('uterine_displacement');
      else if (!p.ventilated) p.airwayPatent = true;
      // Severe hypertension: cerebral haemorrhage risk if SBP ≥ 160 is left untreated.
      if (p.sbp >= 160) f.sbpHi += dt; else f.sbpHi = Math.max(0, f.sbpHi - dt * 0.5);
      if (f.sbpHi > 200 && !f.ich) { f.ich = true; e.harm('Severe hypertension (SBP ≥ 160) left uncontrolled — intracerebral haemorrhage'); }
      if (p.sbp < 110 && !p.ventilated && !f.overHarm && e.t > 20) { f.overHarm = true; e.harm('Blood pressure over-corrected (SBP < 110) — placental perfusion falls, fetal bradycardia'); }
      if (e.fluidIn.crystalloid > 1000 && !f.fluidHarm) { f.fluidHarm = true; p.pulmOedema = Math.min(1, (p.pulmOedema || 0) + 0.5); e.harm('More than 1 L of IV fluid in severe pre-eclampsia — pulmonary oedema (restrict to 80 mL/h)'); }
    },
    complication(e) {
      if (e.level !== 'consultant') return false;
      e.flags.gaCase = true;
      e.say('Obstetric registrar: "The CTG has prolonged decelerations — we need a category 2 caesarean. Platelets are 62, so no spinal." This will be a general anaesthetic: plan the RSI.', 'warn');
    },
    actionStage: (e) => { const f = e.flags; if (f.gaCase && !e.p.ventilated) return 'Category 2 caesarean under GA (platelets 62): attenuate the pressor response before laryngoscopy.'; if (f.seizing) return 'SEIZING — protect the airway, left lateral, oxygen; magnesium.'; return 'Eclampsia: magnesium, BP control, fluid restriction, then plan birth.'; },
    extraActions: [
      { id: 'ob_eclampsia_call', name: 'Call obstetric, anaesthetic and midwifery teams; eclampsia box', show: (e) => !e.did('ob_eclampsia_call') },
      { id: 'ob_lateral', name: 'Left lateral (recovery) position, airway support', show: (e) => !e.did('uterine_displacement') },
      { id: 'ob_reflexes', name: 'Check patellar reflexes and respiratory rate (magnesium monitoring)', repeat: true, show: (e) => e.did('magnesium') },
      { id: 'ob_mg_level', name: 'Send serum magnesium level', repeat: true, show: (e) => e.did('magnesium') },
      { id: 'ob_catheter', name: 'Urinary catheter, strict fluid balance (80 mL/h max)', show: () => true },
      { id: 'ob_ctg', name: 'Continuous CTG', show: () => true },
      { id: 'ob_plan', name: 'Plan birth with the obstetric consultant once stabilised', primary: true, show: (e) => e.did('magnesium') && !e.did('ob_plan') },
    ],
    onEvent(e, ev) {
      const f = e.flags, p = e.p;
      if (ev.type === 'drug' && (ev.id === 'alfentanil' || ev.id === 'labetalol' || ev.id === 'remifentanil')) f.attenT = e.t;
      if (ev.type === 'drug' && ev.id === 'magnesium') {
        f.mgLoad += ev.dose;
        if (!f.mgFirst) { f.mgFirst = true; if (ev.dose < 4) return { msg: `Magnesium ${ev.dose} g given — the eclampsia loading dose is 4 g over 5 minutes.`, kind: 'warn' }; return { msg: 'Magnesium sulfate 4 g IV over 5 minutes (Collaborative Eclampsia Trial regimen). Now start the maintenance infusion: 1 g/h for 24 h.', kind: 'good' }; }
        if (f.mgLoad > 9) return { harm: 'Repeated magnesium boluses without checking reflexes or levels — magnesium toxicity', msg: `Magnesium ${ev.dose} g given.` };
        return { msg: f.seizing ? 'Magnesium 2 g for a recurrent seizure.' : `Magnesium ${ev.dose} g given.`, kind: 'info' };
      }
      if (ev.type === 'inf' && ev.id === 'magnesium' && ev.rate > 2) return { harm: 'Magnesium infusion above 2 g/h — risk of toxicity' };
      if (ev.type === 'drug' && (ev.id === 'lorazepam' || ev.id === 'midazolam_buccal') && !e.did('magnesium')) return { harm: 'Benzodiazepine used instead of magnesium for eclampsia (NICE NG133: do not use diazepam or phenytoin)' };
      if (ev.type === 'drug' && ev.id === 'calcium') { f.caT = e.t; return { msg: 'Calcium given — antagonises magnesium for a short time. Stop the magnesium infusion and check the level.', kind: 'good' }; }
      if (ev.type === 'drug' && ev.id === 'labetalol') return { msg: 'IV labetalol (OAA: 50 mg over 2 min, repeat every 5 min to 200 mg, then infusion). Aim for SBP < 160 and DBP < 110 (NICE target ≤ 135/85 once stable).', kind: 'good' };
      if (ev.type === 'action') {
        switch (ev.id) {
          case 'ob_lateral': e.mark('uterine_displacement'); e.mark('airway_manoeuvre'); return { handled: true, msg: 'Left lateral position, jaw support and suction — airway protected, aortocaval compression relieved. Do not restrain her.', kind: 'good' };
          case 'ob_eclampsia_call': return { handled: true, msg: 'Obstetric, anaesthetic and midwifery teams here; eclampsia box open (magnesium, labetalol, hydralazine, calcium gluconate).', kind: 'good' };
          case 'ob_reflexes': { const mg = mgLevel(e), ca = f.caT && e.t - f.caT < 240; return { handled: true, msg: mg > 5 && !ca ? `Patellar reflexes ABSENT, RR ${p.rr} — magnesium toxicity: stop the infusion, give calcium gluconate, check the level.` : `Patellar reflexes present, RR ${p.rr}, urine output adequate.`, kind: mg > 5 && !ca ? 'bad' : 'info' }; }
          case 'ob_mg_level': { const mg = mgLevel(e); return { handled: true, msg: `Serum magnesium ${mg.toFixed(1)} mmol/L (therapeutic 2–4).`, kind: mg >= 2 && mg <= 4 ? 'good' : 'warn' }; }
          case 'ob_catheter': return { handled: true, msg: 'Catheter in; hourly urine output. Fluids restricted to 80 mL/h in total.', kind: 'good' };
          case 'ob_ctg': return { handled: true, msg: f.gaCase ? 'CTG: prolonged decelerations.' : 'CTG: fetal tachycardia 165 with reduced variability after the seizure — improving as she recovers.', kind: 'info' };
          case 'ob_plan': if (f.seizing || p.sbp >= 160) return { handled: true, harm: 'Rushing to deliver before the mother is stabilised (seizures and BP controlled)', msg: 'Stabilise the mother first — seizures controlled and BP < 160/110.' }; f.planned = true; return { handled: true, msg: 'Obstetric consultant: stabilised — plan induction or caesarean in the next few hours on the delivery suite, with magnesium continued for 24 h.', kind: 'good' };
          case 'rsi_propofol': case 'rsi_ketamine': {
            if (!f.gaCase) return { handled: true, msg: 'She does not need intubating — protect the airway in the left lateral position and give magnesium.', kind: 'warn' };
            const intubate = () => { p.ventilated = true; p.assisted = false; p.effort = 0; p.fio2 = 1; p.lastFio2 = 1; p.peep = 5; p.ventRR = 14; e.flags.paralysed = true; e.flags.airway = 'ett'; };
            intubate(); f.gaDone = true;
            if (!f.attenT || e.t - f.attenT > 120) { p.vasoplegia = 1.5; e.after(40, (en) => { en.p.vasoplegia = 0.92; }); return { handled: true, harm: 'RSI without attenuating the pressor response in pre-eclampsia — hypertensive surge at laryngoscopy (stroke risk)', msg: 'Thiopental and rocuronium; intubated — BP surges to over 220 systolic at laryngoscopy.' }; }
            f.gaAtten = true; return { handled: true, msg: 'Pressor response attenuated (alfentanil / labetalol). Thiopental + rocuronium, smooth intubation, capnography confirmed. Magnesium potentiates rocuronium — monitor neuromuscular block.', kind: 'good' };
          }
        }
      }
    },
    exam: (e) => ({
      A: e.flags.seizing ? 'Seizing — jaw clenched, frothing.' : 'Own airway, post-ictal.',
      B: `RR ${e.p.rr}, SpO₂ ${e.p.spo2}%.${e.p.pulmOedema > 0.3 ? ' Bibasal crackles.' : ''}`,
      C: `HR ${e.p.hr}, BP ${bp(e)}. Generalised oedema.`,
      D: `GCS ${e.p.gcs}. ${e.flags.seizing ? 'Tonic-clonic seizure.' : 'Hyperreflexia with 3 beats of clonus.'}`,
      E: '34 weeks. Epigastric tenderness.',
    }),
    inv: { bloods: (e) => labs(e, { plt: e.flags.gaCase ? 62 : 92, alt: 168, cr: 88, extra: [['Urate', '0.46 mmol/L'], ['Urine protein:creatinine ratio', '210 mg/mmol'], ['Serum magnesium', `${(e.flags.mg || 0.8).toFixed(1)} mmol/L`]] }), gas: true, ecg: {}, cxr: { media: null, report: 'Not indicated.' }, ct: [], pocus: [] },
    critical: [
      { text: 'Call for help (obstetric, anaesthetic, midwifery)', check: (e) => e.did('ob_eclampsia_call') || e.did('call_help') },
      { text: 'Airway, left lateral position, high-flow oxygen', check: (e) => (e.did('uterine_displacement') || e.did('airway_manoeuvre')) && any(e, 'o2_nrb', 'o2_nc', 'hfno') },
      { text: 'Magnesium sulfate 4 g IV loading dose', check: (e) => !!e.flags.mgFirst && e.total('magnesium') >= 4 },
      { text: 'Magnesium maintenance infusion 1 g/h', check: (e) => e.rate('magnesium') >= 0.5 },
      { text: 'Treat severe hypertension (IV labetalol) to SBP < 160', check: (e) => e.did('labetalol') && e.p.sbp < 160 },
      { text: 'Monitor for magnesium toxicity (reflexes, RR, level)', check: (e) => e.did('ob_reflexes') || e.did('ob_mg_level') },
      { text: 'Fluid restriction and catheter', check: (e) => e.did('ob_catheter') && e.fluidIn.crystalloid <= 1000 },
      { text: 'Stabilise first, then plan birth', check: (e) => !!e.flags.planned },
      { text: 'GA caesarean: attenuate the pressor response before RSI', check: (e) => !!e.flags.gaAtten, skip: (e) => e.level !== 'consultant' },
    ],
    targets: { mapMax: 125, spo2: 94 },
    hint: { steps: [
      { t: 'Pre-eclampsia → cerebral endothelial dysfunction → eclamptic seizures', kind: 'cause', rx: 'Magnesium 4 g then 1 g/h' },
      { t: 'Severe hypertension → intracerebral haemorrhage (the leading cause of eclamptic death)', rx: 'IV labetalol / oral nifedipine / hydralazine — SBP < 160' },
      { t: 'Capillary leak + low albumin → pulmonary oedema', rx: 'Restrict fluids to 80 mL/h' },
      { t: 'Magnesium toxicity: reflexes lost → respiratory depression → arrest', rx: 'Monitor; calcium gluconate antidote' },
      { t: 'Stroke, pulmonary oedema, HELLP, abruption', kind: 'end' },
    ] },
    debrief: {
      points: [
        'OAA QRH 2-1 / NICE NG133: call for help, left lateral, airway and oxygen (SpO₂ 95–98%), IV access and bloods, stop running IV fluids, catheter. Do not restrain her during the seizure.',
        'Magnesium sulfate 4 g IV over 5 minutes, then 1 g/h for 24 h (0.5 g/h if creatinine > 90). Recurrent seizure: a further 2 g. Do not use diazepam or phenytoin as alternatives.',
        'Monitor for toxicity: patellar reflexes, respiratory rate, urine output, and levels if worried (therapeutic 2–4 mmol/L). Loss of reflexes, respiratory depression or arrest → stop the infusion and give calcium gluconate 10% 10 mL (1 g).',
        'Treat severe hypertension promptly — intracerebral haemorrhage is the leading cause of death: IV labetalol 50 mg over 2 min repeated every 5 min (to 200 mg) then infusion, oral nifedipine if asthmatic, or IV hydralazine. Avoid over-correction (placental perfusion).',
        'Restrict fluids to 80 mL/h. Stabilise the mother before birth. For a GA caesarean (e.g. low platelets): attenuate the pressor response at laryngoscopy (alfentanil, remifentanil, labetalol or magnesium) and remember magnesium potentiates neuromuscular blockers.',
      ],
      refs: ['NICE NG133: Hypertension in pregnancy — diagnosis and management (2019, updated 2023)', 'OAA Obstetric QRH 2-1: Eclampsia and 2-2: Severe pre-eclampsia (v1, 2024)', 'Collaborative Eclampsia Trial (Lancet 1995)', 'MBRRACE-UK: Saving Lives, Improving Mothers\' Care'],
    },
  });
})();
