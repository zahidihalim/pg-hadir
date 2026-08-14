//////////////////////////////////////////////////////////////////////////////
// PG HADIR — TEST GAS BACKEND V1 (HARDENED)
// ===========================================================================
// Based on production code.gs (BootCamp BOARDS, 349 lines)
// All V1 extensions + CTO hardening applied (22 July 2026)
//
// STATUS: Local implementation completed. Production unchanged.
//
// CHANGES FROM PRODUCTION:
//   1. SHEET_ID → ScriptProperties (key: ACTIVE_SPREADSHEET_ID)
//   2. Header-based column mapping with normalisation
//   3. Sheet validation (token-protected)
//   4. Dynamic getSettings (all rows, not A1:B3)
//   5. Dynamic saveSettings — token auth + key whitelist + strict type validation
//   6. Token-based admin auth (CacheService, 6hr TTL)
//   7. Protected write actions with consistent AUTH_REQUIRED response
//   8. adminLogout action
//   9. EVENT_TIME ↔ EVENT_START_TIME compatibility alias
//  10. 29 approved V1 settings keys (EVENT_TIME is alias only, not separate key)
//
// PUBLIC ACTION ABUSE RISKS (documented, not mitigated in V1):
//   - search:       participant enumeration via brute-force keyword search
//   - attendance:   repeated submission via direct API call
//   - submitWishlist: spam entries via automated POST
//   - submitReplacementPublic: unauthorized replacement requests
//   - getConfig:    configuration enumeration (non-sensitive in V1)
//   Rate-limiting recommended in future phase.
//////////////////////////////////////////////////////////////////////////////

// ===========================================================================
// CONSTANTS — Sheet Tab Names
// ===========================================================================
const PARTICIPANT_SHEET = "Form_Responses";
const ATTENDANCE_SHEET = "Kehadiran";
const SETTINGS_SHEET = "Settings";
const WISHLIST_SHEET = "Wishlist";

// ===========================================================================
// CONSTANTS — Approved V1 Settings Keys (29 canonical + 1 legacy alias)
// ===========================================================================
const APPROVED_SETTINGS_KEYS = [
  // Event
  "EVENT_ID", "EVENT_NAME", "EVENT_SHORT_NAME", "EVENT_DESCRIPTION",
  "EVENT_DATE", "EVENT_START_TIME", "EVENT_END_TIME",
  "EVENT_VENUE", "ORGANISER_NAME", "PARTICIPANT_QUOTA",
  // Branding
  "POSTER_URL", "PRIMARY_COLOR", "SECONDARY_COLOR",
  "MARKETING_COPY", "BENEFITS_JSON", "SCHEDULE_JSON", "SPEAKER_INFO",
  "REGISTRATION_URL", "REGISTRATION_CTA_TEXT",
  // Attendance
  "OPEN_BEFORE_HOURS", "SYSTEM_ENABLED", "WISHLIST_ENABLED",
  "REPLACEMENT_ENABLED", "CLOSED_MESSAGE", "SUCCESS_MESSAGE",
  // Communications & Output
  "WHATSAPP_GROUP_LINK", "WHATSAPP_INVITE_MESSAGE",
  "PDF_TITLE", "PDF_VENUE", "FOOTER_TEXT"
];
// Note: "EVENT_TIME" is a legacy compatibility alias for EVENT_START_TIME.
// It is NOT a separate editable setting. The alias is handled in getSettings()
// and saveSettings() internally. It must NOT appear as its own SuperAdmin field.

const SETTINGS_KEYS_SET = new Set(APPROVED_SETTINGS_KEYS);

const PROJECT_TIMEZONE = "Asia/Kuala_Lumpur";

const PUBLIC_SETTINGS_KEYS = [
  "EVENT_ID", "EVENT_NAME", "EVENT_SHORT_NAME", "EVENT_DESCRIPTION",
  "EVENT_DATE", "EVENT_START_TIME", "EVENT_END_TIME",
  "EVENT_VENUE", "ORGANISER_NAME", "PARTICIPANT_QUOTA",
  "POSTER_URL", "PRIMARY_COLOR", "SECONDARY_COLOR",
  "MARKETING_COPY", "BENEFITS_JSON", "SCHEDULE_JSON", "SPEAKER_INFO",
  "REGISTRATION_URL", "REGISTRATION_CTA_TEXT",
  "OPEN_BEFORE_HOURS", "SYSTEM_ENABLED", "WISHLIST_ENABLED",
  "REPLACEMENT_ENABLED", "CLOSED_MESSAGE", "SUCCESS_MESSAGE",
  "WHATSAPP_GROUP_LINK", "WHATSAPP_INVITE_MESSAGE",
  "PDF_TITLE", "PDF_VENUE", "FOOTER_TEXT", "EVENT_TIME"
];
const PUBLIC_SETTINGS_SET = new Set(PUBLIC_SETTINGS_KEYS);

const ATTENDANCE_HEADERS = ["Timestamp", "Nama", "Phone", "Email", "PG Code", "Status", "Event ID"];
const WISHLIST_HEADERS = ["Timestamp", "Nama", "Phone", "Email", "PG Code", "Event ID"];
const PARTICIPANT_MANAGED_HEADERS = ["WA STATUS", "REPLACEMENT"];
const SEARCH_RATE_LIMIT_PREFIX = "search_rl_";
const LOGIN_RATE_LIMIT_PREFIX = "login_rl_";
const PUBLIC_WRITE_RATE_LIMIT_PREFIX = "public_write_rl_";
const SEARCH_LIMIT = 5;
const LOCK_TIMEOUT_MS = 10000;

// Settings keys that require structured validation
const JSON_SETTINGS = ["BENEFITS_JSON", "SCHEDULE_JSON"];
const URL_SETTINGS = ["POSTER_URL", "REGISTRATION_URL", "WHATSAPP_GROUP_LINK"];
const COLOR_SETTINGS = ["PRIMARY_COLOR", "SECONDARY_COLOR"];
const NUMBER_SETTINGS = ["PARTICIPANT_QUOTA", "OPEN_BEFORE_HOURS"];
const BOOLEAN_SETTINGS = ["SYSTEM_ENABLED", "WISHLIST_ENABLED", "REPLACEMENT_ENABLED"];

const MAX_TEXT_LENGTH = 5000;
const MAX_QUOTA = 10000;
const MAX_OPEN_HOURS = 168; // 1 week

// ===========================================================================
// AUTH — Consistent error response (CTO Requirement #7)
// ===========================================================================
function authRequiredResponse() {
  return jsonResponse({
    success: false,
    code: "AUTH_REQUIRED",
    message: "Admin session expired or invalid. Please log in again."
  });
}

// ===========================================================================
// HELPER — Get active spreadsheet from ScriptProperties
// ===========================================================================
function getActiveSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("ACTIVE_SPREADSHEET_ID");
  if (!id || id.trim() === "") {
    throw new Error("CONFIG_ERROR: ACTIVE_SPREADSHEET_ID not set in Script Properties.");
  }
  try {
    return SpreadsheetApp.openById(id.trim());
  } catch (e) {
    throw new Error("CONFIG_ERROR: Cannot open spreadsheet. Check ACTIVE_SPREADSHEET_ID.");
  }
}

// ===========================================================================
// HELPER — Header normalisation (CTO Requirement #6)
// ===========================================================================
function normalizeHeader(raw) {
  return String(raw || "")
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function headerMatchesAlias(normalizedHeader, aliases) {
  return aliases.some(alias => normalizedHeader === normalizeHeader(alias));
}

function getParticipantLogicalDefs() {
  return {
    NAME:        { aliases: ["nama penuh", "nama", "name", "full name"], required: true },
    PHONE:       { aliases: ["nombor telefon aktif whatsapp", "nombor telefon", "no telefon", "phone", "phone number", "no tel", "telefon"], required: true },
    EMAIL:       { aliases: ["email", "emel", "e-mail", "e mail"], required: false },
    PG_CODE:     { aliases: ["pg code", "pgcode", "agent code", "agent id", "kod pg"], required: true },
    WA_STATUS:   { aliases: ["wa status", "whatsapp status", "status wa", "status whatsapp"], required: true },
    REPLACEMENT: { aliases: ["replacement", "gantian", "pengganti", "replacement data", "data gantian"], required: true }
  };
}

// ===========================================================================
// HELPER — Participant header-based column mapping (CTO Requirement #1)
// ===========================================================================
function getParticipantColumnMap() {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  if (!sheet) throw new Error("Sheet '" + PARTICIPANT_SHEET + "' not found.");

  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error("COLUMN_ERROR: Header row is empty in " + PARTICIPANT_SHEET + ".");
  }
  const rawHeaders = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const headers = rawHeaders.map(h => normalizeHeader(h));

  const defs = getParticipantLogicalDefs();
  const logicalFields = {};
  Object.entries(defs).forEach(([field, config]) => {
    logicalFields[field] = { aliases: config.aliases, required: config.required, found: -1, col: -1 };
  });

  for (const [field, config] of Object.entries(logicalFields)) {
    for (let i = 0; i < headers.length; i++) {
      const normalized = headers[i];
      if (!normalized) continue;
      if (headerMatchesAlias(normalized, config.aliases)) {
        if (config.found >= 0) {
          throw new Error(
            "COLUMN_ERROR: Multiple columns match '" + field + "'. " +
            "Found at column " + (config.col + 1) + " and column " + (i + 1) + ". " +
            "Remove duplicate header."
          );
        }
        config.found = i;
        config.col = i;
      }
    }
    if (config.required && config.found < 0) {
      throw new Error(
        "COLUMN_ERROR: Required header for '" + field + "' not found in " + PARTICIPANT_SHEET + ". " +
        "Expected headers like: " + config.aliases.slice(0, 3).join(", ")
      );
    }
  }

  return {
    name: logicalFields.NAME.found,
    phone: logicalFields.PHONE.found,
    email: logicalFields.EMAIL.found,
    pgcode: logicalFields.PG_CODE.found,
    wastatus: logicalFields.WA_STATUS.found,
    replacement: logicalFields.REPLACEMENT.found
  };
}

