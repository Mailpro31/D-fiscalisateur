/* =========================================================================
 * Import d'un FEC (Fichier des Écritures Comptables, art. A.47 A-1 LPF)
 * pour une activité de location meublée (LMNP au réel).
 *
 * Le FEC est un fichier texte tabulé (ou séparé par « | » / « ; ») dont la
 * première ligne contient les en-têtes normalisés : JournalCode, JournalLib,
 * EcritureNum, EcritureDate, CompteNum, CompteLib, …, Debit, Credit (ou
 * Montant + Sens), … Ce module agrège les écritures par racine de compte
 * PCG et en déduit les montants à reporter dans le simulateur :
 *   - classe 70x  : recettes (loyers charges comprises)          → crédit-débit
 *   - 661x        : intérêts d'emprunt                            → débit-crédit
 *   - 681x        : dotations aux amortissements                  → débit-crédit
 *   - autres classe 6 : charges déductibles                       → débit-crédit
 *   - classe 2 (21x/218x) : immobilisations acquises (information)
 * Alerte sur les comptes atypiques (67x exceptionnel, 695 impôt…).
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});

  function nombre(v) {
    if (v == null) return 0;
    const x = parseFloat(String(v).trim().replace(/[  ]/g, '').replace(',', '.'));
    return Number.isFinite(x) ? x : 0;
  }

  function detecterSeparateur(entete) {
    if (entete.includes('\t')) return '\t';
    if (entete.includes('|')) return '|';
    if (entete.includes(';')) return ';';
    return null;
  }

  function estFEC(texte) {
    const debut = String(texte || '').slice(0, 600).toLowerCase();
    return debut.includes('journalcode') && debut.includes('comptenum');
  }

  /**
   * analyser(texte) → {
   *   ok, erreur?, exercice?, nbEcritures,
   *   recettes, charges, interets, amortissements, immobilisations,
   *   detailComptes: [{compte, libelle, montant, affectation}],
   *   alertes: []
   * }
   */
  function analyser(texte) {
    const lignes = String(texte || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lignes.length) return { ok: false, erreur: 'Fichier vide.' };
    const sep = detecterSeparateur(lignes[0]);
    if (!sep || !estFEC(lignes[0])) {
      return { ok: false, erreur: 'En-têtes FEC introuvables (JournalCode / CompteNum). Vérifiez le fichier exporté par votre logiciel comptable.' };
    }
    const entetes = lignes[0].split(sep).map((h) => h.trim().toLowerCase());
    const idx = (nom) => entetes.indexOf(nom);
    const iCompte = idx('comptenum');
    const iLib = idx('comptelib');
    const iDebit = idx('debit');
    const iCredit = idx('credit');
    const iMontant = idx('montant');
    const iSens = idx('sens');
    const iDate = idx('ecrituredate');
    if (iCompte < 0 || (iDebit < 0 && iMontant < 0)) {
      return { ok: false, erreur: 'Colonnes CompteNum / Debit-Credit (ou Montant/Sens) absentes.' };
    }

    const res = {
      ok: true,
      nbEcritures: 0,
      exercice: null,
      recettes: 0,
      charges: 0,
      interets: 0,
      amortissements: 0,
      immobilisations: 0,
      alertes: [],
      detailComptes: new Map(), // racine 3 chiffres → {libelle, montant, affectation}
    };

    for (let n = 1; n < lignes.length; n++) {
      const c = lignes[n].split(sep);
      if (c.length < entetes.length - 2) continue;
      const compte = String(c[iCompte] || '').trim();
      if (!compte) continue;
      res.nbEcritures++;
      if (iDate >= 0 && !res.exercice) {
        const d = String(c[iDate] || '').trim();
        if (/^\d{8}$/.test(d)) res.exercice = d.slice(0, 4);
      }
      let debit, credit;
      if (iDebit >= 0 && iCredit >= 0) {
        debit = nombre(c[iDebit]);
        credit = nombre(c[iCredit]);
      } else {
        const m = nombre(c[iMontant]);
        const sens = String(c[iSens] || '').trim().toUpperCase();
        debit = sens === 'D' ? m : 0;
        credit = sens === 'C' ? m : 0;
      }

      const classe = compte[0];
      const racine3 = compte.slice(0, 3);
      let affectation = null;
      let montant = 0;

      if (classe === '7') {
        montant = credit - debit;
        if (racine3 === '775' || racine3 === '778' || racine3 === '777') {
          affectation = 'exceptionnel';
          if (montant !== 0) res.alertes.push(`Produit exceptionnel (compte ${compte}) : ${Math.round(montant)} € non repris automatiquement — traitez-le manuellement.`);
        } else {
          affectation = 'recettes';
          res.recettes += montant;
        }
      } else if (classe === '6') {
        montant = debit - credit;
        if (racine3 === '661' || compte.startsWith('6611') || compte.startsWith('6616')) {
          affectation = 'interets';
          res.interets += montant;
        } else if (racine3 === '681') {
          affectation = 'amortissements';
          res.amortissements += montant;
        } else if (racine3 === '695' || racine3 === '697' || racine3 === '699') {
          affectation = 'impot';
          if (montant !== 0) res.alertes.push(`Compte ${compte} (impôt sur les bénéfices) ignoré : sans objet en LMNP à l'IR.`);
        } else if (classe === '6' && compte[1] === '7') {
          affectation = 'exceptionnel';
          if (montant !== 0) res.alertes.push(`Charge exceptionnelle (compte ${compte}) : ${Math.round(montant)} € non reprise automatiquement — vérifiez sa déductibilité.`);
        } else {
          affectation = 'charges';
          res.charges += montant;
        }
      } else if (classe === '2' && (compte.startsWith('21') || compte.startsWith('23'))) {
        montant = debit - credit;
        affectation = 'immobilisations';
        if (montant > 0) res.immobilisations += montant;
      } else {
        continue; // classes 1, 4, 5 : sans effet sur le résultat
      }

      if (affectation) {
        const cle = racine3;
        const existant = res.detailComptes.get(cle) || { compte: cle, libelle: iLib >= 0 ? String(c[iLib] || '').trim() : '', montant: 0, affectation };
        existant.montant += montant;
        res.detailComptes.set(cle, existant);
      }
    }

    res.detailComptes = [...res.detailComptes.values()]
      .filter((d) => Math.abs(d.montant) >= 0.005)
      .sort((a, b) => a.compte.localeCompare(b.compte));
    for (const k of ['recettes', 'charges', 'interets', 'amortissements', 'immobilisations']) res[k] = Math.round(res[k] * 100) / 100;

    if (res.immobilisations > 0) {
      res.alertes.push(
        `Immobilisations acquises dans l'exercice : ${Math.round(res.immobilisations)} € (comptes 21x/23x) — vérifiez qu'elles figurent bien au plan d'amortissement (leur annuité est incluse dans les dotations 681).`
      );
    }
    if (res.amortissements > 0) {
      res.alertes.push(
        'Les dotations 681 remplaceront le calcul par composants du simulateur (champ « annuité connue »). Le plafonnement de l\'article 39 C reste appliqué automatiquement.'
      );
    }
    return res;
  }

  DFISC.fec = { analyser, estFEC };
})(typeof globalThis !== 'undefined' ? globalThis : this);
