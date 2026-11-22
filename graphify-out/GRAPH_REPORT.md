# Graph Report - GIOCO F1  (2026-11-22)

## Corpus Check
- 86 files · ~138,318 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 27 file(s) not represented in the graph (top: .glb 14, .hdr 11, (none) 1)

## Summary
- 1360 nodes · 3823 edges · 71 communities (63 shown, 8 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 533 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fa171ab8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Graphify Knowledge Graph Rules
- Prompt per Antigravity — Gioco di F1 realistico (web app 3D)
- package.json
- MenuManager
- CarModel3D.js
- index.js
- WeatherAndTireFx
- initGame
- main.js
- test_track.js
- TimingSystem.js
- ha
- WorldState
- Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica
- WorldState.js
- draco_wasm_wrapper.js
- ma
- v
- TrackBuilder.js
- draco_decoder.js
- Vc
- AssetManager3D
- DaySkyDome
- TrackFloodlights
- fetch-cc0-assets.mjs
- createWasm
- ExceptionInfo
- asset-catalog.mjs
- GarageScene3D
- import-and-optimize-glbs.mjs
- Barrel_01
- nature
- generate_f1_2026_tracks.mjs
- CareerStorage.js
- c
- SceneManager.js
- callRuntimeCallbacks
- Crediti e Licenze Asset 3D
- scripts
- manifest.json
- ferrari
- SceneManager
- NightSky
- fern_02
- grass_medium_01
- garage
- CameraController
- TrackFloodlights
- hdri
- metal_tool_chest
- power_box_01
- security_camera_01
- steel_frame_shelves_01
- modular_chainlink_fence
- Importazione Modelli Sketchfab (Drop-in Automatico)
- textures
- asphalt_pit_lane
- coast_sand_01
- concrete_wall_007
- grass_004
- gravelly_sand
- metal_plate
- emscripten_realloc_buffer
- intArrayFromString
- TrackMapHud
- PhysicsDiagnostics.js
- Db
- build-custom-asphalt-pbr.mjs

## God Nodes (most connected - your core abstractions)
1. `ha()` - 234 edges
2. `ja()` - 144 edges
3. `Ka()` - 94 edges
4. `v()` - 79 edges
5. `initGame()` - 69 edges
6. `Na()` - 61 edges
7. `c()` - 50 edges
8. `e()` - 50 edges
9. `ma()` - 48 edges
10. `ih()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `6. Regole d'Oro & Vincoli per Claude / Agenti` --references--> `AssetManager3D`  [INFERRED]
  README.md → src/rendering/AssetManager3D.js
- `Cartella `src/`` --references--> `HudOverlay`  [INFERRED]
  README.md → src/ui/HudOverlay.js
- `Cartella `src/`` --references--> `RoomManager`  [INFERRED]
  README.md → src/network/RoomManager.js
- `Cartella `src/`` --references--> `WeatherAndTireFx`  [INFERRED]
  README.md → src/rendering/WeatherAndTireFx.js
- `Cartella `src/`` --references--> `SceneManager`  [INFERRED]
  README.md → src/rendering/SceneManager.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Query CLI Commands** — claude_graphify_query, claude_graphify_path, claude_graphify_explain, claude_graphify_section [EXTRACTED 1.00]

## Communities (71 total, 8 thin omitted)

### Community 0 - "Graphify Knowledge Graph Rules"
Cohesion: 0.24
Nodes (10): graphify-out/graph.json, graphify-out/GRAPH_REPORT.md, Graphify Knowledge Graph Rules, graphify explain, graphify-out/, graphify path, graphify query, graphify section (+2 more)

### Community 1 - "Prompt per Antigravity — Gioco di F1 realistico (web app 3D)"
Cohesion: 0.13
Nodes (14): 1. Ruolo e obiettivo, 2. Come lavoriamo (regole di processo), 3. Scelte tecniche già decise, 4.1 Modalità di gioco, 4.2 Weekend di gara (carriera e multigiocatore), 4.3 Tempi e micro settori, 4.4 Vetture, piste e piloti, 4.5 Fisica realistica (+6 more)

### Community 2 - "package.json"
Cohesion: 0.11
Nodes (22): dependencies, peerjs@^1.5.5, three@^0.170.0, devDependencies, draco3dgltf@^1.5.9, @gltf-transform/core@^4.5.1, @gltf-transform/extensions@^4.5.1, @gltf-transform/functions@^4.5.1 (+14 more)

### Community 3 - "MenuManager"
Cohesion: 0.06
Nodes (41): getRepresentativeDriverForTeam(), buildEntry(), createEmptyTrackRecord(), evaluateLapRecord(), evaluateSectorRecord(), getLapFieldForMode(), getTheoreticalBestLap(), getTrackRecord() (+33 more)

### Community 4 - "CarModel3D.js"
Cohesion: 0.08
Nodes (34): AI_DISTANT_HIDE_MATERIALS, AI_SKIP_BODY_MATERIALS, buildGlbDriverGroup(), buildTemplateFromGltfScene(), calibrateCarPbrMaterial(), CAR_VISUAL_CONFIG, clamp(), computeWheelAxleVector() (+26 more)

### Community 5 - "index.js"
Cohesion: 0.06
Nodes (27): ABU_DHABI_TRACK_DATA, AUSTIN_TRACK_DATA, AUSTRIA_TRACK_DATA, BAHRAIN_TRACK_DATA, BAKU_TRACK_DATA, BARCELONA_TRACK_DATA, HUNGARORING_TRACK_DATA, CALENDAR_2026_TRACKS (+19 more)

### Community 6 - "WeatherAndTireFx"
Cohesion: 0.10
Nodes (19): 1. Stack Tecnico & Comandi Rapidi, 2. Architettura a Layer, 3. Struttura Completa del Progetto, 4. Contenuti & Gameplay, 5. Stato Attuale dei Lavori (Roadmap), 6. Regole d'Oro & Vincoli per Claude / Agenti, A. `PIANO GRAFICA 3D` (Upgrade Asset 3D Ad Alta Risoluzione), B. `PIANO SUB-STEP 2` (Realismo Visivo Monoposto, Particelle & Cieli HDRI — 100% Estetico) (+11 more)

### Community 7 - "initGame"
Cohesion: 0.06
Nodes (14): GameLoop, ARROW_CODES, InputManager, MOVEMENT_CODES, initGame(), generateRoomCode(), getBrokerPeerId(), loadPeerClass() (+6 more)

### Community 8 - "main.js"
Cohesion: 0.12
Nodes (11): formatDeltaTime(), formatLapTime(), formatSectorTime(), extractDriverSurname(), formatTimerMMSS(), getDeltaColorClass(), getLogoClassName(), getRpmBarColor() (+3 more)

### Community 10 - "TimingSystem.js"
Cohesion: 0.16
Nodes (20): COLLISION_CONFIG, resolveCarToCarCollisions(), resolveTrackBarrierCollision(), updateCarLocalVelocityFromWorld(), buildSplitTimes(), clamp(), computeBaselineSectors(), createCarTimingState() (+12 more)

### Community 11 - "ha"
Cohesion: 0.04
Nodes (69): ha(), Ae(), ah(), Be(), bg(), bh(), bi(), Ce() (+61 more)

### Community 13 - "WorldState"
Cohesion: 0.14
Nodes (9): cloneCarTiming(), cloneQualifyingState(), cloneSessionTiming(), WorldState, createInitialRaceState(), getEffectiveTotalProgress(), updateRaceState(), createSessionTimingState() (+1 more)

### Community 14 - "Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica"
Cohesion: 0.08
Nodes (23): 10. Vincoli importanti, 1. Ruolo e obiettivo, 2. Come lavoriamo (regole di processo), 3. Modifica 1 — Pop up al centro dello schermo, 4. Modifica 2 — Animazioni fluide, 5. Modifica 3 — Finestra tempi / delta / nomi più lunga in verticale, 6.1 Linguaggio visivo da riprodurre, 6.2 Schermate di riferimento (adattale alle mie modalità e funzioni già esistenti) (+15 more)

### Community 15 - "WorldState.js"
Cohesion: 0.12
Nodes (32): CANDIDATE_LANE_FRACTIONS, clamp(), computeBotInput(), computeChordCurvature(), normalizeAngle(), sampleTrackAtArcDistance(), CAR_PHYSICS_CONFIG, FIXED_DT (+24 more)

### Community 17 - "draco_wasm_wrapper.js"
Cohesion: 0.07
Nodes (25): Yh(), A(), B(), C(), D(), E(), G(), H() (+17 more)

### Community 18 - "ma"
Cohesion: 0.14
Nodes (49): Ab(), ac(), ag(), Bb(), bc(), Cb(), cc(), Cf() (+41 more)

### Community 19 - "v"
Cohesion: 0.20
Nodes (45): $a(), Aa(), Ad(), ai(), Bd(), $c(), Cd(), $d() (+37 more)

### Community 20 - "TrackBuilder.js"
Cohesion: 0.25
Nodes (14): computeStartingGridTransforms(), addDistantHorizonHills(), addParkTrees(), buildBarrierGeometry(), buildBridgeDeckGeometry(), buildRibbonFromSamples(), buildTrackMeshGroup(), createAsphaltTexture() (+6 more)

### Community 21 - "draco_decoder.js"
Cohesion: 0.07
Nodes (24): AttributeOctahedronTransform(), AttributeQuantizationTransform(), AttributeTransformData(), castObject(), Decoder(), DecoderBuffer(), destroy(), DracoFloat32Array() (+16 more)

### Community 22 - "Vc"
Cohesion: 0.18
Nodes (30): Ba(), Ca(), Eb(), Eg(), Gc(), Hc(), ic(), If() (+22 more)

### Community 23 - "AssetManager3D"
Cohesion: 0.08
Nodes (15): 1. Ruolo & Obiettivo, 2. Problemi attuali da risolvere, 3. Vincoli & Regole Critiche (tassativi), 4. Workflow Operativo (tutto in un colpo), 5. Formato di Output, 6. Criteri di accettazione, A. Cupola celeste notturna procedurale (stelle, Luna, Via Lattea), B. Alone luminoso all'orizzonte (light pollution) (+7 more)

### Community 25 - "TrackFloodlights"
Cohesion: 0.22
Nodes (3): computeFloodlightTowers(), createLightPoolTexture(), TrackFloodlights

### Community 26 - "fetch-cc0-assets.mjs"
Cohesion: 0.22
Nodes (15): ASSETS_ROOT, __dirname, downloadAmbientCgTexture(), downloadPolyHavenHdri(), downloadPolyHavenModel(), downloadPolyHavenTexture(), downloadToFile(), fetchWithRetry() (+7 more)

### Community 27 - "createWasm"
Cohesion: 0.16
Nodes (17): abort(), _abort(), addOnInit(), addRunDependency(), assert(), createWasm(), instantiateArrayBuffer(), instantiateAsync() (+9 more)

### Community 29 - "asset-catalog.mjs"
Cohesion: 0.22
Nodes (14): AMBIENTCG_TEXTURES, findExistingFile(), inspectGlbJsonChunk(), inspectGltfMetadata(), POLYHAVEN_HDRIS, POLYHAVEN_MODELS, POLYHAVEN_TEXTURES, rebuildManifestAndCredits() (+6 more)

### Community 31 - "import-and-optimize-glbs.mjs"
Cohesion: 0.20
Nodes (10): ASSETS_ROOT, createOptimizerContext(), CRITICAL_FERRARI_MATERIALS, __dirname, __filename, FORCE, IMPORT_DIR, main() (+2 more)

### Community 32 - "Barrel_01"
Cohesion: 0.18
Nodes (11): draco, format, path, sizeBytes, track, draco, format, path (+3 more)

### Community 33 - "nature"
Cohesion: 0.18
Nodes (11): nature, draco, format, path, sizeBytes, namaqualand_boulder_02, rock_moss_set_01, draco (+3 more)

### Community 34 - "generate_f1_2026_tracks.mjs"
Cohesion: 0.27
Nodes (7): CALENDAR_2026_SPECS, convertGeoJsonToControlPoints(), __dirname, formatIndexModule(), formatTrackModule(), main(), OUT_DIR

### Community 35 - "CareerStorage.js"
Cohesion: 0.13
Nodes (31): calculateRacePrize(), CAREER_STORAGE_KEY, clampByte(), clampUnit(), clampUpgrade(), createDefaultCareerState(), deriveDriverCode(), DIFFICULTY_PRIZE_MULTIPLIER (+23 more)

### Community 36 - "c"
Cohesion: 0.12
Nodes (22): c(), $b(), Bf(), Cg(), Df(), Dg(), Hd(), Ib() (+14 more)

### Community 37 - "SceneManager.js"
Cohesion: 0.13
Nodes (14): DAY_TRACK_RANDOM_POOL, DEFAULT_SKY_PRESET_OPTION, getNextWeatherCyclePreset(), isNightCircuit(), loadSavedSkyPresetOption(), NIGHT_CIRCUIT_IDS, NIGHT_TRACK_RANDOM_POOL, PURE_SKY_HDR_SUN_HEADING_RAD (+6 more)

### Community 38 - "callRuntimeCallbacks"
Cohesion: 0.32
Nodes (8): addOnPostRun(), addOnPreRun(), callRuntimeCallbacks(), initRuntime(), postRun(), preRun(), run(), doRun()

### Community 39 - "Crediti e Licenze Asset 3D"
Cohesion: 0.33
Nodes (5): 1. Texture PBR 2K — Poly Haven & AmbientCG (CC0 Public Domain), 2. HDRI Sky & Environment Reflections — Poly Haven (CC0 Public Domain), 3. Modelli 3D Natura, Pista & Officina — Poly Haven (CC0 Public Domain), 4. Monoposto, Piloti e Garage F1 — Sketchfab (CC-BY / CC-BY-NC-SA), Crediti e Licenze Asset 3D

### Community 40 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, assets:fetch-cc0, assets:import, build, dev, preview

### Community 41 - "manifest.json"
Cohesion: 0.33
Nodes (5): dracoDecoderPath, drivers, garage, generatedAt, version

### Community 42 - "ferrari"
Cohesion: 0.33
Nodes (6): cars, ferrari, draco, path, sizeBytes, source

### Community 43 - "SceneManager"
Cohesion: 0.14
Nodes (6): getNightQualityConfig(), SceneManager, BIOME_PRESETS, getTrackBiomeConfig(), NIGHT_URBAN_OVERRIDES, TRACK_BIOME_MAP

### Community 44 - "NightSky"
Cohesion: 0.30
Nodes (5): computeGalacticBasis(), computeMoonDirection(), degToRad(), mulberry32(), NightSky

### Community 45 - "fern_02"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, fern_02

### Community 46 - "grass_medium_01"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, grass_medium_01

### Community 47 - "garage"
Cohesion: 0.25
Nodes (8): draco, format, path, sizeBytes, Drill_01, models, garage, optional

### Community 48 - "CameraController"
Cohesion: 0.22
Nodes (5): CAMERA_MODES, CAMERA_FEEL_CONFIG, CameraController, clamp(), MAX_ONBOARD_HORIZON_PITCH_RAD

### Community 49 - "TrackFloodlights"
Cohesion: 0.15
Nodes (17): three, assetManager3D, AUTO_QUALITY_FALLBACK, DEFAULT_NIGHT_QUALITY, FLOODLIGHT_PARAMS, getLowerNightQuality(), getNightCircuitProfile(), loadSavedNightQuality() (+9 more)

### Community 50 - "hdri"
Cohesion: 0.15
Nodes (13): hdri, clear_day, cloudy_sunset, dry, heavy_rain, night, night_clear, overcast (+5 more)

### Community 51 - "metal_tool_chest"
Cohesion: 0.40
Nodes (5): metal_tool_chest, draco, format, path, sizeBytes

### Community 52 - "power_box_01"
Cohesion: 0.40
Nodes (5): power_box_01, draco, format, path, sizeBytes

### Community 53 - "security_camera_01"
Cohesion: 0.40
Nodes (5): security_camera_01, draco, format, path, sizeBytes

### Community 54 - "steel_frame_shelves_01"
Cohesion: 0.40
Nodes (5): steel_frame_shelves_01, draco, format, path, sizeBytes

### Community 55 - "modular_chainlink_fence"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, modular_chainlink_fence

### Community 56 - "Importazione Modelli Sketchfab (Drop-in Automatico)"
Cohesion: 0.50
Nodes (3): Importazione Modelli Sketchfab (Drop-in Automatico), Monoposto F1 2026 (11 Scuderie), Piloti, Garage e Prop Opzionali

### Community 57 - "textures"
Cohesion: 0.22
Nodes (9): diff, nor_gl, rough, diff, nor_gl, rough, textures, asphalt_track (+1 more)

### Community 58 - "asphalt_pit_lane"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, asphalt_pit_lane

### Community 59 - "coast_sand_01"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, coast_sand_01

### Community 60 - "concrete_wall_007"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, concrete_wall_007

### Community 61 - "grass_004"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, grass_004

### Community 62 - "gravelly_sand"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, gravelly_sand

### Community 63 - "metal_plate"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, metal_plate

### Community 64 - "emscripten_realloc_buffer"
Cohesion: 0.50
Nodes (4): emscripten_realloc_buffer(), _emscripten_resize_heap(), getHeapMax(), updateMemoryViews()

### Community 65 - "intArrayFromString"
Cohesion: 0.50
Nodes (4): ensureString(), intArrayFromString(), lengthBytesUTF8(), stringToUTF8Array()

### Community 67 - "PhysicsDiagnostics.js"
Cohesion: 0.18
Nodes (26): getCarSpecsForLevel(), ADVANCED_PHYSICS_CONFIG, VIRTUAL_INPUT_CONFIG, getDifficultyConfig(), clamp(), moveTowards(), stepVirtualInput(), clamp() (+18 more)

### Community 72 - "Db"
Cohesion: 0.21
Nodes (12): Db(), jh(), ji(), Lf(), Mf(), mh(), mi(), of() (+4 more)

### Community 73 - "build-custom-asphalt-pbr.mjs"
Cohesion: 0.27
Nodes (9): clamp(), main(), mulberry32(), OUT_DIR, ROOT, sampleTransform(), SOURCE_PATH, synthesizeToroidalLayer() (+1 more)

## Knowledge Gaps
- **5 isolated node(s):** `graphify explain`, `graphify path`, `graphify section`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 329 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cartella `src/`` connect `draco_wasm_wrapper.js` to `TrackMapHud`, `MenuManager`, `WeatherAndTireFx`, `initGame`, `main.js`, `TimingSystem.js`, `SceneManager`, `WorldState`, `TrackBuilder.js`, `AssetManager3D`?**
  _High betweenness centrality (0.344) - this node is a cross-community bridge._
- **Are the 178 inferred relationships involving `ha()` (e.g. with `ac()` and `Ad()`) actually correct?**
  _`ha()` has 178 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify explain`, `graphify path`, `graphify section` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prompt per Antigravity — Gioco di F1 realistico (web app 3D)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `Yh()` connect `draco_wasm_wrapper.js` to `Db`, `v`, `ma`, `ha`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ja()` (e.g. with `ha()` and `e()`) actually correct?**
  _`ja()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11462450592885376 - nodes in this community are weakly interconnected._