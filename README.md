# PG Hadir — Event Attendance System

Attendance and participant management system for PG Bangi events. Google Sheets-backed with Google Apps Script backend.

## Project URLs

| Environment | URL |
|-------------|-----|
| Production Attendance | `https://ai4i.my/hadir/` |
| Production Photo Gallery | `https://ai4i.my/hadir/photo.html` |
| GitHub Repository | `https://github.com/zahidihalim/pg-hadir` |

## Architecture

```
Frontend (Static HTML/CSS/JS)
├── index.html    — Attendance application (SuperAdmin V1)
├── app.js        — All JavaScript logic (extracted from index.html)
└── photo.html    — Photo gallery (deferred, unchanged from production)

Backend (Google Apps Script)
├── code.gs       — Production GAS (BootCamp event, 349 lines, UNCHANGED)
└── code.test.gs  — TEST GAS V1 (SuperAdmin-enabled, dynamic settings)

Data
├── Google Sheets — Participant data, attendance, settings, wishlist
│   ├── Form_Responses  — Participant registration (Google Form auto-created)
│   ├── Kehadiran       — Attendance check-in log (GAS auto-appends)
│   ├── Settings        — Key-value event configuration (SuperAdmin)
│   └── Wishlist        — Waitlist registrations (GAS auto-appends)
└── Google Drive  — Photos, music files (photo.html scope)
```

## Current Branch

```
event-update/new-event  (Active TEST development — NOT merged to main)
```

## SuperAdmin V1 Capability

- **29 canonical** event settings across 7 Admin tabs (Event, Branding, Benefits, Schedule, Rules, Comms, PDF)
- Token-based admin authentication (CacheService, 6-hour TTL)
- Header-based participant column mapping (Malay/English alias matching)
- System Validation panel (tab presence, header discovery, missing/duplicate detection)
- Dynamic public page rendering: title, poster, description, marketing copy, benefits, speaker, registration CTA, schedule, branding colours, footer, countdown, meta tags, photo section
- Dynamic PDF title, venue, and event date/time in printed attendance sheet
- Dynamic WhatsApp group link and invite message with `{nama}`, `{event}`, `{link}` placeholders
- Participant dashboard with total/hadir/tidakHadir counts, WA status, replacement management
- Settings persistence: Save All immediately applies to public page, confirmed by reload

## Status

| Component | Status |
|-----------|:------:|
| Production Attendance | ✅ Live (BootCamp event, unchanged) |
| Production Photo | ✅ Live (unchanged) |
| Production GAS (`code.gs`) | ✅ Unchanged |
| Production Sheet | ✅ Unchanged |
| TEST GAS V1 (`code.test.gs`) | ✅ Deployed, pending Owner UAT |
| SuperAdmin V1 UI | ✅ Complete (TEST branch) |
| Dynamic public rendering | ✅ Complete |
| Dynamic PDF | ✅ Complete |
| Dynamic WhatsApp | ✅ Complete |
| Participant sync | ✅ Confirmed (pending Owner UAT verification) |
| System Validation | ✅ Passes |
| Owner UAT | 🔲 Starting now |
| Production deployment | ❌ Not yet |
| Cloudflare | ❌ Not yet |
| `photo.html` | 🔲 Deferred, unchanged |

## Cloudflare Deployment Model

Static site deployment — no build step. Files to upload:
- `index.html`
- `app.js`
- `photo.html`
- Poster images

**Current Cloudflare Pages production branch** should be set to `main`. The `event-update/new-event` branch is for TEST only.

Purge Cloudflare cache after production deployment.

## Deferred

- Photo gallery integration (photo.html remains unchanged)
- Multi-event platform
- Role-based access control
- Audit logging
- Rate limiting
- Automated testing framework
