# Chiptide

**Live coding de musique NES dans le navigateur.** Chiptide reprend le langage de patterns de
[Strudel](https://strudel.cc) (mini-notation, `stack`, `$:`, gammes, accords…), mais le son ne peut
sortir que d'une puce son de NES émulée : le **2A03**, avec ses cinq canaux et toutes ses contraintes.

```js
setcps(0.55);

$: note('<[e5 ~ g5 b5] [a5 ~ g5 e5]>*2').ch('p1').duty(25).env([15, 13, '|', 11, '/', 6, 3, 0]);
$: chord('<Em7 C^7>').voicing().ch('p2').chordarp('up').vol(8);
$: note('<e2 c2>*4').s('tri');
$: s('[bd hh] [sd hh]');
```

## Démarrer

```sh
pnpm install
pnpm dev          # ouvre le playground : Ctrl+Entrée pour jouer, Ctrl+. pour arrêter
pnpm render examples/intro.js intro.wav 30   # rend 30 secondes en WAV
```

Nécessite Node 20+ et pnpm 10.

## Les cinq canaux

| Canal        | Nom dans le code           | Ce qu'il fait                                                      |
| ------------ | -------------------------- | ------------------------------------------------------------------ |
| Pulse 1 et 2 | `p1`, `p2`, `pulse` (auto) | Onde carrée, 4 rapports cycliques, volume 0–15, sweep matériel     |
| Triangle     | `tri`                      | Onde triangle en escalier, sans volume (allumée ou éteinte)        |
| Noise        | `noise`                    | Bruit pseudo-aléatoire, 16 hauteurs, mode normal ou « métallique » |
| DPCM         | `dmc`                      | Samples 1 bit (delta), 16 vitesses de lecture                      |

Un canal ne joue **qu'une note à la fois**. Les accords se jouent en arpège (`.chordarp()`), comme
dans les jeux NES. Avec `pulse`, les notes sont réparties automatiquement sur les deux pulses.

## Référence rapide

| Fonction                                    | Effet                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `.ch("p1")` ou `.s("tri")`                  | Choix du canal                                                           |
| `.duty(12.5)`                               | Rapport cyclique des pulses : 12.5, 25, 50, 75 (ou 0–3)                  |
| `.vol(10)` / `.gain(0.7)`                   | Volume 0–15 (ou 0–1 avec `gain`)                                         |
| `.env([15, 12, '\|', 9, '/', 4, 0])`        | Enveloppe de volume, une valeur par frame : `\|` boucle, `/` relâchement |
| `.dutyenv([...])`                           | Rapport cyclique par frame (sur le bruit : 1 = mode métallique)          |
| `.arpenv([0, 4, 7])`                        | Arpège en demi-tons par frame                                            |
| `.pitchenv([0, -1, -2])`                    | Décalage de hauteur par frame, en demi-tons                              |
| `.chordarp("up")`, `.arpspeed(2)`           | Accords en arpège : `up`, `down`, `updown`, `downup`                     |
| `.vib(5).vibmod(0.3)`                       | Vibrato (fréquence en Hz, profondeur en demi-tons)                       |
| `.slide(-0.2)`, `.glide(6)`                 | Glissement continu (demi-tons par frame), portamento (en frames)         |
| `.sweep(-3).sweeprate(1)`                   | Sweep matériel des pulses (signe = sens)                                 |
| `.n(12)` sur `noise`, `.metal(1)`           | Hauteur du bruit (0–15) et mode métallique                               |
| `instrument('nom', { ch, duty, env, ... })` | Définit un instrument utilisable avec `.s('nom')`                        |

Sons intégrés : `hh oh sd bd cr mt` (bruit), `tk` (grosse caisse au triangle), `kick snare tom` (DPCM).
Les enveloppes ADSR de Strudel (`.attack()`, `.decay()`, `.sustain()`, `.release()`) sont converties en
enveloppes par frame.

La liste complète, avec un exemple pour chaque fonction, est dans
[docs/reference.md](docs/reference.md).

Les enveloppes s'écrivent avec un tableau ou une chaîne entre **apostrophes** (`'15 12 | 8'`) : entre
guillemets doubles, Strudel lit une chaîne comme un pattern de mini-notation.

## Fidélité

- L'APU est émulée cycle par cycle : séquenceur de trames, enveloppes, compteurs de durée, sweep,
  registre LFSR du bruit, DPCM, mixeur non linéaire et filtres analogiques de la console.
- La sortie est à bande limitée (synthèse par impulsions, à la manière de `blip_buf` de Blargg) :
  pas d'aliasing audible, même dans les aigus.
- Le driver fonctionne à **60 Hz (NTSC)** comme un moteur sonore de jeu : les notes, enveloppes et
  arpèges avancent par frame. La justesse suit les périodes 11 bits de la puce (les aigus sont
  légèrement faux, comme sur la vraie console).
- Le playground et l'export WAV passent par le même code : ils produisent les mêmes échantillons.

## Architecture

```
code ─▶ patterns Strudel ─▶ driver 60 Hz ─▶ écritures de registres ─▶ APU émulée ─▶ audio
                            (@chiptide/driver)                         (@chiptide/apu)
```

| Paquet            | Rôle                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `packages/apu`    | Émulation du 2A03, synthèse à bande limitée, AudioWorklet          |
| `packages/driver` | Driver par frame : notes → registres, macros, arpèges, allocation  |
| `packages/engine` | Intégration Strudel, contrôles NES, lecture live, rendu hors ligne |
| `apps/web`        | Playground                                                         |

La feuille de route est dans [docs/ROADMAP.md](docs/ROADMAP.md).

## Développement

```sh
pnpm test        # tests unitaires (Vitest)
pnpm test:e2e    # tests dans Chromium (Playwright)
pnpm typecheck
pnpm format
```

## Licence

[AGPL-3.0-or-later](LICENSE), comme Strudel dont Chiptide réutilise le moteur de patterns.
