/* =========================================================================
 * Projection pluriannuelle (10 ans par défaut).
 *
 * Rejoue le simulateur complet pour chaque année N+k en :
 *  - faisant croître revenus d'activité et loyers selon des taux paramétrables ;
 *  - neutralisant les dépenses « one-shot » après l'année N (travaux, frais
 *    d'acquisition non incorporés, souscriptions PME/FCPI/Sofica, Girardin,
 *    Malraux, prestation compensatoire…) ;
 *  - enchaînant les reports d'une année sur l'autre : déficits fonciers
 *    (10 ans), amortissements LMNP non déduits (art. 39 C, sans limite),
 *    déficits BIC meublés (10 ans) ;
 *  - suivant le calendrier Pinel/Denormandie (taux de prorogation, fin
 *    d'engagement) ;
 *  - arrêtant l'annuité du mobilier/travaux LMNP à la fin de leur durée.
 *
 * Simplifications assumées (documentées dans l'interface) : barème et
 * plafonds constants (valeur année N), intérêts d'emprunt constants,
 * pas de nouveaux investissements, prélèvements sociaux à 17,2 %.
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function projeter(stateBase, options, P) {
    const opts = options || {};
    const nbAnnees = Math.max(1, Math.min(15, Math.floor(opts.annees || 10)));
    const gR = (Number.isFinite(parseFloat(opts.croissanceRevenus)) ? parseFloat(opts.croissanceRevenus) : 1.5) / 100;
    const gL = (Number.isFinite(parseFloat(opts.croissanceLoyers)) ? parseFloat(opts.croissanceLoyers) : 2) / 100;
    const perRecurrent = opts.perRecurrent !== false;
    const anneeN = P.MILLESIME.revenus;

    let reportsFoncier = U.n(stateBase.foncier && stateBase.foncier.deficitsAnterieurs);
    let reportsAmort = U.n(stateBase.lmnp && stateBase.lmnp.reportsAmortissements);
    let reportsBic = U.n(stateBase.lmnp && stateBase.lmnp.deficitsBicAnterieurs);

    const lignes = [];
    let pinelPrecedent = null;

    for (let k = 0; k < nbAnnees; k++) {
      const s = clone(stateBase);
      s._anneeRevenus = anneeN + k;
      const fR = Math.pow(1 + gR, k);
      const fL = Math.pow(1 + gL, k);

      /* Revenus d'activité */
      for (const champ of ['salaires1', 'salaires2', 'pensions1', 'pensions2', 'bicPro', 'autres', 'rcmPfu']) {
        s.revenus[champ] = U.n(s.revenus[champ]) * fR;
      }
      /* Loyers et charges courantes immobilières */
      s.foncier.loyers = U.n(s.foncier.loyers) * fL;
      for (const champ of ['assurance', 'taxeFonciere', 'gestion', 'copro']) s.foncier[champ] = U.n(s.foncier[champ]) * fL;
      s.lmnp.loyers = U.n(s.lmnp.loyers) * fL;
      s.lmnp.charges = U.n(s.lmnp.charges) * fL;
      if (s.dispositifs.locavantages) s.dispositifs.locavantages.loyers = U.n(s.dispositifs.locavantages.loyers) * fL;

      const evenements = [];
      if (k > 0) {
        /* One-shot de l'année N uniquement */
        s.foncier.travaux = 0;
        s.foncier.travauxRenov = 0;
        s.foncier.chargesLocNonRecuperees = 0;
        s.foncier.regularisationCopro = 0;
        s.foncier.autresCharges = 0;
        if (!s.lmnp.incorporerFrais) s.lmnp.fraisAcquisition = 0;
        s.dispositifs.malraux.travaux = 0;
        s.dispositifs.mh.travaux = 0;
        s.dispositifs.girardin.reduction = 0;
        s.famille.prestationCompensatoire = 0;
        s.charges.rachatTrimestres = 0;
        s.divers.pme.montant = 0;
        s.divers.fonds = { fcpi: 0, fip: 0, fipCorse: 0, fipOM: 0 };
        s.divers.sofica.montant = 0;
        s.divers.foret = 0;
        s.divers.bornes.depense = 0;
        s.divers.equipements = 0;
        if (!perRecurrent) { s.per.versements1 = 0; s.per.versements2 = 0; }
        /* Fin d'amortissement du mobilier / des travaux LMNP */
        const dMob = Math.max(1, U.n(stateBase.lmnp.dureeMobilier) || P.LMNP.dureeMobilierDefaut);
        const dTvx = Math.max(1, U.n(stateBase.lmnp.dureeTravaux) || P.LMNP.dureeTravauxDefaut);
        if (k >= dMob && U.n(stateBase.lmnp.mobilier) > 0) {
          s.lmnp.mobilier = 0;
          if (k === dMob) evenements.push('Mobilier LMNP totalement amorti');
        }
        if (k >= dTvx && U.n(stateBase.lmnp.travaux) > 0) s.lmnp.travaux = 0;
      }

      /* Reports enchaînés */
      s.foncier.deficitsAnterieurs = reportsFoncier;
      s.lmnp.reportsAmortissements = reportsAmort;
      s.lmnp.deficitsBicAnterieurs = reportsBic;

      const r = DFISC.simulateur.computeScenario(s, P);

      /* Mise à jour des reports pour l'année suivante */
      const fon = r.foncier;
      if (fon.actif && fon.regime === 'reel') {
        const imputes = (fon.details.reel && fon.details.reel.deficitsAnterieursImputes) || 0;
        const avant = reportsFoncier;
        reportsFoncier = Math.max(0, reportsFoncier - imputes) + (fon.reportInterets || 0) + (fon.reportAutres || 0);
        if (avant > 0 && reportsFoncier === 0) evenements.push('Déficits fonciers reportés entièrement consommés');
      }
      const lm = r.lmnp;
      if (lm.actif && lm.regime === 'reel' && lm.details.reel) {
        reportsAmort = lm.reportAmortissements || 0;
        const apresAmort = Math.max(0, lm.details.reel.resultatAvantAmort - lm.details.reel.amortDeduit);
        const bicConsommes = Math.min(reportsBic, apresAmort);
        reportsBic = reportsBic - bicConsommes + (lm.deficitBicReporte || 0);
      }

      /* Événements Pinel */
      const avPinel = (r.avantages || []).find((a) => a.cle === 'pinel');
      const pinelMontant = avPinel ? avPinel.montant : 0;
      if (pinelPrecedent != null) {
        if (pinelPrecedent > 0 && pinelMontant === 0) evenements.push('Fin de la réduction Pinel/Denormandie');
        else if (pinelPrecedent - pinelMontant > 100) evenements.push('Pinel : passage en prorogation à taux réduit');
      }
      pinelPrecedent = pinelMontant;

      lignes.push({
        annee: anneeN + k,
        k,
        rni: Math.round(r.rni),
        irNet: Math.round(r.irNet),
        ps: Math.round(r.ps),
        total: Math.round(r.total),
        avantages: Math.round(r.reductionsImputees + r.totalCredits),
        pinel: Math.round(pinelMontant),
        reportsFoncierRestants: Math.round(reportsFoncier),
        reportsAmortRestants: Math.round(reportsAmort),
        evenements,
      });
    }
    return { lignes, hypotheses: { croissanceRevenus: gR * 100, croissanceLoyers: gL * 100, perRecurrent } };
  }

  DFISC.projection = { projeter };
})(typeof globalThis !== 'undefined' ? globalThis : this);