// Cached column map
let _cachedColMap = null;
function getColumnMap() {
  if (!_cachedColMap) _cachedColMap = getParticipantColumnMap();
  return _cachedColMap;
}
function clearColumnMapCache() { _cachedColMap = null; }

// ===========================================================================
// HELPER — Header analysis for detailed validation reporting
// Returns full findings: found headers (source name + col), missing fields,
// duplicates. Does NOT throw — returns structured object for reporting.
// ===========================================================================
function analyzeHeaders() {
  const logicalDefs = getParticipantLogicalDefs();

  const result = {
    found: [],       // { logical, source, column }
    missing: [],     // [logical field name]
    duplicates: [],  // { logical, matches: [{source, column}] }
    errors: [],      // string messages
    columnMap: null  // backward-compat { name: idx, phone: idx, ... }
  };

  try {
    const ss = getActiveSpreadsheet();
    const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
    if (!sheet) {
      result.errors.push("Sheet '" + PARTICIPANT_SHEET + "' not found — cannot analyze headers.");
      return result;
    }

    const lastColumn = sheet.getLastColumn();
    const rawHeaders = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0] : [];
    const headers = rawHeaders.map(h => normalizeHeader(h));

    const logicalFields = {};
    for (const [field, config] of Object.entries(logicalDefs)) {
      logicalFields[field] = { found: [], aliases: config.aliases, required: config.required };
    }

    // Scan each header column against all logical field definitions
    for (let i = 0; i < headers.length; i++) {
      const normalized = headers[i];
      if (!normalized) continue;

      for (const [field, lf] of Object.entries(logicalFields)) {
        if (headerMatchesAlias(normalized, lf.aliases)) {
          lf.found.push({ source: String(rawHeaders[i]).trim(), column: i + 1 });
        }
      }
    }

    // Build findings
    const columnMap = {};

    for (const [field, lf] of Object.entries(logicalFields)) {
      if (lf.found.length === 0 && lf.required) {
        result.missing.push(field);
      } else if (lf.found.length === 1) {
        const f = lf.found[0];
        result.found.push({ logical: field, source: f.source, column: f.column });

        // Build column map (0-indexed for internal use)
        const key = field === "PG_CODE" ? "pgcode" :
                    field === "WA_STATUS" ? "wastatus" : field.toLowerCase();
        columnMap[key] = f.column - 1;
      } else if (lf.found.length > 1) {
        // Multiple columns matched — duplicate detection
        result.duplicates.push({
          logical: field,
          matches: lf.found.map(f => ({ source: f.source, column: f.column }))
        });
        // Still report each match in found for visibility
        lf.found.forEach(f => {
          result.found.push({ logical: field, source: f.source, column: f.column });
        });
      }
    }

    if (result.duplicates.length === 0 && result.missing.length === 0) {
      result.columnMap = columnMap;
    }

  } catch (e) {
    result.errors.push("Header analysis failed: " + e.message.split("\n")[0]);
  }

  return result;
}

// ===========================================================================
// HELPER — Sheet & system validation (CTO Requirement #3)
// Token-protected: requires admin token (CTO Correction #2)
// ===========================================================================
function validateSetup(token) {
  if (!validateAdminToken(token)) return authRequiredResponse();

  const result = {
    success: true,
    sheets: {},
    columns: null,
    headerFindings: null,
    eventValidation: {
      eventIdConfigured: false,
      eventIdValid: false,
      attendanceEventIdHeader: false,
      wishlistEventIdHeader: false,
      attendanceClaimSecretConfigured: false
    },
    warnings: [],
    errors: []
  };

  try {
    const ss = getActiveSpreadsheet();

    const requiredSheets = [PARTICIPANT_SHEET, ATTENDANCE_SHEET, SETTINGS_SHEET, WISHLIST_SHEET];
    requiredSheets.forEach(name => {
      const sheet = ss.getSheetByName(name);
      result.sheets[name] = !!sheet;
      if (!sheet) result.errors.push("Missing sheet: " + name);
    });

    // Detailed header analysis (does NOT throw — reports all findings)
    if (result.sheets[PARTICIPANT_SHEET]) {
      const hf = analyzeHeaders();
      result.headerFindings = hf;
      result.columns = hf.columnMap; // backward compat — null if any field missing

      // Report missing headers individually (NOT a single combined error)
      hf.missing.forEach(field => {
        result.errors.push("Missing header: " + field);
      });

      // Report duplicate matches
      hf.duplicates.forEach(dup => {
        const cols = dup.matches.map(m => "col " + m.column + " (\"" + m.source + "\")").join(", ");
        result.errors.push("Duplicate header '" + dup.logical + "' matched at: " + cols);
      });

      // Report analysis-level errors (e.g. sheet access failure)
      hf.errors.forEach(e => result.errors.push(e));
    }

    if (result.sheets[SETTINGS_SHEET]) {
      const settingsSheet = ss.getSheetByName(SETTINGS_SHEET);
      const lastCol = settingsSheet.getLastColumn();
      if (lastCol < 2) {
        result.warnings.push("Settings sheet has fewer than 2 columns — key-value storage may fail.");
      }
      const lastRow = settingsSheet.getLastRow();
      if (lastRow >= 1) {
        const keyRows = settingsSheet.getRange(1, 1, lastRow, 1).getDisplayValues()
          .map((r, idx) => ({ key: String(r[0] || "").trim().toUpperCase(), row: idx + 1 }))
          .filter(item => item.key);
        const seen = {};
        keyRows.forEach(item => {
          const k = item.key;
          if (seen[k]) result.errors.push("Duplicate Settings key: " + k + " at A" + seen[k] + " and A" + item.row);
          seen[k] = item.row;
          if (/^\d+$/.test(k)) {
            result.errors.push("Invalid Settings key at A" + item.row + ": " + k);
            return;
          }
          if (k !== "EVENT_TIME" && !SETTINGS_KEYS_SET.has(k)) result.warnings.push("Unknown Settings key: " + k);
        });
      }
      const settings = getSettings();
      result.eventValidation.eventIdConfigured = !!safeString(settings.EVENT_ID, 80);
      result.eventValidation.eventIdValid = !!getCanonicalEventId(settings);
      if (!result.eventValidation.eventIdConfigured) result.errors.push("Missing Settings key: EVENT_ID");
      else if (!result.eventValidation.eventIdValid) result.errors.push("Invalid Settings value: EVENT_ID must be a lowercase slug.");
    }

    if (result.sheets[ATTENDANCE_SHEET]) {
      const attendanceMap = getAttendanceColumnMap(ss.getSheetByName(ATTENDANCE_SHEET));
      result.eventValidation.attendanceEventIdHeader = attendanceMap.eventId >= 0;
      if (!result.eventValidation.attendanceEventIdHeader) result.errors.push("Missing Kehadiran header: Event ID");
    }
    if (result.sheets[WISHLIST_SHEET]) {
      const wishlistMap = getWishlistColumnMap(ss.getSheetByName(WISHLIST_SHEET));
      result.eventValidation.wishlistEventIdHeader = wishlistMap.eventId >= 0;
      if (!result.eventValidation.wishlistEventIdHeader) result.errors.push("Missing Wishlist header: Event ID");
    }
    if (Session.getScriptTimeZone() !== PROJECT_TIMEZONE) {
      result.errors.push("Apps Script timezone must be " + PROJECT_TIMEZONE + ".");
    }

    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty("ADMIN_USERNAME") || !props.getProperty("ADMIN_PASSWORD")) {
      result.warnings.push("ADMIN_USERNAME or ADMIN_PASSWORD not set in Script Properties.");
    }
    result.eventValidation.attendanceClaimSecretConfigured = !!getAttendanceClaimSecret();
    if (!result.eventValidation.attendanceClaimSecretConfigured) {
      result.errors.push("ATTENDANCE_CLAIM_SECRET must be set in Script Properties with at least 32 characters.");
    }

    // NEVER expose spreadsheet ID, admin details, or internal state

  } catch (e) {
    result.success = false;
    result.errors.push("Setup validation failed: " + e.message.split("\n")[0]);
  }

  if (result.errors.length > 0) result.success = false;
  return jsonResponse(result);
}

function migrateSchema(token) {
  if (!validateAdminToken(token)) return authRequiredResponse();

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) return publicError("LOCK_BUSY", "Sistem sedang sibuk. Sila cuba semula sebentar lagi.");

    const ss = getActiveSpreadsheet();
    const results = [
      migrateParticipantManagedHeaders(ss.getSheetByName(PARTICIPANT_SHEET)),
      migrateEventIdHeaderForSheet(ss.getSheetByName(ATTENDANCE_SHEET), ATTENDANCE_SHEET),
      migrateEventIdHeaderForSheet(ss.getSheetByName(WISHLIST_SHEET), WISHLIST_SHEET)
    ];
    const success = results.every(r => r.success);
    return jsonResponse({
      success: success,
      code: success ? "SCHEMA_MIGRATION_OK" : "SCHEMA_MIGRATION_FAILED",
      message: success ? "Schema migration completed. Run validateSetup again." : "Schema migration failed. Resolve duplicate or missing sheets, then retry.",
      results: results
    });
  } catch (e) {
    logServerError("migrateSchema", e);
    return publicError("MIGRATION_FAILED", "Schema migration tidak dapat diproses.");
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===========================================================================
// HELPER — JSON response
// ===========================================================================
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function publicError(code, message) {
  return jsonResponse({ success: false, code: code || "REQUEST_FAILED", message: message || "Permintaan tidak dapat diproses." });
}

function schemaErrorResponse(error) {
  const message = error && error.message ? error.message : "";
  if (message.indexOf("Multiple columns match") >= 0) {
    return publicError("DUPLICATE_HEADER", "Header peserta duplicate atau ambiguous. Sila semak System Validation.");
  }
  if (message.indexOf("Required header") >= 0) {
    return publicError("HEADER_MISSING", "Header peserta wajib hilang. Sila semak System Validation.");
  }
  if (message.indexOf("Sheet '") >= 0) {
    return publicError("SHEET_MISSING", "Sheet wajib tidak ditemui. Sila semak System Validation.");
  }
  return publicError("SHEET_SCHEMA_INVALID", "Struktur sheet belum sah. Sila jalankan System Validation.");
}

function logServerError(context, error) {
  console.error(context + ": " + (error && error.message ? error.message : "Unknown error"));
}

function parsePostBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    const parsed = JSON.parse(e.postData.contents);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return { _parseError: true };
  }
}

