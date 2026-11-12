# Userscripts

Personal collection of browser userscripts.

## AI-assisted

Every script here is written with AI assistance: the code is generated or drafted by a language model (LLM) and reviewed before use. Treat this repo as personal tooling, not a supported product. Read a script before installing it, and use it at your own risk.

## Scripts

| Name | What it does | Link |
| --- | --- | :---: |
| YouTube: Auto Expand Description | Expands the watch page description automatically. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-expand-description.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-expand-description.user.js) |
| YouTube: Autoplay Control | Decides what happens when a video ends: next, wait, stop, or loop, with a per-tab limit. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-autoplay-control.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-autoplay-control.user.js) |
| YouTube: Custom Collection | Collection of the YouTube userscripts in this repo, bundled into one install with per-feature settings. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-custom-collection.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-custom-collection.user.js) |
| YouTube: Dismiss "Video paused. Continue watching?" | Answers the "Video paused. Continue watching?" and "Are you still watching?" prompts with Yes, No, or leaves them alone. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-dismiss-paused-prompt.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-dismiss-paused-prompt.user.js) |
| YouTube: Hide "These people are mentioned in the video" | Hides the "These people are mentioned in the video" shelf on YouTube watch pages. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-people-mentioned.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-hide-people-mentioned.user.js) |
| YouTube: Hide Members Only and Premium | Hides videos marked Members only or Premium in feeds, search results, sidebars and playlists. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-members-only.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-hide-members-only.user.js) |
| YouTube: Playback Defaults | Sets defaults for speed, theater mode, volume, subtitles and audio track, with optional speed hotkeys and auto-pause. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-playback-defaults.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-playback-defaults.user.js) |
| YouTube: Preferred Resolution | Starts videos at a preferred quality, with the next best available as fallback. Set it from the userscript manager menu. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-preferred-resolution.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-preferred-resolution.user.js) |
| YouTube: Shorts to Watch | Opens Shorts in the normal watch player by rewriting `/shorts/` links to `/watch`. | [Install](https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-shorts-to-watch.user.js) · [Script](https://github.com/Afadfath03/Userscript/blob/main/scripts/youtube-shorts-to-watch.user.js) |

The **Install** links point at the raw `.user.js`; most userscript managers (Tampermonkey, Violentmonkey, ScriptCat, Safari Userscripts) pick it up and offer to install. The **Script** links open the source on GitHub.

## Tests

The suites in `tests/` drive headless Chromium through Playwright:

```bash
node tests/run.mjs
```

Playwright is resolved from the repo if present, otherwise from the global npm root, so no `package.json` or build step is involved. Each suite starts its own local HTTP fixture and loads the script under test into it.

## Install

Click **Install** in the table above. To add a script by hand:

1. Install a userscript manager, for example [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open its dashboard and create a new script.
3. Paste the contents of a `.user.js` file from this repo, replacing the template.
4. Save, then reload the target site.

## Conventions

File naming, script structure and commit rules: see [CONVENTIONS.md](CONVENTIONS.md).

## License

MIT. See [LICENSE](LICENSE).

Copyright (c) 2026 Afadfath03
