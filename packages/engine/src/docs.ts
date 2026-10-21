// Catalogue of the functions available in live code. It feeds the in-app
// help, editor autocompletion and docs/reference.md. User-facing: French.

export interface FunctionDoc {
  name: string;
  category: Category;
  /** How to call it, e.g. `.duty(valeur)`. */
  signature: string;
  summary: string;
  /** Optional longer explanation. */
  details?: string;
  /** Runnable code. Tests evaluate it and expect no warning. */
  example: string;
  /** True for methods called on a pattern (`.duty()`), false for functions (`note()`). */
  method: boolean;
}

export const CATEGORIES = [
  'Notes et sons',
  'Canaux',
  'Timbre et volume',
  'Enveloppes',
  'Hauteur',
  'Accords et arpèges',
  'Batterie et samples',
  'Instruments',
  'Tempo et structure',
] as const;

export type Category = (typeof CATEGORIES)[number];

const fn = (doc: Omit<FunctionDoc, 'method'>): FunctionDoc => ({ ...doc, method: false });
const method = (doc: Omit<FunctionDoc, 'method'>): FunctionDoc => ({ ...doc, method: true });

export const FUNCTIONS: readonly FunctionDoc[] = [
  // ------------------------------------------------------------ notes and sounds
  fn({
    name: 'note',
    category: 'Notes et sons',
    signature: 'note("c4 e4 g4")',
    summary: 'Joue des notes, par nom (c4, eb3, f#5) ou par numéro MIDI.',
    example: 'note("c4 e4 g4 c5")',
  }),
  fn({
    name: 'n',
    category: 'Notes et sons',
    signature: 'n("0 2 4")',
    summary: 'Degrés d’une gamme avec .scale(), hauteur du bruit (0 à 15) ou numéro de sample DPCM.',
    example: 'n("0 2 4 7").scale("A3:minor")',
  }),
  fn({
    name: 's',
    category: 'Notes et sons',
    signature: 's("hh sd")',
    summary: 'Choisit un son : un canal (pulse, tri, noise), un instrument ou un sample DPCM.',
    details: 'Sons intégrés : hh, oh, sd, bd, cr, mt (bruit), tk (triangle), kick, snare, tom (DPCM).',
    example: 's("bd hh sd hh")',
  }),
  method({
    name: 'scale',
    category: 'Notes et sons',
    signature: '.scale("C4:major")',
    summary: 'Transforme les degrés de n() en notes d’une gamme.',
    example: 'n("0 1 2 3 4 5 6 7").scale("D4:dorian")',
  }),
  method({
    name: 'clip',
    category: 'Notes et sons',
    signature: '.clip(0.5)',
    summary: 'Raccourcit (ou allonge) la durée des notes, en proportion de leur durée dans le pattern.',
    example: 'note("c4 e4 g4 e4").clip(0.5)',
  }),

  // ------------------------------------------------------------ channels
  method({
    name: 'ch',
    category: 'Canaux',
    signature: '.ch("p1")',
    summary: 'Canal de la note : p1, p2, pulse (automatique), tri, noise ou dmc.',
    details: 'Un canal ne joue qu’une note à la fois. Avec pulse, les notes sont réparties sur p1 et p2.',
    example: 'note("c4 e4").ch("p2")',
  }),

  // ------------------------------------------------------------ timbre and volume
  method({
    name: 'duty',
    category: 'Timbre et volume',
    signature: '.duty(25)',
    summary:
      'Rapport cyclique des pulses : 12.5, 25, 50 ou 75 (ou 0 à 3). Plus il est petit, plus le son est fin.',
    example: 'note("c4*4").duty("<12.5 25 50>")',
  }),
  method({
    name: 'vol',
    category: 'Timbre et volume',
    signature: '.vol(10)',
    summary: 'Volume de 0 à 15. Le triangle n’a pas de volume : il est seulement allumé ou éteint.',
    example: 'note("c4*4").vol("15 10 6 3")',
  }),
  method({
    name: 'gain',
    category: 'Timbre et volume',
    signature: '.gain(0.7)',
    summary: 'Volume de 0 à 1, comme dans Strudel (converti sur l’échelle 0 à 15).',
    example: 's("hh*8").gain("1 0.5")',
  }),
  method({
    name: 'metal',
    category: 'Timbre et volume',
    signature: '.metal(1)',
    summary: 'Bruit « métallique » : une séquence courte et tonale au lieu du souffle habituel.',
    example: 's("noise*4").n(12).metal(1)',
  }),

  // ------------------------------------------------------------ envelopes
  method({
    name: 'env',
    category: 'Enveloppes',
    signature: ".env([15, 12, '|', 9, '/', 4, 0])",
    summary: 'Enveloppe de volume, une valeur (0 à 15) par frame de 1/60 s.',
    details:
      '« | » marque le début de la boucle, jouée tant que la note est tenue ; « / » marque le relâchement, ' +
      'joué à la fin de la note. Écrivez un tableau ou une chaîne entre apostrophes.',
    example: "note(\"c4 e4\").env([15, 13, '|', 11, 10, '/', 6, 3, 0])",
  }),
  method({
    name: 'dutyenv',
    category: 'Enveloppes',
    signature: '.dutyenv([0, 1, 2])',
    summary:
      'Rapport cyclique par frame (0 à 3, ou 12.5, 25, 50, 75). Sur le bruit, 1 active le mode métallique.',
    example: 'note("c4 g4").dutyenv([\'|\', 0, 1, 2, 1])',
  }),
  method({
    name: 'arpenv',
    category: 'Enveloppes',
    signature: '.arpenv([0, 4, 7])',
    summary: 'Décalage en demi-tons par frame : arpèges rapides et effets de hauteur.',
    example: 'note("<c4 a3>").arpenv([\'|\', 0, 0, 4, 4, 7, 7])',
  }),
  method({
    name: 'pitchenv',
    category: 'Enveloppes',
    signature: '.pitchenv([0, -0.5, -1])',
    summary: 'Décalage de hauteur par frame, en demi-tons (fractions possibles).',
    example: 'note("c5 g4").pitchenv([1, 0.5, 0])',
  }),
  method({
    name: 'attack',
    category: 'Enveloppes',
    signature: '.attack(0.05)',
    summary: 'Enveloppe ADSR à la Strudel (secondes) : attack, decay, sustain (0 à 1), release.',
    details: 'Convertie en enveloppe de volume par frame quand .env() n’est pas utilisé.',
    example: 'note("c4 e4").attack(0.05).decay(0.2).sustain(0.5).release(0.3)',
  }),
  method({
    name: 'decay',
    category: 'Enveloppes',
    signature: '.decay(0.2)',
    summary: 'Durée de la descente vers le niveau de sustain, en secondes.',
    example: 's("pulse*4").decay(0.15)',
  }),
  method({
    name: 'sustain',
    category: 'Enveloppes',
    signature: '.sustain(0.5)',
    summary: 'Niveau tenu de l’enveloppe ADSR, de 0 à 1.',
    example: 'note("c4").decay(0.1).sustain(0.4)',
  }),
  method({
    name: 'release',
    category: 'Enveloppes',
    signature: '.release(0.3)',
    summary: 'Durée de l’extinction après la fin de la note, en secondes.',
    example: 'note("c4 ~ e4 ~").release(0.4)',
  }),

  // ------------------------------------------------------------ pitch
  method({
    name: 'vib',
    category: 'Hauteur',
    signature: '.vib(5)',
    summary: 'Vibrato : fréquence en Hz. La profondeur se règle avec .vibmod().',
    example: 'note("e5").vib(6).vibmod(0.3)',
  }),
  method({
    name: 'vibmod',
    category: 'Hauteur',
    signature: '.vibmod(0.3)',
    summary: 'Profondeur du vibrato en demi-tons (0.5 par défaut).',
    example: 'note("a4").vib(4).vibmod(0.8)',
  }),
  method({
    name: 'slide',
    category: 'Hauteur',
    signature: '.slide(-0.2)',
    summary: 'Glissement continu de la hauteur, en demi-tons par frame.',
    example: 'note("c6").slide(-0.3).ch("p2")',
  }),
  method({
    name: 'glide',
    category: 'Hauteur',
    signature: '.glide(6)',
    summary: 'Portamento : glisse depuis la note précédente du canal en n frames, sans réattaque.',
    example: 'note("c3 g3 e3 c4").s("tri").glide(5)',
  }),
  method({
    name: 'sweep',
    category: 'Hauteur',
    signature: '.sweep(-3)',
    summary: 'Sweep matériel des pulses : de -7 à 7, le signe donne le sens (négatif = descend).',
    details: 'La vitesse se règle avec .sweeprate(0 à 7). L’effet vient de la puce elle-même.',
    example: 'note("c7").ch("p1").sweep(-2).sweeprate(1)',
  }),
  method({
    name: 'sweeprate',
    category: 'Hauteur',
    signature: '.sweeprate(1)',
    summary: 'Vitesse du sweep matériel : de 0 (rapide) à 7 (lent).',
    example: 'note("c5").ch("p2").sweep(3).sweeprate(4)',
  }),

  // ------------------------------------------------------------ chords and arpeggios
  method({
    name: 'chordarp',
    category: 'Accords et arpèges',
    signature: '.chordarp("up")',
    summary: 'Joue les accords en arpège sur un seul canal : up, down, updown ou downup.',
    example: 'note("c4,e4,g4").chordarp("up").ch("p1")',
  }),
  method({
    name: 'arpspeed',
    category: 'Accords et arpèges',
    signature: '.arpspeed(2)',
    summary: 'Nombre de frames par note de l’arpège (1 par défaut, le plus rapide).',
    example: 'note("a3,c4,e4").chordarp("updown").arpspeed(3)',
  }),
  fn({
    name: 'chord',
    category: 'Accords et arpèges',
    signature: 'chord("<Am F C G>")',
    summary: 'Symboles d’accords, à utiliser avec .voicing() puis .chordarp().',
    example: 'chord("<Am F C G>").voicing().chordarp("up")',
  }),
  method({
    name: 'voicing',
    category: 'Accords et arpèges',
    signature: '.voicing()',
    summary: 'Transforme des symboles d’accords en notes.',
    example: 'chord("<Dm7 G7 C^7>").voicing().chordarp("down").arpspeed(2)',
  }),

  // ------------------------------------------------------------ drums and samples
  method({
    name: 'rate',
    category: 'Batterie et samples',
    signature: '.rate(12)',
    summary: 'Vitesse de lecture d’un sample DPCM, de 0 (lent, grave) à 15 (rapide, aigu).',
    example: 's("kick snare").rate("<15 12>")',
  }),

  // ------------------------------------------------------------ instruments
  fn({
    name: 'instrument',
    category: 'Instruments',
    signature: "instrument('nom', { ch, duty, env, ... })",
    summary: "Définit un instrument réutilisable avec .s('nom').",
    details:
      'Propriétés : ch, duty, vol, env, dutyenv, arpenv, pitchenv, n, metal, vib, vibmod, slide, glide, ' +
      'sweep, sweeprate, chordarp, arpspeed, rate, attack, decay, sustain, release.',
    example:
      "instrument('lead', { ch: 'p1', duty: 1, env: [15, 12, '|', 10] })\nnote(\"e5 d5 c5\").s('lead')",
  }),
  method({
    name: 'inst',
    category: 'Instruments',
    signature: ".inst('nom')",
    summary: 'Applique un instrument sans changer le son choisi avec .s().',
    example: "instrument('soft', { vol: 6 })\nnote(\"c4 e4\").inst('soft')",
  }),

  // ------------------------------------------------------------ tempo and structure
  fn({
    name: 'setcps',
    category: 'Tempo et structure',
    signature: 'setcps(0.5)',
    summary: 'Tempo en cycles par seconde (0.5 par défaut : un cycle dure 2 secondes).',
    example: 'setcps(0.6)\nnote("c4 e4 g4 e4")',
  }),
  fn({
    name: 'setcpm',
    category: 'Tempo et structure',
    signature: 'setcpm(30)',
    summary: 'Tempo en cycles par minute.',
    example: 'setcpm(35)\ns("bd hh sd hh")',
  }),
  fn({
    name: 'stack',
    category: 'Tempo et structure',
    signature: 'stack(a, b, ...)',
    summary: 'Joue plusieurs patterns en même temps. Les blocs « $: » font la même chose.',
    example: 'stack(note("c4 e4").ch("p1"), note("c2").s("tri"))',
  }),
  fn({
    name: 'cat',
    category: 'Tempo et structure',
    signature: 'cat(a, b, ...)',
    summary: 'Enchaîne des patterns, un par cycle.',
    example: 'cat(note("c4 e4"), note("g4 b4"))',
  }),
  method({
    name: 'fast',
    category: 'Tempo et structure',
    signature: '.fast(2)',
    summary: 'Accélère un pattern.',
    example: 'note("c4 e4 g4").fast(2)',
  }),
  method({
    name: 'slow',
    category: 'Tempo et structure',
    signature: '.slow(2)',
    summary: 'Ralentit un pattern.',
    example: 'note("c4 e4 g4 b4").slow(2)',
  }),
  method({
    name: 'struct',
    category: 'Tempo et structure',
    signature: '.struct("x ~ x x")',
    summary: 'Impose un rythme à un pattern.',
    example: 'note("c4").struct("x ~ x x ~ x x ~")',
  }),
  method({
    name: 'every',
    category: 'Tempo et structure',
    signature: '.every(4, f)',
    summary: 'Applique une transformation tous les n cycles.',
    example: 'note("c4 e4 g4 e4").every(2, (x) => x.fast(2))',
  }),
  method({
    name: 'off',
    category: 'Tempo et structure',
    signature: '.off(1/8, f)',
    summary: 'Superpose une copie décalée : idéal pour un écho sur l’autre pulse.',
    example: 'note("c5 e5 g5 e5").ch("p1").off(1/8, (x) => x.ch("p2").vol(5))',
  }),
  fn({
    name: 'hush',
    category: 'Tempo et structure',
    signature: 'hush()',
    summary: 'Coupe tout le son.',
    example: 'hush()',
  }),
];

export function findDoc(name: string): FunctionDoc | undefined {
  return FUNCTIONS.find((d) => d.name === name);
}

/** The reference page in Markdown, generated from the catalogue. */
export function referenceMarkdown(): string {
  const lines = [
    '# Référence des fonctions',
    '',
    '<!-- Généré par `pnpm docs` depuis packages/engine/src/docs.ts : ne pas modifier à la main. -->',
    '',
    'Chiptide reprend le langage de [Strudel](https://strudel.cc). Cette page liste les fonctions propres',
    'à la NES et les fonctions de Strudel les plus utiles. Une frame dure 1/60 s.',
    '',
  ];
  for (const category of CATEGORIES) {
    lines.push(`## ${category}`, '');
    for (const doc of FUNCTIONS.filter((d) => d.category === category)) {
      lines.push(`### \`${doc.signature}\``, '', doc.summary, '');
      if (doc.details) lines.push(doc.details, '');
      lines.push('```js', doc.example, '```', '');
    }
  }
  return lines.join('\n');
}
