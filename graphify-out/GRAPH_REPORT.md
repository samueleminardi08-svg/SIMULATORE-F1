# Graph Report - GIOCO F1  (2026-11-26)

## Corpus Check
- 103 files · ~205,960 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 37 file(s) not represented in the graph (top: .glb 22, .hdr 11, (none) 2)
- WARNING: 37 of 177 files seen (21%) have no supported extractor and are missing from this graph entirely. It may look complete while representing only part of the codebase.

## Summary
- 1790 nodes · 4930 edges · 98 communities (88 shown, 10 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 600 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c58a1828`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Graphify Knowledge Graph Rules
- Prompt per Antigravity — Gioco di F1 realistico (web app 3D)
- package.json
- MenuManager
- CarModel3D.js
- index.js
- GIOCO F1 3D — Simulatore Formula 1 2026 (Contesto Completo per Claude & Sviluppatori)
- TrackBuilder.js
- main.js
- test_track.js
- TrackMapHud
- ha
- createF1CarMesh
- Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica
- CareerStorage.js
- draco_wasm_wrapper.js
- ma
- Ka
- constants.js
- draco_decoder.js
- Ka
- AssetManager3D
- metal_tool_chest
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
- c
- NightLightingConfig.js
- callRuntimeCallbacks
- three
- scripts
- manifest.json
- RoomManager
- NightSky
- trophies
- keybindings.js
- queryTrackSurface
- garage
- Ka
- WeatherAndTireFx.js
- hdri
- steel_frame_shelves_01
- QualifyingManager.js
- asphalt_pit_lane
- gravelly_sand
- PitLaneGeometry.js
- Importazione Modelli Sketchfab (Drop-in Automatico)
- build_f1_trophies.py
- textures
- WeatherAndTireFx
- TrophyMuseumScene3D
- grass_004
- MenuManager.js
- ferrari
- emscripten_realloc_buffer
- intArrayFromString
- WorldState
- power_box_01
- UiTheme.js
- initGame
- Proposed Changes (Step-by-Step)
- CarPhysics.js
- build-custom-asphalt-pbr.mjs
- SceneManager
- Richiesta Pianificazione — PIANO PRE STEP 4
- PhysicsDiagnostics.js
- prompt-modifiche-random.md
- Crediti e Licenze Asset 3D
- DaySkyDome
- coast_sand_01
- concrete_wall_007
- metal_plate
- Catalogo Verificato degli Asset 3D Trovati
- ModalManager
- .constructor
- TrophyMuseumScene3D.js
- PIANO A — Upgrade Asset 3D Ad Alta Risoluzione (Monoposto 2026, Piloti, Natura, Piste PBR, Garage 3D & Pit Lane/Box 24 Piste)
- PIANO B *(ex PIANO MODIFICHE PRE STEP 3)*
- AeroAndTires.js
- fia_wcc
- fia_wdc
- gp_chalice
- gp_classic
- gp_modern
- gp_monaco
- namaqualand_boulder_02
- pirelli_pole

## God Nodes (most connected - your core abstractions)
1. `ha()` - 234 edges
2. `ja()` - 144 edges
3. `initGame()` - 105 edges
4. `Ka()` - 94 edges
5. `v()` - 79 edges
6. `Na()` - 61 edges
7. `MenuManager` - 56 edges
8. `SceneManager` - 52 edges
9. `c()` - 50 edges
10. `e()` - 50 edges

## Surprising Connections (you probably didn't know these)
- `6. Regole d'Oro & Vincoli per Claude / Agenti` --references--> `AssetManager3D`  [INFERRED]
  README.md → src/rendering/AssetManager3D.js
- `2. Architettura a Layer` --references--> `WorldState`  [INFERRED]
  README.md → src/core/WorldState.js
- `Cartella `src/`` --references--> `GameLoop`  [INFERRED]
  README.md → src/core/GameLoop.js
- `Cartella `src/`` --references--> `WorldState`  [INFERRED]
  README.md → src/core/WorldState.js
- `Cartella `src/`` --references--> `InputManager`  [INFERRED]
  README.md → src/input/InputManager.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Query CLI Commands** — claude_graphify_query, claude_graphify_path, claude_graphify_explain, claude_graphify_section [EXTRACTED 1.00]

## Communities (98 total, 10 thin omitted)

### Community 0 - "Graphify Knowledge Graph Rules"
Cohesion: 0.24
Nodes (10): graphify-out/graph.json, graphify-out/GRAPH_REPORT.md, Graphify Knowledge Graph Rules, graphify explain, graphify-out/, graphify path, graphify query, graphify section (+2 more)

### Community 1 - "Prompt per Antigravity — Gioco di F1 realistico (web app 3D)"
Cohesion: 0.13
Nodes (14): 1. Ruolo e obiettivo, 2. Come lavoriamo (regole di processo), 3. Scelte tecniche già decise, 4.1 Modalità di gioco, 4.2 Weekend di gara (carriera e multigiocatore), 4.3 Tempi e micro settori, 4.4 Vetture, piste e piloti, 4.5 Fisica realistica (+6 more)

### Community 2 - "package.json"
Cohesion: 0.11
Nodes (22): dependencies, peerjs@^1.5.5, three@^0.170.0, devDependencies, draco3dgltf@^1.5.9, @gltf-transform/core@^4.5.1, @gltf-transform/extensions@^4.5.1, @gltf-transform/functions@^4.5.1 (+14 more)

### Community 4 - "CarModel3D.js"
Cohesion: 0.08
Nodes (29): AI_DISTANT_HIDE_MATERIALS, AI_SKIP_BODY_MATERIALS, buildTemplateFromGltfScene(), calibrateCarPbrMaterial(), CAR_VISUAL_CONFIG, computeWheelAxleVector(), ensureGlbTemplateLoaded(), GLB_SCALE_X (+21 more)

### Community 5 - "index.js"
Cohesion: 0.06
Nodes (25): ABU_DHABI_TRACK_DATA, AUSTIN_TRACK_DATA, AUSTRIA_TRACK_DATA, BAHRAIN_TRACK_DATA, BAKU_TRACK_DATA, BARCELONA_TRACK_DATA, HUNGARORING_TRACK_DATA, DEFAULT_TRACK_ID (+17 more)

### Community 6 - "GIOCO F1 3D — Simulatore Formula 1 2026 (Contesto Completo per Claude & Sviluppatori)"
Cohesion: 0.17
Nodes (12): 1. Stack Tecnico & Comandi Rapidi, 2. Architettura a Layer, 3. Struttura Completa del Progetto, 4. Contenuti & Gameplay, 5. Stato Attuale dei Lavori (Roadmap), 6. Regole d'Oro & Vincoli per Claude / Agenti, A. `PIANO A` *(ex `PIANO GRAFICA 3D`)* — Upgrade Asset 3D Ad Alta Risoluzione (dettaglio completo in [docs/PIANO_A.md](docs/PIANO_A.md)), C. `PIANO PRE STEP 4` (Pit Lane, Qualifiche dai Box, Bot Avanzati, Fisica Modulare & Carriera Fissa) (+4 more)

### Community 7 - "TrackBuilder.js"
Cohesion: 0.10
Nodes (27): computeStartingGridTransforms(), assetManager3D, isInsidePitFootprint(), BIOME_PRESETS, getTrackBiomeConfig(), NIGHT_URBAN_OVERRIDES, TRACK_BIOME_MAP, addDistantHorizonHills() (+19 more)

### Community 8 - "main.js"
Cohesion: 0.08
Nodes (27): buildEntry(), createEmptyTrackRecord(), evaluateLapRecord(), evaluateSectorRecord(), getLapFieldForMode(), getTheoreticalBestLap(), getTrackRecord(), loadAllTrackRecords() (+19 more)

### Community 11 - "ha"
Cohesion: 0.05
Nodes (72): ha(), Ae(), ag(), ah(), Ba(), Be(), bg(), bi() (+64 more)

### Community 13 - "createF1CarMesh"
Cohesion: 0.17
Nodes (16): buildGlbDriverGroup(), clamp(), createCockpitSteeringOverlay(), createF1CarMesh(), createHelmetShellGeometry(), createWheelAssembly(), getCachedGlbSidewallMaterial(), getCachedGlbTreadMaterial() (+8 more)

### Community 14 - "Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica"
Cohesion: 0.08
Nodes (23): 10. Vincoli importanti, 1. Ruolo e obiettivo, 2. Come lavoriamo (regole di processo), 3. Modifica 1 — Pop up al centro dello schermo, 4. Modifica 2 — Animazioni fluide, 5. Modifica 3 — Finestra tempi / delta / nomi più lunga in verticale, 6.1 Linguaggio visivo da riprodurre, 6.2 Schermate di riferimento (adattale alle mie modalità e funzioni già esistenti) (+15 more)

### Community 15 - "CareerStorage.js"
Cohesion: 0.13
Nodes (38): CAREER_SCHEMA_VERSION, CAREER_STORAGE_KEY, clampByte(), clampCareerRoundIndex(), clampPos(), clampUnit(), computeLifetimeStatsFromCompletedCareers(), createDefaultCareerState() (+30 more)

### Community 17 - "draco_wasm_wrapper.js"
Cohesion: 0.07
Nodes (22): A(), B(), C(), D(), G(), H(), I(), J() (+14 more)

### Community 18 - "ma"
Cohesion: 0.15
Nodes (40): Ab(), ac(), Bb(), bc(), bh(), $c(), Cb(), cc() (+32 more)

### Community 19 - "Ka"
Cohesion: 0.20
Nodes (31): $a(), Aa(), ai(), Bd(), Cd(), Cf(), $d(), Da() (+23 more)

### Community 20 - "constants.js"
Cohesion: 0.18
Nodes (12): COLLISION_CONFIG, FIXED_DT, MAX_ACCUMULATED_TIME, SIMULATION_TICK_RATE, SURFACE_PHYSICS, TIMING_CONFIG, TIRE_COMPOUND_IDS, VIRTUAL_INPUT_CONFIG (+4 more)

### Community 21 - "draco_decoder.js"
Cohesion: 0.08
Nodes (24): AttributeOctahedronTransform(), AttributeQuantizationTransform(), AttributeTransformData(), castObject(), Decoder(), DecoderBuffer(), destroy(), DracoFloat32Array() (+16 more)

### Community 22 - "Ka"
Cohesion: 0.21
Nodes (32): Db(), Eb(), Gc(), If(), jc(), Jf(), kd(), la() (+24 more)

### Community 23 - "AssetManager3D"
Cohesion: 0.08
Nodes (15): 1. Ruolo & Obiettivo, 2. Problemi attuali da risolvere, 3. Vincoli & Regole Critiche (tassativi), 4. Workflow Operativo (tutto in un colpo), 5. Formato di Output, 6. Criteri di accettazione, A. Cupola celeste notturna procedurale (stelle, Luna, Via Lattea), B. Alone luminoso all'orizzonte (light pollution) (+7 more)

### Community 24 - "metal_tool_chest"
Cohesion: 0.40
Nodes (5): metal_tool_chest, draco, format, path, sizeBytes

### Community 25 - "BotController.js"
Cohesion: 0.13
Nodes (22): BRAKE_CHECK_DISTANCES, _candLanes, clamp(), computeBotInput(), deterministicHash01(), findPitSampleAtS(), _nearbyDelta, _nearbyLat (+14 more)

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
Cohesion: 0.12
Nodes (16): draco, format, path, sizeBytes, track, draco, format, path (+8 more)

### Community 33 - "nature"
Cohesion: 0.12
Nodes (16): draco, format, path, sizeBytes, draco, format, path, sizeBytes (+8 more)

### Community 34 - "generate_f1_2026_tracks.mjs"
Cohesion: 0.27
Nodes (7): CALENDAR_2026_SPECS, convertGeoJsonToControlPoints(), __dirname, formatIndexModule(), formatTrackModule(), main(), OUT_DIR

### Community 35 - "PitLaneManager.js"
Cohesion: 0.10
Nodes (34): beginGarageAutoParking(), beginGarageExit(), beginRacePitStop(), clamp(), computePitStopVisualState(), createInitialPitLaneState(), evalCubicBezier(), evalCubicBezierDeriv() (+26 more)

### Community 36 - "c"
Cohesion: 0.12
Nodes (20): c(), $b(), Ce(), Cg(), Df(), Dg(), Hd(), Ib() (+12 more)

### Community 37 - "NightLightingConfig.js"
Cohesion: 0.11
Nodes (14): AUTO_QUALITY_FALLBACK, DEFAULT_NIGHT_QUALITY, FLOODLIGHT_PARAMS, getNightCircuitProfile(), NIGHT_CIRCUIT_PROFILES, NIGHT_QUALITY_LEVELS, NIGHT_QUALITY_ORDER, NIGHT_QUALITY_STORAGE_KEY (+6 more)

### Community 38 - "callRuntimeCallbacks"
Cohesion: 0.32
Nodes (8): addOnPostRun(), addOnPreRun(), callRuntimeCallbacks(), initRuntime(), postRun(), preRun(), run(), doRun()

### Community 39 - "three"
Cohesion: 0.13
Nodes (6): three, DaySkyDome, clamp(), createChevronTexture(), PitGuideOverlay3D, smoothstep01()

### Community 40 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, assets:fetch-cc0, assets:import, build, dev, preview

### Community 41 - "manifest.json"
Cohesion: 0.33
Nodes (5): dracoDecoderPath, drivers, garage, generatedAt, version

### Community 42 - "RoomManager"
Cohesion: 0.16
Nodes (5): generateRoomCode(), getBrokerPeerId(), loadPeerClass(), normalizeRoomCode(), RoomManager

### Community 43 - "NightSky"
Cohesion: 0.29
Nodes (6): NIGHT_SKY_PARAMS, computeGalacticBasis(), computeMoonDirection(), degToRad(), mulberry32(), NightSky

### Community 44 - "trophies"
Cohesion: 0.25
Nodes (8): draco, format, path, sizeBytes, models, optional, trophies, dhl_fastest_lap

### Community 45 - "keybindings.js"
Cohesion: 0.16
Nodes (14): ACTION_IDS, DEFAULT_KEYBINDINGS, FORBIDDEN_CODES, formatKeyCodeLabel(), isBindableKeyCode(), KEYBIND_ACTIONS, KEYBINDINGS_STORAGE_KEY, normalizeKeybindings() (+6 more)

### Community 46 - "queryTrackSurface"
Cohesion: 0.12
Nodes (27): clamp(), computeTrackRacingLine(), sampleRacingLineAtArcDistance(), applyWallBounce(), GARAGE_COLLISION_BYPASS_STATES, resolveCarToCarCollisions(), resolveTrackBarrierCollision(), updateCarLocalVelocityFromWorld() (+19 more)

### Community 47 - "garage"
Cohesion: 0.18
Nodes (11): draco, format, path, sizeBytes, Drill_01, security_camera_01, garage, draco (+3 more)

### Community 48 - "Ka"
Cohesion: 0.21
Nodes (35): Ad(), Bf(), Fa(), gb(), Gd(), $h(), he(), Id() (+27 more)

### Community 49 - "WeatherAndTireFx.js"
Cohesion: 0.21
Nodes (7): B. `PIANO SUB-STEP 2` (Realismo Visivo Monoposto, Particelle & Cieli HDRI — 100% Estetico), resolveLockedFrontWheels(), createSoftPuffTexture(), mulberry32(), WEATHER_FX_CONFIG, wrapPositive(), wrapSigned()

### Community 50 - "hdri"
Cohesion: 0.15
Nodes (13): hdri, clear_day, cloudy_sunset, dry, heavy_rain, night, night_clear, overcast (+5 more)

### Community 51 - "steel_frame_shelves_01"
Cohesion: 0.40
Nodes (5): steel_frame_shelves_01, draco, format, path, sizeBytes

### Community 52 - "QualifyingManager.js"
Cohesion: 0.16
Nodes (14): buildQualifyingStandings(), canSkipQualifying(), computeSimulatedQualifyingLap(), createInitialQualifyingState(), finalizeQualifyingStage(), getQualifyingStageDuration(), hashDriverStage(), isCarParkedInBox() (+6 more)

### Community 53 - "asphalt_pit_lane"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, asphalt_pit_lane

### Community 54 - "gravelly_sand"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, gravelly_sand

### Community 55 - "PitLaneGeometry.js"
Cohesion: 0.14
Nodes (15): COMPACT_STREET_SPEC, DEFAULT_PIT_LANE_SPEC, getPitLaneConfig(), PIT_LANE_CONFIG_BY_TRACK, WIDE_PERMANENT_SPEC, buildPitLaneData(), clamp(), sampleTrackAtSignedOffset() (+7 more)

### Community 56 - "Importazione Modelli Sketchfab (Drop-in Automatico)"
Cohesion: 0.50
Nodes (3): Importazione Modelli Sketchfab (Drop-in Automatico), Monoposto F1 2026 (11 Scuderie), Piloti, Garage e Prop Opzionali

### Community 57 - "build_f1_trophies.py"
Cohesion: 0.22
Nodes (22): add_box(), add_cylinder(), build_dhl_fastest_lap_award(), build_fia_wcc_trophy(), build_fia_wdc_trophy(), build_gp_chalice(), build_gp_classic(), build_gp_materials() (+14 more)

### Community 58 - "textures"
Cohesion: 0.22
Nodes (9): diff, nor_gl, rough, diff, nor_gl, rough, textures, asphalt_track (+1 more)

### Community 61 - "grass_004"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, grass_004

### Community 62 - "MenuManager.js"
Cohesion: 0.07
Nodes (56): F1_AWARD_ORDER, F1_AWARDS, formatAwardsSummary(), SIM_POINTS_BY_POSITION, CAR_PHYSICS_CONFIG, LOCAL_PLAYER_ID, TIRE_COMPOUNDS, DEFAULT_DIFFICULTY_ID (+48 more)

### Community 63 - "ferrari"
Cohesion: 0.33
Nodes (6): cars, ferrari, draco, path, sizeBytes, source

### Community 64 - "emscripten_realloc_buffer"
Cohesion: 0.50
Nodes (4): emscripten_realloc_buffer(), _emscripten_resize_heap(), getHeapMax(), updateMemoryViews()

### Community 65 - "intArrayFromString"
Cohesion: 0.50
Nodes (4): ensureString(), intArrayFromString(), lengthBytesUTF8(), stringToUTF8Array()

### Community 66 - "WorldState"
Cohesion: 0.13
Nodes (10): physicsSettingsFromLegacyDifficulty(), cloneCarTiming(), cloneQualifyingState(), cloneSessionTiming(), WorldState, createInitialRaceState(), getEffectiveTotalProgress(), GRID_WAIT_AFTER_QUALI_SECONDS (+2 more)

### Community 67 - "power_box_01"
Cohesion: 0.40
Nodes (5): power_box_01, draco, format, path, sizeBytes

### Community 68 - "UiTheme.js"
Cohesion: 0.13
Nodes (18): clampByte(), DEFAULT_KEY_HINTS, escapeAttr(), generateLowPolyBackgroundSvg(), generateTeamEmblemSvg(), generateTrackOutlineSvg(), getTrackCornersCount(), hash2D() (+10 more)

### Community 69 - "initGame"
Cohesion: 0.14
Nodes (3): GameLoop, InputManager, initGame()

### Community 71 - "Proposed Changes (Step-by-Step)"
Cohesion: 0.14
Nodes (14): [MODIFY] `src/cars/CarModel3D.js`, `src/rendering/SceneManager.js` & `src/rendering/GarageScene3D.js`, [MODIFY] `src/rendering/GarageScene3D.js`, [MODIFY] `src/tracks/TrackBuilder.js`, `src/rendering/PitStopAnimator3D.js`, `scripts/import-and-optimize-glbs.mjs` & `public/assets/3d/manifest.json`, [NEW] `src/cars/CarLiveryAndNumbers.js`, [NEW] `src/cars/DriverModel3D.js` & [MODIFY] `src/cars/CarModel3D.js`, [NEW] `src/tracks/TrackProps3D.js` & [MODIFY] `src/tracks/TrackBuilder.js`, Proposed Changes (Step-by-Step), Step 1 — Infrastruttura Asset 3D, Loader Draco/HDRI e Download Automatico CC0 *(COMPLETATO)* (+6 more)

### Community 72 - "CarPhysics.js"
Cohesion: 0.35
Nodes (11): ADVANCED_PHYSICS_CONFIG, clamp(), evalCubicBezier(), evalCubicBezierDeriv(), handleAutoPitBoxControl(), lerpAngleRad(), updateAutomaticGearbox(), wrapAngleRad() (+3 more)

### Community 73 - "build-custom-asphalt-pbr.mjs"
Cohesion: 0.27
Nodes (9): clamp(), main(), mulberry32(), OUT_DIR, ROOT, sampleTransform(), SOURCE_PATH, synthesizeToroidalLayer() (+1 more)

### Community 74 - "SceneManager"
Cohesion: 0.11
Nodes (3): getLowerNightQuality(), getNightQualityConfig(), SceneManager

### Community 75 - "Richiesta Pianificazione — PIANO PRE STEP 4"
Cohesion: 0.22
Nodes (8): 1. Pit Lane, Box Scuderie e Aggiornamento Piano 3D, 2. Interfaccia (HUD), Minimappe e Transizioni, 3. Nuovo Flusso Qualifiche (Q1 → Q2 → Q3 → Griglia di Gara), 4. Miglioramento Bot e Valutazione IA, 5. Fisica: Degrado Gomme, Pit Stop e Sezione Impostazioni "FISICA", 6. Modalità Carriera Predefinita (Calendario Fisso + 3 Preset), Deliverable Richiesti, Richiesta Pianificazione — PIANO PRE STEP 4

### Community 76 - "PhysicsDiagnostics.js"
Cohesion: 0.50
Nodes (11): createInitialCarState(), stepCarPhysics(), computeCarTelemetrySnapshot(), makeRealTrackSurfaceForGrass(), makeTestCar(), runPhysicsDiagnosticSuite(), runScenario1StandingStart(), runScenario2FullBraking() (+3 more)

### Community 77 - "prompt-modifiche-random.md"
Cohesion: 0.29
Nodes (6): 1. Rimozione Sistema Soldi, Upgrade e Pulizia UI, 2. Gestione Carriera (Avvio, Blocco Scuderia, Reset e Storico), 3. Sezione Trofei e Premi Reali (Qualifiche + Gare), 4. Schermata Selezione Team (`TEAM SELECT`), 5. Schermata Selezione Pista (`TRACK SELECT`), Deliverable Richiesti (Step 0)

### Community 78 - "Crediti e Licenze Asset 3D"
Cohesion: 0.29
Nodes (5): 1. Texture PBR 2K — Poly Haven & AmbientCG (CC0 Public Domain), 2. HDRI Sky & Environment Reflections — Poly Haven (CC0 Public Domain), 3. Modelli 3D Natura, Pista & Officina — Poly Haven (CC0 Public Domain), 4. Monoposto, Piloti e Garage F1 — Sketchfab (CC-BY / CC-BY-NC-SA), Crediti e Licenze Asset 3D

### Community 79 - "DaySkyDome"
Cohesion: 0.27
Nodes (5): CORNER_DEFS, createMechanicMesh(), createPitStopRig(), createSpareWheelMesh(), PitStopAnimator3D

### Community 80 - "coast_sand_01"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, coast_sand_01

### Community 81 - "concrete_wall_007"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, concrete_wall_007

### Community 82 - "metal_plate"
Cohesion: 0.50
Nodes (4): diff, nor_gl, rough, metal_plate

### Community 83 - "Catalogo Verificato degli Asset 3D Trovati"
Cohesion: 0.29
Nodes (7): A. Monoposto delle 11 Scuderie F1 2026, B. Corpi dei Piloti 3D (Seduti in Abitacolo), C. Alberi, Erba e Natura Circostante (100% Download Automatico CC0), Catalogo Verificato degli Asset 3D Trovati, D. Pista Realistica & Strutture Bordo Pista (Download Automatico CC0), E. Garage F1 3D (`GARAGE & UPGRADE`), F. Pit Lane 3D, Box delle 11 Scuderie & Meccanici Pit Stop (Tutte le 24 Piste — Integrato con `PIANO PRE STEP 4`)

### Community 84 - "ModalManager"
Cohesion: 0.19
Nodes (4): isElement(), isHtmlBtn(), isHtmlEl(), ModalManager

### Community 85 - ".constructor"
Cohesion: 0.19
Nodes (10): CAMERA_MODES, CAMERA_FEEL_CONFIG, CAMERA_STORAGE_KEY, CameraController, clamp(), DEFAULT_CAMERA_MODE_ID, loadDefaultCameraMode(), MAX_ONBOARD_HORIZON_PITCH_RAD (+2 more)

### Community 86 - "TrophyMuseumScene3D.js"
Cohesion: 0.22
Nodes (13): ALL_TROPHY_IDS, createMuseumStoneFloorTexture(), drawGpSlotPlaque(), drawPedestalPlaque(), drawRoundedRect(), drawWallBannerTexture(), fitText(), formatCareerShortLabel() (+5 more)

### Community 87 - "PIANO A — Upgrade Asset 3D Ad Alta Risoluzione (Monoposto 2026, Piloti, Natura, Piste PBR, Garage 3D & Pit Lane/Box 24 Piste)"
Cohesion: 0.29
Nodes (7): Architettura della Pipeline Asset 3D, Automated Tests, Goal Description, Manual Verification, PIANO A — Upgrade Asset 3D Ad Alta Risoluzione (Monoposto 2026, Piloti, Natura, Piste PBR, Garage 3D & Pit Lane/Box 24 Piste), User Review Required, Verification Plan

### Community 88 - "PIANO B *(ex PIANO MODIFICHE PRE STEP 3)*"
Cohesion: 0.29
Nodes (5): Decisioni Confermate, Flusso Stati Carriera (`v3`), Obiettivo, PIANO B *(ex PIANO MODIFICHE PRE STEP 3)*, Stato Avanzamento Step

### Community 89 - "AeroAndTires.js"
Cohesion: 0.73
Nodes (5): clamp(), createInitialAeroTireState(), fitFreshTires(), getTireCompoundSpec(), updateAeroAndTires()

### Community 90 - "fia_wcc"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, fia_wcc

### Community 91 - "fia_wdc"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, fia_wdc

### Community 92 - "gp_chalice"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, gp_chalice

### Community 93 - "gp_classic"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, gp_classic

### Community 94 - "gp_modern"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, gp_modern

### Community 95 - "gp_monaco"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, gp_monaco

### Community 96 - "namaqualand_boulder_02"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, namaqualand_boulder_02

### Community 97 - "pirelli_pole"
Cohesion: 0.40
Nodes (5): draco, format, path, sizeBytes, pirelli_pole

## Knowledge Gaps
- **5 isolated node(s):** `graphify explain`, `graphify path`, `graphify section`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 460 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cartella `src/`` connect `draco_wasm_wrapper.js` to `WorldState`, `MenuManager`, `initGame`, `GIOCO F1 3D — Simulatore Formula 1 2026 (Contesto Completo per Claude & Sviluppatori)`, `TrackBuilder.js`, `main.js`, `RoomManager`, `SceneManager`, `TrackMapHud`, `queryTrackSurface`, `AssetManager3D`, `WeatherAndTireFx`?**
  _High betweenness centrality (0.297) - this node is a cross-community bridge._
- **Are the 178 inferred relationships involving `ha()` (e.g. with `ac()` and `Ad()`) actually correct?**
  _`ha()` has 178 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify explain`, `graphify path`, `graphify section` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prompt per Antigravity — Gioco di F1 realistico (web app 3D)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `Yh()` connect `ma` to `Ka`, `draco_wasm_wrapper.js`, `ha`, `Ka`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ja()` (e.g. with `ha()` and `e()`) actually correct?**
  _`ja()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11462450592885376 - nodes in this community are weakly interconnected._