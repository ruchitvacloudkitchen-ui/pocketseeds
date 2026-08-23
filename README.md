# PocketSeeds

తెలుగు వారి కోసం డబ్బు యాప్ — a Telugu-first money app for Indian households.

**Live:** https://ruchitvacloudkitchen-ui.github.io/pocketseeds/

Open it on a phone and use "Add to Home Screen". It works offline and all data
stays on the device — no account, no server, nothing uploaded.

## What it does

Income, expenditure and balance, plus the money things Telugu households actually
run on and no other app records:

- **వడ్డీ** — hand loans priced the way they are spoken (₹2 or ₹3 per 100 per month),
  with interest accrued, total payable, and the true annual rate
- **చిట్టీలు** — instalments, whether the chit is taken, net position
- **మొయి పుస్తకం** — the wedding gift book: who gave what, and what to return
- **పండుగ నిధి** — save monthly for Sankranti, Ugadi, Dasara, a family wedding
- **అరువు** — kirana shop credit
- Auto monthly income on any day from the 1st to the 7th
- UPI pay with deep links, and a bank-SMS parser with a review queue
- 50/30/20 budget, family expense splitting, credit health, tax deductions,
  emergency fund, search, and monthly reports (PDF / WhatsApp)
- Voice entry in Telugu, bilingual తెలుగు | English labels throughout

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app — markup, styles, logic, both languages |
| `manifest.webmanifest` | Install-to-home-screen metadata |
| `sw.js` | Service worker for offline use |

No build step, no dependencies. Edit `index.html` and commit.

## Ads

The banner under recent activity is a live slot. Add your Google AdSense client
and slot IDs in Settings to serve real ads; until then it shows a house ad.
