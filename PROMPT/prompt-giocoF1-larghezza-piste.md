Analizza la struttura del progetto (usando anche il knowledge graph se presente) per individuare dove sono definite le dimensioni della monoposto, la generazione delle piste, le barriere, le collisioni/track limits e la griglia di partenza.

Obiettivo: allargare tutte le piste alle misure reali della Formula 1 mantenendo IDENTICA la forma e il layout (centerline) di ogni singolo circuito.

Esegui questi interventi in modo coordinato:
1. Scala di riferimento (1 unità = 1 metro): verifica le dimensioni 3D e la bounding box della monoposto e assicurati che sia scalata alle misure reali F1 2026 (larghezza 1.90 m, passo ~3.40 m).
2. Larghezza reale per ogni circuito: aggiungi un parametro `width` (in metri) nella configurazione di ciascun tracciato usando misure FIA reali:
   - Circuiti permanenti standard (es. Monza, Spa, Silverstone, Imola, Suzuka, ecc.): tra 13.0 m e 15.0 m (fino a 15-16 m sul rettilineo principale se supporta larghezza variabile, altrimenti 14.0 m di media).
   - Circuiti cittadini (es. Monaco, Baku, Singapore, Jeddah): tra 8.5 m e 11.0 m (9.0 m per Monaco, 10.0-11.0 m per gli altri cittadini).
3. Geometria senza deformazioni: mantieni invariate le coordinate della spline/linea centrale di ogni pista ed espandi solo l'estrusione laterale della carreggiata (± width / 2 lungo la normale).
4. Elementi collegati ai bordi: ricalcola dinamicamente in base a `width / 2` la posizione di:
   - Cordoli (curbs), vie di fuga e terreno circostante
   - Barriere, muretti e guard-rail (non devono mai compenetrare l'asfalto)
   - Hitbox di collisione con i muri e soglia dei track limits / rallentamento fuori pista
   - Spaziatura laterale della griglia di partenza e margini delle traiettorie IA
5. Materiali: aggiorna il tiling UV orizzontale della texture dell'asfalto in proporzione alla nuova larghezza per evitare distorsioni visive.

Prima di modificare i file, elenca brevemente quali file toccherai e i valori di larghezza assegnati a ciascun circuito.