# Userscripts

Personal collection of browser userscripts.

## AI-assisted

Every script here is written with AI assistance: the code is generated or drafted by a
language model (LLM) and reviewed before use. Treat this repo as personal tooling, not a
supported product. Read a script before installing it, and use it at your own risk.

## Scripts

| Script | What it does |
| --- | --- |
| [`scripts/youtube-hide-people-mentioned.user.js`](scripts/youtube-hide-people-mentioned.user.js) | Hides the "These people are mentioned in the video" shelf on YouTube watch pages. |

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the extension dashboard and create a new script.
3. Paste the contents of a `.user.js` file from this repo, replacing the template.
4. Save, then reload the target site.

## Conventions

- English only: code, comments, `@name`, `@description`, and file names.
- All scripts live in `scripts/`.
- File names follow `<site>-<action>.user.js`.
- No build step; each file is a standalone script.

## License

MIT. See [LICENSE](LICENSE).

Copyright (c) 2026 Afadfath
