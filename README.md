# Isaac Deadgod Tracker

A desktop tracker for *The Binding of Isaac: Repentance+* that reads your save
file live and shows what is still missing on the way to Dead God — including the
hidden counters the game never puts on screen. It ships an OBS overlay for
streams and a panel for the details.

The interface speaks English and Russian. On the first launch it follows your
system language; the switch in the header changes it and the choice sticks.

## What it shows

**Panel** — remaining secrets, completion marks per character, challenges,
items, the five threshold counters (thimble games, daily streak, Rubber Cement,
beds, Battery Bum payouts), a feed of what unlocked while it was running, and
the save file it is watching.

**Overlay** — five view sets for a browser source in OBS: counters and
secrets, watched secrets, what is left, the score, or the mark matrix. Icon
size, column count, spacing, scale, numbers and backdrop are all adjustable,
and the tab gives you the exact pixel size of the source.

Besides the five thresholds, the counters and secrets view can show how many
achievements are unlocked (out of 641) and how many items you have touched.
Any counter or secret can be switched off or moved, by dragging or with the
arrows. The fine tuning block is optional: it adds a tile layout that puts
everything in one grid with a set number of rows and the numbers beside the
icons in the game font, and it lets you choose whether locked entries stay in
colour or turn grey, and whether unlocked ones get a check mark, disappear or
fade.

## Safety

The tracker never writes to the game folder and never holds a handle on the save
file. Every read is a snapshot: the file is opened for reading with share-delete
and share-write, read to the end, and closed immediately, so the game and Steam
Cloud can always replace or delete it. `src-tauri/tests/no_lock.rs` covers this,
including a test that reproduces what a held handle does instead.

## Install

Download `IsaacDeadgodTracker.exe` from the Releases page and run it. There is
nothing to install: it is a single portable executable that keeps its settings in
`%APPDATA%`. Windows 10/11 with the WebView2 runtime (preinstalled on
Windows 11).

Saves are picked up automatically from
`Documents\My Games\Binding of Isaac Repentance+\persistentgamedata{1,2,3}.dat`
(Repentance and Afterbirth+ folders are detected too, as is OneDrive-redirected
Documents). Any other file can be picked by hand in the app.

## Overlay in OBS

1. Open the overlay tab in the app and pick a view. For counters and secrets,
   tick what should be on screen in the list below and put it in order; open
   Fine tuning if you want the tile layout or a different look.
2. Pick the overlay language — the link carries its own `lang`, so the panel can
   stay in one language while the stream shows the other.
3. Copy the link.
4. In OBS add a **Browser** source, paste the link, and set width and height to
   the size shown next to the link.
5. Leave "Shutdown source when not visible" off, so the overlay keeps its
   connection between scenes.

## Build it yourself

Requirements: Windows, [Node.js](https://nodejs.org) 22+, a stable
[Rust](https://rustup.rs) toolchain with the MSVC target, and the Visual Studio
Build Tools that rustup asks for.

```
npm ci
npm run tauri build
```

The executable lands in `src-tauri/target/release/isaac-deadgod-tracker.exe`.
The same command also builds an NSIS installer in
`src-tauri/target/release/bundle/nsis/`, if you would rather have one.

Development:

```
npm run tauri dev      # Vite on :5310, app window on the embedded server
npm run build          # frontend only, into dist/ (the binary embeds it)
cargo test --manifest-path src-tauri/Cargo.toml   # run npm run build first
```

`dist/` must exist before the Rust side compiles, because the release binary
embeds it. `npm run build` also rewrites the PNGs in `dist/` without
compression (`scripts/store-png.mjs`, pixels stay the same). The binary grows,
but it no longer carries megabytes of compressed data, which ML-based
antivirus engines tend to read as a packed payload.

## Where it keeps things

- Settings: `%APPDATA%\IsaacDeadgodTracker\settings.json` — watched file, port,
  overlay setup. They survive restarts.
- Local server: `127.0.0.1:35455`, or the next free port. It listens on loopback
  only and serves the panel, the overlay and a WebSocket with save snapshots.

## License

Not open source. You may use the app and build it for yourself; you may not
redistribute it, reuse its code in anything else, or make money from it. See
[LICENSE](LICENSE) for the exact terms and [NOTICE](NOTICE) for the fonts,
sprites and dependencies that belong to other people.

Unofficial fan-made tool. Not affiliated with Nicalis or Edmund McMillen.
