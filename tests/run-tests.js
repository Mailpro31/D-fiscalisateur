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
R('js/engine/classifieur.js');
R('js/engine/conseiller.js');
R('js/engine/projection.js');
R('js/engine/fec.js');

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

/* ---------------- 8. Classifieur de documents de charges ------------------ */
console.log('\n■ Classifieur — répartition locataire/propriétaire (décret 87-713)');
const DECOMPTE = `DECOMPTE DE CHARGES 2025 - LOT 12
Entretien parties communes           312,45
Electricité parties communes          85,10
Eau froide des locataires            420,00
TEOM                                 240,00
Salaire gardien                    1 000,00
Honoraires syndic                    480,00
Assurance multirisque immeuble       210,50
Ravalement façade                  3 250,00
Provision pour charges 2025        1 200,00
TOTAL GENERAL                      7 198,05`;

const ana = DFISC.classifieur.analyserTexte(DECOMPTE, { mode: 'nue', source: 'decompte.pdf' });
const parCat = Object.fromEntries(ana.items.map((i) => [i.categorie, i]));
assertEqual(parCat.teom && parCat.teom.montant, 240, 'TEOM détectée (récupérable)');
assertEqual(parCat.nettoyage && parCat.nettoyage.montant, 312.45, 'Entretien parties communes → récupérable');
assertEqual(parCat.gardien && parCat.gardien.montant, 1000, 'Gardien détecté (mixte 75/25)');
assertEqual(parCat.travaux && parCat.travaux.montant, 3250, 'Ravalement → travaux ligne 224');
assertEqual(parCat.ignorer_total && Math.round(parCat.ignorer_total.montant), 7198, 'Ligne TOTAL ignorée (pas de double compte)');
assertEqual(ana.items.some((i) => i.categorie === 'inconnu'), false, 'Bruit « LOT 12 » écarté');

assertClose(ana.totaux.recuperable, 312.45 + 85.1 + 420 + 240 + 750, 0.01, 'Total récupérable locataire (gardien à 75 %)');
assertClose(ana.totaux.deductible, 250 + 480 + 210.5 + 3250 + 1200, 0.01, 'Total déductible propriétaire');
assertClose(ana.totaux.parChamp.travaux, 3250, 0.01, 'Champ simulateur « travaux »');
assertClose(ana.totaux.parChamp.copro, 1200, 0.01, 'Champ simulateur « provisions copro » (ligne 229)');
assertClose(ana.totaux.parLigne2044['223'], 210.5, 0.01, 'Ligne 223 (assurance)');

const anaMeuble = DFISC.classifieur.analyserTexte(DECOMPTE, { mode: 'meuble' });
assertClose(anaMeuble.totaux.deductible, 7198.05, 0.05, 'En meublé (BIC) : tout est déductible');
assertClose(anaMeuble.totaux.recuperable, 0, 0.01, 'En meublé : pas de part récupérable non déductible');

const AVIS_TF = `AVIS DE TAXE FONCIERE 2025
Taxe fonciere sur les proprietes baties : cotisation 1 450
Taxe d'enlevement des ordures menageres 260
Interets d'emprunt 2025 : 3 214,00
Assurance emprunteur 180,00`;
const anaTF = DFISC.classifieur.analyserTexte(AVIS_TF, { mode: 'nue' });
const catsTF = anaTF.items.map((i) => i.categorie);
assertEqual(catsTF.includes('taxe_fonciere'), true, 'Taxe foncière détectée (1 450 € — pas l\'année 2025)');
assertEqual(anaTF.items.find((i) => i.categorie === 'taxe_fonciere').montant, 1450, 'Montant TF = 1 450 €');
assertEqual(catsTF.includes('teom'), true, 'TEOM de l\'avis détectée (récupérable)');
assertEqual(anaTF.items.find((i) => i.categorie === 'interets').montant, 3214, 'Intérêts 3 214 € (année 2025 ignorée)');
assertClose(anaTF.totaux.parChamp.interets, 3214 + 180, 0.01, 'Assurance emprunteur cumulée avec les intérêts (ligne 250)');

const anaRegul = DFISC.classifieur.analyserTexte('Régularisation charges exercice 2024 : 350,00', { mode: 'nue' });
assertClose(anaRegul.totaux.reintegration || 0, 350, 0.01, 'Régularisation N-1 → réintégration ligne 230');
assertClose(anaRegul.totaux.deductible, 0, 0.01, 'Régularisation non comptée en déduction');

const montantTest = DFISC.classifieur.extraireMontant('Remplacement chaudière collective 12.480,00 EUR');
assertClose(montantTest.montant, 12480, 0.01, 'Format « 12.480,00 » (points de milliers) parsé');

