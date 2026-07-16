/* =========================================================================
 * Revenus fonciers — location nue.
 *  - Comparaison micro-foncier (abattement 30 %) / régime réel (2044)
 *  - Déficit foncier : imputation sur le revenu global à hauteur de
 *    10 700 € (21 400 € pour dépenses de rénovation énergétique 2023-2025),
 *    la part liée aux intérêts d'emprunt n'étant imputable que sur les
 *    revenus fonciers des 10 années suivantes (art. 156 I.3° CGI).
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;

  /**
   * f = { actif, loyers, nbLocaux, assurance, taxeFonciere, gestion, copro,
   *       regularisationCopro, travaux, travauxRenov, chargesLocNonRecuperees,
   *       autresCharges, interets, deficitsAnterieurs, regime:'auto'|'micro'|'reel',
   *       locAvantagesActif }
   */
  function calcFoncier(f, P) {
    const out = {
      actif: !!f.actif && U.n(f.loyers) >= 0 && (U.n(f.loyers) > 0 || totalCharges(f) > 0),
      regime: 'reel',
      netImposable: 0, // bénéfice foncier imposable (≥ 0), part du RBG
      deficitRG: 0, // déficit imputable sur le revenu global (> 0 = à déduire)
      reportInterets: 0, // report sur revenus fonciers 10 ans (part intérêts)
      reportAutres: 0, // report sur revenus fonciers 10 ans (part autres charges)
      psBase: 0,
      plafondRGUtilise: P.FONCIER.deficitImputableRG,
      details: {},
      alertes: [],
      microEligible: false,
      comparatif: null,
    };
    if (!out.actif) return out;

    const loyers = U.n(f.loyers);
    const interets = U.n(f.interets);
    const forfaitGestion = P.FONCIER.forfaitGestionParLocal * Math.max(0, U.n(f.nbLocaux) || (loyers > 0 ? 1 : 0));
    const chargesHorsInterets =
      U.n(f.assurance) +
      U.n(f.taxeFonciere) +
      U.n(f.gestion) +
      forfaitGestion +
      Math.max(0, U.n(f.copro) - U.n(f.regularisationCopro)) +
      U.n(f.travaux) +
      U.n(f.travauxRenov) +
      U.n(f.chargesLocNonRecuperees) +
      U.n(f.autresCharges);

    out.microEligible = loyers <= P.FONCIER.microPlafond && !f.locAvantagesActif;
    if (f.locAvantagesActif) {
      out.alertes.push("Loc'Avantages impose le régime réel (2044) : le micro-foncier est écarté.");
    }

    /* ----- Régime réel ----- */
    const reel = { loyers, interets, chargesHorsInterets, forfaitGestion };
    const resultat = loyers - interets - chargesHorsInterets;
    // Plafond d'imputation sur le revenu global, rehaussé à hauteur des
    // dépenses de rénovation énergétique éligibles (max 21 400 €).
    const plafondRG = Math.min(
      P.FONCIER.deficitImputableRGRenov,
      P.FONCIER.deficitImputableRG + U.n(f.travauxRenov)
    );
    out.plafondRGUtilise = plafondRG;

    let netReel = 0,
      deficitRG = 0,
      repInt = 0,
      repAutres = 0;
    if (resultat >= 0) {
      // Bénéfice : on impute d'abord les déficits antérieurs reportés.
      const apresReports = Math.max(0, resultat - U.n(f.deficitsAnterieurs));
      netReel = apresReports;
      reel.deficitsAnterieursImputes = resultat - apresReports;
    } else {
      const loyersMoinsInterets = loyers - interets;
      if (loyersMoinsInterets < 0) {
        // Les intérêts excèdent les loyers : cette fraction n'est reportable
        // que sur les revenus fonciers ; tout le déficit « autres charges »
        // est imputable sur le revenu global dans la limite du plafond.
        repInt = -loyersMoinsInterets;
        deficitRG = Math.min(chargesHorsInterets, plafondRG);
        repAutres = chargesHorsInterets - deficitRG;
      } else {
        const deficitAutres = -resultat; // entièrement dû aux autres charges
        deficitRG = Math.min(deficitAutres, plafondRG);
        repAutres = deficitAutres - deficitRG;
      }
    }
    reel.resultat = resultat;
    reel.netImposable = netReel;
    reel.deficitRG = deficitRG;
    reel.reportInterets = repInt;
    reel.reportAutres = repAutres;

    /* ----- Micro-foncier ----- */
    const micro = out.microEligible
      ? { netImposable: Math.round(loyers * (1 - P.FONCIER.microAbattement)), abattement: loyers * P.FONCIER.microAbattement }
      : null;

    /* ----- Choix du régime ----- */
    let regime = f.regime || 'auto';
    if (regime === 'micro' && !out.microEligible) {
      regime = 'reel';
      out.alertes.push('Micro-foncier impossible (loyers > 15 000 € ou dispositif incompatible) : régime réel appliqué.');
    }
    if (regime === 'auto') {
      // Comparaison sur la base imposable équivalente (le déficit imputable
      // sur le revenu global compte négativement).
      const scoreReel = netReel - deficitRG;
      regime = micro && micro.netImposable <= scoreReel ? 'micro' : 'reel';
    }
    out.regime = regime;
    out.comparatif = {
      reel: netReel - deficitRG,
      micro: micro ? micro.netImposable : null,
    };

    if (regime === 'micro') {
      out.netImposable = micro.netImposable;
      out.psBase = micro.netImposable;
      out.details = { micro, reel };
      if (netReel - deficitRG < micro.netImposable) {
        out.alertes.push('Le régime réel serait plus favorable que le micro-foncier cette année.');
      }
    } else {
      out.netImposable = netReel;
      out.deficitRG = deficitRG;
      out.reportInterets = repInt;
      out.reportAutres = repAutres;
      out.psBase = netReel;
      out.details = { reel, micro };
      if (repInt + repAutres > 0) {
        out.alertes.push(
          `Déficit foncier reporté sur les revenus fonciers des 10 prochaines années : ${Math.round(repInt + repAutres)} € ` +
            `(dont part intérêts d'emprunt : ${Math.round(repInt)} €).`
        );
      }
      if (deficitRG > 0 && U.n(f.travauxRenov) > 0 && plafondRG > P.FONCIER.deficitImputableRG) {
        out.alertes.push(
          `Plafond d'imputation sur le revenu global porté à ${Math.round(plafondRG)} € grâce aux travaux de rénovation ` +
            `énergétique (conditions : logement classé E, F ou G atteignant au plus la classe D, dépenses payées 2023-2025, ` +
            `devis accepté à compter du 5/11/2022).`
        );
      }
    }
    return out;
  }

  function totalCharges(f) {
    return (
      U.n(f.assurance) + U.n(f.taxeFonciere) + U.n(f.gestion) + U.n(f.copro) +
      U.n(f.travaux) + U.n(f.travauxRenov) + U.n(f.chargesLocNonRecuperees) +
      U.n(f.autresCharges) + U.n(f.interets)
    );
  }

  DFISC.foncier = { calcFoncier };
})(typeof globalThis !== 'undefined' ? globalThis : this);
