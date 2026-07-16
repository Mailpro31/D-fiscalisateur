#!/usr/bin/env node
/* =========================================================================
 * Tests du moteur D-Fiscalisateur : node tests/run-tests.js
 * Valeurs attendues calculées à la main d'après le barème LF 2025
 * (revenus 2024, reconduit par hypothèse pour 2025).
 * ========================================================================= */
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

R('js/config/params.js');
R('js/engine/util.js');
R('js/engine/bareme.js');
R('js/engine/foncier.js');
R('js/engine/lmnp.js');
R('js/engine/per.js');
R('js/engine/dispositifs.js');
R('js/engine/plafonnement.js');
R('js/engine/simulateur.js');

const DFISC = globalThis.DFISC;
const P = DFISC.PARAMS;

let ok = 0, ko = 0;
function assertClose(actual, expected, tol, label) {
  if (Math.abs(actual - expected) <= tol) {
    ok++;
    console.log(`  ✔ ${label} : ${Math.round(actual * 100) / 100}`);
  } else {
    ko++;
    console.error(`  ✘ ${label} : attendu ${expected}, obtenu ${actual}`);
  }
}
function assertEqual(actual, expected, label) {
  if (actual === expected) {
    ok++;
    console.log(`  ✔ ${label} : ${actual}`);
  } else {
    ko++;
    console.error(`  ✘ ${label} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
  }
}

/* ---------------- 1. Barème / parts / décote / plafonnement QF ---------- */
console.log('\n■ Barème, parts, décote, plafonnement du quotient familial');
assertClose(DFISC.bareme.impotBrut(30000, 1, P), 2165.48, 0.5, 'IR brut célibataire RNI 30 000 €');
assertEqual(DFISC.bareme.calculParts({ situation: 'couple', enfants: 3 }), 4, 'Parts couple 3 enfants');
assertEqual(DFISC.bareme.calculParts({ situation: 'celibataire', enfants: 1, parentIsole: true }), 2, 'Parts parent isolé 1 enfant');
assertEqual(DFISC.bareme.calculParts({ situation: 'veuf', enfants: 1 }), 2.5, 'Parts veuf 1 enfant (quotient conjugal conservé)');

const irDecote = DFISC.bareme.calculIR(25133, { situation: 'celibataire', enfants: 0 }, P);
assertClose(irDecote.decote, 210.3, 1.5, 'Décote célibataire (IR brut ≈ 1 500 €)');
assertClose(irDecote.irApresDecote, 1289.7, 1.5, 'IR net de décote');

const irQF = DFISC.bareme.calculIR(90000, { situation: 'couple', enfants: 2 }, P);
assertEqual(irQF.plafonnementQFApplique, true, 'Plafonnement QF appliqué (couple 2 enfants, RNI 90 000 €)');
assertClose(irQF.irApresDecote, 9748.96, 1, 'IR plafonné = IR 2 parts − 2 × 1 791 €');

/* ---------------- 2. Déficit foncier ------------------------------------ */
console.log('\n■ Revenus fonciers — déficit foncier');
const fon1 = DFISC.foncier.calcFoncier(
  { actif: true, loyers: 10000, nbLocaux: 1, travaux: 15000, interets: 12000, regime: 'auto' },
  P
);
assertEqual(fon1.regime, 'reel', 'Régime réel choisi automatiquement (déficit)');
assertClose(fon1.deficitRG, 10700, 0.01, 'Déficit imputable sur le revenu global plafonné à 10 700 €');
assertClose(fon1.reportInterets, 2000, 0.01, 'Part intérêts (12 000 > 10 000 de loyers) reportée sur revenus fonciers');
assertClose(fon1.reportAutres, 4320, 0.01, 'Solde autres charges reporté (15 000 + 20 forfait − 10 700)');

const fon2 = DFISC.foncier.calcFoncier(
  { actif: true, loyers: 8000, nbLocaux: 1, travaux: 13000, travauxRenov: 12000, regime: 'reel' },
  P
);
assertClose(fon2.deficitRG, 17020, 0.01, 'Plafond rehaussé (rénovation énergétique) : tout le déficit imputable');
assertClose(fon2.plafondRGUtilise, 21400, 0.01, 'Plafond utilisé = 21 400 €');

const fonMicro = DFISC.foncier.calcFoncier({ actif: true, loyers: 9000, nbLocaux: 1, taxeFonciere: 500, regime: 'auto' }, P);
assertEqual(fonMicro.regime, 'micro', 'Micro-foncier choisi quand plus favorable');
assertClose(fonMicro.netImposable, 6300, 0.01, 'Micro-foncier : abattement 30 %');

/* ---------------- 3. LMNP — amortissements et art. 39 C ----------------- */
console.log('\n■ LMNP — amortissements par composants, art. 39 C');
const lmnpBase = {
  actif: true, type: 'longue', loyers: 12000, charges: 3000, interets: 2000,
  prixBien: 100000, partTerrainPct: 20, fraisAcquisition: 0, incorporerFrais: false,
  mobilier: 7000, dureeMobilier: 7, travaux: 0, dureeTravaux: 15, regime: 'auto',
};
const lm1 = DFISC.lmnp.calcLMNP(lmnpBase, P);
assertClose(lm1.amortissement.annuiteTotale, 4000, 0.5, 'Annuité totale (3 000 € bâti + 1 000 € mobilier)');
assertEqual(lm1.regime, 'reel', 'Réel choisi (3 000 € imposables vs 6 000 € au micro)');
assertClose(lm1.netImposable, 3000, 0.5, 'Bénéfice après amortissements');

const lm2 = DFISC.lmnp.calcLMNP({ ...lmnpBase, loyers: 6000 }, P);
assertClose(lm2.amortissementDeduit, 1000, 0.5, 'Art. 39 C : amortissement limité au résultat avant amortissement');
assertClose(lm2.reportAmortissements, 3000, 0.5, 'Excédent d\'amortissement reporté sans limite');
assertClose(lm2.netImposable, 0, 0.01, 'Résultat ramené à zéro (pas de déficit par amortissement)');

const lm3 = DFISC.lmnp.calcLMNP({ ...lmnpBase, loyers: 4000, charges: 5000 }, P);
assertClose(lm3.deficitBicReporte, 3000, 0.5, 'Déficit hors amortissements reportable 10 ans (LMNP uniquement)');
assertClose(lm3.netImposable, 0, 0.01, 'Déficit non imputé sur le revenu global');

/* ---------------- 4. PER ------------------------------------------------- */
console.log('\n■ PER — plafonds de déduction');
const per1 = DFISC.per.calcPER({ versements1: 10000, revenusProN1_1: 50000 }, false, P);
assertClose(per1.deduitTotal, 5000, 0.01, 'Déduction limitée à 10 % des revenus pro N-1');
assertClose(per1.excedent, 5000, 0.01, 'Excédent non déductible signalé');
const per2 = DFISC.per.calcPER(
  { versements1: 10000, versements2: 0, revenusProN1_1: 50000, revenusProN1_2: 30000, mutualisation: true },
  true, P
);
assertClose(per2.deduitTotal, 9637, 1, 'Mutualisation des plafonds du couple (5 000 + plancher 4 637)');

/* ---------------- 5. Pinel / Denormandie -------------------------------- */
console.log('\n■ Pinel / Denormandie — réduction annuelle');
const pin1 = DFISC.dispositifs.pinel(
  { actif: true, generation: 'pinel2024', base: 320000, dureeInitiale: 9, duree: 9, anneePremiere: 2024 },
  P, 2025
);
assertClose(pin1.montant, 4000, 2, 'Pinel classique 2024, 9 ans, année 2 : 1,333 % × 300 000 € (base plafonnée)');
const den1 = DFISC.dispositifs.pinel(
  { actif: true, generation: 'denormandie', base: 200000, dureeInitiale: 6, duree: 6, anneePremiere: 2025 },
  P, 2025
);
assertClose(den1.montant, 4000, 1, 'Denormandie 6 ans, année 1 : 2 % × 200 000 €');

/* ---------------- 6. Plafonnement global des niches ---------------------- */
console.log('\n■ Plafonnement global des niches (10 000 € / 18 000 €)');
const plaf1 = DFISC.plafonnement.appliquerPlafonnement(
  [
    { montant: 6000, montantEffectif: 6000, plafonnable: '10k' },
    { montant: 6000, montantEffectif: 6000, plafonnable: '10k' },
    { montant: 400, montantEffectif: 400, plafonnable: 'non' },
  ],
  P
);
assertClose(plaf1.reprise, 2000, 0.01, 'Reprise de l\'excédent au-delà de 10 000 € (dons hors plafond)');
const plaf2 = DFISC.plafonnement.appliquerPlafonnement(
  [
    { montant: 9000, montantEffectif: 9000, plafonnable: '10k' },
    { montant: 20000, montantEffectif: 20000, retenuePlafond: 8800, plafonnable: '18k' }, // Girardin retenu à 44 %
  ],
  P
);
assertClose(plaf2.reprise, 0, 0.01, 'Girardin compté à 44 % : 9 000 + 8 800 ≤ 18 000 → pas de reprise');

/* ---------------- 7. Scénario complet ------------------------------------ */
console.log('\n■ Simulateur complet — économie d\'impôt');
function etatVide() {
  return {
    foyer: { situation: 'celibataire', enfants: 0, enfantsAlternee: 0, parentIsole: false, partsForcees: 0 },
    revenus: { salaires1: 0, salaires2: 0, fraisReels1: 0, fraisReels2: 0, pensions1: 0, pensions2: 0, bicPro: 0, autres: 0, rcmPfu: 0, csgDeductible: 0 },
    foncier: { actif: false },
    lmnp: { actif: false },
    dispositifs: { pinel: { actif: false }, locavantages: { actif: false }, malraux: {}, mh: {}, girardin: {}, censi: 0, autresReports: 0 },
    per: { versements1: 0, versements2: 0, plafondAvis1: 0, plafondAvis2: 0, revenusProN1_1: 0, revenusProN1_2: 0, mutualisation: false },
    famille: { emploiDomicile: { depenses: 0, jardinage: 0, informatique: 0, bricolage: 0, majorations: 0 }, garde: { nbEnfants: 0, nbEnfantsAlternee: 0, depenses: 0 }, scolarite: { college: 0, lycee: 0, superieur: 0 }, ehpad: { montant1: 0, montant2: 0 }, prestationCompensatoire: 0 },
    charges: { nbEnfantsMajeurs: 0, pensionEnfantsMajeurs: 0, pensionsAutres: 0, nbAccueil: 0, accueilAge: 0, rachatTrimestres: 0 },
    dons: { urgence: 0, general: 0 },
    divers: { syndicats: 0, pme: { montant: 0, taux: 'classique' }, fonds: { fcpi: 0, fip: 0, fipCorse: 0, fipOM: 0 }, sofica: { montant: 0, taux: 0.48 }, foret: 0, bornes: { depense: 0, nb: 1 }, equipements: 0 },
  };
}

const etat = etatVide();
etat.revenus.salaires1 = 45000;
etat.per.versements1 = 4000;
etat.dons.general = 500;
etat.famille.emploiDomicile.depenses = 2000;
const res = DFISC.simulateur.run(etat);

assertClose(res.final.rni, 36500, 0.5, 'RNI = 45 000 − 10 % − 4 000 € de PER');
assertClose(res.final.irNet, 2785.48, 1, 'IR net = 4 115 − 330 (dons) − 1 000 (emploi domicile)');
assertClose(res.baseline.irNet, 5315.48, 1, 'IR baseline (sans aucun levier)');
assertClose(res.economieTotale, 2530, 1.5, 'Économie totale affichée');
assertEqual(res.impacts.length, 3, 'Trois leviers détectés (PER, dons, emploi à domicile)');

const codes = res.final.cases.map((c) => c.code);
assertEqual(codes.includes('6NS'), true, 'Case 6NS (PER) présente');
assertEqual(codes.includes('7UF'), true, 'Case 7UF (dons 66 %) présente');
assertEqual(codes.includes('7DB'), true, 'Case 7DB (emploi à domicile) présente');
assertEqual(codes.includes('1AJ'), true, 'Case 1AJ (salaires) présente');

const c7db = res.final.cases.find((c) => c.code === '7DB');
assertEqual(c7db.montant, 2000, 'Montant 7DB = dépenses déclarées');

/* Scénario immobilier complet : déficit foncier + LMNP + Pinel */
const etat2 = etatVide();
etat2.foyer.situation = 'couple';
etat2.foyer.enfants = 2;
etat2.revenus.salaires1 = 62000;
etat2.revenus.salaires2 = 48000;
etat2.foncier = { actif: true, loyers: 12000, nbLocaux: 1, assurance: 180, taxeFonciere: 1200, gestion: 720, copro: 900, regularisationCopro: 150, travaux: 9000, travauxRenov: 8000, chargesLocNonRecuperees: 0, autresCharges: 0, interets: 3800, deficitsAnterieurs: 0, regime: 'auto' };
etat2.lmnp = { actif: true, type: 'longue', loyers: 9600, charges: 1400, interets: 2100, prixBien: 180000, partTerrainPct: 15, fraisAcquisition: 14000, incorporerFrais: true, mobilier: 8000, dureeMobilier: 7, travaux: 12000, dureeTravaux: 15, composants: null, reportsAmortissements: 0, deficitsBicAnterieurs: 0, regime: 'auto' };
etat2.dispositifs.pinel = { actif: true, generation: 'pinel2024', base: 250000, dureeInitiale: 9, duree: 9, anneePremiere: 2024 };
etat2.per.versements1 = 6000;
etat2.per.revenusProN1_1 = 60000;
const res2 = DFISC.simulateur.run(etat2);

assertEqual(res2.final.foncier.regime, 'reel', 'Foncier au réel (déficit)');
assertEqual(res2.final.lmnp.regime, 'reel', 'LMNP au réel (amortissements)');
assertEqual(res2.final.lmnp.netImposable, 0, 'LMNP : base imposable effacée par les amortissements');
assertEqual(res2.economieTotale > 5000, true, `Économie immobilier+PER > 5 000 € (obtenu ${Math.round(res2.economieTotale)} €)`);
assertEqual(res2.final.cases.some((c) => c.form === '2044' && c.code === '250'), true, 'Ligne 250 (intérêts) de la 2044 présente');
assertEqual(res2.final.cases.some((c) => c.code === '4BC'), true, 'Case 4BC (déficit imputable revenu global) présente');

/* Plafonnement des niches en conditions réelles */
const etat3 = etatVide();
etat3.revenus.salaires1 = 300000;
etat3.divers.fonds.fcpi = 12000; // 3 000 € de réduction
etat3.famille.emploiDomicile.depenses = 12000; // 6 000 € de crédit
etat3.dispositifs.censi = 4000; // 4 000 € de réduction → total plafonnable 13 000 €
const res3 = DFISC.simulateur.run(etat3);
assertClose(res3.final.plafonnement.reprise, 3000, 1, 'Reprise de 3 000 € (13 000 € d\'avantages vs plafond 10 000 €)');

/* ---------------- Bilan --------------------------------------------------- */
console.log(`\n${ok} tests OK, ${ko} échec(s).`);
if (ko > 0) process.exit(1);
