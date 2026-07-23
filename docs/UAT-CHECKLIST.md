# UAT Checklist — SuperAdmin V1

**Branch:** `event-update/new-event`  
**Commit:** `9a2f863`  
**Date:** ____________  
**Tester:** ____________  

Instructions: Run each test in order. Record Pass (✅) or Fail (❌). For failures, record details in Notes column.

---

## PUBLIC PAGE

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| P01 | Event title | Open public page | Header `<h1>` shows `EVENT_NAME` from settings | | | |
| P02 | Browser tab title | Check browser tab | Tab shows `{EVENT_NAME} — Attendance System` | | | |
| P03 | Description | Check subtitle + description section | `EVENT_DESCRIPTION` from settings visible | | | |
| P04 | Countdown label | Check countdown header | Shows `{EVENT_SHORT_NAME} Bermula Dalam:` | | | |
| P05 | Countdown values | Wait for countdown tick | Days/hours/mins/secs counting down from `EVENT_DATE` + `EVENT_START_TIME` | | | |
| P06 | Poster image | Check poster area | `POSTER_URL` image loaded, alt = event name | | | |
| P07 | Marketing copy | Check below poster | `MARKETING_COPY` text rendered with line breaks | | | |
| P08 | Benefits | Check benefits section | Icon + text items from `BENEFITS_JSON` displayed | | | |
| P09 | Speaker info | Check speaker section | `SPEAKER_INFO` text displayed, hidden if empty | | | |
| P10 | Registration CTA | Check registration button | Button text = `REGISTRATION_CTA_TEXT`, links to `REGISTRATION_URL` | | | |
| P11 | Registration hidden | Clear both CTA fields, save, refresh | Button hidden when either URL or text is empty | | | |
| P12 | Colours (primary) | Set `PRIMARY_COLOR`, save, refresh | Gold gradient header reflects new primary colour | | | |
| P13 | Colours (secondary) | Set `SECONDARY_COLOR`, save, refresh | Gold gradient header reflects new secondary colour | | | |
| P14 | Footer | Check page footer | Footer shows `FOOTER_TEXT` or `ORGANISER_NAME` | | | |
| P15 | Wishlist quota | Check wishlist tab | Shows `Kuota Penuh {N}/{N}` with `PARTICIPANT_QUOTA` value | | | |
| P16 | Mobile layout | Resize browser to 375px width | All elements stack vertically, text readable | | | |

---

## PARTICIPANT FLOWS

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| P17 | Search by name | Enter participant name → SEMAK | Participant card shown with name, phone, PG Code | | | |
| P18 | Search by phone | Enter participant phone → SEMAK | Same participant found | | | |
| P19 | Search by PG Code | Enter participant PG Code → SEMAK | Same participant found | | | |
| P20 | Not found | Enter random text → SEMAK | "Kuota Penuh" message with dynamic event name, Wishlist prompt | | | |
| P21 | Attendance confirmation | Find participant → SAYA HADIR | Success page shown with checkmark | | | |
| P22 | Duplicate attendance | Find same participant → SAYA HADIR | System rejects: "Anda telah membuat pengesahan" | | | |
| P23 | Wishlist submit | Go to Wishlist tab → fill form → submit | Success message, data appears in Admin Wishlist table | | | |
| P24 | Public replacement | Go to Replacement tab → fill both old + new → submit | Success message, Admin sees pending approval | | | |

---

## SUCCESS PAGE

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| S01 | Success message | After attendance confirmation | Shows `SUCCESS_MESSAGE` from settings | | | |
| S02 | Schedule title | Check schedule heading | Shows `Aturcara {EVENT_NAME}` | | | |
| S03 | Schedule items | Check schedule list | Time + title + description from `SCHEDULE_JSON` | | | |
| S04 | Closed message | Let countdown expire (or set past date) | `CLOSED_MESSAGE` shown, search hidden | | | |

---

## ADMIN — AUTHENTICATION

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| A01 | Login | Click Admin Login → enter creds → LOG MASUK | Redirected to Admin dashboard | | | |
| A02 | Wrong password | Wrong credentials → LOG MASUK | "Username atau password salah" error | | | |
| A03 | Token persistence | Login → refresh browser | Still on Admin page (token still valid) | | | |
| A04 | Logout | Click Log Keluar Dashboard | Redirected to public page, token invalidated | | | |
| A05 | Expired session | Wait 6+ hrs or clear token → try admin action | Auto-logout, redirected to public page | | | |

---

## ADMIN — SYSTEM VALIDATION

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| V01 | Panel visible | Login → check below dashboard header | System Validation panel visible | | | |
| V02 | Tab check | Check sheet icons | All 4 tabs show ✅ (Form_Responses, Kehadiran, Settings, Wishlist) | | | |
| V03 | Headers found | Check header rows | Green rows for each recognised header with source name + column | | | |
| V04 | Missing headers | Check header rows | Red rows for any missing headers (should be 0) | | | |
| V05 | Badge status | Check badge | ✓ OK shown in green | | | |

---

