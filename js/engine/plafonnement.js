/* =========================================================================
 * Plafonnement global des niches fiscales (art. 200-0 A CGI).
 *  - Plafond de droit commun : 10 000 € d'avantage en impôt par an.
 *  - Plafond majoré : 18 000 € pour la fraction issue des investissements
 *    outre-mer (Girardin, retenu après rétrocession) et des Sofica.
 *  - Hors plafonnement : dons, cotisations syndicales, frais de scolarité,
 *    dépendance (EHPAD), prestation compensatoire, Malraux (depuis 2013),
 *    Monuments historiques et toutes les CHARGES déductibles (PER, pensions…).
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});

  /**
   * avantages : liste d'avantages { montantEffectif, plafonnable, retenuePlafond }
   * où montantEffectif = avantage réellement obtenu (réduction imputée ou crédit).
   * Retourne { retenu10k, retenu18k, reprise, plafondApplicable, detail }
   */
  function appliquerPlafonnement(avantages, P) {
    let a10 = 0; // avantages de droit commun
    let a18 = 0; // fraction outre-mer / Sofica (montants retenus)
    for (const av of avantages) {
      if (!av || av.montantEffectif <= 0) continue;
      if (av.plafonnable === '10k') a10 += av.montantEffectif;
      else if (av.plafonnable === '18k') {
        const retenu = av.retenuePlafond != null ? av.retenuePlafond * (av.montantEffectif / (av.montant || av.montantEffectif)) : av.montantEffectif;
        a18 += retenu;
      }
    }
    const base = P.NICHES.plafondBase;
    const majore = P.NICHES.plafondMajore;
    const reprise10 = Math.max(0, a10 - base);
    const reprise18 = Math.max(0, Math.min(a10, base) + a18 - majore);
    return {
      retenu10k: a10,
      retenu18k: a18,
      total: a10 + a18,
      plafondApplicable: a18 > 0 ? majore : base,
      reprise: reprise10 + reprise18,
    };
  }

  DFISC.plafonnement = { appliquerPlafonnement };
})(typeof globalThis !== 'undefined' ? globalThis : this);
