# Prompt per Antigravity — Gioco di F1: modifiche a interfaccia, animazioni e fisica

## 1. Ruolo e obiettivo

Sei uno sviluppatore senior di videogiochi web 3D e di interfacce di gioco. Il mio **gioco di Formula 1 per browser (HTML/JavaScript, grafica 3D) è già avviato**: ora devo applicarci una serie di **modifiche**. Non devi ricominciare da zero e non devi riscrivere ciò che già funziona.

Le modifiche riguardano:

1. posizione dei pop up;
2. fluidità delle animazioni;
3. finestra dei tempi/delta/nomi;
4. nuovo stile grafico di tutta l'app;
5. fisica della macchina con la tastiera.

## 2. Come lavoriamo (regole di processo)

Userò i comandi `/plan` e `/grill me`. Quindi:

1. **Prima di scrivere codice**, leggi il progetto esistente e con `/plan` proponi il piano (parti da quello della sezione 8, correggilo se serve).
2. Con `/grill me` fammi **tutte le domande necessarie** (vedi sezione 9). Se manca un'informazione, chiedimela: non inventarla.
3. Lavora **uno step alla volta**. Non anticipare gli step successivi.
4. **Alla fine di ogni step**:
   - riassumi cosa è stato modificato;
   - spiega **come testarlo** (cosa devo aprire e provare);
   - elenca eventuali limiti noti;
   - **fermati e aspetta la mia conferma**.
5. **Non cambiare la logica di gioco** che non è citata qui (modalità, qualifiche, gara, carriera, upgrade, multigiocatore, bot, tempi e micro settori). Dopo ogni step verifica che nulla di esistente si sia rotto.
6. Non aggiungere funzionalità che non ho richiesto: se pensi che manchi qualcosa, proponilo come domanda.

## 3. Modifica 1 — Pop up al centro dello schermo

- Tutte le **tendine / finestre pop up / menu a comparsa** del gioco devono comparire **al centro dello schermo** (centrate sia in orizzontale sia in verticale).
- Devono restare centrate anche se la finestra del browser viene ridimensionata o in fullscreen.
- Usa un **sistema unico e riutilizzabile** per i pop up (non risolverli uno per uno), con sfondo scurito dietro.
- Si chiudono con **Esc** e con un pulsante di chiusura; la navigazione con tastiera deve funzionare all'interno del pop up.
- Trova tu **tutti** i pop up presenti nel progetto e dammene l'elenco nel `/plan`.

## 4. Modifica 2 — Animazioni fluide

- Tutte le animazioni (transizioni tra schermate, apertura/chiusura pop up, selezione di riquadri, aggiornamento dei tempi e dei micro settori, riordino della classifica) devono essere **fluide, senza scatti**.
- Obiettivo: **60 fps stabili**, anche durante qualifiche e gara. Le animazioni dell'interfaccia **non devono far calare gli fps del gioco 3D**.
- Indicazioni tecniche (conferma o correggi nel `/plan`):
  - anima solo proprietà "leggere" (trasformazioni e opacità), evitando di forzare continui ricalcoli del layout;
  - durate brevi e coerenti in tutta l'app, con curve di easing morbide;
  - quando la classifica si riordina, le righe devono **scorrere** nella nuova posizione, non saltare;
  - rispetta l'impostazione di sistema "riduci animazioni".
- Misura il risultato (es. con gli strumenti di performance del browser) e riportamelo a fine step.

## 5. Modifica 3 — Finestra tempi / delta / nomi più lunga in verticale

- La finestra che mostra **tempi, delta e nomi dei piloti** (a sinistra dello schermo, in qualifica e in gara) deve essere **molto più lunga in verticale**.
- Deve **occupare gran parte dell'altezza dello schermo** e mostrare **tutti i piloti della griglia senza dover scorrere**, con righe ben leggibili e proporzionate.
- Il contenuto resta quello attuale (posizione, nome, tempo/delta): cambia solo la dimensione e la resa grafica secondo il nuovo stile.
- Deve adattarsi alle diverse altezze di schermo.

## 6. Modifica 4 — Nuovo stile grafico (come negli screenshot di riferimento)

Ti allego **3 screenshot** di riferimento (in alta qualità, 4K): **schermata Home**, **selezione scuderia** e **selezione pista**. Lo stile va applicato a **tutta l'app**: menu, pop up, HUD, schermate di qualifica e di gara.

### 6.1 Linguaggio visivo da riprodurre