/* ---------------- 9. Copropriété : charges dues au propriétaire ----------- */
console.log('\n■ Copropriété — appels de fonds, fonds ALUR, lignes 229/230');
const APPELS = `RELEVE APPELS DE FONDS 2025 - SYNDIC IMMO+
Appel de fonds budget previsionnel T1    600,00
Appel de fonds pour travaux ravalement votés AG  1 200,00
Cotisation fonds de travaux ALUR          75,00
Quote-part charges récupérables          850,00
Quote-part propriétaire non récupérable  320,00`;
const anaCopro = DFISC.classifieur.analyserTexte(APPELS, { mode: 'nue' });
const catCopro = Object.fromEntries(anaCopro.items.map((i) => [i.categorie, i.montant]));
assertEqual(catCopro.provisions_copro, 600, 'Appel budget prévisionnel → provisions (ligne 229)');
assertEqual(catCopro.appel_travaux, 1200, 'Appel travaux votés → ligne 229 (pas 224)');
assertEqual(catCopro.fonds_alur, 75, 'Fonds de travaux ALUR détecté (non déductible au versement)');
assertEqual(catCopro.copro_recuperable, 850, 'Quote-part récupérable → locataire');
assertEqual(catCopro.copro_non_recuperable, 320, 'Quote-part propriétaire → à traiter via ligne 230');
assertClose(anaCopro.totaux.parChamp.copro, 1800, 0.01, 'Champ « provisions copro » = 600 + 1 200');
assertClose(anaCopro.totaux.recuperable, 850, 0.01, 'Récupérable = quote-part locative');

const copro = DFISC.classifieur.calculerCopro({
  provisionsPayees: 2400, dontFondsAlur: 300,
  regulRecuperable: 850, regulNonDeductible: 120, regulTropPercu: 60,
});
assertClose(copro.ligne229, 2100, 0.01, 'Ligne 229 = provisions 2 400 − fonds ALUR 300');
assertClose(copro.ligne230, 1030, 0.01, 'Ligne 230 = 850 récupérable + 120 non déductible + 60 trop-versé');
assertEqual(copro.alertes.length >= 2, true, 'Alertes ALUR + arrêté des comptes présentes');
const coproVide = DFISC.classifieur.calculerCopro({ provisionsPayees: 1000 });
assertClose(coproVide.ligne229, 1000, 0.01, 'Sans fonds ALUR : tout déductible ligne 229');
assertEqual(coproVide.alertes.some((a) => /230/.test(a)), true, 'Rappel de la réintégration N+1 (ligne 230)');

/* ---------------- 10. Conseiller pluriannuel (N+1, N+2, N+3) -------------- */
console.log('\n■ Conseiller — propositions d\'optimisation pluriannuelles');

// PER : marge inutilisée à TMI 30 %
const etatPER = etatVide();
etatPER.revenus.salaires1 = 90000;
etatPER.per.revenusProN1_1 = 80000;
const runPER = DFISC.simulateur.run(etatPER);
const consPER = DFISC.conseiller.generer(runPER, etatPER, P);
const cPER = consPER.conseils.find((c) => c.categorie === 'PER' && c.horizon === 0);
assertEqual(!!cPER, true, 'Conseil PER émis quand le plafond est inutilisé à TMI 30 %');
assertClose(cPER.gain, 2400, 1, 'Gain PER = 8 000 € (10 % de 80 000) × 30 %');

// Niches : reprise → décaler vers N+1
const etatNiches = etatVide();
etatNiches.revenus.salaires1 = 300000;
etatNiches.divers.fonds.fcpi = 12000;
etatNiches.famille.emploiDomicile.depenses = 12000;
etatNiches.dispositifs.censi = 4000;
const runNiches = DFISC.simulateur.run(etatNiches);
const consNiches = DFISC.conseiller.generer(runNiches, etatNiches, P);
const cNiches = consNiches.conseils.find((c) => c.categorie === 'Niches' && c.horizon === 1);
assertEqual(!!cNiches, true, 'Conseil « décaler vers N+1 » émis quand le plafonnement est dépassé');
assertClose(cNiches.gain, 3000, 1.5, 'Gain = avantages repris (3 000 €)');