function getRemoteKey(prefix, value) {
  const raw = String(value || "anon").slice(0, 80);
  return prefix + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)).slice(0, 32);
}

function getRequestFingerprint(e, fallback) {
  const params = e && e.parameter ? JSON.stringify(e.parameter) : "";
  return params || fallback || "anonymous";
}

function incrementRateLimit(prefix, keySeed, limit, ttlSeconds) {
  const cache = CacheService.getScriptCache();
  const key = getRemoteKey(prefix, keySeed);
  const current = Number(cache.get(key) || "0");
  if (current >= limit) return false;
  cache.put(key, String(current + 1), ttlSeconds);
  return true;
}

function safeString(value, maxLen) {
  if (value === null || value === undefined) return "";
  let str = String(value).trim();
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str)) return "";
  if (maxLen && str.length > maxLen) str = str.slice(0, maxLen);
  return str;
}

function normalizeName(value) {
  const str = safeString(value, 120).replace(/\s+/g, " ");
  if (!str || str.length < 2) return "";
  return str;
}

function normalizePhone(value) {
  const raw = safeString(value, 40);
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "6" + digits;
  if (!digits.startsWith("60") && digits.length >= 9) digits = "60" + digits;
  if (!/^60\d{8,11}$/.test(digits)) return "";
  return digits;
}

function phoneTail(value) {
  const phone = normalizePhone(value);
  return phone && phone.length >= 7 ? phone.slice(-7) : "";
}

function normalizeEmail(value) {
  const str = safeString(value, 160).toLowerCase();
  if (!str) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return "";
  return str;
}

function normalizePgCode(value) {
  const str = safeString(value, 40).toUpperCase().replace(/\s+/g, "");
  if (!str) return "";
  if (!/^[A-Z0-9_-]{2,40}$/.test(str)) return "";
  return str;
}

function normalizeKeyword(value) {
  const raw = safeString(value, 80).replace(/\s+/g, " ");
  if (!raw || raw.length < 3) return "";
  return raw;
}

function normalizeWaStatus(value) {
  const str = safeString(value, 20).toUpperCase();
  if (str === "TERHANTAR") return "SUDAH";
  if (str === "TIADA WA") return "ERROR";
  return ["BELUM", "SUDAH", "ERROR"].includes(str) ? str : "";
}

function normalizeApprovalStatus(value) {
  const str = safeString(value, 20).toUpperCase();
  return ["APPROVE", "REJECT"].includes(str) ? str : "";
}

function normalizeSettingTime(value) {
  const raw = safeString(value, 30);
  if (!raw) return "";

  let match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
    }
  }

  match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3].toUpperCase();
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      if (meridiem === "PM" && hour !== 12) hour += 12;
      if (meridiem === "AM" && hour === 12) hour = 0;
      return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
    }
  }

  return "";
}

function normalizeSettingDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, PROJECT_TIMEZONE, "yyyy-MM-dd");
  }
  const raw = safeString(value, 40);
  if (!raw) return "";

  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    }
  }

  match = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    }
  }

  return "";
}

function validatePublicPerson(data, options) {
  const requiredEmail = options && options.requiredEmail;
  const person = {
    nama: normalizeName(data && data.nama),
    phone: normalizePhone(data && data.phone),
    email: normalizeEmail(data && data.email),
    pgcode: normalizePgCode(data && data.pgcode)
  };
  if (!person.nama || !person.phone) return { valid: false, message: "Nama dan nombor telefon diperlukan." };
  if (requiredEmail && !person.email) return { valid: false, message: "E-mel tidak sah." };
  if (data && data.email && !person.email) return { valid: false, message: "E-mel tidak sah." };
  if (data && data.pgcode && !person.pgcode) return { valid: false, message: "PG Code tidak sah." };
  return { valid: true, person: person };
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";
  return normalized.slice(0, 4) + "****" + normalized.slice(-3);
}

function maskEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return "";
  const parts = normalized.split("@");
  const name = parts[0];
  return name.slice(0, 2) + "***@" + parts[1];
}

function getCanonicalEventId(settings) {
  const id = safeString(settings && settings.EVENT_ID, 80).toLowerCase();
  if (!id) return "";
  if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(id)) return "";
  return id;
}

function isFlagEnabled(settings, key, defaultValue) {
  const value = settings && settings[key];
  if (value === "" || value === null || value === undefined) return defaultValue;
  return String(value).trim().toLowerCase() === "true";
}

function getSheetColumnMap(sheet, aliases) {
  const lastColumn = sheet ? sheet.getLastColumn() : 0;
  const headers = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(h => normalizeHeader(h)) : [];
  const map = {};
  Object.entries(aliases).forEach(([key, names]) => {
    map[key] = -1;
    for (let i = 0; i < headers.length; i++) {
      if (names.some(name => headers[i] === normalizeHeader(name))) {
        map[key] = i;
        break;
      }
    }
  });
  return map;
}

function getAttendanceColumnMap(sheet) {
  return getSheetColumnMap(sheet, {
    timestamp: ["Timestamp"],
    name: ["Nama", "Name"],
    phone: ["Phone", "No Telefon", "Telefon"],
    email: ["Email", "Emel"],
    pgcode: ["PG Code", "PGCode", "Kod PG"],
    status: ["Status"],
    eventId: ["Event ID", "EVENT_ID"]
  });
}

function getWishlistColumnMap(sheet) {
  return getSheetColumnMap(sheet, {
    timestamp: ["Timestamp"],
    name: ["Nama", "Name"],
    phone: ["Phone", "No Telefon", "Telefon"],
    email: ["Email", "Emel"],
    pgcode: ["PG Code", "PGCode", "Kod PG"],
    eventId: ["Event ID", "EVENT_ID"]
  });
}

function appendMappedRow(sheet, map, valuesByKey) {
  const row = new Array(Math.max(sheet.getLastColumn(), 1)).fill("");
  Object.entries(valuesByKey).forEach(([key, value]) => {
    if (map[key] >= 0) row[map[key]] = value;
  });
  sheet.appendRow(row);
}

function requireColumnMap(map, requiredKeys) {
  const missing = requiredKeys.filter(key => map[key] < 0);
  return missing.length === 0 ? "" : missing.join(", ");
}

function getHeaderMatches(sheet, aliases) {
  const headers = getHeaderValues(sheet);
  const normalizedAliases = aliases.map(a => normalizeHeader(a));
  const matches = [];
  for (let i = 0; i < headers.length; i++) {
    if (normalizedAliases.includes(normalizeHeader(headers[i]))) {
      matches.push({ column: i + 1, source: safeString(headers[i], 120) });
    }
  }
  return matches;
}

function getHeaderValues(sheet) {
  if (!sheet || sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
}

function migrateEventIdHeaderForSheet(sheet, sheetName) {
  if (!sheet) return { sheet: sheetName, success: false, message: "Sheet not found." };
  const defaultHeaders = sheetName === ATTENDANCE_SHEET ? ATTENDANCE_HEADERS : sheetName === WISHLIST_SHEET ? WISHLIST_HEADERS : [];
  if (sheet.getLastColumn() < 1 && defaultHeaders.length > 0) {
    sheet.getRange(1, 1, 1, defaultHeaders.length).setValues([defaultHeaders]);
    return { sheet: sheetName, success: true, changed: true, initialized: true, message: "Header row initialized.", columns: defaultHeaders.length };
  }
  const matches = getHeaderMatches(sheet, ["Event ID", "EVENT_ID"]);
  if (matches.length > 1) {
    return { sheet: sheetName, success: false, code: "DUPLICATE_EVENT_ID_HEADER", matches: matches };
  }
  if (matches.length === 1) {
    return { sheet: sheetName, success: true, changed: false, message: "Event ID header already exists.", column: matches[0].column };
  }
  const existingHeaders = getHeaderValues(sheet).map(h => normalizeHeader(h));
  const missingDefaults = defaultHeaders.filter(header => !existingHeaders.includes(normalizeHeader(header)));
  missingDefaults.forEach(header => {
    const col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(header);
  });
  if (missingDefaults.length > 0) {
    return { sheet: sheetName, success: true, changed: true, message: "Missing headers added.", added: missingDefaults };
  }
  const col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col).setValue("Event ID");
  return { sheet: sheetName, success: true, changed: true, message: "Event ID header added.", column: col };
}

function migrateParticipantManagedHeaders(sheet) {
  if (!sheet) return { sheet: PARTICIPANT_SHEET, success: false, message: "Sheet not found." };
  const result = { sheet: PARTICIPANT_SHEET, success: true, changed: false, added: [] };
  PARTICIPANT_MANAGED_HEADERS.forEach(header => {
    const matches = getHeaderMatches(sheet, [header]);
    if (matches.length > 1) {
      result.success = false;
      result.code = "DUPLICATE_PARTICIPANT_HEADER";
      result.message = "Duplicate managed participant header: " + header;
      result.matches = matches;
      return;
    }
    if (matches.length === 0 && result.success) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(header);
      result.changed = true;
      result.added.push({ header: header, column: col });
    }
  });
  if (!result.message) result.message = result.changed ? "Managed participant headers added." : "Managed participant headers already exist.";
  return result;
}

function getParticipantRecordFromRow(row, cm, rowNumber) {
  let replacement = null;
  if (row.length > cm.replacement && row[cm.replacement]) {
    try { replacement = JSON.parse(String(row[cm.replacement])); } catch (e) { replacement = null; }
  }
  return {
    rowNumber: rowNumber,
    nama: normalizeName(row[cm.name]),
    phone: normalizePhone(row[cm.phone]),
    email: normalizeEmail(row[cm.email]),
    pgcode: normalizePgCode(row[cm.pgcode]),
    rawNama: safeString(row[cm.name], 160),
    rawPhone: safeString(row[cm.phone], 60),
    rawEmail: safeString(row[cm.email], 180),
    rawPgcode: safeString(row[cm.pgcode], 60),
    waStatus: normalizeWaStatus(row[cm.wastatus]) || "BELUM",
    replacement: replacement
  };
}

