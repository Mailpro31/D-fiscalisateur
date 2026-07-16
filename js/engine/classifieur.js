/* =========================================================================
 * Classifieur de charges locatives.
 *
 * Prend le TEXTE d'un document (décompte de charges du syndic, avis de taxe
 * foncière, relevé de prêt, factures… — issu d'un OCR ou d'un copier-coller)
 * et propose, ligne par ligne, la répartition fiscale :
 *   - charges RÉCUPÉRABLES sur le locataire (décret n° 87-713) → non déductibles ;
 *   - charges déductibles du PROPRIÉTAIRE (art. 31 CGI) → ligne 2044 + champ
 *     du simulateur ;
 *   - lignes à vérifier (construction/agrandissement non déductibles, etc.).
 *
 * Sortie : { items: [...], totaux: {...} } — voir analyserTexte().
 * Moteur 100 % local, sans dépendance (testable sous Node).
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});

  /* ---------------- utilitaires texte / montants ---------------- */
  function normaliser(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Extrait le montant le plus plausible d'une ligne (format français ou non).
   * Renvoie { montant, confiance } ou null.
   * Heuristiques : on préfère le DERNIER nombre à décimales de la ligne
   * (colonne « quote-part » des décomptes) ; on écarte années, dates,
   * pourcentages et tantièmes probables.
   */
  function extraireMontant(ligne) {
    const texte = String(ligne);
    const re = /-?\d{1,3}(?:[   .]\d{3})+(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g;
    const candidats = [];
    let m;
    while ((m = re.exec(texte)) !== null) {
      const brut = m[0];
      const avant = texte.slice(Math.max(0, m.index - 1), m.index);
      const apres = texte.slice(m.index + brut.length, m.index + brut.length + 2);
      if (apres.startsWith('%')) continue; // pourcentage
      if (avant === '/' || apres.startsWith('/')) continue; // fragment de date 12/2025
      const aDecimales = /[.,]\d{1,2}$/.test(brut);
      let val = parseFloat(brut.replace(/[   ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
      if (!Number.isFinite(val)) continue;
      // Années probables (1900-2100 sans décimales) : ignorées
      if (!aDecimales && val >= 1900 && val <= 2100 && Number.isInteger(val)) continue;
      // Négatif noté entre parenthèses ou avec « - » final
      if (avant === '(' || /^\)?-/.test(apres)) val = -Math.abs(val);
      candidats.push({ val, aDecimales, index: m.index });
    }
    if (!candidats.length) return null;
    // Dernier montant à décimales, sinon dernier entier « raisonnable »
    const decimaux = candidats.filter((c) => c.aDecimales);
    if (decimaux.length) return { montant: decimaux[decimaux.length - 1].val, confiance: 'haute' };
    const entiers = candidats.filter((c) => Math.abs(c.val) < 1000000);
    if (!entiers.length) return null;
    return { montant: entiers[entiers.length - 1].val, confiance: 'basse' };
  }

  /* ---------------- catalogue des catégories ---------------- */
  /* cible : 'recuperable' (locataire), 'deductible', 'mixte', 'attention', 'ignorer'
   * champNu / champMeuble : champ du simulateur alimenté par le montant déductible.
   * partDeductible : fraction déductible pour les catégories mixtes (gardien…). */
  const CATEGORIES = [
    { cle: 'ignorer_total', cible: 'ignorer', libelle: 'Total / sous-total (ignoré pour éviter un double compte)',
      re: /^(sous[- ]?total|total|montant total|somme|report|solde (crediteur|debiteur)|a payer|net a payer)/ },

    /* --- Récupérables sur le locataire (décret n° 87-713) --- */
    { cle: 'teom', cible: 'recuperable', libelle: 'TEOM — ordures ménagères (récupérable)',
      re: /t\.?e\.?o\.?m\.?|ordures menageres|enlevement des ordures/,
      note: 'Intégralement récupérable sur le locataire : à retrancher de l\'avis de taxe foncière.' },
    { cle: 'balayage', cible: 'recuperable', libelle: 'Taxe de balayage (récupérable)', re: /taxe de balayage/ },
    { cle: 'eau', cible: 'recuperable', libelle: 'Eau froide / eau chaude (récupérable)',
      re: /eau (froide|chaude)|consommation[s]? (d')?eau|releve[s]? de compteur|rechauffement (de l')?eau/ },
    { cle: 'chauffage', cible: 'recuperable', libelle: 'Chauffage collectif — combustible & exploitation (récupérable)',
      re: /chauffage|combustible|fioul|gaz (collectif|chaufferie)|reseau de chaleur|\bp1\b|\bp2\b/,
      note: 'Le combustible et l\'exploitation courante sont récupérables ; le GROS entretien/remplacement de chaudière (P3) reste au propriétaire (→ reclassez en travaux si c\'est le cas).' },
    { cle: 'electricite_communs', cible: 'recuperable', libelle: 'Électricité des parties communes (récupérable)',
      re: /electricite (des )?(parties communes|communs)|eclairage (des )?(parties communes|communs|exterieur)/ },
    { cle: 'nettoyage', cible: 'recuperable', libelle: 'Nettoyage / entretien courant des parties communes (récupérable)',
      re: /nettoyage|entretien menager|entretien courant|entretien (des |de la |de |du )?(parties communes|communs|immeuble|cage[s]? d'escalier|hall)|produits d'entretien|societe de proprete|vide[- ]ordures/ },
    { cle: 'espaces_verts', cible: 'recuperable', libelle: 'Espaces verts (récupérable)',
      re: /espaces? verts?|tonte|taille (des )?(haies|arbustes)|jardinage (parties communes)?/ },
    { cle: 'travaux_ascenseur', cible: 'deductible', ligne2044: '224', champNu: 'travaux', champMeuble: 'travaux',
      libelle: 'Remplacement / mise aux normes d\'ascenseur — travaux du propriétaire (ligne 224)',
      re: /(remplacement|modernisation|mise aux normes|renovation)[^\n]*ascenseur|ascenseur[^\n]*(remplacement|modernisation|mise aux normes|renovation)/ },
    { cle: 'ascenseur', cible: 'recuperable', libelle: 'Ascenseur — électricité & entretien courant (récupérable)',
      re: /ascenseur|monte[- ]charge/,
      note: 'Exploitation et entretien courant récupérables ; remplacement, modernisation ou mise aux normes → travaux du propriétaire (ligne 224).' },
    { cle: 'hygiene', cible: 'recuperable', libelle: 'Hygiène : désinsectisation, vidange… (récupérable)',
      re: /desinsectisation|deratisation|desinfection|vidange|fosse[s]? septique|assainissement/ },
    { cle: 'entretien_technique', cible: 'recuperable', libelle: 'Entretien courant VMC / interphone / antenne (récupérable)',
      re: /\bvmc\b|interphone|antenne|digicode|controle d'acces/ },

    /* --- Mixte : gardien / employé d'immeuble --- */
    { cle: 'employe_immeuble', cible: 'recuperable', libelle: 'Employé d\'immeuble (récupérable à 100 %)',
      re: /employe[s]? d'immeuble/ },
    { cle: 'gardien', cible: 'mixte', partDeductible: 0.25, ligne2044: '221/229', champNu: 'gestion', champMeuble: 'charges',
      libelle: 'Gardien / concierge — 75 % récupérable, 25 % propriétaire',
      re: /gardien(nage)?|concierge|\bloge\b/,
      note: 'Décret 87-713 : 75 % du salaire récupérable si le gardien assure entretien + ordures (40 % si une seule tâche → ajustez), le reste est déductible.' },

    /* --- Déductibles propriétaire --- */
    { cle: 'travaux_construction', cible: 'attention', libelle: '⚠ Construction / agrandissement — NON déductible en location nue',
      re: /agrandissement|surelevation|extension|construction (neuve|d'un)|demolition|reconstruction/,
      note: 'Les dépenses de (re)construction et d\'agrandissement ne sont pas déductibles des revenus fonciers (en meublé : à immobiliser/amortir).' },

    /* --- Copropriété : charges dues au propriétaire (avant les règles
       « travaux » génériques : un appel de fonds travaux relève de la 229) --- */
    { cle: 'copro_recuperable', cible: 'recuperable', libelle: 'Quote-part de charges RÉCUPÉRABLES du décompte (locataire)',
      re: /charges (locatives|recuperables)|quote[- ]part locative|part locative|recuperable[s]? (aupres du |sur le )?locataire/,
      note: 'Le décompte du syndic isole souvent la part récupérable : c\'est celle à refacturer au locataire, jamais à déduire.' },
    { cle: 'copro_non_recuperable', cible: 'attention', libelle: '⚠ Quote-part NON récupérable du décompte (propriétaire) — sert au calcul de la ligne 230',
      re: /charges non recuperables|non recuperable[s]?|part proprietaire|quote[- ]part proprietaire/,
      note: 'Part définitivement à la charge du propriétaire dans l\'arrêté des comptes : utilisez l\'assistant copropriété (lignes 229/230) plutôt qu\'une déduction directe si vous déduisez déjà vos provisions.' },
    { cle: 'appel_travaux', cible: 'deductible', ligne2044: '229', champNu: 'copro', champMeuble: 'charges',
      libelle: 'Appels de fonds pour travaux votés (hors budget) — provisions ligne 229',
      re: /appel[s]?( de fonds)? (pour )?travaux|travaux votes en (ag|assemblee)|travaux votes|depenses hors budget|article 14-2/,
      note: 'Les provisions pour dépenses hors budget (travaux art. 14-2) se déduisent ligne 229 l\'année du paiement, puis se régularisent ligne 230.' },
    { cle: 'fonds_alur', cible: 'attention', libelle: '⚠ Fonds de travaux ALUR — non déductible au versement',
      re: /fonds (de )?travaux|loi alur|cotisation (annuelle )?(au )?fonds/,
      note: 'La cotisation au fonds de travaux (loi ALUR) n\'est pas déductible lors du versement (définitivement acquise au syndicat) : elle ne se déduit qu\'au travers de la régularisation, quand le syndic l\'emploie à des travaux déductibles.' },
    { cle: 'provisions_copro', cible: 'deductible', ligne2044: '229', champNu: 'copro', champMeuble: 'charges',
      libelle: 'Provisions pour charges de copropriété (ligne 229)',
      re: /provision[s]?|appel[s]? de (fonds|charges)|budget previsionnel|avance de tresorerie|charges de copropriete/,
      note: 'Déduisez les provisions versées puis régularisez l\'an prochain (ligne 230) la part récupérable ou non déductible.' },
    { cle: 'renovation_energetique', cible: 'deductible', ligne2044: '224', champNu: 'travauxRenov', champMeuble: 'travaux',
      libelle: 'Travaux de rénovation énergétique (ligne 224 — plafond majoré possible)',
      re: /isolation|pompe a chaleur|chaudiere (a granules|biomasse|a condensation)|double vitrage|\bite\b|vmc double flux|audit energetique|renovation energetique|calorifugeage/,
      note: 'Peut ouvrir le plafond d\'imputation majoré à 21 400 € si le logement passe de E/F/G à A-D (dépenses 2023-2025) — conditions à vérifier.' },
    { cle: 'travaux', cible: 'deductible', ligne2044: '224', champNu: 'travaux', champMeuble: 'travaux',
      libelle: 'Travaux de réparation / entretien / amélioration (ligne 224)',
      re: /travaux|ravalement|toiture|refection|remplacement|reparation|peinture|plomberie|menuiserie|serrurerie|vitrerie|maconnerie|etancheite|degorgement|remise en etat|mise aux normes|renovation/,
      note: 'Conservez les factures détaillées (nature des travaux, adresse, date de paiement).' },
    { cle: 'taxe_fonciere', cible: 'deductible', ligne2044: '227', champNu: 'taxeFonciere', champMeuble: 'charges',
      libelle: 'Taxe foncière hors TEOM (ligne 227)',
      re: /taxe[s]? fonciere|proprietes baties|foncier bati/,
      note: 'Déduisez la part TEOM (récupérable) qui figure sur le même avis.' },
    { cle: 'interets', cible: 'deductible', ligne2044: '250', champNu: 'interets', champMeuble: 'interets',
      libelle: 'Intérêts d\'emprunt & assurance emprunteur (ligne 250)',
      re: /interets?( d'emprunt| du pret)?\b|assurance emprunteur|\badi\b|frais de dossier|echeance (de )?pret/,
      note: 'Déductibles uniquement des revenus fonciers (jamais du revenu global). Joindre le relevé annuel du prêteur.' },
    { cle: 'assurance', cible: 'deductible', ligne2044: '223', champNu: 'assurance', champMeuble: 'charges',
      libelle: 'Primes d\'assurance PNO / GLI / multirisque immeuble (ligne 223)',
      re: /assurance|\bpno\b|\bgli\b|loyers? impayes|multirisque/ },
    { cle: 'gestion', cible: 'deductible', ligne2044: '221', champNu: 'gestion', champMeuble: 'charges',
      libelle: 'Frais de gestion, honoraires syndic / agence (ligne 221)',
      re: /honoraires?|syndic\b|frais de (gestion|gerance|relocation)|mandat de gestion|agence immobiliere|gestion locative|remuneration du syndic|cabinet/ },
    { cle: 'procedure', cible: 'deductible', ligne2044: '226', champNu: 'autresCharges', champMeuble: 'charges',
      libelle: 'Frais de procédure / éviction (ligne 226)',
      re: /huissier|avocat|procedure|contentieux|commandement de payer|indemnite d'eviction/ },
    { cle: 'regularisation', cible: 'attention', ligne2044: '230', champNu: 'regularisationCopro', champMeuble: 'charges',
      libelle: '⚠ Régularisation de charges N-1 (ligne 230 — à réintégrer)',
      re: /regularisation|decompte definitif|solde de charges|arrete des comptes/,
      note: 'La part des provisions N-1 finalement récupérable ou non déductible se réintègre ligne 230.' },
    { cle: 'cfe', cible: 'attention', champMeuble: 'charges', libelle: '⚠ CFE — déductible uniquement en meublé (BIC)',
      re: /\bcfe\b|cotisation fonciere des entreprises/,
      note: 'Non déductible en location nue ; déductible des recettes en LMNP.' },
  ];

  const PAR_CLE = Object.fromEntries(CATEGORIES.map((c) => [c.cle, c]));

  /* ---------------- classification d'une ligne ---------------- */
  function classifierLigne(ligne) {
    const norm = normaliser(ligne);
    for (const cat of CATEGORIES) {
      if (cat.re.test(norm)) return cat;
    }
    return null;
  }

  /**
   * Analyse le texte complet d'un document.
   * options = { mode: 'nue' | 'meuble', source: 'nom du fichier' }
   */
  function analyserTexte(texte, options) {
    const opts = options || {};
    const mode = opts.mode === 'meuble' ? 'meuble' : 'nue';
    const items = [];
    const lignes = String(texte || '').split(/\r?\n/);

    for (const brute of lignes) {
      const ligne = brute.trim();
      if (ligne.length < 4) continue;
      if (!/[a-zA-ZÀ-ÿ]{3}/.test(ligne)) continue; // pas de libellé
      const montantInfo = extraireMontant(ligne);
      if (!montantInfo) continue;
      const cat = classifierLigne(ligne);
      if (cat && cat.cible === 'ignorer') {
        items.push(faireItem(ligne, montantInfo, cat, mode, opts.source, 'ignoré'));
        continue;
      }
      if (!cat) {
        // Bruit probable : petit entier sans décimales et sans mot-clé (n° de lot, page…)
        if (montantInfo.confiance === 'basse' && Math.abs(montantInfo.montant) < 50) continue;
        items.push(faireItem(ligne, montantInfo, null, mode, opts.source, montantInfo.confiance === 'haute' ? 'moyenne' : 'basse'));
        continue;
      }
      items.push(faireItem(ligne, montantInfo, cat, mode, opts.source, montantInfo.confiance));
    }
    return { items, totaux: totaliser(items, mode) };
  }

  function faireItem(ligne, montantInfo, cat, mode, source, confiance) {
    return {
      source: source || '',
      libelle: ligne.replace(/\s{2,}/g, ' ').slice(0, 140),
      montant: Math.round(montantInfo.montant * 100) / 100,
      categorie: cat ? cat.cle : 'inconnu',
      confiance: confiance || 'basse',
    };
  }

  /** Recalcule la synthèse à partir des items (après édition éventuelle). */
  function totaliser(items, mode) {
    const t = {
      mode,
      recuperable: 0, // à la charge du locataire → non déductible
      deductible: 0,
      aVerifier: 0,
      ignore: 0,
      parLigne2044: {}, // { '224': montant, ... }
      parChamp: {}, // { travaux: montant, interets: ... } champs du simulateur
      nbInconnus: 0,
    };
    for (const it of items) {
      const cat = PAR_CLE[it.categorie];
      const montant = Number(it.montant) || 0;
      if (!cat) {
        t.aVerifier += montant;
        t.nbInconnus++;
        continue;
      }
      if (cat.cible === 'ignorer') { t.ignore += montant; continue; }
      if (cat.cible === 'recuperable') {
        // En meublé au réel, les loyers sont déclarés charges comprises :
        // les charges « récupérables » payées par le propriétaire restent déductibles.
        if (mode === 'meuble') {
          t.deductible += montant;
          t.parChamp.charges = (t.parChamp.charges || 0) + montant;
        } else {
          t.recuperable += montant;
        }
        continue;
      }
      const champAttention = mode === 'meuble' ? cat.champMeuble : cat.champNu;
      if (cat.cible === 'attention' && !champAttention && cat.cle !== 'regularisation') { t.aVerifier += montant; continue; }
      if (cat.cle === 'regularisation') {
        // Réintégration (ligne 230) : réduit les déductions, ne s'y ajoute pas.
        t.reintegration = (t.reintegration || 0) + montant;
        const champR = mode === 'meuble' ? cat.champMeuble : cat.champNu;
        if (champR && mode === 'nue') t.parChamp[champR] = (t.parChamp[champR] || 0) + montant;
        if (cat.ligne2044 && mode === 'nue') t.parLigne2044[cat.ligne2044] = (t.parLigne2044[cat.ligne2044] || 0) + montant;
        continue;
      }

      let partDeductible = montant;
      if (cat.cible === 'mixte') {
        if (mode === 'meuble') {
          partDeductible = montant; // tout déductible en BIC
        } else {
          partDeductible = montant * (cat.partDeductible || 0);
          t.recuperable += montant - partDeductible;
        }
      }
      t.deductible += partDeductible;
      const champ = mode === 'meuble' ? cat.champMeuble : cat.champNu;
      if (champ) t.parChamp[champ] = (t.parChamp[champ] || 0) + partDeductible;
      if (cat.ligne2044 && mode === 'nue') t.parLigne2044[cat.ligne2044] = (t.parLigne2044[cat.ligne2044] || 0) + partDeductible;
    }
    for (const k of Object.keys(t.parChamp)) t.parChamp[k] = Math.round(t.parChamp[k] * 100) / 100;
    for (const k of Object.keys(t.parLigne2044)) t.parLigne2044[k] = Math.round(t.parLigne2044[k] * 100) / 100;
    t.recuperable = Math.round(t.recuperable * 100) / 100;
    t.deductible = Math.round(t.deductible * 100) / 100;
    t.aVerifier = Math.round(t.aVerifier * 100) / 100;
    return t;
  }

  /* ------------------------------------------------------------------ */
  /* Assistant copropriété — mécanisme officiel des lignes 229/230        */
  /* (notice 2044 ; art. 31 I.1° a quater CGI)                            */
  /* ------------------------------------------------------------------ */
  /**
   * entree = {
   *   provisionsPayees      : provisions/appels de fonds payés au syndic en N
   *                           (budget prévisionnel + travaux votés hors budget),
   *   dontFondsAlur         : part correspondant à la cotisation au fonds de
   *                           travaux ALUR (non déductible au versement),
   *   regulRecuperable      : dans l'arrêté des comptes N-1 approuvé en N,
   *                           part des provisions correspondant à des charges
   *                           RÉCUPÉRABLES sur le locataire,
   *   regulNonDeductible    : part correspondant à des charges non déductibles
   *                           (travaux d'agrandissement, dépenses personnelles…),
   *   regulTropPercu        : trop-versé restitué ou porté au crédit du compte.
   * }
   * Retourne { ligne229, ligne230, alertes[] }
   */
  function calculerCopro(entree) {
    const e = entree || {};
    const n = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    const provisions = Math.max(0, n(e.provisionsPayees));
    const alur = Math.min(Math.max(0, n(e.dontFondsAlur)), provisions);
    const ligne229 = Math.round((provisions - alur) * 100) / 100;
    const ligne230 = Math.round((Math.max(0, n(e.regulRecuperable)) + Math.max(0, n(e.regulNonDeductible)) + Math.max(0, n(e.regulTropPercu))) * 100) / 100;
    const alertes = [];
    if (alur > 0) {
      alertes.push(
        `Cotisation au fonds de travaux ALUR (${Math.round(alur)} €) exclue de la ligne 229 : elle n'est pas déductible au versement.`
      );
    }
    if (ligne230 > 0) {
      alertes.push(
        'Ligne 230 : réintégration calculée d\'après l\'arrêté des comptes N-1 approuvé en assemblée générale (conservez le décompte individuel du syndic).'
      );
    }
    if (ligne229 > 0 && ligne230 === 0) {
      alertes.push(
        'N\'oubliez pas l\'an prochain de réintégrer ligne 230 la part récupérable ou non déductible de ces provisions (relevé de régularisation du syndic).'
      );
    }
    return { ligne229, ligne230, alertes };
  }

  DFISC.classifieur = { analyserTexte, totaliser, extraireMontant, classifierLigne, calculerCopro, CATEGORIES, PAR_CLE, normaliser };
})(typeof globalThis !== 'undefined' ? globalThis : this);
