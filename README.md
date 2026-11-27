# Userscripts

Personal collection of browser userscripts.

## AI-assisted

Every script here is written with AI assistance: the code is generated or drafted by a language model (LLM) and reviewed before use. Treat this repo as personal tooling, not a supported product. Read a script before installing it, and use it at your own risk.

## Scripts

### YouTube

| Name | What it does | Link |
| --- | --- | :---: |
| YouTube: Custom Collection | Collection of the YouTube modules in this repo (`General Custom`, `Playback Custom`, `Playlist Tools`, `Quiet Page`), bundled into one install with sub-section settings, JSON backup and diagnostics. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-custom-collection.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube/youtube-custom-collection.user.js) |
| YouTube: General Custom | Custom video grid columns per section, Open Shorts in Watch Page, and Clean Share Link (with address bar cleaning and copy-at-time) in one script. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-general-custom.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube/youtube-general-custom.user.js) |
| YouTube: Playback Custom | Preferred resolution, playback defaults (speed, hotkeys, theater, volume, subtitles, audio track), autoplay control, auto-expand description, and video bookmarks. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-playback-custom.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube/youtube-playback-custom.user.js) |
| YouTube: Playlist Tools | Dedicated Watch Later Tools (`/playlist?list=WL`), Playlist Tools (normal playlists), Liked Videos Tools (`/playlist?list=LL`), and Watch Page playlist length calculator. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-playlist-tools.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube/youtube-playlist-tools.user.js) |
| YouTube: Quiet Page | Stops video previews and paused prompts, hides Members-only/Premium cards and People Mentioned, and hides feed, watch page and sidebar clutter. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-quiet-page.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube/youtube-quiet-page.user.js) |
| YouTube: Timer Tamer | Batches the page's timers onto the next animation frame while a video plays, to cut idle CPU. Install it alone: a second timer tamer would stack its delay on top of this one. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-timer-tamer.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube/youtube-timer-tamer.user.js) |

### YouTube Music

| Name | What it does | Link |
| --- | --- | :---: |
| YouTube Music: Custom Collection | Collection of the YouTube Music userscripts in this repo, bundled into one install with per-feature settings, JSON backup and diagnostics. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music/youtube-music-custom-collection.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-music/youtube-music-custom-collection.user.js) |
| YouTube Music: Dismiss Paused Prompt | Answers Yes to the "Video paused. Continue watching?" and "Are you still listening?" prompts on every page, and restarts playback if the prompt left it paused. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music/youtube-music-dismiss-paused-prompt.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-music/youtube-music-dismiss-paused-prompt.user.js) |
| YouTube Music: Prefer Song | Keeps playback on the song version instead of the music video, and hides the Song/Video toggle. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music/youtube-music-prefer-song.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-music/youtube-music-prefer-song.user.js) |
| YouTube Music: Quiet Page | Hides the Premium promos and the shelves titled Shorts. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music/youtube-music-quiet-page.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-music/youtube-music-quiet-page.user.js) |
| YouTube Music: Skip by Keyword | Skips tracks whose title, and optionally artist, contains a whole word from your list, such as live, remix or sped up. Stops after five skips in a row. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music/youtube-music-skip-by-keyword.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-music/youtube-music-skip-by-keyword.user.js) |

The **Install** links point at the raw `.user.js`; most userscript managers (Tampermonkey, Violentmonkey, ScriptCat, Safari Userscripts) pick it up and offer to install. The **Script** links open the source on GitHub.

## Preview

`preview/` holds an interactive preview page ([preview/index.html](preview/index.html)) that loads all 11 scripts directly from `scripts/`, along with captured UI screenshots in `preview/screenshots/`.

- Open [preview/index.html](preview/index.html) directly in a browser (or over a local HTTP server) to try every script's menu commands, settings panels, dark/light themes, and live stages.
- Regenerate all screenshots with Playwright:

```bash
node preview/capture.mjs
```

## Tests

The suites in `tests/` drive headless Chromium through Playwright:

```bash
node tests/run.mjs
```

Playwright is resolved from the repo if present, otherwise from the global npm root, so no `package.json` or build step is involved. Each suite starts its own local HTTP fixture and loads the script under test into it.

## Install

Click **Install** in the tables above. To add a script by hand:

1. Install a userscript manager, for example [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open its dashboard and create a new script.
3. Paste the contents of a `.user.js` file from this repo, replacing the template.
4. Save, then reload the target site.

## Conventions

File naming, script structure and commit rules: see [CONVENTIONS.md](CONVENTIONS.md).

## License

MIT. See [LICENSE](LICENSE).

Copyright (c) 2026 Afadfath03
