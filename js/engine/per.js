/* =========================================================================
 * Plan d'épargne retraite (PER individuel) — déduction du revenu global
 * (art. 163 quatervicies CGI).
 * Plafond = 10 % des revenus professionnels N-1 (borné), + reliquats 3 ans
 * (=> saisir le « plafond disponible » figurant sur l'avis d'imposition).
 * Possibilité de mutualiser les plafonds entre conjoints (case 6QR).
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;

  function plafondAuto(revenusProN1, P) {
    if (revenusProN1 <= 0) return P.PER.plancher;
    return U.clamp(0.1 * revenusProN1, P.PER.plancher, P.PER.plafond);
  }

  /**
   * per = { versements1, versements2, plafondAvis1, plafondAvis2,
   *         revenusProN1_1, revenusProN1_2, mutualisation }
   */
  function calcPER(per, couple, P) {
    const v1 = U.n(per.versements1);
    const v2 = couple ? U.n(per.versements2) : 0;
    const p1 = U.n(per.plafondAvis1) > 0 ? U.n(per.plafondAvis1) : plafondAuto(U.n(per.revenusProN1_1), P);
    const p2 = couple ? (U.n(per.plafondAvis2) > 0 ? U.n(per.plafondAvis2) : plafondAuto(U.n(per.revenusProN1_2), P)) : 0;

    let deduit1, deduit2, excedent;
    if (couple && per.mutualisation) {
      const pool = p1 + p2;
      const total = v1 + v2;
      const deduitTotal = Math.min(total, pool);
      // répartition proportionnelle pour l'affichage
      deduit1 = total > 0 ? (deduitTotal * v1) / total : 0;
      deduit2 = total > 0 ? (deduitTotal * v2) / total : 0;
      excedent = total - deduitTotal;
    } else {
      deduit1 = Math.min(v1, p1);
      deduit2 = Math.min(v2, p2);
      excedent = v1 - deduit1 + (v2 - deduit2);
    }

    const alertes = [];
    if (excedent > 0.5) {
      alertes.push(
        `PER : ${Math.round(excedent)} € de versements dépassent votre plafond de déduction ` +
          (couple && !per.mutualisation
            ? '(pensez à la mutualisation des plafonds entre conjoints, case 6QR).'
            : '(excédent non déductible).')
      );
    }
    return { versements1: v1, versements2: v2, plafond1: p1, plafond2: p2, deduit1, deduit2, deduitTotal: deduit1 + deduit2, excedent, alertes };
  }

  DFISC.per = { calcPER, plafondAuto };
})(typeof globalThis !== 'undefined' ? globalThis : this);
