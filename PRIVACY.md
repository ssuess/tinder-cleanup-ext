# Privacy Policy — Tinder Cleanup

**Last updated:** April 12, 2026

## What data the extension accesses

Tinder Cleanup reads match data (names, photos, match dates, message counts) from API responses that your browser already receives when you use tinder.com. It does not make any additional API calls to collect data.

## How data is stored

All match data is stored locally in your browser using `chrome.storage.local`. Data is cleared automatically each time you reload tinder.com.

## What data is transmitted

**None.** Tinder Cleanup does not send any data to any external server, analytics service, or third party. The only network requests the extension makes are unmatch API calls to Tinder's servers, initiated explicitly by you through the Execute button.

## Permissions used

- **storage** — to save your filter settings and temporarily hold match data locally
- **sidePanel** — to display the extension interface as a side panel
- **tabs** — to navigate to match conversations when you click a profile photo, and to reload the Tinder tab after unmatching
- **host_permissions (api.gotinder.com)** — to send unmatch requests to Tinder's API on your behalf

## Data retention

Match data is held only for the duration of your browser session and is cleared on each page reload. Filter settings persist across sessions until you change them.

## Contact

If you have questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/ssuess/tinder-cleanup-ext).
