# PG Hadir — Event Attendance System

Attendance and photo management system for PG Bangi events.

## Project URLs

| Environment | URL |
|-------------|-----|
| Production Attendance | `https://ai4i.my/hadir/` |
| Production Photo Gallery | `https://ai4i.my/hadir/photo.html` |
| GitHub Repository | `https://github.com/zahidihalim/pg-hadir` |

## Architecture

```
Frontend (Static HTML/CSS/JS)
├── index.html    — Attendance application
├── app.js        — All JavaScript (extracted from index.html)
└── photo.html    — Photo gallery (deferred, unchanged)

Backend (Google Apps Script)
├── code.gs       — Production GAS (BootCamp event, 349 lines)
└── code.test.gs  — TEST GAS V1 (SuperAdmin-enabled, 977 lines)

Data
├── Google Sheets — Participant data, settings, wishlist
└── Google Drive  — Photos, music files
```

## Current Branch

```
event-update/new-event  (Active development — NOT merged to main)
```

## Status

| Component | Status |
|-----------|:------:|
| Production Attendance | ✅ Live (BootCamp event) |
| Production Photo | ✅ Live |
| TEST GAS V1 | 🟡 Deployed, pending Owner validation |
| SuperAdmin UI | ✅ Implemented in TEST branch |
| Participant sync | ⏳ Requires Sheet validation |
| Production deployment | ❌ Not yet |
| Cloudflare deployment | ❌ Not yet |

## SuperAdmin V1 Scope

- 27 configurable event settings (7 tabbed sections)
- Token-based admin authentication (CacheService, 6hr TTL)
- Header-based participant column mapping
- Sheet validation panel
- Benefits and Schedule JSON editors
- Dynamic public page rendering (branding, poster, footer)

## Deferred

- Photo gallery integration
- Multi-event platform
- Role-based access control
- Framework migration
- Rate limiting

## Manual Cloudflare Deployment

Static site — no build step. Upload `index.html`, `app.js`, `photo.html`, and poster images to Cloudflare. Purge cache after deployment.
