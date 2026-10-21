# Référence des fonctions

<!-- Généré par `pnpm docs` depuis packages/engine/src/docs.ts : ne pas modifier à la main. -->

Chiptide reprend le langage de [Strudel](https://strudel.cc). Cette page liste les fonctions propres
à la NES et les fonctions de Strudel les plus utiles. Une frame dure 1/60 s.

## Notes et sons

### `note("c4 e4 g4")`

Joue des notes, par nom (c4, eb3, f#5) ou par numéro MIDI.

```js
note('c4 e4 g4 c5');
```

### `n("0 2 4")`

Degrés d’une gamme avec .scale(), hauteur du bruit (0 à 15) ou numéro de sample DPCM.

```js
n('0 2 4 7').scale('A3:minor');
```

### `s("hh sd")`

Choisit un son : un canal (pulse, tri, noise), un instrument ou un sample DPCM.

Sons intégrés : hh, oh, sd, bd, cr, mt (bruit), tk (triangle), kick, snare, tom (DPCM).

```js
s('bd hh sd hh');
```

### `.scale("C4:major")`

Transforme les degrés de n() en notes d’une gamme.

```js
n('0 1 2 3 4 5 6 7').scale('D4:dorian');
```

### `.clip(0.5)`

Raccourcit (ou allonge) la durée des notes, en proportion de leur durée dans le pattern.

```js
note('c4 e4 g4 e4').clip(0.5);
```

## Canaux

### `.ch("p1")`

Canal de la note : p1, p2, pulse (automatique), tri, noise ou dmc.

Un canal ne joue qu’une note à la fois. Avec pulse, les notes sont réparties sur p1 et p2.

```js
note('c4 e4').ch('p2');
```

## Timbre et volume

### `.duty(25)`

Rapport cyclique des pulses : 12.5, 25, 50 ou 75 (ou 0 à 3). Plus il est petit, plus le son est fin.

```js
note('c4*4').duty('<12.5 25 50>');
```

### `.vol(10)`

Volume de 0 à 15. Le triangle n’a pas de volume : il est seulement allumé ou éteint.

```js
note('c4*4').vol('15 10 6 3');
```

### `.gain(0.7)`

Volume de 0 à 1, comme dans Strudel (converti sur l’échelle 0 à 15).

```js
s('hh*8').gain('1 0.5');
```

### `.metal(1)`

Bruit « métallique » : une séquence courte et tonale au lieu du souffle habituel.

```js
s('noise*4').n(12).metal(1);
```

## Enveloppes

### `.env([15, 12, '|', 9, '/', 4, 0])`

Enveloppe de volume, une valeur (0 à 15) par frame de 1/60 s.

« | » marque le début de la boucle, jouée tant que la note est tenue ; « / » marque le relâchement, joué à la fin de la note. Écrivez un tableau ou une chaîne entre apostrophes.

```js
note('c4 e4').env([15, 13, '|', 11, 10, '/', 6, 3, 0]);
```

### `.dutyenv([0, 1, 2])`

Rapport cyclique par frame (0 à 3, ou 12.5, 25, 50, 75). Sur le bruit, 1 active le mode métallique.

```js
note('c4 g4').dutyenv(['|', 0, 1, 2, 1]);
```

### `.arpenv([0, 4, 7])`

Décalage en demi-tons par frame : arpèges rapides et effets de hauteur.

```js
note('<c4 a3>').arpenv(['|', 0, 0, 4, 4, 7, 7]);
```

### `.pitchenv([0, -0.5, -1])`

Décalage de hauteur par frame, en demi-tons (fractions possibles).

```js
note('c5 g4').pitchenv([1, 0.5, 0]);
```

### `.attack(0.05)`

Enveloppe ADSR à la Strudel (secondes) : attack, decay, sustain (0 à 1), release.

Convertie en enveloppe de volume par frame quand .env() n’est pas utilisé.

```js
note('c4 e4').attack(0.05).decay(0.2).sustain(0.5).release(0.3);
```

### `.decay(0.2)`

Durée de la descente vers le niveau de sustain, en secondes.

```js
s('pulse*4').decay(0.15);
```

### `.sustain(0.5)`

Niveau tenu de l’enveloppe ADSR, de 0 à 1.

```js
note('c4').decay(0.1).sustain(0.4);
```

### `.release(0.3)`

Durée de l’extinction après la fin de la note, en secondes.

```js
note('c4 ~ e4 ~').release(0.4);
```

## Hauteur

### `.vib(5)`

Vibrato : fréquence en Hz. La profondeur se règle avec .vibmod().

```js
note('e5').vib(6).vibmod(0.3);
```

### `.vibmod(0.3)`

Profondeur du vibrato en demi-tons (0.5 par défaut).

```js
note('a4').vib(4).vibmod(0.8);
```

### `.slide(-0.2)`

Glissement continu de la hauteur, en demi-tons par frame.

```js
note('c6').slide(-0.3).ch('p2');
```

### `.glide(6)`

Portamento : glisse depuis la note précédente du canal en n frames, sans réattaque.

```js
note('c3 g3 e3 c4').s('tri').glide(5);
```

### `.sweep(-3)`

Sweep matériel des pulses : de -7 à 7, le signe donne le sens (négatif = descend).

La vitesse se règle avec .sweeprate(0 à 7). L’effet vient de la puce elle-même.

```js
note('c7').ch('p1').sweep(-2).sweeprate(1);
```

### `.sweeprate(1)`

Vitesse du sweep matériel : de 0 (rapide) à 7 (lent).

```js
note('c5').ch('p2').sweep(3).sweeprate(4);
```

## Accords et arpèges

### `.chordarp("up")`

Joue les accords en arpège sur un seul canal : up, down, updown ou downup.

```js
note('c4,e4,g4').chordarp('up').ch('p1');
```

### `.arpspeed(2)`

Nombre de frames par note de l’arpège (1 par défaut, le plus rapide).

```js
note('a3,c4,e4').chordarp('updown').arpspeed(3);
```

### `chord("<Am F C G>")`

Symboles d’accords, à utiliser avec .voicing() puis .chordarp().

```js
chord('<Am F C G>').voicing().chordarp('up');
```

### `.voicing()`

Transforme des symboles d’accords en notes.

```js
chord('<Dm7 G7 C^7>').voicing().chordarp('down').arpspeed(2);
```

## Batterie et samples

### `.rate(12)`

Vitesse de lecture d’un sample DPCM, de 0 (lent, grave) à 15 (rapide, aigu).

```js
s('kick snare').rate('<15 12>');
```

## Instruments

### `instrument('nom', { ch, duty, env, ... })`

Définit un instrument réutilisable avec .s('nom').

Propriétés : ch, duty, vol, env, dutyenv, arpenv, pitchenv, n, metal, vib, vibmod, slide, glide, sweep, sweeprate, chordarp, arpspeed, rate, attack, decay, sustain, release.

```js
instrument('lead', { ch: 'p1', duty: 1, env: [15, 12, '|', 10] });
note('e5 d5 c5').s('lead');
```

### `.inst('nom')`

Applique un instrument sans changer le son choisi avec .s().

```js
instrument('soft', { vol: 6 });
note('c4 e4').inst('soft');
```

## Tempo et structure

### `setcps(0.5)`

Tempo en cycles par seconde (0.5 par défaut : un cycle dure 2 secondes).

```js
setcps(0.6);
note('c4 e4 g4 e4');
```

### `setcpm(30)`

Tempo en cycles par minute.

```js
setcpm(35);
s('bd hh sd hh');
```

### `stack(a, b, ...)`

Joue plusieurs patterns en même temps. Les blocs « $: » font la même chose.

```js
stack(note('c4 e4').ch('p1'), note('c2').s('tri'));
```

### `cat(a, b, ...)`

Enchaîne des patterns, un par cycle.

```js
cat(note('c4 e4'), note('g4 b4'));
```

### `.fast(2)`

Accélère un pattern.

```js
note('c4 e4 g4').fast(2);
```

### `.slow(2)`

Ralentit un pattern.

```js
note('c4 e4 g4 b4').slow(2);
```

### `.struct("x ~ x x")`

Impose un rythme à un pattern.

```js
note('c4').struct('x ~ x x ~ x x ~');
```

### `.every(4, f)`

Applique une transformation tous les n cycles.

```js
note('c4 e4 g4 e4').every(2, (x) => x.fast(2));
```

### `.off(1/8, f)`

Superpose une copie décalée : idéal pour un écho sur l’autre pulse.

```js
note('c5 e5 g5 e5')
  .ch('p1')
  .off(1 / 8, (x) => x.ch('p2').vol(5));
```

### `hush()`

Coupe tout le son.

```js
hush();
```
