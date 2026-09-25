# Encore — ad-free music player

A Spotify-style music player for **your own music**, with no ads. It runs in the browser and installs like an app on iPhone, Android and Mac. Nothing to build and no server needed: songs are stored on your device (IndexedDB) and play offline.

## Features

- **Spotify-style UI**: sidebar library on desktop, tab bar and mini-player on phones, and a full-screen *Now Playing* view with colors taken from the album art
- **Import** MP3, M4A/AAC, FLAC, WAV, OGG. Titles, artists, albums, track numbers and **album art** are read from the file tags (ID3, iTunes, Vorbis). Untagged files are named from `Artist - Title.mp3`
- **Drag & drop** files or whole folders onto the window (desktop)
- **Library**: albums, artists, genres, *All Songs*, *Liked Songs*, playlists (create, rename, delete, add and remove songs)
- **Playback**: shuffle, repeat all or one, queue (play next, add to queue, jump, remove), seek, volume
- **Lock screen and media keys** through the Media Session API (AirPods, Control Center, the Mac's Now Playing widget)
- **Search** across songs, artists, albums and playlists
- **Remembers your spot**: queue, song and position are restored when you come back
- **Demo songs**: “Try demo songs” creates a few original tracks and covers in the browser so you can try the app right away
- **Offline**: a service worker caches the app

## Run it locally

```bash
npx serve .          # or: python3 -m http.server 8080
```

Open the printed URL. Service workers need `http://localhost` or HTTPS; opening `index.html` as a file won't work.

## Put it on your phone and Mac

Your phone needs to load it from an HTTPS URL, so host it (free):

1. **GitHub Pages**: this repo has a workflow at `.github/workflows/pages.yml`. In the repo, go to **Settings → Pages → Source: GitHub Actions**, then push to `main`. Your app will be at `https://<user>.github.io/<repo>/`.
   Or use any static host (Netlify, Vercel, Cloudflare Pages): upload the folder as-is.
2. **iPhone / iPad** (Safari): open the URL → **Share → Add to Home Screen**. It opens full-screen like a native app.
3. **Mac**: Safari → **File → Add to Dock**, or Chrome → **⋮ → Cast, save and share → Install page as app**.
4. **Android** (Chrome): **⋮ → Add to Home screen / Install app**.

> Each device has its own library, because songs are stored on the device. Add music on each one: on iPhone, the file picker can pull from the Files app or iCloud Drive.

## Keyboard shortcuts (desktop)

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ⌘/Ctrl + → / ← | Next / previous |
| Shift + → / ← | Seek ±10 s |
| ⌘/Ctrl + ↑ / ↓ | Volume |
| S / L | Shuffle / like current song |
| / or ⌘K | Search |
| Esc | Close menus / Now Playing |

## Project layout

```
index.html            app shell
styles.css            all styling (desktop + phone layouts)
js/app.js             state, views, router, menus, import
js/player.js          playback engine, queue, lock-screen controls
js/meta.js            tag + album-art readers, color extraction
js/db.js              IndexedDB helpers
js/icons.js           inline SVG icons
js/demo.js            generates the demo songs
sw.js                 offline cache
manifest.webmanifest  install metadata
```

## Notes

- Encore does not stream from Spotify or any other service. It plays audio files you own.
- Which formats play depends on the browser. FLAC and OGG need a recent Safari. Files a browser can't play are skipped on import, and the app tells you.
- iOS can clear website storage for sites you haven't opened in weeks. Installing the app to the Home Screen and using it regularly keeps your library safe.