- **Sfondo**: nero/grigio molto scuro con **forme poligonali (triangoli) a sfaccettature** sfumate; nella selezione scuderia lo sfondo prende il **colore dominante della scuderia scelta** (es. toni arancio per un team arancione). Sotto la vettura, pavimento scuro lucido con riflesso.
- **Colore d'accento**: **rosso** (linee sottili, icone, evidenziazioni). Sotto i titoli delle schermate di selezione, una **linea sottile azzurra**.
- **Tipografia**: titoli **maiuscoli, grassetto, geometrici e moderni**; sottotitoli piccoli in grigio. Proponi un font gratuito simile (non usare font proprietari) e fammelo approvare.
- **Riquadri (card)**: angoli arrotondati, fondo scuro semitrasparente con **leggera texture a righe diagonali tipo fibra di carbonio** e bordo sottile.
- **Elemento selezionato**: riquadro **bianco** con testo scuro (o bordo bianco evidente), mentre gli altri restano scuri/spenti.
- **Menu a schede in alto** (come HOME / SOLO / MULTIPLAYER...): la scheda attiva è un'etichetta bianca arrotondata, le altre sono testo bianco semplice, con una sottile linea rossa sotto la barra.
- **Suggerimenti comandi in basso a destra**: nello stile degli screenshot ma **adattati a mouse e tastiera** (es. `Invio` Seleziona, `Esc` Indietro, frecce per muoversi).
- Spazi generosi, allineamenti puliti, gerarchia chiara.

### 6.2 Schermate di riferimento (adattale alle mie modalità e funzioni già esistenti)

- **Home**: barra di schede in alto; **un grande riquadro principale** (es. Carriera) affiancato a un riquadro secondario; **riga di riquadri più piccoli** in basso con icona rossa in basso a destra (es. impostazioni, calendario). In alto a destra, riquadro con **nome utente, scuderia e soldi virtuali** (solo se già presenti nel gioco). Mappa le schede e i riquadri sulle modalità che ho già: **Carriera, Multigiocatore, Prove libere**.
- **Selezione scuderia**: titolo "TEAM SELECT" con il nome della scuderia in grande, **vettura 3D al centro** (ruotabile/zoomabile con il mouse), **carosello di riquadri con i loghi/nomi delle scuderie in basso**, con quella scelta evidenziata in bianco.
- **Selezione pista**: titolo con nome del circuito e della città, **pannello a sinistra con la mappa del tracciato e una scheda dati** (curve, lunghezza, ecc.), **carosello di riquadri con le piste in basso** (nome + sagoma del tracciato), sfondo con immagine/scena della pista. Se nel gioco esistono già opzioni come asciutto/bagnato, mostrale con il layout delle schede in alto a sinistra.
- **Pop up, HUD, qualifiche e gara**: stessi colori, stessi riquadri scuri con bordo sottile, stessa tipografia.

### 6.3 Qualità 4K e adattamento

- L'interfaccia deve essere **nitida a 4K (3840×2160)** e allo stesso tempo ben proporzionata a 1080p e su altre risoluzioni.
- Usa **unità relative / scalabili** e grafica vettoriale (SVG) per icone e sagome dei tracciati, in modo che nulla risulti sfocato o troppo piccolo.
- Tieni conto dei display ad alta densità di pixel.

### 6.4 Vincoli sullo stile

- Gli screenshot sono **solo un riferimento di stile e di layout**. **Non copiare loghi, marchi, font proprietari, fotografie di piloti o immagini ufficiali** di altri giochi. Crea elementi grafici originali nello stesso stile.
- Loghi e livree delle scuderie reali del mio gioco restano gestiti come già deciso nel progetto.

### 6.5 Navigazione

- Tutti i menu si usano con **mouse (click e hover) e tastiera** (frecce, Invio, Esc, Tab).
- Lo stato selezionato/in focus deve essere sempre chiaramente visibile (riquadro bianco).
- I tasti dei menu non devono entrare in conflitto con i comandi di guida **WASD**.

## 7. Modifica 5 — Fisica della macchina con la tastiera

### Problema da risolvere

Con la tastiera (WASD) i tasti sono **digitali**: acceleratore, freno e sterzo sono solo **premuti o non premuti**, **non si può dosare la pressione**. L'intensità dell'azione deve dipendere **solo dalla durata della pressione**. La fisica attuale va migliorata tenendo conto di questo limite, in modo che la macchina sia **realistica ma guidabile da tastiera**.

### Sintomi che ho notato (da verificare, non da dare per certi)

Guidando ho la sensazione che:

- ci siano **troppi bloccaggi delle ruote** (in frenata e/o in altre situazioni);
- la macchina **sterzi troppo poco** (sterzo poco efficace in curva).

**Potrebbe essere solo una mia impressione.** Quindi **non modificare la fisica a intuito**: prima **verifica con misure e prove** se i problemi esistono davvero.

### Fase di diagnosi (obbligatoria, prima di cambiare la fisica)

1. Leggi il codice attuale della guida e della frenata (come vengono calcolati bloccaggio, aderenza, angolo di sterzo massimo, velocità di sterzata).
2. Crea, se serve, un **pannello o log di debug temporaneo** che mostri in tempo reale: velocità, input di acceleratore/freno/sterzo, angolo di sterzo effettivo, slittamento di ciascuna ruota, stato di bloccaggio, aderenza disponibile.
3. Esegui **scenari di prova ripetibili** (es. frenata da alta velocità a tasto premuto, frenata breve, curva lenta, curva veloce, uscita di curva in accelerazione) e **riportami i numeri**: quante volte e in quali condizioni si bloccano le ruote, quale raggio di curva si ottiene a diverse velocità.
4. Confronta i valori con ciò che ci si aspetta da una vettura di F1 in condizioni simili, e dimmi chiaramente: **il problema c'è o no, e perché**.
5. **Fermati e aspetta la mia conferma** prima di applicare le correzioni. Se il problema non esiste, non cambiare nulla di inutile.
6. Il pannello di debug va **rimosso o nascosto** a fine lavoro, a meno che io non lo voglia tenere.

