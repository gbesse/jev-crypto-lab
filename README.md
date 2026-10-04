# Jev Crypto Lab

Quatre prototypes de recherche en lecture seule, dans une application locale :

- **Contract Graph** : vérifier des implications entre contrats binaires normalisés, puis simuler l’achat des deux jambes sur des carnets fournis.
- **Resolution Radar** : comparer les clauses de deux contrats, rejouer une trajectoire hypothétique et calculer le paiement brut de positions saisies.
- **Contract Memory** : conserver des versions horodatées de marchés Gamma, afficher les différences de règles et les positions actuelles à examiner, puis enregistrer une revue humaine.
- **Exposure Radar** : retrouver les chemins entre incidents et positions, calculer une borne haute d’exposition, rejouer ce qui était connu à un instant donné.

Les moteurs sont fonctionnels sur des données importées. Le jeu initial est **entièrement fictif**. L’adaptateur Jev a été vérifié par une requête sur les clauses fictives de la démonstration ; il n’a pas été évalué sur un corpus réel annoté. Aucune performance de trading ou supériorité SOTA n’est revendiquée.

## Démarrer

Node.js 22 ou ultérieur. Aucune dépendance à installer.

```bash
git clone https://github.com/gbesse/jev-crypto-lab.git
cd jev-crypto-lab
npm start
```

Ouvrir <http://127.0.0.1:4317>. Le serveur écoute uniquement sur la boucle locale. `PORT=4318 npm start` permet de choisir un autre port.

Le projet est indépendant de `jev-proxy` et n’utilise aucune dépendance npm à l’exécution.

## Parcours de démonstration

1. **Contract Graph** : le scénario présente un candidat fictif, avec un plancher net conditionnel de **5,9462 USD pour 100 unités par jambe**. Ouvrir la preuve pour voir les trois états possibles, les frais supposés et les clauses revues. Passer les frais de 50 à 1 000 bps élimine le candidat.
2. **Resolution Radar** : deux contrats fictifs ont le même seuil BTC et des sources de résolution différentes. Le scénario place un index à 121 000 USD et l’autre à 119 000 USD ; le moteur calcule YES/NO, puis un résultat brut de **85 USD** pour les deux positions fictives saisies, hors frais. Modifier une mesure et cliquer sur **Analyser** montre immédiatement une autre issue. La revue de la paire est en attente tant qu’une personne n’a pas coché la case et renseigné sa trace.
3. **Contract Memory** : cliquer sur **Voir un exemple fictif** pour inspecter un changement de source de résolution et une position fictive. Revenir au suivi local pour saisir un ID Gamma réel ; l’ajout effectue immédiatement la première capture. Les exemples fictifs ne sont jamais archivés comme données réelles.
4. **Exposure Radar** : un portefeuille fictif de 35 000 USD a une exposition potentiellement concernée de 25 000 USD au maximum : 17 000 USD pour l’incident confirmé dans la fixture et 8 000 USD pour une allégation. Rejouer au `2026-09-21T09:00` UTC donne zéro incident actif connu ; à `10:30`, 17 000 USD.
5. **Sources & Jev** : consulter les catalogues publics ou soumettre des textes à Jev après configuration. Les données publiques et les jugements ne remplacent jamais silencieusement les fixtures ou les données importées.
6. **Exporter le dossier** : chaque module télécharge ses entrées, son résultat et la provenance synthétique/importée. Les dossiers Contract Graph et Exposure Radar peuvent être réimportés ; le dossier Resolution Radar peut être rejoué par l’API. Contract Memory exporte toutes les versions et revues de l’archive locale.

## Balayer les frais hors ligne

`npm run demo:friction` rejoue cinq hypothèses de frais sur les deux contrats fictifs de `data/demo.json`. Le tableau montre quand le plancher net conditionnel disparaît et pourquoi le candidat est écarté. Aucun carnet réel, ordre, clé Jev ni appel réseau ; le résultat n’est pas une promesse de gain exécutable.

## Brancher Jev

