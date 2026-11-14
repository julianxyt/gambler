# Fortune Pearl

A browser pokie with a Chinese good-fortune theme: 5x3 reels, 243 ways, and a Hold & Spin pearl feature with MINI / MINOR / MAJOR / GRAND jackpots. Play money only.

## Run

Open `index.html` in a browser, or serve the folder so custom sounds can load:

```
python -m http.server 8000
```

then go to http://localhost:8000. Space or Enter spins.

## How it plays

- **243 ways.** Three or more matching symbols on adjacent reels from the left pay, multiplied by the number of ways. The dragon **WILD** lands on reels 2-4.
- **Hold & Spin.** Six or more fire pearls start it with 3 respins. Pearls lock, every new pearl resets respins to 3, and filling all 15 spots wins the GRAND.
- **Win screen.** Wins of 15x bet or more, and every Hold & Spin, open the win screen (BIG / MEGA / EPIC). Its fanfare plays there and nowhere else. Tap once to skip the count-up, tap again to collect.
- **Turbo, Auto, Sound** buttons in the console. Credit, bet and turbo are remembered in the browser. When credit runs out, tap CREDIT to refill.

## Sound

All sounds are synthesised live with the Web Audio API (`js/audio.js`): gongs, taiko drums, woodblocks, bells, coin clinks, a guzheng-style pluck, brass and firecrackers, through a shared reverb and compressor. Pearl hits climb a pentatonic scale, so a run of landings plays as a rising melody.

To swap in your own audio files, see `sounds/custom/README.md`.

## Files

- `index.html` - layout and the SVG symbol art
- `css/style.css` - the red-and-gold cabinet skin
- `js/audio.js` - sound engine
- `js/game.js` - reels, wins, Hold & Spin, win screen
