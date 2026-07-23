# Testing Status

## Legend
- ✅ Passed
- ❌ Failed
- ⏳ Owner UAT pending
- 🔲 Not yet tested
- 🔷 Deferred

---

## Code-Level Tests (Automated)

| # | Test | Status |
|---|------|:------:|
| C1 | Node.js syntax check — `app.js` | ✅ |
| C2 | Node.js syntax check — `code.test.gs` | ✅ |
| C3 | Brace/paren/bracket balance — `app.js` | ✅ |
| C4 | No `</script>` in JavaScript | ✅ |
| C5 | All GAS action names preserved | ✅ |
| C6 | All DOM IDs matched | ✅ |
| C7 | All DOM IDs unique (no duplicates) | ✅ |
| C8 | 29 SuperAdmin fields in APPROVED_SETTINGS_KEYS | ✅ |
| C9 | No duplicate functions (44 unique in app.js, 34 in code.test.gs) | ✅ |
| C10 | Secret scan (no passwords, no Sheet IDs, no API keys) | ✅ |
| C11 | `.gitignore` excludes backups | ✅ |
| C12 | `SCHEDULE_JSON` in both APPROVED_SETTINGS_KEYS and JSON_SETTINGS | ✅ |
| C13 | 0 BootCamp/BOARDS/Thinker Table/Bangi Gateway references | ✅ |
| C14 | No hard-coded WhatsApp links | ✅ |

---

## Browser-Verified Tests

| # | Test | Status |
|---|------|:------:|
| B1 | Page loads without JS errors | ✅ |
| B2 | No JS rendered as page text | ✅ |
| B3 | `app.js` loads from external file | ✅ |
| B4 | Admin Login opens via button | ✅ |
| B5 | Admin Login opens via Enter key | ✅ |

---

## TEST GAS Endpoint Tests

| # | Test | Status |
|---|------|:------:|
| G1 | `getConfig` returns JSON with settings | ✅ |
| G2 | `dashboard` returns participant totals | ⏳ |
| G3 | `validateSetup` returns header findings | ⏳ |
| G4 | `saveSettings` persists and returns | ⏳ |
| G5 | `adminLogin` returns token | ⏳ |
| G6 | `adminLogout` invalidates token | ⏳ |

---

## Features Verified in Code

| # | Test | Status |
|---|------|:------:|
| F1 | Dynamic public title/subtitle rendering | ✅ |
| F2 | Dynamic poster rendering | ✅ |
| F3 | Dynamic countdown label | ✅ |
| F4 | Dynamic meta tags (og:title, og:description, og:image) | ✅ |
| F5 | Dynamic marketing copy section | ✅ |
| F6 | Dynamic benefits list | ✅ |
| F7 | Dynamic speaker info | ✅ |
| F8 | Dynamic registration CTA (hidden when URL empty) | ✅ |
| F9 | Dynamic schedule (success page) | ✅ |
| F10 | Dynamic branding colours (gradient CSS injection) | ✅ |
| F11 | Dynamic footer text | ✅ |
| F12 | Dynamic PDF title/venue | ✅ |
| F13 | Dynamic WhatsApp link (hidden when empty) | ✅ |
| F14 | Dynamic WhatsApp message with {nama}/{event}/{link} | ✅ |
| F15 | WhatsApp empty-link guard | ✅ |
| F16 | Settings canonical state (`window.currentSettings`) | ✅ |
| F17 | Save All immediately applies to public page | ✅ |
| F18 | Load All confirms persistence | ✅ |
| F19 | HTML escaping on all dynamic text | ✅ |
| F20 | Photo section text dynamically updated | ✅ |
| F21 | System Validation panel header findings rendering | ✅ |
| F22 | All BootCamp/BOARDS text removed | ✅ |

---

## Owner UAT Checklist

### PUBLIC PAGE

