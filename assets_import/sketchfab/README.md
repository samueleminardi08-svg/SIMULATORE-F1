# Importazione Modelli Sketchfab (Drop-in Automatico)

I modelli 3D CC0 (**Poly Haven** e **AmbientCG**: texture PBR 2K, HDRI, alberi, natura, prop pista e attrezzatura garage) vengono scaricati automaticamente con:

```bash
npm run assets:fetch-cc0
```

Per i modelli **Sketchfab** (gratuiti con licenza CC Attribution / CC-BY-NC-SA, il cui download `.glb` richiede login sul sito Sketchfab), puoi importarli e comprimerli automaticamente in qualsiasi momento seguendo questi 3 passaggi:

1. Scarica il file **`.glb`** (glTF Binary) dai link nella tabella qui sotto.
2. Copia il file in questa cartella (`assets_import/sketchfab/`) rinominandolo esattamente con il nome nella colonna **`Nome File Target`**.
3. Esegui dal terminale della cartella del progetto:
   ```bash
   npm run assets:import
   ```

Lo script comprimerà automaticamente le geometrie con **Draco**, ottimizzerà le texture a max 1024×1024 (riduzione media ~85% del peso mantenendo la qualità 3D per 60 FPS), aggiornerà `public/assets/3d/manifest.json` e `CREDITS_ASSETS.md` e attiverà subito il modello nell'app al prossimo ricaricamento!

> Finché uno slot `.glb` non viene importato manualmente, il simulatore utilizza la **scocca F1 2026 pulita con livrea ufficiale della scuderia e numero pilota #1..#87** (o il pilota/garage PBR integrato).

---

## Monoposto F1 2026 (11 Scuderie)

| Nome File Target | Scuderia 2026 | Modello / Autore | Triangoli | Licenza | Link Download Sketchfab |
|---|---|---|---|---|---|
| `ferrari.glb` *(già incluso)* | Scuderia Ferrari | `2026 Ferrari SF-26` (`Tyler_Dave`) | 272.038 | CC-BY | Già presente alla radice (`2026_ferrari_sf-26.glb`) |
| `red_bull.glb` | Red Bull Racing | `2026 Redbull RB22` (`Tyler_Dave`) | 281.075 | CC-BY | https://sketchfab.com/3d-models/none-0a3d24a58e0549d591a5a48c22eec383 |
| `mercedes.glb` | Mercedes-AMG | `2026 Mercedes W17` (`Tyler_Dave`) | 267.698 | CC-BY | https://sketchfab.com/3d-models/none-b806f1e70aa343219e7158169549b97b |
| `mclaren.glb` | McLaren | `2026 McLaren MCL40` (`Tyler_Dave`) | 276.870 | CC-BY | https://sketchfab.com/3d-models/none-96214ad5624f42a0861f77008f8d29e7 |
| `aston_martin.glb` | Aston Martin | `2026 Aston Martin AMR26` (`Tyler_Dave`) | 271.170 | CC-BY | https://sketchfab.com/3d-models/none-a50d1c7bc086455c9412470d93fc3fc7 |
| `williams.glb` | Williams | `2026 Williams FW48` (`Tyler_Dave`) | 275.868 | CC-BY | https://sketchfab.com/3d-models/none-4efa51e6d64a4192a83418f1b715c671 |
| `haas.glb` | Haas F1 Team | `2026 Haas VF-26` (`Tyler_Dave`) | 275.868 | CC-BY | https://sketchfab.com/3d-models/none-1f41e03886724bc6acd16c92402989bc |
| `audi.glb` | Audi F1 Team | `2026 Audi R26` (`Tyler_Dave`) | 265.138 | CC-BY | https://sketchfab.com/3d-models/none-32bf228264b047669b100b0f1b8769ac |
| `cadillac.glb` | Cadillac F1 Team | `2026 Cadillac MAC-26` (`Tyler_Dave`) | 259.719 | CC-BY | https://sketchfab.com/3d-models/none-95bcd37aa7c649779efc33b90b6c023e |
| `alpine.glb` | Alpine | `2025 Alpine A525` (`abuhossain844`) | 455.631 | CC-BY | https://sketchfab.com/3d-models/none-5f029644bc2d4eaebbec88712ea46dfa |
| `racing_bulls.glb` | Racing Bulls | `VCARB 02` 2025 (`MattDoesBlender`) | 459.029 | CC-BY-NC-SA | https://sketchfab.com/3d-models/none-caf594de23d541b091b2e814cd6a0d74 |

## Piloti, Garage e Prop Opzionali

| Nome File Target | Ruolo | Modello / Autore | Triangoli | Licenza | Link Download Sketchfab |
|---|---|---|---|---|---|
| `driver_f1.glb` | Pilota F1 seduto + casco Bell HP77 | `rhp_bell_hp77_driver_f1` (`MattDoesBlender`) | 60.714 | CC-BY-NC-SA | https://sketchfab.com/3d-models/none-2916ac047ea84abe9394c38e4fa2d4bd |
| `driver_lod.glb` | Pilota leggero LOD per bot | `Race Car Driver` (`tomkart`) | 5.142 | CC-BY | https://sketchfab.com/3d-models/none-a8503189a20a441893b66e4c57d3231b |
| `garage_f1.glb` | Box F1 completo alternativo | `F1 Garage` (alt: [Red Bull Garage](https://sketchfab.com/3d-models/none-086dda7566f64c6c930354687e2ec274)) | 16.000 | CC-BY | https://sketchfab.com/3d-models/none-6b2a72503e4249d3a4cc25f86d206dac |
| `palm_tree.glb` | Palma alta definizione | `Realistic Palm Tree 4 Free` | 8.000 | CC-BY | https://sketchfab.com/3d-models/none-917c18d6b2d04d33950dea6e20bc074f |
| `starting_line.glb` | Portale griglia di partenza | `Starting Line` | n/d | CC-BY | https://sketchfab.com/3d-models/none-ecb35b3e5b424f9dbf54174e6c5907de |
