# TEST GAS Setup Guide

## Purpose

The TEST GAS deployment (separate from production) connects the SuperAdmin-enabled frontend to the event Google Sheet for testing without risking the live production event.

**Production GAS (`code.gs`) remains UNCHANGED.** Only `code.test.gs` is the TEST backend.

## Required Script Properties

Set in: Apps Script Editor → Project Settings → Script Properties

| Property | Description |
|----------|-------------|
| `ACTIVE_SPREADSHEET_ID` | Google Sheet ID for event data (must have 4 tabs) |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |

## Deployment Settings

- **Deploy** → New deployment → Web app
- **Execute as:** Me
- **Who has access:** Anyone
- **URL suffix:** `/exec` (NOT `/dev` or editor URL)

## Endpoints

### Public (no auth)

| Action | Method | Description |
|--------|:------:|-------------|
| `getConfig` | GET | Returns all settings as key-value object |
| `search` | GET | Search participant by keyword (name/phone/pgcode) |
| `dashboard` | GET | Returns totals, participant list, wishlist, settings |
| `attendance` | POST | Submit attendance confirmation |
| `submitWishlist` | POST | Add to waitlist |
| `submitReplacementPublic` | POST | Submit public replacement request |

### Auth (login/logout)

| Action | Method | Description |
|--------|:------:|-------------|
| `adminLogin` | POST | Returns `{success, token, expiresAt}` |
| `adminLogout` | POST | Invalidates token server-side |

### Protected (requires token)

| Action | Method | Description |
|--------|:------:|-------------|
| `saveSettings` | POST | Save settings (whitelist + type validation) |
| `updateWAStatus` | POST | Update single or bulk WA status |
| `replaceParticipant` | POST | Admin replacement approval |
| `handleApproval` | POST | Approve/reject replacement request |
| `validateSetup` | POST | Validate Sheet tabs and header mapping |

## Quick Tests

### 1. getConfig
```
GET [TEST_URL]?action=getConfig
Expected: {"success":true,"settings":{"EVENT_NAME":"...","EVENT_DATE":"...", ...}}
```

### 2. adminLogin
```
POST [TEST_URL]
Body: {"action":"adminLogin","username":"...","password":"..."}
Expected: {"success":true,"token":"<uuid>","expiresAt":<timestamp>}
```

### 3. validateSetup
```
POST [TEST_URL]
Body: {"action":"validateSetup","token":"<token>"}
Expected: {"success":true|false,"sheets":{...},"headerFindings":{...},"errors":[...]}
```

### 4. saveSettings
```
POST [TEST_URL]
Body: {"action":"saveSettings","token":"<token>","settings":{"EVENT_NAME":"Test"}}
Expected: {"success":true,"message":"1 setting(s) updated, 0 setting(s) added."}
```

### 5. dashboard
```
GET [TEST_URL]?action=dashboard
Expected: {"success":true,"total":N,"hadir":N,"tidakHadir":N,"list":[...],"wishlist":[...],"settings":{...}}
```

### 6. adminLogout
```
POST [TEST_URL]
Body: {"action":"adminLogout","token":"<token>"}
Expected: {"success":true}
```

## Protected Routes

All admin write actions require a valid token:

- `saveSettings`
- `updateWAStatus`
- `replaceParticipant`
- `handleApproval`
- `validateSetup`

Token is validated via `CacheService.get(TOKEN_PREFIX + token)`. Invalid/expired token returns:
```json
{"success":false,"code":"AUTH_REQUIRED","message":"Admin session expired or invalid."}
```

Frontend automatically calls `logoutAdmin()` on `AUTH_REQUIRED` response.

## Public Routes

No authentication required:

- `search`, `dashboard`, `getConfig` (GET)
- `attendance`, `submitWishlist`, `submitReplacementPublic` (POST)

Rate-limiting recommended in future phase.

## Redeployment Steps

1. Copy ALL content from `gas/code.test.gs` into TEST Apps Script editor
2. Verify Script Properties are set (spreadsheet ID, admin credentials)
3. Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy
4. Copy the new `/exec` URL if it changed
5. Update `API_URL` in `app.js` line 2 if the URL changed
6. Test via browser: open `index.html`, login, check System Validation panel

## Rollback Notes

- Previous GAS versions are accessible via Deploy → Manage deployments
- To rollback: select previous version → Deploy
- Frontend: revert to previous commit in `event-update/new-event` branch
- Production GAS (`code.gs`) is NEVER modified during TEST phase

## Security Notes

- Never commit Admin credentials to Git
- Script Properties are server-side only (not visible in frontend code)
- Token uses CacheService with 6-hour TTL
- All admin writes validated server-side (whitelist, type, length checks)
- Settings whitelist: 29 approved keys, unknown keys rejected
- Spreadsheet ID stored in Script Properties, not in frontend code
- `validateSetup` response never exposes Sheet ID, admin details, or internal state