Copier `.env.example` vers `.env`, renseigner `TYPESAFE_API_KEY`, puis démarrer :

```bash
node --env-file=.env src/server.js
```

La clé reste côté serveur. L’interface envoie les textes saisis à TypeSafe seulement à la demande. Pour un incident, elle envoie aussi les noms des cibles du graphe courant. Ne coller que des informations autorisées à être transmises à ce fournisseur.

L’adaptateur utilise `POST https://api.typesafe.ai/v1/systemone`, avec `jev-1.13.0` par défaut. Il vérifie les options, les distributions, leur somme et le choix gagnant. Chaque reçu conserve l’empreinte SHA-256 de la requête, le modèle demandé/résolu, les probabilités et la latence. Un échec ne devient jamais un jugement fictif. La concentration `confidence` n’est ni une probabilité de gain ni une certification de vérité.

Jev propose des jugements atomiques (même événement, même source, exceptions compatibles ; cible, statut allégué dans le texte, type d’incident). **Il n’approuve pas la normalisation et ne modifie pas automatiquement le portefeuille.**

Dans Resolution Radar, le bouton **Comparer avec Jev** envoie uniquement les deux textes de clauses affichés et montre ses jugements séparément. La comparaison des champs normalisés, la déclaration de revue, les issues du scénario et les paiements sont calculés localement. Une réponse Jev, même très concentrée, n’active jamais la revue humaine.

Dans Contract Memory, **Demander une lecture Jev** envoie les champs de règle et de résolution des deux versions conservées. Jev classe séparément le déclencheur, la source et les exceptions. Cette lecture ne qualifie ni le marché comme « changé juridiquement », ni la position comme gagnante ou perdante ; la revue humaine reste explicite.

## Contract Memory

Saisir un ID numérique Gamma ou choisir un marché dans l’échantillon découvert, puis laisser le serveur local en marche. Chaque nouvel ID est capturé immédiatement. Les marchés suivis, au maximum 25, sont recapturés toutes les 15 minutes et au démarrage ; **Capturer maintenant** permet une capture manuelle. L’affichage s’actualise toutes les minutes lorsque le module est ouvert et qu’aucun formulaire n’est actif ; **Actualiser l’affichage** force la lecture de l’archive sans contacter Gamma. La liste reste fixe jusqu’à un ajout ou un retrait. Un échec source est signalé, sans version simulée. L’historique d’un marché retiré reste conservé.

Les données sont stockées dans le dossier `.memory/` du projet (ignoré par Git) : `watchlist.json` contient la liste et les positions déclarées, `snapshots.jsonl` les versions distinctes, et `reviews.jsonl` le journal append-only des revues. L’export JSON inclut tous les instantanés et toutes les revues ; le conserver pour sauvegarder l’archive. Chaque version garde les champs bruts utiles au règlement (question, description, source, dates, issues et configuration), l’URL source, l’heure de collecte et une empreinte SHA-256 vérifiée à la lecture. Cette empreinte détecte une altération locale des champs ; elle ne prouve pas que Polymarket a publié cette version. Les modifications du champ `updatedAt` seul ne créent pas une nouvelle version.

Le journal présente les valeurs avant/après et distingue champs de règle/résolution et autres métadonnées. L’heure affichée est celle de **première observation par cet outil**, pas l’heure effective de modification chez Polymarket. Il n’y a aucun historique avant la première capture. Une différence textuelle ne prouve pas à elle seule une modification juridiquement applicable ; la personne qui vérifie peut enregistrer une qualification et une note. Les revues précédentes restent dans l’archive lorsqu’une nouvelle revue est ajoutée.

Une position actuelle déclarée comporte le côté YES/NO, la quantité et le prix d’entrée. Le coût d’entrée associé à un marché modifié est affiché comme montant **potentiellement concerné**. Il ne représente ni une perte, ni la valeur actuelle, ni la position détenue historiquement au moment du changement. Les règles brutes ne suffisent pas à calculer le paiement ; utiliser Resolution Radar avec des clauses normalisées et revues pour un scénario de paiement hypothétique. Aucun ordre n’est transmis.

