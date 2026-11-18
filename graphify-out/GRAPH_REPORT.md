# Graph Report - GIOCO F1  (2026-11-18)

## Corpus Check
- 34 files · ~38,699 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .glb 1)

## Summary
- 357 nodes · 854 edges · 13 communities (11 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f67ad1a9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Graphify Knowledge Graph Rules
- Prompt per Antigravity — Gioco di F1 realistico (web app 3D)
- package.json
- constants.js
- SceneManager
- main.js
- CareerStorage.js
- initGame
- main.js
- test_track.js
- TimingSystem.js
- WorldState.js

## God Nodes (most connected - your core abstractions)
1. `initGame()` - 40 edges
2. `RoomManager` - 24 edges
3. `WorldState` - 23 edges
4. `MenuManager` - 23 edges
5. `HudOverlay` - 20 edges
6. `SceneManager` - 17 edges
7. `queryTrackSurface()` - 16 edges
8. `createDefaultCareerState()` - 15 edges
9. `InputManager` - 14 edges
10. `buildTrackMeshGroup()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `initGame()` --calls--> `SceneManager`  [EXTRACTED]
  src/main.js → src/rendering/SceneManager.js
- `initGame()` --calls--> `WorldState`  [EXTRACTED]
  src/main.js → src/core/WorldState.js
- `initGame()` --calls--> `TrackMapHud`  [EXTRACTED]
  src/main.js → src/ui/TrackMapHud.js
- `initGame()` --calls--> `MenuManager`  [EXTRACTED]
  src/main.js → src/ui/MenuManager.js
- `initGame()` --calls--> `HudOverlay`  [EXTRACTED]
  src/main.js → src/ui/HudOverlay.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Query CLI Commands** — claude_graphify_query, claude_graphify_path, claude_graphify_explain, claude_graphify_section [EXTRACTED 1.00]

## Communities (13 total, 2 thin omitted)

### Community 0 - "Graphify Knowledge Graph Rules"
Cohesion: 0.24
Nodes (10): graphify-out/graph.json, graphify-out/GRAPH_REPORT.md, Graphify Knowledge Graph Rules, graphify explain, graphify-out/, graphify path, graphify query, graphify section (+2 more)

### Community 1 - "Prompt per Antigravity — Gioco di F1 realistico (web app 3D)"
Cohesion: 0.13
Nodes (14): 1. Ruolo e obiettivo, 2. Come lavoriamo (regole di processo), 3. Scelte tecniche già decise, 4.1 Modalità di gioco, 4.2 Weekend di gara (carriera e multigiocatore), 4.3 Tempi e micro settori, 4.4 Vetture, piste e piloti, 4.5 Fisica realistica (+6 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (15): dependencies, peerjs@^1.5.5, three@^0.170.0, devDependencies, vite@^6.0.0, name, private, scripts (+7 more)

### Community 3 - "constants.js"
Cohesion: 0.13
Nodes (27): CANDIDATE_LANES, clamp(), computeBotInput(), computeChordCurvature(), normalizeAngle(), sampleTrackAtArcDistance(), getCarSpecsForLevel(), ADVANCED_PHYSICS_CONFIG (+19 more)

### Community 4 - "SceneManager"
Cohesion: 0.06
Nodes (32): three, buildTemplateFromGltfScene(), createF1CarMesh(), createWheelAssembly(), ensureGlbTemplateLoaded(), isDefaultFerrariRed(), pendingUpgrades, splitGeometryByWheelQuadrant() (+24 more)

### Community 5 - "main.js"
Cohesion: 0.20
Nodes (5): LOCAL_PLAYER_ID, ARROW_CODES, MOVEMENT_CODES, MONZA_TRACK_DATA, TrackMapHud

### Community 6 - "CareerStorage.js"
Cohesion: 0.09
Nodes (35): calculateRacePrize(), CAREER_STORAGE_KEY, clampByte(), clampUnit(), clampUpgrade(), createDefaultCareerState(), deriveDriverCode(), DIFFICULTY_PRIZE_MULTIPLIER (+27 more)

### Community 7 - "initGame"
Cohesion: 0.10
Nodes (7): GameLoop, InputManager, initGame(), generateRoomCode(), getBrokerPeerId(), normalizeRoomCode(), RoomManager

### Community 8 - "main.js"
Cohesion: 0.15
Nodes (8): formatCurrencyEUR(), formatDeltaTime(), formatLapTime(), formatSectorTime(), formatTimerMMSS(), getDeltaColorClass(), getRpmBarColor(), HudOverlay

### Community 10 - "TimingSystem.js"
Cohesion: 0.15
Nodes (21): COLLISION_CONFIG, resolveCarToCarCollisions(), resolveTrackBarrierCollision(), updateCarLocalVelocityFromWorld(), buildSplitTimes(), clamp(), computeBaselineSectors(), createCarTimingState() (+13 more)

### Community 11 - "WorldState.js"
Cohesion: 0.11
Nodes (23): DEFAULT_DIFFICULTY_ID, DIFFICULTY_LEVELS, F1_2026_DRIVERS, F1_2026_TEAMS, RACE_TOTAL_LAPS, cloneCarTiming(), cloneQualifyingState(), cloneSessionTiming() (+15 more)

## Knowledge Gaps
- **5 isolated node(s):** `graphify explain`, `graphify path`, `graphify section`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 65 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `initGame()` connect `initGame` to `SceneManager`, `main.js`, `CareerStorage.js`, `main.js`, `TimingSystem.js`, `WorldState.js`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `initGame()` (e.g. with `.start()` and `.advanceQualifyingToNextStage()`) actually correct?**
  _`initGame()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify explain`, `graphify path`, `graphify section` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prompt per Antigravity — Gioco di F1 realistico (web app 3D)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `MenuManager` connect `CareerStorage.js` to `main.js`, `initGame`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._
- **Why does `HudOverlay` connect `main.js` to `main.js`, `initGame`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._