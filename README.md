# ResusSim — shock & critical events simulator

A free, browser-based simulator for **emergency medicine, critical care and anaesthesia**. Manage a deteriorating patient against the clock with a live monitor, titratable drugs, fluids and blood, investigations and a physiology hint.

**Play:** open `index.html`, or the GitHub Pages site for this repository.

## Features
- **24 scenarios** across EM, ICU and anaesthesia, covering every class of shock:
  - *Hypovolaemic* — pelvic fracture haemorrhage, variceal bleed, major obstetric haemorrhage
  - *Distributive* — septic (ED and refractory ICU), anaphylaxis (ED and on induction), neurogenic, adrenal crisis, high spinal
  - *Cardiogenic* — anterior STEMI, β-blocker overdose, hyperkalaemia, unstable SVT, LAST, vagal bradycardia
  - *Obstructive* — tension pneumothorax (ED and ventilated), massive PE, post-cardiac-surgery tamponade
  - plus life-threatening asthma, bronchospasm, malignant hyperthermia and CICO
- **Pick a specific scenario, practise a field (EM / Critical care / Anaesthesia) or get a random one.**
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

## Image credits
All X-ray, CT and ultrasound media are hot-linked from Wikimedia Commons under their original licences (CC0, CC BY, CC BY-SA). Authors include Hellerhoff, James Heilman MD, Mikael Häggström, Nevit Dilmen, Ben Smith, CardioNetworks/ECHOpedia, Gargani L (Cardiovasc Ultrasound 2011), Gillman L et al. (Scand J Trauma Resusc Emerg Med 2009), Shafiq Q et al., Hansen KL et al., and others — full attribution is shown alongside each image in the app and listed in `js/media.js`.
