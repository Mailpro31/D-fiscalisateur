# 🇫🇷 D-Fiscalisateur

**Simulateur de défiscalisation français** — revenus 2025, déclarés en 2026. Une application web
100 % locale (aucune donnée transmise, aucune dépendance) qui calcule votre **économie d'impôt**
en combinant tous les grands leviers de la législation française, et qui vous donne **les cases à
remplir sur la déclaration officielle avec les montants correspondants**.

## 🚀 Utilisation

Ouvrez simplement **`index.html`** dans un navigateur (double-clic suffit — tout fonctionne en
local, y compris depuis `file://`). Le bouton **« Charger un exemple complet »** (ou l'URL
`index.html#exemple`) pré-remplit une situation de démonstration.

Pour activer l'**analyse de documents scannés** (OCR local), installez une fois les
bibliothèques et servez la page en HTTP :

```bash
npm install                   # télécharge Tesseract.js + pdf.js et génère vendor/ (~10 Mo, non versionné)
python3 -m http.server 8000   # puis http://localhost:8000 (l'OCR nécessite http://, pas file://)

npm test                      # tests du moteur de calcul (69 assertions chiffrées)
npm run test:e2e              # tests navigateur (OCR réel + interface), Chromium requis
```

Sans `npm install`, tout le simulateur fonctionne normalement — seule la lecture de
scans/PDF est désactivée (le **collage de texte** reste disponible dans la section 📎).

## 📎 Analyse de documents de charges (scan, photo, PDF, texte)

Déposez vos **décomptes de charges de copropriété**, avis de taxe foncière, relevés d'intérêts
d'emprunt ou factures de travaux (JPG/PNG/PDF), ou collez leur texte. L'outil :

1. lit le document **entièrement en local** : OCR Tesseract.js en français, PDF via pdf.js
   (texte natif si présent, sinon rendu en image puis OCR) — aucune donnée n'est envoyée ;
2. **classe chaque ligne** selon le décret n° 87-713 et l'art. 31 CGI : charge **récupérable sur
   le locataire** (jamais déductible — TEOM, eau, chauffage collectif, entretien des communs,
   ascenseur, gardien à 75 %…) ou charge **déductible du propriétaire**, avec la **ligne 2044**
   correspondante (221, 222, 223, 224, 225, 226, 227, 229, 230, 250) ;
3. affiche la **répartition proposée** dans un tableau corrigeable (montant et classement
   modifiables ligne à ligne, lignes « TOTAL » ignorées pour éviter les doubles comptes,
   gardien réparti 75 % locataire / 25 % propriétaire, régularisation N-1 signalée en
   réintégration ligne 230, alerte construction/agrandissement non déductible) ;
4. **reporte les totaux dans le simulateur** en un clic (mode location nue → champs 2044 ;
   mode meublé LMNP → charges BIC, où tout ce que paie le propriétaire est déductible),
   avec option « locataire parti sans rembourser » (ligne 225) et **annulation** possible.

### 🏢 Assistant charges de copropriété dues au propriétaire (lignes 229/230)

Le classifieur reconnaît les documents de syndic : appels de fonds du **budget prévisionnel** et
appels pour **travaux votés** (→ provisions déductibles ligne 229), **cotisation au fonds de
travaux ALUR** (⚠ jamais déductible au versement), **quote-part récupérable** sur le locataire
et **quote-part propriétaire** de l'arrêté des comptes. Un assistant dédié applique ensuite le
mécanisme officiel de la 2044 :

- **ligne 229** = provisions et appels payés dans l'année − fonds de travaux ALUR ;
- **ligne 230** (réintégration, d'après l'arrêté des comptes N-1 approuvé en AG) = part
  récupérable sur le locataire + part non déductible + trop-versé restitué ;

puis reporte les deux montants dans le simulateur. Pièces à conserver : appels de fonds,
relevé individuel de régularisation, procès-verbal d'assemblée générale.

## 🧰 Leviers couverts

