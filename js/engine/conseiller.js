/* =========================================================================
 * Conseiller pluriannuel — propositions d'optimisation pour N+1, N+2, N+3
 * à partir de la simulation de l'année N.
 *
 * Chaque conseil : {
 *   horizon   : 0 (chaque année / dès maintenant) | 1 | 2 | 3,
 *   categorie : 'PER' | 'Foncier' | 'LMNP' | 'Pinel' | 'Niches' | 'Dons' | ...
 *   titre, detail,
 *   gain      : économie d'impôt annuelle estimée en € (null si non chiffrable),
 *   priorite  : 1 (fort) | 2 (utile) | 3 (à étudier)
 * }
 * Les gains sont estimés à revenus constants, au taux marginal de l'année N
 * (+ 17,2 % de prélèvements sociaux quand le levier réduit des revenus du
 * patrimoine). Ce sont des ordres de grandeur, pas des promesses.
 * ========================================================================= */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});
  const U = DFISC.util;

  /** Seuil bas de la tranche marginale courante (par part). */
  function seuilBasTranche(qf, P) {
    let bas = 0;
    for (const tr of P.BAREME) {
      if (qf <= tr.jusqua) return bas;
      bas = tr.jusqua;
    }
    return bas;
  }

  function generer(run, state, P) {
    const f = run.final;
    const conseils = [];
    const add = (c) => conseils.push({ gain: null, priorite: 2, ...c });
    const tmi = f.ir.tmi;
    const tauxPatrimoine = tmi + P.PS.taux;
    const anneeN = P.MILLESIME.revenus;

    /* ================= PER ================= */
    const poolPER = (f.per.plafond1 || 0) + (f.per.plafond2 || 0);
    const restantPER = Math.max(0, poolPER - f.per.deduitTotal);
    if (restantPER > 200 && tmi >= 0.3 && f.rni > 0) {
      // Versement « optimal » : celui qui reste déduit dans la tranche actuelle.
      const margeTranche = Math.max(0, f.rni - seuilBasTranche(f.rni / f.ir.parts, P) * f.ir.parts);
      const optimal = Math.round(Math.min(restantPER, margeTranche));
      if (optimal > 200) {
        add({
          horizon: 0, categorie: 'PER', priorite: 1,
          titre: `Utilisez votre plafond PER restant : ${optimal.toLocaleString('fr-FR')} € déductibles à ${Math.round(tmi * 100)} %`,
          detail:
            `Il vous reste ≈ ${Math.round(restantPER).toLocaleString('fr-FR')} € de plafond épargne retraite non utilisé` +
            ` (reliquats reportables 3 ans — les plus anciens se périment en premier). Un versement de ${optimal.toLocaleString('fr-FR')} €` +
            ` reste intégralement déduit dans votre tranche à ${Math.round(tmi * 100)} % ; au-delà, la déduction basculerait dans la tranche inférieure.` +
            (f.couple && !state.per.mutualisation ? ' Couple : cochez la mutualisation des plafonds (case 6QR) pour cumuler vos deux plafonds.' : ''),
          gain: Math.round(optimal * tmi),
        });
      }
    }
    if (tmi <= 0.11 && f.per.deduitTotal > 0) {
      add({
        horizon: 0, categorie: 'PER', priorite: 3,
        titre: 'TMI ≤ 11 % : le PER déductible est peu efficace pour vous',
        detail:
          'La déduction ne fait gagner que 11 % (voire 0 %) alors que la sortie sera imposée. À votre niveau d\'imposition, ' +
          'privilégiez les crédits d\'impôt (remboursables) et l\'assurance-vie, ou versez sans déduire (option à la sortie non imposée).',
      });
    }
    if (f.per.excedent > 0.5) {
      add({
        horizon: 1, categorie: 'PER', priorite: 1,
        titre: `Excédent PER non déduit (${Math.round(f.per.excedent).toLocaleString('fr-FR')} €) : recalibrez vos versements N+1`,
        detail: f.couple && !state.per.mutualisation
          ? 'Activez d\'abord la mutualisation des plafonds entre conjoints (case 6QR) ; sinon, réduisez le versement au plafond disponible de votre avis.'
          : 'Ajustez le versement annuel au plafond disponible figurant sur votre avis d\'imposition (le surplus ne procure aucune déduction).',
        gain: Math.round(f.per.excedent * tmi),
      });
    }

    /* ================= Déficit foncier ================= */
    const fon = f.foncier;
    if (fon.actif && fon.regime === 'reel') {
      const reports = (fon.reportInterets || 0) + (fon.reportAutres || 0);
      if (reports > 0) {
        add({
          horizon: 0, categorie: 'Foncier', priorite: 2,
          titre: `${Math.round(reports).toLocaleString('fr-FR')} € de déficit foncier en réserve pour les 10 prochaines années`,
          detail:
            'Ce report s\'imputera automatiquement sur vos prochains bénéfices fonciers (case 4BD) : vos loyers nus resteront ' +
            `non imposés (et exonérés de 17,2 % de prélèvements sociaux) jusqu'à épuisement — économie future ≈ ${Math.round(reports * tauxPatrimoine).toLocaleString('fr-FR')} €. ` +
            'Condition : conserver le bien en location jusqu\'au 31 décembre de la 3e année suivant l\'imputation sur le revenu global.',
          gain: null,
        });
      }
      if ((fon.deficitRG || 0) >= (fon.plafondRGUtilise || P.FONCIER.deficitImputableRG) - 1 && reports > 0) {
        add({
          horizon: 1, categorie: 'Foncier', priorite: 1,
          titre: 'Étalez vos prochains travaux : le plafond de 10 700 €/an se recharge chaque année',
          detail:
            `Cette année, votre déficit imputable sur le revenu global est saturé (${Math.round(fon.deficitRG).toLocaleString('fr-FR')} €). ` +
            'Si d\'autres travaux sont envisagés, payez-les sur N+1 (voire N+2) plutôt qu\'en une fois : chaque année, ' +
            `10 700 € supplémentaires s'imputent sur votre revenu global — gain ≈ ${Math.round(P.FONCIER.deficitImputableRG * tmi).toLocaleString('fr-FR')} € par année de plafond re-consommé.`,
          gain: Math.round(P.FONCIER.deficitImputableRG * tmi),
        });
      }
      if (U.n(state.foncier.travauxRenov) > 0) {
        add({
          horizon: 1, categorie: 'Foncier', priorite: 1,
          titre: 'Rénovation énergétique : le plafond majoré (21 400 €) s\'arrête aux dépenses payées fin 2025',
          detail:
            'Le doublement du plafond d\'imputation est réservé aux dépenses payées entre 2023 et le 31/12/2025 (passoire E/F/G ' +
            'atteignant au plus la classe D). Soldez les factures de ce chantier avant la fin d\'année ; dès N+1, retour à 10 700 €.',
        });
      }
      if (fon.comparatif && fon.comparatif.micro != null && fon.comparatif.micro < fon.comparatif.reel) {
        add({
          horizon: 1, categorie: 'Foncier', priorite: 2,
          titre: 'Location nue : le micro-foncier redeviendrait plus favorable en N+1',
          detail:
            'Une fois les gros travaux passés, si vos charges retombent sous 30 % des loyers, le micro-foncier (abattement 30 %) ' +
            'redevient intéressant. Attention : l\'option pour le réel engage 3 ans.',
        });
      }
    }
    if (fon.actif && fon.regime === 'micro' && fon.comparatif && fon.comparatif.reel < fon.comparatif.micro) {
      add({
        horizon: 1, categorie: 'Foncier', priorite: 1,
        titre: 'Passez au régime réel foncier dès N+1',
        detail:
          'Vos charges réelles dépassent l\'abattement de 30 % du micro-foncier. L\'option se prend simplement en déposant ' +
          'une 2044 (engagement 3 ans).',
        gain: Math.round(Math.max(0, fon.comparatif.micro - fon.comparatif.reel) * tauxPatrimoine),
      });
    }

    /* ================= LMNP ================= */
    const lm = f.lmnp;
    if (lm.actif && lm.regime === 'reel') {
      const stock = lm.reportAmortissements || 0;
      if (stock > 0) {
        const beneficeAnnuel = Math.max(1, (lm.details.reel && lm.details.reel.resultatAvantAmort) || 1);
        const annees = Math.min(15, Math.ceil(stock / beneficeAnnuel));
        add({
          horizon: 0, categorie: 'LMNP', priorite: 2,
          titre: `Amortissements en réserve : vos loyers meublés resteront non imposés ≈ ${annees} an(s) de plus`,
          detail:
            `${Math.round(stock).toLocaleString('fr-FR')} € d'amortissements non encore déduits (art. 39 C) se reporteront sans limite ` +
            'sur vos bénéfices meublés futurs. Pensez aussi à amortir tout nouveau mobilier ou travaux. ' +
            'Si une revente est envisagée : depuis le 15/02/2025, les amortissements déduits majorent la plus-value imposable — arbitrez date de vente vs années d\'économie.',
        });
      }
      if (U.n(state.lmnp.loyers) > 0 && (lm.netImposable || 0) === 0) {
        add({
          horizon: 0, categorie: 'LMNP', priorite: 2,
          titre: 'Base LMNP à zéro : vérifiez chaque année que le réel reste optimal',
          detail:
            'Vos amortissements effacent le bénéfice imposable (0 € d\'IR et 0 € de prélèvements sociaux sur ces loyers). ' +
            'Conservez liasse 2031 et registre des immobilisations ; renouvelez mobilier/travaux pour prolonger l\'effet.',
        });
      }
    }
    if (lm.actif && lm.regime === 'micro' && lm.comparatif && lm.comparatif.reel < lm.comparatif.micro) {
      add({
        horizon: 1, categorie: 'LMNP', priorite: 1,
        titre: 'Passez au réel LMNP en N+1 : vos amortissements dépassent l\'abattement micro',
        detail:
          'L\'option pour le réel se prend avant la date limite de dépôt de la déclaration (immatriculation SIRET nécessaire). ' +
          'Gain récurrent estimé ci-contre (IR + 17,2 % de prélèvements sociaux).',
        gain: Math.round(Math.max(0, lm.comparatif.micro - lm.comparatif.reel) * tauxPatrimoine),
      });
    }

    /* ================= Pinel / Denormandie : échéancier ================= */
    const pin = state.dispositifs.pinel;
    if (pin && pin.actif && U.n(pin.base) > 0) {
      const annuites = [0, 1, 2, 3].map((k) =>
        DFISC.dispositifs.pinel(pin, P, anneeN + k)
      );
      const montantN = annuites[0] ? annuites[0].montant : 0;
      for (let k = 1; k <= 3; k++) {
        const av = annuites[k];
        const montant = av ? av.montant : 0;
        const precedent = annuites[k - 1] ? annuites[k - 1].montant : 0;
        if (montant === 0 && precedent > 0) {
          add({
            horizon: k, categorie: 'Pinel', priorite: 1,
            titre: `${anneeN + k} : fin de votre réduction Pinel/Denormandie (−${Math.round(precedent).toLocaleString('fr-FR')} €/an)`,
            detail:
              'Anticipez : proroger l\'engagement si vous n\'êtes pas au maximum (6→9→12 ans), basculer le logement en meublé ' +
              '(LMNP réel : les amortissements prennent le relais), le louer nu au réel, ou le vendre. ' +
              'Prévoyez aussi un levier de remplacement (PER, déficit foncier…) pour lisser la hausse d\'impôt.',
          });
          break;
        } else if (precedent - montant > 100) {
          add({
            horizon: k, categorie: 'Pinel', priorite: 2,
            titre: `${anneeN + k} : votre réduction Pinel passe de ${Math.round(precedent).toLocaleString('fr-FR')} € à ${Math.round(montant).toLocaleString('fr-FR')} €/an (prorogation à taux réduit)`,
            detail:
              'La période prorogée est moins rémunératrice : c\'est le moment de comparer avec une bascule en location meublée ' +
              'ou d\'activer un autre levier pour compenser la différence.',
          });
        }
      }
      if (montantN > 0 && f.reductionsPerdues > 0.5) {
        add({
          horizon: 1, categorie: 'Pinel', priorite: 1,
          titre: 'Votre réduction Pinel dépasse votre impôt : la fraction non imputée est PERDUE',
          detail:
            'La réduction Pinel n\'est ni remboursable ni reportable. Réduisez les autres réductions non remboursables ou ' +
            'les déductions (PER) l\'an prochain pour laisser assez d\'impôt à absorber.',
        });
      }
    }

    /* ================= Plafonnement des niches ================= */
    const plaf = f.plafonnement;
    if (plaf.reprise > 0.5) {
      add({
        horizon: 1, categorie: 'Niches', priorite: 1,
        titre: `Plafonnement dépassé : ${Math.round(plaf.reprise).toLocaleString('fr-FR')} € d'avantages perdus — décalez des investissements vers ${anneeN + 1}`,
        detail:
          'FCPI/FIP, souscriptions PME, Sofica et investissements immobiliers déclenchant la réduction peuvent souvent être ' +
          'signés en début d\'année suivante plutôt qu\'en fin d\'année : vous récupérez un plafond de 10 000 € (18 000 € outre-mer/Sofica) tout neuf.',
        gain: Math.round(plaf.reprise),
      });
    } else if (f.irNet > 500) {
      const marge = Math.max(0, plaf.plafondApplicable - plaf.total);
      if (marge > 500) {
        add({
          horizon: 0, categorie: 'Niches', priorite: 3,
          titre: `Capacité de défiscalisation restante : ≈ ${Math.round(marge).toLocaleString('fr-FR')} €/an d'avantages dans le plafonnement`,
          detail:
            `Votre impôt résiduel (${Math.round(Math.max(0, f.irNet)).toLocaleString('fr-FR')} €) laisse de la place : ` +
            'FCPI 25 %, IR-PME 18-50 %, forêt 25 %… (dans le plafond de 10 000 €) — et au-delà, Sofica 48 % ou Girardin ' +
            '(plafond porté à 18 000 €). N\'investissez jamais uniquement pour l\'avantage fiscal : regardez le risque de perte en capital.',
        });
      }
    }
    if (f.irNet > 4000 && !(state.dispositifs.girardin && U.n(state.dispositifs.girardin.reduction) > 0) && tmi >= 0.3) {
      const capacite = Math.max(0, (P.NICHES.plafondMajore - plaf.total) / P.NICHES.girardinRetenue.industriel_pd);
      const utilisable = Math.min(capacite, Math.max(0, f.irNet));
      if (utilisable > 2500) {
        add({
          horizon: 0, categorie: 'Niches', priorite: 3,
          titre: `Girardin industriel : jusqu'à ≈ ${Math.round(utilisable / 500) * 500} € d'IR effaçables chaque année (rendement ~10 %)`,
          detail:
            'Réduction « one-shot » supérieure au versement (vous versez ~90 % de la réduction obtenue), comptée pour 44 % ' +
            'seulement dans le plafonnement porté à 18 000 €. À réserver aux impôts élevés, uniquement via des monteurs agréés ' +
            'avec garantie de bonne fin (risque de reprise fiscale sinon).',
        });
      }
    }

    /* ================= Réductions perdues / dons ================= */
    if (f.reductionsPerdues > 0.5) {
      add({
        horizon: 1, categorie: 'Réductions', priorite: 1,
        titre: `${Math.round(f.reductionsPerdues).toLocaleString('fr-FR')} € de réductions perdues cette année : étalez sur ${anneeN + 1}-${anneeN + 3}`,
        detail:
          'Les réductions non remboursables (Pinel, PME, Sofica…) ne s\'imputent que sur l\'impôt de l\'année. ' +
          'Fractionnez les investissements pour caler chaque année la réduction sur votre impôt réel. ' +
          '(Les dons, eux, se reportent automatiquement 5 ans ; les crédits d\'impôt sont remboursés quoi qu\'il arrive.)',
      });
    }
    const dons66 = f.avantages && f.avantages.find((a) => a.cle === 'dons66');
    if (dons66 && U.n(state.dons.general) + Math.max(0, U.n(state.dons.urgence) - P.DONS.plafondUrgence) > f.rni * P.DONS.plafondPctRNI) {
      add({
        horizon: 1, categorie: 'Dons', priorite: 2,
        titre: 'Dons au-delà de 20 % du revenu : l\'excédent se reporte automatiquement (5 ans)',
        detail: 'Reportez l\'excédent cases 7XS à 7XY les années suivantes — pensez à le suivre, il n\'est pas prérempli.',
      });
    }

    /* ================= Hauts revenus ================= */
    if (f.cehr > 0) {
      add({
        horizon: 0, categorie: 'Hauts revenus', priorite: 2,
        titre: 'CEHR : lissez les revenus exceptionnels et pensez au système du quotient',
        detail:
          'La contribution (3-4 %) se calcule sur le revenu fiscal de référence : étalez cessions et primes exceptionnelles ' +
          'sur deux années, utilisez le quotient (art. 163-0 A) pour les revenus exceptionnels, et vérifiez la CDHR ' +
          '(imposition minimale de 20 % au-delà de 250 k€/500 k€).',
      });
    }

    /* ================= Divers récurrents ================= */
    if (f.totalCredits > 0 && f.irNet <= 0) {
      add({
        horizon: 0, categorie: 'Crédits', priorite: 3,
        titre: 'Vos crédits d\'impôt restent remboursés même sans impôt — et l\'avance de 60 % arrive en janvier',
        detail:
          'Emploi à domicile, garde d\'enfants, syndicats : crédits remboursables (contrairement aux réductions). ' +
          'L\'administration verse en janvier une avance de 60 % basée sur l\'année précédente — déclarez vite tout changement ' +
          'pour éviter une régularisation. Pour l\'emploi à domicile, activez le service CESU+ / avance immédiate.',
      });
    }

    /* Tri : priorité puis gain décroissant */
    conseils.sort((a, b) => a.priorite - b.priorite || (b.gain || 0) - (a.gain || 0));
    const potentiel = conseils.reduce((s, c) => s + (c.gain || 0), 0);
    return { conseils, potentiel, anneeN };
  }

  DFISC.conseiller = { generer };
})(typeof globalThis !== 'undefined' ? globalThis : this);
