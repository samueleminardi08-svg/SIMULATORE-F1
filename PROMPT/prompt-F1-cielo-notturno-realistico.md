# PROMPT ANTIGRAVITY — Cielo notturno realistico e illuminazione piste notturne (GIOCO F1 3D)

> **Esecuzione unica:** implementa **tutto in un solo passaggio**, senza fermarti tra una parte e l'altra e senza chiedermi conferme intermedie. Fai prima un unico piano interno (`/plan`), poi realizza l'intero lavoro e consegna alla fine un solo report. Dove manca un'informazione, **scegli tu il valore più sensato** (indicato nei default qui sotto) e rendilo un parametro configurabile: non farmi domande.

---

## 1. Ruolo & Obiettivo

Sei uno sviluppatore senior di grafica real-time (Three.js / WebGL). Il progetto è il **GIOCO F1 3D** (Vanilla JS ES Modules + Three.js `^0.170.0` + Vite), già avviato e funzionante. Leggi il `README.md` del progetto prima di iniziare: contiene architettura, struttura file e vincoli.

**Obiettivo:** rendere il **cielo notturno** (preset `night_clear` in `src/rendering/SkyPresets.js`) e l'**illuminazione delle piste notturne** molto più realistici, coerenti con lo stile fotorealistico del resto del gioco.

Piste notturne interessate: **Bahrain, Jeddah, Singapore, Las Vegas, Yas Marina, Qatar**. Il cielo `night_clear` deve migliorare ovunque venga usato (anche nel sorteggio "Casuale" Opzione A per i GP notturni).

## 2. Problemi attuali da risolvere

