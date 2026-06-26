# Visiaudio — Empreinte sonore générative

Site statique (HTML/CSS/JS, aucun serveur) qui génère une empreinte géométrique à partir de l'analyse audio d'un morceau, colorée automatiquement à partir de la pochette d'album.

**[→ Voir la démo en ligne](#)** *(mettre à jour après déploiement GitHub Pages)*

---

## Fonctionnement

```
Fichier audio
    │
    ▼
Décodage (Web Audio API — decodeAudioData)
    │
    ▼
Analyse par fenêtres (1024 échantillons ≈ 23 ms à 44 100 Hz)
    ├─ RMS globale (énergie totale)
    ├─ Filtre passe-bas IIR → proxy des basses
    └─ Résiduel RMS − low → proxy des aigus
    │   (normalisé 0–1, lissé sur 8 fenêtres)
    ▼
Tracé géométrique (Canvas 2D)          Pochette (jsmediatags ID3)
    ├─ Mode Spirale — spirale archimédienne (10 tours) │
    ├─ Mode Onde   — waveform horizontal plein écran  ├─ k-means couleurs dominantes (4)
    └─ Mode Bloom  — mandala radial 5 plis            └─ Palette appliquée au tracé
```

Le tracé complet du morceau est calculé d'un coup à l'ouverture du fichier. Pendant la lecture, seule la fraction `currentTime / duration` est dessinée — ce qui permet l'animation en temps réel et le scrubbing instantané.

---

## Structure du projet

```
Visiaudio/
├── index.html
├── style.css
├── js/
│   ├── audio-analysis.js   # decodeAudioData → RMS / low / high par fenêtre
│   ├── cover-extract.js    # jsmediatags → pochette → k-means couleurs
│   ├── visual-engine.js    # canvas — modes spirale / onde / bloom
│   ├── library.js          # définition + chargement de la bibliothèque intégrée
│   └── app.js              # orchestration, lecteur, événements UI
├── assets/
│   ├── audio/              # morceaux locaux (.mp3, .wav…)
│   └── covers/             # pochettes de repli (si pas d'ID3)
├── lib/
│   └── jsmediatags.min.js  # v3.9.7 — licence MIT
└── README.md
```

---

## Ajouter des morceaux à la bibliothèque

1. Placer le fichier audio dans `assets/audio/`
2. Placer une pochette dans `assets/covers/` (optionnel — la pochette ID3 est prioritaire)
3. Ouvrir `js/library.js` et ajouter une entrée :

```js
{
  id: 'mon-morceau',
  title: 'Titre',
  artist: 'Artiste',
  audio: 'assets/audio/mon-morceau.mp3',
  cover: 'assets/covers/mon-morceau.jpg',   // optionnel
  attribution: 'Source et licence',          // requis si la licence l'exige
},
```

### Sources recommandées (libres de droits)

| Source | Licences disponibles |
|--------|---------------------|
| [Pixabay Music](https://pixabay.com/music/) | Pixabay (libre, sans attribution obligatoire) |
| [Incompetech](https://incompetech.com/music/) | CC BY 4.0 (attribution requise) |
| [Free Music Archive](https://freemusicarchive.org/) | CC variées — vérifier par morceau |
| [YouTube Audio Library](https://studio.youtube.com/channel/UCxx/music) | Libre ou CC BY |

---

## Déploiement (GitHub Pages)

Dans les paramètres du dépôt : **Settings → Pages → Source → Deploy from a branch → `master` / `root`**.

Le site sera disponible sur `https://<user>.github.io/VisiAudio/`.

---

## Compatibilité navigateurs

| API | Chrome | Firefox | Safari | Edge |
|-----|--------|---------|--------|------|
| `AudioContext.decodeAudioData` | 35+ | 25+ | 14.1+ | 79+ |
| `canvas.toBlob` | 50+ | 19+ | 11+ | 79+ |
| `ResizeObserver` | 64+ | 69+ | 13.1+ | 79+ |
| `jsmediatags` (ID3 MP3/M4A) | ✓ | ✓ | ✓ | ✓ |

---

## Bibliothèque intégrée — 9 morceaux

Tous par **Kevin MacLeod** — [incompetech.com](https://incompetech.com) — Licence [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

| Titre | Genre | Durée approx. |
|-------|-------|---------------|
| Achaidh Cheide | Celtic / Folk | 2:25 |
| Airport Lounge | Smooth Jazz | 5:20 |
| 8bit Dungeon Level | Chiptune / Électronique | 3:45 |
| Americana | Country / Folk | 3:25 |
| Asian Drums | Musiques du monde | 2:27 |
| Autumn Day | Ambient / Nature | 3:12 |
| Avant Jazz | Jazz fusion | 0:46 |
| Bicycle | Upbeat / Fun | 4:52 |
| Bathed in the Light | Inspirant / Orchestral | 2:54 |

Attribution requise pour toute utilisation publique :
> *Music by Kevin MacLeod — incompetech.com — Licensed under CC BY 3.0*

---

## Attributions

- **jsmediatags** v3.9.7 — Nick Tindall — [MIT Licence](https://github.com/nicktindall/jsmediatags/blob/master/LICENSE)
- **Musique** — Kevin MacLeod (incompetech.com) — CC BY 3.0
- **Couvertures** — Générées procéduralement (dégradés + halo, aucun droit tiers)
