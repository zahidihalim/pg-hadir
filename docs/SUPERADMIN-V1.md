# SuperAdmin V1 — Architecture Reference

## Approved Settings Keys (29 canonical + 1 legacy alias)

### Event (Tab A) — 9 keys
| Key | Type | Description |
|-----|------|-------------|
| `EVENT_NAME` | text | Full event name |
| `EVENT_SHORT_NAME` | text | Short display name |
| `EVENT_DESCRIPTION` | textarea | Event description |
| `EVENT_DATE` | date | Event date (YYYY-MM-DD) |
| `EVENT_START_TIME` | time | Start time (HH:MM) |
| `EVENT_END_TIME` | time | End time (HH:MM) |
| `EVENT_VENUE` | text | Venue name |
| `ORGANISER_NAME` | text | Organising branch/entity |
| `PARTICIPANT_QUOTA` | number | Max participants |

### Branding (Tab B) — 8 keys
| Key | Type | Description |
|-----|------|-------------|
| `POSTER_URL` | url | Event poster image URL |
| `PRIMARY_COLOR` | color | Primary brand color (#RRGGBB) |
| `SECONDARY_COLOR` | color | Secondary brand color (#RRGGBB) |
| `MARKETING_COPY` | textarea | Marketing/copywriting text |
| `BENEFITS_JSON` | json | Array of `{text, icon, order}` |
| `SCHEDULE_JSON` | json | Array of `{time, title, description, order}` |
| `SPEAKER_INFO` | textarea | Speaker/organisation info |
| `REGISTRATION_URL` | url | Google Form registration link |
| `REGISTRATION_CTA_TEXT` | text | Call-to-action button text |

### Attendance Rules (Tab E) — 6 keys
| Key | Type | Description |
|-----|------|-------------|
| `OPEN_BEFORE_HOURS` | number | Hours before event to open attendance |
| `SYSTEM_ENABLED` | boolean | Toggle entire system on/off |
| `WISHLIST_ENABLED` | boolean | Enable wishlist registration |
| `REPLACEMENT_ENABLED` | boolean | Enable public replacement |
| `CLOSED_MESSAGE` | textarea | Message when system is closed |
| `SUCCESS_MESSAGE` | textarea | Message after attendance confirmed |

### Communications (Tab F) — 2 keys
| Key | Type | Description |
|-----|------|-------------|
| `WHATSAPP_GROUP_LINK` | url | WhatsApp group invite link |
| `WHATSAPP_INVITE_MESSAGE` | textarea | Template with `{nama}`, `{event}`, `{link}` placeholders |

### PDF & Footer (Tab G) — 3 keys
| Key | Type | Description |
|-----|------|-------------|
| `PDF_TITLE` | text | Title in printed attendance sheet |
| `PDF_VENUE` | text | Venue in printed attendance sheet |
| `FOOTER_TEXT` | text | Organisation name in footer |

**Total: 29 canonical keys** (plus 1 legacy alias `EVENT_TIME` → maps to `EVENT_START_TIME`)

## Admin Tabs

| Tab | ID | Settings Panel |
|:---|:---|:---|
| A — Event | `tab-event` | Event name, date, time, venue, organiser, quota |
| B — Branding | `tab-branding` | Poster URL, colours, marketing copy, speaker, registration CTA |
| C — Benefits | `tab-benefits` | Add/remove benefit items (icon + text), persisted as `BENEFITS_JSON` |
| D — Schedule | `tab-schedule` | Add/remove schedule items (time + title + description), persisted as `SCHEDULE_JSON` |
| E — Rules | `tab-rules` | Attendance window, system/wishlist/replacement toggles, closed/success messages |
| F — Comms | `tab-comms` | WhatsApp group link, invite message template |
| G — PDF | `tab-pdf` | PDF title, PDF venue, footer text |

## Load Flow

```
Admin Login → receive {token, expiresAt}
  → store token in sessionStorage("admin_token")
  → switch to admin page
  → loadDashboard()
    → GET ?action=dashboard
    → window.lastFetchedSettings = data.settings
    → window.lastFetchedList = data.list
    → populateAllSettings(data.settings)
      → fills all s-* form fields
      → parses BENEFITS_JSON → benefitsData[]
      → parses SCHEDULE_JSON → scheduleData[]
      → renders Benefits + Schedule lists
      → calls applyPublicSettings(data.settings)
    → validateSetupSilent()
      → POST {action:"validateSetup", token}
      → renders header findings (found/missing/duplicate)
```

```
Public Page Load → initPublicPage()
  → GET ?action=getConfig
  → window.currentSettings = data.settings
  → applyPublicSettings(data.settings)
    → renders all 17 public element groups
  → startCountdown(EVENT_DATE, EVENT_START_TIME || EVENT_TIME)
```

## Save Flow

```
Save All → collectAllSettings()
  → gathers all s-* field values
  → serializes benefitsData → BENEFITS_JSON
  → serializes scheduleData → SCHEDULE_JSON
  → POST {action:"saveSettings", token, settings:{...}}
  → GAS validates: whitelist, type, length
  → Response: {success, message, (rejected:[])}
  → On success:
    → window.currentSettings = settings
    → applyPublicSettings(settings)  // immediate apply
    → loadAllSettings()              // confirm persistence
  → AUTH_REQUIRED → logout
```

## Runtime State Handling

```javascript
window.currentSettings       // Canonical settings (set on every load/save)
window.lastFetchedSettings   // Settings from last dashboard load
window.lastFetchedList       // Participant list from last dashboard load
window.dynamicPdfTitle       // PDF_TITLE || '' 
window.dynamicPdfVenue       // PDF_VENUE || ''
window.dynamicEventName      // EVENT_NAME || ''
window.dynamicEventShort     // EVENT_SHORT_NAME || ''
window.dynamicWhatsAppLink   // WHATSAPP_GROUP_LINK || ''
window.dynamicWhatsAppMsg    // WHATSAPP_INVITE_MESSAGE || ''
window.dynamicQuota          // PARTICIPANT_QUOTA || ''
window.dynamicVenue          // EVENT_VENUE || ''
window.dynamicSchedule       // Parsed SCHEDULE_JSON || null
window.dynamicClosedMsg      // CLOSED_MESSAGE || ''
window.dynamicSuccessMsg     // SUCCESS_MESSAGE || ''
```

## Dynamic Public Rendering

`applyPublicSettings(s)` updates all 17 public element groups:

| # | Element | Setting Used | Fallback |
|:--:|:---|:---|:---|
| 1 | Header title | `EVENT_NAME` or `EVENT_SHORT_NAME` | Generic "Seminar Attendance" |
| 2 | Header subtitle | `EVENT_DESCRIPTION` | "Aplikasi Pengurusan Kehadiran" |
| 3 | Countdown label | `EVENT_SHORT_NAME` | "Acara Bermula Dalam:" |
| 4 | Poster | `POSTER_URL` | None (hidden if empty) |
| 5 | Meta tags | `EVENT_NAME`, `EVENT_DESCRIPTION`, `POSTER_URL` | Generic placeholders |
| 6 | Description section | `EVENT_DESCRIPTION` | Hidden if empty |
| 7 | Marketing copy | `MARKETING_COPY` | Hidden if empty |
| 8 | Benefits | `BENEFITS_JSON` | Hidden if empty |
| 9 | Speaker info | `SPEAKER_INFO` | Hidden if empty |
| 10 | Registration CTA | `REGISTRATION_URL` + `REGISTRATION_CTA_TEXT` | Hidden if either empty |
| 11 | Quota label | `PARTICIPANT_QUOTA` | "Kuota Penuh" |
| 12 | Schedule | `SCHEDULE_JSON` | Hidden if empty |
| 13 | Branding colours | `PRIMARY_COLOR`, `SECONDARY_COLOR` | Default gold gradient |
| 14 | Footer | `FOOTER_TEXT` or `ORGANISER_NAME` | "Organiser" |
| 15 | Success message | `SUCCESS_MESSAGE` | Default message |
| 16 | Closed message | `CLOSED_MESSAGE` | Default message |
| 17 | Photo section | `EVENT_NAME`, `EVENT_DATE`, `EVENT_VENUE` | Generic text |

All selectors use stable element IDs (e.g., `publicEventTitle`, `publicPoster`). No positional, attribute-based, or text-matching selectors.

## WhatsApp Placeholders

Template stored in `WHATSAPP_INVITE_MESSAGE` supports three placeholders:

| Placeholder | Replaced With |
|:---|:---|
| `{nama}` | Participant name |
| `{event}` | `EVENT_NAME` from settings |
| `{link}` | `WHATSAPP_GROUP_LINK` from settings |

**Fallback message** (when template is empty):
```
Salam Tuan/Puan *{nama}*.

Terima kasih kerana mendaftar.
Anda dijemput menyertai group {event} melalui pautan di bawah:

👉 {link}

Jumpa di sana!
```

**Empty link guard:** Shows admin error, does not open WhatsApp.

## PDF Fallback Logic

```
pdfTitle  → PDF_TITLE → EVENT_NAME → "Senarai Kehadiran Fizikal"
pdfVenue  → PDF_VENUE → EVENT_VENUE → "" (omitted from subtitle)
eventTime → EVENT_START_TIME → EVENT_TIME → "-"
```

All dynamic text is HTML-escaped before injection into the print window.

## Schedule JSON

```json
[
  { "time": "10:00", "title": "Pendaftaran", "description": "Optional description", "order": 1 },
  { "time": "10:30", "title": "BootCamp Bermula", "order": 2 }
]
```

Rendered in success page after attendance confirmation. Also available as `window.dynamicSchedule` for runtime access.

## Benefits JSON

```json
[
  { "text": "Panduan lengkap pengurusan pelanggan", "icon": "✅", "order": 1 },
  { "text": "Template percuma", "icon": "📋", "order": 2 }
]
```

Rendered in public page benefits section. Hidden when empty.

## Token Expiry Handling

- Token TTL: 6 hours (stored in `CacheService`)
- `AUTH_REQUIRED` response triggers automatic logout (`logoutAdmin()`)
- `sessionStorage("admin_token_expires")` checked on page reload
- Expired token: cleared from sessionStorage, user redirected to public page
- `adminLogout` API call invalidates token server-side before clearing local state

## System Validation Panel

`validateSetup` returns:

```json
{
  "success": false,
  "sheets": { "Form_Responses": true, "Kehadiran": true, ... },
  "headerFindings": {
    "found": [{ "logical": "NAME", "source": "NAMA", "column": 2 }],
    "missing": ["EMAIL", "WA_STATUS"],
    "duplicates": []
  },
  "errors": ["Missing header: EMAIL", "Missing header: WA_STATUS"],
  "warnings": []
}
```

Frontend renders:
- **Green rows**: `✓ [NAME] ← "NAMA" col 2` — each recognised source header
- **Red rows**: `✗ [EMAIL] missing` — each missing field individually
- **Tab icons**: ✅/❌ for each of the 4 required tabs

## Current Limitations

- Photo gallery integration deferred (photo.html unchanged)
- Countdown label uses `EVENT_SHORT_NAME` with "Bermula Dalam:" suffix (not fully configurable)
- `SCHEDULE_JSON` requires `time` field in HH:MM format (no AM/PM conversion)
- Registration URL displayed as button only (not as a separate text URL)
- No dark mode support
- No offline caching (Service Worker)
- No automated tests