function getActiveReplacement(record) {
  const rep = record && record.replacement;
  if (!rep || rep.approved !== true) return null;
  const normalized = validatePublicPerson({ nama: rep.nama, phone: rep.phone, email: rep.email, pgcode: rep.pgcode });
  if (!normalized.valid) return null;
  return normalized.person;
}

function countEventAttendanceRows(attendanceSheet, eventId) {
  const map = getAttendanceColumnMap(attendanceSheet);
  if (map.eventId < 0) throw new Error("Missing Event ID header.");
  const rows = attendanceSheet.getDataRange().getDisplayValues();
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const rowEventId = map.eventId >= 0 ? safeString(rows[i][map.eventId], 80) : "";
    if (rowEventId === eventId) count++;
  }
  return count;
}

function getAttendanceClaimSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty("ATTENDANCE_CLAIM_SECRET");
  return secret && secret.trim().length >= 32 ? secret.trim() : "";
}

function signClaimPayload(payload, secret) {
  const sigBytes = Utilities.computeHmacSha256Signature(payload, secret);
  return Utilities.base64EncodeWebSafe(sigBytes);
}

function signaturesMatch(a, b) {
  const left = safeString(a, 256);
  const right = safeString(b, 256);
  let diff = left.length ^ right.length;
  const maxLen = Math.max(left.length, right.length);
  for (let i = 0; i < maxLen; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function createAttendanceClaim(participantRef, type, eventId) {
  const secret = getAttendanceClaimSecret();
  if (!secret) {
    logServerError("createAttendanceClaim", new Error("ATTENDANCE_CLAIM_SECRET not configured."));
    return "";
  }
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (15 * 60);
  const payload = [participantRef, type, eventId, iat, exp].join("|");
  return Utilities.base64EncodeWebSafe(payload) + "." + signClaimPayload(payload, secret);
}

function verifyAttendanceClaim(claim, participantRef, type, eventId) {
  const secret = getAttendanceClaimSecret();
  if (!secret) return false;
  const raw = safeString(claim, 500);
  const parts = raw.split(".");
  if (parts.length !== 2) return false;
  let payload = "";
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  } catch (e) {
    return false;
  }
  const fields = payload.split("|");
  if (fields.length !== 5) return false;
  if (fields[0] !== participantRef || fields[1] !== type || fields[2] !== eventId) return false;
  const iat = Number(fields[3]);
  const exp = Number(fields[4]);
  const now = Math.floor(Date.now() / 1000);
  if (!iat || !exp || iat > now + 60 || exp <= iat || exp - iat > 15 * 60 || now > exp) return false;
  return signaturesMatch(parts[1], signClaimPayload(payload, secret));
}

// ===========================================================================
// ROUTING — doGet
// ===========================================================================
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "";
    if (action === "search") return searchParticipant(e.parameter.keyword, e);
    if (action === "dashboard") return authRequiredResponse();
    if (action === "getConfig") return getPublicConfig();
    // validateSetup moved to POST — requires admin token
    return publicError("INVALID_ACTION", "Permintaan tidak sah.");
  } catch (error) {
    logServerError("doGet", error);
    return publicError("SERVER_ERROR", "Sistem sementara tidak dapat memproses permintaan.");
  }
}

// ===========================================================================
// ROUTING — doPost
// ===========================================================================
function doPost(e) {
  try {
    const body = parsePostBody(e);
    if (body._parseError) return publicError("BAD_JSON", "Format permintaan tidak sah.");

    // Public actions (no auth)
    if (body.action === "attendance") return submitAttendance(body.data);
    if (body.action === "submitWishlist") return submitWishlist(body.data);
    if (body.action === "submitReplacementPublic") return submitReplacementPublic(body.data);

    // Auth actions (login/logout don't need pre-existing token)
    if (body.action === "adminLogin") return adminLogin(body);
    if (body.action === "adminLogout") return adminLogout(body);

    // Protected admin actions
    if (body.action === "saveSettings") return saveSettings(body);
    if (body.action === "updateWAStatus") return updateWAStatus(body.data, body.token);
    if (body.action === "replaceParticipant") return replaceParticipant(body.data, body.token);
    if (body.action === "handleApproval") return handleApproval(body.data, body.token);
    if (body.action === "validateSetup") return validateSetup(body.token);
    if (body.action === "getDashboard") return getDashboard(body.token);
    if (body.action === "migrateSchema") return migrateSchema(body.token);

    return publicError("INVALID_ACTION", "Permintaan tidak sah.");
  } catch (error) {
    logServerError("doPost", error);
    return publicError("SERVER_ERROR", "Sistem sementara tidak dapat memproses permintaan.");
  }
}

// ===========================================================================
// AUTH — Token management (CTO Requirement #4, #7)
// ===========================================================================
const TOKEN_PREFIX = "admin_token_";
const TOKEN_TTL_SECONDS = 6 * 60 * 60; // 6 hours

function generateToken() {
  return Utilities.getUuid();
}

function storeToken(token) {
  const cache = CacheService.getScriptCache();
  cache.put(TOKEN_PREFIX + token, "valid", TOKEN_TTL_SECONDS);
}

function validateAdminToken(token) {
  if (!token || typeof token !== "string" || token.trim() === "") return false;
  const cache = CacheService.getScriptCache();
  const val = cache.get(TOKEN_PREFIX + token.trim());
  return val === "valid";
}

function invalidateToken(token) {
  if (!token) return;
  const cache = CacheService.getScriptCache();
  cache.remove(TOKEN_PREFIX + token.trim());
}

// ===========================================================================
// AUTH — adminLogin (returns token + expiresAt)
// ===========================================================================
function adminLogin(body) {
  const props = PropertiesService.getScriptProperties();
  const storedUser = props.getProperty("ADMIN_USERNAME");
  const storedPass = props.getProperty("ADMIN_PASSWORD");
  const userSeed = safeString(body && body.username, 80) || "unknown";
  const loginAllowed = incrementRateLimit(LOGIN_RATE_LIMIT_PREFIX, userSeed, 10, 15 * 60);

  if (!storedUser || !storedPass) {
    return jsonResponse({ success: false, message: "Login tidak berjaya." });
  }
  if (!loginAllowed) {
    return jsonResponse({ success: false, code: "RATE_LIMITED", message: "Terlalu banyak percubaan. Sila cuba semula kemudian." });
  }

  if (body && body.username === storedUser && body.password === storedPass) {
    const token = generateToken();
    storeToken(token);
    const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    return jsonResponse({ success: true, token: token, expiresAt: expiresAt });
  }

  return jsonResponse({ success: false, message: "Login tidak berjaya." });
}

// ===========================================================================
// AUTH — adminLogout
// ===========================================================================
function adminLogout(body) {
  invalidateToken(body.token);
  return jsonResponse({ success: true });
}

// ===========================================================================
// SETTINGS — Type validators (CTO Requirement #5)
// ===========================================================================
function validateJsonField(key, value) {
  if (value === "" || value === null || value === undefined) return true; // empty is OK
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) {
      return { valid: false, message: key + " must be a JSON array." };
    }
    if (key === "SCHEDULE_JSON") {
      for (let i = 0; i < parsed.length; i++) {
        if (!parsed[i].time || !parsed[i].title) {
          return { valid: false, message: key + " item " + (i + 1) + " missing 'time' or 'title'." };
        }
      }
    }
    if (key === "BENEFITS_JSON") {
      for (let i = 0; i < parsed.length; i++) {
        if (!parsed[i].text) {
          return { valid: false, message: key + " item " + (i + 1) + " missing 'text'." };
        }
      }
    }
    return true;
  } catch (e) {
    return { valid: false, message: key + " contains invalid JSON." };
  }
}

function validateUrlField(key, value) {
  if (value === "" || value === null || value === undefined) return true;
  const str = String(value).trim().toLowerCase();
  if (!str.startsWith("https://")) {
    return { valid: false, message: key + " must start with https://." };
  }
  return true;
}

function validateColorField(key, value) {
  if (value === "" || value === null || value === undefined) return true;
  const str = String(value).trim();
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(str)) {
    return { valid: false, message: key + " must be a hex color like #FFAA00 or #F90." };
  }
  return true;
}

function validateNumberField(key, value) {
  if (value === "" || value === null || value === undefined) return true;
  const num = Number(value);
  if (isNaN(num)) return { valid: false, message: key + " must be a valid number." };
  if (key === "PARTICIPANT_QUOTA") {
    if (num < 0 || !Number.isInteger(num)) return { valid: false, message: key + " must be a positive whole number." };
    if (num > MAX_QUOTA) return { valid: false, message: key + " cannot exceed " + MAX_QUOTA + "." };
  }
  if (key === "OPEN_BEFORE_HOURS") {
    if (num < 0 || num > MAX_OPEN_HOURS) return { valid: false, message: key + " must be between 0 and " + MAX_OPEN_HOURS + " hours." };
  }
  return true;
}

function validateBooleanField(key, value) {
  if (value === "" || value === null || value === undefined) return true;
  const str = String(value).trim().toLowerCase();
  if (str !== "true" && str !== "false") return { valid: false, message: key + " must be 'true' or 'false'." };
  return true;
}

function normalizeBooleanSetting(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  const str = String(value === null || value === undefined ? "" : value).trim().toLowerCase();
  if (str === "true") return "true";
  if (str === "false") return "false";
  return "";
}

function isTimeSettingKey(key) {
  return key === "EVENT_START_TIME" || key === "EVENT_END_TIME" || key === "EVENT_TIME";
}

function setSettingValue(sheet, row, value, key) {
  const cell = sheet.getRange(row, 2);
  if (isTimeSettingKey(key)) {
    cell.setNumberFormat("@");
  }
  cell.setValue(value);
}