| # | Test | Expected Result |
|:--:|------|-----------------|
| 1 | Event title | `EVENT_NAME` appears in header `<h1>` and browser tab |
| 2 | Description | `EVENT_DESCRIPTION` appears as subtitle and description section |
| 3 | Countdown | Uses `EVENT_DATE` + `EVENT_START_TIME`, label shows `EVENT_SHORT_NAME` |
| 4 | Poster | `POSTER_URL` image displayed, alt text = `EVENT_NAME` |
| 5 | Venue | `EVENT_VENUE` displays correctly |
| 6 | Quota | `PARTICIPANT_QUOTA` shows in wishlist quota label |
| 7 | Marketing copy | `MARKETING_COPY` renders with line breaks |
| 8 | Benefits | `BENEFITS_JSON` items render with icons and text |
| 9 | Speaker info | `SPEAKER_INFO` renders, hidden if empty |
| 10 | Registration CTA | `REGISTRATION_CTA_TEXT` button links to `REGISTRATION_URL`, hidden if either empty |
| 11 | Schedule | `SCHEDULE_JSON` renders in success page after attendance |
| 12 | Colours | `PRIMARY_COLOR` + `SECONDARY_COLOR` update gold-gradient |
| 13 | Footer | `FOOTER_TEXT` or `ORGANISER_NAME` in footer |
| 14 | Closed message | `CLOSED_MESSAGE` shown when countdown expires |
| 15 | Success message | `SUCCESS_MESSAGE` shown after attendance confirmation |
| 16 | Mobile layout | Page remains usable on mobile viewport |

### PARTICIPANT

| # | Test | Expected Result |
|:--:|------|-----------------|
| 17 | Search by name | Participant found, details shown correctly |
| 18 | Search by phone | Participant found by phone number |
| 19 | Search by PG Code | Participant found by PG Code |
| 20 | Participant not found | Shows "Kuota Penuh" with dynamic event name, Wishlist prompt |
| 21 | Attendance confirmation | "SAYA HADIR" button works, redirects to success page |
| 22 | Duplicate attendance | System rejects duplicate check-in |
| 23 | Wishlist | Wishlist tab accepts and submits registration |
| 24 | Public replacement | Replacement form submits, admin sees pending approval |

### ADMIN

| # | Test | Expected Result |
|:--:|------|-----------------|
| 25 | Login | Admin login succeeds with correct credentials |
| 26 | Token persistence | Session survives page refresh (within 6 hours) |
| 27 | System Validation | Panel shows all 4 tabs ✅, all 6 headers found |
| 28 | Dashboard totals | Total, Hadir, Tidak Hadir counts match Sheet data |
| 29 | Participant list | All participants listed with name, phone, PG Code, WA status |
| 30 | WA status | Single status change persists after refresh |
| 31 | Single WA invite | Opens WhatsApp with dynamic message and link |
| 32 | Bulk WA invite | Opens WhatsApp for each selected participant in sequence |
| 33 | Replacement approval | Admin can approve/reject replacement requests |
| 34 | Save settings | Save All persists values, no rejected keys |
| 35 | Reload settings | Reload restores saved values from Sheet |
| 36 | Logout | Clears session, redirects to public page |
| 37 | Expired session | `AUTH_REQUIRED` triggers auto-logout |

### OUTPUT

| # | Test | Expected Result |
|:--:|------|-----------------|
| 38 | PDF title | Shows `PDF_TITLE` or `EVENT_NAME` |
| 39 | PDF venue | Shows `PDF_VENUE` or `EVENT_VENUE`, omitted if both empty |
| 40 | PDF table | All participants listed with Bil, Nama, Phone, PG Code, Tandatangan |
| 41 | Print dialog | Browser print dialog opens |
| 42 | WA event name | Message contains correct event name from settings |
| 43 | WA group link | Opens correct WhatsApp group link from settings |
| 44 | WA placeholders | `{nama}`, `{event}`, `{link}` replaced correctly |
| 45 | No legacy text | Zero BootCamp/BOARDS/Thinker Table text anywhere |
| 46 | Console errors | Zero errors in browser DevTools Console |
| 47 | Network requests | Zero failed `app.js` or API requests |

---

## Production Verification (Deferred)

| # | Test | Status |
|---|------|:------:|
| D1 | Production GAS unchanged | 🔲 |
| D2 | Production Sheet unchanged | 🔲 |
| D3 | Cloudflare smoke tests | 🔲 |
| D4 | Cache purge verified | 🔲 |
| D5 | Rollback plan available | 🔲 |
