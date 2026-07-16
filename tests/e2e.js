#!/usr/bin/env node
/* =========================================================================
 * Tests de bout en bout (navigateur réel via playwright-core) :
 *   1. OCR local : canvas → Tesseract (vendor/) → classifieur.
 *   2. UI complète : collage de texte → analyse → report dans le simulateur
 *      → recalcul de l'économie d'impôt → annulation du report.
 *
 * Prérequis : `npm install` (vendor/ + playwright-core) et un Chromium local
 * (chemin auto-détecté, surchargez avec CHROMIUM_PATH=/chemin/vers/chrome).
 * Lancement : node tests/e2e.js
 * ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const RACINE = path.join(__dirname, '..');
const PORT = 8746;

function chercherChromium() {
  const candidats = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const c of candidats) {
    try { if (fs.statSync(c).isFile()) return c; } catch (e) { /* suivant */ }
  }
  throw new Error('Chromium introuvable — définissez CHROMIUM_PATH.');
}

/* Mini serveur statique (aucune dépendance) */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.png': 'image/png' };
function servirStatique() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let fichier = path.join(RACINE, url === '/' ? 'index.html' : url);
    if (!fichier.startsWith(RACINE)) { res.writeHead(403); return res.end(); }
    fs.readFile(fichier, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fichier)] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(PORT, '127.0.0.1');
}

