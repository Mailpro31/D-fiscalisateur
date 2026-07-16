/* =========================================================================
 * Location meublée non professionnelle (LMNP) — BIC.
 *  - Micro-BIC : abattements selon le type de location (règles revenus 2025,
 *    loi « Le Meur » du 19/11/2024).
 *  - Régime réel : amortissement du bien par composants + mobilier + travaux,
 *    limité par l'article 39 C du CGI (l'amortissement ne peut pas créer ni
 *    augmenter un déficit BIC ; l'excédent est reporté sans limite de durée).
 *  - Le déficit LMNP (hors amortissements) n'est imputable que sur les
 *    bénéfices de location meublée non professionnelle des 10 années suivantes.
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;

  /** Plan d'amortissement annuel (linéaire, année pleine — prorata non géré). */
  function calcAmortissement(l, P) {
    const prix = U.n(l.prixBien);
    const partTerrain = U.clamp(U.n(l.partTerrainPct) || P.LMNP.partTerrainDefaut, 0, 100) / 100;
    const frais = U.n(l.fraisAcquisition);
    const baseBatie = prix * (1 - partTerrain) + (l.incorporerFrais ? frais * (1 - partTerrain) : 0);

    const composants = (l.composants && l.composants.length ? l.composants : P.LMNP.composantsDefaut).map((c) => {
      const montant = (baseBatie * U.n(c.pct)) / 100;
      const duree = Math.max(1, U.n(c.duree));
      return { ...c, montant, annuite: montant / duree };
    });

    const mobilier = U.n(l.mobilier);
    const dureeMobilier = Math.max(1, U.n(l.dureeMobilier) || P.LMNP.dureeMobilierDefaut);
    const travaux = U.n(l.travaux);
    const dureeTravaux = Math.max(1, U.n(l.dureeTravaux) || P.LMNP.dureeTravauxDefaut);

    const annuiteComposants = composants.reduce((s, c) => s + c.annuite, 0);
    const annuiteMobilier = mobilier / dureeMobilier;
    const annuiteTravaux = travaux / dureeTravaux;

    return {
      baseBatie,
      terrain: prix * partTerrain,
      composants,
      annuiteComposants,
      annuiteMobilier,
      annuiteTravaux,
      annuiteTotale: annuiteComposants + annuiteMobilier + annuiteTravaux,
      fraisEnCharge: l.incorporerFrais ? 0 : frais,
    };
  }

  /**
   * l = { actif, type:'longue'|'classe'|'nonclasse', loyers, charges, interets,
   *       prixBien, partTerrainPct, fraisAcquisition, incorporerFrais, mobilier,
   *       dureeMobilier, travaux, dureeTravaux, composants[], reportsAmortissements,
   *       deficitsBicAnterieurs, regime:'auto'|'micro'|'reel', anneeAcquisition }
   */
  function calcLMNP(l, P) {
    const out = {
      actif: !!l.actif && (U.n(l.loyers) > 0 || U.n(l.prixBien) > 0),
      regime: 'reel',
      netImposable: 0,
      psBase: 0,
      amortissement: null,
      amortissementDeduit: 0,
      reportAmortissements: 0, // excédent 39 C reporté sans limite
      deficitBicReporte: 0, // déficit hors amortissements (report 10 ans, LMNP uniquement)
      details: {},
      alertes: [],
      microEligible: false,
      comparatif: null,
    };
    if (!out.actif) return out;

    const loyers = U.n(l.loyers);
    const type = P.LMNP.micro[l.type] ? l.type : 'longue';
    const microP = P.LMNP.micro[type];
    out.microEligible = loyers <= microP.plafond;

    /* ----- Micro-BIC ----- */
    const abattement = Math.max(loyers * microP.abattement, Math.min(loyers, P.LMNP.abattementMinimum));
    const micro = out.microEligible ? { netImposable: Math.max(0, Math.round(loyers - abattement)), abattement } : null;

    /* ----- Réel : amortissements ----- */
    const amort = calcAmortissement(l, P);
    const chargesTotales = U.n(l.charges) + U.n(l.interets) + amort.fraisEnCharge;
    const resultatAvantAmort = loyers - chargesTotales;

    // Art. 39 C : amortissement déductible limité au résultat avant amortissement.
    const amortDisponible = amort.annuiteTotale + U.n(l.reportsAmortissements);
    const amortDeduit = Math.min(amortDisponible, Math.max(0, resultatAvantAmort));
    const reportAmort = amortDisponible - amortDeduit;

    let beneficeReel = 0;
    let deficitBic = 0;
    if (resultatAvantAmort >= 0) {
      const apresAmort = resultatAvantAmort - amortDeduit;
      // Imputation des déficits LMNP antérieurs (10 ans) sur le bénéfice restant.
      beneficeReel = Math.max(0, apresAmort - U.n(l.deficitsBicAnterieurs));
    } else {
      deficitBic = -resultatAvantAmort;
    }

    const reel = {
      loyers,
      chargesTotales,
      resultatAvantAmort,
      amortTheorique: amort.annuiteTotale,
      amortDisponible,
      amortDeduit,
      reportAmort,
      netImposable: beneficeReel,
      deficitBic,
    };

    /* ----- Choix du régime ----- */
    let regime = l.regime || 'auto';
    if (regime === 'micro' && !out.microEligible) {
      regime = 'reel';
      out.alertes.push(`Micro-BIC impossible (recettes > ${microP.plafond.toLocaleString('fr-FR')} € pour « ${microP.libelle} ») : régime réel appliqué.`);
    }
    if (regime === 'auto') {
      regime = micro && micro.netImposable <= beneficeReel && deficitBic === 0 ? 'micro' : 'reel';
      if (micro && (beneficeReel < micro.netImposable || deficitBic > 0)) regime = 'reel';
    }
    out.regime = regime;
    out.amortissement = amort;
    out.comparatif = { micro: micro ? micro.netImposable : null, reel: beneficeReel - deficitBic * 0 };

    if (regime === 'micro') {
      out.netImposable = micro.netImposable;
      out.psBase = micro.netImposable;
      out.details = { micro, reel };
      if (beneficeReel < micro.netImposable) {
        out.alertes.push('Le régime réel (avec amortissements) serait plus favorable que le micro-BIC cette année.');
      }
    } else {
      out.netImposable = beneficeReel;
      out.psBase = beneficeReel;
      out.amortissementDeduit = amortDeduit;
      out.reportAmortissements = reportAmort;
      out.deficitBicReporte = deficitBic;
      out.details = { reel, micro };
      out.alertes.push(
        'LMNP au réel : tenue d\'une comptabilité et télétransmission d\'une liasse fiscale (2031 + annexes 2033) ' +
          'obligatoires, immatriculation SIRET requise (guichet unique INPI). L\'option pour le réel se prend avant ' +
          'la date limite de dépôt de la déclaration.'
      );
      if (reportAmort > 0.5) {
        out.alertes.push(
          `Amortissements non déduits (art. 39 C) reportés sans limite de durée : ${Math.round(reportAmort)} € ` +
            '(utilisables sur vos futurs bénéfices de location meublée).'
        );
      }
      if (deficitBic > 0) {
        out.alertes.push(
          `Déficit LMNP (hors amortissements) de ${Math.round(deficitBic)} € : imputable uniquement sur vos bénéfices ` +
            'de location meublée non professionnelle des 10 prochaines années (jamais sur le revenu global).'
        );
      }
      out.alertes.push(
        'Attention : depuis le 15/02/2025 (LF 2025), les amortissements déduits en LMNP sont réintégrés dans le calcul ' +
          'de la plus-value imposable lors de la revente (sauf résidences services).'
      );
    }
    return out;
  }

  DFISC.lmnp = { calcLMNP, calcAmortissement };
})(typeof globalThis !== 'undefined' ? globalThis : this);