// ===========================================================================
// SETTINGS — Dynamic getSettings (reads all rows)
// ===========================================================================
function getSettings() {
  try {
    const ss = getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SETTINGS_SHEET);
    if (!sheet) return {};

    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return {};

    const range = sheet.getRange(1, 1, lastRow, 2);
    const data = range.getValues();
    const displayData = range.getDisplayValues();
    const settings = {};

    for (let i = 0; i < data.length; i++) {
      const key = String(displayData[i][0] || data[i][0] || "").trim().toUpperCase();
      if (!key) continue;
      if (isTimeSettingKey(key)) {
        settings[key] = displayData[i][1];
      } else {
        settings[key] = data[i][1] === "" || data[i][1] === null || data[i][1] === undefined ? displayData[i][1] : data[i][1];
      }
    }

    // Compatibility alias: EVENT_TIME ↔ EVENT_START_TIME
    const canonicalStartTime = normalizeSettingTime(settings.EVENT_START_TIME);
    const legacyStartTime = normalizeSettingTime(settings.EVENT_TIME);
    if (canonicalStartTime) {
      settings.EVENT_START_TIME = canonicalStartTime;
      settings.EVENT_TIME = canonicalStartTime;
    } else if (legacyStartTime) {
      settings.EVENT_START_TIME = legacyStartTime;
      settings.EVENT_TIME = legacyStartTime;
    }
    const canonicalEndTime = normalizeSettingTime(settings.EVENT_END_TIME);
    if (canonicalEndTime) {
      settings.EVENT_END_TIME = canonicalEndTime;
    }
    const canonicalDate = normalizeSettingDate(settings.EVENT_DATE);
    if (canonicalDate) {
      settings.EVENT_DATE = canonicalDate;
    }
    BOOLEAN_SETTINGS.forEach(key => {
      if (settings[key] !== undefined && settings[key] !== "") {
        settings[key] = normalizeBooleanSetting(settings[key]);
      }
    });

    return settings;
  } catch (e) {
    console.error("getSettings error:", e.message);
    return {};
  }
}

// ===========================================================================
// SETTINGS — Dynamic saveSettings (CTO Requirement #5 — hardened)
// ===========================================================================
function saveSettings(body) {
  // 1. Token validation
  if (!validateAdminToken(body.token)) return authRequiredResponse();
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) return publicError("LOCK_BUSY", "Sistem sedang sibuk. Sila cuba semula sebentar lagi.");

    const ss = getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SETTINGS_SHEET);
    if (!sheet) return jsonResponse({ success: false, message: "Settings sheet not found." });

    // 2. Determine settings to save
    let settingsToSave = {};

    if (Array.isArray(body.settings)) {
      return jsonResponse({
        success: false,
        code: "SETTINGS_PAYLOAD_INVALID",
        message: "Settings payload must be an object, not an array."
      });
    }

    if (body.settings && typeof body.settings === "object") {
      // V1 canonical format: { action, token, settings: { KEY: value, ... } }
      settingsToSave = body.settings;
    } else {
      // Backward compatible old format: { eventDate, eventTime, openBeforeHours }
      if (body.eventDate !== undefined) settingsToSave.EVENT_DATE = body.eventDate;
      if (body.eventTime !== undefined) settingsToSave.EVENT_START_TIME = body.eventTime;
      if (body.openBeforeHours !== undefined) settingsToSave.OPEN_BEFORE_HOURS = body.openBeforeHours;
    }

    // NEVER store: action, token, username, password, spreadsheet ID
    delete settingsToSave.action;
    delete settingsToSave.token;
    delete settingsToSave.username;
    delete settingsToSave.password;
    delete settingsToSave.spreadsheetId;
    delete settingsToSave.sheetId;

    if (Object.keys(settingsToSave).length === 0) {
      return jsonResponse({ success: false, message: "No settings provided." });
    }

    // 3. Validate each key
    const validated = {};
    const rejected = [];
    const seenIncoming = new Set();

    for (const [rawKey, value] of Object.entries(settingsToSave)) {
      const key = safeString(rawKey, 80).toUpperCase();
      if (!key) {
        rejected.push({ key: rawKey, reason: "Invalid key." });
        continue;
      }
      if (/^\d+$/.test(key)) {
        rejected.push({ key: rawKey, reason: "Numeric setting keys are invalid." });
        continue;
      }

      // Resolve legacy alias
      let canonicalKey = key;
      if (key === "EVENT_TIME" || key === "EVENTTIME") {
        canonicalKey = "EVENT_START_TIME";
      }

      if (seenIncoming.has(canonicalKey)) {
        rejected.push({ key: rawKey, reason: "Duplicate setting in request." });
        continue;
      }
      seenIncoming.add(canonicalKey);

      // Whitelist check
      if (!SETTINGS_KEYS_SET.has(canonicalKey)) {
        rejected.push({ key: rawKey, reason: "Not an approved setting." });
        continue;
      }

      let strValue = String(value);

      // Text length check
      if (strValue.length > MAX_TEXT_LENGTH) {
        rejected.push({ key: rawKey, reason: "Exceeds maximum length of " + MAX_TEXT_LENGTH + " characters." });
        continue;
      }

      // Type-specific validation
      let typeValid = true;
      if (JSON_SETTINGS.includes(canonicalKey)) {
        const result = validateJsonField(canonicalKey, strValue);
        if (result !== true) { rejected.push({ key: rawKey, reason: result.message }); typeValid = false; }
      }
      if (typeValid && URL_SETTINGS.includes(canonicalKey)) {
        const result = validateUrlField(canonicalKey, strValue);
        if (result !== true) { rejected.push({ key: rawKey, reason: result.message }); typeValid = false; }
      }
      if (typeValid && COLOR_SETTINGS.includes(canonicalKey)) {
        const result = validateColorField(canonicalKey, strValue);
        if (result !== true) { rejected.push({ key: rawKey, reason: result.message }); typeValid = false; }
      }
      if (typeValid && NUMBER_SETTINGS.includes(canonicalKey)) {
        const result = validateNumberField(canonicalKey, strValue);
        if (result !== true) { rejected.push({ key: rawKey, reason: result.message }); typeValid = false; }
      }
      if (typeValid && BOOLEAN_SETTINGS.includes(canonicalKey)) {
        const result = validateBooleanField(canonicalKey, strValue);
        if (result !== true) { rejected.push({ key: rawKey, reason: result.message }); typeValid = false; }
        else if (strValue !== "") strValue = normalizeBooleanSetting(strValue);
      }
      if (typeValid && canonicalKey === "EVENT_ID" && strValue) {
        const eventId = getCanonicalEventId({ EVENT_ID: strValue });
        if (!eventId) { rejected.push({ key: rawKey, reason: "EVENT_ID must be a lowercase slug." }); typeValid = false; }
      }
      if (typeValid && (canonicalKey === "EVENT_DATE") && strValue) {
        const normalizedDate = normalizeSettingDate(strValue);
        if (!normalizedDate) {
          rejected.push({ key: rawKey, reason: "EVENT_DATE must use YYYY-MM-DD." }); typeValid = false;
        } else {
          strValue = normalizedDate;
        }
      }
      if (typeValid && (canonicalKey === "EVENT_START_TIME" || canonicalKey === "EVENT_END_TIME") && strValue) {
        const normalizedTime = normalizeSettingTime(strValue);
        if (!normalizedTime) {
          rejected.push({ key: rawKey, reason: canonicalKey + " must use HH:mm." }); typeValid = false;
        } else {
          strValue = normalizedTime;
        }
      }

      if (!typeValid) continue;

      validated[canonicalKey] = strValue;
    }

    if (rejected.length > 0) {
      return jsonResponse({
        success: false,
        code: "SETTINGS_VALIDATION_FAILED",
        message: "Settings tidak disimpan kerana terdapat field tidak sah.",
        rejected: rejected
      });
    }

    if (Object.keys(validated).length === 0) {
      return jsonResponse({
        success: false,
        message: "No valid settings to save.",
        rejected: rejected.length > 0 ? rejected : undefined
      });
    }

    // 4. Read existing keys
    const lastRow = sheet.getLastRow();
    const existingKeys = new Map();
    const duplicateKeys = [];
    if (lastRow >= 1) {
      const keyData = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (let i = 0; i < keyData.length; i++) {
        const k = String(keyData[i][0] || "").trim().toUpperCase();
        if (!k) continue;
        if (existingKeys.has(k)) duplicateKeys.push(k);
        else existingKeys.set(k, i + 1);
      }
    }
    if (duplicateKeys.length > 0) {
      return jsonResponse({
        success: false,
        code: "DUPLICATE_SETTINGS_KEY",
        message: "Settings tidak disimpan kerana terdapat duplicate key.",
        duplicateKeys: duplicateKeys
      });
    }

    // 5. Write — update existing, append new
    let updated = 0;
    let appended = 0;
    for (const [key, value] of Object.entries(validated)) {
      if (existingKeys.has(key)) {
        setSettingValue(sheet, existingKeys.get(key), value, key);
        updated++;
      } else {
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1).setValue(key);
        setSettingValue(sheet, newRow, value, key);
        existingKeys.set(key, newRow);
        appended++;
      }
    }

    // 6. Write EVENT_TIME alias for backward compat (only if EVENT_START_TIME was saved)
    if (validated.EVENT_START_TIME) {
      if (existingKeys.has("EVENT_TIME")) {
        setSettingValue(sheet, existingKeys.get("EVENT_TIME"), validated.EVENT_START_TIME, "EVENT_TIME");
      } else {
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1).setValue("EVENT_TIME");
        setSettingValue(sheet, newRow, validated.EVENT_START_TIME, "EVENT_TIME");
      }
    }

    const response = {
      success: true,
      message: updated + " setting(s) updated, " + appended + " setting(s) added."
    };
    return jsonResponse(response);

  } catch (e) {
    logServerError("saveSettings", e);
    return publicError("SAVE_FAILED", "Settings tidak dapat disimpan.");
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===========================================================================
// CONFIG — Public config
// ===========================================================================
function getPublicConfig() {
  try {
    const all = getSettings();
    const filtered = {};
    Object.entries(all).forEach(([key, value]) => {
      const normalizedKey = String(key || "").trim().toUpperCase();
      if (PUBLIC_SETTINGS_SET.has(normalizedKey)) filtered[normalizedKey] = value;
    });
    return jsonResponse({ success: true, settings: filtered });
  } catch (e) {
    logServerError("getPublicConfig", e);
    return publicError("CONFIG_UNAVAILABLE", "Konfigurasi sementara tidak tersedia.");
  }
}

// ===========================================================================
// TIMING — Event timing helper
// ===========================================================================
function getEventTiming() {
  const settings = getSettings();
  const scriptTz = Session.getScriptTimeZone();
  if (scriptTz !== PROJECT_TIMEZONE) {
    logServerError("getEventTiming", new Error("Script timezone is " + scriptTz + ", expected " + PROJECT_TIMEZONE));
    return null;
  }
  const eventDate = settings.EVENT_DATE;
  const eventTime = settings.EVENT_START_TIME || settings.EVENT_TIME;
  const eventEndTime = settings.EVENT_END_TIME;
  const openBeforeHours = Number(settings.OPEN_BEFORE_HOURS) || 5;

  if (!eventDate || !eventTime || !eventEndTime) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate)) ||
      !/^\d{2}:\d{2}$/.test(String(eventTime)) ||
      !/^\d{2}:\d{2}$/.test(String(eventEndTime))) {
    logServerError("getEventTiming", new Error("Invalid EVENT_DATE/EVENT_START_TIME/EVENT_END_TIME format."));
    return null;
  }
  if (isNaN(openBeforeHours) || openBeforeHours < 0 || openBeforeHours > MAX_OPEN_HOURS) {
    logServerError("getEventTiming", new Error("Invalid OPEN_BEFORE_HOURS."));
    return null;
  }

  const eventStart = new Date(eventDate + "T" + eventTime + ":00+08:00");
  const attendanceClose = new Date(eventDate + "T" + eventEndTime + ":00+08:00");
  if (isNaN(eventStart.getTime()) || isNaN(attendanceClose.getTime()) || attendanceClose <= eventStart) {
    logServerError("getEventTiming", new Error("Invalid event start/end time."));
    return null;
  }
  const attendanceStart = new Date(eventStart.getTime() - (openBeforeHours * 60 * 60 * 1000));
  return { attendanceStart, attendanceClose };
}

