/* =========================================================================
 * Réductions et crédits d'impôt — calcul de l'avantage de l'année et
 * métadonnées (case de déclaration, plafonnement global ou non).
 *
 * Chaque calcul retourne des objets « avantage » :
 * { cle, libelle, type:'reduction'|'credit', montant, plafonnable:'non'|'10k'|'18k',
 *   retenuePlafond (montant compté dans le plafonnement, défaut = montant),
 *   cases:[{form, code, libelle, montant, aVerifier, note}], alertes:[] }
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;

  const AV = (o) => ({ retenuePlafond: o.montant, cases: [], alertes: [], ...o });

  /* ------------------------------------------------------------------ */
  /* Pinel / Pinel+ / Denormandie                                        */
  /* ------------------------------------------------------------------ */
  function pinel(d, P, anneeRevenus) {
    if (!d || !d.actif) return null;
    const gen = P.PINEL.generations[d.generation] || P.PINEL.generations.pinel2024;
    let base = Math.min(U.n(d.base), P.PINEL.plafondBase);
    const alertes = [];
    if (U.n(d.surface) > 0) {
      const plafM2 = P.PINEL.plafondM2 * U.n(d.surface);
      if (plafM2 < base) {
        base = plafM2;
        alertes.push(`Base Pinel plafonnée à 5 500 €/m² : ${Math.round(base)} €.`);
      }
    }
    const rang = anneeRevenus - Math.floor(U.n(d.anneePremiere) || anneeRevenus) + 1;
    const duree = Math.max(6, Math.min(12, Math.floor(U.n(d.duree) || 9)));
    let tauxAnnuel = 0;
    const sched = U.n(d.dureeInitiale) === 9 || duree === 9 ? 'init9' : 'init6';
    if (rang >= 1 && rang <= duree) {
      if (sched === 'init9') {
        tauxAnnuel = rang <= 9 ? gen.init9[0] : gen.init9[1];
      } else {
        tauxAnnuel = rang <= 6 ? gen.init6[0] : rang <= 9 ? gen.init6[1] : gen.init6[2];
      }
      if (rang > duree) tauxAnnuel = 0;
    } else if (rang > duree) {
      alertes.push('Engagement Pinel/Denormandie terminé : plus de réduction cette année.');
    } else {
      alertes.push('La première réduction Pinel/Denormandie interviendra l\'année d\'achèvement/acquisition.');
    }
    // durée 6 avec schedule init9 incohérent : sécurité
    if (duree === 6) tauxAnnuel = rang >= 1 && rang <= 6 ? gen.init6[0] : 0;

    const montant = (base * tauxAnnuel) / 100;
    if (montant <= 0) return null;
    const estDenormandie = d.generation === 'denormandie';
    return AV({
      cle: 'pinel',
      libelle: `${gen.libelle} — année ${rang}/${duree}`,
      type: 'reduction',
      montant,
      plafonnable: '10k',
      alertes: alertes.concat([
        'Réduction Pinel/Denormandie non reportable : la fraction dépassant votre impôt est perdue.',
        'Conditions non vérifiées par l\'outil : zonage, plafonds de loyers et de ressources du locataire, ' +
          'niveau de performance énergétique (Pinel+), engagement de location 6/9/12 ans.',
      ]),
      cases: [
        {
          form: '2042-RICI',
          code: estDenormandie ? '7NA à 7NL (ligne Denormandie)' : '7QA à 7QW / 7AI à 7DI (lignes Pinel)',
          libelle: `${estDenormandie ? 'Denormandie' : 'Pinel'} : reportez la base (${Math.round(base)} €) sur la ligne correspondant à l'année d'investissement et à la durée d'engagement ; les années suivantes, le report de 1/6e ou 1/9e figure sur les lignes « report »`,
          montant: Math.round(montant),
          aVerifier: true,
          note: 'Les codes exacts changent chaque millésime : repérez la ligne au libellé correspondant sur le 2042-RICI. Première année : remplir aussi la 2044-EB (engagement de location).',
        },
      ],
    });
  }

  /* ------------------------------------------------------------------ */
  function locAvantages(d, P) {
    if (!d || !d.actif || U.n(d.loyers) <= 0) return null;
    const niveau = P.LOC_AVANTAGES.taux[d.niveau] || P.LOC_AVANTAGES.taux.loc1;
    const taux = d.intermediation ? niveau.intermediation : niveau.direct;
    const alertes = [];
    if (taux == null) {
      return AV({
        cle: 'locavantages',
        libelle: "Loc'Avantages",
        type: 'reduction',
        montant: 0,
        plafonnable: '10k',
        alertes: ["Loc 3 n'est possible qu'avec intermédiation locative (agence agréée / mandat de gestion)."],
      });
    }
    const montant = U.n(d.loyers) * taux;
    return AV({
      cle: 'locavantages',
      libelle: `Loc'Avantages ${niveau.libelle}${d.intermediation ? ' + intermédiation' : ''} (${Math.round(taux * 100)} % des loyers)`,
      type: 'reduction',
      montant,
      plafonnable: '10k',
      alertes: [
        'Conditions : convention Anah signée, loyer sous les plafonds Loc1/2/3, ressources du locataire, régime réel obligatoire.',
      ],
      cases: [
        {
          form: '2042-RICI',
          code: 'ligne « Loc\'Avantages » (7BK à 7BR selon millésime)',
          libelle: `Loyers conventionnés Anah (${niveau.libelle})`,
          montant: Math.round(U.n(d.loyers)),
          aVerifier: true,
          note: 'Déclarez les loyers bruts du logement conventionné ; l\'administration calcule la réduction.',
        },
      ],
    });
  }

  /* ------------------------------------------------------------------ */
  function malraux(d, P) {
    if (!d || U.n(d.travaux) <= 0) return null;
    const taux = d.secteur === 'psmv' ? P.MALRAUX.tauxPSMV : P.MALRAUX.tauxPVAP;
    const travaux = Math.min(U.n(d.travaux), P.MALRAUX.plafondTravaux);
    const montant = travaux * taux;
    return AV({
      cle: 'malraux',
      libelle: `Malraux (${Math.round(taux * 100)} % des travaux)`,
      type: 'reduction',
      montant,
      plafonnable: 'non',
      alertes: [
        'Malraux : plafond de 400 000 € de travaux apprécié sur 4 années consécutives ; hors plafonnement global des niches. ' +
          'Excédent de réduction reportable 3 ans.',
      ],
      cases: [
        {
          form: '2042-RICI',
          code: d.secteur === 'psmv' ? '7SY (PSMV 30 %)' : '7SX (PVAP 22 %)',
          libelle: 'Dépenses de restauration immobilière Malraux payées dans l\'année',
          montant: Math.round(travaux),
          aVerifier: true,
        },
      ],
    });
  }

  /* ------------------------------------------------------------------ */
  function girardin(d, P) {
    if (!d || U.n(d.reduction) <= 0) return null;
    const retenue = P.NICHES.girardinRetenue[d.type] ?? P.NICHES.girardinRetenue.industriel_pd;
    const montant = U.n(d.reduction);
    return AV({
      cle: 'girardin',
      libelle: `Girardin outre-mer (${d.type === 'social' ? 'logement social' : d.type === 'industriel_agrement' ? 'industriel avec agrément' : 'industriel de plein droit'})`,
      type: 'reduction',
      montant,
      plafonnable: '18k',
      retenuePlafond: montant * retenue, // seule la part non rétrocédée compte dans le plafonnement
      alertes: [
        `Girardin : réduction « one-shot » supérieure au versement (rendement fiscal). Compté pour ${Math.round(retenue * 100)} % ` +
          'dans le plafonnement des niches (plafond spécifique porté à 18 000 €). Passez impérativement par un monteur agréé ' +
          '(risque de reprise en cas de défaillance de l\'exploitant).',
      ],
      cases: [
        {
          form: '2042-IOM',
          code: 'cases HSA à HSZ / HAA… selon la nature de l\'investissement',
          libelle: 'Investissements outre-mer (déclaration 2042-IOM fournie par le monteur)',
          montant: Math.round(montant),
          aVerifier: true,
          note: 'Le monteur (Inter Invest, Ecofip…) fournit chaque année le détail exact des cases à remplir.',
        },
      ],
    });
  }

  /* ------------------------------------------------------------------ */
  function censiEtAutresReports(d) {
    const res = [];
    if (d && U.n(d.censi) > 0) {
      res.push(
        AV({
          cle: 'censi',
          libelle: 'Censi-Bouvard — 1/9e de la réduction en cours',
          type: 'reduction',
          montant: U.n(d.censi),
          plafonnable: '10k',
          cases: [
            {
              form: '2042-C',
              code: '7QS et suivantes (reports Censi-Bouvard)',
              libelle: 'Report de 1/9e de la réduction Censi-Bouvard (investissements ≤ 2022)',
              montant: Math.round(U.n(d.censi)),
              aVerifier: true,
            },
          ],
        })
      );
    }
    if (d && U.n(d.autresReports) > 0) {
      res.push(
        AV({
          cle: 'autresReports',
          libelle: 'Autres réductions immobilières en cours (Scellier, reports Pinel antérieurs…)',
          type: 'reduction',
          montant: U.n(d.autresReports),
          plafonnable: '10k',
          cases: [
            {
              form: '2042-RICI',
              code: 'lignes « report » du dispositif concerné',
              libelle: 'Reports de réductions des années antérieures',
              montant: Math.round(U.n(d.autresReports)),
              aVerifier: true,
            },
          ],
        })
      );
    }
    return res;
  }

  /* ------------------------------------------------------------------ */
  /* Dons, cotisations syndicales                                        */
  /* ------------------------------------------------------------------ */
  function dons(d, rni, P) {
    const res = [];
    const urgence = U.n(d.urgence);
    const general = U.n(d.general);
    if (urgence + general <= 0) return res;

    const baseUrgence = Math.min(urgence, P.DONS.plafondUrgence);
    const bascule = Math.max(0, urgence - baseUrgence); // excédent basculé vers 66 %
    const plafond66 = Math.max(0, rni * P.DONS.plafondPctRNI);
    const base66 = Math.min(general + bascule, plafond66);
    const reportable = Math.max(0, general + bascule - plafond66);

    if (baseUrgence > 0) {
      res.push(
        AV({
          cle: 'dons75',
          libelle: 'Dons aux organismes d\'aide aux personnes en difficulté (75 %)',
          type: 'reduction',
          montant: baseUrgence * P.DONS.tauxUrgence,
          plafonnable: 'non',
          cases: [{ form: '2042-RICI', code: '7UD', libelle: 'Dons « Coluche » (restos du cœur, Croix-Rouge…)', montant: Math.round(baseUrgence), aVerifier: false }],
        })
      );
    }
    if (base66 > 0 || bascule > 0) {
      const alertes = [];
      if (reportable > 0.5) {
        alertes.push(
          `Dons dépassant 20 % du revenu imposable : ${Math.round(reportable)} € reportables sur les 5 années suivantes (cases 7XS à 7XY).`
        );
      }
      res.push(
        AV({
          cle: 'dons66',
          libelle: 'Dons aux organismes d\'intérêt général (66 %)',
          type: 'reduction',
          montant: base66 * P.DONS.tauxGeneral,
          plafonnable: 'non',
          alertes,
          cases: [
            { form: '2042-RICI', code: '7UF', libelle: 'Autres dons (intérêt général, fondations…) — y compris l\'excédent des dons 75 %', montant: Math.round(general + bascule), aVerifier: false },
          ],
        })
      );
    }
    return res;
  }

  function syndicats(montant, salairesEtPensions, P) {
    const m = U.n(montant);
    if (m <= 0) return null;
    const base = Math.min(m, salairesEtPensions * P.SYNDICATS.plafondPctSalaires);
    return AV({
      cle: 'syndicats',
      libelle: 'Cotisations syndicales (crédit 66 %)',
      type: 'credit',
      montant: base * P.SYNDICATS.taux,
      plafonnable: 'non',
      alertes: m > base ? [`Cotisations syndicales plafonnées à 1 % des salaires et pensions : base retenue ${Math.round(base)} €.`] : [],
      cases: [{ form: '2042-RICI', code: '7AC (7AE déclarant 2)', libelle: 'Cotisations syndicales versées', montant: Math.round(m), aVerifier: false, note: 'Salariés aux frais réels : déduisez la cotisation dans les frais réels au lieu du crédit d\'impôt.' }],
    });
  }

  /* ------------------------------------------------------------------ */
  /* Services à la personne, garde d'enfants, scolarité                  */
  /* ------------------------------------------------------------------ */
  function emploiDomicile(d, foyer, P) {
    if (!d) return null;
    const jardinage = Math.min(U.n(d.jardinage), P.EMPLOI_DOMICILE.sousPlafonds.jardinage);
    const informatique = Math.min(U.n(d.informatique), P.EMPLOI_DOMICILE.sousPlafonds.informatique);
    const bricolage = Math.min(U.n(d.bricolage), P.EMPLOI_DOMICILE.sousPlafonds.bricolage);
    const autres = Math.max(0, U.n(d.depenses) - U.n(d.jardinage) - U.n(d.informatique) - U.n(d.bricolage));
    const depensesEligibles = autres + jardinage + informatique + bricolage;
    if (depensesEligibles <= 0) return null;

    const nbMajorations = Math.max(0, Math.floor(U.n(d.majorations))); // enfants à charge + membres > 65 ans
    let plafond;
    if (d.invalide) {
      plafond = P.EMPLOI_DOMICILE.plafondInvalidite;
    } else if (d.premiereAnnee) {
      plafond = Math.min(
        P.EMPLOI_DOMICILE.plafondPremiereAnneeMajore,
        P.EMPLOI_DOMICILE.plafondPremiereAnnee + nbMajorations * P.EMPLOI_DOMICILE.majorationParPersonne
      );
    } else {
      plafond = Math.min(
        P.EMPLOI_DOMICILE.plafondMajore,
        P.EMPLOI_DOMICILE.plafondBase + nbMajorations * P.EMPLOI_DOMICILE.majorationParPersonne
      );
    }
    const base = Math.min(depensesEligibles, plafond);
    const alertes = [];
    if (depensesEligibles > plafond) alertes.push(`Emploi à domicile : dépenses plafonnées à ${Math.round(plafond)} €.`);
    if (U.n(d.jardinage) > jardinage) alertes.push('Petit jardinage plafonné à 5 000 €/an.');
    if (U.n(d.informatique) > informatique) alertes.push('Assistance informatique plafonnée à 3 000 €/an.');
    if (U.n(d.bricolage) > bricolage) alertes.push('Petit bricolage plafonné à 500 €/an.');

    return AV({
      cle: 'emploiDomicile',
      libelle: 'Emploi d\'un salarié à domicile (crédit 50 %)',
      type: 'credit',
      montant: base * P.EMPLOI_DOMICILE.taux,
      plafonnable: '10k',
      alertes,
      cases: [
        {
          form: '2042-RICI',
          code: '7DB',
          libelle: 'Dépenses d\'emploi à domicile (après déduction des aides : CESU préfinancé, APA, PCH…)',
          montant: Math.round(depensesEligibles),
          aVerifier: false,
          note: 'Détail par nature de service demandé sur la déclaration en ligne. Case 7DQ à cocher la 1re année d\'emploi direct ; 7DG si invalidité (plafond 20 000 €) ; aides perçues en 7DR.',
        },
      ],
    });
  }

  function gardeEnfants(d, P) {
    if (!d) return null;
    const nb = Math.max(0, Math.floor(U.n(d.nbEnfants)));
    const nbAlt = Math.max(0, Math.floor(U.n(d.nbEnfantsAlternee)));
    const dep = U.n(d.depenses);
    if (dep <= 0 || nb + nbAlt === 0) return null;
    const plafond = nb * P.GARDE_ENFANTS.plafondParEnfant + nbAlt * P.GARDE_ENFANTS.plafondParEnfantAlternee;
    const base = Math.min(dep, plafond);
    return AV({
      cle: 'garde',
      libelle: 'Frais de garde d\'enfants de moins de 6 ans (crédit 50 %)',
      type: 'credit',
      montant: base * P.GARDE_ENFANTS.taux,
      plafonnable: '10k',
      alertes: dep > plafond ? [`Frais de garde plafonnés à 3 500 € par enfant (1 750 € en résidence alternée) : base retenue ${Math.round(base)} €.`] : [],
      cases: [
        {
          form: '2042-RICI',
          code: '7GA/7GB/7GC (7GE/7GF/7GG en alternée)',
          libelle: 'Frais de garde hors du domicile (crèche, assistante maternelle agréée), une case par enfant, après déduction du CMG',
          montant: Math.round(base),
          aVerifier: false,
          note: 'La garde AU domicile relève de l\'emploi à domicile (7DB). Enfant de moins de 6 ans au 1er janvier de l\'année des revenus.',
        },
      ],
    });
  }

  function scolarite(d, P) {
    if (!d) return null;
    const nbC = Math.max(0, Math.floor(U.n(d.college)));
    const nbL = Math.max(0, Math.floor(U.n(d.lycee)));
    const nbS = Math.max(0, Math.floor(U.n(d.superieur)));
    const montant = nbC * P.SCOLARITE.college + nbL * P.SCOLARITE.lycee + nbS * P.SCOLARITE.superieur;
    if (montant <= 0) return null;
    const cases = [];
    if (nbC) cases.push({ form: '2042-RICI', code: '7EA', libelle: 'Nombre d\'enfants au collège', montant: nbC, aVerifier: false });
    if (nbL) cases.push({ form: '2042-RICI', code: '7EC', libelle: 'Nombre d\'enfants au lycée', montant: nbL, aVerifier: false });
    if (nbS) cases.push({ form: '2042-RICI', code: '7EF', libelle: 'Nombre d\'enfants dans le supérieur', montant: nbS, aVerifier: false });
    return AV({
      cle: 'scolarite',
      libelle: 'Frais de scolarité des enfants (réduction forfaitaire)',
      type: 'reduction',
      montant,
      plafonnable: 'non',
      cases,
      alertes: ['En résidence alternée : montants divisés par deux (cases 7EB/7ED/7EG).'],
    });
  }

  /* ------------------------------------------------------------------ */
  function ehpad(d, P) {
    if (!d) return null;
    const m1 = Math.min(U.n(d.montant1), P.EHPAD.plafondParPersonne);
    const m2 = Math.min(U.n(d.montant2), P.EHPAD.plafondParPersonne);
    if (m1 + m2 <= 0) return null;
    return AV({
      cle: 'ehpad',
      libelle: 'Dépenses de dépendance en EHPAD (réduction 25 %)',
      type: 'reduction',
      montant: (m1 + m2) * P.EHPAD.taux,
      plafonnable: 'non',
      cases: [
        { form: '2042-RICI', code: '7CD (1re personne) / 7CE (2e)', libelle: 'Frais de dépendance et d\'hébergement après déduction des aides (APA, aide sociale)', montant: Math.round(m1 + m2), aVerifier: false },
      ],
    });
  }

  function prestationCompensatoire(montant, P) {
    const m = U.n(montant);
    if (m <= 0) return null;
    const base = Math.min(m, P.PRESTATION_COMPENSATOIRE.plafond);
    return AV({
      cle: 'prestComp',
      libelle: 'Prestation compensatoire versée en capital sur 12 mois max (réduction 25 %)',
      type: 'reduction',
      montant: base * P.PRESTATION_COMPENSATOIRE.taux,
      plafonnable: 'non',
      alertes: m > base ? ['Prestation compensatoire : base plafonnée à 30 500 €.'] : [],
      cases: [{ form: '2042-RICI', code: '7WN (7WO si versements étalés sur 2 ans)', libelle: 'Prestation compensatoire en capital', montant: Math.round(base), aVerifier: true }],
    });
  }

  /* ------------------------------------------------------------------ */
  /* Investissements financiers                                          */
  /* ------------------------------------------------------------------ */
  function pme(d, couple, P) {
    if (!d || U.n(d.montant) <= 0) return null;
    const taux = P.PME.taux[d.taux] ?? P.PME.taux.classique;
    const plafond = couple ? P.PME.plafondVersementCouple : P.PME.plafondVersementCelib;
    const base = Math.min(U.n(d.montant), plafond);
    const alertes = [];
    if (U.n(d.montant) > plafond) {
      alertes.push(`IR-PME : versements retenus dans la limite de ${plafond.toLocaleString('fr-FR')} € ; l'excédent est reportable 4 ans.`);
    }
    return AV({
      cle: 'pme',
      libelle: `Souscription au capital de PME (${Math.round(taux * 100)} %)`,
      type: 'reduction',
      montant: base * taux,
      plafonnable: '10k',
      alertes,
      cases: [
        {
          form: '2042-RICI',
          code: d.taux === 'classique' ? '7CF' : d.taux === 'esus' ? '7CI/7GW (ESUS/foncières solidaires)' : '7RA-7RD (JEI/JEIR)',
          libelle: 'Versements au capital de PME / ESUS / JEI',
          montant: Math.round(base),
          aVerifier: d.taux !== 'classique',
          note: 'Conservation des titres 5 ans minimum.',
        },
      ],
    });
  }

  function fondsInnovation(d, couple, P) {
    const res = [];
    if (!d) return res;
    const plafond = couple ? P.FIP_FCPI.plafondCouple : P.FIP_FCPI.plafondCelib;
    const defs = [
      { cle: 'fcpi', champ: 'fcpi', taux: P.FIP_FCPI.taux.fcpi, lib: 'FCPI (fonds innovation)', code: '7GQ' },
      { cle: 'fip', champ: 'fip', taux: P.FIP_FCPI.taux.fip, lib: 'FIP (fonds investissement de proximité)', code: '7FQ' },
      { cle: 'fipCorse', champ: 'fipCorse', taux: P.FIP_FCPI.taux.fipCorse, lib: 'FIP Corse', code: '7FM' },
      { cle: 'fipOM', champ: 'fipOM', taux: P.FIP_FCPI.taux.fipOutreMer, lib: 'FIP Outre-mer', code: '7FL' },
    ];
    for (const f of defs) {
      const v = U.n(d[f.champ]);
      if (v <= 0) continue;
      const base = Math.min(v, plafond);
      res.push(
        AV({
          cle: f.cle,
          libelle: `${f.lib} — ${Math.round(f.taux * 100)} %`,
          type: 'reduction',
          montant: base * f.taux,
          plafonnable: '10k',
          alertes: v > base ? [`${f.lib} : versements plafonnés à ${plafond.toLocaleString('fr-FR')} €.`] : [],
          cases: [{ form: '2042-RICI', code: f.code, libelle: `Versements ${f.lib}`, montant: Math.round(base), aVerifier: false }],
        })
      );
    }
    return res;
  }

  function sofica(d, rng, P) {
    if (!d || U.n(d.montant) <= 0) return null;
    const taux = [0.3, 0.36, 0.48].includes(U.n(d.taux)) ? U.n(d.taux) : 0.48;
    const base = Math.min(U.n(d.montant), P.SOFICA.plafond, Math.max(0, rng * P.SOFICA.plafondPctRNG));
    return AV({
      cle: 'sofica',
      libelle: `Sofica (cinéma) — ${Math.round(taux * 100)} %`,
      type: 'reduction',
      montant: base * taux,
      plafonnable: '18k',
      alertes: [
        'Sofica : plafond 25 % du revenu net global et 18 000 € ; relève du plafonnement des niches majoré à 18 000 €. Conservation ≥ 5 ans.',
      ],
      cases: [
        { form: '2042-C', code: taux === 0.48 ? '7EN' : taux === 0.36 ? '7GN' : '7FN', libelle: 'Souscriptions Sofica', montant: Math.round(base), aVerifier: true },
      ],
    });
  }

  function foret(montant, couple, P) {
    const m = U.n(montant);
    if (m <= 0) return null;
    const base = Math.min(m, couple ? P.FORET.plafondCouple : P.FORET.plafondCelib);
    return AV({
      cle: 'foret',
      libelle: 'Investissement forestier DEFI (crédit 25 %)',
      type: 'credit',
      montant: base * P.FORET.taux,
      plafonnable: '10k',
      cases: [{ form: '2042-RICI', code: '7UN et suivantes (acquisition/travaux forestiers)', libelle: 'Dépenses forestières éligibles', montant: Math.round(base), aVerifier: true }],
    });
  }

  function bornes(d, P) {
    if (!d || U.n(d.depense) <= 0) return null;
    const nb = Math.max(1, Math.floor(U.n(d.nb) || 1));
    const montant = Math.min(U.n(d.depense) * P.BORNES.taux, nb * P.BORNES.plafondParSysteme);
    return AV({
      cle: 'bornes',
      libelle: 'Borne de recharge de véhicule électrique (crédit 75 %, max 500 €/système)',
      type: 'credit',
      montant,
      plafonnable: '10k',
      alertes: ['Borne « pilotable » obligatoire depuis 2024. Limite : 1 système par logement (résidence principale + secondaire), doublée pour un couple.'],
      cases: [{ form: '2042-RICI', code: '7ZQ à 7ZT', libelle: 'Dépenses d\'acquisition et de pose de bornes de recharge', montant: Math.round(U.n(d.depense)), aVerifier: true }],
    });
  }

  function equipementsPA(montant, couple, P) {
    const m = U.n(montant);
    if (m <= 0) return null;
    const base = Math.min(m, couple ? P.EQUIPEMENTS_PA.plafondCouple : P.EQUIPEMENTS_PA.plafondCelib);
    return AV({
      cle: 'equipements',
      libelle: 'Équipements pour personnes âgées/handicapées dans l\'habitation principale (crédit 25 %)',
      type: 'credit',
      montant: base * P.EQUIPEMENTS_PA.taux,
      plafonnable: '10k',
      alertes: ['Plafond de 5 000 €/10 000 € apprécié sur 5 années glissantes (+ 400 € par personne à charge). Conditions d\'invalidité/perte d\'autonomie requises.'],
      cases: [{ form: '2042-RICI', code: '7WJ', libelle: 'Équipements sanitaires / d\'accessibilité (facture de l\'entreprise)', montant: Math.round(base), aVerifier: false }],
    });
  }

  DFISC.dispositifs = {
    pinel,
    locAvantages,
    malraux,
    girardin,
    censiEtAutresReports,
    dons,
    syndicats,
    emploiDomicile,
    gardeEnfants,
    scolarite,
    ehpad,
    prestationCompensatoire,
    pme,
    fondsInnovation,
    sofica,
    foret,
    bornes,
    equipementsPA,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
