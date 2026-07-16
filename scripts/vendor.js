#!/usr/bin/env node
/* =========================================================================
 * Copie dans vendor/ les fichiers nécessaires à l'analyse de documents
 * (OCR Tesseract.js + lecture PDF) depuis node_modules, après `npm install`.
 *
 * vendor/ n'est PAS versionné : il est régénéré par `npm install`
 * (ou `npm run vendor`). Sans ces fichiers, le simulateur fonctionne
 * normalement — seule l'analyse de documents scannés est désactivée
 * (le collage de texte reste disponible).
 * ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const nm = path.join(racine, 'node_modules');

const FICHIERS = [
  // [source relative à node_modules, destination relative à vendor/]
  ['tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/tesseract-core-lstm.wasm.js'],
  ['pdfjs-dist/legacy/build/pdf.min.js', 'pdfjs/pdf.min.js'],
  ['pdfjs-dist/legacy/build/pdf.worker.min.js', 'pdfjs/pdf.worker.min.js'],
];

let ok = 0;
for (const [src, dst] of FICHIERS) {
  const from = path.join(nm, src);
  const to = path.join(racine, 'vendor', dst);
  if (!fs.existsSync(from)) {
    console.warn(`vendor: introuvable ${src} — lancez d'abord \`npm install\`.`);
    continue;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  ok++;
}

/* Données de langue française pour Tesseract : téléchargées par tesseract.js
 * à la volée par défaut. Pour un usage 100 % hors-ligne, on les prend depuis
 * le cache npm si le paquet optionnel est présent, sinon on laisse tesseract.js
 * utiliser son langPath par défaut (CDN) et on le signale. */
const fraCandidats = [
  '@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz',
  '@tesseract.js-data/fra/4.0.0/fra.traineddata.gz',
];
let fraOk = false;
for (const c of fraCandidats) {
  const from = path.join(nm, c);
  if (fs.existsSync(from)) {
    const to = path.join(racine, 'vendor', 'tesseract', 'lang', 'fra.traineddata.gz');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    fraOk = true;
    break;
  }
}
if (!fraOk) {
  console.warn(
    'vendor: données de langue française absentes (paquet @tesseract.js-data/fra non installé).\n' +
    '        `npm install @tesseract.js-data/fra` pour un OCR 100 % hors-ligne ;\n' +
    "        sinon Tesseract téléchargera fra.traineddata depuis son CDN au premier usage."
  );
}

console.log(`vendor: ${ok}/${FICHIERS.length} fichiers copiés${fraOk ? ' + fra.traineddata.gz' : ''} → vendor/`);
