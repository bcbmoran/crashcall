/* Resuscitation Council UK 2025 guidelines — quick links to the official one-page algorithm PDFs.
 * Links open the PDFs on resus.org.uk (© Resuscitation Council UK); nothing is copied into CrashCall.
 * URLs checked against the RCUK 2025 guideline pages, November 2026. */
(function () {
  const S = (window.Sim = window.Sim || {});
  const F = 'https://www.resus.org.uk/sites/default/files/';
  const G = 'https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/';
  const SETS = [
    { id: 'adult', title: 'Adult', page: G + 'adult-advanced-life-support-guidelines', items: [
      ['Adult in-hospital resuscitation', F + '2025-10/Adult%20in%20hospital%20algorithm%202025.pdf', ['em-pea-arrest', 'em-choking-adult']],
      ['Adult advanced life support (ALS)', F + '2025-10/Adult%20ALS%20algorithm%202025.pdf', ['an-qrh-vf-arrest', 'em-pea-arrest']],
      ['Adult bradyarrhythmia', F + '2025-10/Adult%20bradyarrhythmia%202025.pdf', ['em-chb', 'an-lap-brady', 'em-inferior-rv', 'em-bb-overdose']],
      ['Adult tachyarrhythmia (V3, March 2026)', F + '2026-03/Adult%20tachyarrhythmia%20algorithm%20V3%20March%202026.pdf', ['em-unstable-svt', 'em-stable-svt', 'em-stable-af', 'em-preexcited-af', 'icu-electrical-storm', 'em-torsades']],
      ['Adult post-resuscitation care', F + '2025-12/Adult%20post-resuscitation%20care%202025%20Nov%20V2.pdf', ['an-qrh-post-rosc']],
      ['Adult community basic life support', F + '2025-10/RCUK%20G2025%20ADULT%20BLS%20Community%20Oct%20V2_0.pdf', ['em-community-bls']],
      ['Adult choking', F + '2025-10/Adult%20choking%20algorithm%202025%20.pdf', ['em-choking-adult']],
    ] },
    { id: 'special', title: 'Special circumstances', page: G + 'special-circumstances-guidelines', items: [
      ['Traumatic cardiac arrest', F + '2025-10/Traumatic%20cardiac%20arrest%20algorithm%202025.pdf', ['em-tca']],
      ['Cardiac arrest in the cardiac catheter laboratory', F + '2025-10/heartjnl-2022-June-108-12-e1-F1.pdf', ['em-cathlab-vf']],
    ] },
    { id: 'paeds', title: 'Paediatric', page: G + 'paediatric-basic-life-support-guidelines', items: [
      ['Paediatric in-hospital basic life support', F + '2025-10/Paediatric%20in-hospital%20BLS%20algorithm%202025.pdf', ['paed-bls-ward']],
      ['Paediatric advanced life support', F + '2025-10/Paediatric%20advanced%20life%20support%20algorithm%202025.pdf', ['paed-arrest', 'paed-vf']],
      ['Paediatric cardiac arrhythmias', F + '2025-10/Paediatric%20arrhythmia%20algorithm%202025.pdf', ['paed-svt', 'paed-vt', 'paed-brady']],
      ['Paediatric choking', F + '2025-10/Paediatric%20choking%20algorithm%202025.pdf', ['paed-choking']],
      ['Paediatric emergency chart', F + '2026-02/RCUK%20G2025%20PAED%20PET%20Feb%2026%20V3.pdf', ['paed-anaphylaxis', 'paed-status', 'paed-septic-shock']],
      ['Paediatric emergency algorithms & resources (booklet, Feb 2026)', F + '2026-02/RCUK%20Paediatric%20emergency%20algorithms%20and%20resources%20Feb%2026%20V6.pdf'],
    ] },
    { id: 'newborn', title: 'Newborn', page: G + 'newborn-resuscitation-and-support-transition-infants-birth', items: [
      ['Newborn life support (NLS)', F + '2026-03/RCUK%20G2025%20NEO%20NLS%20Mar%20V4.1.pdf', ['paed-nls']],
      ['Out-of-hospital newborn life support', F + '2025-12/RCUK%20G2025%20NEO%20OH-NLS%20Nov%20V2.pdf', ['neo-oh-nls']],
      ['Advanced resuscitation of the newborn infant (ARNI)', F + '2026-01/RCUK%20G2025%20NEO%20ARNI%20Dec%20V3.pdf', ['neo-arni']],
    ] },
  ];
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const link = (name, url) => `<a class="rcuk-link" href="${url}" target="_blank" rel="noopener"><span>${esc(name)}</span><span class="muted small">PDF ↗</span></a>`;
  const practise = (ids, o) => {
    if (!o.practise || !ids || !ids.length) return '';
    const scn = ids.map((id) => (S.SCENARIOS || []).find((x) => x.id === id)).filter(Boolean);
    return `<div class="rcuk-prac">${scn.map((x, i) => `<button class="btn sm" data-practise="${x.id}">▶ ${o.blind ? 'Scenario ' + (i + 1) : esc(x.title)}</button>`).join('')}</div>`;
  };
  S.RCUK = {
    sets: SETS,
    // field: scenario field ('Paeds' puts the paediatric/newborn algorithms first)
    html(field, o) {
      o = o || {};
      const order = field === 'Paeds' ? ['paeds', 'newborn', 'adult', 'special'] : ['adult', 'special', 'paeds', 'newborn'];
      const sets = order.map((id) => SETS.find((s) => s.id === id));
      return `<p class="muted small">Official one-page algorithms from the <b>Resuscitation Council UK 2025 Guidelines</b>. Each opens the PDF on resus.org.uk in a new tab${o.practise ? '; the ▶ buttons start a CrashCall scenario that practises that algorithm' : ' (the scenario keeps running — pause first if you need to)'}.</p>
        <div class="rcuk-grid">${sets.map((s) => `<section class="rcuk-set"><h3>${esc(s.title)}</h3>${s.items.map(([n, u, ids]) => link(n, u) + practise(ids, o)).join('')}<a class="muted small" href="${s.page}" target="_blank" rel="noopener">Full ${esc(s.title.toLowerCase())} guideline ↗</a></section>`).join('')}</div>
        <p class="muted small">Related: <a href="https://www.resus.org.uk/library/additional-guidance/guidance-anaphylaxis/emergency-treatment" target="_blank" rel="noopener">RCUK emergency treatment of anaphylaxis (2021 guidance)</a> · <a href="https://www.resus.org.uk/professional-library/iresus" target="_blank" rel="noopener">iResus app</a>. © Resuscitation Council UK — algorithms are linked, not reproduced.</p>`;
    },
  };
})();
