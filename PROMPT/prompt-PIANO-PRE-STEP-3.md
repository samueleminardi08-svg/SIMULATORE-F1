# Richiesta Pianificazione — PIANO PRE STEP 4

Crea un documento di piano di implementazione chiamato **`PIANO PRE STEP 4`** (solo pianificazione, **non modificare ancora il codice**) e, al termine, aggiungilo tra le schede laterali dell'IDE.

Il piano deve organizzare in step ordinati, verificabili e senza regressioni tutte le seguenti modifiche:

---

## 1. Pit Lane, Box Scuderie e Aggiornamento Piano 3D
- **Pit lane e box per ogni pista (geometria base):** implementa la pit lane e i box di tutte le scuderie su ogni circuito del calendario, rispettando la disposizione reale di ciascuna pista. In questa fase realizzali con **geometrie semplici** (placeholder strutturali), rimandando i modelli 3D ad alta definizione a uno step successivo.
- **Aggiornamento `PIANO GRAFICA 3D`:** aggiorna il piano dedicato alla grafica 3D aggiungendo il task per sostituire pit lane e box di ogni scuderia su tutte le piste con modelli 3D dettagliati ricercandoli su **sketchfab** o da altri siti se li non ci dovessero essere.
---

## 2. Interfaccia (HUD), Minimappe e Transizioni
- **Spostamento minimappa principale:** sposta la minimappa del circuito nell'angolo **in alto a destra**.
- **Minimappa Pit Lane + Indicatore Ingegnere di Gara:** quando il giocatore è dentro al box o in pit lane, mostra una **seconda minimappa dedicata alla sola pit lane**, posizionata **in alto a destra, subito a sinistra della minimappa principale**. Includi un indicatore semaforico **Verde / Rosso** (stile *unsafe release* / ingegnere di gara), in alto al centro dello schermo, che avvisa quando è possibile uscire senza rischiare collisioni con altre monoposto in transito.
- **Transizioni fluide e schermata di caricamento:** aggiungi transizioni fluide tra le schermate della Home e nel passaggio da menu a pista. Crea una **schermata di caricamento** dedicata all'ingresso in pista per mascherare il caricamento del circuito, dei modelli 3D e delle texture.

---

## 3. Nuovo Flusso Qualifiche (Q1 → Q2 → Q3 → Griglia di Gara)
- **Partenza dai box:** elimina lo spawn immediato in pista nel traffico; in qualifica tutte le vetture partono da dentro il proprio box e scelgono liberamente quando uscire.
- **Scaglionamento uscite in pit lane:** le vetture possono immettersi dalla pit lane **una alla volta**, con un intervallo minimo di **3 secondi** tra una monoposto e la successiva.
- **Rientro ai box a fine Q1, Q2 e Q3:**
  1. Al termine di ciascuna sessione Q, il pilota deve rientrare ai box.
  2. All'ingresso della pit lane si attiva il **limitatore automatico di velocità** a **80 km/h** oppure **60 km/h**, in base al regolamento reale FIA e alla lunghezza della pit lane di ogni singolo circuito (**effettua una ricerca web pista per pista** per inserire i limiti reali corretti).
  3. Il giocatore guida manualmente lungo la pit lane fino al proprio box, aiutato da un **percorso guida olografico** composto da una scia di **frecce verdi** a terra e da una **freccia verde rivolta verso il basso** sopra lo stallo del proprio box (coerente con lo stile della guida).
  4. Raggiunto l'esterno del proprio box, l'auto viene **parcheggiata automaticamente all'interno** con un'animazione fluida.
  5. Appena parcheggiato, compare la **classifica del Q** appena terminato; dopo **10 secondi** la schermata si chiude automaticamente e parte la sessione successiva (fino al Q3).
- **Transizione Q3 → Gara:** al termine del Q3, una volta rientrati, parcheggiati automaticamente nel box, e avendo visto la classifica del Q3, la sessione passa alla gara posizionando tutte le monoposto in griglia secondo l'ordine delle qualifiche. Dopo **10 secondi** inizia la sequenza di spegnimento dei semafori e la partenza.

---

## 4. Miglioramento Bot e Valutazione IA
- **Traiettorie e guida realistica:** migliora il comportamento dei bot affinché seguano la traiettoria ideale di ogni circuito senza creare imbottigliamenti (*tappi*) né incidenti anomali.
- **Differenziazione dei piloti:** diversifica i profili di guida e passo dei bot (aggressività, frenata, gestione traffico, errori) in modo che non si comportino tutti allo stesso modo.
- **Analisi richiesta nel piano:** includi una breve sezione tecnica in cui valuti se e come integrare tecniche di **Intelligenza Artificiale** nel processo decisionale dei bot, indicando pro, contro e impatto sui 60 FPS nel browser.

---

## 5. Fisica: Degrado Gomme, Pit Stop e Sezione Impostazioni "FISICA"
- **Degrado gomme realistico:** implementa il consumo e il calo di aderenza degli pneumatici sia in qualifica sia in gara e che sia diretamente visibile sulla gomma mentre corriamo (graining e blistering).
- **Pit Stop in gara:** abilita il rientro ai box in gara per effettuare il pit stop (cambio gomme), con un'animazione di cambio gomme.
- **Nuova sezione Impostazioni `FISICA`:** rimuovi i livelli di difficoltà predefiniti e sostituiscili con una sezione dedicata **`FISICA`** nelle impostazioni, dove ogni parametro/meccanica fisica (es. *aerodinamica*, *degrado gomme*, *bloccaggi ruote*, ecc.) è attivabile o disattivabile singolarmente con un toggle per personalizzare liberamente la difficoltà.

---

## 6. Modalità Carriera Predefinita (Calendario Fisso + 3 Preset)
- **Calendario fisso:** trasforma la modalità **Carriera** in una modalità strutturata con calendario fisso contenente tutte le piste in ordine cronologico.
- **Scelta formato weekend (3 preset unici):** in Carriera il giocatore può scegliere solo la durata del weekend tra:
  - **Rapido:** Q1 `5 min` | Q2 `3 min` | Q3 `2 min` | Gara `3 giri`
  - **Standard:** Q1 `8 min` | Q2 `5 min` | Q3 `3 min` | Gara `5 giri`
  - **Lungo:** Q1 `11 min` | Q2 `7 min` | Q3 `4 min` | Gara `7 giri`
- **Altre modalità:** tutte le altre modalità di gioco restano invariate e completamente personalizzabili (*custom*).

---

## Deliverable Richiesti
1. Piano completo **`PIANO PRE STEP 4`** suddiviso in step progressivi con i file del progetto coinvolti e i criteri di verifica per ciascuno step.
2. Tabella dei **limiti di velocità reali della pit lane (60 vs 80 km/h)** per tutte le piste del calendario (verificata via web).
3. Risposta tecnica sulla fattibilità dell'integrazione IA nei bot.
4. Aggiornamento del file `PIANO GRAFICA 3D` per includere pit lane e box 3D.
5. Aggiunta del piano **`PIANO PRE STEP 4`** tra le schede laterali.