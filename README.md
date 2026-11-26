# GIOCO F1 3D — Simulatore Formula 1 2026 (Contesto Completo per Claude & Sviluppatori)

Web app 3D di simulazione Formula 1 (calendario e griglia **F1 2026**), costruita in **Vanilla JavaScript (ES Modules)**, **Three.js**, **PeerJS** e **Vite**, pubblicata su GitHub Pages (`https://samueleminardi08-svg.github.io/SIMULATORE-F1/`).

> Questo documento fornisce una mappa completa di **architettura**, **struttura file**, **contenuti di gioco**, **pipeline asset 3D**, **stato dei lavori** e **vincoli tecnici** per lavorare sul progetto in sicurezza fin dal primo prompt.

---

## 1. Stack Tecnico & Comandi Rapidi

| Voce | Dettaglio |
|---|---|
| **Runtime Browser** | Vanilla ES Modules (`"type": "module"` in `package.json`), nessun framework UI (HTML/CSS/DOM nativo in `index.html` + `src/ui/`) |
| **Motore 3D** | `three` (`^0.170.0`) con `GLTFLoader`, `DRACOLoader`, `RGBELoader`, `PMREMGenerator`, `Reflector`, `ACESFilmicToneMapping`, `SRGBColorSpace` |
| **Multiplayer P2P** | `peerjs` (`^1.5.5`) + fallback/canale locale `BroadcastChannel` (`RoomManager.js`) |
| **Bundler** | `vite` (`^6.0.0`) con `base: './'` in `vite.config.js` |
| **Ottimizzazione GLB (devDependencies)** | `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `draco3dgltf`, `sharp` (Node.js v24) |
| **Knowledge Graph** | **Graphify** attivo in `graphify-out/` (vedi regole in `CLAUDE.md`) |
| **OS / Shell locale** | Windows + PowerShell 5.1 (catena comandi con `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };`, mai `&&`; usare `npm.cmd`) |

### Comandi NPM & Workflow
- `npm.cmd run dev` — avvia Vite dev server (tipicamente su `http://localhost:5173/`)
- `npm.cmd run build` — genera la build di produzione in `dist/` (copia automaticamente `public/draco/` e `public/assets/3d/`)
- `npm.cmd run preview` — anteprima locale della build `dist/`
- `npm.cmd run assets:fetch-cc0` — scarica automaticamente texture PBR 2K, HDRI 2K e modelli 3D CC0 (Poly Haven & AmbientCG) e rigenera `public/assets/3d/manifest.json` + `CREDITS_ASSETS.md`
- `npm.cmd run assets:import` — ottimizza/comprime (Draco + WebP max 1024px) `2026_ferrari_sf-26.glb` e gli eventuali `.glb` depositati in `assets_import/sketchfab/`
- `graphify update .` — aggiorna il knowledge graph AST-only dopo ogni modifica al codice

---

## 2. Architettura a Layer

Il simulatore separa rigorosamente la simulazione dal rendering e dall'interfaccia:

```text
InputManager + VirtualInputFilter ──┐
                                    ▼
RoomManager (PeerJS) ──────► WorldState (Simulation Layer, 60 Hz fisso, pure data)
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
  CarPhysics / Collisions    RaceManager / TimingSystem    CareerStorage / TrackRecordsStorage
  Suspension / AeroAndTires  QualifyingManager / Bots      (localStorage JSON persistente)
         │
         ▼
  SceneManager (Presentation Layer Three.js, ACES Filmic, HDRI, PBR 2K)
   ├── TrackBuilder + TrackBiomes (geometria 1:1 da TrackSurface)
   ├── CarModel3D (template GLB Draco + fallback procedurale)
   ├── CameraController (Onboard T-Cam / Prima Persona Abitacolo)
   └── GarageScene3D (Showroom dark-luxury con Reflector)
         │
         ▼
  MenuManager + ModalManager + HudOverlay + TrackMapHud (UI Layer)
```