let ok = 0, ko = 0;
const assert = (cond, label, detail) => {
  if (cond) { ok++; console.log(`  ✔ ${label}`); }
  else { ko++; console.error(`  ✘ ${label}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  const serveur = servirStatique();
  const navigateur = await chromium.launch({ executablePath: chercherChromium(), args: ['--no-sandbox'] });
  const page = await navigateur.newPage();
  page.on('pageerror', (e) => console.error('  [erreur page]', e.message));

  try {
    /* ---------- 1. OCR de bout en bout ---------- */
    console.log('\n■ E2E — OCR local (canvas → Tesseract → classifieur)');
    const vendorOk = fs.existsSync(path.join(RACINE, 'vendor/tesseract/tesseract.min.js'));
    if (!vendorOk) {
      console.log('  (vendor/ absent : lancez `npm install` — test OCR sauté)');
    } else {
      await page.goto(`http://127.0.0.1:${PORT}/tests/ocr-smoke.html`);
      await page.waitForFunction(() => document.getElementById('out').textContent.includes('"statut"'), null, { timeout: 120000 });
      const resultat = JSON.parse(await page.locator('#out').textContent());
      assert(resultat.statut === 'OK', 'OCR exécuté sans erreur', resultat.message);
      const cats = (resultat.categories || []).join(' ');
      assert(/teom:240/.test(cats), 'TEOM 240,00 reconnue et classée récupérable', cats);
      assert(/travaux:3250/.test(cats), 'Ravalement 3 250,00 reconnu et classé travaux (ligne 224)', cats);
      assert(/gestion:480/.test(cats), 'Honoraires syndic 480,00 → frais de gestion (ligne 221)', cats);
      assert(resultat.totaux && Math.abs(resultat.totaux.deductible - 3730) < 1, 'Total déductible = 3 730 €', JSON.stringify(resultat.totaux));
    }

    /* ---------- 2. UI : analyse de texte collé + report ---------- */
    console.log('\n■ E2E — interface : analyse d\'un décompte collé et report');
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.fill('#rev_salaires1', '50000');
    await page.click('#section-analyse summary');
    await page.fill('#ana_texte', [
      'Entretien parties communes      312,45',
      'TEOM                            240,00',
      'Salaire gardien               1 000,00',
      'Honoraires syndic               480,00',
      'Ravalement façade             3 250,00',
      'Intérêts d\'emprunt            1 200,00',
      'TOTAL                         6 482,45',
    ].join('\n'));
    await page.click('#ana_btn_analyser');
    await page.waitForSelector('#ana_resultats', { state: 'visible' });

    const synthese = await page.locator('#ana_synthese').textContent();
    assert(/récupérables/i.test(synthese), 'Synthèse : part récupérable locataire affichée');
    const lignesTable = await page.locator('#ana_table tbody tr').count();
    assert(lignesTable === 7, '7 lignes détectées dans le tableau', String(lignesTable));

    await page.click('#ana_btn_reporter');
    const travaux = await page.inputValue('#fon_travaux');
    const interets = await page.inputValue('#fon_interets');
    const gestion = await page.inputValue('#fon_gestion');
    assert(parseFloat(travaux) === 3250, 'Champ travaux (224) rempli : 3 250 €', travaux);
    assert(parseFloat(interets) === 1200, 'Champ intérêts (250) rempli : 1 200 €', interets);
    assert(parseFloat(gestion) === 730, 'Champ gestion (221) : syndic 480 + gardien 25 % = 730 €', gestion);
    assert(await page.isChecked('#fon_actif'), 'Section location nue activée automatiquement');

    await page.waitForFunction(() => {
      const t = document.getElementById('res_economie').textContent;
      return t && !/^0/.test(t.trim());
    }, null, { timeout: 5000 });
    const economie = await page.locator('#res_economie').textContent();
    assert(/[1-9]/.test(economie), `Économie d'impôt recalculée : ${economie.trim()}`);

    await page.click('#ana_btn_annuler');
    assert((await page.inputValue('#fon_travaux')) === '', 'Annulation du report : champ travaux restauré');

    /* ---------- 2 bis. Assistant copropriété (lignes 229/230) ---------- */
    console.log('\n■ E2E — assistant charges de copropriété');
    await page.fill('#cop_provisions', '2400');
    await page.fill('#cop_alur', '300');
    await page.fill('#cop_regul_recup', '850');
    await page.fill('#cop_regul_nondeduc', '120');
    const resCopro = await page.locator('#cop_resultat').textContent();
    assert(/2\s*100/.test(resCopro), 'Ligne 229 affichée : 2 100 € (2 400 − 300 ALUR)', resCopro);
    assert(/970/.test(resCopro), 'Ligne 230 affichée : 970 € (850 + 120)', resCopro);
    await page.click('#cop_btn_reporter');
    assert(parseFloat(await page.inputValue('#fon_copro')) === 2100, 'Champ provisions copro (229) rempli : 2 100 €');
    assert(parseFloat(await page.inputValue('#fon_regul')) === 970, 'Champ régularisation (230) rempli : 970 €');

    /* ---------- 3. Non-régression : exemple complet + plan pluriannuel ---------- */
    console.log('\n■ E2E — exemple complet (#exemple) et plan d\'optimisation');
    // Nouvelle page : un simple changement de hash ne recharge pas le document.
    const page2 = await navigateur.newPage();
    await page2.goto(`http://127.0.0.1:${PORT}/index.html#exemple`);
    await page2.waitForFunction(() => !/^0/.test(document.getElementById('res_economie').textContent.trim()));
    const ecoExemple = await page2.locator('#res_economie').textContent();
    const nbCases = await page2.locator('#res_cases tbody tr:not(.groupe)').count();
    const nbConseils = await page2.locator('#res_conseils .conseil').count();
    const texteConseils = await page2.locator('#res_conseils').textContent();
    assert(nbConseils >= 3, `Plan pluriannuel : ${nbConseils} propositions générées`);
    // L'exemple est en rang 2/9 du Pinel à taux constant : aucune échéance à signaler,
    // mais la deadline rénovation énergétique et les amortissements doivent apparaître.
    assert(/énergétique|21 400/.test(texteConseils), 'Plan : deadline rénovation énergétique (fin 2025) mentionnée');
    assert(/amortissements/i.test(texteConseils), 'Plan : réserve d\'amortissements LMNP mentionnée');
    assert(/PER/i.test(texteConseils), 'Plan : PER mentionné (alerte TMI 11 %)');
    await page2.close();

    /* ---------- 4. Sauvegarde automatique (localStorage) ---------- */
    console.log('\n■ E2E — sauvegarde automatique et restauration');
    const page3 = await navigateur.newPage();
    await page3.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page3.evaluate(() => localStorage.clear());
    await page3.fill('#rev_salaires1', '43210');
    await page3.waitForTimeout(500); // debounce + sauvegarde
    await page3.reload();
    assert((await page3.inputValue('#rev_salaires1')) === '43210', 'Saisie restaurée après rechargement de la page');
    await page3.click('#btn-reset');
    await page3.reload();
    assert((await page3.inputValue('#rev_salaires1')) === '', '« Tout remettre à zéro » efface aussi la sauvegarde');
    await page3.close();
    assert(/[1-9]/.test(ecoExemple), `Exemple : économie affichée (${ecoExemple.trim()})`);
    assert(nbCases >= 20, `Exemple : ${nbCases} lignes de cases générées`);
  } finally {
    await navigateur.close();
    serveur.close();
  }

  console.log(`\n${ok} tests e2e OK, ${ko} échec(s).`);
  process.exit(ko > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