### Immobilier locatif
| Levier | Ce que fait l'outil |
|---|---|
| **Déficit foncier** (location nue au réel, 2044) | Distinction charges **récupérables sur le locataire** (jamais déductibles) / charges du **propriétaire** ; imputation sur le revenu global jusqu'à **10 700 €** (**21 400 €** rénovation énergétique des passoires, dépenses 2023-2025) ; part « intérêts d'emprunt » reportée uniquement sur les revenus fonciers (10 ans) ; comparaison automatique **micro-foncier (30 %) / réel** ; génération des lignes 211 à 250 de la 2044 et des cases 4BA/4BB/4BC/4BD/4BE |
| **LMNP — amortissements** (2042-C-PRO) | Amortissement **par composants** (gros œuvre 50 ans, façade 25, installations 20, agencements 15 — modifiables), terrain non amortissable, mobilier et travaux, frais d'acquisition au choix (charge ou amortis) ; **plafonnement art. 39 C** (l'amortissement ne crée jamais de déficit, l'excédent se reporte sans limite) ; déficit LMNP reportable 10 ans sur bénéfices meublés ; comparaison **micro-BIC / réel** avec les abattements 2025 (loi « Le Meur » : 50 %/77 700 € longue durée et tourisme classé, 30 %/15 000 € non classé) |
| **Pinel / Pinel+ / Denormandie** | Toutes les générations de taux (≤2022 : 12/18/21 %, 2023 : 10,5/15/17,5 %, 2024 : 9/12/14 %, Pinel+ et Denormandie : 12/18/21 %) ; base plafonnée 300 000 € et 5 500 €/m² ; calcul de l'annuité selon l'année d'engagement et la durée (6/9/12 ans, prorogations) |
| **Loc'Avantages** | Réduction de 15/20/35/40/65 % des loyers selon le niveau (Loc1/2/3) et l'intermédiation ; force le régime réel |
| **Malraux** | 22 % (PVAP) ou 30 % (PSMV) des travaux, plafond 400 000 €/4 ans, **hors plafonnement des niches** |
| **Monuments historiques** | Déduction des charges du revenu global **sans plafond** |
| **Girardin outre-mer** | Réduction « one-shot », comptée à 44 %/34 %/30 % (selon rétrocession) dans le plafonnement spécifique **18 000 €** |
| **Censi-Bouvard, Scellier…** | Reports d'engagements en cours |

### Épargne retraite et charges déductibles
- **PER** : plafond auto (10 % des revenus pro N-1, plancher 4 637 € / plafond 37 094 €) **ou** plafond
  réel de l'avis d'imposition (reliquats 3 ans), **mutualisation des plafonds du couple** (case 6QR),
  alerte en cas d'excédent non déductible ;
- pensions alimentaires (plafond enfant majeur 6 794 €), frais d'accueil > 75 ans, CSG déductible,
  rachat de trimestres.

### Réductions et crédits d'impôt
Dons 75 % « Coluche » (plafond 1 000 €) et 66 % (plafond 20 % du RNI, report signalé) · emploi à
domicile 50 % (plafonds 12/15/18/20 k€ + sous-plafonds jardinage/informatique/bricolage) · garde
d'enfants < 6 ans 50 % (3 500 €/enfant) · frais de scolarité (61/153/183 €) · EHPAD 25 % ·
prestation compensatoire 25 % · cotisations syndicales 66 % · IR-PME 18/25/30/50 % · FCPI 25 % ·
FIP 18/30 % · Sofica 30/36/48 % · DEFI forêt 25 % · bornes de recharge 75 % (max 500 €) ·
équipements personnes âgées/handicap 25 %.

### Mécanique fiscale complète
Barème progressif 0/11/30/41/45 % · quotient familial et son **plafonnement** (1 791 €/demi-part,
4 224 € parent isolé) · **décote** · réductions imputées dans la limite de l'impôt (part perdue
signalée) · **plafonnement global des niches 10 000 € / 18 000 €** (avec les bonnes exclusions :
dons, syndicats, scolarité, EHPAD, Malraux, MH…) · crédits remboursables · **prélèvements sociaux
17,2 %** sur les revenus du patrimoine (le déficit foncier et les amortissements les réduisent
aussi) · CEHR (3/4 %).

## 🎯 Plan d'optimisation pluriannuel (N+1, N+2, N+3)

À partir de la simulation de l'année N, l'outil génère des **propositions chiffrées pour les trois
années suivantes**, triées par priorité, avec le gain annuel estimé (à revenus constants, à votre
TMI, + 17,2 % quand le levier réduit des revenus du patrimoine) :

- **PER** : plafond restant et **versement optimal** (celui qui reste déduit dans votre tranche
  actuelle), mutualisation des plafonds du couple, alerte d'excédent, mise en garde à TMI ≤ 11 % ;
- **Déficit foncier** : étalement des travaux pour re-consommer les 10 700 €/an, stock de reports
  (10 ans) et économie future associée, deadline du plafond majoré 21 400 € (dépenses payées
  jusqu'à fin 2025), bascule micro ↔ réel quand elle devient favorable ;
- **LMNP** : réserve d'amortissements (années d'imposition zéro estimées), bascule micro → réel
  chiffrée, arbitrage revente vs amortissements (réintégration dans la plus-value depuis 2025) ;
- **Pinel/Denormandie** : **échéancier des 3 prochaines années** — passage en prorogation à taux
  réduit, fin d'engagement avec la perte annuelle et les options (proroger, basculer en meublé,
  vendre), alerte réduction non reportable ;
- **Plafonnement des niches** : investissements à décaler vers N+1 quand le plafond est dépassé
  (perte évitée chiffrée), ou capacité de défiscalisation restante par an ; suggestion Girardin
  pour les gros impôts (comptée à 44 % dans le plafond 18 000 €, avec mise en garde) ;
- **Divers** : étalement des réductions perdues, report automatique des dons (5 ans), lissage
  CEHR/quotient, avance de 60 % sur les crédits d'impôt en janvier.

## 💾 Confort d'utilisation

