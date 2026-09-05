# Google Play — Data safety declaration

Working document for the Play Console **Data safety** form.

**This must agree with `/privacy/` word for word.** A mismatch discovered after
launch is a suspension, not a rejection. If you change one, change the other in
the same commit — the privacy policy is the published claim and this form is
the sworn one.

Last checked against the code and the policy: **5 September 2026**
(`index.html`, `box/index.html`, `seedbox/index.html`, `privacy/index.html`).

---

## The one-paragraph summary

PocketSeeds has no server and no user accounts. Everything the user enters is
written to `localStorage` on their own device. Three things leave the device,
all of them user-initiated: an optional **Google Drive backup** to the user's
own Drive, **voice input** handled by the browser's speech service, and a
**WhatsApp message** when someone orders a Seed Box. The developer operates no
database and receives no copy of any entry.

---

## Section 1 — Data collection and sharing

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — every transfer is HTTPS (Google APIs, WhatsApp) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — see *Data deletion* below |

> **Why "Yes" and not "No".** Nothing reaches a server of ours, and it is
> tempting to answer No. But Play counts *transferred off the device* as
> collection even when the destination is the user's own Google Drive, and the
> Drive backup carries names and phone numbers. Answering No here is the single
> most likely way to get this app suspended.

---

## Section 2 — Data types

For every type below: **Collected: Yes · Shared: No · Processed ephemerally: No ·
Required or optional: Optional · Purpose: App functionality.**

"Shared: No" is correct throughout — data goes to the *user's own* Google Drive
or to a message the user sends themselves. Neither is a transfer to a third
party for that party's own use.

### 2.1 Personal info → Name

- **What:** Google account display name.
- **When:** only after the user taps *Save my data* and signs in.
- **Where it goes:** stays on the device (`pocketseeds.google`), shown so the
  user can see which account is connected.
- **Code:** `GSCOPE` includes `profile`; `googleConnect()`.

### 2.2 Personal info → Email address

- **What:** Google account email.
- **When:** same sign-in.
- **Where it goes:** stays on the device; displayed in the backup bar.
- **Code:** `GSCOPE` includes `openid email`; read from `oauth2/v3/userinfo`.

### 2.3 Personal info → Other info (in-app entries)

- **What:** free-text names attached to money — the person a hand loan is with,
  the shop an *udhaar* is at, the person and event in the *moyi* gift book.
- **Where it goes:** device; included in the Drive backup if the user enables it.

### 2.4 Financial info → Other financial info

- **What:** income and expense entries with categories, dates and notes; hand
  loans (principal, interest rate); chit funds; *udhaar*; savings goals;
  festival funds; budget income; tax slab; a self-entered credit score; Seed Box
  progress (box number and which amounts are marked filled).
- **Where it goes:** device; included in the Drive backup if enabled.
- **Not collected:** no bank account numbers, no card numbers, no payment
  credentials. The app never connects to a bank and processes no payment.

### 2.5 Contacts → Contacts

**Declare this one. It is the easiest to overlook and the most expensive to miss.**

- **What:** names **and phone numbers** the user types in for two features —
  family members (`DB.members`: `{id, name, phone}`) and their own emergency
  contacts (`DB.sos`: `{id, name, phone}`).
- **How obtained:** typed by the user. The app has **no** contacts permission
  and never reads the device address book.
- **Where it goes:** device — **and into the Google Drive backup**, because the
  backup is `JSON.stringify(DB)`, the whole file, not a selection.
- **Code:** `googleBackup()`; `DEFAULTS.members`, `DEFAULTS.sos`.

### 2.6 App activity → Other actions

- **What:** which reminders have been notified (`pocketseeds.notified`), months
  whose statement was downloaded, language and theme preference.
- **Where it goes:** device; preferences are in the backup.

### 2.7 Audio → Voice or sound recordings

- **What:** speech captured when the user taps the microphone in *Ask about
  your money*.
- **Where it goes:** **not to us.** The browser's speech recognition handles it,
  and in Chrome the audio goes to Google's speech servers for transcription.
  PocketSeeds receives only the resulting text and stores no audio.
- **Collected by this app: No. Disclosed in the policy anyway**, because the
  user is entitled to know their voice leaves the device.
- **In the Android build this is moot:** the microphone button is **hidden when
  the app runs as a TWA** (`IS_TWA`), because speech input needs a
  `RECORD_AUDIO` permission the wrapper does not declare. A button that cannot
  work is worse than no button. Revisit this section if that changes.

---

## Section 3 — What does *not* apply

| Type | Why not |
|---|---|
| Location | No geolocation API anywhere in the app |
| Messages / SMS | **No SMS permission.** The bank-message feature parses only text the user pastes in themselves |
| Photos / videos | Never accessed |
| Contacts (device address book) | Never accessed — §2.5 is typed input only |
| Calendar (device) | The in-app calendar is the app's own data, not the system calendar |
| Health, fitness | Not applicable |
| Installed apps, device IDs | Never read |
| Purchase history | No billing — the Seed Box is a physical product ordered off-platform |
| Crash logs, diagnostics, analytics | **No analytics SDK, no crash reporter, no tracking script** |

---

## Section 4 — Third parties the app touches

Not all of these are "sharing" in Play's sense; list them so nothing is a
surprise.

| Destination | What reaches it | When |
|---|---|---|
| **Google Drive** (`googleapis.com`) | The whole `DB` object — see §2.3–2.6 | Only after sign-in and only on backup/restore |
| **Google Identity** (`accounts.google.com`) | Sign-in; returns name, email, picture | Only on sign-in |
| **Google speech** (via the browser) | Audio, while the mic is held | Browser feature; mic hidden in the TWA |
| **WhatsApp / Meta** (`wa.me`) | The user's phone number, display name, and a prefilled order message that **includes their box number** when they came from a tracker | Only when the user sends it |
| **YouTube** (`i.ytimg.com`) | IP address and referring page, from loading thumbnails | On the More tab |
| **GitHub Pages** | Standard web-server logs, including IP | Every load — it is the host |
| **Google AdSense** (`pagead2.googlesyndication.com`) | **Nothing today.** No ad client is configured, and the guard now requires a positively confirmed browser tab (`IS_BROWSER`), so it cannot load inside the Android app at all | Not active |

Fonts used to be fetched from Google Fonts; they are now served from this site,
so loading the app makes no font request to Google.

---

## Section 5 — Data deletion

Play asks how a user deletes their data. There is no account to delete, so:

- **On the device:** clear the app's storage, or uninstall it.
- **The Drive backup:** Drive → Settings → Manage apps → PocketSeeds →
  *Delete hidden app data*.
- **Revoke access:** Google Account → Security → Third-party apps → remove
  PocketSeeds.
- **Order messages:** ask on the same WhatsApp thread and we delete it.

Deletion URL for the form: `https://pocketseeds.online/privacy/`
(the *Your control over your data* section).

---

## Section 6 — Before you submit

- [ ] Grievance Officer name and postal address filled in at `/privacy/` —
      the placeholder must not go live
- [ ] `config.json` → `ad.*` still empty and no AdSense client set
- [ ] Privacy policy URL entered: `https://pocketseeds.online/privacy/`
- [ ] The wording here still matches the policy, section by section
- [ ] Re-read §2.5 — Contacts is the one reviewers check against the binary