- **Simulation Layer (`src/core/`, `src/physics/`, `src/race/`, `src/ai/`, `src/tracks/TrackSurface.js`):** **zero dipendenze da Three.js o dal DOM**, stato 100% serializzabile JSON (`WorldState.getSnapshot()`), compatibile con test headless in Node.js e sincronizzazione P2P Host/Client.
- **Presentation Layer (`src/rendering/`, `src/cars/CarModel3D.js`, `src/tracks/TrackBuilder.js`, `src/tracks/TrackBiomes.js`):** legge lo stato da `WorldState` senza mai mutarlo e gestisce mesh 3D, luci, PBR, HDRI, particelle e camere.
- **Asset & Persistence Layer (`public/assets/3d/manifest.json`, `src/career/`):** caricamento asincrono anti-404 guidato da `manifest.json`; salvataggio locale di Carriera, Upgrade R&D e Record Pista in `localStorage`.

---

## 3. Struttura Completa del Progetto

### Root del Repository
- `index.html` — Shell HTML, fogli di stile completi dell'interfaccia F1 (Home, Team Select, Track Select, Garage & Upgrade, HUD gara, Torre broadcast 22 piloti, Minimappa, Modali Q1–Q3/Pausa/Impostazioni/Multiplayer).
- `package.json`, `package-lock.json`, `vite.config.js`, `.gitignore`
- `CLAUDE.md` — Regole operative Graphify per Claude (`graphify query` prima di leggere file grezzi, `graphify update .` dopo le modifiche).
- `CREDITS_ASSETS.md` — Elenco auto-generato delle licenze CC0 (Poly Haven / AmbientCG) e CC-BY / CC-BY-NC-SA (Sketchfab).
- `2026_ferrari_sf-26.glb` — Modello sorgente originale Ferrari SF-26 (31,2 MB / ~29,8 MiB; la versione ottimizzata runtime sta in `public/assets/3d/cars/ferrari.glb` a `3,94 MB`).

### Cartella `src/`
- `src/main.js` — Bootstrap applicazione (`initGame()`), orchestrazione di `WorldState`, `SceneManager`, `GameLoop`, `InputManager`, `RoomManager`, `MenuManager`, `HudOverlay`, `TrackMapHud`, `CareerStorage` e `TrackRecordsStorage`.
- `src/config/`
  - `constants.js` — `SIMULATION_TICK_RATE` (60 Hz), quote F1 2026 (`carWidth: 1.90 m`, `carLength: 5.32 m`, `wheelbase: 3.40 m`, `wheelRadius: 0.35 m`), cambio 8 marce (`gearTopSpeeds`, `maxRpm: 15000`), `VIRTUAL_INPUT_CONFIG`, `SURFACE_PHYSICS` (`asphalt`, `kerb`, `grass`), `COLLISION_CONFIG`, `ADVANCED_PHYSICS_CONFIG`, `WEATHER_CONFIG` (`dry`, `rain`), `CAMERA_MODES` (`tcam`, `cockpit`).
  - `difficulty.js` — 3 difficoltà (`beginner`, `intermediate` default, `realistic`) con moltiplicatori separati per ABS, cadence braking assist, traction control, grip erba/pioggia, usura gomme, instabilità frenata ad alta velocità e passo bot (`85% / 94% / 100%`).
  - `f1_2026_data.js` — Costanti giri (`RACE_TOTAL_LAPS = 10`, `CAREER_RACE_LAPS = 5`), **11 scuderie F1 2026** (`mclaren`, `ferrari`, `red_bull`, `mercedes`, `aston_martin`, `williams`, `alpine`, `racing_bulls`, `haas`, `audi`, `cadillac`) con colori e `pace`, e **22 piloti ufficiali 2026** con codice a 3 lettere, numero di gara (`#1`–`#87`), casco e `skill`.
- `src/core/`
  - `GameLoop.js` — Ciclo `requestAnimationFrame` a timestep fisso (`FIXED_DT = 1/60s`, clamp accumulatore `0.25s`).
  - `WorldState.js` — Stato completo del mondo: `cars`, `trackSurface`, `sessionTiming`, `raceState`, `qualifyingState`, `weather`, `difficultyId`, `sessionConfig`, `spawnFullGrid()`, `step()`, `getSnapshot()`.
- `src/physics/`
  - `CarPhysics.js` — Integrazione cinematica/dinamica 2D/3D (trazione 8 marce, frenata progressiva, drag aero `v²`, sterzo speed-sensitive, proiezione laterale, elevazione locale su `trackSurface`, rotazione ruote con blocco anteriori in `wheelLockup`).
  - `AeroAndTires.js` — Carico aerodinamico (`downforceKg`, `aeroGripBonus`), valutazione `wheelLockup` con `cadenceAssistGraceTime`, `highSpeedBraking` e consumo progressivo gomme (`tireHealth`).
  - `Suspension.js` — Sospensioni dinamiche a 4 ruote (`pitch`, `roll`, `heave`, `wheelOffsetY` su cordoli ed erba).
  - `Collisions.js` — Urto anelastico contro guardrail (`resolveTrackBarrierCollision`) e collisioni vettura-vettura tra tutte le 22 monoposto (`resolveCarToCarCollisions`).
  - `PhysicsDiagnostics.js` — Telemetria diagnostica per pannello debug `F3`.