API locale : `GET /api/memory`, `GET /api/memory/demo` ; `POST /api/memory/add`, `/remove`, `/position`, `/review`, `/capture`, `/judge`. Les corps POST sont en JSON. Le jugement Jev reçoit un identifiant de changement conservé, jamais un texte arbitraire fourni au moment de l’appel.

## Resolution Radar

Le module utilise les contrats chargés dans Contract Graph. Il compare `asset`, `source`, `currency`, `settlement`, `voidPolicy`, `kind`, `comparator`, `threshold`, `start` et `end` côte à côte ; une différence est un écart entre **champs normalisés fournis**, pas une différence extraite et certifiée du texte brut. Un contrat peut fournir `clauseEvidence` avec des extraits par nom de champ ; le moteur vérifie que chaque extrait cité figure réellement dans `rulesText`. Les textes originaux et les preuves de revue de chaque contrat restent consultables.

Le scénario contient des mesures `source`, `at`, `value`. Pour `anytime`, un franchissement observé suffit à produire YES. Une absence de franchissement ne produit NO que si la trajectoire hypothétique est déclarée complète ; sinon l’issue est inconnue. Pour `terminal`, il faut une mesure à l’instant exact de fin. Le moteur ne déduit pas de trajectoire continue à partir de quelques points et ne vérifie pas que la déclaration de complétude est vraie.

Les positions contiennent `market`, `side`, `quantity` et `entryPrice`. Le résultat est le paiement binaire brut moins le coût saisi ; aucun frais, conversion, remboursement, risque de contrepartie ou exécution n’est modélisé. Si une issue manque, le dossier affiche un intervalle de résultat. La revue de la paire exige une note et deux contrats déjà marqués `reviewed` ; ces trois éléments restent des déclarations de l’utilisateur, pas des certifications indépendantes.

L’API locale accepte `POST /api/resolution` avec `markets` et les champs de `resolution` dans [data/demo.json](data/demo.json). Le dossier exporté contient cette entrée complète et la sortie du moteur.

## Importer des données

Utiliser les boutons de téléchargement d’exemple ou [data/demo.json](data/demo.json), puis importer l’objet `contracts` ou `exposure` correspondant.

### Contract Graph

Chaque marché contient : `id`, `title`, `rulesText`, `reviewed`, `reviewEvidence`, `normalized` et éventuellement `quotes.yes` / `quotes.no`.

`normalized` précise `asset`, `source`, `currency`, `settlement`, `voidPolicy`, `kind`, `comparator`, `threshold`, `start`, `end`. `reviewed: true` est une **déclaration du préparateur des données**, pas une vérification cryptographique ou une validation par le modèle. `reviewEvidence` doit décrire les clauses et la revue qui justifient cette déclaration.

Le moteur prend en charge `kind: anytime` (franchissement à un moment de la fenêtre) et `terminal` (valeur à la fin), et les comparateurs `gt` / `gte`. Une implication est dérivée de seuils et fenêtres emboîtés avec mêmes sources et clauses. Deux observations terminales de dates différentes ne sont pas comparées. Le seul règlement pris en charge est binaire 0/1, `voidPolicy: binary-only` ; les annulations et remboursements exigent une extension du modèle d’états.

Un carnet contient `observedAt` et `asks: [{price, size}]`. Les niveaux sont triés et consommés pour calculer le coût réel à la taille demandée. Les carnets futurs, trop vieux ou désynchronisés, les marchés échus et les profondeurs insuffisantes sont écartés. `feeBps` et `bufferBps` sont des hypothèses proportionnelles ; ils ne reproduisent pas le barème effectif d’une plateforme. Aucun routage d’ordre, aucune vente à découvert, aucun wallet, aucun profit garanti.

### Exposure Radar

