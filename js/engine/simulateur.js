/* =========================================================================
 * Simulateur — orchestration complète.
 *
 * computeScenario(state) : calcule l'impôt d'un scénario complet
 *   (revenus catégoriels → RBG → charges déductibles → RNI → barème/QF/décote
 *    → réductions d'impôt → plafonnement des niches → crédits d'impôt
 *    → prélèvements sociaux → CEHR) et produit la liste des cases à remplir.
 *
 * run(state) : scénario « optimisé » + scénario « sans leviers » (baseline)
 *   + impact marginal de chaque levier (recalcul complet sans ce levier).
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;

  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------------ */
  function abattement10(montant, bar) {
    if (montant <= 0) return 0;
    return Math.min(montant, Math.max(0, montant - U.clamp(montant * bar.taux, bar.min, bar.max)));
  }

  function computeScenario(state, P) {
    const s = state;
    const couple = s.foyer.situation === 'couple';
    const cases = [];
    const alertes = [];
    const pushCases = (list) => list && list.forEach((c) => cases.push(c));

    /* ----- 1. Revenus catégoriels ----- */
    const sal1 = U.n(s.revenus.salaires1);
    const sal2 = couple ? U.n(s.revenus.salaires2) : 0;
    const fr1 = U.n(s.revenus.fraisReels1);
    const fr2 = U.n(s.revenus.fraisReels2);
    const salNet1 = fr1 > 0 ? Math.max(0, sal1 - fr1) : abattement10(sal1, P.ABATTEMENT_SALAIRES);
    const salNet2 = fr2 > 0 ? Math.max(0, sal2 - fr2) : abattement10(sal2, P.ABATTEMENT_SALAIRES);
    const pens1 = U.n(s.revenus.pensions1);
    const pens2 = couple ? U.n(s.revenus.pensions2) : 0;
    const pensNettes = abattement10(pens1 + pens2, P.ABATTEMENT_PENSIONS);
    const bicPro = U.n(s.revenus.bicPro);
    const autres = U.n(s.revenus.autres);

    if (sal1 > 0) cases.push({ form: '2042', code: '1AJ', libelle: 'Salaires déclarant 1', montant: Math.round(sal1), aVerifier: false });
    if (sal2 > 0) cases.push({ form: '2042', code: '1BJ', libelle: 'Salaires déclarant 2', montant: Math.round(sal2), aVerifier: false });
    if (fr1 > 0) cases.push({ form: '2042', code: '1AK', libelle: 'Frais réels déclarant 1', montant: Math.round(fr1), aVerifier: false });
    if (fr2 > 0) cases.push({ form: '2042', code: '1BK', libelle: 'Frais réels déclarant 2', montant: Math.round(fr2), aVerifier: false });
    if (pens1 > 0) cases.push({ form: '2042', code: '1AS', libelle: 'Pensions, retraites déclarant 1', montant: Math.round(pens1), aVerifier: false });
    if (pens2 > 0) cases.push({ form: '2042', code: '1BS', libelle: 'Pensions, retraites déclarant 2', montant: Math.round(pens2), aVerifier: false });

    /* ----- 2. Immobilier ----- */
    const fState = { ...s.foncier, locAvantagesActif: !!(s.dispositifs.locavantages && s.dispositifs.locavantages.actif) };
    const foncier = DFISC.foncier.calcFoncier(fState, P);
    alertes.push(...foncier.alertes.map((t) => ({ niveau: 'info', texte: 'Foncier : ' + t })));

    const lmnp = DFISC.lmnp.calcLMNP(s.lmnp, P);
    alertes.push(...lmnp.alertes.map((t) => ({ niveau: 'info', texte: 'LMNP : ' + t })));

    // Monuments historiques : charges/travaux déductibles du revenu global sans plafond.
    const mh = U.n(s.dispositifs.mh && s.dispositifs.mh.travaux);

    /* Cases foncier */
    if (foncier.actif) {
      if (foncier.regime === 'micro') {
        cases.push({ form: '2042', code: '4BE', libelle: 'Micro-foncier : loyers bruts encaissés (abattement 30 % automatique)', montant: Math.round(U.n(s.foncier.loyers)), aVerifier: false });
      } else {
        const r = foncier.details.reel || {};
        const f = s.foncier;
        const l2044 = [
          ['211', 'Loyers bruts encaissés', U.n(f.loyers)],
          ['221', "Frais d'administration et de gestion (agence, concierge…)", U.n(f.gestion)],
          ['222', 'Autres frais de gestion — forfait 20 € par local', r.forfaitGestion || 0],
          ['223', "Primes d'assurance (PNO, loyers impayés)", U.n(f.assurance)],
          ['224', 'Dépenses de réparation, entretien, amélioration (factures à conserver)', U.n(f.travaux) + U.n(f.travauxRenov)],
          ['225', 'Charges récupérables non récupérées au départ du locataire', U.n(f.chargesLocNonRecuperees)],
          ['227', 'Taxe foncière (hors TEOM, récupérable sur le locataire)', U.n(f.taxeFonciere)],
          ['229', 'Provisions pour charges de copropriété (année N)', U.n(f.copro)],
          ['230', 'Régularisation des provisions déduites en N-1 (à réintégrer)', U.n(f.regularisationCopro)],
          ['250', "Intérêts d'emprunt + assurance emprunteur + frais de dossier", U.n(f.interets)],
        ];
        for (const [code, lib, montant] of l2044) {
          if (montant > 0) cases.push({ form: '2044', code, libelle: lib, montant: Math.round(montant), aVerifier: false });
        }
        if (foncier.netImposable > 0) cases.push({ form: '2042', code: '4BA', libelle: 'Revenus fonciers nets (report de la 2044)', montant: Math.round(foncier.netImposable), aVerifier: false });
        if (foncier.reportInterets + foncier.reportAutres > 0)
          cases.push({ form: '2042', code: '4BB', libelle: 'Déficit foncier imputable uniquement sur les revenus fonciers (reportable 10 ans)', montant: Math.round(foncier.reportInterets + foncier.reportAutres), aVerifier: false });
        if (foncier.deficitRG > 0)
          cases.push({ form: '2042', code: '4BC', libelle: 'Déficit foncier imputable sur le revenu global (max 10 700 € / 21 400 € rénovation énergétique)', montant: Math.round(foncier.deficitRG), aVerifier: false });
        if (U.n(s.foncier.deficitsAnterieurs) > 0)
          cases.push({ form: '2042', code: '4BD', libelle: 'Déficits fonciers des années antérieures non encore imputés', montant: Math.round(U.n(s.foncier.deficitsAnterieurs)), aVerifier: false });
      }
    }

    /* Cases LMNP */
    if (lmnp.actif) {
      if (lmnp.regime === 'micro') {
        const code = s.lmnp.type === 'classe' ? '5NG' : '5ND';
        cases.push({
          form: '2042-C-PRO',
          code: code + ' (5OD/5PD décl. 2/3)',
          libelle: `Micro-BIC location meublée (${P.LMNP.micro[s.lmnp.type] ? P.LMNP.micro[s.lmnp.type].libelle : 'longue durée'}) : recettes brutes, abattement automatique`,
          montant: Math.round(U.n(s.lmnp.loyers)),
          aVerifier: s.lmnp.type === 'classe',
          note: s.lmnp.type === 'classe' ? 'Abattement des meublés classés modifié par la loi « Le Meur » pour les revenus 2025 : vérifiez la case exacte du millésime.' : undefined,
        });
      } else {
        if (lmnp.netImposable > 0)
          cases.push({ form: '2042-C-PRO', code: '5NA (5NK selon situation)', libelle: 'LMNP régime réel : bénéfice (report de la liasse 2031)', montant: Math.round(lmnp.netImposable), aVerifier: true });
        if (lmnp.deficitBicReporte > 0)
          cases.push({ form: '2042-C-PRO', code: '5NY / 5GA-5GJ (déficits)', libelle: 'LMNP régime réel : déficit de l\'année (hors amortissements), reportable 10 ans sur bénéfices LMNP', montant: Math.round(lmnp.deficitBicReporte), aVerifier: true });
      }
    }

    /* ----- 3. Revenu brut global ----- */
    let rbg = salNet1 + salNet2 + pensNettes + bicPro + autres + foncier.netImposable + lmnp.netImposable - foncier.deficitRG - mh;
    if (rbg < 0) {
      alertes.push({ niveau: 'warn', texte: `Déficit global de ${Math.round(-rbg)} € : reportable sur le revenu global des 6 années suivantes (non modélisé).` });
      rbg = 0;
    }
    if (mh > 0) {
      cases.push({ form: '2042', code: '6DD', libelle: 'Monuments historiques : charges déductibles du revenu global (2044-SPE si le bien est loué)', montant: Math.round(mh), aVerifier: true });
    }

    /* ----- 4. Charges déductibles du revenu global ----- */
    const per = DFISC.per.calcPER(s.per, couple, P);
    per.alertes.forEach((t) => alertes.push({ niveau: 'warn', texte: t }));
    if (per.versements1 > 0) cases.push({ form: '2042', code: '6NS', libelle: 'Versements PER déclarant 1', montant: Math.round(per.versements1), aVerifier: false });
    if (per.versements2 > 0) cases.push({ form: '2042', code: '6NT', libelle: 'Versements PER déclarant 2', montant: Math.round(per.versements2), aVerifier: false });
    if (couple && s.per.mutualisation && per.deduitTotal > 0)
      cases.push({ form: '2042', code: '6QR', libelle: 'Mutualisation des plafonds épargne retraite entre conjoints (case à cocher)', montant: null, aVerifier: false });

    const nbEnfMaj = Math.max(0, Math.floor(U.n(s.charges.nbEnfantsMajeurs)));
    const pensEnfMaj = Math.min(U.n(s.charges.pensionEnfantsMajeurs), nbEnfMaj * P.PENSIONS.plafondEnfantMajeur);
    if (U.n(s.charges.pensionEnfantsMajeurs) > pensEnfMaj)
      alertes.push({ niveau: 'warn', texte: `Pension aux enfants majeurs plafonnée à ${P.PENSIONS.plafondEnfantMajeur.toLocaleString('fr-FR')} € par enfant : ${Math.round(pensEnfMaj)} € retenus.` });
    const pensAutres = U.n(s.charges.pensionsAutres);
    if (pensEnfMaj > 0) cases.push({ form: '2042', code: '6EL (6EM 2e enfant)', libelle: 'Pensions alimentaires versées à des enfants majeurs', montant: Math.round(pensEnfMaj), aVerifier: false });
    if (pensAutres > 0) cases.push({ form: '2042', code: '6GU (6GP si décision de justice < 2006)', libelle: 'Autres pensions alimentaires versées (enfants mineurs, ascendants, ex-conjoint)', montant: Math.round(pensAutres), aVerifier: false });

    const accueil = Math.min(U.n(s.charges.accueilAge), Math.max(1, Math.floor(U.n(s.charges.nbAccueil) || 1)) * P.PENSIONS.accueilPersonneAgee);
    if (accueil > 0) cases.push({ form: '2042', code: '6EU/6EV', libelle: "Frais d'accueil d'une personne de + de 75 ans sans obligation alimentaire", montant: Math.round(accueil), aVerifier: false });

    const csg = U.n(s.revenus.csgDeductible);
    if (csg > 0) cases.push({ form: '2042', code: '6DE', libelle: 'CSG déductible (généralement préremplie)', montant: Math.round(csg), aVerifier: false });

    const rachat = U.n(s.charges.rachatTrimestres);
    if (rachat > 0) cases.push({ form: '2042', code: '6DD', libelle: 'Rachat de trimestres de retraite (déductions diverses — selon votre situation, parfois à déduire des salaires)', montant: Math.round(rachat), aVerifier: true });

    const chargesDeductibles = per.deduitTotal + pensEnfMaj + pensAutres + accueil + csg + rachat;
    const rni = Math.max(0, rbg - chargesDeductibles);

    /* ----- 5. IR au barème ----- */
    const ir = DFISC.bareme.calculIR(rni, s.foyer, P);
    if (s.foyer.parentIsole && s.foyer.situation !== 'couple')
      cases.push({ form: '2042', code: 'T', libelle: 'Parent isolé (case à cocher)', montant: null, aVerifier: false });
    if (ir.plafonnementQFApplique)
      alertes.push({ niveau: 'info', texte: 'Plafonnement du quotient familial appliqué (avantage par demi-part limité à 1 791 €).' });

    /* ----- 6. Réductions et crédits d'impôt ----- */
    const D = DFISC.dispositifs;
    const avantages = [];
    const add = (a) => {
      if (!a) return;
      if (Array.isArray(a)) return a.forEach(add);
      avantages.push(a);
      a.alertes.forEach((t) => alertes.push({ niveau: 'info', texte: t }));
      if (a.cases) a.cases.forEach((c) => cases.push(c));
    };
    add(D.pinel(s.dispositifs.pinel, P, P.MILLESIME.revenus));
    add(D.locAvantages(s.dispositifs.locavantages, P));
    add(D.malraux(s.dispositifs.malraux, P));
    add(D.girardin(s.dispositifs.girardin, P));
    add(D.censiEtAutresReports(s.dispositifs));
    add(D.dons(s.dons, rni, P));
    add(D.syndicats(s.divers.syndicats, sal1 + sal2 + pens1 + pens2, P));
    add(D.emploiDomicile(s.famille.emploiDomicile, s.foyer, P));
    add(D.gardeEnfants(s.famille.garde, P));
    add(D.scolarite(s.famille.scolarite, P));
    add(D.ehpad(s.famille.ehpad, P));
    add(D.prestationCompensatoire(s.famille.prestationCompensatoire, P));
    add(D.pme(s.divers.pme, couple, P));
    add(D.fondsInnovation(s.divers.fonds, couple, P));
    add(D.sofica(s.divers.sofica, rni, P));
    add(D.foret(s.divers.foret, couple, P));
    add(D.bornes(s.divers.bornes, P));
    add(D.equipementsPA(s.divers.equipements, couple, P));

    const reductions = avantages.filter((a) => a.type === 'reduction' && a.montant > 0);
    const credits = avantages.filter((a) => a.type === 'credit' && a.montant > 0);
    const totalReductions = reductions.reduce((x, a) => x + a.montant, 0);
    const totalCredits = credits.reduce((x, a) => x + a.montant, 0);

    const reductionsImputees = Math.min(totalReductions, ir.irApresDecote);
    const reductionsPerdues = totalReductions - reductionsImputees;
    const tauxImputation = totalReductions > 0 ? reductionsImputees / totalReductions : 0;
    reductions.forEach((a) => (a.montantEffectif = a.montant * tauxImputation));
    credits.forEach((a) => (a.montantEffectif = a.montant));
    if (reductionsPerdues > 0.5) {
      alertes.push({
        niveau: 'warn',
        texte: `⚠ ${Math.round(reductionsPerdues)} € de réductions d'impôt dépassent votre impôt et sont perdues (sauf dispositifs reportables : dons, Malraux, IR-PME…). Étalez vos investissements !`,
      });
    }

    /* ----- 7. Plafonnement global des niches ----- */
    const plaf = DFISC.plafonnement.appliquerPlafonnement(avantages, P);
    if (plaf.reprise > 0.5) {
      alertes.push({
        niveau: 'warn',
        texte: `⚠ Plafonnement global des niches (${plaf.plafondApplicable.toLocaleString('fr-FR')} €) dépassé : ${Math.round(plaf.reprise)} € d'avantages repris. Répartissez vos investissements sur plusieurs années.`,
      });
    }

    /* ----- 8. Impôt net ----- */
    const irApresReductions = ir.irApresDecote - reductionsImputees + plaf.reprise;
    const irNet = irApresReductions - totalCredits; // négatif = restitution

    /* ----- 9. Prélèvements sociaux et PFU (information) ----- */
    const psBase = foncier.psBase + lmnp.psBase;
    const ps = psBase * P.PS.taux;
    const rcm = U.n(s.revenus.rcmPfu);
    const pfu = rcm * (0.128 + P.PS.taux);
    if (rcm > 0) cases.push({ form: '2042', code: '2DC/2TR…', libelle: 'Revenus de capitaux mobiliers (PFU 30 % — généralement préremplis)', montant: Math.round(rcm), aVerifier: false });

    /* ----- 10. CEHR ----- */
    const rfr = rni + rcm; // approximation du revenu fiscal de référence
    const cehr = DFISC.bareme.calculCEHR(rfr, couple, P);
    if (cehr > 0)
      alertes.push({ niveau: 'info', texte: `CEHR estimée : ${Math.round(cehr)} € (RFR ≈ ${Math.round(rfr)} €). Une contribution différentielle (CDHR, imposition minimale de 20 %) peut aussi s'appliquer — non calculée.` });

    const total = irNet + ps + cehr;

    return {
      couple,
      salNet1, salNet2, pensNettes, bicPro, autres,
      foncier, lmnp, mh,
      per, chargesDeductibles, rbg, rni,
      ir, reductions, credits, totalReductions, totalCredits,
      reductionsImputees, reductionsPerdues, plafonnement: plaf,
      irNet, ps, psBase, pfu, rcm, cehr, rfr,
      total, // IR net (hors PFU) + PS immobilier + CEHR
      cases, alertes, avantages,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Leviers : neutralisation pour le scénario « sans optimisation »     */
  /* ------------------------------------------------------------------ */
  const LEVIERS = [
    { cle: 'per', libelle: 'Plan d\'épargne retraite (PER)', actif: (s) => U.n(s.per.versements1) + U.n(s.per.versements2) > 0, neutraliser: (s) => { s.per.versements1 = 0; s.per.versements2 = 0; } },
    { cle: 'deficitFoncier', libelle: 'Déficit foncier (travaux au régime réel)', actif: (s) => s.foncier.actif && U.n(s.foncier.travaux) + U.n(s.foncier.travauxRenov) > 0, neutraliser: (s) => { s.foncier.travaux = 0; s.foncier.travauxRenov = 0; } },
    { cle: 'lmnpAmortissements', libelle: 'LMNP au réel (amortissements)', actif: (s) => s.lmnp.actif && U.n(s.lmnp.prixBien) + U.n(s.lmnp.mobilier) + U.n(s.lmnp.travaux) > 0, neutraliser: (s) => { s.lmnp.prixBien = 0; s.lmnp.mobilier = 0; s.lmnp.travaux = 0; s.lmnp.fraisAcquisition = 0; s.lmnp.reportsAmortissements = 0; s.lmnp.regime = 'auto'; } },
    { cle: 'pinel', libelle: 'Pinel / Denormandie', actif: (s) => s.dispositifs.pinel && s.dispositifs.pinel.actif, neutraliser: (s) => { s.dispositifs.pinel.actif = false; } },
    { cle: 'locavantages', libelle: "Loc'Avantages", actif: (s) => s.dispositifs.locavantages && s.dispositifs.locavantages.actif, neutraliser: (s) => { s.dispositifs.locavantages.actif = false; } },
    { cle: 'malraux', libelle: 'Malraux', actif: (s) => U.n(s.dispositifs.malraux && s.dispositifs.malraux.travaux) > 0, neutraliser: (s) => { s.dispositifs.malraux.travaux = 0; } },
    { cle: 'mh', libelle: 'Monuments historiques', actif: (s) => U.n(s.dispositifs.mh && s.dispositifs.mh.travaux) > 0, neutraliser: (s) => { s.dispositifs.mh.travaux = 0; } },
    { cle: 'girardin', libelle: 'Girardin outre-mer', actif: (s) => U.n(s.dispositifs.girardin && s.dispositifs.girardin.reduction) > 0, neutraliser: (s) => { s.dispositifs.girardin.reduction = 0; } },
    { cle: 'censi', libelle: 'Censi-Bouvard / autres reports', actif: (s) => U.n(s.dispositifs.censi) + U.n(s.dispositifs.autresReports) > 0, neutraliser: (s) => { s.dispositifs.censi = 0; s.dispositifs.autresReports = 0; } },
    { cle: 'dons', libelle: 'Dons aux œuvres', actif: (s) => U.n(s.dons.urgence) + U.n(s.dons.general) > 0, neutraliser: (s) => { s.dons.urgence = 0; s.dons.general = 0; } },
    { cle: 'emploiDomicile', libelle: 'Emploi à domicile', actif: (s) => U.n(s.famille.emploiDomicile.depenses) > 0, neutraliser: (s) => { s.famille.emploiDomicile.depenses = 0; s.famille.emploiDomicile.jardinage = 0; s.famille.emploiDomicile.informatique = 0; s.famille.emploiDomicile.bricolage = 0; } },
    { cle: 'garde', libelle: "Garde d'enfants < 6 ans", actif: (s) => U.n(s.famille.garde.depenses) > 0, neutraliser: (s) => { s.famille.garde.depenses = 0; } },
    { cle: 'scolarite', libelle: 'Frais de scolarité', actif: (s) => U.n(s.famille.scolarite.college) + U.n(s.famille.scolarite.lycee) + U.n(s.famille.scolarite.superieur) > 0, neutraliser: (s) => { s.famille.scolarite.college = 0; s.famille.scolarite.lycee = 0; s.famille.scolarite.superieur = 0; } },
    { cle: 'ehpad', libelle: 'Dépendance (EHPAD)', actif: (s) => U.n(s.famille.ehpad.montant1) + U.n(s.famille.ehpad.montant2) > 0, neutraliser: (s) => { s.famille.ehpad.montant1 = 0; s.famille.ehpad.montant2 = 0; } },
    { cle: 'prestComp', libelle: 'Prestation compensatoire', actif: (s) => U.n(s.famille.prestationCompensatoire) > 0, neutraliser: (s) => { s.famille.prestationCompensatoire = 0; } },
    { cle: 'pensions', libelle: 'Pensions alimentaires / accueil / rachat trimestres', actif: (s) => U.n(s.charges.pensionEnfantsMajeurs) + U.n(s.charges.pensionsAutres) + U.n(s.charges.accueilAge) + U.n(s.charges.rachatTrimestres) > 0, neutraliser: (s) => { s.charges.pensionEnfantsMajeurs = 0; s.charges.pensionsAutres = 0; s.charges.accueilAge = 0; s.charges.rachatTrimestres = 0; } },
    { cle: 'syndicats', libelle: 'Cotisations syndicales', actif: (s) => U.n(s.divers.syndicats) > 0, neutraliser: (s) => { s.divers.syndicats = 0; } },
    { cle: 'pme', libelle: 'Souscription PME / JEI', actif: (s) => U.n(s.divers.pme.montant) > 0, neutraliser: (s) => { s.divers.pme.montant = 0; } },
    { cle: 'fonds', libelle: 'FCPI / FIP', actif: (s) => U.n(s.divers.fonds.fcpi) + U.n(s.divers.fonds.fip) + U.n(s.divers.fonds.fipCorse) + U.n(s.divers.fonds.fipOM) > 0, neutraliser: (s) => { s.divers.fonds.fcpi = 0; s.divers.fonds.fip = 0; s.divers.fonds.fipCorse = 0; s.divers.fonds.fipOM = 0; } },
    { cle: 'sofica', libelle: 'Sofica', actif: (s) => U.n(s.divers.sofica.montant) > 0, neutraliser: (s) => { s.divers.sofica.montant = 0; } },
    { cle: 'foret', libelle: 'Investissement forestier', actif: (s) => U.n(s.divers.foret) > 0, neutraliser: (s) => { s.divers.foret = 0; } },
    { cle: 'bornes', libelle: 'Borne de recharge', actif: (s) => U.n(s.divers.bornes.depense) > 0, neutraliser: (s) => { s.divers.bornes.depense = 0; } },
    { cle: 'equipements', libelle: 'Équipements personnes âgées/handicap', actif: (s) => U.n(s.divers.equipements) > 0, neutraliser: (s) => { s.divers.equipements = 0; } },
  ];

  function run(state) {
    const P = DFISC.PARAMS;
    const final = computeScenario(state, P);

    // Scénario « sans aucun levier »
    const sBase = clone(state);
    const leviersActifs = LEVIERS.filter((l) => l.actif(state));
    leviersActifs.forEach((l) => l.neutraliser(sBase));
    const baseline = computeScenario(sBase, P);

    // Impact marginal de chaque levier (recalcul complet sans ce seul levier)
    const impacts = leviersActifs.map((l) => {
      const sSans = clone(state);
      l.neutraliser(sSans);
      const r = computeScenario(sSans, P);
      return { cle: l.cle, libelle: l.libelle, economie: r.total - final.total };
    });
    impacts.sort((a, b) => b.economie - a.economie);

    return {
      params: P,
      final,
      baseline,
      impacts,
      economieTotale: baseline.total - final.total,
      economieIR: baseline.irNet - final.irNet,
      economiePS: baseline.ps - final.ps,
    };
  }

  DFISC.simulateur = { computeScenario, run, LEVIERS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
