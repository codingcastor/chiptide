// Chiptide : une petite boucle façon NES.
// Cinq canaux : deux pulses, un triangle, le bruit et les samples DPCM.

setcps(0.55)

instrument('lead', { ch: 'p1', duty: 2, env: [15, 14, 13, '|', 12, '/', 9, 6, 3, 0], vib: 5.5, vibmod: 0.25 })
instrument('harm', { ch: 'p2', duty: 1, env: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] })

$: note("<[e5 ~ g5 b5] [a5 ~ g5 e5] [d5 ~ e5 g5] [e5@3 ~]>*2").s('lead')

$: chord("<Em7 C^7 G D>").voicing().s('harm').chordarp("up").arpspeed(2).struct("x*8")

$: note("<e2 c2 g2 d2>*4").s("tri").clip(0.8)

$: s("[bd hh] [sd hh] [bd bd] [sd hh]")

$: s("kick ~ ~ ~ kick ~ ~ ~").gain(0.9)
