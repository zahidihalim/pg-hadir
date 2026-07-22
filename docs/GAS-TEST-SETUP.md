# TEST GAS Setup Guide

## Purpose

The TEST GAS deployment (separate from production) connects the SuperAdmin-enabled frontend to the Zakat Emas Google Sheet for testing without risking the live BootCamp event.

## Deployment

1. Create new Google Apps Script project
2. Copy ALL content from `gas/code.test.gs` into the editor
3. Run any function (e.g., `getPublicConfig`) to trigger OAuth
4. Grant all requested permissions

## Script Properties Required

Set in: File → Project Properties → Script Properties

| Property | Description |
|----------|-------------|
| `ACTIVE_SPREADSHEET_ID` | Google Sheet ID for Zakat Emas event data |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |

## Deployment Settings

- Deploy → New deployment → Web app
- Execute as: **Me**
- Who has access: **Anyone**
- URL format: `/exec` (NOT `/dev` or editor URL)

## Quick Tests

### 1. getConfig
```
GET [TEST_URL]?action=getConfig
Expected: {"success":true,"settings":{...}}
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
Expected: {"success":true,"sheets":{...},"columns":{...}}
```

### 4. saveSettings
```
POST [TEST_URL]
Body: {"action":"saveSettings","token":"<token>","settings":{"EVENT_NAME":"Test"}}
Expected: {"success":true,"message":"1 setting(s) updated, 0 setting(s) added."}
```

### 5. adminLogout
```
POST [TEST_URL]
Body: {"action":"adminLogout","token":"<token>"}
Expected: {"success":true}
```

## Security Notes

- Never commit Admin credentials to Git
- Script Properties are server-side only (not visible in frontend)
- Token uses CacheService with 6-hour TTL
- All admin writes validated server-side
- Spreadsheet ID stored in Script Properties, not in frontend code
