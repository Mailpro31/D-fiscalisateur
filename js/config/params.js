/* =========================================================================
 * D-Fiscalisateur — Paramètres fiscaux
 * Millésime : revenus 2025, déclarés au printemps 2026.
 *
 * ⚠ AVERTISSEMENT : le PLF 2026 prévoyait un gel du barème ("année blanche").
 * Par prudence, les seuils ci-dessous reprennent les valeurs de la loi de
 * finances 2025 (revenus 2024). Vérifiez la loi de finances définitivement
 * adoptée et mettez à jour ce fichier si besoin : tous les calculs de
 * l'application lisent uniquement ces constantes.
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});

  DFISC.PARAMS = {
    MILLESIME: {
      revenus: 2025,
      declaration: 2026,
      note:
        "Barème et seuils : valeurs LF 2025 (revenus 2024), reconduites par hypothèse de gel " +
        "du barème (« année blanche ») annoncée au PLF 2026. À vérifier dans la LF 2026 définitive.",
    },

    /* ---------------- Barème progressif de l'IR (par part) ---------------- */
    BAREME: [
      { jusqua: 11497, taux: 0.0 },
      { jusqua: 29315, taux: 0.11 },
      { jusqua: 83823, taux: 0.3 },
      { jusqua: 180294, taux: 0.41 },
      { jusqua: Infinity, taux: 0.45 },
    ],

    /* ---------------- Décote (art. 197 I.4 CGI) ---------------- */
    DECOTE: {
      seuilCelibataire: 1964,
      seuilCouple: 3248,
      forfaitCelibataire: 889,
      forfaitCouple: 1470,
      taux: 0.4525,
    },

    /* ---------------- Quotient familial ---------------- */
    QF: {
      plafondDemiPart: 1791, // avantage max par demi-part supplémentaire
      plafondQuartPart: 895.5, // par quart de part (résidence alternée)
      plafondParentIsole: 4224, // part entière du 1er enfant (case T)
      plafondParentIsoleAlternee: 2112, // 2 premiers quarts de part (case T, alternée)
    },

    /* ---------------- Abattements sur salaires / pensions ---------------- */
    ABATTEMENT_SALAIRES: { taux: 0.1, min: 504, max: 14426 },
    ABATTEMENT_PENSIONS: { taux: 0.1, min: 450, max: 4399 },

    /* ---------------- Épargne retraite (PER, art. 163 quatervicies) ------- */
    PER: {
      // Plafond des versements 2025 : 10 % des revenus professionnels 2024
      // (nets de frais), borné par plancher/plafond ci-dessous.
      plancher: 4637, // 10 % du PASS 2024
      plafond: 37094, // 10 % de 8 × PASS 2024
      note:
        "Le plafond réellement disponible figure sur votre avis d'imposition " +
        "(il inclut les reliquats des 3 années précédentes). Saisissez-le en priorité.",
    },

    /* ---------------- Revenus fonciers ---------------- */
    FONCIER: {
      microPlafond: 15000,
      microAbattement: 0.3,
      deficitImputableRG: 10700, // art. 156 I.3° CGI
      deficitImputableRGRenov: 21400, // dépenses de rénovation énergétique (passoires, dépenses 2023-2025)
      forfaitGestionParLocal: 20, // ligne 222 de la 2044
      reportDeficitAnnees: 10,
    },

    /* ---------------- Location meublée (BIC) ---------------- */
    LMNP: {
      micro: {
        longue: { plafond: 77700, abattement: 0.5, libelle: 'Location meublée longue durée' },
        classe: { plafond: 77700, abattement: 0.5, libelle: 'Meublé de tourisme classé (régime revenus 2025, loi « Le Meur »)' },
        nonclasse: { plafond: 15000, abattement: 0.3, libelle: 'Meublé de tourisme NON classé' },
      },
      abattementMinimum: 305,
      // Ventilation par composants proposée par défaut (modifiable dans l'outil)
      composantsDefaut: [
        { cle: 'grosOeuvre', libelle: 'Gros œuvre (structure)', pct: 45, duree: 50 },
        { cle: 'facade', libelle: 'Façade / étanchéité', pct: 15, duree: 25 },
        { cle: 'igt', libelle: 'Installations générales et techniques (élec., plomberie, chauffage)', pct: 25, duree: 20 },
        { cle: 'agencements', libelle: 'Agencements intérieurs', pct: 15, duree: 15 },
      ],
      partTerrainDefaut: 15, // % du prix non amortissable
      dureeMobilierDefaut: 7,
      dureeTravauxDefaut: 15,
    },

    /* ---------------- Prélèvements sociaux ---------------- */
    PS: { taux: 0.172 },

    /* ---------------- Contribution exceptionnelle hauts revenus ----------- */
    CEHR: {
      // célibataire : 3 % de 250 k€ à 500 k€, 4 % au-delà ; couple : seuils doublés
      seuil1Celib: 250000,
      seuil2Celib: 500000,
      taux1: 0.03,
      taux2: 0.04,
    },

    /* ---------------- Plafonnement global des niches (art. 200-0 A) ------- */
    NICHES: {
      plafondBase: 10000,
      plafondMajore: 18000, // Sofica + investissements outre-mer
      girardinRetenue: { industriel_pd: 0.44, industriel_agrement: 0.34, social: 0.3 },
    },

    /* ---------------- Charges déductibles du revenu global ---------------- */
    PENSIONS: {
      plafondEnfantMajeur: 6794, // par enfant majeur, sans jugement (doublé si enfant marié/chargé de famille)
      accueilPersonneAgee: 3968, // frais d'accueil personne > 75 ans, par personne
    },

    /* ---------------- Réductions / crédits d'impôt ---------------- */
    DONS: {
      tauxUrgence: 0.75, // organismes d'aide aux personnes en difficulté (« Coluche »)
      plafondUrgence: 1000,
      tauxGeneral: 0.66,
      plafondPctRNI: 0.2, // 20 % du revenu net imposable, excédent reportable 5 ans
    },
    EMPLOI_DOMICILE: {
      // Crédit d'impôt 50 % (art. 199 sexdecies)
      taux: 0.5,
      plafondBase: 12000,
      majorationParPersonne: 1500, // par enfant à charge / membre > 65 ans
      plafondMajore: 15000,
      plafondPremiereAnnee: 15000, // (18 000 € avec majorations)
      plafondPremiereAnneeMajore: 18000,
      plafondInvalidite: 20000,
      sousPlafonds: { jardinage: 5000, informatique: 3000, bricolage: 500 },
    },
    GARDE_ENFANTS: {
      taux: 0.5,
      plafondParEnfant: 3500,
      plafondParEnfantAlternee: 1750,
    },
    SCOLARITE: { college: 61, lycee: 153, superieur: 183 },
    EHPAD: { taux: 0.25, plafondParPersonne: 10000 },
    SYNDICATS: { taux: 0.66, plafondPctSalaires: 0.01 },
    PME: {
      // IR-PME (art. 199 terdecies-0 A)
      plafondVersementCelib: 50000,
      plafondVersementCouple: 100000,
      taux: { classique: 0.18, esus: 0.25, jei: 0.3, jeir: 0.5 },
      note: 'Fraction excédant le plafond de versement reportable 4 ans.',
    },
    FIP_FCPI: {
      plafondCelib: 12000,
      plafondCouple: 24000,
      taux: { fcpi: 0.25, fip: 0.18, fipCorse: 0.3, fipOutreMer: 0.3 },
    },
    SOFICA: { plafond: 18000, plafondPctRNG: 0.25, taux: [0.3, 0.36, 0.48] },
    FORET: { taux: 0.25, plafondCelib: 6250, plafondCouple: 12500 },
    BORNES: { taux: 0.75, plafondParSysteme: 500 },
    EQUIPEMENTS_PA: { taux: 0.25, plafondCelib: 5000, plafondCouple: 10000 },
    PRESTATION_COMPENSATOIRE: { taux: 0.25, plafond: 30500 },

    /* ---------------- Dispositifs immobiliers ---------------- */
    PINEL: {
      plafondBase: 300000,
      plafondM2: 5500,
      // Taux annuels (%) : [rangs 1-6, rangs 7-9, rangs 10-12] pour engagement initial 6 ans ;
      // pour engagement initial 9 ans : [rangs 1-9, rangs 10-12].
      generations: {
        pinel2022: {
          libelle: 'Pinel ≤ 2022 (12/18/21 %)',
          init6: [2.0, 2.0, 1.0],
          init9: [2.0, 1.0],
        },
        pinel2023: {
          libelle: 'Pinel classique 2023 (10,5/15/17,5 %)',
          init6: [1.75, 1.5, 0.8333],
          init9: [1.6667, 0.8333],
        },
        pinel2024: {
          libelle: 'Pinel classique 2024 (9/12/14 %)',
          init6: [1.5, 1.0, 0.6667],
          init9: [1.3333, 0.6667],
        },
        pinelplus: {
          libelle: 'Pinel + (2023-2024, 12/18/21 %)',
          init6: [2.0, 2.0, 1.0],
          init9: [2.0, 1.0],
        },
        denormandie: {
          libelle: 'Denormandie ancien (12/18/21 %, jusqu\'à fin 2027)',
          init6: [2.0, 2.0, 1.0],
          init9: [2.0, 1.0],
        },
      },
    },
    LOC_AVANTAGES: {
      // Réduction en % des loyers bruts (art. 199 tricies)
      taux: {
        loc1: { direct: 0.15, intermediation: 0.2, libelle: 'Loc 1 (loyer -15 %)' },
        loc2: { direct: 0.35, intermediation: 0.4, libelle: 'Loc 2 (loyer -30 %)' },
        loc3: { direct: null, intermediation: 0.65, libelle: 'Loc 3 (loyer -45 %, intermédiation obligatoire)' },
      },
    },
    MALRAUX: { tauxPVAP: 0.22, tauxPSMV: 0.3, plafondTravaux: 400000, note: 'Plafond 400 000 € sur 4 ans. Hors plafonnement global des niches.' },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
