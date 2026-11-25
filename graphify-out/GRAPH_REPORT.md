# Graph Report - GIOCO F1  (2026-11-25)

## Corpus Check
- 99 files · ~193,165 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 29 file(s) not represented in the graph (top: .glb 14, .hdr 11, (none) 2)

## Summary
- 1637 nodes · 4571 edges · 91 communities (79 shown, 12 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 564 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ea4d6efb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Graphify Knowledge Graph Rules
- Prompt per Antigravity — Gioco di F1 realistico (web app 3D)
- package.json
- MenuManager
- CarModel3D.js
- index.js
- Proposed Changes (Step-by-Step)
- 4. Workflow Operativo (tutto in un colpo)
- main.js
- test_track.js
- queryTrackSurface
- ha
- WorldState
- Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica
- CareerStorage.js
- draco_wasm_wrapper.js
- ma
- v
- LoadingScreenManager.js
- draco_decoder.js
- Vc
- AssetManager3D
- DaySkyDome
- BotController.js
- fetch-cc0-assets.mjs
- createWasm
- ExceptionInfo
- asset-catalog.mjs
- GarageScene3D
- import-and-optimize-glbs.mjs
- Barrel_01
- nature
- generate_f1_2026_tracks.mjs
- PitLaneManager.js
- Na
- .startSession
- callRuntimeCallbacks
- NightLightingConfig.js
- scripts
- manifest.json
- RoomManager
- SceneManager
- NightSky
- keybindings.js
- PitLaneConfig.js
- garage
- CameraController
- HudOverlay.js
- hdri
- metal_tool_chest
- TrackSurface.js
- initGame
- steel_frame_shelves_01
- ModalManager
- Importazione Modelli Sketchfab (Drop-in Automatico)
- textures
- asphalt_pit_lane
- WeatherAndTireFx
- WorldState.js
- grass_004
- gravelly_sand
- createF1CarMesh
- emscripten_realloc_buffer
- intArrayFromString
- .constructor
- CarPhysics.js
- UiTheme.js
- MenuManager.js
- SceneManager.js
- PitLaneMapHud
- build-custom-asphalt-pbr.mjs
- PitGuideOverlay3D
- Richiesta Pianificazione — PIANO PRE STEP 4
- PitStopAnimator3D.js
- Vc
- TrackMapHud
- ._syncHomeScreen
- ferrari
- fern_02
- power_box_01
- security_camera_01
- TrackFloodlights
- grass_medium_01
- modular_chainlink_fence
- coast_sand_01
- concrete_wall_007
- metal_plate
- Ib

## God Nodes (most connected - your core abstractions)
1. `ha()` - 234 edges
2. `ja()` - 144 edges
3. `Ka()` - 94 edges
4. `initGame()` - 92 edges
5. `v()` - 79 edges
6. `Na()` - 61 edges
7. `MenuManager` - 52 edges
8. `c()` - 50 edges
9. `e()` - 50 edges
10. `ma()` - 48 edges

## Surprising Connections (you probably didn't know these)
- `6. Regole d'Oro & Vincoli per Claude / Agenti` --references--> `AssetManager3D`  [INFERRED]
  README.md → src/rendering/AssetManager3D.js
- `3. Vincoli & Regole Critiche (tassativi)` --references--> `WorldState`  [INFERRED]
  PROMPT/prompt-F1-cielo-notturno-realistico.md → src/core/WorldState.js
- `2. Architettura a Layer` --references--> `WorldState`  [INFERRED]
  README.md → src/core/WorldState.js
- `B. `PIANO SUB-STEP 2` (Realismo Visivo Monoposto, Particelle & Cieli HDRI — 100% Estetico)` --references--> `WorldState`  [INFERRED]
  README.md → src/core/WorldState.js
- `Cartella `src/`` --references--> `WorldState`  [INFERRED]
  README.md → src/core/WorldState.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Query CLI Commands** — claude_graphify_query, claude_graphify_path, claude_graphify_explain, claude_graphify_section [EXTRACTED 1.00]

## Communities (91 total, 12 thin omitted)

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
Cohesion: 0.14
Nodes (3): updateCareerProfile(), hexToRgb(), MenuManager

### Community 4 - "CarModel3D.js"
Cohesion: 0.08
Nodes (29): AI_DISTANT_HIDE_MATERIALS, AI_SKIP_BODY_MATERIALS, buildTemplateFromGltfScene(), calibrateCarPbrMaterial(), CAR_VISUAL_CONFIG, computeWheelAxleVector(), ensureGlbTemplateLoaded(), GLB_SCALE_X (+21 more)

### Community 5 - "index.js"
Cohesion: 0.06
Nodes (25): ABU_DHABI_TRACK_DATA, AUSTIN_TRACK_DATA, AUSTRIA_TRACK_DATA, BAHRAIN_TRACK_DATA, BAKU_TRACK_DATA, BARCELONA_TRACK_DATA, HUNGARORING_TRACK_DATA, DEFAULT_TRACK_ID (+17 more)

### Community 6 - "Proposed Changes (Step-by-Step)"
Cohesion: 0.06
Nodes (46): A. Monoposto delle 11 Scuderie F1 2026, Architettura della Pipeline Asset 3D, Automated Tests, B. Corpi dei Piloti 3D (Seduti in Abitacolo), C. Alberi, Erba e Natura Circostante (100% Download Automatico CC0), Catalogo Verificato degli Asset 3D Trovati, D. Pista Realistica & Strutture Bordo Pista (Download Automatico CC0), E. Garage F1 3D (`GARAGE & UPGRADE`) (+38 more)

### Community 7 - "4. Workflow Operativo (tutto in un colpo)"
Cohesion: 0.14
Nodes (13): 1. Ruolo & Obiettivo, 2. Problemi attuali da risolvere, 3. Vincoli & Regole Critiche (tassativi), 4. Workflow Operativo (tutto in un colpo), 5. Formato di Output, 6. Criteri di accettazione, A. Cupola celeste notturna procedurale (stelle, Luna, Via Lattea), B. Alone luminoso all'orizzonte (light pollution) (+5 more)

### Community 8 - "main.js"
Cohesion: 0.08
Nodes (27): buildEntry(), createEmptyTrackRecord(), evaluateLapRecord(), evaluateSectorRecord(), getLapFieldForMode(), getTheoreticalBestLap(), getTrackRecord(), loadAllTrackRecords() (+19 more)

### Community 10 - "queryTrackSurface"
Cohesion: 0.27
Nodes (14): buildSplitTimes(), clamp(), computeBaselineSectors(), createCarTimingState(), createSessionTimingState(), evaluateFiaTrackLimits(), finalizeSector(), getInterpolatedReferenceTime() (+6 more)

### Community 11 - "ha"
Cohesion: 0.05
Nodes (68): ha(), Aa(), Ae(), ah(), ai(), Bb(), bg(), bh() (+60 more)

### Community 13 - "WorldState"
Cohesion: 0.11
Nodes (7): cloneCarTiming(), cloneQualifyingState(), cloneSessionTiming(), WorldState, canSkipQualifying(), getQualifyingStageDuration(), voteSkipQualifying()

### Community 14 - "Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica"
Cohesion: 0.08
Nodes (23): 10. Vincoli importanti, 1. Ruolo e obiettivo, 2. Come lavoriamo (regole di processo), 3. Modifica 1 — Pop up al centro dello schermo, 4. Modifica 2 — Animazioni fluide, 5. Modifica 3 — Finestra tempi / delta / nomi più lunga in verticale, 6.1 Linguaggio visivo da riprodurre, 6.2 Schermate di riferimento (adattale alle mie modalità e funzioni già esistenti) (+15 more)

### Community 15 - "CareerStorage.js"
Cohesion: 0.11
Nodes (36): calculateRacePrize(), CAREER_SCHEMA_VERSION, CAREER_STORAGE_KEY, clampByte(), clampCareerRoundIndex(), clampUnit(), clampUpgrade(), createDefaultCareerState() (+28 more)

### Community 17 - "draco_wasm_wrapper.js"
Cohesion: 0.07
Nodes (24): Yh(), A(), B(), C(), D(), E(), G(), H() (+16 more)

### Community 18 - "ma"
Cohesion: 0.16
Nodes (35): Ab(), ac(), bc(), $c(), Cb(), cc(), de(), ee() (+27 more)

### Community 19 - "v"
Cohesion: 0.25
Nodes (31): $a(), Bd(), Cd(), Cf(), Da(), Dd(), di(), Ea() (+23 more)

### Community 20 - "LoadingScreenManager.js"
Cohesion: 0.23
Nodes (4): assetManager3D, LoadingScreenManager, nextAnimationFrame(), sleepMs()

### Community 21 - "draco_decoder.js"
Cohesion: 0.08
Nodes (24): AttributeOctahedronTransform(), AttributeQuantizationTransform(), AttributeTransformData(), castObject(), Decoder(), DecoderBuffer(), destroy(), DracoFloat32Array() (+16 more)

### Community 22 - "Vc"
Cohesion: 0.13
Nodes (38): Be(), Db(), Dc(), Eb(), Fc(), fg(), Gc(), Hc() (+30 more)

### Community 25 - "BotController.js"
Cohesion: 0.10
Nodes (27): BRAKE_CHECK_DISTANCES, _candLanes, clamp(), computeBotInput(), deterministicHash01(), findPitSampleAtS(), _nearbyDelta, _nearbyLat (+19 more)

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

### Community 35 - "PitLaneManager.js"
Cohesion: 0.10
Nodes (34): beginGarageAutoParking(), beginGarageExit(), beginRacePitStop(), clamp(), computePitStopVisualState(), createInitialPitLaneState(), evalCubicBezier(), evalCubicBezierDeriv() (+26 more)

### Community 36 - "Na"
Cohesion: 0.12
Nodes (45): c(), Ad(), ag(), Bf(), Cg(), Df(), Dg(), Fa() (+37 more)

### Community 37 - ".startSession"
Cohesion: 0.15
Nodes (16): BOT_AI_MAX_LEVEL, BOT_AI_MIN_LEVEL, clamp(), computeCareerPrizeMultiplier(), loadPhysicsSettings(), normalizePhysicsSettings(), PHYSICS_SETTINGS_STORAGE_KEY, physicsSettingsFromLegacyDifficulty() (+8 more)

### Community 38 - "callRuntimeCallbacks"
Cohesion: 0.32
Nodes (8): addOnPostRun(), addOnPreRun(), callRuntimeCallbacks(), initRuntime(), postRun(), preRun(), run(), doRun()

### Community 39 - "NightLightingConfig.js"
Cohesion: 0.16
Nodes (16): three, AUTO_QUALITY_FALLBACK, DEFAULT_NIGHT_QUALITY, FLOODLIGHT_PARAMS, getLowerNightQuality(), getNightCircuitProfile(), loadSavedNightQuality(), NIGHT_CIRCUIT_PROFILES (+8 more)

### Community 40 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, assets:fetch-cc0, assets:import, build, dev, preview

### Community 41 - "manifest.json"
Cohesion: 0.33
Nodes (5): dracoDecoderPath, drivers, garage, generatedAt, version

### Community 42 - "RoomManager"
Cohesion: 0.16
Nodes (5): generateRoomCode(), getBrokerPeerId(), loadPeerClass(), normalizeRoomCode(), RoomManager

### Community 44 - "NightSky"
Cohesion: 0.24
Nodes (5): computeGalacticBasis(), computeMoonDirection(), degToRad(), mulberry32(), NightSky

### Community 45 - "keybindings.js"
Cohesion: 0.14
Nodes (15): ACTION_IDS, DEFAULT_KEYBINDINGS, FORBIDDEN_CODES, formatKeyCodeLabel(), isBindableKeyCode(), KEYBIND_ACTIONS, KEYBINDINGS_STORAGE_KEY, loadKeybindings() (+7 more)

### Community 46 - "PitLaneConfig.js"
Cohesion: 0.40
Nodes (4): COMPACT_STREET_SPEC, DEFAULT_PIT_LANE_SPEC, PIT_LANE_CONFIG_BY_TRACK, WIDE_PERMANENT_SPEC

### Community 47 - "garage"
Cohesion: 0.25
Nodes (8): draco, format, path, sizeBytes, Drill_01, models, garage, optional

### Community 49 - "HudOverlay.js"
Cohesion: 0.14
Nodes (19): CAMERA_MODES, FIXED_DT, LOCAL_PLAYER_ID, MAX_ACCUMULATED_TIME, SIMULATION_TICK_RATE, SURFACE_PHYSICS, TIMING_CONFIG, TIRE_COMPOUND_IDS (+11 more)

### Community 50 - "hdri"
Cohesion: 0.15
Nodes (13): hdri, clear_day, cloudy_sunset, dry, heavy_rain, night, night_clear, overcast (+5 more)

### Community 51 - "metal_tool_chest"
Cohesion: 0.40
Nodes (5): metal_tool_chest, draco, format, path, sizeBytes

### Community 52 - "TrackSurface.js"
Cohesion: 0.15
Nodes (20): COLLISION_CONFIG, applyWallBounce(), GARAGE_COLLISION_BYPASS_STATES, resolveCarToCarCollisions(), resolveTrackBarrierCollision(), updateCarLocalVelocityFromWorld(), getPitLaneConfig(), buildPitLaneData() (+12 more)

### Community 53 - "initGame"
Cohesion: 0.16
Nodes (3): GameLoop, InputManager, initGame()

### Community 54 - "steel_frame_shelves_01"
Cohesion: 0.40
Nodes (5): steel_frame_shelves_01, draco, format, path, sizeBytes

### Community 55 - "ModalManager"
Cohesion: 0.20
Nodes (4): isElement(), isHtmlBtn(), isHtmlEl(), ModalManager

### Community 56 - "Importazione Modelli Sketchfab (Drop-in Automatico)"
Cohesion: 0.50
Nodes (3): Importazione Modelli Sketchfab (Drop-in Automatico), Monoposto F1 2026 (11 Scuderie), Piloti, Garage e Prop Opzionali

### Community 57 - "textures"
Cohesion: 0.22
Nodes (9): diff, nor_gl, rough, diff, nor_gl, rough, textures, asphalt_track (+1 more)

### Community 58 - "asphalt_pit_lane"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, asphalt_pit_lane

### Community 59 - "WeatherAndTireFx"
Cohesion: 0.07
Nodes (25): 1. Texture PBR 2K — Poly Haven & AmbientCG (CC0 Public Domain), 2. HDRI Sky & Environment Reflections — Poly Haven (CC0 Public Domain), 3. Modelli 3D Natura, Pista & Officina — Poly Haven (CC0 Public Domain), 4. Monoposto, Piloti e Garage F1 — Sketchfab (CC-BY / CC-BY-NC-SA), Crediti e Licenze Asset 3D, 1. Stack Tecnico & Comandi Rapidi, 2. Architettura a Layer, 3. Struttura Completa del Progetto (+17 more)

### Community 60 - "WorldState.js"
Cohesion: 0.19
Nodes (16): DEFAULT_DIFFICULTY_ID, DIFFICULTY_LEVELS, F1_2026_DRIVERS, F1_2026_TEAMS, TRACK_RECOVERY_BYPASS_PIT_STATES, buildQualifyingStandings(), computeSimulatedQualifyingLap(), createInitialQualifyingState() (+8 more)

### Community 61 - "grass_004"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, grass_004

### Community 62 - "gravelly_sand"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, gravelly_sand

### Community 63 - "createF1CarMesh"
Cohesion: 0.17
Nodes (16): buildGlbDriverGroup(), clamp(), createCockpitSteeringOverlay(), createF1CarMesh(), createHelmetShellGeometry(), createWheelAssembly(), getCachedGlbSidewallMaterial(), getCachedGlbTreadMaterial() (+8 more)

### Community 64 - "emscripten_realloc_buffer"
Cohesion: 0.50
Nodes (4): emscripten_realloc_buffer(), _emscripten_resize_heap(), getHeapMax(), updateMemoryViews()

### Community 65 - "intArrayFromString"
Cohesion: 0.50
Nodes (4): ensureString(), intArrayFromString(), lengthBytesUTF8(), stringToUTF8Array()

### Community 66 - ".constructor"
Cohesion: 0.22
Nodes (5): loadSavedSkyPresetOption(), BIOME_PRESETS, getTrackBiomeConfig(), NIGHT_URBAN_OVERRIDES, TRACK_BIOME_MAP

### Community 67 - "CarPhysics.js"
Cohesion: 0.18
Nodes (30): getCarSpecsForLevel(), ADVANCED_PHYSICS_CONFIG, getDifficultyConfig(), clamp(), createInitialAeroTireState(), fitFreshTires(), getTireCompoundSpec(), updateAeroAndTires() (+22 more)

### Community 68 - "UiTheme.js"
Cohesion: 0.17
Nodes (16): clampByte(), DEFAULT_KEY_HINTS, escapeAttr(), generateLowPolyBackgroundSvg(), generateTeamEmblemSvg(), hash2D(), mixRgb(), parseHexRgb() (+8 more)

### Community 69 - "MenuManager.js"
Cohesion: 0.13
Nodes (17): buildCarSpecsFromUpgrades(), CAR_LEVEL_PRESETS, clampUpgradeLevel(), UPGRADE_CATEGORIES, UPGRADE_MAX_LEVEL, DEFAULT_PHYSICS_SETTINGS, CAMERA_FEEL_CONFIG, CAMERA_STORAGE_KEY (+9 more)

### Community 71 - "SceneManager.js"
Cohesion: 0.16
Nodes (15): DAY_TRACK_RANDOM_POOL, DEFAULT_SKY_PRESET_OPTION, getNextWeatherCyclePreset(), getSkyPresetById(), isNightCircuit(), NIGHT_CIRCUIT_IDS, NIGHT_TRACK_RANDOM_POOL, PURE_SKY_HDR_SUN_HEADING_RAD (+7 more)

### Community 73 - "build-custom-asphalt-pbr.mjs"
Cohesion: 0.27
Nodes (9): clamp(), main(), mulberry32(), OUT_DIR, ROOT, sampleTransform(), SOURCE_PATH, synthesizeToroidalLayer() (+1 more)

### Community 74 - "PitGuideOverlay3D"
Cohesion: 0.33
Nodes (4): clamp(), createChevronTexture(), PitGuideOverlay3D, smoothstep01()

### Community 75 - "Richiesta Pianificazione — PIANO PRE STEP 4"
Cohesion: 0.22
Nodes (8): 1. Pit Lane, Box Scuderie e Aggiornamento Piano 3D, 2. Interfaccia (HUD), Minimappe e Transizioni, 3. Nuovo Flusso Qualifiche (Q1 → Q2 → Q3 → Griglia di Gara), 4. Miglioramento Bot e Valutazione IA, 5. Fisica: Degrado Gomme, Pit Stop e Sezione Impostazioni "FISICA", 6. Modalità Carriera Predefinita (Calendario Fisso + 3 Preset), Deliverable Richiesti, Richiesta Pianificazione — PIANO PRE STEP 4

### Community 76 - "PitStopAnimator3D.js"
Cohesion: 0.31
Nodes (5): CORNER_DEFS, createMechanicMesh(), createPitStopRig(), createSpareWheelMesh(), PitStopAnimator3D

### Community 77 - "Vc"
Cohesion: 0.50
Nodes (8): Ba(), Ca(), Eg(), ic(), nb(), Nc(), Pd(), Vc()

### Community 79 - "._syncHomeScreen"
Cohesion: 0.36
Nodes (4): getCareerConstructorStandings(), getCareerDriverStandings(), generateTrackOutlineSvg(), getTrackCornersCount()

### Community 80 - "ferrari"
Cohesion: 0.33
Nodes (6): cars, ferrari, draco, path, sizeBytes, source

### Community 81 - "fern_02"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, fern_02

### Community 82 - "power_box_01"
Cohesion: 0.40
Nodes (5): power_box_01, draco, format, path, sizeBytes

### Community 83 - "security_camera_01"
Cohesion: 0.40
Nodes (5): security_camera_01, draco, format, path, sizeBytes

### Community 84 - "TrackFloodlights"
Cohesion: 0.22
Nodes (3): computeFloodlightTowers(), createLightPoolTexture(), TrackFloodlights

### Community 85 - "grass_medium_01"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, grass_medium_01

### Community 86 - "modular_chainlink_fence"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, modular_chainlink_fence

### Community 87 - "coast_sand_01"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, coast_sand_01

### Community 88 - "concrete_wall_007"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, concrete_wall_007

### Community 89 - "metal_plate"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, metal_plate

### Community 90 - "Ib"
Cohesion: 1.00
Nodes (3): $b(), Ib(), Nf()

## Knowledge Gaps
- **5 isolated node(s):** `graphify explain`, `graphify path`, `graphify section`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 409 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cartella `src/`` connect `draco_wasm_wrapper.js` to `MenuManager`, `.startSession`, `main.js`, `RoomManager`, `SceneManager`, `queryTrackSurface`, `WorldState`, `TrackMapHud`, `TrackSurface.js`, `initGame`, `AssetManager3D`, `WeatherAndTireFx`?**
  _High betweenness centrality (0.332) - this node is a cross-community bridge._
- **Are the 178 inferred relationships involving `ha()` (e.g. with `ac()` and `Ad()`) actually correct?**
  _`ha()` has 178 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify explain`, `graphify path`, `graphify section` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prompt per Antigravity — Gioco di F1 realistico (web app 3D)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `Yh()` connect `draco_wasm_wrapper.js` to `v`, `ma`, `ha`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ja()` (e.g. with `ha()` and `e()`) actually correct?**
  _`ja()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11462450592885376 - nodes in this community are weakly interconnected._