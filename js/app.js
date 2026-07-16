/* =========================================================================
 * D-Fiscalisateur — contrôleur d'interface.
 * Lit le formulaire, exécute DFISC.simulateur.run(), affiche :
 * économie d'impôt, impact par levier, plafonnement des niches, alertes,
 * cases de la déclaration avec montants, guides pédagogiques.
 * ========================================================================= */
(function () {
  'use strict';
  const P = DFISC.PARAMS;
  const $ = (id) => document.getElementById(id);
  const num = (id) => {
    const el = $(id);
    if (!el) return 0;
    const v = parseFloat(String(el.value).replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
  };
  const chk = (id) => !!($(id) && $(id).checked);
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur = (v) => fmt.format(Math.round(v || 0));

  /* ---------------- Composants d'amortissement (tableau éditable) -------- */
  function initComposants() {
    const tbody = document.querySelector('#lmnp_composants tbody');
    tbody.innerHTML = '';
    P.LMNP.composantsDefaut.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${c.libelle}</td>` +
        `<td><input type="number" id="lmnp_c${i}_pct" value="${c.pct}" min="0" max="100" step="1"> %</td>` +
        `<td><input type="number" id="lmnp_c${i}_duree" value="${c.duree}" min="1" step="1"></td>` +
        `<td id="lmnp_c${i}_annuite" style="white-space:nowrap">—</td>`;
      tbody.appendChild(tr);
    });
  }

  function lireComposants() {
    return P.LMNP.composantsDefaut.map((c, i) => ({
      cle: c.cle,
      libelle: c.libelle,
      pct: num(`lmnp_c${i}_pct`),
      duree: Math.max(1, num(`lmnp_c${i}_duree`) || c.duree),
    }));
  }

  /* ---------------- Lecture de l'état depuis le formulaire --------------- */
  function readState() {
    return {
      foyer: {
        situation: $('foyer_situation').value,
        enfants: num('foyer_enfants'),
        enfantsAlternee: num('foyer_enfantsAlternee'),
        parentIsole: chk('foyer_parentIsole'),
        partsForcees: num('foyer_partsForcees'),
      },
      revenus: {
        salaires1: num('rev_salaires1'),
        salaires2: num('rev_salaires2'),
        fraisReels1: num('rev_fraisReels1'),
        fraisReels2: num('rev_fraisReels2'),
        pensions1: num('rev_pensions1'),
        pensions2: num('rev_pensions2'),
        bicPro: num('rev_bicPro'),
        autres: num('rev_autres'),
        rcmPfu: num('rev_rcmPfu'),
        csgDeductible: num('rev_csg'),
      },
      foncier: {
        actif: chk('fon_actif'),
        loyers: num('fon_loyers'),
        nbLocaux: num('fon_nbLocaux'),
        assurance: num('fon_assurance'),
        taxeFonciere: num('fon_tf'),
        gestion: num('fon_gestion'),
        copro: num('fon_copro'),
        regularisationCopro: num('fon_regul'),
        travaux: num('fon_travaux'),
        travauxRenov: num('fon_renov'),
        chargesLocNonRecuperees: num('fon_chargesLoc'),
        autresCharges: num('fon_autres'),
        interets: num('fon_interets'),
        deficitsAnterieurs: num('fon_deficitsAnt'),
        regime: $('fon_regime').value,
      },
      lmnp: {
        actif: chk('lmnp_actif'),
        type: $('lmnp_type').value,
        loyers: num('lmnp_loyers'),
        charges: num('lmnp_charges'),
        interets: num('lmnp_interets'),
        prixBien: num('lmnp_prix'),
        partTerrainPct: num('lmnp_terrain'),
        fraisAcquisition: num('lmnp_frais'),
        incorporerFrais: chk('lmnp_incorporer'),
        mobilier: num('lmnp_mobilier'),
        dureeMobilier: num('lmnp_dureeMobilier'),
        travaux: num('lmnp_travaux'),
        dureeTravaux: num('lmnp_dureeTravaux'),
        composants: lireComposants(),
        reportsAmortissements: num('lmnp_reportsAmort'),
        deficitsBicAnterieurs: num('lmnp_deficitsAnt'),
        regime: $('lmnp_regime').value,
      },
      dispositifs: {
        pinel: {
          actif: chk('disp_pinel_actif'),
          generation: $('disp_pinel_generation').value,
          base: num('disp_pinel_base'),
          surface: num('disp_pinel_surface'),
          dureeInitiale: num('disp_pinel_dureeInitiale'),
          duree: num('disp_pinel_duree'),
          anneePremiere: num('disp_pinel_annee'),
        },
        locavantages: {
          actif: chk('disp_la_actif'),
          loyers: num('disp_la_loyers'),
          niveau: $('disp_la_niveau').value,
          intermediation: chk('disp_la_inter'),
        },
        malraux: { travaux: num('disp_malraux_travaux'), secteur: $('disp_malraux_secteur').value },
        mh: { travaux: num('disp_mh_travaux') },
        girardin: { reduction: num('disp_girardin_reduction'), type: $('disp_girardin_type').value },
        censi: num('disp_censi'),
        autresReports: num('disp_autresReports'),
      },
      per: {
        versements1: num('per_v1'),
        versements2: num('per_v2'),
        plafondAvis1: num('per_p1'),
        plafondAvis2: num('per_p2'),
        revenusProN1_1: num('per_rev1'),
        revenusProN1_2: num('per_rev2'),
        mutualisation: chk('per_mutu'),
      },
      famille: {
        emploiDomicile: {
          depenses: num('fam_ed_depenses'),
          jardinage: num('fam_ed_jardinage'),
          informatique: num('fam_ed_informatique'),
          bricolage: num('fam_ed_bricolage'),
          majorations: num('fam_ed_majorations'),
          premiereAnnee: chk('fam_ed_premiere'),
          invalide: chk('fam_ed_invalide'),
        },
        garde: { nbEnfants: num('fam_garde_nb'), nbEnfantsAlternee: num('fam_garde_nbAlt'), depenses: num('fam_garde_depenses') },
        scolarite: { college: num('fam_scol_college'), lycee: num('fam_scol_lycee'), superieur: num('fam_scol_sup') },
        ehpad: { montant1: num('fam_ehpad_m1'), montant2: num('fam_ehpad_m2') },
        prestationCompensatoire: num('fam_prestComp'),
      },
      charges: {
        nbEnfantsMajeurs: num('chg_nbEnfMajeurs'),
        pensionEnfantsMajeurs: num('chg_pensionEnfMajeurs'),
        pensionsAutres: num('chg_pensionsAutres'),
        nbAccueil: num('chg_nbAccueil'),
        accueilAge: num('chg_accueil'),
        rachatTrimestres: num('chg_rachat'),
      },
      dons: { urgence: num('dons_urgence'), general: num('dons_general') },
      divers: {
        syndicats: num('div_syndicats'),
        pme: { montant: num('div_pme_montant'), taux: $('div_pme_taux').value },
        fonds: { fcpi: num('div_fcpi'), fip: num('div_fip'), fipCorse: num('div_fipCorse'), fipOM: num('div_fipOM') },
        sofica: { montant: num('div_sofica_montant'), taux: parseFloat($('div_sofica_taux').value) },
        foret: num('div_foret'),
        bornes: { depense: num('div_bornes_dep'), nb: num('div_bornes_nb') },
        equipements: num('div_equipements'),
      },
    };
  }

  /* ---------------- Rendu des résultats ---------------------------------- */
  const FORM_ORDER = ['2042', '2042-C', '2042-C-PRO', '2042-RICI', '2042-IOM', '2044'];
  const FORM_LIBELLES = {
    '2042': 'Déclaration principale 2042',
    '2042-C': 'Déclaration complémentaire 2042-C',
    '2042-C-PRO': '2042-C-PRO — revenus des indépendants et locations meublées',
    '2042-RICI': '2042-RICI — réductions et crédits d\'impôt',
    '2042-IOM': '2042-IOM — investissements outre-mer',
    '2044': '2044 — revenus fonciers (régime réel)',
  };

  function render(res) {
    const f = res.final;
    const b = res.baseline;

    /* Hero */
    $('res_economie').textContent = eur(res.economieTotale);
    $('res_economie_detail').textContent =
      `dont impôt sur le revenu : ${eur(res.economieIR)} · prélèvements sociaux : ${eur(res.economiePS)} — ` +
      `par rapport à la même situation sans aucun levier fiscal`;
    $('res_avant').textContent = eur(b.total) + (b.total < 0 ? ' (restitution)' : '');
    $('res_apres').textContent = eur(f.total) + (f.total < 0 ? ' (restitution)' : '');

    /* KPIs */
    $('res_parts').textContent = String(f.ir.parts).replace('.', ',');
    $('res_rni').textContent = eur(f.rni);
    $('res_tmi').textContent = Math.round(f.ir.tmi * 100) + ' %';
    $('res_ir').textContent = eur(Math.max(0, f.irNet)) + (f.irNet < 0 ? ` (+${eur(-f.irNet)} restitués)` : '');
    $('res_ps').textContent = eur(f.ps);
    $('res_avantages').textContent = eur(f.reductionsImputees + f.totalCredits);

    /* Impacts par levier */
    const ul = $('res_impacts');
    ul.innerHTML = '';
    if (!res.impacts.length) {
      ul.innerHTML = '<li>Renseignez le formulaire : chaque dispositif utilisé apparaîtra ici avec son gain.</li>';
    } else {
      for (const im of res.impacts) {
        const li = document.createElement('li');
        const neg = im.economie < -0.5;
        li.innerHTML = `<span>${im.libelle}</span><span class="eco ${neg ? 'neg' : ''}">${im.economie >= 0 ? '+' : ''}${eur(im.economie)}</span>`;
        ul.appendChild(li);
      }
      const li = document.createElement('li');
      li.innerHTML = `<span style="color:var(--texte-2)">La somme des impacts individuels peut différer du total (effets croisés de tranche, décote, plafonds).</span>`;
      ul.appendChild(li);
    }

    /* Plafonnement niches */
    const plaf = f.plafonnement;
    const pctJauge = Math.min(100, (plaf.total / plaf.plafondApplicable) * 100);
    const jauge = $('res_jauge');
    jauge.classList.toggle('depasse', plaf.reprise > 0.5);
    jauge.firstElementChild.style.width = pctJauge + '%';
    $('res_jauge_txt').textContent = `${eur(plaf.total)} d'avantages plafonnables` + (plaf.reprise > 0.5 ? ` — ${eur(plaf.reprise)} repris !` : '');
    $('res_jauge_max').textContent = `plafond ${eur(plaf.plafondApplicable)}`;

    /* Alertes (dédupliquées) */
    const zone = $('res_alertes');
    zone.innerHTML = '';
    const vues = new Set();
    for (const a of f.alertes) {
      if (vues.has(a.texte)) continue;
      vues.add(a.texte);
      const div = document.createElement('div');
      div.className = 'alerte ' + (a.niveau === 'warn' ? 'warn' : 'info');
      div.textContent = a.texte;
      zone.appendChild(div);
    }
    if (!zone.children.length) zone.innerHTML = '<div class="alerte info">Aucune alerte : votre situation ne déclenche aucun plafond.</div>';

    /* Cases de la déclaration */
    const tbody = document.querySelector('#res_cases tbody');
    tbody.innerHTML = '';
    for (const form of FORM_ORDER) {
      const lignes = f.cases.filter((c) => c.form === form);
      if (!lignes.length) continue;
      const trg = document.createElement('tr');
      trg.className = 'groupe';
      trg.innerHTML = `<td colspan="3">📄 ${FORM_LIBELLES[form] || form}</td>`;
      tbody.appendChild(trg);
      for (const c of lignes) {
        const tr = document.createElement('tr');
        tr.innerHTML =
          `<td class="code">${c.code}${c.aVerifier ? ' <span class="badge-verif">à vérifier</span>' : ''}</td>` +
          `<td>${c.libelle}${c.note ? `<span class="note">${c.note}</span>` : ''}</td>` +
          `<td class="montant">${c.montant == null ? '☑ à cocher' : eur(c.montant)}</td>`;
        tbody.appendChild(tr);
      }
    }
    if (!tbody.children.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="color:var(--texte-2)">Renseignez vos revenus et dispositifs : les cases à remplir apparaîtront ici.</td></tr>';
    }

    /* Annuités des composants LMNP */
    if (res.final.lmnp && res.final.lmnp.amortissement) {
      const am = res.final.lmnp.amortissement;
      am.composants.forEach((c, i) => {
        const cell = $(`lmnp_c${i}_annuite`);
        if (cell) cell.textContent = c.annuite > 0 ? eur(c.annuite) + '/an' : '—';
      });
      const sommePct = am.composants.reduce((s, c) => s + (c.pct || 0), 0);
      if (sommePct !== 100 && num('lmnp_prix') > 0) {
        const div = document.createElement('div');
        div.className = 'alerte warn';
        div.textContent = `⚠ La somme des composants fait ${sommePct} % (au lieu de 100 %) de la valeur bâtie.`;
        $('res_alertes').prepend(div);
      }
    }
  }

  /* ---------------- Guides pédagogiques ---------------------------------- */
  function renderGuides() {
    const D = DFISC.DATA_CHARGES;
    $('guide_charges_intro').textContent = D.intro;
    const tRec = document.querySelector('#guide_charges_recup tbody');
    D.recuperables.forEach((r) => {
      tRec.insertAdjacentHTML('beforeend', `<tr><td>${r.poste}</td><td>${r.detail}</td></tr>`);
    });
    const tProp = document.querySelector('#guide_charges_prop tbody');
    D.proprietaire.forEach((r) => {
      tProp.insertAdjacentHTML('beforeend', `<tr><td>${r.poste}${r.ligne ? ` <span class="badge-verif" style="background:var(--vert-clair);color:var(--vert)">ligne ${r.ligne}</span>` : ''}</td><td>${r.detail}</td></tr>`);
    });
    const ul = $('guide_pieces');
    D.pieces.forEach((p) => ul.insertAdjacentHTML('beforeend', `<li>${p}</li>`));
    $('guide_amort_intro').textContent = D.amortissement.intro;
    const tAm = document.querySelector('#guide_amort_table tbody');
    D.amortissement.composants.forEach((c) => {
      tAm.insertAdjacentHTML('beforeend', `<tr><td>${c.composant}</td><td>${c.part}</td><td>${c.duree}</td></tr>`);
    });
  }

  /* ---------------- Exemple / reset / print ------------------------------ */
  const EXEMPLE = {
    foyer_situation: 'couple', foyer_enfants: 2,
    rev_salaires1: 62000, rev_salaires2: 48000, rev_csg: 0,
    fon_actif: true, fon_loyers: 12000, fon_nbLocaux: 1, fon_assurance: 180, fon_tf: 1200,
    fon_gestion: 720, fon_copro: 900, fon_regul: 150, fon_travaux: 9000, fon_renov: 8000,
    fon_interets: 3800,
    lmnp_actif: true, lmnp_loyers: 9600, lmnp_charges: 1400, lmnp_interets: 2100,
    lmnp_prix: 180000, lmnp_terrain: 15, lmnp_frais: 14000, lmnp_mobilier: 8000, lmnp_travaux: 12000,
    disp_pinel_actif: true, disp_pinel_generation: 'pinel2024', disp_pinel_base: 250000,
    disp_pinel_dureeInitiale: 9, disp_pinel_duree: 9, disp_pinel_annee: 2024,
    per_v1: 6000, per_v2: 2000, per_rev1: 60000, per_rev2: 46000, per_mutu: true,
    fam_ed_depenses: 4800, fam_ed_majorations: 2,
    fam_garde_nb: 1, fam_garde_depenses: 3200,
    fam_scol_college: 1,
    dons_urgence: 300, dons_general: 500, div_syndicats: 180,
    div_fcpi: 3000, div_bornes_dep: 900, div_bornes_nb: 1,
  };

  function chargerExemple() {
    reset(false);
    for (const [id, val] of Object.entries(EXEMPLE)) {
      const el = $(id);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val;
    }
    document.querySelectorAll('details.section').forEach((d) => (d.open = true));
    recalc();
  }

  function reset(recompute = true) {
    document.querySelectorAll('.colonne-form input[type="number"]').forEach((el) => (el.value = ''));
    document.querySelectorAll('.colonne-form input[type="checkbox"]').forEach((el) => (el.checked = false));
    $('lmnp_incorporer').checked = true;
    $('fon_nbLocaux').value = 1;
    $('lmnp_terrain').value = 15;
    $('lmnp_dureeMobilier').value = 7;
    $('lmnp_dureeTravaux').value = 15;
    $('div_bornes_nb').value = 1;
    document.querySelectorAll('.colonne-form select').forEach((el) => (el.selectedIndex = ['disp_pinel_dureeInitiale', 'disp_pinel_duree'].includes(el.id) ? el.selectedIndex : 0));
    initComposants();
    if (recompute) recalc();
  }

  /* ---------------- Boucle de calcul ------------------------------------- */
  let timer = null;
  function recalc() {
    try {
      const res = DFISC.simulateur.run(readState());
      render(res);
    } catch (e) {
      console.error('Erreur de calcul :', e);
    }
  }
  function recalcDebounced() {
    clearTimeout(timer);
    timer = setTimeout(recalc, 180);
  }

  /* ---------------- Init -------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    initComposants();
    renderGuides();
    document.querySelector('.colonne-form').addEventListener('input', recalcDebounced);
    document.querySelector('.colonne-form').addEventListener('change', recalcDebounced);
    $('btn-exemple').addEventListener('click', chargerExemple);
    $('btn-reset').addEventListener('click', () => reset(true));
    $('btn-print').addEventListener('click', () => window.print());
    // Ouvrir index.html#exemple pré-remplit une situation complète de démonstration.
    if (location.hash === '#exemple') chargerExemple();
    else recalc();
  });
})();
