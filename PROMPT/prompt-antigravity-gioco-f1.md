# Prompt per Antigravity — Gioco di F1 realistico (web app 3D)

## 1. Ruolo e obiettivo

Sei uno sviluppatore senior di videogiochi web 3D. Devi aiutarmi a costruire **un gioco di Formula 1 realistico che gira nel browser (HTML/JavaScript)**, con grafica 3D, fisica realistica delle vetture, piste reali, vetture e piloti reali, modalità carriera, prove libere e multigiocatore online con gli amici.

Il gioco **NON deve essere realizzato tutto in una volta**. Lo sviluppo è **graduale, a step**: ogni step produce una versione funzionante e testabile, e prima di passare allo step successivo aspetti la mia conferma.

## 2. Come lavoriamo (regole di processo)

Userò i comandi `/plan` e `/grill me`. Quindi:

1. **Prima di scrivere codice**, con `/plan` proponi l'architettura e il piano degli step (parti pure dal piano proposto nella sezione 5, correggilo se necessario).
2. Con `/grill me` fammi **tutte le domande necessarie** sulle scelte ancora aperte (vedi sezione 6). Non dare per scontato ciò che non è scritto in questo prompt: se manca un'informazione, chiedimela.
3. Lavora **uno step alla volta**. Non implementare funzionalità degli step successivi.
4. **Alla fine di ogni step**:
   - riassumi in breve cosa è stato fatto;
   - spiega **come testarlo** (comandi per avviarlo e cosa devo provare);
   - elenca eventuali limiti noti o scelte che hai dovuto fare;
   - **fermati e aspetta la mia conferma** prima di iniziare lo step successivo.
5. Non aggiungere funzionalità che non ho richiesto. Se pensi che manchi qualcosa di utile, proponilo come domanda, non implementarlo.
6. Struttura il codice in modo modulare e ordinato (file separati per fisica, rendering, piste, vetture, bot, interfaccia, rete), così che ogni step si aggiunga senza riscrivere quelli precedenti.

## 3. Scelte tecniche già decise