- `nodes`: identifiant, nom, `coverageComplete` déclaré.
- `edges`: `from`, `to`, `kind`, `fraction`, `evidence`, `observedAt`.
- `positions`: identifiant de position, nœud détenu, `valueUsd`, `observedAt`.
- `incidents`: identifiant, cible, titre, `status` (`confirmed`, `alleged`, `benign`), preuve, `publishedAt`, `observedAt`, éventuellement `resolvedAt`.

Une `allocation` pondère la fraction détenue. Une `dependency` porte sur toute la branche (`fraction: 1`). Les fractions se multiplient le long des chemins. Les chemins et incidents peuvent se recouper : leur somme est plafonnée par position pour produire une **borne haute**, sans prétendre connaître exactement leurs intersections. Le résultat n’est pas une perte attendue.

Le graphe doit être acyclique ; les allocations sortantes ne dépassent pas 100 %. Les liens et incidents non encore observés sont exclus du replay. Les incidents résolus ou bénins sont exclus des alertes. Les valorisations sont celles fournies, pas des prix historiques reconstitués. Fournir un snapshot de graphe valable à l’instant étudié : cette version ne gère pas encore les changements d’allocation, les liens supprimés et leurs périodes de validité. `coverageComplete` est déclaratif ; aucun chemin connu ne prouve l’absence de risque.

## Connecteurs publics

- **Polymarket Gamma** : échantillon des 100 premiers marchés actifs, filtré par mots-clés crypto. Contract Memory lit ensuite chaque ID suivi via `GET /markets/{id}`. Règles brutes seulement, sans extraction automatique certifiée ni carnet live.
- **DeFiLlama** : 25 protocoles présents sur Ethereum, hors CEX, triés par TVL globale ; catalogue uniquement, sans inférence de dépendances à partir de la TVL.

Une erreur réseau est affichée sans fallback synthétique. Sur la machine de développement, `gamma-api.polymarket.com` et `polymarket.com` résolvent actuellement vers `offre-illegale.anj.fr`, qui présente un certificat TLS `*.anj.fr` expiré. La collecte Gamma réelle reste donc indisponible depuis cette connexion ; l’application ne contourne pas cette redirection et garde la vérification TLS active. La démo Contract Memory est explicitement fictive. Le catalogue DeFiLlama a été vérifié en direct dans l’interface. Les contrats des connecteurs et la capture de versions sont testés avec des réponses contrôlées ; la disponibilité réelle des services reste externe.

## Vérification et évaluation

```bash
npm test                  # moteurs, HTTP, adaptateurs et métriques
npm run check
npm run benchmark         # scénarios fonctionnels ; output/benchmark.json
npm run eval              # plan sans appel API
node --env-file=.env src/evaluate.js --live --max-calls 8
```

L’évaluation live réalise **au plus une requête par cas**, plafonnée par `--max-calls`, et peut entraîner des frais fournisseur. Le résultat est écrit dans `output/jev-evaluation.json`. Les labels ne sont pas envoyés au modèle. Les métriques comprennent exactitude, Brier multiclasse (somme des erreurs quadratiques par option), couverture au seuil de confiance et exactitude sur les réponses retenues, globalement et par question.

[data/eval.json](data/eval.json) contient seulement huit cas synthétiques : c’est un test de branchement, pas un benchmark indépendant ni une preuve de calibration. Remplacer par des textes réels annotés avant d’interpréter les scores. Une exécution interrompue échoue ; elle ne reprend pas les appels et ne conserve pas encore de checkpoint intermédiaire.

## Prochaine étape expérimentale

Le [protocole de recherche](docs/RESEARCH.md) définit les jeux de données, comparateurs et critères à mesurer avant toute revendication de supériorité.

Références : [API TypeSafe](https://docs.typesafe.ai/api), [limites Jev](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [Gamma](https://docs.polymarket.com/market-data/discover-markets), [DeFiLlama](https://api-docs.defillama.com/), [arbitrage combinatoire](https://arxiv.org/abs/2508.03474), [alignement sémantique](https://arxiv.org/abs/2601.01706).