### Principio

Non applicare direttamente lo stato on/off del tasto alla fisica. Inserisci un **livello di input virtuale** che trasforma la durata della pressione in un valore graduale da 0 a 1, che poi guida la fisica:

- **Acceleratore (W)**: l'input sale **gradualmente** finché il tasto è premuto e scende gradualmente al rilascio. Una pressione breve dà poca potenza, una pressione lunga dà piena potenza.
- **Freno (S)**: stessa logica, con salita progressiva (pressione breve = frenata leggera, lunga = frenata forte). Evita che un tasto premuto a fondo provochi sempre bloccaggio istantaneo delle ruote.
- **Sterzo (A/D)**: l'angolo di sterzo **cresce gradualmente** mentre il tasto è premuto e **ritorna al centro** gradualmente al rilascio. L'angolo massimo e la velocità di sterzata **diminuiscono all'aumentare della velocità**, così ad alta velocità non si ottengono sterzate brusche e innaturali.
- Le curve di salita/discesa di ciascun input devono essere **parametri facilmente modificabili** (in un unico punto del codice), così posso tararli provando.

### Realismo da mantenere

- Mantieni e integra la fisica realistica già richiesta nel progetto (aerodinamica, usura gomme, sospensioni, bloccaggio, frenate brusche ad alta velocità, erba che scivola, pioggia, collisioni). Non semplificarla: va solo resa **controllabile con input digitali**.
- Il bloccaggio delle ruote e la perdita di aderenza devono restare possibili, ma essere **causati da un uso eccessivo/prolungato dei tasti**, non da qualsiasi pressione.
- I **3 livelli di difficoltà** (legati alla quantità di fisica e alla bravura dei bot) restano come sono.

### Da proporre nel `/plan` (senza implementare finché non approvo)

- Eventuali **aiuti alla guida** leggeri (es. controllo di trazione, anti-bloccaggio in frenata, stabilizzazione dello sterzo) e come legarli ai livelli di difficoltà.

### Verifica

Descrivi nel `/plan` alcuni **scenari di prova** (es. partenza da fermo, frenata forte a fine rettilineo, curva a bassa e ad alta velocità, uscita su erba, pioggia) e a fine step dimmi come li hai provati.

## 8. Piano a step (proposta di partenza)

Correggilo con `/plan`, poi seguilo uno step alla volta.

| Step | Contenuto |
|------|-----------|
| **0** | Analisi del progetto esistente, `/plan` e `/grill me`. Elenco di schermate, pop up e componenti UI. Nessuna modifica al codice. |
| **1** | Base dello stile: palette, font, sfondo poligonale, componenti riutilizzabili (schede, riquadri, bottoni, suggerimenti comandi), scala 4K. |
| **2** | Menu principali nel nuovo stile: Home, selezione scuderia (vettura 3D + carosello), selezione pista (scheda dati + carosello). |
| **3** | Sistema unico di pop up **centrati**; aggiornamento di tutti i pop up esistenti. |
| **4** | HUD, qualifiche e gara nel nuovo stile, con la **finestra tempi/delta/nomi più alta**. |
| **5** | **Animazioni fluide** in tutta l'app e verifica delle prestazioni (60 fps). |
| **6a** | **Diagnosi della guida**: verifica con misure se i bloccaggi sono troppi e se lo sterzo è insufficiente (vedi sezione 7). Report e conferma mia. |
| **6b** | **Fisica con input da tastiera** (input virtuale graduale, sterzo dipendente dalla velocità, taratura), correggendo solo i problemi confermati dalla diagnosi. |
| **7** | Controllo finale: nessuna regressione su modalità, qualifiche, gara, carriera e multigiocatore. |

## 9. Domande da farmi con `/grill me`

Chiedimi almeno queste cose prima di scrivere codice:

- Quali schermate e pop up esistono già nel progetto e se ne vedi di mancanti rispetto alle modalità previste.
- Quale font gratuito proponi per i titoli, e come gestire gli sfondi (poligoni generati da codice o immagini).
- Se ti servono altri dettagli sulla mia sensazione di guida (i sintomi principali sono già nella sezione 7: troppi bloccaggi, sterzo insufficiente).
- Se partire dall'interfaccia (step 1-5) o dalla fisica (step 6a-6b).
- Qualsiasi altra scelta che dipende da come è fatto il codice attuale.

## 10. Vincoli importanti

- Il gioco è già avviato: **non ricominciare da zero**.
- Non modificare funzioni non citate in questo prompt.
- Non passare allo step successivo senza la mia conferma.
- Non aggiungere funzionalità non richieste.
- Non copiare grafica, loghi o font protetti dagli screenshot di riferimento: ispirati solo a stile e layout.
- Se un'informazione manca o è ambigua, **chiedimela** invece di inventarla.
