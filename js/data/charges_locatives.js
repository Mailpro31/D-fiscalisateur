/* =========================================================================
 * Données pédagogiques :
 *  - répartition des charges entre locataire (récupérables, décret n° 87-713
 *    du 26/08/1987) et propriétaire (déductibles au régime réel, art. 31 CGI) ;
 *  - pièces à fournir / conserver pour justifier les déductions ;
 *  - guide des durées d'amortissement LMNP.
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});

  DFISC.DATA_CHARGES = {
    intro:
      "En location nue au régime réel (déclaration 2044), seules les charges restant définitivement à la charge du " +
      "PROPRIÉTAIRE sont déductibles. Les charges RÉCUPÉRABLES sur le locataire (décret n° 87-713 du 26 août 1987) " +
      "ne sont jamais déductibles… sauf si elles n'ont pas pu être récupérées au 31 décembre de l'année du départ " +
      "du locataire (ligne 225 de la 2044). En copropriété, on déduit les provisions versées (ligne 229) puis on " +
      "réintègre l'année suivante la part récupérable ou non déductible régularisée (ligne 230).",

    recuperables: [
      { poste: 'Eau froide / eau chaude des locataires et parties communes', detail: 'Consommations + produits de traitement, y compris exploitation courante des compteurs' },
      { poste: 'Chauffage collectif', detail: "Combustible/énergie et exploitation courante (P1/P2 partiel) — hors gros entretien et remplacement de chaudière" },
      { poste: 'Ascenseur', detail: "Électricité, exploitation et visites périodiques, nettoyage, menues réparations de cabine (boutons, ampoules) — hors contrat complet de gros entretien et mise aux normes" },
      { poste: 'Parties communes intérieures', detail: 'Électricité, produits d\'entretien, balais et sacs, salaires du personnel de nettoyage, entretien du tapis, vide-ordures' },
      { poste: 'Espaces verts', detail: 'Exploitation et entretien courant des espaces extérieurs, aires de stationnement, abords' },
      { poste: 'Gardien / concierge', detail: '75 % du salaire + charges si le gardien assure entretien des parties communes ET sortie des poubelles ; 40 % s\'il n\'assure qu\'une des deux tâches ; employé d\'immeuble : 100 %' },
      { poste: "Taxe d'enlèvement des ordures ménagères (TEOM)", detail: 'Intégralement récupérable (elle figure sur l\'avis de taxe foncière — ne la déduisez pas !)' },
      { poste: 'Taxe de balayage, redevance assainissement', detail: 'Récupérables' },
      { poste: 'Hygiène', detail: 'Désinsectisation, désinfection, vidange des fosses septiques' },
      { poste: 'Entretien courant VMC, interphone, antenne TV', detail: 'Exploitation et menues réparations' },
    ],

    proprietaire: [
      { poste: 'Taxe foncière (hors TEOM)', detail: 'Ligne 227 de la 2044 — soustrayez la TEOM qui est récupérable', ligne: '227' },
      { poste: 'Grosses réparations et gros entretien', detail: 'Toiture, ravalement, remplacement chaudière/ascenseur/canalisations, mise aux normes — déductibles s\'il s\'agit de réparation/entretien ou d\'amélioration (ligne 224). Construction, reconstruction et agrandissement NON déductibles en location nue', ligne: '224' },
      { poste: 'Travaux d\'amélioration', detail: 'Cuisine, salle de bains, isolation, remplacement fenêtres… (logement d\'habitation uniquement)', ligne: '224' },
      { poste: 'Honoraires de syndic', detail: 'Inclus dans les provisions de copropriété (ligne 229) avec régularisation N+1 (ligne 230)', ligne: '229/230' },
      { poste: 'Frais de gestion locative / agence', detail: 'Mandat de gestion, honoraires de location relevant de la gestion courante (ligne 221)', ligne: '221' },
      { poste: 'Forfait 20 € par local', detail: 'Frais de correspondance, téléphone, déplacements… (ligne 222, automatique)', ligne: '222' },
      { poste: 'Assurances', detail: 'PNO (propriétaire non occupant), garantie loyers impayés (ligne 223) ; assurance emprunteur : avec les intérêts (ligne 250)', ligne: '223/250' },
      { poste: 'Intérêts d\'emprunt', detail: 'Intérêts + frais de dossier + assurance emprunteur (ligne 250). Déductibles uniquement des revenus fonciers (jamais du revenu global)', ligne: '250' },
      { poste: 'Indemnités d\'éviction, frais de relogement', detail: 'Si engagées pour relouer dans de meilleures conditions (ligne 226)', ligne: '226' },
      { poste: 'Frais de procédure', detail: 'Litiges avec locataire ou entrepreneurs (ligne 221/226 selon nature)', ligne: '221' },
      { poste: 'Charges récupérables non récupérées au départ du locataire', detail: 'Déductibles à titre d\'exception (ligne 225)', ligne: '225' },
    ],

    pieces: [
      "Décompte annuel de charges du syndic avec répartition « récupérables / non récupérables » et l'arrêté de régularisation (pour les lignes 229 et 230)",
      'Avis de taxe foncière (isoler la TEOM, récupérable, du reste, déductible)',
      "Tableau d'amortissement du prêt + attestation annuelle d'intérêts et de primes d'assurance emprunteur (ligne 250)",
      'Factures détaillées des travaux mentionnant nature exacte, adresse du bien et date de paiement (distinguer réparation/entretien/amélioration — déductibles — de construction/agrandissement — non déductibles)',
      'Pour le plafond majoré 21 400 € : DPE avant (E, F ou G) et après (A à D) + devis accepté après le 5/11/2022 et factures payées entre 2023 et 2025',
      'Mandat de gestion et factures d\'honoraires d\'agence',
      "Attestations d'assurance PNO / GLI",
      'Baux, états des lieux, décomptes de régularisation adressés au locataire',
      'Quittances et justificatifs des charges refacturées au locataire (elles ne sont PAS déductibles)',
      'LMNP réel : acte d\'achat (ventilation terrain/construction), factures de mobilier et travaux, registre des immobilisations et plan d\'amortissement (conservés avec la liasse 2031/2033)',
    ],

    amortissement: {
      intro:
        'En location MEUBLÉE au régime réel (LMNP), le bien, les travaux et le mobilier s\'amortissent par « composants ». ' +
        'Le terrain (10-20 % du prix) ne s\'amortit jamais. L\'amortissement ne peut pas créer de déficit (art. 39 C CGI) : ' +
        'l\'excédent se reporte sans limite de durée sur vos futurs bénéfices de location meublée. ' +
        'En location NUE, il n\'existe pas d\'amortissement (hors anciens dispositifs Robien/Borloo) : la défiscalisation ' +
        'passe par le déficit foncier.',
      composants: [
        { composant: 'Terrain', part: '10-20 % du prix', duree: 'Non amortissable' },
        { composant: 'Gros œuvre (structure)', part: '40-50 % du bâti', duree: '50 ans (2 %/an)' },
        { composant: 'Façade / étanchéité / toiture', part: '10-20 %', duree: '20-30 ans' },
        { composant: 'Installations générales et techniques (électricité, plomberie, chauffage)', part: '20-25 %', duree: '15-25 ans' },
        { composant: 'Agencements intérieurs (cuisine, sols, cloisons)', part: '10-15 %', duree: '10-15 ans' },
        { composant: 'Mobilier et électroménager', part: 'factures', duree: '5-10 ans' },
        { composant: 'Travaux de rénovation', part: 'factures', duree: '10-25 ans selon nature' },
        { composant: "Frais d'acquisition (notaire, agence)", part: '~7,5 % dans l\'ancien', duree: 'Au choix : charge de l\'année d\'achat OU amortis avec le bien' },
      ],
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
