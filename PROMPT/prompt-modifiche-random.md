Crea un piano di implementazione completo per tutte le modifiche elencate di seguito (**non modificare ancora il codice**). Prima di procedere, fammi tutte le domande necessarie tramite `/grill-me` per chiarire eventuali dettagli o ambiguità di contesto.

---

## 1. Rimozione Sistema Soldi, Upgrade e Pulizia UI
- **Rimozione completa (UI + Codice):** elimina sia dall'interfaccia grafica sia dal codice (logica, salvataggi, stati e moduli/riferimenti collegati) tutto ciò che riguarda i **potenziamenti della vettura** (*Garage* / *Upgrade*) e il sistema dei **soldi/valuta**.
- **Rimozione solo grafica:** elimina **esclusivamente a livello grafico** (senza rimuovere la logica sottostante) la scritta blu `"meteo carriera..."`.

---

## 2. Gestione Carriera (Avvio, Blocco Scuderia, Reset e Storico)
- **Tasto Avvio Carriera:** aggiungi un pulsante esplicito per iniziare una nuova Carriera.
- **Blocco Scuderia:** impedisci di cambiare scuderia mentre una Carriera è già avviata e in corso.
- **Tasto Reset Carriera:** aggiungi un pulsante dedicato per resettare la Carriera corrente (con conferma di sicurezza).
- **Storico Carriere:** aggiungi una sezione/schermata **Storico Carriere** che elenchi tutte le carriere concluse con i relativi premi vinti.
  - **Anteprima richiesta:** genera una **carriera conclusa simulata** (dati fittizi di esempio) e mostrami la grafica finale di questa sezione storico.

---

## 3. Sezione Trofei e Premi Reali (Qualifiche + Gare)
- **Bacheca Trofei per GP:** aggiungi una sezione dedicata ai trofei che elenchi tutti i Gran Premi in **ordine cronologico**.
  - Per **tutti i Gran Premi**, rendi sempre visibile la **posizione di partenza** (griglia) oltre al resto dei dati.
  - Se in un GP **non è stato vinto alcun premio**, mostra solo **posizione di partenza** e **posizione finale** raggiunta.
  - Se in un GP **è stato vinto un premio**, mostra **il premio/trofeo**, la **posizione di partenza** e la **posizione finale** in classifica.
- **Assegnazione realistica:** i premi si ottengono in **modalità Carriera** seguendo le stesse regole di assegnazione della Formula 1 reale, sia per le **gare** (es. podio 1°/2°/3°, vittoria, titoli) sia per le **qualifiche** (es. Pole Position Award).

---

## 4. Schermata Selezione Team (`TEAM SELECT`)
- **Sfondo Showroom 3D:** trasforma lo sfondo poligonale attuale in una vera **parete di uno showroom** che incornicia la monoposto 3D della scuderia selezionata.
- **Pulizia controlli piloti:** elimina i **due tasti** attualmente presenti sotto la selezione dei due piloti della scuderia.

---

## 5. Schermata Selezione Pista (`TRACK SELECT`)
- **Pannello orizzontale:** modifica la finestra contenente mappa del circuito, tempi e informazioni trasformandola in un **pannello a sviluppo orizzontale**.
- **Gerarchia visiva:** metti la **mappa del circuito** ben visibile e in primo piano, con tutte le **informazioni posizionate sopra di essa**.
- **Vincolo sfondo 3D:** dimensiona e posiziona il pannello in modo compatto affinché **non oscuri la vista della pista 3D sullo sfondo**.

---

## Deliverable Richiesti (Step 0)
1. Domande di chiarimento (`/grill-me`) su eventuali punti aperti (es. layout esatto della bacheca trofei, quali premi reali includere, gestione dello storico).
2. Piano di implementazione suddiviso in step progressivi con file coinvolti e criteri di verifica (zero regressioni su build e modalità esistenti).