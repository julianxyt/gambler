# Custom sounds (local only)

Everything in this folder except this README and the example is git-ignored.

1. Put your audio files here (mp3, ogg, wav or m4a).
2. Copy `sounds.example.json` to `sounds.json` and map sound names to your files.
3. Serve the game over http (see the main README) and reload. The browser console logs each custom sound it loads.

Any name you leave out keeps the built-in synthesised sound.

| Name | When it plays |
|---|---|
| `click` | Buttons |
| `spin_start` | Spin pressed (also mutes the built-in reel clatter) |
| `reel_stop` | Each reel lands (played slightly higher per reel) |
| `coin_hit` | Each pearl lands, and each pearl collected. Pitch rises one pentatonic step per pearl, so a run of hits plays as a melody |
| `anticipation` | A reel slows down while a Hold & Spin trigger is close |
| `win_small` | Wins below 15x bet |
| `rollup_tick` | Win meter counting up |
| `feature_trigger` | Hold & Spin starts |
| `jackpot` | MINI / MINOR / MAJOR / GRAND collected |
| `big_win_fanfare` | The win screen only. Stops when the screen is closed |
| `char_show` | Character showcase when a girl & Pom symbol wins big |

Only use audio you have the rights to.
