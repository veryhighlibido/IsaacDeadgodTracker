# Isaac Deadgod Tracker

A desktop tracker for *The Binding of Isaac: Repentance+* that reads your save
file live and shows what is still missing on the way to Dead God — including the
hidden counters the game never puts on screen. It ships an OBS overlay for
streams and a panel for the details.

The interface speaks English and Russian. On the first launch it follows your
system language; the switch in the header changes it and the choice sticks.

## What it shows

**Panel** — remaining secrets, completion marks per character, challenges,
items, the 19 blind counters behind unlocks such as Counterfeit Coin, Broken
Modem or Stop Watch, a feed of what unlocked while it was running, and the save
file it is watching.

**Overlay** — five view sets for a browser source in OBS: counters and
secrets, watched secrets, what is left, the score, or the mark matrix. Icon
size, column count, spacing, scale, numbers and backdrop are all adjustable,
and the tab gives you the exact pixel size of the source.

Besides the blind counters, the counters and secrets view can show how many
achievements are unlocked (out of 641), how many items you have touched and how
many Hard marks you have toward Death Certificate.
Any counter or secret can be switched off or moved, by dragging or with the
arrows. The fine tuning block is optional: it adds a tile layout that puts
everything in one grid with a set number of rows and the numbers beside the
icons in the game font, and it lets you choose whether locked entries stay in
colour or turn grey, and whether unlocked ones get a check mark, disappear or
fade.

**Presets** — keep several overlay setups and switch between them in the
overlay tab or from the tray menu. Changes stay as a draft, marked with a dot,
until you save or revert them; OBS shows the draft live.

## Safety

The tracker never holds a handle on the save file. Every read is a snapshot: the
file is opened for reading with share-delete and share-write, read to the end,
and closed immediately, so the game and Steam Cloud can always replace or delete
it. `src-tauri/tests/no_lock.rs` covers this, including a test that reproduces
what a held handle does instead.

It writes to the game's files only when you ask it to on the File tab: switching
Steam Cloud changes the `SteamCloud=` line in `options.ini`, and, if you tick
the box, copies your slots to the other folder after backing up whatever was
there to `%APPDATA%\IsaacDeadgodTracker\backups`. The switch is refused while
the game is running.

## Install

Download `IsaacDeadgodTracker.exe` from the Releases page and run it. There is
nothing to install: it is a single portable executable that keeps its settings in
`%APPDATA%`. Windows 10/11 with the WebView2 runtime (preinstalled on
Windows 11).

Repentance+ keeps its saves in one of two places, and `SteamCloud=` in
`Documents\My Games\Binding of Isaac Repentance+\options.ini` decides which:

- Steam Cloud on: `<Steam>\userdata\<account id>\250900\remote\rep+persistentgamedata{1,2,3}.dat`
- Steam Cloud off: `Documents\My Games\Binding of Isaac Repentance+\persistentgamedata{1,2,3}.dat`

On the first launch the tracker reads `options.ini` and picks the most recent
slot from the folder the game actually uses. The File tab shows both folders
with their slots and opens either one in Explorer. Repentance and Afterbirth+
saves and OneDrive-redirected Documents are detected too, and any other file can
be picked by hand.

## Overlay in OBS

1. Open the overlay tab in the app and pick a view. For counters and secrets,
   tick what should be on screen in the list below and put it in order; open
   Fine tuning if you want the tile layout or a different look.
2. Pick the overlay language. It belongs to the preset, so the panel can stay in
   one language while the stream shows the other.
3. Pick a link format and copy the link:
   - **Realtime** shows whichever preset is selected and follows every switch;
   - **This preset** always shows one preset, edits included;
   - **Snapshot** bakes the current settings into the link and never changes.
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
  overlay presets and their drafts, what the close button does. They survive
  restarts.
- Tray: the close button can hide the window to the tray instead of quitting;
  the app asks on the first close. The tray menu switches presets and quits.
- Local server: `127.0.0.1:35455`, or the next free port. It listens on loopback
  only and serves the panel, the overlay and a WebSocket with save snapshots.

## License

Not open source. You may use the app and build it for yourself; you may not
redistribute it, reuse its code in anything else, or make money from it. See
[LICENSE](LICENSE) for the exact terms and [NOTICE](NOTICE) for the fonts,
sprites and dependencies that belong to other people.

Unofficial fan-made tool. Not affiliated with Nicalis or Edmund McMillen.