// Pinel : fin d'engagement détectée dans les 3 ans
const etatPinel = etatVide();
etatPinel.revenus.salaires1 = 60000;
etatPinel.dispositifs.pinel = { actif: true, generation: 'pinel2022', base: 200000, dureeInitiale: 6, duree: 6, anneePremiere: 2021 };
const runPinel = DFISC.simulateur.run(etatPinel);
const consPinel = DFISC.conseiller.generer(runPinel, etatPinel, P);
const cPinel = consPinel.conseils.find((c) => c.categorie === 'Pinel');
assertEqual(!!cPinel, true, 'Échéance Pinel détectée');
assertEqual(cPinel.horizon, 2, 'Fin d\'engagement Pinel 2021+6 ans → alerte pour N+2 (2027)');
assertEqual(/fin de votre réduction/i.test(cPinel.titre), true, 'Titre : fin de la réduction annoncée');

// LMNP : micro forcé alors que le réel serait meilleur → conseil de bascule
const etatLM = etatVide();
etatLM.revenus.salaires1 = 90000;
etatLM.lmnp = { actif: true, type: 'longue', loyers: 20000, charges: 2000, interets: 0, prixBien: 300000, partTerrainPct: 15, fraisAcquisition: 0, incorporerFrais: true, mobilier: 10000, dureeMobilier: 7, travaux: 0, dureeTravaux: 15, composants: null, reportsAmortissements: 0, deficitsBicAnterieurs: 0, regime: 'micro' };
const runLM = DFISC.simulateur.run(etatLM);
const consLM = DFISC.conseiller.generer(runLM, etatLM, P);
const cLM = consLM.conseils.find((c) => c.categorie === 'LMNP' && /réel/i.test(c.titre));
assertEqual(!!cLM, true, 'Conseil « passez au réel LMNP » émis');
// micro 10 000 − réel 7 009 = 2 991 € de base en moins × (TMI 41 % + PS 17,2 %)
assertClose(cLM.gain, 2991 * (0.41 + 0.172), 5, 'Gain bascule réel = écart de base × (TMI + 17,2 %)');

// Rénovation énergétique : date limite fin 2025 signalée
const etatRenov = etatVide();
etatRenov.revenus.salaires1 = 60000;
etatRenov.foncier = { actif: true, loyers: 9000, nbLocaux: 1, travaux: 2000, travauxRenov: 9000, interets: 0, regime: 'reel' };
const runRenov = DFISC.simulateur.run(etatRenov);
const consRenov = DFISC.conseiller.generer(runRenov, etatRenov, P);
assertEqual(consRenov.conseils.some((c) => /21 400|fin 2025|31\/12\/2025/.test(c.titre + c.detail)), true, 'Alerte deadline rénovation énergétique (dépenses payées fin 2025)');

/* ---------------- 11. Projection sur 10 ans -------------------------------- */
console.log('\n■ Projection pluriannuelle — reports enchaînés et calendrier Pinel');

// Déficit foncier : le report créé en année 0 se consomme en année 1
const etatProj = etatVide();
etatProj.revenus.salaires1 = 60000;
etatProj.foncier = { actif: true, loyers: 10000, nbLocaux: 1, travaux: 30000, interets: 0, regime: 'reel', deficitsAnterieurs: 0 };
const proj1 = DFISC.projection.projeter(etatProj, { annees: 3, croissanceRevenus: 0, croissanceLoyers: 0 }, P);
assertEqual(proj1.lignes.length, 3, 'Projection : 3 lignes demandées');
assertClose(proj1.lignes[0].reportsFoncierRestants, 9320, 1, 'Année N : report foncier créé (30 020 − 10 000 − 10 700)');
assertEqual(proj1.lignes[1].reportsFoncierRestants, 0, 'Année N+1 : report entièrement consommé par le bénéfice foncier');
assertEqual(proj1.lignes[1].evenements.some((e) => /consommés/.test(e)), true, 'Événement « reports consommés » émis');
assertEqual(proj1.lignes[2].total > proj1.lignes[1].total, true, 'Année N+2 : impôt remonte (plus de reports, loyers pleinement imposés)');

// Calendrier Pinel : fin d'engagement visible dans la projection
const etatProjPinel = etatVide();
etatProjPinel.revenus.salaires1 = 60000;
etatProjPinel.dispositifs.pinel = { actif: true, generation: 'pinel2022', base: 200000, dureeInitiale: 6, duree: 6, anneePremiere: 2021 };
const proj2 = DFISC.projection.projeter(etatProjPinel, { annees: 4, croissanceRevenus: 0, croissanceLoyers: 0 }, P);
assertClose(proj2.lignes[0].pinel, 4000, 1, 'Année N (rang 5/6) : réduction Pinel 4 000 €');
assertClose(proj2.lignes[1].pinel, 4000, 1, 'Année N+1 (rang 6/6) : dernière annuité');
assertEqual(proj2.lignes[2].pinel, 0, 'Année N+2 : plus de réduction');
assertEqual(proj2.lignes[2].evenements.some((e) => /Fin de la réduction/.test(e)), true, 'Événement « fin Pinel » émis');
assertEqual(proj2.lignes[2].total - proj2.lignes[1].total >= 3999, true, 'L\'impôt augmente du montant de la réduction perdue');

