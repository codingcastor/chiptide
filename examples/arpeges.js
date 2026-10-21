// Arpèges : sur NES, un canal ne joue qu'une note à la fois.
// Les compositeurs faisaient défiler les notes d'un accord très vite.

setcps(0.5)

// .chordarp() transforme un accord en arpège, une note par frame (1/60 s).
$: chord("<Am F C G>").voicing().chordarp("up").ch("p1").duty(12.5).vol(10)

// .arpenv() fait la même chose avec une séquence de demi-tons fixe.
$: note("<a3 f3 c4 g3>").ch("p2").duty(25).arpenv(['|', 0, 0, 12, 12]).vol(7)

// Basse au triangle avec un glissando entre les notes.
$: note("<a1 f1 c2 g1>*2").s("tri").glide(4)

$: s("bd hh sd hh bd [hh hh] sd hh")