- **Piattaforma:** web app nel browser, HTML + JavaScript.
- **Grafica:** 3D (si consiglia Three.js; confermalo o proponi un'alternativa nel `/plan`).
- **Viste della camera (3):**
  - prima persona (abitacolo);
  - da dietro la macchina (chase cam);
  - dall'alto al centro (vista aerea sopra la macchina).
  - Serve un tasto per passare da una vista all'altra (da decidere insieme).
- **Controlli:** tastiera con **WASD**
  - `W` = avanti (accelerazione)
  - `A` = sinistra
  - `S` = retro / freno
  - `D` = destra
- **Cambio:** automatico.
- **Multigiocatore:** online, **solo con amici (non globale)**, tramite **codice stanza**: ognuno gioca dal proprio dispositivo. Non serve matchmaking pubblico né classifiche globali.
- **Architettura pronta per il multigiocatore fin dallo step 1:** tieni separata la simulazione (stato del gioco e fisica) dal rendering, così che in seguito lo stato possa essere sincronizzato in rete.

## 4. Funzionalità richieste (specifica completa)

### 4.1 Modalità di gioco

- **Carriera** (con bot).
- **Multigiocatore** (con amici, online, codice stanza).
- **Prove libere**:
  - da solo oppure con bot;
  - numero di giri **finito o indeterminato** (a scelta);
  - la macchina può essere **a livello massimo** oppure no (a scelta).
- **Carriera e prove libere hanno 3 livelli di difficoltà**, legati sia alla **quantità di fisica** attiva sia alla **bravura dei bot**. Proponi nel `/plan` cosa cambia concretamente in ciascun livello e fammelo approvare.

### 4.2 Weekend di gara (carriera e multigiocatore)

- **Qualifiche** divise in **Q1, Q2 e Q3**, per un totale di **10 minuti**.
- Le qualifiche sono **skippabili solo se tutti i giocatori approvano**.
- Dopo le qualifiche: **gara da 10 giri**.
- Sia in qualifica che in gara l'interfaccia deve ricordare le vere gare di F1:
  - **a sinistra dello schermo**: i **delta dei tempi**;
  - **in basso al centro**: i **micro settori**.

### 4.3 Tempi e micro settori

- Il giro è diviso in **micro settori**, ciascuno colorato come in F1:
  - **viola** = migliore in assoluto;
  - **verde** = miglioramento del proprio miglior tempo;
  - **giallo** = più lento.
- Il **tempo di ogni giro** va mostrato nel formato **minuti : secondi . decimi centesimi millesimi** (esempio: `1:23.456`).

### 4.4 Vetture, piste e piloti

- **Vetture realistiche** delle scuderie reali (Ferrari, McLaren, Red Bull, ecc.).
- **Piste realmente esistenti**: l'obiettivo finale è avere **tutte le piste del calendario di F1 2026**, aggiunte **a step successivi** (una o poche per volta, vedi sezione 5). La prima versione giocabile parte da una sola pista.
- **Bot con nomi di piloti e vetture veri**, secondo la **griglia della stagione F1 attuale (2026)**: scuderie, piloti e numeri aggiornati a quella stagione.
- Alla creazione del profilo: **scelta del nome utente** e della **scuderia**.

### 4.5 Fisica realistica

La fisica deve includere almeno:

- accelerazione e frenata;
- **aerodinamica**;
- **usura delle gomme**;
- **collisioni**;
- **pioggia**;
- **sospensioni**;
- **bloccaggio** delle ruote;
- **frenate brusche ad alta velocità**;
- **erba che scivola** (perdita di aderenza fuori pista).

### 4.6 Economia e upgrade

- **Soldi virtuali** e **premi in denaro** quando si vince.
- I soldi si usano per fare l'**upgrade della macchina** in cinque aree: **motore, gomme, sospensioni, freni, aerodinamica**.
- Il progresso della carriera (soldi, upgrade, profilo) deve essere **salvato** tra una sessione e l'altra. Proponi nel `/plan` come farlo.

## 5. Piano di sviluppo a step (proposta di partenza)

Correggilo con `/plan` se serve, poi seguilo uno step alla volta.

| Step | Contenuto |
|------|-----------|
| **0** | `/plan` + `/grill me`: architettura, librerie, decisioni aperte. Nessun codice di gioco. |
| **1** | Progetto base nel browser, scena 3D, una pista semplice di prova, vettura base che si muove con WASD. |
| **2** | Fisica di guida di base (accelerazione, frenata, sterzo, aderenza), cambio automatico e le 3 viste della camera. |
| **3** | Sistema piste + prima pista reale, bordi pista, erba che scivola, collisioni. |
| **4** | Giri e cronometraggio: tempo giro nel formato richiesto, micro settori viola/verde/gialli, delta a sinistra, HUD. |
| **5** | Fisica avanzata: aerodinamica, usura gomme, sospensioni, bloccaggio, frenate brusche, pioggia. |
| **6** | Bot con nomi e vetture reali, griglia di partenza, gara da 10 giri. |
| **7** | Prove libere (solo/bot, giri finiti o indeterminati, macchina max o no) e i 3 livelli di difficoltà. |
| **8** | Qualifiche Q1/Q2/Q3 (10 minuti totali) con possibilità di skip e collegamento alla gara. |
| **9** | Carriera: nome utente, scelta scuderia, premi in denaro, upgrade, salvataggio. |
| **10** | Multigiocatore online con codice stanza: lobby, sincronizzazione, approvazione dello skip delle qualifiche. |
| **11 e successivi** | Aggiunta delle altre piste del calendario F1 2026, **una o poche per volta**, ciascuna con la mia conferma (ordine da concordare con me). Rifiniture e bilanciamento alla fine. |

## 6. Domande da farmi con `/grill me` (scelte ancora aperte)

Chiedimi almeno queste cose, una alla volta o a gruppi, prima di scrivere codice:

- Libreria 3D e libreria fisica da usare (o se scrivere la fisica a mano).
- Come ottenere le piste reali (tracciato semplificato disegnato a mano, dati geografici, altro) e con quale **pista** partire nella prima versione giocabile; l'ordine in cui aggiungere le altre del calendario 2026.
- Come gestire i modelli 3D delle vetture (modelli procedurali semplici, modelli gratuiti, altro) e le livree delle scuderie.
- Dove e come reperire la griglia ufficiale 2026 (scuderie, piloti, numeri) per i bot.
- Cosa cambia concretamente nei 3 livelli di difficoltà.
- Come implementare il server per il multigiocatore con codice stanza e dove ospitarlo.
- Dove salvare i progressi della carriera.
- Lingua dell'interfaccia.
- Se il gioco deve funzionare anche su dispositivi diversi dal computer.

## 7. Vincoli importanti

- Non scrivere il gioco completo in un solo passaggio.
- Non passare allo step successivo senza la mia conferma.
- Non aggiungere funzionalità non richieste (nessuna modalità, opzione o sistema extra senza averlo prima proposto e approvato).
- Il gioco è un progetto **personale**, usato solo con i miei amici: nomi e marchi reali sono usati a questo scopo.
- Se un'informazione manca o è ambigua, **chiedimela** invece di inventarla.
