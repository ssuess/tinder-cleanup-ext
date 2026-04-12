# Tinder Cleanup

Chrome extension to mass-unmatch Tinder matches based on configurable rules.

## Features

- **Passive data capture** — reads match data from Tinder's own API responses, no extra API calls
- **Filter rules** (combine with AND logic):
  - Match older than X days
  - Inactive for X days
  - No reply in X days (you sent the last message)
  - Empty — zero messages exchanged
- **Preview before deleting** — see who will be unmatched with names, photos, match dates, and which rules triggered
- **Selective unmatching** — checkboxes to deselect anyone you want to keep
- **Click profile photos** to open that conversation in Tinder
- **Staggered delays** between unmatches to mimic natural usage (configurable)
- **Session limits** to prevent accidental mass-deletion (configurable)
- **Side panel UI** — stays open alongside Tinder for easy workflow

## Important

The extension can only see matches that Tinder has loaded in your browser. To include older matches, scroll down through your match list on tinder.com before running a preview.

## Install from Chrome Web Store

Coming soon.

## Install from source

```bash
git clone https://github.com/ssuess/tinder-cleanup-ext.git
cd tinder-cleanup-ext
npm install
npm run build
```

Then go to `chrome://extensions` → Enable "Developer mode" → "Load unpacked" → select the `dist` folder.

## Architecture

- **Injected script** — monkey-patches `window.fetch` in the page context to intercept Tinder API responses and capture auth headers
- **Content script** — injects the page script via `<script>` tag, relays data to the background service worker
- **Background service worker** — stores matches, evaluates filter rules, executes unmatches with staggered delays
- **Side panel (Vue 3 + Quasar)** — rule builder, preview list, execution controls, session log

## Tech stack

- TypeScript
- Vue 3 + Quasar
- Vite
- Chrome Manifest V3

## Privacy

All data stays local in your browser. No data is sent to any external server. See [PRIVACY.md](PRIVACY.md) for details.
