# Feuille de route

| #   | Phase             | Contenu                                                                     | État      |
| --- | ----------------- | --------------------------------------------------------------------------- | --------- |
| 0   | Fondations        | Monorepo, CI, tests unitaires et e2e                                        | Fait      |
| 1   | APU               | 5 canaux, séquenceur de trames, mixeur, sortie à bande limitée, worklet     | Fait      |
| 2   | Driver            | Frames 60 Hz, allocation des canaux, macros, arpèges, vibrato, glide        | Fait      |
| 3   | DSL               | Syntaxe NES complète, messages d'erreur, documentation des fonctions        | Commencé  |
| 4   | Interface         | CodeMirror, surlignage des notes jouées, oscilloscopes par canal, registres | Commencé  |
| 5   | DPCM              | Import de WAV, kit plus riche, budget mémoire de 16 Ko visible              | Commencé  |
| 6   | Export            | NSF (lecteur 6502), WAV, texte FamiStudio, détection de boucle              | À faire   |
| 7   | Puces d'extension | VRC6 puis les autres (désactivées pour l'instant)                           | Plus tard |
| 8   | Finitions         | Mode PAL dans l'interface, tutoriel, galerie, partage                       | À faire   |

## Limites connues

- Le triangle ne joue pas les périodes 0 et 1 (ultrasons) : son séquenceur est gelé, comme dans
  la plupart des émulateurs.
- Le timing du séquenceur de trames et du DMC est fidèle à quelques cycles près, sans IRQ ni vol
  de cycles CPU : inaudible pour de la musique.
- L'APU n'est pas encore comparée automatiquement à un émulateur de référence : ce sera fait avec
  l'export NSF (phase 6).
