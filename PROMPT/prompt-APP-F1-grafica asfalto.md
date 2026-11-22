Esegui un upgrade completo di coesione visiva e fotorealismo sulla scena 3D di Three.js (`SceneManager.js`, `CarModel3D.js`, `TrackBuilder.js` e controller camera), senza alterare la fisica 1:1 né scendere sotto i 60 FPS.

Applica tutti i 5 interventi seguenti in modo coordinato:

1. **Ombre di contatto + Shadow Camera dinamica (ancoraggio al terreno):**
   - In `CarModel3D.js`, aggiungi sotto ogni monoposto una **soft contact shadow**: un piano `y = 0.02` con `CanvasTexture` a gradiente radiale scuro/trasparente (`depthWrite: false`, `transparent: true`, `opacity: 0.72`), scalato sulle dimensioni del fondo vettura, così ogni auto risulti visivamente incollata all'asfalto.
   - In `SceneManager.js`, imposta `PCFSoftShadowMap` e fai seguire ogni frame la posizione e il target della `DirectionalLight` principale alla monoposto del giocatore (mantenendo invariata la direzione della luce solare). Usa un shadow frustum stretto (`±35m`), `shadow.mapSize` `2048x2048`, `shadow.bias = -0.0004` e `shadow.normalBias = 0.02` per avere ombre nitide senza stacchi sotto le gomme.

2. **Calibrazione materiali PBR e coerenza luce (stop effetto plastica):**
   - Verifica che auto, pista, cordoli, barriere e natura usino materiali PBR (`MeshStandardMaterial` / `MeshPhysicalMaterial`) illuminati dalla stessa `scene.environment` HDRI.
   - Bilancia `envMapIntensity` per categoria: monoposto `1.0`, asfalto/cordoli/barriere `0.45–0.55`, terreno/alberi/natura `0.30–0.35`.
   - Imposta la `roughness` dell'asfalto asciutto attorno a `0.80–0.85` (riducendola solo in caso di meteo `rain`) e assicurati che erba, ghiaia e alberi abbiano `roughness >= 0.88` e `metalness = 0`.

3. **Profondità atmosferica (`FogExp2`):**
   - Aggiungi una `THREE.FogExp2` leggera in `SceneManager.js` (densità attorno a `0.0005` su asciutto, leggermente più fitta su pioggia/notte) con colore allineato alla fascia dell'orizzonte dell'HDRI attivo, così alberi e barriere lontani sfumino naturalmente nel cielo.

4. **Post-processing leggero a 60 FPS (`EffectComposer`):**
   - Integra `EffectComposer`, `RenderPass`, `UnrealBloomPass` e `OutputPass` (da `three/examples/jsm/postprocessing/...`) in `SceneManager.js`, gestendo correttamente il resize della finestra e limitando `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))` per preservare i 60 FPS.
   - Configura `UnrealBloomPass` in modo molto discreto (`threshold: 0.90`, `strength: 0.22`, `radius: 0.35`) così si accendano solo i riflessi solari, i fari notturni e il LED posteriore ERS/pioggia senza impastare l'immagine.
   - Aggiungi una leggera vignettatura (10–14% sugli angoli, via shader pass leggero o overlay CSS `pointer-events: none` a costo zero GPU).
   - Assicurati che `ACESFilmicToneMapping` (`toneMappingExposure` attorno a `0.85–0.92`) funzioni correttamente con `OutputPass` senza doppia esposizione.

5. **Camera viva (FOV dinamico + micro-vibrazioni):**
   - Lega il FOV della camera in pista alla velocità della monoposto (interpolazione fluida con `lerp`, es. da `58°–60°` da fermo fino a `72°–74°` oltre i `310 km/h`), chiamando `camera.updateProjectionMatrix()` solo quando il delta FOV supera `0.05°`.
   - Aggiungi una micro-vibrazione procedurale molto contenuta su pitch/roll/posizione camera quando la vettura passa sui cordoli, va sull'erba/ghiaia o frena forte ad alta velocità (evitando qualsiasi nausea in prima persona).

Alla fine:
- Esegui `npm.cmd run build` per verificare che non ci siano errori di import o compilazione.
- Aggiorna il grafo con `graphify update .`.
- Riportami i file modificati e eventuali parametri esposti in configurazione se volessi rifinire esposizione, intensità del bloom o densità della nebbia.