# Testing Status

## Legend
- ✅ Passed
- ⏳ Owner verification pending
- ❌ Failed
- 🔲 Not yet tested

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
| C7 | 27 SuperAdmin fields implemented | ✅ |
| C8 | No duplicate functions | ✅ |
| C9 | Secret scan (passwords, Sheet IDs) | ✅ |
| C10 | `.gitignore` excludes backups | ✅ |

---

## Browser-Verified Tests

| # | Test | Status |
|---|------|:------:|
| B1 | Page loads without JS errors | ✅ |
| B2 | No JS rendered as page text | ✅ |
| B3 | `app.js` loads from external file | ✅ |
| B4 | Admin Login opens via button | ✅ |
| B5 | Admin Login opens via Enter key | ✅ |
| B6 | PDF window opens + print dialog | ✅ |

---

## Owner Verification Pending

### Participant Sync
| # | Test | Status |
|---|------|:------:|
| P1 | `validateSetup` passes — all tabs ✅ | ⏳ |
| P2 | Dashboard returns participant totals | ⏳ |
| P3 | Participant list matches Zakat Emas Sheet | ⏳ |
| P4 | Wishlist list matches Sheet | ⏳ |
| P5 | Attendance counts match Kehadiran tab | ⏳ |
| P6 | No undefined values shown | ⏳ |
| P7 | Sheet error visibly reported in Validation panel | ⏳ |

### SuperAdmin Settings
| # | Test | Status |
|---|------|:------:|
| S1 | Existing settings load via Reload button | ⏳ |
| S2 | Event name can be changed and saved | ⏳ |
| S3 | Venue can be changed and saved | ⏳ |
| S4 | Poster URL can be changed | ⏳ |
| S5 | Quota can be changed (number validation) | ⏳ |
| S6 | Benefits: add, remove, persist after reload | ⏳ |
| S7 | Schedule: add, remove, persist after reload | ⏳ |
| S8 | Toggles persist (true/false) | ⏳ |
| S9 | WhatsApp fields persist | ⏳ |
| S10 | PDF fields persist | ⏳ |
| S11 | Logout invalidates token | ⏳ |

### Public Rendering
| # | Test | Status |
|---|------|:------:|
| R1 | No BootCamp content after config loads | ⏳ |
| R2 | Branding colors update correctly | ⏳ |
| R3 | Poster updates correctly | ⏳ |
| R4 | Countdown uses correct date/time | ⏳ |
| R5 | Footer updates correctly | ⏳ |
| R6 | Mobile layout remains usable | ⏳ |

### Regression
| # | Test | Status |
|---|------|:------:|
| G1 | Participant search | ⏳ |
| G2 | Attendance confirmation | ⏳ |
| G3 | Wishlist submission | ⏳ |
| G4 | Public replacement | ⏳ |
| G5 | Admin WA status update | ⏳ |
| G6 | Admin replacement approval | ⏳ |
| G7 | PDF generation | ⏳ |
| G8 | Photo link unchanged | ⏳ |
| G9 | Zero Console errors | ⏳ |

---

## Production Verification (Deferred)

| # | Test | Status |
|---|------|:------:|
| D1 | Production GAS unchanged | 🔲 |
| D2 | Production Sheet unchanged | 🔲 |
| D3 | Cloudflare smoke tests | 🔲 |
| D4 | Cache purge | 🔲 |
| D5 | Rollback plan available | 🔲 |
