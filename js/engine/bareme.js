/* =========================================================================
 * Calcul de l'impôt au barème : parts fiscales, quotient familial et son
 * plafonnement, décote, tranche marginale, CEHR.
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;

  /** Impôt « droits simples » pour un revenu et un nombre de parts donnés. */
  function impotBrut(rni, parts, P) {
    if (rni <= 0 || parts <= 0) return 0;
    const qf = rni / parts;
    let impotParPart = 0;
    let plancher = 0;
    for (const tr of P.BAREME) {
      const haut = Math.min(qf, tr.jusqua);
      if (haut > plancher) impotParPart += (haut - plancher) * tr.taux;
      plancher = tr.jusqua;
      if (qf <= tr.jusqua) break;
    }
    return impotParPart * parts;
  }

  /** Taux marginal d'imposition pour un quotient donné. */
  function tmi(rni, parts, P) {
    if (rni <= 0 || parts <= 0) return 0;
    const qf = rni / parts;
    let plancher = 0;
    for (const tr of P.BAREME) {
      if (qf <= tr.jusqua) return tr.taux;
      plancher = tr.jusqua;
    }
    return P.BAREME[P.BAREME.length - 1].taux;
  }

  /**
   * Nombre de parts du foyer.
   * foyer = { situation: 'celibataire'|'couple'|'veuf', enfants, enfantsAlternee,
   *           parentIsole, partsForcees }
   * Approximation : cas généraux (pas de demi-parts invalidité / anciens combattants —
   * utilisez « parts forcées » pour ces situations).
   */
  function calculParts(foyer) {
    if (foyer.partsForcees > 0) return foyer.partsForcees;
    const enf = Math.max(0, Math.floor(foyer.enfants || 0));
    const alt = Math.max(0, Math.floor(foyer.enfantsAlternee || 0));
    let parts = foyer.situation === 'couple' ? 2 : 1;
    // Le veuf avec enfant(s) à charge conserve le quotient conjugal.
    if (foyer.situation === 'veuf' && enf + alt > 0) parts = 2;
    // Enfants en charge exclusive : 0,5 part chacun, 1 part à partir du 3e.
    // Enfants en résidence alternée : moitié de ces valeurs.
    for (let i = 1; i <= enf; i++) parts += i <= 2 ? 0.5 : 1;
    for (let j = 1; j <= alt; j++) parts += enf + j <= 2 ? 0.25 : 0.5;
    // Parent isolé (case T) : +0,5 part (0,25 si uniquement alternée).
    if (foyer.parentIsole && foyer.situation !== 'couple') {
      parts += enf > 0 ? 0.5 : alt > 0 ? 0.25 : 0;
    }
    return parts;
  }

  /** Plafond de l'avantage en impôt procuré par les parts au-delà de la base. */
  function plafondAvantageQF(foyer, parts, partsBase, P) {
    const demiPartsSup = Math.max(0, (parts - partsBase) * 2); // en demi-parts
    let plafond = demiPartsSup * P.QF.plafondDemiPart;
    // Parent isolé : la part entière du 1er enfant est plafonnée à 4 224 €
    // (au lieu de 2 × 1 791 €) ; en alternée pure : 2 112 € pour les 2 premiers quarts.
    if (foyer.parentIsole && foyer.situation !== 'couple') {
      if ((foyer.enfants || 0) > 0 && demiPartsSup >= 2) {
        plafond += P.QF.plafondParentIsole - 2 * P.QF.plafondDemiPart;
      } else if ((foyer.enfantsAlternee || 0) > 0 && demiPartsSup >= 1) {
        plafond += P.QF.plafondParentIsoleAlternee - P.QF.plafondDemiPart;
      }
    }
    return plafond;
  }

  /**
   * IR au barème avec plafonnement du QF puis décote.
   * Retourne { parts, irAvantDecote, decote, irApresDecote, tmi, plafonnementQFApplique }
   */
  function calculIR(rni, foyer, P) {
    const parts = calculParts(foyer);
    const couple = foyer.situation === 'couple';
    const partsBase = couple || (foyer.situation === 'veuf' && parts >= 2) ? 2 : 1;

    const irParts = impotBrut(rni, parts, P);
    let irAvantDecote = irParts;
    let plafonnementQFApplique = false;

    if (parts > partsBase) {
      const irBase = impotBrut(rni, partsBase, P);
      const avantage = irBase - irParts;
      const plafond = plafondAvantageQF(foyer, parts, partsBase, P);
      if (avantage > plafond) {
        irAvantDecote = irBase - plafond;
        plafonnementQFApplique = true;
      }
    }

    // Décote
    const seuil = couple ? P.DECOTE.seuilCouple : P.DECOTE.seuilCelibataire;
    const forfait = couple ? P.DECOTE.forfaitCouple : P.DECOTE.forfaitCelibataire;
    let decote = 0;
    if (irAvantDecote > 0 && irAvantDecote < seuil) {
      decote = Math.max(0, forfait - P.DECOTE.taux * irAvantDecote);
      decote = Math.min(decote, irAvantDecote);
    }
    const irApresDecote = Math.max(0, irAvantDecote - decote);

    return {
      parts,
      irAvantDecote,
      decote,
      irApresDecote,
      tmi: tmi(rni, parts, P),
      plafonnementQFApplique,
    };
  }

  /** Contribution exceptionnelle sur les hauts revenus (approximation RFR ≈ RNI + PFU). */
  function calculCEHR(rfr, couple, P) {
    const s1 = P.CEHR.seuil1Celib * (couple ? 2 : 1);
    const s2 = P.CEHR.seuil2Celib * (couple ? 2 : 1);
    if (rfr <= s1) return 0;
    const t1 = Math.min(rfr, s2) - s1;
    const t2 = Math.max(0, rfr - s2);
    return t1 * P.CEHR.taux1 + t2 * P.CEHR.taux2;
  }

  DFISC.bareme = { impotBrut, tmi, calculParts, calculIR, calculCEHR, plafondAvantageQF };
})(typeof globalThis !== 'undefined' ? globalThis : this);
