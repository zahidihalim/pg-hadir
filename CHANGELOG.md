# CHANGELOG

## [Unreleased] — TEST Branch (`event-update/new-event`)

### Added
- `app.js` — All JavaScript extracted from `index.html` to external file
- `gas/code.test.gs` — TEST GAS backend V1 with SuperAdmin support (977→1085 lines)
- Token-based admin authentication (CacheService, 6-hour TTL)
- Header-based participant column mapping with Malay/English aliases (6 logical fields)
- Sheet validation action (`validateSetup`) with structured JSON response
- Header analysis (`analyzeHeaders`) with per-field found/missing/duplicate reporting
- Dynamic `getSettings()` reading all key-value rows from Settings tab
- Dynamic `saveSettings()` with whitelist, type validation (JSON/URL/color/number/boolean), and length checks
- `adminLogout` action for token invalidation
- SuperAdmin Event Settings UI — 7 tabbed sections, 29 canonical configurable fields
- Benefits editor (add/remove, icon support, JSON persistence)
- Schedule editor (add/remove, time/title/description, JSON persistence)
- System Validation panel on Admin page (tab status, header findings, errors/warnings)
- Complete dynamic public page rendering for all 17 element groups
- Dynamic PDF title and venue in `generatePhysicalPDF()`
- Dynamic WhatsApp group link and invite message with `{nama}`, `{event}`, `{link}` placeholders
- `AUTH_REQUIRED` consistent error response format
- Backward compatibility alias: `EVENT_TIME` ↔ `EVENT_START_TIME`
- 29 canonical settings keys (Event: 9, Branding: 8, Attendance: 6, Comms: 2, PDF: 3, +Benefits_JSON +Schedule_JSON)

### Changed
- `index.html` — Inline JavaScript moved to `app.js`; admin login wrapped in `<form>`
- All admin write actions now require token from `adminLogin` response
- `saveSettings` uses V1 `{settings: {...}}` format instead of flat fields
- `generatePhysicalPDF()` — dynamic title/venue from SuperAdmin settings, HTML-escaped
- `sendBulkWA()` — dynamic group link and invite message, empty-link guard
- Public search WA button — uses dynamic link, hidden when link empty
- Wishlist WA invite — uses `buildWhatsAppMessage()` with template placeholders
- `applyPublicSettings()` — complete rewrite with stable DOM IDs, handles all 17 element groups
- `initPublicPage()` — loads settings, applies public rendering, starts countdown
- `loadAllSettings()` — applies settings to both SuperAdmin form and public page
- `saveAllSettings()` — immediately applies settings to public page, then confirms persistence
- `startCountdown()` — uses `EVENT_START_TIME || EVENT_TIME` instead of hard-coded time
- All positional/attribute-based selectors replaced with stable element IDs
- Removed duplicate `id="search-tab"` on photo section
- Footer, meta tags, countdown label, wishlist quota, success page schedule — all dynamic
- `window.currentSettings` canonical state object for runtime access

### Fixed
- Browser rendering JS as text (removed inline `<script>` block)
- Dashboard displaying `undefined` totals (added `?? 0` fallbacks)
- Production spreadsheet ID sanitized from `gas/code.gs`
- `SCHEDULE_JSON` missing from `APPROVED_SETTINGS_KEYS` whitelist (schedule save was rejected)
- `EVENT_TIME` hard-coded in countdown — now uses `EVENT_START_TIME || EVENT_TIME`
- Photo section duplicate `id="search-tab"` — now unique `id="publicPhotoSection"`

### Removed
- All hard-coded `BootCamp`, `BOARDS`, `Thinker Table`, `Bangi Gateway`, `13 Jun 2026` text
- Hard-coded `boards.jpeg` poster source
- Hard-coded `chat.whatsapp.com/IDHqogXTdvkCdd3XvTOg5e` WhatsApp link
- Hard-coded `group rasmi BootCamp BOARDS` invite message
- Hard-coded `BootCamp BOARDS: Urus dan Follow Up Pelanggan Sistematik` PDF title
- Hard-coded `Thinker Table, Bangi Gateway` PDF venue
- Hard-coded `Kuota Penuh 70/70` wishlist quota
- Hard-coded aturcara/schedule rows in success page
- Hard-coded `PHOTO ALBUM BootCamp` button text
- Hard-coded `PG Bangi Branch Committee` footer

### Security
- Production Sheet ID replaced with placeholder in committed source
- Admin credentials stored in Script Properties (not in code)
- All admin write actions validated server-side via token
- Dynamic HTML text escaped before injection via `escHtml()`
- `validateSetup` token-protected (all admin endpoints)

### Status
- **Owner UAT phase** — full testing checklist prepared
- Production deployment: not yet
- Cloudflare deployment: not yet
- `main` branch: unchanged
- `photo.html`: unchanged

## [1.0.0] — 2026-06-13 — Production (BootCamp BOARDS)
- Initial working version deployed at `ai4i.my/hadir/`