## ADMIN — DASHBOARD

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| D01 | Total count | Check Total Peserta Berdaftar | Matches actual participant rows in Form_Responses | | | |
| D02 | Hadir count | Check Sah Hadir (Check-In) | Matches actual attendance rows in Kehadiran | | | |
| D03 | Belum count | Check Belum Check-In | Total - Hadir = Belum | | | |
| D04 | Participant table | Check Senarai Utama | All participants listed with correct status badges | | | |
| D05 | Wishlist table | Check Senarai Menunggu | All wishlist entries listed with WA button | | | |

---

## ADMIN — WHATSAPP

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| W01 | WA status change | Change WA status dropdown → confirm | Status updates, persists after refresh | | | |
| W02 | Bulk WA status | Tick checkboxes → select status → KEMASKINI | All selected participants status updated | | | |
| W03 | Single WA invite | In wishlist table → click Hubungi WA | WhatsApp opens with dynamic invite message | | | |
| W04 | Bulk WA invite | Tick checkboxes → Invite WA Terpilih → Mula Mesej | WhatsApp opens for each participant in sequence | | | |
| W05 | WA placeholder {nama} | Set invite template with `{nama}` → send | Recipient's name appears in message | | | |
| W06 | WA placeholder {event} | Set invite template with `{event}` → send | Event name appears in message | | | |
| W07 | WA placeholder {link} | Set invite template with `{link}` → send | Group link appears in message | | | |
| W08 | Empty link guard | Clear WhatsApp Group Link → save → try invite | Error: "Sila tetapkan WhatsApp Group Link di Settings" | | | |
| W09 | Public WA button | Search participant → check WA button | Dynamic link used, button hidden if link empty | | | |

---

## ADMIN — REPLACEMENT

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| R01 | Pending approval | After public replacement submit | Replacement shown as pending in dashboard | | | |
| R02 | Approve | Click approve on replacement | Participant replaced, new name active | | | |
| R03 | Reject | Click reject on replacement | Original participant restored | | | |

---

## ADMIN — SETTINGS

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| T01 | Load settings | Click ↻ Reload (or login) | All SuperAdmin fields populated from Sheet | | | |
| T02 | Save Event | Change event name → Save All | Public page header updates immediately | | | |
| T03 | Save Branding | Change poster URL + colours → Save All | Public page poster and colours update immediately | | | |
| T04 | Save Benefits | Add 2 benefits → Save All → refresh | Benefits persist after reload | | | |
| T05 | Save Schedule | Add 3 schedule items → Save All → refresh | Schedule persists after reload | | | |
| T06 | Save Rules | Toggle System Enabled → Save All → refresh | Toggle state persists | | | |
| T07 | Save Comms | Change WhatsApp link + message → Save All → refresh | Both fields persist | | | |
| T08 | Save PDF | Change PDF title + venue → Save All → refresh | Both fields persist | | | |
| T09 | Rejected keys | Enter invalid key (if possible via saveSettings directly) | Key appears in rejected list, not saved | | | |
| T10 | No BootCamp after save | Check entire public page | Zero BootCamp/BOARDS text after settings load | | | |

---

## PDF

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| F01 | PDF opens | Click Cetak Senarai Fizikal (PDF) | New window opens | | | |
| F02 | PDF title | Check PDF `<title>` and `<h1>` | Shows `PDF_TITLE` or `EVENT_NAME` | | | |
| F03 | PDF venue | Check PDF subtitle | Shows `PDF_VENUE` or `EVENT_VENUE`. Omitted if both empty | | | |
| F04 | PDF date | Check PDF subtitle date | Shows formatted `EVENT_DATE` | | | |
| F05 | PDF time | Check PDF subtitle time | Shows `EVENT_START_TIME` | | | |
| F06 | PDF table | Check participant table | All participants listed with Bil, Nama, Phone, PG Code, Tandatangan column | | | |
| F07 | Print dialog | Check browser behaviour | Print dialog opens automatically | | | |
| F08 | No BootCamp in PDF | Check entire PDF content | Zero "BootCamp BOARDS", "Urus dan Follow Up", "Thinker Table" text | | | |

---

## CONSOLE & NETWORK

| ID | Test | Steps | Expected Result | Actual | P/F | Notes |
|:--:|------|-------|-----------------|--------|:---:|-------|
| C01 | Console errors | Open DevTools → Console → browse all pages | Zero red errors | | | |
| C02 | Failed requests | Open DevTools → Network → browse all pages | Zero failed (red) requests to `app.js` or GAS API | | | |
| C03 | getConfig response | Check Network tab for getConfig | Returns 200 with valid JSON settings | | | |
| C04 | dashboard response | Check Network tab for dashboard | Returns 200 with participant data (after Sheet fix) | | | |

---

## SUMMARY

| Category | Tests | Passed | Failed |
|----------|:-----:|:------:|:------:|
| Public Page | 16 | | |
| Participant Flows | 8 | | |
| Success Page | 4 | | |
| Admin Auth | 5 | | |
| System Validation | 5 | | |
| Dashboard | 5 | | |
| WhatsApp | 9 | | |
| Replacement | 3 | | |
| Settings | 10 | | |
| PDF | 8 | | |
| Console & Network | 4 | | |
| **TOTAL** | **77** | | |

---

**UAT Completed By:** ____________  
**Date:** ____________  
**Signature:** ____________