// ===========================================================================
// PUBLIC — Participant search (header-based)
// ===========================================================================
function searchParticipant(keyword, e) {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return publicError("INVALID_KEYWORD", "Sila masukkan carian yang lebih spesifik.");
  if (!incrementRateLimit(SEARCH_RATE_LIMIT_PREFIX, getRequestFingerprint(e, normalizedKeyword), 30, 10 * 60)) {
    return publicError("RATE_LIMITED", "Terlalu banyak carian. Sila cuba semula kemudian.");
  }

  const settings = getSettings();
  if (!isFlagEnabled(settings, "SYSTEM_ENABLED", true)) {
    return publicError("SYSTEM_CLOSED", settings.CLOSED_MESSAGE || "Sistem semakan belum dibuka.");
  }
  const eventId = getCanonicalEventId(settings);
  if (!eventId) return publicError("EVENT_CONFIG_INVALID", "EVENT_ID belum ditetapkan atau tidak sah.");

  const timing = getEventTiming();
  let attendanceOpen = false;
  let attendanceStartDisplay = "Belum Ditetapkan";

  if (timing) {
    const { attendanceStart, attendanceClose } = timing;
    const now = new Date();
    attendanceOpen = (now >= attendanceStart && now <= attendanceClose);
    if (attendanceOpen && !getAttendanceClaimSecret()) attendanceOpen = false;
    attendanceStartDisplay = Utilities.formatDate(attendanceStart, PROJECT_TIMEZONE, "dd/MM/yyyy, hh:mm a");
  }

  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const data = sheet.getDataRange().getDisplayValues();
  const results = [];
  const lowerKeyword = normalizedKeyword.toLowerCase();
  const keywordPhone = normalizePhone(normalizedKeyword);
  const keywordTail = phoneTail(normalizedKeyword);
  const keywordPgcode = normalizePgCode(normalizedKeyword);
  const isNameSearch = !keywordPhone && !keywordPgcode && lowerKeyword.length >= 5;

  let colName, colPhone, colEmail, colPgcode, colWaStatus, colReplacement;
  try {
    const cm = getColumnMap();
    colName = cm.name;
    colPhone = cm.phone;
    colEmail = cm.email;
    colPgcode = cm.pgcode;
    colWaStatus = cm.wastatus;
    colReplacement = cm.replacement;
  } catch (e) {
    return schemaErrorResponse(e);
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const record = getParticipantRecordFromRow(row, { name: colName, phone: colPhone, email: colEmail, pgcode: colPgcode, wastatus: colWaStatus, replacement: colReplacement }, i + 1);
    if (!record.nama) continue;

    const rep = getActiveReplacement(record);
    const matchOrig =
      (keywordPgcode && record.pgcode && record.pgcode === keywordPgcode) ||
      (keywordPhone && record.phone && record.phone === keywordPhone) ||
      (!keywordPhone && keywordTail && record.phone && record.phone.slice(-7) === keywordTail) ||
      (isNameSearch && record.nama.toLowerCase() === lowerKeyword);
    const matchRep = rep && (
      (keywordPgcode && rep.pgcode && rep.pgcode === keywordPgcode) ||
      (keywordPhone && rep.phone && rep.phone === keywordPhone) ||
      (!keywordPhone && keywordTail && rep.phone && rep.phone.slice(-7) === keywordTail) ||
      (isNameSearch && rep.nama.toLowerCase() === lowerKeyword)
    );

    if (matchOrig) {
      const type = rep ? "REPLACED" : "NORMAL";
      results.push({
        participantRef: String(record.rowNumber),
        eventId: eventId,
        nama: record.rawNama, phone: maskPhone(record.phone), email: maskEmail(record.email), pgcode: record.pgcode,
        type: type,
        relativeName: rep ? rep.nama : '',
        attendanceOpen: rep ? false : attendanceOpen,
        attendanceStartDisplay: attendanceStartDisplay,
        attendanceClaim: (!rep && attendanceOpen) ? createAttendanceClaim(String(record.rowNumber), type, eventId) : ""
      });
    }
    if (matchRep) {
      const type = "REPLACEMENT";
      results.push({
        participantRef: String(record.rowNumber),
        eventId: eventId,
        nama: rep.nama, phone: maskPhone(rep.phone), email: maskEmail(rep.email), pgcode: rep.pgcode,
        type: type,
        relativeName: record.rawNama,
        attendanceOpen: attendanceOpen,
        attendanceStartDisplay: attendanceStartDisplay,
        attendanceClaim: attendanceOpen ? createAttendanceClaim(String(record.rowNumber), type, eventId) : ""
      });
    }
    if (results.length >= SEARCH_LIMIT) break;
  }

  if (results.length === 0) return publicError("NOT_FOUND", "Peserta tidak dijumpai.");
  return jsonResponse({ success: true, data: results });
}

