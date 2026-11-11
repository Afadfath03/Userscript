# Conventions

Rules for this repository: how files are named, how scripts are structured, and how commits are written.

## Scripts

- English only: code, comments, `@name`, `@description`, and file names. Text a script matches on a page stays in that site's language.
- All scripts live in `scripts/`.
- File names follow `<site>-<action>.user.js`.
- Userscript names use Title Case: every word capitalized and separated by spaces, not hyphens (for example `YouTube: Playback Defaults`).
- Quoted UI text inside a name keeps its original casing, because it is the exact string shown on the site: `YouTube: Hide "These people are mentioned in the video"`.
- No build step; each file is a standalone script.
- The script table in the README is sorted alphabetically by name.

## Commits

- Conventional Commits: `type(scope): subject`, for example `feat(userscript): add subtitles` or `docs: note the table is alphabetical`.
- Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
- Subject in English, imperative mood, no trailing period.
- One logical change per commit. If a change touches code and documentation for different reasons, split it.
- Inspect `git status` and `git diff` before committing.
- Never commit secrets or `.env` files.
- No force-push, no rewriting pushed history, no amending shared commits.
