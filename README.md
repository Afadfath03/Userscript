# Userscripts

Personal collection of browser userscripts.

## AI-assisted

Every script here is written with AI assistance: the code is generated or drafted by a language model (LLM) and reviewed before use. Treat this repo as personal tooling, not a supported product. Read a script before installing it, and use it at your own risk.

## Scripts

| Script | What it does | Install |
| --- | --- | :---: |
| `youtube-autoplay-control.user.js` | Decides what happens when a video ends: next, wait, stop, or loop, with a per-tab limit. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-autoplay-control.user.js) |
| `youtube-expand-description.user.js` | Expands the watch page description automatically. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-expand-description.user.js) |
| `youtube-hide-people-mentioned.user.js` | Hides the "These people are mentioned in the video" shelf on YouTube watch pages. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-people-mentioned.user.js) |
| `youtube-playback-defaults.user.js` | Sets defaults for speed, theater mode, volume, subtitles and audio track, with optional speed hotkeys and auto-pause. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-playback-defaults.user.js) |
| `youtube-preferred-resolution.user.js` | Starts videos at a preferred quality, with the next best available as fallback. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-preferred-resolution.user.js) |

The **Install** links point at the raw `.user.js`; most userscript managers (Tampermonkey, Violentmonkey, ScriptCat, Safari Userscripts) pick it up and offer to install.

## Install

Click **Install** in the table above. To add a script by hand:

1. Install a userscript manager, for example [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open its dashboard and create a new script.
3. Paste the contents of a `.user.js` file from this repo, replacing the template.
4. Save, then reload the target site.

## Conventions

- English only: code, comments, `@name`, `@description`, and file names. Text a script matches on a page stays in that site's language.
- All scripts live in `scripts/`.
- File names follow `<site>-<action>.user.js`.
- The script table is sorted alphabetically.
- No build step; each file is a standalone script.

## License

MIT. See [LICENSE](LICENSE).

Copyright (c) 2026 Afadfath03