// ===========================================================================
// PUBLIC — Attendance submission
// ===========================================================================
function submitAttendance(data) {
  const settings = getSettings();
  if (!isFlagEnabled(settings, "SYSTEM_ENABLED", true)) {
    return publicError("SYSTEM_CLOSED", settings.CLOSED_MESSAGE || "Sistem kehadiran belum dibuka.");
  }
  const eventId = getCanonicalEventId(settings);
  if (!eventId) return publicError("EVENT_CONFIG_INVALID", "EVENT_ID belum ditetapkan atau tidak sah.");

  const timing = getEventTiming();
  const now = new Date();

  if (!timing) return publicError("EVENT_TIMING_INVALID", "Konfigurasi tarikh atau masa event tidak sah.");
  const { attendanceStart, attendanceClose } = timing;
  if (now < attendanceStart || now > attendanceClose) {
    return publicError("ATTENDANCE_CLOSED", "Pengesahan kehadiran belum dibuka atau telah ditutup.");
  }

  const participantRef = safeString(data && data.participantRef, 20);
  const submittedType = safeString(data && data.type, 20).toUpperCase();
  const attendanceClaim = safeString(data && data.attendanceClaim, 500);
  if (!/^\d+$/.test(participantRef) || !["NORMAL", "REPLACEMENT"].includes(submittedType)) {
    return publicError("INVALID_PARTICIPANT", "Maklumat peserta tidak sah.");
  }
  if (!verifyAttendanceClaim(attendanceClaim, participantRef, submittedType, eventId)) {
    return publicError("INVALID_CLAIM", "Sesi pengesahan tamat. Sila buat carian semula.");
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  const ss = getActiveSpreadsheet();
  try {
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) return publicError("LOCK_BUSY", "Sistem sedang sibuk. Sila cuba semula sebentar lagi.");

    const participantSheet = ss.getSheetByName(PARTICIPANT_SHEET);
    const attendanceSheet = ss.getSheetByName(ATTENDANCE_SHEET);
    if (!participantSheet || !attendanceSheet) return publicError("SHEET_MISSING", "Sheet wajib tidak ditemui.");
    let cm;
    try {
      cm = getColumnMap();
    } catch (e) {
      return schemaErrorResponse(e);
    }
    const rowNumber = Number(participantRef);
    if (rowNumber < 2 || rowNumber > participantSheet.getLastRow()) {
      return publicError("INVALID_PARTICIPANT", "Maklumat peserta tidak sah.");
    }
    const row = participantSheet.getRange(rowNumber, 1, 1, participantSheet.getLastColumn()).getDisplayValues()[0];
    const record = getParticipantRecordFromRow(row, cm, rowNumber);
    const rep = getActiveReplacement(record);
    let canonical = null;
    if (submittedType === "NORMAL") {
      if (rep) return publicError("REPLACED_SLOT", "Slot ini telah diganti dan tidak boleh mengesahkan kehadiran.");
      canonical = { nama: record.rawNama, phone: record.phone, email: record.email, pgcode: record.pgcode };
    } else {
      if (!rep) return publicError("REPLACEMENT_NOT_APPROVED", "Pengganti belum diluluskan.");
      canonical = rep;
    }
    if (!canonical || !canonical.phone || (!canonical.pgcode && !canonical.nama)) {
      return publicError("INVALID_PARTICIPANT", "Maklumat peserta tidak sah.");
    }

    const attendanceMap = getAttendanceColumnMap(attendanceSheet);
    const missingAttendanceCols = requireColumnMap(attendanceMap, ["timestamp", "name", "phone", "email", "pgcode", "status", "eventId"]);
    if (missingAttendanceCols) return publicError("SHEET_SCHEMA_INVALID", "Schema Kehadiran belum lengkap: " + missingAttendanceCols + ".");
    const existing = attendanceSheet.getDataRange().getDisplayValues();
    for (let i = 1; i < existing.length; i++) {
      const rowEventId = attendanceMap.eventId >= 0 ? safeString(existing[i][attendanceMap.eventId], 80) : "";
      if (rowEventId !== eventId) continue;
      const existingPhone = normalizePhone(existing[i][attendanceMap.phone]);
      const existingPgcode = normalizePgCode(existing[i][attendanceMap.pgcode]);
      if ((canonical.pgcode && existingPgcode === canonical.pgcode) || (canonical.phone && existingPhone === canonical.phone)) {
        return publicError("DUPLICATE_ATTENDANCE", "Anda telah membuat pengesahan kehadiran.");
      }
    }
    const quota = Number(settings.PARTICIPANT_QUOTA || 0);
    if (quota > 0 && countEventAttendanceRows(attendanceSheet, eventId) >= quota) {
      return publicError("QUOTA_FULL", "Kuota kehadiran untuk event ini telah penuh.");
    }

    const timestamp = Utilities.formatDate(now, PROJECT_TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    appendMappedRow(attendanceSheet, attendanceMap, {
      timestamp: timestamp,
      name: canonical.nama,
      phone: canonical.phone,
      email: canonical.email,
      pgcode: canonical.pgcode,
      status: "HADIR",
      eventId: eventId
    });
    return jsonResponse({ success: true, message: settings.SUCCESS_MESSAGE || "Kehadiran berjaya direkodkan." });
  } catch (e) {
    logServerError("submitAttendance", e);
    return publicError("ATTENDANCE_FAILED", "Kehadiran tidak dapat direkodkan.");
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===========================================================================
// PUBLIC — Replacement (self-service)
// ===========================================================================
function submitReplacementPublic(data) {
  const settings = getSettings();
  if (!isFlagEnabled(settings, "SYSTEM_ENABLED", true) || !isFlagEnabled(settings, "REPLACEMENT_ENABLED", true)) {
    return publicError("REPLACEMENT_CLOSED", "Permohonan gantian tidak dibuka.");
  }
  const eventId = getCanonicalEventId(settings);
  if (!eventId) return publicError("EVENT_CONFIG_INVALID", "EVENT_ID belum ditetapkan atau tidak sah.");
  const oldKeyword = normalizeKeyword(data && data.oldKeyword);
  if (!oldKeyword) return publicError("INVALID_KEYWORD", "Maklumat peserta asal tidak sah.");
  const newPersonResult = validatePublicPerson({
    nama: data && data.newNama,
    phone: data && data.newPhone,
    email: data && data.newEmail,
    pgcode: data && data.newPgcode
  });
  if (!newPersonResult.valid) return publicError("INVALID_REPLACEMENT", newPersonResult.message);
  if (!incrementRateLimit(PUBLIC_WRITE_RATE_LIMIT_PREFIX, newPersonResult.person.phone + "_rep", 5, 60 * 60)) {
    return publicError("RATE_LIMITED", "Terlalu banyak permohonan. Sila cuba semula kemudian.");
  }

  const ss = getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) return publicError("LOCK_BUSY", "Sistem sedang sibuk. Sila cuba semula sebentar lagi.");
    const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
    const values = sheet.getDataRange().getDisplayValues();
    let cm;
    try {
      cm = getColumnMap();
    } catch (e) {
      return schemaErrorResponse(e);
    }
    const searchPhone = normalizePhone(oldKeyword);
    const searchPgcode = normalizePgCode(oldKeyword);
    const searchTail = phoneTail(oldKeyword);
    const matches = [];
    const activeIdentifiers = {};

    for (let i = 1; i < values.length; i++) {
      const record = getParticipantRecordFromRow(values[i], cm, i + 1);
      if (!record.nama) continue;
      const rep = getActiveReplacement(record);
      activeIdentifiers[record.phone] = true;
      if (record.pgcode) activeIdentifiers[record.pgcode] = true;
      if (rep) {
        activeIdentifiers[rep.phone] = true;
        if (rep.pgcode) activeIdentifiers[rep.pgcode] = true;
      }
      const exactMatch =
        (searchPgcode && record.pgcode === searchPgcode) ||
        (searchPhone && record.phone === searchPhone) ||
        (!searchPhone && searchTail && record.phone.slice(-7) === searchTail);
      if (exactMatch) matches.push(record);
    }

    if (matches.length !== 1) return publicError("ORIGINAL_NOT_UNIQUE", "Maklumat peserta asal tidak ditemui atau tidak unik.");
    if (activeIdentifiers[newPersonResult.person.phone] || (newPersonResult.person.pgcode && activeIdentifiers[newPersonResult.person.pgcode])) {
      return publicError("REPLACEMENT_CONFLICT", "Maklumat pengganti bertindih dengan peserta aktif lain.");
    }
    const target = matches[0];
    if (target.replacement && target.replacement.approved === false) {
      return publicError("REPLACEMENT_PENDING", "Permohonan gantian sedia ada masih menunggu kelulusan.");
    }
    const repData = {
      nama: newPersonResult.person.nama,
      phone: newPersonResult.person.phone,
      email: newPersonResult.person.email,
      pgcode: newPersonResult.person.pgcode,
      approved: false
    };
    sheet.getRange(target.rowNumber, cm.replacement + 1).setValue(JSON.stringify(repData));
    return jsonResponse({ success: true });
  } catch (e) {
    logServerError("submitReplacementPublic", e);
    return publicError("REPLACEMENT_FAILED", "Permohonan gantian tidak dapat diproses.");
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===========================================================================
// PUBLIC — Wishlist submission
// ===========================================================================
function submitWishlist(data) {
  const settings = getSettings();
  if (!isFlagEnabled(settings, "SYSTEM_ENABLED", true) || !isFlagEnabled(settings, "WISHLIST_ENABLED", true)) {
    return publicError("WISHLIST_CLOSED", "Wishlist tidak dibuka.");
  }
  const eventId = getCanonicalEventId(settings);
  if (!eventId) return publicError("EVENT_CONFIG_INVALID", "EVENT_ID belum ditetapkan atau tidak sah.");
  const personResult = validatePublicPerson(data || {});
  if (!personResult.valid) return publicError("INVALID_WISHLIST", personResult.message);
  const person = personResult.person;
  if (!incrementRateLimit(PUBLIC_WRITE_RATE_LIMIT_PREFIX, person.phone + "_wish", 5, 60 * 60)) {
    return publicError("RATE_LIMITED", "Terlalu banyak permohonan. Sila cuba semula kemudian.");
  }

  const ss = getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) return publicError("LOCK_BUSY", "Sistem sedang sibuk. Sila cuba semula sebentar lagi.");
    const sheet = ss.getSheetByName(WISHLIST_SHEET);
    if (!sheet) return publicError("SHEET_MISSING", "Wishlist sheet tidak tersedia.");
    const map = getWishlistColumnMap(sheet);
    const missingWishlistCols = requireColumnMap(map, ["timestamp", "name", "phone", "email", "pgcode", "eventId"]);
    if (missingWishlistCols) return publicError("SHEET_SCHEMA_INVALID", "Schema Wishlist belum lengkap: " + missingWishlistCols + ".");
    const existing = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < existing.length; i++) {
      const rowEventId = map.eventId >= 0 ? safeString(existing[i][map.eventId], 80) : "";
      if (rowEventId !== eventId) continue;
      const existingPhone = normalizePhone(existing[i][map.phone]);
      const existingPgcode = normalizePgCode(existing[i][map.pgcode]);
      if ((person.phone && existingPhone === person.phone) || (person.pgcode && existingPgcode === person.pgcode)) {
        return publicError("DUPLICATE_WISHLIST", "Maklumat ini telah berada dalam wishlist.");
      }
    }
    const timestamp = Utilities.formatDate(new Date(), PROJECT_TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    appendMappedRow(sheet, map, {
      timestamp: timestamp,
      name: person.nama,
      phone: person.phone,
      email: person.email,
      pgcode: person.pgcode,
      eventId: eventId
    });
    return jsonResponse({ success: true });
  } catch (e) {
    logServerError("submitWishlist", e);
    return publicError("WISHLIST_FAILED", "Wishlist tidak dapat direkodkan.");
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===========================================================================
// ADMIN — WA Status update (token-protected, header-based)
// ===========================================================================
function updateWAStatus(data, token) {
  if (!validateAdminToken(token)) return authRequiredResponse();

  const newStatus = normalizeWaStatus(data && data.newStatus) || "SUDAH";
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getValues();

  let colPhone, colPgcode, colWaStatus;
  try {
    const cm = getColumnMap();
    colPhone = cm.phone;
    colPgcode = cm.pgcode;
    colWaStatus = cm.wastatus;
  } catch (e) {
    return schemaErrorResponse(e);
  }

  let updatedCount = 0;

  if (data.isBulk && Array.isArray(data.list)) {
    const updateMap = {};
    data.list.forEach(item => {
      const pg = normalizePgCode(item && item.pgcode);
      const ph = normalizePhone(item && item.phone);
      if (pg) updateMap[pg] = true;
      if (ph) updateMap[ph] = true;
    });
    for (let i = 1; i < values.length; i++) {
      const rowPg = normalizePgCode(values[i][colPgcode]);
      const rowPh = normalizePhone(values[i][colPhone]);
      if (updateMap[rowPg] || updateMap[rowPh]) {
        sheet.getRange(i + 1, colWaStatus + 1).setValue(newStatus);
        updatedCount++;
      }
    }
    return jsonResponse({ success: true, message: updatedCount + " status berjaya dikemaskini." });
  }

  for (let i = 1; i < values.length; i++) {
    if ((normalizePgCode(data && data.pgcode) && normalizePgCode(values[i][colPgcode]) == normalizePgCode(data.pgcode)) ||
        normalizePhone(values[i][colPhone]) == normalizePhone(data && data.phone)) {
      sheet.getRange(i + 1, colWaStatus + 1).setValue(newStatus);
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Peserta tidak dijumpai." });
}

// ===========================================================================
// ADMIN — Replace participant (token-protected, header-based)
// ===========================================================================
function replaceParticipant(data, token) {
  if (!validateAdminToken(token)) return authRequiredResponse();
  const settings = getSettings();
  if (!isFlagEnabled(settings, "REPLACEMENT_ENABLED", true)) {
    return publicError("REPLACEMENT_CLOSED", "Permohonan gantian tidak dibuka.");
  }
  const eventId = getCanonicalEventId(settings);
  if (!eventId) return publicError("EVENT_CONFIG_INVALID", "EVENT_ID belum ditetapkan atau tidak sah.");
  const newPersonResult = validatePublicPerson({
    nama: data && data.newNama,
    phone: data && data.newPhone,
    email: data && data.newEmail,
    pgcode: data && data.newPgcode
  });
  if (!newPersonResult.valid) return publicError("INVALID_REPLACEMENT", newPersonResult.message);
  const oldPg = normalizePgCode(data && data.oldPgcode);
  const oldPh = normalizePhone(data && data.oldPhone);
  if (!oldPg && !oldPh) return publicError("INVALID_ORIGINAL", "Maklumat peserta asal tidak sah.");

  const ss = getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) return publicError("LOCK_BUSY", "Sistem sedang sibuk. Sila cuba semula sebentar lagi.");
    const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
    const values = sheet.getDataRange().getDisplayValues();
    const cm = getColumnMap();
    const matches = [];
    const activeIdentifiers = {};
    for (let i = 1; i < values.length; i++) {
      const record = getParticipantRecordFromRow(values[i], cm, i + 1);
      if (!record.nama) continue;
      const rep = getActiveReplacement(record);
      activeIdentifiers[record.phone] = true;
      if (record.pgcode) activeIdentifiers[record.pgcode] = true;
      if (rep) {
        activeIdentifiers[rep.phone] = true;
        if (rep.pgcode) activeIdentifiers[rep.pgcode] = true;
      }
      if ((oldPg && record.pgcode === oldPg) || (oldPh && record.phone === oldPh)) matches.push(record);
    }
    if (matches.length !== 1) return publicError("ORIGINAL_NOT_UNIQUE", "Peserta asal tidak ditemui atau tidak unik.");
    const person = newPersonResult.person;
    if (activeIdentifiers[person.phone] || (person.pgcode && activeIdentifiers[person.pgcode])) {
      return publicError("REPLACEMENT_CONFLICT", "Maklumat pengganti bertindih dengan peserta aktif lain.");
    }
    const repData = {
      nama: person.nama, phone: person.phone,
      email: person.email, pgcode: person.pgcode, approved: true
    };
    sheet.getRange(matches[0].rowNumber, cm.replacement + 1).setValue(JSON.stringify(repData));
    sheet.getRange(matches[0].rowNumber, cm.wastatus + 1).setValue("BELUM");
    return jsonResponse({ success: true });
  } catch (e) {
    logServerError("replaceParticipant", e);
    return publicError("REPLACEMENT_FAILED", "Gantian tidak dapat disimpan.");
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===========================================================================
// ADMIN — Handle replacement approval (token-protected, header-based)
// ===========================================================================
function handleApproval(data, token) {
  if (!validateAdminToken(token)) return authRequiredResponse();
  const status = normalizeApprovalStatus(data && data.status);
  if (!status) return publicError("INVALID_STATUS", "Status kelulusan tidak sah.");

  const ss = getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    locked = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!locked) return publicError("LOCK_BUSY", "Sistem sedang sibuk. Sila cuba semula sebentar lagi.");
    const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
    const values = sheet.getDataRange().getValues();
    const cm = getColumnMap();
    const reqPg = normalizePgCode(data && data.pgcode);
    const reqPh = normalizePhone(data && data.phone);
    for (let i = 1; i < values.length; i++) {
      if ((reqPg && normalizePgCode(values[i][cm.pgcode]) == reqPg) || (reqPh && normalizePhone(values[i][cm.phone]) == reqPh)) {
        if (status === "APPROVE") {
          let rep = null;
          try { rep = values[i][cm.replacement] ? JSON.parse(String(values[i][cm.replacement])) : null; } catch (err) { rep = null; }
          const validRep = validatePublicPerson({
            nama: rep && rep.nama,
            phone: rep && rep.phone,
            email: rep && rep.email,
            pgcode: rep && rep.pgcode
          });
          if (!validRep.valid) return publicError("INVALID_REPLACEMENT", "Data gantian tidak lengkap atau rosak.");
          rep = validRep.person;
          rep.approved = true;
          sheet.getRange(i + 1, cm.replacement + 1).setValue(JSON.stringify(rep));
          sheet.getRange(i + 1, cm.wastatus + 1).setValue("BELUM");
        } else if (status === "REJECT") {
          sheet.getRange(i + 1, cm.replacement + 1).setValue("");
        }
        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
  } catch (e) {
    logServerError("handleApproval", e);
    return publicError("APPROVAL_FAILED", "Kelulusan tidak dapat diproses.");
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ===========================================================================
// ADMIN — Dashboard (header-based)
// ===========================================================================
function getDashboard(token) {
  if (!validateAdminToken(token)) return authRequiredResponse();
  let ss;
  try {
    ss = getActiveSpreadsheet();
  } catch (e) {
    return publicError("SPREADSHEET_UNAVAILABLE", "Spreadsheet tidak boleh dibuka atau belum dikonfigurasi.");
  }
  const participantSheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const attendanceSheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const wishlistSheet = ss.getSheetByName(WISHLIST_SHEET);
  if (!participantSheet || !attendanceSheet || !wishlistSheet) {
    return publicError("SHEET_MISSING", "Satu atau lebih sheet wajib tidak ditemui.");
  }
  const settings = getSettings();
  const eventId = getCanonicalEventId(settings);
  if (!eventId) return publicError("EVENT_CONFIG_INVALID", "EVENT_ID belum ditetapkan atau tidak sah.");

  let colName, colPhone, colEmail, colPgcode, colWaStatus, colReplacement;
  try {
    const cm = getColumnMap();
    colName = cm.name;
    colPhone = cm.phone;
    colEmail = cm.email;
    colPgcode = cm.pgcode;
    colWaStatus = cm.wastatus;
    colReplacement = cm.replacement;
  } catch (e) {
    return schemaErrorResponse(e);
  }

  const participants = participantSheet.getDataRange().getDisplayValues();
  const attendanceMapCols = getAttendanceColumnMap(attendanceSheet);
  const missingAttendanceCols = requireColumnMap(attendanceMapCols, ["phone", "pgcode", "eventId"]);
  if (missingAttendanceCols) return publicError("SHEET_SCHEMA_INVALID", "Schema Kehadiran belum lengkap: " + missingAttendanceCols + ".");
  const attendance = attendanceSheet.getDataRange().getDisplayValues();
  let wishlistData = [];
  let wishlistMap = null;
  if (wishlistSheet) {
    wishlistMap = getWishlistColumnMap(wishlistSheet);
    const missingWishlistCols = requireColumnMap(wishlistMap, ["timestamp", "name", "phone", "email", "pgcode", "eventId"]);
    if (missingWishlistCols) return publicError("SHEET_SCHEMA_INVALID", "Schema Wishlist belum lengkap: " + missingWishlistCols + ".");
    wishlistData = wishlistSheet.getDataRange().getDisplayValues();
  }

  const hadirMap = {};
  for (let i = 1; i < attendance.length; i++) {
    const rowEventId = attendanceMapCols.eventId >= 0 ? safeString(attendance[i][attendanceMapCols.eventId], 80) : "";
    if (rowEventId !== eventId) continue;
    const pgcode = normalizePgCode(attendance[i][attendanceMapCols.pgcode]);
    const phone = normalizePhone(attendance[i][attendanceMapCols.phone]);
    if (pgcode) hadirMap["pg:" + pgcode] = true;
    if (phone) hadirMap["ph:" + phone] = true;
  }

  const list = [];
  let hadir = 0;

  for (let i = 1; i < participants.length; i++) {
    const row = participants[i];
    if (!row[colName]) continue;

    const record = getParticipantRecordFromRow(row, { name: colName, phone: colPhone, email: colEmail, pgcode: colPgcode, wastatus: colWaStatus, replacement: colReplacement }, i + 1);
    const activeRep = getActiveReplacement(record);
    const activePgcode = activeRep ? activeRep.pgcode : record.pgcode;
    const activePhone = activeRep ? activeRep.phone : record.phone;
    const status = (activePgcode && hadirMap["pg:" + activePgcode]) || (activePhone && hadirMap["ph:" + activePhone]) ? "HADIR" : "TIDAK HADIR";

    let waStatus = record.waStatus || "BELUM";

    if (status === "HADIR") hadir++;

    list.push({
      nama: record.rawNama, phone: record.phone, email: record.email, pgcode: record.pgcode,
      status: status, waStatus: waStatus, replacement: record.replacement
    });
  }

  const wishlistList = [];
  for (let k = 1; k < wishlistData.length; k++) {
    const rowEventId = wishlistMap && wishlistMap.eventId >= 0 ? safeString(wishlistData[k][wishlistMap.eventId], 80) : "";
    if (rowEventId !== eventId) continue;
    if (wishlistData[k][wishlistMap.name]) {
      wishlistList.push({
        timestamp: wishlistData[k][wishlistMap.timestamp], nama: wishlistData[k][wishlistMap.name],
        phone: normalizePhone(wishlistData[k][wishlistMap.phone]), email: normalizeEmail(wishlistData[k][wishlistMap.email]), pgcode: normalizePgCode(wishlistData[k][wishlistMap.pgcode])
      });
    }
  }

  return jsonResponse({
    success: true, total: list.length, hadir: hadir, tidakHadir: list.length - hadir,
    list: list, wishlist: wishlistList, settings: settings
  });
}
