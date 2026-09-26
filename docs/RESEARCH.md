# De prototypes à résultats mesurés

## Hypothèses

**H1 / Contract Graph.** Des jugements sémantiques atomiques à faible coût peuvent filtrer les paires candidates sans augmenter le taux de fausses équivalences. L’optimisation des paiements reste déterministe. La preuve est conditionnelle à la justesse de la normalisation, jamais à la confiance déclarée d’un modèle.

**H2 / Exposure Radar.** La classification d’annonces reliée à un graphe documenté peut améliorer le rappel des expositions indirectes à taux de fausses alertes fixé. Une meilleure classification ne compense pas un graphe incomplet.

**H3 / Resolution Radar.** La comparaison guidée par champs normalisés et extraits vérifiables peut réduire les erreurs de lecture des clauses et rendre visibles des scénarios de divergence, sans attribuer à Jev la décision finale sur l’identité des contrats ou leur règlement.

## Expérience Resolution Radar

1. Constituer des paires de clauses archivées, avec textes originaux, versions, extraits par champ et revue indépendante des normalisations. Inclure changements de source, fin de fenêtre, égalité de seuil, observation terminale et clauses d’annulation.
2. Mesurer séparément la justesse des jugements Jev (même actif, même source, exceptions compatibles), la justesse des champs normalisés revus et la compréhension humaine du scénario de divergence. Une réponse très concentrée mais fausse reste une erreur.
3. Rejouer des trajectoires synthétiques où les issues sont connues, puis tester les entrées incomplètes : absence de franchissement sans trajectoire complète et observation terminale manquante doivent rester inconnues.
4. Comparer le temps et les erreurs de revue avec ou sans radar sur les mêmes paires, avec ordre randomisé et sans montrer la sortie attendue aux évaluateurs.

## Expérience Contract Graph

1. Collecter et figer les clauses, versions, sources de résolution, carnets et horodatages de réception. Ne pas reconstruire une disponibilité passée à partir d’une page actuelle.
2. Constituer un jeu initial d’au moins 200 paires annotées, avec ambiguïtés, sources différentes, annulations, égalités de seuil et fenêtres différentes. Ce nombre est une cible de démarrage, pas un calcul de puissance statistique.
3. Faire relire les labels et conserver les désaccords. Séparer les familles d’événements et les périodes entre réglage et test, afin d’éviter les quasi-doublons.
4. Comparer : règles seules ; recherche textuelle + règles ; modèle génératif + même moteur de paiement ; Jev + même moteur. Figer les questions, le modèle et les seuils avant le test réservé.
5. Mesurer précision des relations acceptées, rappel, abstention, Brier par question, latence p50/p95, coût par paire correctement validée et proportion d’opportunités encore présentes à l’arrivée de la décision.
6. Simuler les deux jambes avec barèmes effectifs, profondeur, exécutions partielles et capital immobilisé. Les contrats non binaires et les résolutions litigieuses nécessitent leurs propres états.

Ne retenir l’intégration Jev que si elle améliore le compromis coût/erreur à couverture comparable. Un résultat positif sur clauses ne démontre pas une rentabilité. La validation économique doit être prospective, après gel de la politique et avec intervalles d’incertitude.

## Expérience Exposure Radar

1. Commencer par une chaîne et trois protocoles dont les dépendances et snapshots historiques peuvent être documentés. Ne pas déduire les expositions d’une seule liste de tokens ou de la TVL.
2. Archiver annonces premières sources, heure de publication, heure d’observation, confirmations et démentis. Inclure maintenances, rétrospectives et rumeurs non confirmées.
3. Définir la vérité terrain séparément pour la classification du texte et pour la réalité opérationnelle de l’incident. Une phrase qui affirme une confirmation n’est pas une preuve indépendante.
4. Comparer détection par mots-clés, règles de correspondance directe, Jev + graphe, modèle génératif + même graphe.
5. Mesurer faux signalements par portefeuille/jour, incidents manqués, délai depuis la première information accessible, rappel des chemins d’exposition et coût d’analyse. Publier les erreurs par type, sans les cacher dans un score agrégé.
6. Quantifier les trous de couverture et versionner les liens avec `validFrom`/`validTo`. Les boucles de collatéral demandent un modèle spécialisé, absent du prototype.

## Statut à la livraison

- Moteurs déterministes, imports, export de dossiers, interface et tests : implémentés.
- Découverte publique et adaptateur Jev : implémentés ; leur disponibilité dépend du réseau et de la clé.
- Carnets live, normalisation assistée avec validation interactive, ingestion des positions on-chain et flux d’incidents : à construire.
- Corpus réel annoté, évaluation Jev live, comparaisons de modèles et validation économique prospective : non réalisés.
- Aucun ordre ni transaction financière n’est implémenté.