// Croissance des revenus appliquée
const proj3 = DFISC.projection.projeter(etatProj, { annees: 2, croissanceRevenus: 10, croissanceLoyers: 0 }, P);
assertEqual(proj3.lignes[1].rni > proj3.lignes[0].rni, true, 'Croissance des revenus répercutée sur le RNI');

/* ---------------- 12. Import FEC (LMNP au réel) ---------------------------- */
console.log('\n■ FEC — reconstitution du résultat LMNP');
const FEC = [
  'JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise',
  'VE\tVentes\t1\t20250131\t706000\tLoyers meublés\t\t\tF1\t20250131\tLoyer janvier\t0,00\t1040,00\t\t\t20250131\t\t',
  'VE\tVentes\t2\t20250228\t706000\tLoyers meublés\t\t\tF2\t20250228\tLoyer février\t0,00\t11440,00\t\t\t20250228\t\t',
  'AC\tAchats\t3\t20250310\t615200\tEntretien immeuble\t\t\tF3\t20250310\tPlomberie\t800,00\t0,00\t\t\t20250310\t\t',
  'AC\tAchats\t4\t20250315\t606300\tFournitures\t\t\tF4\t20250315\tPetit équipement\t300,00\t0,00\t\t\t20250315\t\t',
  'BQ\tBanque\t5\t20250401\t661100\tIntérêts des emprunts\t\t\tE1\t20250401\tÉchéance prêt\t2100,50\t0,00\t\t\t20250401\t\t',
  'OD\tOD\t6\t20251231\t681100\tDotations amortissements\t\t\tOD1\t20251231\tDotation 2025\t7500,00\t0,00\t\t\t20251231\t\t',
  'OD\tOD\t7\t20251231\t775000\tProduits cessions\t\t\tOD2\t20251231\tCession\t0,00\t500,00\t\t\t20251231\t\t',
  'AC\tAchats\t8\t20250620\t218300\tMatériel informatique\t\t\tF5\t20250620\tOrdinateur\t2000,00\t0,00\t\t\t20250620\t\t',
  'BQ\tBanque\t9\t20250401\t512000\tBanque\t\t\tE1\t20250401\tMouvement\t0,00\t2100,50\t\t\t20250401\t\t',
].join('\n');
assertEqual(DFISC.fec.estFEC(FEC), true, 'FEC reconnu par ses en-têtes');
const fec = DFISC.fec.analyser(FEC);
assertEqual(fec.ok, true, 'Analyse FEC réussie');
assertEqual(fec.exercice, '2025', 'Exercice détecté');
assertClose(fec.recettes, 12480, 0.01, 'Recettes classe 70 (produits exceptionnels exclus)');
assertClose(fec.charges, 1100, 0.01, 'Charges classe 6 (hors 661/681)');
assertClose(fec.interets, 2100.5, 0.01, 'Intérêts 661');
assertClose(fec.amortissements, 7500, 0.01, 'Dotations 681');
assertClose(fec.immobilisations, 2000, 0.01, 'Immobilisations 21x signalées');
assertEqual(fec.alertes.length >= 2, true, 'Alertes (produit exceptionnel + immobilisations) émises');

// Variante Montant/Sens
const FEC2 = 'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|Montant|Sens\n' +
  'VE|Ventes|1|20250131|706000|Loyers|5000,00|C\nAC|Achats|2|20250210|615000|Entretien|400,00|D';
const fec2 = DFISC.fec.analyser(FEC2);
assertClose(fec2.recettes, 5000, 0.01, 'Variante Montant/Sens : recettes');
assertClose(fec2.charges, 400, 0.01, 'Variante Montant/Sens : charges');

// L'annuité « connue » remplace le calcul par composants et subit l'art. 39 C
const lmFEC = DFISC.lmnp.calcLMNP(
  { actif: true, type: 'longue', loyers: 12480, charges: 1100, interets: 2100.5, amortissementConnu: 7500, prixBien: 0, incorporerFrais: true, regime: 'reel' },
  P
);
assertClose(lmFEC.amortissement.annuiteTotale, 7500, 0.01, 'Annuité connue utilisée telle quelle');
assertClose(lmFEC.netImposable, 12480 - 1100 - 2100.5 - 7500, 1, 'Bénéfice LMNP reconstitué depuis le FEC');

/* ---------------- Bilan --------------------------------------------------- */
console.log(`\n${ok} tests OK, ${ko} échec(s).`);
if (ko > 0) process.exit(1);