- `src/input/`
  - `InputManager.js` — Listener tastiera/azioni (`WASD`/Frecce guida, `C` cambia camera, `R` meteo, `Esc` pausa/menù).
  - `VirtualInputFilter.js` — Filtro rampa 0..1 progressivo e speed-sensitive per input digitale da tastiera (esclusi bot/analogici).
- `src/ai/`
  - `BotController.js` — Guida autonoma AI su spline pista con sorpassi per corsia (`targetLaneOffset`), modulazione velocità in curva e passo per pilota/scuderia/difficoltà.
- `src/race/`
  - `RaceManager.js` — Griglia di partenza sfalsata 22 posizioni (`computeStartingGridTransforms`), semaforo a 5 luci rosse, conteggio giri, distacchi, bandiera a scacchi e giro di rientro.
  - `QualifyingManager.js` — Weekend Q1 (`4:00`), Q2 (`3:30`), Q3 (`2:30`) con eliminazioni (P17–P22 dopo Q1, P11–P16 dopo Q2, Top 10 in Q3), griglia finale per la gara e skip a voto unanime P2P.
  - `TimingSystem.js` — Rilevamento attraversamento traguardo e dei **3 settori (`S1`, `S2`, `S3`)**, stati viola/verde/giallo, `personalBest` e `overallBest`.
- `src/tracks/`
  - `calendar2026/index.js` + 24 file circuito (`melbourne.js` … `abu_dhabi.js`) — Tutti i **24 circuiti F1 2026** in scala 1:1 metrica (`width` 9.0–11.0 m cittadini / 13.0–15.0 m permanenti, `mainStraightWidth`, `kerbStyle`, `sectorSplits`, `controlPoints`, supporto elevazioni es. ponte a 8 di Suzuka).
  - `TrackSurface.js` — Campionamento ad alta densità (`1600` campioni su spline chiusa), `queryTrackSurface()` veloce con `hintIndex` per superficie (`asphalt`, `kerb`, `grass`), elevazione e distanza barriere locali.
  - `TrackBiomes.js` — Classifica i 24 circuiti in **4 biomi** (`european_park`: 10, `tropical_coastal`: 5, `desert_night`: 4, `urban_street`: 5) con **6 GP notturni** (`bahrain_2026`, `jeddah_2026`, `qatar_2026`, `yas_marina_2026`, `singapore_2026`, `las_vegas_2026`).
  - `TrackBuilder.js` — Costruzione mesh pista 3D (`grassMesh`, runoffs, asfalto con UV metriche al `child[3]`, linee bianche FIA, ponte sopraelevato, cordoli per stile nazionale, barriere, portale partenza, 22 caselle griglia, alberi temporanei) + idratazione asincrona **PBR 2K** dal manifest.
  - `test_track.js` — Tracciato ovale/base legacy di test.
- `src/cars/`
  - `CarSpecs.js` — 5 categorie R&D (`engine`, `tires`, `suspension`, `brakes`, `aero`, livelli `0..5`) e preset `base` / `max`.
  - `CarModel3D.js` — Modello monoposto 3D da `2026_ferrari_sf-26.glb` (scalato a 1.90 m × passo 3.40 m, ruote FL/FR/RL/RR separate per quadrante, freni `discs.008`, volante rotante, ricolorazione livree team non-Ferrari, casco pilota, fallback procedurale immediato per caricamento asincrono/Node).