- **Sauvegarde automatique** de la saisie dans le navigateur (localStorage — restaurée à
  l'ouverture, effacée par « Tout remettre à zéro ») ;
- **Export / import du dossier** en fichier JSON (rien ne quitte votre machine) — pratique pour
  archiver chaque année ou partager avec votre conseil ;
- **Copie de la liste des cases** (formulaire / case / intitulé / montant) en un clic, prête à
  coller dans un tableur ou un e-mail.

## 📋 Ce que produit l'outil

1. **Économie d'impôt totale** (IR + prélèvements sociaux) : comparaison entre votre situation
   optimisée et la même situation **sans aucun levier fiscal** ;
2. **Impact de chaque levier** (recalcul complet sans ce seul levier — les effets croisés de
   tranche/décote/plafonds sont donc correctement capturés) ;
3. **Jauge du plafonnement des niches** avec alerte de reprise ;
4. **Tableau des cases de la déclaration** avec les montants, groupé par formulaire :
   **2042, 2042-C, 2042-C-PRO, 2042-RICI, 2042-IOM, 2044** — les numéros susceptibles de varier
   selon le millésime sont marqués « à vérifier » ;
5. **Guides pédagogiques intégrés** :
   - charges **récupérables sur le locataire** (décret n° 87-713 : TEOM, eau, chauffage collectif,
     gardien 75/40 %…) vs charges **déductibles du propriétaire** (taxe foncière hors TEOM, grosses
     réparations, intérêts, assurance PNO…), avec la ligne 2044 correspondante,
   - **pièces à fournir/conserver** (décompte de charges du syndic, avis de taxe foncière, relevés
     d'intérêts, factures de travaux, DPE avant/après…),
   - méthode et durées des **amortissements LMNP**,
   - ordre officiel du calcul de l'impôt.

## 🗂 Structure du code

```
index.html                    Interface (formulaire par sections + panneau résultats + guides)
css/styles.css
js/config/params.js           TOUS les paramètres fiscaux (barème, plafonds, taux) — millésime unique à mettre à jour
js/data/charges_locatives.js  Données pédagogiques (décret 87-713, pièces, amortissements)
js/engine/util.js
js/engine/bareme.js           Parts, barème, plafonnement QF, décote, TMI, CEHR
js/engine/foncier.js          Micro/réel, déficit foncier (10 700/21 400 €, part intérêts)
js/engine/lmnp.js             Micro-BIC/réel, amortissements par composants, art. 39 C
js/engine/per.js              Plafonds PER, mutualisation couple
js/engine/dispositifs.js      Toutes les réductions/crédits + leurs cases de déclaration
js/engine/plafonnement.js     Plafonnement global des niches (10 k€/18 k€, retenue Girardin)
js/engine/simulateur.js       Orchestration, scénario « sans leviers », impacts marginaux, cases
js/engine/classifieur.js      Classification des lignes de charges (décret 87-713 → lignes 2044)
js/ocr/analyseur.js           Analyse de documents : OCR local, PDF, tableau éditable, report
js/app.js                     Contrôleur d'interface
scripts/vendor.js             Copie Tesseract.js/pdf.js de node_modules vers vendor/ (post-install)
tests/run-tests.js            69 assertions chiffrées vérifiables à la main
tests/e2e.js                  Tests navigateur : OCR réel + parcours complet de l'interface
tests/ocr-smoke.html          Page de test OCR autonome
```

Le moteur de calcul est en JavaScript pur (pattern UMD : navigateur **et** Node), sans aucune
dépendance. Les seules dépendances (`tesseract.js`, `pdfjs-dist`, versions épinglées dans
`package.json`/`package-lock.json`) servent exclusivement à la lecture locale des documents
scannés ; elles sont copiées dans `vendor/` (non versionné) par `npm install`. Le PDF est ouvert
avec `isEvalSupported: false` (mitigation CVE-2024-4367).

## ⚠️ Limites et avertissements

- **Outil pédagogique** : il ne remplace ni impots.gouv.fr, ni le BOFiP, ni un professionnel
  (expert-comptable, avocat fiscaliste). Faites toujours valider une opération de défiscalisation.
- **Millésime** : barème et seuils = LF 2025 (revenus 2024), reconduits par hypothèse de « gel »
  (année blanche) annoncée au PLF 2026. Tout est centralisé dans `js/config/params.js`.
- **Numéros de cases** : certains changent chaque année (Pinel/Denormandie, Malraux, Sofica,
  bornes…) — ils sont marqués « à vérifier » ; repérez la ligne au libellé équivalent sur le
  formulaire du millésime.
- Non modélisés : prélèvement à la source (n'affecte pas l'impôt dû), demi-parts spéciales
  (invalidité, anciens combattants — utilisez « parts forcées »), RFR exact (approximé pour la
  CEHR), CDHR (imposition minimale 20 % des très hauts revenus, signalée), plus-values, option
  barème des revenus de capitaux mobiliers, prorata temporis de première année d'amortissement.
- Conditions d'éligibilité **non vérifiées** (zonage Pinel, plafonds de loyers/ressources,
  conventions Anah, DPE…) : l'outil calcule l'avantage si les conditions sont remplies.
- Depuis le 15/02/2025 (LF 2025), les **amortissements LMNP sont réintégrés dans la plus-value**
  de cession (hors résidences services) — l'outil vous le rappelle.
