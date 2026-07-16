/* =========================================================================
 * Analyseur de documents de charges — couche navigateur.
 *
 * - Dépose de scans (JPG/PNG) ou de PDF, ou collage de texte.
 * - OCR 100 % LOCAL via Tesseract.js (fichiers vendor/ générés par
 *   `npm install`) ; PDF lus via pdf.js : texte natif si présent, sinon
 *   rendu en image puis OCR. Aucune donnée ne quitte le navigateur.
 * - Chaque ligne est classée par DFISC.classifieur (décret n° 87-713 /
 *   art. 31 CGI), corrigeable dans un tableau, puis les totaux sont
 *   reportés dans les champs du simulateur.
 *
 * Sans vendor/ (npm install non lancé) : le mode « texte collé » reste
 * entièrement fonctionnel ; seuls scans/PDF nécessitent les bibliothèques.
 * ========================================================================= */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const abs = (p) => new URL(p, document.baseURI).href;
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur = (v) => fmt.format(Math.round(v || 0));

  let items = []; // lignes analysées (éditables)
  let worker = null; // worker Tesseract réutilisé
  let sauvegardeReport = null; // pour « annuler le report »

  /* ---------------- chargement paresseux des bibliothèques ---------------- */
  const scriptsCharges = {};
  function chargerScript(src) {
    if (!scriptsCharges[src]) {
      scriptsCharges[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Impossible de charger ' + src));
        document.head.appendChild(s);
      });
    }
    return scriptsCharges[src];
  }

  async function obtenirWorkerOCR(onProgress) {
    await chargerScript('vendor/tesseract/tesseract.min.js');
    if (!worker) {
      statut('Initialisation de l\'OCR (première fois : chargement du moteur local ~4 Mo)…');
      worker = await Tesseract.createWorker('fra', 1, {
        workerPath: abs('vendor/tesseract/worker.min.js'),
        corePath: abs('vendor/tesseract'),
        langPath: abs('vendor/tesseract/lang'),
        gzip: true,
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
        },
      });
    }
    return worker;
  }

  /* ---------------- extraction du texte des fichiers ---------------- */
  async function texteDepuisImage(blob, majProgression) {
    const w = await obtenirWorkerOCR(majProgression);
    const { data } = await w.recognize(blob);
    return data.text || '';
  }

  async function texteDepuisPDF(file, majProgression) {
    await chargerScript('vendor/pdfjs/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = abs('vendor/pdfjs/pdf.worker.min.js');
    const buf = await file.arrayBuffer();
    // isEvalSupported:false — neutralise CVE-2024-4367 (exécution JS via police piégée)
    const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    let texte = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const contenu = await page.getTextContent();
      // Reconstruction ligne par ligne d'après la position verticale des items
      const lignes = new Map();
      for (const it of contenu.items) {
        const y = Math.round(it.transform[5]);
        const cle = [...lignes.keys()].find((k) => Math.abs(k - y) <= 2);
        const l = cle !== undefined ? lignes.get(cle) : [];
        l.push({ x: it.transform[4], str: it.str });
        lignes.set(cle !== undefined ? cle : y, l);
      }
      const pageTexte = [...lignes.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, frags]) => frags.sort((a, b) => a.x - b.x).map((f) => f.str).join(' '))
        .join('\n');
      texte += pageTexte + '\n';

      // Page sans texte natif (scan) → rendu en image puis OCR
      if (pageTexte.replace(/\s/g, '').length < 30) {
        statut(`Page ${p}/${pdf.numPages} scannée : OCR local en cours…`);
        const viewport = page.getViewport({ scale: 2.2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        texte += (await texteDepuisImage(blob, majProgression)) + '\n';
      }
    }
    return texte;
  }

  /* ---------------- pipeline d'analyse ---------------- */
  function modeCourant() {
    return $('ana_mode_meuble').checked ? 'meuble' : 'nue';
  }

  async function analyserFichiers(fileList) {
    const fichiers = [...fileList];
    if (!fichiers.length) return;
    const barre = $('ana_progress');
    barre.style.display = 'block';
    try {
      for (let i = 0; i < fichiers.length; i++) {
        const f = fichiers[i];
        statut(`Lecture de « ${f.name} » (${i + 1}/${fichiers.length})…`);
        const majProgression = (p) => {
          barre.firstElementChild.style.width = Math.round(p * 100) + '%';
        };
        let texte = '';
        try {
          if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
            texte = await texteDepuisPDF(f, majProgression);
          } else if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(f.name)) {
            statut(`OCR local de « ${f.name} »…`);
            texte = await texteDepuisImage(f, majProgression);
          } else {
            texte = await f.text(); // .txt, .csv…
            if (DFISC.fec && DFISC.fec.estFEC(texte)) {
              afficherFEC(DFISC.fec.analyser(texte), f.name);
              continue;
            }
          }
        } catch (e) {
          console.error(e);
          statut(
            `⚠ Impossible d'analyser « ${f.name} » : ${e.message}. ` +
              'Si les bibliothèques locales manquent, lancez « npm install » à la racine du projet ' +
              '(voir README) ou collez le texte du document ci-dessous.', true
          );
          continue;
        }
        ajouterItems(texte, f.name);
      }
      statut(items.length ? `Analyse terminée : ${items.length} ligne(s) détectée(s). Vérifiez/corrigez le classement ci-dessous.` : 'Aucune ligne exploitable détectée (essayez le collage de texte).');
    } finally {
      barre.style.display = 'none';
      barre.firstElementChild.style.width = '0%';
    }
  }

  function ajouterItems(texte, source) {
    const res = DFISC.classifieur.analyserTexte(texte, { mode: modeCourant(), source });
    items = items.concat(res.items);
    rendreTable();
  }

  /* ---------------- rendu du tableau éditable ---------------- */
  const CIBLE_CLASSE = { recuperable: 'cat-recuperable', deductible: 'cat-deductible', mixte: 'cat-deductible', attention: 'cat-attention', ignorer: 'cat-ignorer' };
  const echap = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function rendreTable() {
    const zone = $('ana_resultats');
    zone.style.display = items.length ? 'block' : 'none';
    const tbody = document.querySelector('#ana_table tbody');
    tbody.innerHTML = '';
    const cats = DFISC.classifieur.CATEGORIES.filter((c) => c.cible !== 'ignorer');
    items.forEach((it, idx) => {
      const cat = DFISC.classifieur.PAR_CLE[it.categorie];
      const tr = document.createElement('tr');
      tr.className = cat ? CIBLE_CLASSE[cat.cible] || '' : 'cat-attention';
      const options =
        `<option value="inconnu"${it.categorie === 'inconnu' ? ' selected' : ''}>❓ À classer manuellement</option>` +
        `<option value="ignorer_total"${it.categorie === 'ignorer_total' ? ' selected' : ''}>∅ Ignorer (total/doublon)</option>` +
        cats.map((c) => `<option value="${c.cle}"${it.categorie === c.cle ? ' selected' : ''}>${c.libelle}</option>`).join('');
      tr.innerHTML =
        `<td title="${echap((it.source || '') + (cat && cat.note ? ' — ' + cat.note : ''))}">${echap(it.libelle)}` +
        `${it.confiance === 'basse' ? ' <span class="badge-verif">à vérifier</span>' : ''}</td>` +
        `<td><input type="number" step="0.01" value="${it.montant}" data-idx="${idx}" data-role="montant" style="width:110px"></td>` +
        `<td><select data-idx="${idx}" data-role="categorie">${options}</select></td>`;
      tbody.appendChild(tr);
    });
    rendreSynthese();
    $('ana_btn_reporter').disabled = false;
  }

  function rendreSynthese() {
    const t = DFISC.classifieur.totaliser(items, modeCourant());
    const s = $('ana_synthese');
    const lignes2044 = Object.entries(t.parLigne2044)
      .sort()
      .map(([l, m]) => `<tr><td>Ligne <strong>${l}</strong> de la 2044</td><td class="montant">${eur(m)}</td></tr>`)
      .join('');
    s.innerHTML =
      `<table class="guide">` +
      `<tr><td>🔑 Charges <strong>récupérables sur le locataire</strong> — à NE PAS déduire</td><td class="montant">${eur(t.recuperable)}</td></tr>` +
      `<tr><td>🏠 Charges <strong>déductibles</strong> (propriétaire)${t.mode === 'meuble' ? ' — BIC meublé' : ''}</td><td class="montant">${eur(t.deductible)}</td></tr>` +
      (t.reintegration ? `<tr><td>↩ Régularisation à réintégrer (ligne 230)</td><td class="montant">${eur(t.reintegration)}</td></tr>` : '') +
      (t.aVerifier ? `<tr><td>⚠ Montants à vérifier / classer manuellement (${t.nbInconnus} ligne(s))</td><td class="montant">${eur(t.aVerifier)}</td></tr>` : '') +
      (t.mode === 'nue' ? lignes2044 : '') +
      `</table>`;
  }

  /* ---------------- report vers le simulateur ---------------- */
  const CHAMPS_NUE = {
    assurance: 'fon_assurance', taxeFonciere: 'fon_tf', gestion: 'fon_gestion',
    copro: 'fon_copro', regularisationCopro: 'fon_regul', travaux: 'fon_travaux',
    travauxRenov: 'fon_renov', chargesLocNonRecuperees: 'fon_chargesLoc',
    autresCharges: 'fon_autres', interets: 'fon_interets',
  };
  const CHAMPS_MEUBLE = { charges: 'lmnp_charges', interets: 'lmnp_interets', travaux: 'lmnp_travaux' };

  function reporter() {
    const mode = modeCourant();
    const t = DFISC.classifieur.totaliser(items, mode);
    const mapping = mode === 'meuble' ? CHAMPS_MEUBLE : CHAMPS_NUE;
    const aReporter = { ...t.parChamp };
    if (mode === 'nue' && $('ana_impayes').checked && t.recuperable > 0) {
      // Locataire parti sans rembourser : charges récupérables déductibles (ligne 225)
      aReporter.chargesLocNonRecuperees = (aReporter.chargesLocNonRecuperees || 0) + t.recuperable;
    }
    sauvegardeReport = {};
    let modifie = null;
    for (const [champ, montant] of Object.entries(aReporter)) {
      const id = mapping[champ];
      const el = id && $(id);
      if (!el || !montant) continue;
      sauvegardeReport[id] = el.value;
      el.value = Math.round(((parseFloat(el.value) || 0) + montant) * 100) / 100;
      modifie = el;
    }
    const coche = mode === 'meuble' ? $('lmnp_actif') : $('fon_actif');
    if (coche && !coche.checked) {
      sauvegardeReport[coche.id] = '';
      coche.checked = true;
    }
    if (modifie) {
      modifie.dispatchEvent(new Event('input', { bubbles: true })); // déclenche le recalcul
      statut(
        `Montants ajoutés aux champs de la section « ${mode === 'meuble' ? 'Location meublée' : 'Location nue'} » ` +
          `(${eur(t.deductible + (mode === 'nue' && $('ana_impayes').checked ? t.recuperable : 0))} déductibles). ` +
          `Les charges récupérables (${eur(t.recuperable)}) ne sont pas déduites${$('ana_impayes').checked ? ' — sauf option locataire parti (ligne 225)' : ''}.`
      );
      $('ana_btn_annuler').style.display = 'inline-block';
      $('ana_btn_reporter').disabled = true;
    } else {
      statut('Rien à reporter (aucun montant déductible).');
    }
  }

  function annulerReport() {
    if (!sauvegardeReport) return;
    let modifie = null;
    for (const [id, valeur] of Object.entries(sauvegardeReport)) {
      const el = $(id);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = valeur === true || valeur === 'true';
      else el.value = valeur;
      modifie = el;
    }
    if (modifie) modifie.dispatchEvent(new Event('input', { bubbles: true }));
    sauvegardeReport = null;
    $('ana_btn_annuler').style.display = 'none';
    $('ana_btn_reporter').disabled = false;
    statut('Report annulé : les champs du simulateur ont retrouvé leurs valeurs.');
  }

  /* ---------------- FEC comptable (LMNP au réel) ---------------- */
  let dernierFEC = null;

  function afficherFEC(fec, source) {
    const zone = $('fec_resultat');
    if (!fec.ok) {
      zone.style.display = 'none';
      return statut(`FEC « ${source} » : ${fec.erreur}`, true);
    }
    dernierFEC = fec;
    zone.style.display = 'block';
    const lg = (l, v) => `<tr><td>${l}</td><td class="montant">${eur(v)}</td></tr>`;
    const detail = fec.detailComptes
      .map((d) => `<tr><td style="color:var(--texte-2)">— compte ${d.compte}x ${echap(d.libelle)}</td><td class="montant" style="color:var(--texte-2)">${eur(d.montant)}</td></tr>`)
      .join('');
    $('fec_synthese').innerHTML =
      `<table class="guide">` +
      `<tr><td><strong>Exercice ${fec.exercice || '?'} — ${fec.nbEcritures} écritures (${echap(source)})</strong></td><td></td></tr>` +
      lg('Recettes (loyers charges comprises, classe 70)', fec.recettes) +
      lg('Charges déductibles (classe 6 hors intérêts/dotations)', fec.charges) +
      lg("Intérêts d'emprunt (661)", fec.interets) +
      lg('Dotations aux amortissements (681) → « annuité connue »', fec.amortissements) +
      (fec.immobilisations ? lg('Immobilisations acquises (info)', fec.immobilisations) : '') +
      detail +
      `</table>` +
      fec.alertes.map((a) => `<div class="alerte warn" style="margin-top:6px">${echap(a)}</div>`).join('');
    statut(`FEC analysé : résultat comptable reconstitué. Vérifiez puis reportez dans la section LMNP.`);
  }

  function reporterFEC() {
    if (!dernierFEC || !dernierFEC.ok) return;
    $('lmnp_actif').checked = true;
    $('lmnp_regime').value = 'reel';
    $('lmnp_loyers').value = dernierFEC.recettes;
    $('lmnp_charges').value = dernierFEC.charges;
    $('lmnp_interets').value = dernierFEC.interets;
    $('lmnp_amortConnu').value = dernierFEC.amortissements;
    $('lmnp_loyers').dispatchEvent(new Event('input', { bubbles: true }));
    statut(
      `LMNP mis à jour depuis le FEC : ${eur(dernierFEC.recettes)} de recettes, ${eur(dernierFEC.charges)} de charges, ` +
        `${eur(dernierFEC.interets)} d'intérêts, ${eur(dernierFEC.amortissements)} d'amortissements (plafonnés art. 39 C si besoin).`
    );
  }

  /* ---------------- divers UI ---------------- */
  function statut(txt, erreur) {
    const el = $('ana_status');
    el.textContent = txt;
    el.className = 'alerte ' + (erreur ? 'warn' : 'info');
    el.style.display = 'block';
  }

  function vider() {
    items = [];
    dernierFEC = null;
    $('ana_texte').value = '';
    $('ana_resultats').style.display = 'none';
    $('fec_resultat').style.display = 'none';
    $('ana_status').style.display = 'none';
    $('ana_btn_annuler').style.display = 'none';
    sauvegardeReport = null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const drop = $('ana_drop');
    if (!drop) return;
    const input = $('ana_files');
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { analyserFichiers(input.files); input.value = ''; });
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('survol'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('survol'); }));
    drop.addEventListener('drop', (e) => analyserFichiers(e.dataTransfer.files));

    $('ana_btn_analyser').addEventListener('click', () => {
      const txt = $('ana_texte').value;
      if (txt.trim().length < 4) return statut('Collez d\'abord le texte d\'un décompte, d\'un avis ou d\'une facture.', true);
      if (DFISC.fec && DFISC.fec.estFEC(txt)) return afficherFEC(DFISC.fec.analyser(txt), 'texte collé');
      ajouterItems(txt, 'texte collé');
      statut(`${items.length} ligne(s) au total. Vérifiez le classement puis reportez dans le simulateur.`);
    });
    $('ana_btn_reporter').addEventListener('click', reporter);
    $('ana_btn_annuler').addEventListener('click', annulerReport);
    $('ana_btn_vider').addEventListener('click', vider);
    $('fec_btn_reporter').addEventListener('click', reporterFEC);

    // Édition du tableau : montant ou catégorie
    document.querySelector('#ana_table tbody').addEventListener('input', (e) => {
      const idx = e.target.dataset.idx;
      if (idx === undefined) return;
      const it = items[idx];
      if (!it) return;
      if (e.target.dataset.role === 'montant') it.montant = parseFloat(e.target.value) || 0;
      if (e.target.dataset.role === 'categorie') { it.categorie = e.target.value; rendreTable(); return; }
      rendreSynthese();
      $('ana_btn_reporter').disabled = false;
    });
    // Changement de mode nue/meublé : resynthétiser
    ['ana_mode_nue', 'ana_mode_meuble'].forEach((id) => $(id).addEventListener('change', () => { rendreTable(); }));

    /* ----- Assistant copropriété (lignes 229/230) ----- */
    const champsCopro = ['cop_provisions', 'cop_alur', 'cop_regul_recup', 'cop_regul_nondeduc', 'cop_regul_trop'];
    function calculCopro() {
      return DFISC.classifieur.calculerCopro({
        provisionsPayees: $('cop_provisions').value,
        dontFondsAlur: $('cop_alur').value,
        regulRecuperable: $('cop_regul_recup').value,
        regulNonDeductible: $('cop_regul_nondeduc').value,
        regulTropPercu: $('cop_regul_trop').value,
      });
    }
    function afficherCopro() {
      const r = calculCopro();
      const zone = $('cop_resultat');
      if (r.ligne229 <= 0 && r.ligne230 <= 0) { zone.style.display = 'none'; return; }
      zone.style.display = 'block';
      zone.innerHTML =
        `<strong>Ligne 229 (provisions déductibles) : ${eur(r.ligne229)}</strong> · ` +
        `<strong>Ligne 230 (régularisation à réintégrer) : ${eur(r.ligne230)}</strong>` +
        r.alertes.map((a) => `<br />• ${a}`).join('');
      $('cop_btn_reporter').disabled = false;
    }
    champsCopro.forEach((id) => $(id).addEventListener('input', afficherCopro));
    $('cop_btn_reporter').addEventListener('click', () => {
      const r = calculCopro();
      if (r.ligne229 <= 0 && r.ligne230 <= 0) return statut('Renseignez d\'abord l\'assistant copropriété.', true);
      const copro = $('fon_copro');
      const regul = $('fon_regul');
      copro.value = Math.round(((parseFloat(copro.value) || 0) + r.ligne229) * 100) / 100;
      regul.value = Math.round(((parseFloat(regul.value) || 0) + r.ligne230) * 100) / 100;
      const coche = $('fon_actif');
      if (!coche.checked) coche.checked = true;
      copro.dispatchEvent(new Event('input', { bubbles: true }));
      statut(`Copropriété reportée : ${eur(r.ligne229)} en provisions (ligne 229) et ${eur(r.ligne230)} en régularisation (ligne 230).`);
      $('cop_btn_reporter').disabled = true;
    });

    window.addEventListener('beforeunload', () => { if (worker) worker.terminate(); });
  });
})();