- `src/rendering/`
  - `AssetManager3D.js` — Singleton loader (`GLTFLoader` + `DRACOLoader` WASM locale, `RGBELoader` + `PMREMGenerator`, cache texture PBR 2K e `loadHDRIBundle()` 2K equirettangolare + envMap PMREM), path compatibili sia con `localhost` che con GitHub Pages.
  - `SkyPresets.js` — Catalogo dei **9 cieli 2K Pure Skies** (`clear_day`, `partly_cloudy`, `sunrise`, `sunset`, `cloudy_sunset`, `overcast`, `rain`, `heavy_rain`, `night_clear`) + `'random'` (`Casuale`) con sorteggio **Opzione A** (pool dedicato per GP notturni vs diurni), integrato in `WorldState`, `SceneManager`, menù e HUD.
  - `WeatherAndTireFx.js` — Effetti atmosferici e particellari 3D a pool preallocati (pioggia 3D inclinata dalla velocità su 2 layer, spray d'acqua volumetrico a 3 flussi *rooster tail* `RL`/`RR` + diffusore `~ v²`, fumo bloccaggio dalla sola ruota anteriore interna `0.24 m → 2.15 m`).
  - `SceneManager.js` — Renderer WebGL (`ACESFilmicToneMapping`, `SRGBColorSpace`, ombre `PCFSoftShadowMap` 2048×2048), gestione modalità Garage vs Pista vs Track Preview, HDRI e meteo asciutto/pioggia dinamici, integrazione `WeatherAndTireFx` e ciclo `render()`.
  - `CameraController.js` — 2 visuali commutabili con `C` (visuale iniziale configurabile in Impostazioni e persistita in `localStorage`): `tcam` (Onboard TV Pod sopra Halo) e `cockpit` (Prima persona Abitacolo realistico con Halo centrale, specchietti, gomme anteriori, volante con schermo LCD OLED live, 15 LED RPM e guanti FIA).
  - `GarageScene3D.js` — Showroom dark-luxury con pavimento specchiante (`Reflector`), pedana circolare col colore della scuderia e orbita interattiva 360° per `Home`, `Team Select` e `Garage & Upgrade`.
- `src/career/`
  - `CareerStorage.js` — Salvataggio Carriera in `localStorage` (budget `$`, team, nome/codice pilota, statistiche gare/vittorie/podi/pole/punti, livelli R&D `0..5`, circuito selezionato, export/import JSON e reset).
  - `TrackRecordsStorage.js` — Record persistenti per tutte le 24 piste: miglior giro Qualifica, miglior giro Gara, migliori settori S1/S2/S3, calcolo giro ideale e notifiche in pista al nuovo record battuto.
- `src/network/`
  - `RoomManager.js` — Stanze Multiplayer P2P tramite PeerJS con codice stanza (`F1-XXXX`), trasmissione input Client → Host e snapshot stato Host → Client (incluse votazioni unanimi skip qualifiche).
- `src/ui/`
  - `MenuManager.js` — Controller di tutte le schermate menù (Home, Team Select con carosello 11 team e scelta pilota, Track Select con carosello 24 circuiti + record + lap stepper, Garage & Upgrade R&D con 5 reparti e telemetria live, Modale Profilo/Salvataggio, Impostazioni, Lobby Multiplayer).
  - `ModalManager.js` — Gestione centralizzata modali (`Escape`, focus trap, chiusura backdrop).
  - `HudOverlay.js` — Torre broadcast 22 piloti con loghi e mescole (`S`/`M`/`H`/`W`), telemetria centrale (marce `N/R/1..8`, RPM, km/h, carico aero, stato gomme, alert bloccaggio, track limits `TL 0/3`, meteo), banner nuovo record pista/settore, barra progressione qualifiche e modali classifica fine Q1–Q3 / fine Gara + premi Carriera.
  - `TrackMapHud.js` — Minimappa 2D su canvas con settori `S1/S2/S3` colorati e puntini in tempo reale delle 22 vetture.
  - `UiTheme.js` — Tema colore dinamico per scuderia, generazione SVG tracciati e loghi ufficiali team (`src/assets/logos/`).
- `scripts/`
  - `asset-catalog.mjs`, `fetch-cc0-assets.mjs`, `import-and-optimize-glbs.mjs`, `generate_f1_2026_tracks.mjs`.
- `public/` e `assets_import/`
  - `public/draco/` — Decoder Draco WASM (`draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js`).
  - `public/assets/3d/` — `manifest.json`, `textures/` (8 set PBR 2K), `hdri/` (9 Pure Skies 2K + `studio_small_09` 1K + legacy), `models/` (16 modelli CC0 Poly Haven: `nature`, `track`, `garage`), `cars/ferrari.glb` (Draco+WebP 3,94 MB).
  - `assets_import/sketchfab/README.md` — Guida drop-in con i link verificati su Sketchfab per importare opzionalmente le altre 10 monoposto, piloti e garage 3D.

---

## 4. Contenuti & Gameplay

- **24 Circuiti Ufficiali F1 2026 (scala 1:1 metrica):**
  - **Cittadini (9.0–11.0 m):** Monaco, Jeddah, Madrid (`Madring`), Baku, Singapore, Las Vegas.
  - **Permanenti (13.0–15.0 m):** Melbourne, Shanghai, Suzuka (con ponte a 8 sopraelevato), Bahrain, Miami, Montreal, Barcellona, Red Bull Ring, Silverstone, Spa-Francorchamps, Hungaroring, Zandvoort, Monza, Austin, Messico, Interlagos, Qatar, Yas Marina.
- **11 Scuderie & 22 Piloti 2026:** Griglia completa con livree, caschi, numeri di gara (`#1` Norris, `#81` Piastri, `#16` Leclerc, `#44` Hamilton, `#3` Verstappen, `#6` Hadjar, `#63` Russell, `#12` Antonelli, `#14` Alonso, `#18` Stroll, `#23` Albon, `#55` Sainz, `#10` Gasly, `#43` Colapinto, `#30` Lawson, `#41` Lindblad, `#31` Ocon, `#87` Bearman, `#27` Hülkenberg, `#5` Bortoleto, `#11` Pérez, `#77` Bottas).
- **Modalità di Gioco:**
  - **Carriera F1 2026 (5 giri):** Campionato sequenziale sui 24 GP con formato *Gara Diretta (5 Giri)* o *Qualifiche Q1–Q3 + Gara*, premi in denaro (`$`), 5 aree potenziamenti R&D × 5 livelli (`25` livelli totali) in *Garage & Upgrade* e salvataggio/esportazione JSON.
  - **Sessione Rapida & Prove Libere:** Qualifiche Q1–Q3 complete, Prove Libere (da solo o con 22 bot, giri `∞` o finiti, Auto Base o Auto MAX), Gara Singola (giri configurabili 1–99).
  - **Multiplayer Online P2P:** Creazione stanza `F1-XXXX`, partecipazione via codice, sincronizzazione griglia/meteo/cielo, qualifica con voto unanime di skip.
- **Comandi di Gioco:** `W/A/S/D` o `Frecce` guida, `C` cambia visuale (`Onboard T-Cam` / `Prima persona Abitacolo`, con visuale iniziale configurabile nelle Impostazioni), `R` cambia meteo (`Asciutto`/`Pioggia`), `P` prenota/annulla rientro ai box (`BOX`), `F3` pannello diagnosi fisica in tempo reale, `Esc` menù pausa.

---

## 5. Stato Attuale dei Lavori (Roadmap)

Il progetto segue due piani di lavoro distinti (conservati negli artifact di conversazione):

### A. `PIANO A` *(ex `PIANO GRAFICA 3D`)* — Upgrade Asset 3D Ad Alta Risoluzione (dettaglio completo in [docs/PIANO_A.md](docs/PIANO_A.md))
- **Step 1 — Infrastruttura 3D, Draco & Pipeline CC0:** **COMPLETATO** (`AssetManager3D.js`, `public/draco/`, `fetch-cc0-assets.mjs`, `import-and-optimize-glbs.mjs`, 8 texture PBR 2K, 16 modelli CC0, `ferrari.glb` 3,94 MB, `manifest.json`, `CREDITS_ASSETS.md`).
- **Step 2 — Piste PBR 2K + Cielo/Riflessi HDRI (24 Circuiti):** **COMPLETATO e verificato nel browser** (`TrackBiomes.js`, `TrackBuilder.js` PBR 2K con fix washout erba e asfalto PBR custom, `SceneManager.js` ACES Filmic + HDRI dinamico).
- **Step 3 — Alberi 3D, Erba/Rocce per Bioma & Strutture Bordo Pista 3D (`TrackProps3D.js`):** *Da fare.*
- **Step 4 — Monoposto 11 Scuderie + Decal 3D Numeri Pilota (`#1..#87`):** *Da fare.*
- **Step 5 — Corpi dei Piloti 3D nell'Abitacolo (`DriverModel3D.js`):** *Da fare.*
- **Step 6 — Box F1 3D dedicato in `GARAGE & UPGRADE` + Report finale:** *Da fare.*
- **Step 7 — Pit Lane 3D, 11 Box Scuderie ad Alta Definizione & Meccanici Pit Stop (24 Piste):** *Da fare* — sostituire i placeholder strutturali del `PIANO PRE STEP 4` con modelli 3D dettagliati ricercati su **Sketchfab** (o cataloghi alternativi CC0/CC-BY se assenti su Sketchfab), ottimizzati Draco+WebP e personalizzati per ciascuna delle 11 scuderie su tutti i 24 circuiti.

### B. `PIANO SUB-STEP 2` (Realismo Visivo Monoposto, Particelle & Cieli HDRI — 100% Estetico)
- **Vincolo tassativo:** **ZERO modifiche alla fisica** (`src/physics/` e `src/config/constants.js` restano intatti).
- **Step 1 — Catalogo 9 Cieli 2K Pure Skies + `SkyPresets.js` + `AssetManager3D.loadHDRIBundle()` + Opzione A Carriera:** **COMPLETATO e verificato nel browser** (9 Pure Skies 2K scaricati e validati).
- **Step 2 — Ruote centrate/stabili (solo rotazione/sterzata/cordoli) + Sospensioni attive visive + Bloccaggio su ruota anteriore interna (`CarModel3D.js`, `CameraController.js`):** **COMPLETATO** (centratura geometrica PCA assi ruote, sospensioni attive smorzate, sollevamento singola ruota su cordolo e `resolveLockedFrontWheels`).
- **Step 3 — Pioggia 3D inclinata, Spray 3 flussi e Fumo gomma volumetrico (`WeatherAndTireFx.js`):** **COMPLETATO** (`WeatherAndTireFx.js` integrato in `SceneManager.js` con pioggia 3D su 2 layer, spray 3 flussi fino a 65 m e fumo bloccaggio volumetrico dalla sola ruota anteriore interna).
- **Step 4 — Integrazione Cieli 2K Nitidi + UI Selettore (`Casuale` + 9 cieli) + Carriera casuale Opzione A + HUD:** **COMPLETATO** (`skyPresetId` su `WorldState` e sync P2P, sorteggio automatico Carriera Opzione A con nota dedicata, selettori sincronizzati in Sessione Rapida / Track Select / Impostazioni / Multiplayer Host, ciclo rapido `R` Asciutto → Pioggia → Pioggia Forte, badge meteo tematico e label cielo esatta su HUD e Pausa).

### C. `PIANO PRE STEP 4` (Pit Lane, Qualifiche dai Box, Bot Avanzati, Fisica Modulare & Carriera Fissa)
- **Step 0 — Aggiornamento `PIANO A`:** **COMPLETATO** ([docs/PIANO_A.md](docs/PIANO_A.md) + `README.md`).
- **Step 1 — Pit Lane, 11 Box Scuderie (geometrie base) & Guida Olografica 3D (24 Piste, limiti FIA 2026 60/80 km/h):** **COMPLETATO e verificato nel browser** (`PitLaneConfig.js`, `PitLaneGeometry.js`, `TrackSurface.js`, `Collisions.js`, `TimingSystem.js`, `TrackBuilder.js`, `PitGuideOverlay3D.js`, `SceneManager.js`; test Node 24/24 piste con clearance minima `11.73 m`, build Vite, verifica visiva Monaco `60 km/h`, Monza e Singapore notturno con `0` errori console e `0` HTTP `>= 400`).
- **Step 2 — HUD Minimappa in alto a destra, Minimappa Pit Lane, Semaforo Ingegnere di Gara, Transizioni & Loading Screen:** **COMPLETATO e verificato nel browser** (`PitLaneMapHud.js`, `LoadingScreenManager.js`, `index.html`, `HudOverlay.js`, `MenuManager.js`, `main.js`; minimappa principale in alto a destra, minimappa Pit Lane a sinistra con 11 box e allerta traffico, semaforo Verde/Rosso in alto al centro, pannello `F3` in basso a destra, transizioni menu 240ms e schermata di caricamento F1 con anteprima circuito; 0 sovrapposizioni su Chase/Cockpit/Onboard T-Cam Halo HUD, `0` errori console e `0` HTTP `>= 400`).
- **Step 3 — Nuovo Flusso Qualifiche (Q1→Q2→Q3→Griglia dai Box, FIA Unsafe Release Art. 34.14, coda automatica a ~2m & rilascio 1 ogni 10s all'uscita, limitatore auto 60/80 km/h, auto-park, classifica 10s, griglia 10s):** **COMPLETATO e verificato nel browser** (`PitLaneManager.js`, `QualifyingManager.js`, `RaceManager.js`, `BotController.js`, `CarPhysics.js`, `WorldState.js`, `CameraController.js`, `SceneManager.js`, `PitGuideOverlay3D.js`, `HudOverlay.js`, `index.html`, `main.js`; spawn Q1/Q2/Q3 nei box con camera Front-3/4 anti-clipping, uscita libera dai box bloccata solo per vero unsafe release FIA Art. 34.14(a), accodamento automatico in fast lane a ~2.0 m muso-alettone con avanzamento sincronizzato alla vettura davanti e attesa di 10.0s al semaforo di uscita pit prima del lancio in pista, completamento giro lanciato a 0:00 + rientro guidato o rapido + parcheggio automatico nel box, countdown 10s automatico classifica e attesa pre-semafori 10s in griglia di gara; test Node su Monza/Monaco/Baku + 24 circuiti, `0` errori console e `0` HTTP `>= 400`).
- **Step 4 — Miglioramento Bot (Racing Line Ideale + Profili Pilota Differenziati):** **COMPLETATO e verificato nel browser** (`RacingLineSolver.js`, `DriverProfiles.js`, `BotController.js`, `VirtualInputFilter.js`, `TrackSurface.js`, `AeroAndTires.js`, `Collisions.js`, `PitLaneManager.js`, `WorldState.js`; pre-calcolo traiettoria ideale a curvatura minima + profilo velocità 2 passate su tutte le 24 piste in `~13.4 ms`, 22 profili comportamentali F1 2026 con frenata/gas modulabili anti-lockup, cost map 7 corsie con spazio affiancato F1, strategia pit stop autonomo bot in gara e fix guardia prossimità pit lane in `Collisions.js`; benchmark Node 22 vetture × 3 giri passati su Monza/Monaco/Spa con `22/22` al traguardo, `0` urti severi, `0.076–0.090 ms/tick` per 21 bot; verifica visiva browser `1280×720` su partenza da griglia a Monza e qualifica a Monaco `60 km/h` con `0` errori console e `0` HTTP `>= 400`).
- **Step 5 — Sezione Impostazioni `FISICA` (toggle indipendenti + slider Bot IA), Degrado Gomme Visivo (Graining & Blistering) & Pit Stop Animato in Gara:** **COMPLETATO e verificato nel browser** (`physicsSettings.js`, `difficulty.js`, `constants.js`, `AeroAndTires.js`, `CarPhysics.js`, `PhysicsDiagnostics.js`, `CareerStorage.js`, `WorldState.js`, `BotController.js`, `QualifyingManager.js`, `PitLaneManager.js`, `CarModel3D.js`, `PitStopAnimator3D.js`, `SceneManager.js`, `InputManager.js`, `MenuManager.js`, `HudOverlay.js`, `main.js`, `index.html`; 7 toggle fisici indipendenti + slider `Livello Bot IA` `75%–105%` con moltiplicatore premi Carriera dinamico `0.90×–1.45×` al posto dei 3 preset legacy, mescole reali Pirelli `S/M/H/W` con finestra termica, Graining a freddo reversibile e Blistering permanente, texture battistrada procedurale `256×256` a bucket discreti del `5%` + spalla Pirelli ricolorata per mescola preservando i `material.name` GLB, Pit Stop animato in gara in 3 fasi `~2.25–2.77s` con martinetti `+5.5 cm`, 10 meccanici in livrea team, scorrimento 4 ruote `±0.45 m`, semaforo aereo + controllo FIA unsafe release, cronometro broadcast live e widget `BOX [P]` / `NEXT S M H W`; verificato con suite Node dedicata, tutte le regressioni sui 24 circuiti, build Vite e verifica browser `1280×720` con `0` errori console e `0` HTTP `>= 400`).
- **Step 6 — Modalità Carriera Predefinita (Calendario fisso 24 GP + 3 Preset Rapido/Standard/Lungo):** **COMPLETATO e verificato nel browser** (`f1_2026_data.js`, `CareerStorage.js`, `QualifyingManager.js`, `WorldState.js`, `MenuManager.js`, `HudOverlay.js`, `main.js`, `index.html`; 3 preset unici Carriera `Rapido 5/3/2m · 3 giri`, `Standard 8/5/3m · 5 giri`, `Lungo 11/7/4m · 7 giri`, rimozione di `careerFormat: 'race'`, salvataggio Carriera v2 con migrazione automatica v1→v2, calendario cronologico fisso R01 Melbourne → R24 Abu Dhabi con avanzamento alla Stagione `N+1`, classifica stagionale 22 piloti e 11 costruttori con modale dedicata `#career-season-modal`, isolamento completo di `TRACK SELECT` che aggiorna solo Sessione Rapida / Prove Libere / Multiplayer lasciando fisso il round Carriera; verificato con `verify-career-presets.mjs`, regressioni complete, build Vite e Chrome `1280×720` con `0` errori console e `0` HTTP `>= 400`).

### D. `PIANO B` *(ex `PIANO MODIFICHE PRE STEP 3`)* — Carriera `v3`, Rimozione Economia & Stanza Trofei 3D Museo Luminoso (dettaglio completo in [docs/PIANO_B.md](docs/PIANO_B.md))
- **Step 1 — Rimozione Sistema Soldi, Upgrade & `CarSpecs.js` + Pulizia `"meteo carriera..."`:** **COMPLETATO** (eliminato `CarSpecs.js`, fisica unificata F1 2026, preservato meteo casuale Carriera `skyPresetId: 'random'`).
- **Step 2 — Carriera `v3`, Premi Reali F1 (`F1Awards.js`) & Storico Carriere:** **COMPLETATO** (premi Qualifiche/Gara/Titoli FIA, `playerGridPosition`, carriera simulata 24 GP in `completedCareers`).
- **Step 3 — Home Carriera Lifecycle, Blocco Scuderia, Reset & Stanza dei Trofei 3D (Museo Luminoso):** **COMPLETATO e verificato nel browser** (8 trofei PBR `.glb` modellati in Blender 5.3 in `public/assets/3d/models/trophies/`, `TrophyMuseumScene3D.js` con Stanza 1 Corridoio piedistalli + vera Coppa del Mondo FIA + click 3D raycast → Stanza 2 Muro 24 GP su 3 scaffali × 8 slot con targhette 3D e indicazione esplicita della scuderia vincitrice nello Storico).
- **Step 4 — `TEAM SELECT` Showroom Museo Chiaro 3D + Pulizia 2 Tasti Piloti:** *Da fare.*
- **Step 5 — `TRACK SELECT` Pannello Orizzontale Compatto in Basso:** *Da fare.*

---

## 6. Regole d'Oro & Vincoli per Claude / Agenti

1. **Usa Graphify (`CLAUDE.md`):** con `graphify-out/graph.json` presente, preferisci `graphify query` / `graphify path` / `graphify explain` prima di leggere interi file sorgenti, ed esegui `graphify update .` dopo ogni modifica al codice.
2. **Mai toccare la geometria fisica dei tracciati:** non modificare `controlPoints` in `src/tracks/calendar2026/*.js` (verificato da test automatici tramite `git diff`).
3. **Preserva indici e materiali critici nei modelli 3D:**
   - In `TrackBuilder.js`, `group.children[3]` deve restare la mesh dell'asfalto con `uvOptions: { uTileMeters: 7.0, vTileMeters: 10.0, totalLength }` (`verify-track-widths.mjs`).
   - In `CarModel3D.js`, il loader riconosce ruote/freni/volante/decal tramite `material.name` (`tyre_sides`, `sf25_wheel_hub`, `tyre_tread`, `discs.008`, `sf25_decals`, `numbers`, `sf25_sw*`); qualsiasi ottimizzazione GLB deve preservare tali nomi escludendo `PropertyType.MATERIAL` da `dedup()`.
4. **Compatibilità Node.js headless:** i moduli in `src/` non devono assumere l'esistenza di `window` o `document` al momento dell'import top-level (necessario per tutti gli script di verifica Node).
5. **Non introdurre richieste HTTP 404:** qualunque risorsa opzionale (HDRI, texture, GLB scuderie/piloti/garage) deve essere verificata tramite `public/assets/3d/manifest.json` prima di essere caricata da `AssetManager3D`.
6. **Verifica obbligatoria:** dopo modifiche, lanciare `npm.cmd run build`, gli script di verifica Node in memoria/progetto e (quando richiesto dall'utente) controllo visivo nel browser con console `0` errori e network `0` stati `>= 400`.
