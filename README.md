# Gomoku ⚫⚪

Five in a Row — play against the AI or pass-and-play with a friend. Works on any phone browser.

**Play:** https://zx3xyy.github.io/gomoku/

## Features

- 15×15 board, Black moves first, 5 in a row wins (free-style, no forbidden moves)
- **vs AI** with Easy and Normal levels; play Black or White, switch sides mid-game
- **2 Players** pass-and-play on one phone
- **Undo** (takes back your move plus the AI's reply), **Resign**, win-line highlight, last-move marker
- Stone sounds with mute toggle, win/lose jingles
- Stats (AI record, 2-player record) and mid-game progress saved on-device
- Dark/light mode
- Zero dependencies, zero build step — just static files

## Files

- `index.html` — page structure
- `styles.css` — dark/light themes, responsive layout
- `app.js` — rules, AI, canvas rendering, game logic

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```