1. **Stelle** poco realistiche / troppo finte (l'HDRI 2K ha poco dettaglio, stelle sgranate).
2. Mancano la **Luna** e la **Via Lattea**.
3. Cielo **troppo scuro e piatto**, poca atmosfera.
4. Manca l'**alone luminoso all'orizzonte** (inquinamento luminoso di fari, città, impianto della pista).
5. Le piste notturne non hanno **torri di fari** credibili che illuminino davvero la pista; mancano **bloom** e **riflessi sull'asfalto**.

## 3. Vincoli & Regole Critiche (tassativi)

1. **ZERO modifiche alla fisica:** non toccare `src/physics/`, `src/config/constants.js`, né la logica di `WorldState`/`RaceManager`. Lavoro **100% estetico**.
2. **Mai modificare i `controlPoints`** in `src/tracks/calendar2026/*.js`. Le posizioni delle torri si **derivano** da `TrackSurface` in sola lettura.
3. **Preserva `group.children[3]`** in `TrackBuilder.js` (mesh asfalto con `uvOptions`). Le nuove mesh vanno in un gruppo separato o dopo gli indici esistenti.
4. **Layer separati:** simulazione senza Three.js/DOM; tutto il nuovo codice nel **Presentation Layer** (`src/rendering/`, `src/tracks/`). Nessun `window`/`document` all'import top-level nei moduli di `src/` (compatibilità test Node headless).
5. **Nessun 404:** ogni risorsa nuova va dichiarata in `public/assets/3d/manifest.json` e caricata tramite `AssetManager3D`. **Preferisci soluzioni procedurali (shader/geometrie)** senza download; se serve un asset usa solo **CC0** e aggiorna `CREDITS_ASSETS.md`.
6. **Prestazioni:** target **60 FPS** su un PC medio con 22 vetture in pista. Aggiungi un selettore **Qualità grafica notturna (Bassa / Media / Alta)** in Impostazioni (default **Media**) e un **fallback automatico** a un livello inferiore se gli FPS restano sotto soglia per alcuni secondi.
7. **Nessuno scope creep:** niente nuovi meteo, niente modifiche ai menu oltre al selettore qualità, niente funzionalità non richieste.
8. **Mantieni** `ACESFilmicToneMapping`, `SRGBColorSpace` e il pipeline HDRI/PMREM: l'HDRI `night_clear` resta come **illuminazione ambientale/riflessi**; il cielo visibile viene arricchito con layer procedurali sopra.
9. **Windows + PowerShell 5.1:** usa `npm.cmd`, concatena con `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };`, mai `&&`.
10. **Graphify:** usa `graphify query` prima di leggere file interi e `graphify update .` dopo le modifiche.

## 4. Workflow Operativo (tutto in un colpo)

Prima di scrivere codice, leggi (via Graphify) `SkyPresets.js`, `SceneManager.js`, `AssetManager3D.js`, `TrackBuilder.js`, `TrackBiomes.js`, `TrackSurface.js` per capire dove si inseriscono i nuovi layer. Poi implementa **tutte** le parti seguenti, nello stesso lavoro:

### A. Cupola celeste notturna procedurale (stelle, Luna, Via Lattea)
Nuovo modulo (es. `src/rendering/NightSky.js`), attivo **solo per i cieli notturni**, sopra l'HDRI:
- **Stelle:** migliaia di punti (`THREE.Points` con shader custom), distribuzione realistica delle magnitudini (poche molto luminose, moltissime deboli), **temperatura colore variabile** (bianco-azzurre, bianche, giallo-arancio), **scintillio lento e sottile**, dimensioni sub-pixel per le più deboli, nessun aspetto "a quadratini".
- **Via Lattea:** banda diffusa e inclinata con shader a rumore (fBm), zone più dense e nubi scure di polvere; **sottile e credibile**, non un nastro evidente.
- **Luna:** disco con fase e illuminazione realistiche e leggero alone; **default: gibbosa crescente (~75%)**, fase e posizione come parametri. La sua luce direzionale (tenue, bluastra) contribuisce all'ambiente. Se serve una texture lunare usa una CC0 nel manifest, altrimenti procedurale.
- Stelle e Via Lattea **sfumano verso l'orizzonte** (estinzione atmosferica) e non compaiono sotto l'orizzonte. La cupola segue la camera (nessun parallasse) e non degrada l'HDRI usato per i riflessi.

### B. Alone luminoso all'orizzonte (light pollution)
- **Gradiente atmosferico** all'orizzonte (shader sulla cupola o mesh cilindrica additiva): da blu-nero profondo in alto a un bagliore **caldo (ambra/sodio)** leggermente desaturato in basso.
- Intensità e tinta **per circuito**, in un file di configurazione estetica dedicato (non in `constants.js`): Las Vegas e Singapore alone forte e urbano; Bahrain, Qatar, Yas Marina più moderato/desertico; Jeddah costiero.
- Skyline/colline lontane **solo se** procedurali e leggere; altrimenti omettile.

### C. Esposizione, tone mapping e bloom notturno
- Calibra **esposizione** e contrasto per la notte: cielo con gradazione e profondità (non nero assoluto), asfalto fuori dalle zone illuminate scuro ma leggibile.
- **Bloom selettivo** (es. `UnrealBloomPass` o equivalente) con soglia alta, attivo **solo** nei circuiti notturni: fari/pannelli luminosi, fanali e luci freno delle monoposto, Luna. Niente bagliore su asfalto o UI.
- Il post-processing non deve rompere HUD, minimappa, modali, pixel ratio; gestisci resize e dispose.

### D. Torri di fari sulle piste notturne
Nuovo modulo (es. `src/tracks/TrackFloodlights.js`):
- **Torri** a bordo pista (fuori da runoff e barriere) con spaziatura realistica lungo il tracciato e cluster extra su rettilineo box, curve lente e zone chiave; posizioni derivate da `TrackSurface` in sola lettura.
- Ogni torre: **pilone** + **pannello di proiettori** con materiale **emissivo** (alimenta il bloom), realizzati con **`InstancedMesh`**.
- **Luci reali con budget controllato:** non una luce per torre. **Pool limitato** di `SpotLight`/`PointLight` (default Alta ≈ 12, Media ≈ 8, Bassa ≈ 4) riassegnate dinamicamente alle torri **più vicine alla camera/vettura del giocatore**; ombre solo su 1–2 luci. Per le torri lontane usa un finto effetto (pozze di luce sull'asfalto con decal/gradienti additivi, coni di luce leggeri con falloff).
- Risultato: **pozze di luce** visibili su asfalto, cordoli e vetture, con **zone più scure tra una torre e l'altra**, come nei GP notturni reali.
- Tonalità **bianco-fredda** (LED) per le piste moderne; cluster di sfondo più caldi a Singapore e Las Vegas per coerenza con l'alone.
- Attive **solo nei GP notturni**: per i GP diurni nessun costo.

### E. Riflessi e brillantezza di asfalto e vetture
- Sui circuiti notturni l'asfalto è **più reattivo alle luci** (leggero calo di rugosità, riflessi speculari allungati delle torri, bagliori su cordoli e linee bianche) **senza** cambiare i parametri fisici di aderenza.
- Le monoposto riflettono torri, cielo e Luna (envMap coerente) e hanno **fari, luci posteriori e luci freno** visibili con bloom.
- Con **pioggia notturna** (tasto `R`) i riflessi aumentano in modo credibile, senza nuova fisica.

### F. Qualità, ottimizzazione e verifica
- Selettore **Bassa / Media / Alta** + fallback automatico:
  - **Bassa:** stelle + alone, poche luci vere, bloom ridotto o assente.
  - **Media (default):** + Via Lattea e Luna, pool luci ridotto.
  - **Alta:** tutto attivo.
- Verifica obbligatoria prima del report finale:
  - `npm.cmd run build` senza errori;
  - browser: console **0 errori**, network **0 stati ≥ 400**;
  - controllo visivo su almeno **Singapore, Las Vegas, Bahrain, Yas Marina** (viste `Chase`, `Abitacolo`, `T-Cam`);
  - FPS con 22 vetture per ogni livello di qualità;
  - `git diff` su `src/physics/` e `src/config/constants.js` **vuoto**;
  - `graphify update .` eseguito.

## 5. Formato di Output

- **Un solo report finale**, breve: file creati/modificati, parametri configurabili (colori, intensità, densità stelle, fase lunare, numero luci) raccolti in **un unico file di configurazione estetica notturna**, FPS per livello di qualità, eventuali limiti noti.
- Nessuna domanda intermedia: se un dettaglio è ambiguo, applica il default indicato e segnalalo nel report.

## 6. Criteri di accettazione

- [ ] Stelle nitide, di dimensioni e colori variabili, con scintillio sottile e senza effetto "finto".
- [ ] Luna e Via Lattea presenti, credibili e non invadenti.
- [ ] Cielo con profondità e alone caldo all'orizzonte diverso per pista.
- [ ] Piste notturne con torri di fari, pozze di luce reali sull'asfalto e bloom controllato.
- [ ] Asfalto, cordoli e vetture riflettono luci e cielo in modo credibile.
- [ ] 60 FPS stabili in qualità Media/Alta su PC medio (o fallback automatico funzionante).
- [ ] Fisica, tracciati, HUD e menu **invariati**; build, console e network puliti.
