# CrashCall

A free, browser-based simulator for **emergency medicine, critical care, anaesthesia and paediatrics**, guided by UK and Irish guidance (RCUK, NICE, BTS/SIGN, APLS, BSPED, DAS, RCOG, HSE National Clinical Guidelines) and the Association of Anaesthetists Quick Reference Handbook. Manage a deteriorating patient against the clock with a live monitor, titratable drugs, fluids and blood, investigations and a physiology hint.

**Play:** open `index.html`, or the GitHub Pages site for this repository.

## Features
- **94 scenarios + a tutorial** across EM, ICU, anaesthesia and paediatrics, covering every class of shock:
  - *Hypovolaemic* — pelvic fracture haemorrhage, variceal bleed, major obstetric haemorrhage
  - *Distributive* — septic (ED and refractory ICU), anaphylaxis (ED and on induction), neurogenic, adrenal crisis, high spinal
  - *Cardiogenic* — anterior STEMI, β-blocker overdose, hyperkalaemia, unstable SVT, LAST, vagal bradycardia
  - *Obstructive* — tension pneumothorax (ED and ventilated), massive PE, post-cardiac-surgery tamponade
  - plus life-threatening asthma, bronchospasm, malignant hyperthermia and CICO
  - **AoA QRH crises** — key basic plan, VF arrest under anaesthesia, endobronchial tube, blocked tube, hypotension, hypertension (empty vaporiser), fast AF, serotonin toxicity/hyperthermia, gas embolism, laryngospasm, patient fire, post-ROSC neuroprotection, oxygen failure, power failure, theatre evacuation
  - **More EM / ICU** — complete heart block, digoxin toxicity, torsades, electrical storm, flash pulmonary oedema, inferior STEMI with RV infarct, aortic dissection, hypertensive emergency, autonomic dysreflexia, adult DKA, alcohol withdrawal seizure, neutropenic sepsis, Crohn’s perforation on steroids, toxic shock, severe CAP, ACE-inhibitor angioedema, PEA arrest, stroke thrombolysis, severe TBI, subdural on a DOAC, elderly trauma on a β-blocker, stab wounds (haemothorax, tamponade), ruptured ectopic, peptic ulcer bleed, major burns, hydrofluoric acid burn, organophosphate poisoning and adder bite
  - **Resuscitation Council UK 2025 algorithms** — every one-page RCUK 2025 algorithm has a scenario: traumatic cardiac arrest, VF in the cath lab (stacked shocks), adult and infant choking, community BLS + AED, stable SVT, fast AF and pre-excited AF, paediatric in-hospital BLS, paediatric bradycardia, shockable paediatric arrest, paediatric VT with a pulse, out-of-hospital newborn life support and ARNI
  - **Paediatrics** — infant septic shock, asthma, anaphylaxis, infant SVT, status epilepticus, trauma haemorrhage, laryngospasm, croup, DKA, bronchiolitis, paediatric arrest (PLS) and newborn life support (NLS), all with weight-based dosing
- **Pick a specific scenario, practise a field (EM / Critical care / Anaesthesia / Paediatrics) or get a random one.**
- **Grade-based difficulty**: *Junior trainee* (slower deterioration, more margin, a nurse prompts you if you stall), *Senior trainee* (standard) or *Consultant* (faster deterioration, hidden targets, longer stability required and an unannounced second problem such as a tissued cannula or displaced tube). Separate leaderboards per grade.
- **Consequences**: wrong actions are logged as harms (+30 s on the leaderboard) and many cause real deterioration (e.g. propofol RSI in shock, decompressing a normal chest, 1 mg IV adrenaline with a pulse → VT, unsynchronised shock → VF).
- **AoA QRH library** (📕 button) with the relevant guidelines for each case linked to the official PDF.
- **RCUK 2025 algorithms** (🫀 button): every official one-page algorithm linked to resus.org.uk, with ▶ buttons to practise each one.
- **Physiology-driven ECG**: a vector (dipole) model generates the monitor and 12-lead from the patient (electrolytes, drugs, temperature, ischaemia, rhythm), with the report written from the tracing.
- Blind mode and a shared online leaderboard (Google Sheets).
- Live bedside monitor (ECG, invasive/non-invasive BP, SpO₂ pleth, capnography, temperature, CVP) with sweep waveforms, pulse-pressure variation, pulsus paradoxus and optional pulse-oximeter tone.
- Patient view showing relevant equipment: ventilator / anaesthetic machine, infusion pumps, airway devices, lines, chest drain, pelvic binder, blood products, defib/pacer.
- Vasopressors, inotropes and chronotropes as **boluses or titratable infusions**; crystalloid and blood products; airway, breathing and circulation procedures; ventilator FiO₂/PEEP/rate.
- Investigations: lab bloods, blood gas (kPa), live-generated 12-lead ECG, and real **openly-licensed** chest X-rays, CT images and POCUS clips from Wikimedia Commons (author + licence shown with each; see `js/media.js`). Images illustrate the finding — they are not the simulated patient.
- **Hint button**: mechanism flowchart (where each treatment acts), a *live* circulation model of the patient, a Frank–Starling plot and a shock-profile table.
- **Stopwatch** with personal best per scenario (stored in your browser), and a debrief of critical actions, potential harms, learning points and UK guideline references.

## How the model works
A deliberately simple, transparent lumped model: `MAP ≈ CO × SVR`, `CO = HR × SV`, a steep Frank–Starling curve, a baroreflex "sympathetic tone" for compensation, and a shunt/ventilation model for oxygenation and CO₂. Drugs use a simple effect-site model with onset and half-life. **Time is compressed** for gameplay.

## Disclaimer
For education only. Not a substitute for clinical judgement, local protocols or current national guidance. Doses reflect UK practice at the time of writing.

## Project structure
```
index.html          app shell
css/style.css       styles (light/dark)
js/engine.js        physiology engine
js/drugs.js         drugs, fluids and interventions
js/monitor.js       monitor waveforms
js/patient.js       patient & equipment view
js/media.js         catalogue of Wikimedia Commons images/clips with attribution
js/imaging.js       image/clip viewer and live 12-lead ECG generator
js/schematics.js    physiology hint diagrams
js/scenarios*.js    scenario library
js/app.js           UI controller
```
Adding a scenario = adding an object to `js/scenarios*.js` (patient parameters, dynamics, examination, investigations, critical actions, hint and debrief).

## QRH acknowledgement
Summaries of the Association of Anaesthetists *Quick Reference Handbook* (June 2023) are brief paraphrases for orientation only, with links to the official document. The QRH is © Association of Anaesthetists and licensed under CC BY-NC-SA 4.0. Always use the current official version: https://anaesthetists.org/Quick-Reference-Handbook

## Image credits
All X-ray, CT and ultrasound media are hot-linked from Wikimedia Commons under their original licences (CC0, CC BY, CC BY-SA). Authors include Hellerhoff, James Heilman MD, Mikael Häggström, Nevit Dilmen, Ben Smith, CardioNetworks/ECHOpedia, Gargani L (Cardiovasc Ultrasound 2011), Gillman L et al. (Scand J Trauma Resusc Emerg Med 2009), Shafiq Q et al., Hansen KL et al., and others — full attribution is shown alongside each image in the app and listed in `js/media.js`.
