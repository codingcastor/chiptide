// Batterie : bruit, triangle et samples DPCM.

setcps(0.6)

// Bruit : hh, oh, sd, bd, cr, mt. La hauteur du bruit se règle avec n (0 à 15).
$: s("bd hh sd hh bd [hh hh] sd oh")

// Grosse caisse au triangle (tk) : une chute de hauteur très rapide.
$: s("tk ~ ~ tk ~ ~ tk ~")

// Samples DPCM 1 bit : kick, snare, tom.
$: s("~ ~ ~ ~ ~ ~ [tom tom] tom").gain(0.8)

// Effet « laser » : le sweep matériel fait chuter la hauteur tout seul.
$: note("~ ~ ~ ~ ~ ~ ~ c7").ch("p2").duty(12.5).sweep(-2).sweeprate(0).clip(2)

// Le bruit « métallique » (séquence courte de 93 pas) : remplacez une ligne
// de batterie par celle-ci, le canal de bruit ne joue qu'un son à la fois.
_$: s("noise*16").n("<10 12 14>").metal(1).env([6, 3, 1, 0])
