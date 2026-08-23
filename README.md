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

## Google backup (one-time setup)

The "Save my data" bar signs the user in with Google and keeps one private copy
of their data in their **own** Google Drive app folder. No server, and the copy
sits in a folder only this app can open.

The client ID for the live site is already built into `index.html`, so sign-in
works with no setup. A web OAuth client ID is a public identifier restricted by
its authorised origins, not a secret.

If you host your own copy on a different address, create your own client ID:

1. https://console.cloud.google.com → new project
2. **APIs & Services → Library** → enable **Google Drive API**
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   → *Web application*
4. Under **Authorised JavaScript origins** add the site address, e.g.
   `https://ruchitvacloudkitchen-ui.github.io`
5. Copy the client ID and paste it in the app: Save my data → the setup sheet

While the Google Cloud project is in **Testing**, only accounts listed as test
users can sign in. Publish the app when you are ready for real users.

## Editing the fund list

`FUND_LIST` in `index.html` holds scheme name and category only — deliberately
no returns, expense ratios or ranking. Those change constantly, and publishing
stale or unverified numbers is what SEBI's fair-communication rules exist to
prevent.

Before publishing or promoting this screen, verify every scheme name, category
and risk label against the AMC factsheet or AMFI, and stamp the screen with the
date you checked. If you add performance figures later, add the "as of <date>"
label with them.

The screen carries the required framing already: educational title, stated
selection criteria, a prompt to check current data, and the market-risk
disclaimer.
