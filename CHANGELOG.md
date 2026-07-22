# CHANGELOG

## [Unreleased] — TEST Branch (`event-update/new-event`)

### Added
- `app.js` — All JavaScript extracted from `index.html` to external file
- `gas/code.test.gs` — TEST GAS backend V1 with SuperAdmin support
- Token-based admin authentication (CacheService, 6-hour TTL)
- Header-based participant column mapping with Malay/English aliases
- Sheet validation action (`validateSetup`) with structured JSON response
- Dynamic `getSettings()` reading all key-value rows
- Dynamic `saveSettings()` with whitelist, type validation, JSON/URL/color/number checks
- `adminLogout` action for token invalidation
- SuperAdmin Event Settings UI — 7 tabbed sections, 27 configurable fields
- Benefits editor (add/remove, icon support)
- Schedule editor (add/remove, time/title/description)
- System Validation panel on Admin page
- Dynamic public rendering (branding colors, poster, footer)
- `AUTH_REQUIRED` consistent error response format
- Backward compatibility alias: `EVENT_TIME` ↔ `EVENT_START_TIME`

### Changed
- `index.html` — Inline JavaScript moved to `app.js`; admin login wrapped in `<form>`
- All admin write actions now require token from `adminLogin` response
- `saveSettings` uses V1 `{settings: {...}}` format instead of flat fields
- `generatePhysicalPDF()` — embedded `<script>` removed; print triggered via `printWindow.print()`
- `logoutAdmin()` calls `adminLogout` API before clearing session

### Fixed
- Browser rendering JS as text (removed inline `<script>` block)
- Dashboard displaying `undefined` totals (added `?? 0` fallbacks)
- Production spreadsheet ID sanitized from `gas/code.gs`

### Security
- Production Sheet ID replaced with placeholder in committed source
- Admin credentials stored in Script Properties (not in code)
- All admin write actions validated server-side via token

### Pending
- Owner validation of Google Sheet connection
- Participant synchronisation verification
- Full regression testing
- Production deployment
- Cloudflare deployment

## [1.0.0] — 2026-06-13 — Production (BootCamp BOARDS)
- Initial working version deployed at `ai4i.my/hadir/`
