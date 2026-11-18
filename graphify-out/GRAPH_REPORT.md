# Graph Report - GIOCO F1  (2026-11-18)

## Corpus Check
- 62 files · ~78,504 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .glb 1)

## Summary
- 498 nodes · 1127 edges · 16 communities (14 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1d772745`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Graphify Knowledge Graph Rules
- Prompt per Antigravity — Gioco di F1 realistico (web app 3D)
- package.json
- constants.js
- SceneManager
- index.js
- CareerStorage.js
- initGame
- main.js
- test_track.js
- WorldState.js
- TrackBuilder.js
- Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica
- ModalManager
- UiTheme.js

## God Nodes (most connected - your core abstractions)
1. `initGame()` - 50 edges
2. `MenuManager` - 37 edges
3. `RoomManager` - 24 edges
4. `WorldState` - 23 edges
5. `HudOverlay` - 22 edges
6. `ModalManager` - 21 edges
7. `SceneManager` - 21 edges
8. `queryTrackSurface()` - 16 edges
9. `buildTrackMeshGroup()` - 15 edges
10. `createDefaultCareerState()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `convertGeoJsonToControlPoints()` --calls--> `createTrackSurface()`  [EXTRACTED]
  scripts/generate_f1_2026_tracks.mjs → src/tracks/TrackSurface.js
- `initGame()` --calls--> `MenuManager`  [EXTRACTED]
  src/main.js → src/ui/MenuManager.js
- `initGame()` --calls--> `ModalManager`  [EXTRACTED]
  src/main.js → src/ui/ModalManager.js
- `initGame()` --calls--> `SceneManager`  [EXTRACTED]
  src/main.js → src/rendering/SceneManager.js
- `initGame()` --calls--> `WorldState`  [EXTRACTED]
  src/main.js → src/core/WorldState.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Query CLI Commands** — claude_graphify_query, claude_graphify_path, claude_graphify_explain, claude_graphify_section [EXTRACTED 1.00]

## Communities (16 total, 2 thin omitted)

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
Cohesion: 0.12
Nodes (29): CANDIDATE_LANES, clamp(), computeBotInput(), computeChordCurvature(), normalizeAngle(), sampleTrackAtArcDistance(), getCarSpecsForLevel(), ADVANCED_PHYSICS_CONFIG (+21 more)

### Community 4 - "SceneManager"
Cohesion: 0.06
Nodes (20): three, buildTemplateFromGltfScene(), createF1CarMesh(), createWheelAssembly(), ensureGlbTemplateLoaded(), isDefaultFerrariRed(), pendingUpgrades, splitGeometryByWheelQuadrant() (+12 more)

### Community 5 - "index.js"
Cohesion: 0.06
Nodes (27): ABU_DHABI_TRACK_DATA, AUSTIN_TRACK_DATA, AUSTRIA_TRACK_DATA, BAHRAIN_TRACK_DATA, BAKU_TRACK_DATA, BARCELONA_TRACK_DATA, HUNGARORING_TRACK_DATA, CALENDAR_2026_TRACKS (+19 more)

### Community 6 - "CareerStorage.js"
Cohesion: 0.07
Nodes (39): calculateRacePrize(), CAREER_STORAGE_KEY, clampByte(), clampUnit(), clampUpgrade(), createDefaultCareerState(), deriveDriverCode(), DIFFICULTY_PRIZE_MULTIPLIER (+31 more)

### Community 7 - "initGame"
Cohesion: 0.09
Nodes (9): GameLoop, ARROW_CODES, InputManager, MOVEMENT_CODES, initGame(), generateRoomCode(), getBrokerPeerId(), normalizeRoomCode() (+1 more)

### Community 8 - "main.js"
Cohesion: 0.14
Nodes (8): formatCurrencyEUR(), formatDeltaTime(), formatLapTime(), formatSectorTime(), formatTimerMMSS(), getDeltaColorClass(), getRpmBarColor(), HudOverlay

### Community 11 - "WorldState.js"
Cohesion: 0.10
Nodes (25): COLLISION_CONFIG, F1_2026_DRIVERS, F1_2026_TEAMS, RACE_TOTAL_LAPS, cloneCarTiming(), cloneQualifyingState(), cloneSessionTiming(), WorldState (+17 more)

### Community 13 - "TrackBuilder.js"
Cohesion: 0.07
Nodes (36): CALENDAR_2026_SPECS, convertGeoJsonToControlPoints(), __dirname, formatIndexModule(), formatTrackModule(), main(), OUT_DIR, computeStartingGridTransforms() (+28 more)

### Community 14 - "Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica"
Cohesion: 0.08
Nodes (23): 10. Vincoli importanti, 1. Ruolo e obiettivo, 2. Come lavoriamo (regole di processo), 3. Modifica 1 — Pop up al centro dello schermo, 4. Modifica 2 — Animazioni fluide, 5. Modifica 3 — Finestra tempi / delta / nomi più lunga in verticale, 6.1 Linguaggio visivo da riprodurre, 6.2 Schermate di riferimento (adattale alle mie modalità e funzioni già esistenti) (+15 more)

### Community 15 - "ModalManager"
Cohesion: 0.20
Nodes (4): isElement(), isHtmlBtn(), isHtmlEl(), ModalManager

### Community 16 - "UiTheme.js"
Cohesion: 0.26
Nodes (11): clampByte(), DEFAULT_KEY_HINTS, generateLowPolyBackgroundSvg(), hash2D(), mixRgb(), parseHexRgb(), renderKeyHints(), resolveHintRole() (+3 more)

## Knowledge Gaps
- **5 isolated node(s):** `graphify explain`, `graphify path`, `graphify section`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 101 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `initGame()` connect `initGame` to `SceneManager`, `index.js`, `CareerStorage.js`, `main.js`, `WorldState.js`, `TrackBuilder.js`, `ModalManager`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `initGame()` (e.g. with `.start()` and `.advanceQualifyingToNextStage()`) actually correct?**
  _`initGame()` has 35 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify explain`, `graphify path`, `graphify section` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prompt per Antigravity — Gioco di F1 realistico (web app 3D)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `MenuManager` connect `CareerStorage.js` to `initGame`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._
- **Why does `HudOverlay` connect `main.js` to `CareerStorage.js`, `initGame`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._