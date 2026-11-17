# Bangor Bonanza

A browser pokie with a Chinese good-fortune theme: 5x3 reels, 243 ways, and a Hold & Spin pearl feature with MINI / MINOR / MAJOR jackpots. Play money only.

## Run

Open `index.html` in a browser, or serve the folder so custom sounds can load:

```
python -m http.server 8000
```

then go to http://localhost:8000. Space or Enter spins.

## How it plays

- **243 ways.** Three or more matching symbols on adjacent reels from the left pay, multiplied by the number of ways. Symbols: 7, diamond, star, BAR, watermelon, grapes, cherry, A, K, Q, J. The dragon **WILD** lands on reels 2-4. Roughly one spin in nine pays.
- **Baddies = Hold & Spin.** The four baddie + Pom pictures are the cash coins. Six or more start Hold & Spin with 3 respins; every new baddie resets respins to 3.
- **Free spins.** Three FREE SPINS symbols on reels 1, 3 and 5 give 8 free spins with all wins doubled and extra wilds. Three more during the feature add 8.
- **Chest win screen.** Every win opens a chest; the prize rises out slowly, then breathes until you tap to collect. The fanfare only plays on big wins.
- **Gamble.** After a win, GAMBLE lights up. Pick red/black (x2) or a suit (x4) for the next card, up to 5 times, or collect.
- **Turbo, Auto, Sound** buttons in the console. Credit, bet and turbo are remembered in the browser. When credit runs out, tap CREDIT to refill.

## Sound

All sounds are synthesised live with the Web Audio API (`js/audio.js`): gongs, taiko drums, woodblocks, bells, coin clinks, a guzheng-style pluck, brass and firecrackers, through a shared reverb and compressor. Baddie coin hits climb a pentatonic scale, so a run of landings plays as a rising melody.

To swap in your own audio files, see `sounds/custom/README.md`.

## Files

- `index.html` - layout and the SVG symbol art
- `css/style.css` - the red-and-gold cabinet skin
- `js/audio.js` - sound engine
- `js/game.js` - reels, wins, Hold & Spin, free spins, gamble, chest win screen
- `img/symbols/`, `img/icons/`, `img/prize/` - symbol art and baddie coins

## Testing hooks

In the browser console: `__fp.forceFS()` lands free spins, `__fp.forceFeature()` starts Hold & Spin.
