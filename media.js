/* CrashCall — © 2026 Ben Moran. All rights reserved. No copying, modification or redistribution without written permission. */
/* Openly-licensed medical images and ultrasound clips, hot-linked from Wikimedia Commons.
 * Each entry keeps its author and licence so the viewer can show attribution.
 *   f   = Commons file name    lic/lu = licence name/URL    by = author    d = what the image shows
 *   v   = Commons hash path for video transcodes (q = transcode height if not 480p)
 * Images are representative examples chosen to match each scenario — they are not of the simulated patient. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const M = {
  cxr_tension_left: {"f":"Maessiger Spannungspneumothorax links 21M - CR pa - 001.jpg","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"Hellerhoff","d":"Moderate left tension pneumothorax, 21-year-old man (PA)"},
  cxr_ptx_right: {"f":"Pneumothorax CXR.jpg","lic":"CC BY-SA 2.5","lu":"https://creativecommons.org/licenses/by-sa/2.5","by":"Clinical Cases","d":"Large pneumothorax"},
  cxr_oedema: {"f":"Lungenoedem bei kardiogenem Schock 73M - CR ap - 001.jpg","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"Hellerhoff","d":"Pulmonary oedema in cardiogenic shock, 73-year-old man (AP)"},
  cxr_normal: {"f":"Normal posteroanterior (PA) chest radiograph (X-ray).jpg","lic":"CC0","lu":"https://creativecommons.org/publicdomain/zero/1.0","by":"Mikael Häggström","d":"Normal PA chest radiograph"},
  cxr_rll: {"f":"RLL pneumoniaM.jpg","lic":"CC BY 3.0","lu":"https://creativecommons.org/licenses/by/3.0","by":"James Heilman, MD","d":"Right lower lobe pneumonia"},
  cxr_ards: {"f":"ARDS X-Ray.jpg","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"Samir","d":"Acute respiratory distress syndrome"},
  cxr_ct_effusion: {"f":"Perikarderguss mit typischer Bocksbeutelform des Herzschattens 85W - CR und CT koronar und axial nativ - 001.jpg","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"Hellerhoff","d":"Large pericardial effusion: globular heart on CXR with coronal and axial CT"},
  ct_kub: {"f":"Praevesikales Harnleiterkonkrement mit Harnstau und Minderperfusion der Niere 26M - CT coronar KM pv - 001.jpg","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"Hellerhoff","d":"Distal ureteric calculus with obstructed, hypoperfused kidney (coronal CT)"},
  ctpa_saddle: {"f":"Reitender Thrombus bei Lungenembolie - CT - axial - 011.jpg","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"Hellerhoff","d":"Saddle pulmonary embolus (axial CTPA)"},
  ct_varices: {"f":"Ausgepraegte langstreckige Oesophagusvarizen bei Leberzirrhose 62W - CT KM pv - 001.jpg","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"Hellerhoff","d":"Extensive oesophageal varices in liver cirrhosis (portal venous CT)"},
  ct_cspine: {"f":"TreadropfractureC3CT.png","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"James Heilman, MD","d":"Flexion teardrop fracture of C3 (sagittal CT)"},
  ct_sdh_left: {"f":"Subduralandherniation.PNG","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"James Heilman, MD","d":"Large left acute subdural haematoma with midline shift (axial CT; patient's left is on the image right)"},
  ct_edh_right: {"f":"Epidurale Blutung - CT - WT-KF.jpg","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"Hellerhoff","d":"Right extradural haematoma — brain and bone windows (patient's right is on the image left)"},
  ct_dense_mca_left: {"f":"Dens media sign mit Mediainfarkt - CCT 001 new.jpg","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"Hellerhoff","d":"Hyperdense left MCA sign (arrow) in acute left MCA territory infarction"},
  ct_head: {"f":"CT of a normal brain, axial 17.png","lic":"CC0","lu":"https://creativecommons.org/publicdomain/zero/1.0","by":"Mikael Häggström, M.D.","d":"Normal CT head (axial)"},
  ct_pneumonia: {"f":"Pneumonie im Rahmen einer Staphylococcus aureus Sepsis mit Pneumatozelen 50M - CT - 001.jpg","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"Hellerhoff","d":"Severe pneumonia in septic patient (CT chest)"},
  xr_pelvis: {"f":"Diastasis symphysis pubis nevit.jpg","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"Nevit Dilmen","d":"Pubic symphysis diastasis (AP pelvis)"},
  us_morison_neg: {"f":"MorisonNoText.png","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"Drahreg01","d":"Hepatorenal interface (Morison's pouch)"},
  us_hydro: {"f":"Ultrasonography of hydronephrosis with dilated anechoic pelvis and calyces, along with cortical atrophy.jpg","lic":"CC BY 4.0","lu":"https://creativecommons.org/licenses/by/4.0","by":"Kristoffer Lindskov Hansen, Michael Bachmann Nielsen and Caroline Ewertsen","d":"Hydronephrosis: dilated anechoic pelvis and calyces"},
  us_ivc_normal: {"f":"Inferior vena cava ultrasound.gif","lic":"CC BY-SA 4.0","lu":"https://creativecommons.org/licenses/by-sa/4.0","by":"Tinss","d":"IVC with normal respiratory variation"},
  us_fast_pos: {"f":"Clinician-performed-resuscitative-ultrasonography-for-the-initial-evaluation-and-resuscitation-of-1757-7241-17-34-S1.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Gillman L, Ball C, Panebianco N, Al-Kadi A, Kirkpatrick A","d":"Positive FAST: free fluid in hepatorenal fossa","v":"7/70"},
  us_pelvis_fluid: {"f":"Focused-assessment-with-sonography-for-HIV-associated-tuberculosis-(FASH)-a-short-protocol-and-a-2036-7902-4-21-S8.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Heller T, Wallrauch C, Goblirsch S, Brunetti E","d":"Pelvic view: anechoic free fluid in the pouch of Douglas behind the bladder and uterus","v":"4/40","q":"240p"},
  us_morison_ectopic: {"f":"FluidMorisonsPouchEctop.PNG","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"James Heilman, MD","d":"RUQ view: free fluid between liver and kidney (Morison’s pouch) in ruptured ectopic pregnancy"},
  us_sliding: {"f":"Clinician-performed-resuscitative-ultrasonography-for-the-initial-evaluation-and-resuscitation-of-1757-7241-17-34-S3.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Gillman L, Ball C, Panebianco N, Al-Kadi A, Kirkpatrick A","d":"Normal lung sliding","v":"6/63"},
  us_no_sliding: {"f":"Clinician-performed-resuscitative-ultrasonography-for-the-initial-evaluation-and-resuscitation-of-1757-7241-17-34-S4.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Gillman L, Ball C, Panebianco N, Al-Kadi A, Kirkpatrick A","d":"Absent lung sliding (pneumothorax)","v":"f/f8"},
  us_lung_point: {"f":"Clinician-performed-resuscitative-ultrasonography-for-the-initial-evaluation-and-resuscitation-of-1757-7241-17-34-S7.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Gillman L, Ball C, Panebianco N, Al-Kadi A, Kirkpatrick A","d":"Lung point (edge of a pneumothorax)","v":"c/c2"},
  us_ivc_flat: {"f":"Clinician-performed-resuscitative-ultrasonography-for-the-initial-evaluation-and-resuscitation-of-1757-7241-17-34-S8.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Gillman L, Ball C, Panebianco N, Al-Kadi A, Kirkpatrick A","d":"IVC collapsing completely with respiration (hypovolaemia)","v":"6/6d"},
  us_blines: {"f":"Lung-ultrasound-a-new-tool-for-the-cardiologist-1476-7120-9-6-S2.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Gargani L","d":"Multiple B-lines (interstitial syndrome)","v":"e/e4"},
  us_lung_normal: {"f":"Lung-ultrasound-a-new-tool-for-the-cardiologist-1476-7120-9-6-S1.ogv","lic":"CC BY 2.0","lu":"https://creativecommons.org/licenses/by/2.0","by":"Gargani L","d":"Normal lung pattern (A-lines)","v":"d/d9"},
  us_ivc_pleth: {"f":"UltrasoundCardiacTamponade.webm","lic":"CC BY 4.0","lu":"https://creativecommons.org/licenses/by/4.0","by":"Ben Smith","d":"Plethoric IVC with minimal respiratory variation","v":"6/62","q":"240p"},
  us_plax_normal: {"f":"PLAXnormal (CardioNetworks ECHOpedia).webm","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"CardioNetworks: Vdbilt","d":"Parasternal long axis","v":"c/cd"},
  us_plax_poor: {"f":"Dilated cardiomyopathy E00473 (CardioNetworks ECHOpedia).webm","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"CardioNetworks: Secretariat","d":"PLAX: dilated, poorly contracting LV","v":"5/52"},
  us_a4c_poor: {"f":"Dilated cardiomyopathy E00476 (CardioNetworks ECHOpedia).webm","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"CardioNetworks: Secretariat","d":"A4C: dilated, poorly contracting LV","v":"8/84"},
  us_pe_a4c: {"f":"McConnell-Sign-in-a-Patient-with-Massive-Acute-Pulmonary-Embolism-201097.f1.ogv","lic":"CC BY 3.0","lu":"https://creativecommons.org/licenses/by/3.0","by":"Shafiq Q, Assaly R, Kanjwal Y","d":"Massive PE: dilated RV with McConnell's sign","v":"e/ee","q":"240p"},
  us_pe_2: {"f":"McConnell-Sign-in-a-Patient-with-Massive-Acute-Pulmonary-Embolism-201097.f2.ogv","lic":"CC BY 3.0","lu":"https://creativecommons.org/licenses/by/3.0","by":"Shafiq Q, Assaly R, Kanjwal Y","d":"Massive PE: RV pressure overload","v":"4/4e","q":"240p"},
  us_tamponade: {"f":"Uotw78.webm","lic":"CC BY 4.0","lu":"https://creativecommons.org/licenses/by/4.0","by":"Ben Smith","d":"Pericardial effusion with tamponade","v":"5/56","q":"240p"},
  us_tamponade_echo: {"f":"Tamponade E00167 (CardioNetworks ECHOpedia).webm","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"CardioNetworks: Secretariat","d":"Tamponade","v":"2/2d"},
  us_effusion_sub: {"f":"Pericardial effusion E00675 (CardioNetworks ECHOpedia).webm","lic":"CC BY-SA 3.0","lu":"https://creativecommons.org/licenses/by-sa/3.0","by":"CardioNetworks: Secretariat","d":"Pericardial effusion, subcostal view","v":"8/8d"},
  };
  const enc = (f) => encodeURIComponent(f.replace(/ /g, '_')).replace(/%2C/g, ',');
  S.MEDIA = M;
  S.mediaInfo = (key) => {
    const m = M[key]; if (!m) return null;
    const page = 'https://commons.wikimedia.org/wiki/File:' + enc(m.f);
    const out = Object.assign({ key, page }, m);
    if (m.v) {
      const base = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/' + m.v + '/' + enc(m.f) + '/' + enc(m.f);
      out.video = [{ src: base + '.' + (m.q || '480p') + '.vp9.webm', type: 'video/webm' }, { src: base + '.360p.mpeg4.mov', type: 'video/mp4' }];
    } else {
      out.img = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + enc(m.f) + '?width=1024';
    }
    return out;
  };
})();
