# SuperAdmin V1 — Architecture Reference

## Approved Settings Keys (27 canonical + 1 alias)

### Event (Tab A)
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

### Branding (Tab B)
| Key | Type | Description |
|-----|------|-------------|
| `POSTER_URL` | url | Event poster image URL |
| `PRIMARY_COLOR` | color | Primary brand color (#RRGGBB) |
| `SECONDARY_COLOR` | color | Secondary brand color (#RRGGBB) |
| `MARKETING_COPY` | textarea | Marketing/copywriting text |
| `SPEAKER_INFO` | textarea | Speaker/organisation info |
| `REGISTRATION_URL` | url | Google Form registration link |
| `REGISTRATION_CTA_TEXT` | text | Call-to-action button text |

### Benefits (Tab C)
| Key | Type | Description |
|-----|------|-------------|
| `BENEFITS_JSON` | json | Array of `{text, icon, order}` |

### Schedule (Tab D)
| Key | Type | Description |
|-----|------|-------------|
| `SCHEDULE_JSON` | json | Array of `{time, title, description, order}` |

### Attendance Rules (Tab E)
| Key | Type | Description |
|-----|------|-------------|
| `OPEN_BEFORE_HOURS` | number | Hours before event to open attendance |
| `SYSTEM_ENABLED` | boolean | Toggle entire system on/off |
| `WISHLIST_ENABLED` | boolean | Enable wishlist registration |
| `REPLACEMENT_ENABLED` | boolean | Enable public replacement |
| `CLOSED_MESSAGE` | textarea | Message when system is closed |
| `SUCCESS_MESSAGE` | textarea | Message after attendance confirmed |

### Communications (Tab F)
| Key | Type | Description |
|-----|------|-------------|
| `WHATSAPP_GROUP_LINK` | url | WhatsApp group invite link |
| `WHATSAPP_INVITE_MESSAGE` | textarea | Template with `*{nama}*` placeholder |

### PDF & Footer (Tab G)
| Key | Type | Description |
|-----|------|-------------|
| `PDF_TITLE` | text | Title in printed attendance sheet |
| `PDF_VENUE` | text | Venue in printed attendance sheet |
| `FOOTER_TEXT` | text | Organisation name in footer |

### Legacy Alias (NOT editable)
`EVENT_TIME` → mapped to `EVENT_START_TIME` internally. Do not expose as separate field.

## Load Flow

```
Admin Login → receive {token, expiresAt}
  → store token in sessionStorage
  → switch to admin page
  → loadDashboard()
    → GET ?action=dashboard
    → populateAllSettings(data.settings)
      → fills all s-* fields
      → parses BENEFITS_JSON → benefitsData[]
      → parses SCHEDULE_JSON → scheduleData[]
      → renders Benefits + Schedule lists
      → calls applyPublicSettings() for branding
  → validateSetupSilent()
    → POST {action:"validateSetup", token}
    → updates System Validation panel DOM
```

## Save Flow

```
Save All button → collectAllSettings()
  → gathers all s-* field values
  → serializes benefitsData → BENEFITS_JSON
  → serializes scheduleData → SCHEDULE_JSON
  → POST {action:"saveSettings", token, settings:{...}}
  → GAS validates: whitelist, type, length
  → Response: {success, message, (rejected:[])}
  → AUTH_REQUIRED → logout
```

## Token Handling

- Token returned by `adminLogin` with 6-hour TTL
- Stored in `sessionStorage("admin_token")`
- Sent with every admin write action
- Validated server-side via `CacheService`
- Invalidated on `adminLogout` or expiry
- `AUTH_REQUIRED` response triggers automatic logout

## Dynamic Public Rendering

`applyPublicSettings()` updates:
- Branding gradient CSS (PRIMARY_COLOR, SECONDARY_COLOR)
- Poster image src and alt text
- Footer organisation name
- Stores runtime values in `window.dynamic*` for search/PDF/WA rendering

## Current Limitations

- Header `<h1>` title not fully dynamic (position-based selector)
- Schedule in success page requires manual refresh
- Countdown label text not dynamic
- Registration URL display on public page not implemented
- Full BootCamp hard-coded text removal pending after dynamic rendering proven
