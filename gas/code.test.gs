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
  "EVENT_NAME", "EVENT_SHORT_NAME", "EVENT_DESCRIPTION",
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
    .replace(/\s+/g, " ")        // collapse multiple spaces
    .replace(/[\r\n]+/g, " ")     // remove line breaks
    .replace(/[:\-–—]+/g, " ")    // normalise common punctuation to space
    .trim()
    .toLowerCase();
}

// ===========================================================================
// HELPER — Participant header-based column mapping (CTO Requirement #1)
// ===========================================================================
function getParticipantColumnMap() {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  if (!sheet) throw new Error("Sheet '" + PARTICIPANT_SHEET + "' not found.");

  const rawHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const headers = rawHeaders.map(h => normalizeHeader(h));

  const logicalFields = {
    NAME:        { aliases: ["nama", "nama penuh", "name", "full name"], found: -1, col: -1 },
    PHONE:       { aliases: ["no telefon", "nombor telefon", "phone", "phone number", "no tel", "telefon"], found: -1, col: -1 },
    EMAIL:       { aliases: ["email", "emel", "e-mail", "e mail"], found: -1, col: -1 },
    PG_CODE:     { aliases: ["pg code", "pgcode", "pg code", "agent code", "agent id", "kod pg"], found: -1, col: -1 },
    WA_STATUS:   { aliases: ["wa status", "whatsapp status", "status wa", "status whatsapp"], found: -1, col: -1 },
    REPLACEMENT: { aliases: ["replacement", "gantian", "pengganti", "replacement data", "data gantian"], found: -1, col: -1 }
  };

  for (const [field, config] of Object.entries(logicalFields)) {
    for (let i = 0; i < headers.length; i++) {
      const normalized = headers[i];
      if (!normalized) continue;
      if (config.aliases.some(alias => normalized === alias || normalized.includes(alias))) {
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
    if (config.found < 0) {
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
  const logicalDefs = {
    NAME:        { aliases: ["nama", "nama penuh", "name", "full name"] },
    PHONE:       { aliases: ["no telefon", "nombor telefon", "phone", "phone number", "no tel", "telefon"] },
    EMAIL:       { aliases: ["email", "emel", "e-mail", "e mail"] },
    PG_CODE:     { aliases: ["pg code", "pgcode", "agent code", "agent id", "kod pg"] },
    WA_STATUS:   { aliases: ["wa status", "whatsapp status", "status wa", "status whatsapp"] },
    REPLACEMENT: { aliases: ["replacement", "gantian", "pengganti", "replacement data", "data gantian"] }
  };

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

    const rawHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const headers = rawHeaders.map(h => normalizeHeader(h));

    const logicalFields = {};
    for (const [field, config] of Object.entries(logicalDefs)) {
      logicalFields[field] = { found: [], aliases: config.aliases };
    }

    // Scan each header column against all logical field definitions
    for (let i = 0; i < headers.length; i++) {
      const normalized = headers[i];
      if (!normalized) continue;

      for (const [field, lf] of Object.entries(logicalFields)) {
        if (lf.aliases.some(alias => normalized === alias || normalized.includes(alias))) {
          lf.found.push({ source: String(rawHeaders[i]).trim(), column: i + 1 });
        }
      }
    }

    // Build findings
    const columnMap = {};

    for (const [field, lf] of Object.entries(logicalFields)) {
      if (lf.found.length === 0) {
        result.missing.push(field);
      } else if (lf.found.length === 1) {
        const f = lf.found[0];
        result.found.push({ logical: field, source: f.source, column: f.column });

        // Build column map (0-indexed for internal use)
        const key = field === "PG_CODE" ? "pgcode" :
                    field === "WA_STATUS" ? "wastatus" : field.toLowerCase();
        columnMap[key] = f.column - 1;
      } else {
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

  const result = { success: true, sheets: {}, columns: null, headerFindings: null, warnings: [], errors: [] };

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
    }

    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty("ADMIN_USERNAME") || !props.getProperty("ADMIN_PASSWORD")) {
      result.warnings.push("ADMIN_USERNAME or ADMIN_PASSWORD not set in Script Properties.");
    }

    // NEVER expose spreadsheet ID, admin details, or internal state

  } catch (e) {
    result.success = false;
    result.errors.push("Setup validation failed: " + e.message.split("\n")[0]);
  }

  if (result.errors.length > 0) result.success = false;
  return jsonResponse(result);
}

// ===========================================================================
// HELPER — JSON response
// ===========================================================================
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===========================================================================
// ROUTING — doGet
// ===========================================================================
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === "search") return searchParticipant(e.parameter.keyword);
    if (action === "dashboard") return getDashboard();
    if (action === "getConfig") return getPublicConfig();
    // validateSetup moved to POST — requires admin token
    return jsonResponse({ success: false, message: "Invalid GET Request" });
  } catch (error) {
    return jsonResponse({ success: false, message: error.toString() });
  }
}

// ===========================================================================
// ROUTING — doPost
// ===========================================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

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

    return jsonResponse({ success: false, message: "Invalid POST Request" });
  } catch (error) {
    return jsonResponse({ success: false, message: error.toString() });
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

  if (!storedUser || !storedPass) {
    return jsonResponse({ success: false, message: "Admin credentials not configured." });
  }

  if (body.username === storedUser && body.password === storedPass) {
    const token = generateToken();
    storeToken(token);
    const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    return jsonResponse({ success: true, token: token, expiresAt: expiresAt });
  }

  return jsonResponse({ success: false, message: "Invalid username or password." });
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
  if (!str.startsWith("https://") && !str.startsWith("http://")) {
    return { valid: false, message: key + " must start with https:// or http://." };
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

    const data = sheet.getRange(1, 1, lastRow, 2).getDisplayValues();
    const settings = {};

    for (let i = 0; i < data.length; i++) {
      const key = String(data[i][0] || "").trim();
      if (!key) continue;
      settings[key] = data[i][1];
    }

    // Compatibility alias: EVENT_TIME ↔ EVENT_START_TIME
    if (settings.EVENT_TIME && !settings.EVENT_START_TIME) {
      settings.EVENT_START_TIME = settings.EVENT_TIME;
    }
    if (settings.EVENT_START_TIME && !settings.EVENT_TIME) {
      settings.EVENT_TIME = settings.EVENT_START_TIME;
    }

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

  try {
    const ss = getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SETTINGS_SHEET);
    if (!sheet) return jsonResponse({ success: false, message: "Settings sheet not found." });

    // 2. Determine settings to save
    let settingsToSave = {};

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

    for (const [rawKey, value] of Object.entries(settingsToSave)) {
      const key = rawKey.toUpperCase();

      // Resolve legacy alias
      let canonicalKey = key;
      if (key === "EVENT_TIME" || key === "EVENTTIME") {
        canonicalKey = "EVENT_START_TIME";
      }

      // Whitelist check
      if (!SETTINGS_KEYS_SET.has(canonicalKey)) {
        rejected.push({ key: rawKey, reason: "Not an approved setting." });
        continue;
      }

      const strValue = String(value);

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
      }

      if (!typeValid) continue;

      validated[canonicalKey] = strValue;
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
    if (lastRow >= 1) {
      const keyData = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (let i = 0; i < keyData.length; i++) {
        const k = String(keyData[i][0] || "").trim();
        if (k) existingKeys.set(k, i + 1);
      }
    }

    // 5. Write — update existing, append new
    let updated = 0;
    let appended = 0;
    for (const [key, value] of Object.entries(validated)) {
      if (existingKeys.has(key)) {
        sheet.getRange(existingKeys.get(key), 2).setValue(value);
        updated++;
      } else {
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1).setValue(key);
        sheet.getRange(newRow, 2).setValue(value);
        existingKeys.set(key, newRow);
        appended++;
      }
    }

    // 6. Write EVENT_TIME alias for backward compat (only if EVENT_START_TIME was saved)
    if (validated.EVENT_START_TIME) {
      if (existingKeys.has("EVENT_TIME")) {
        sheet.getRange(existingKeys.get("EVENT_TIME"), 2).setValue(validated.EVENT_START_TIME);
      } else {
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1).setValue("EVENT_TIME");
        sheet.getRange(newRow, 2).setValue(validated.EVENT_START_TIME);
      }
    }

    const response = {
      success: true,
      message: updated + " setting(s) updated, " + appended + " setting(s) added."
    };
    if (rejected.length > 0) response.rejected = rejected;
    return jsonResponse(response);

  } catch (e) {
    return jsonResponse({ success: false, message: "saveSettings error: " + e.message.split("\n")[0] });
  }
}

// ===========================================================================
// CONFIG — Public config
// ===========================================================================
function getPublicConfig() {
  try {
    return jsonResponse({ success: true, settings: getSettings() });
  } catch (e) {
    return jsonResponse({ success: false, message: "Config temporarily unavailable." });
  }
}

// ===========================================================================
// TIMING — Event timing helper
// ===========================================================================
function getEventTiming() {
  const settings = getSettings();
  const eventDate = settings.EVENT_DATE;
  const eventTime = settings.EVENT_START_TIME || settings.EVENT_TIME;
  const openBeforeHours = Number(settings.OPEN_BEFORE_HOURS) || 5;

  if (!eventDate || !eventTime || eventDate.trim() === "" || eventTime.trim() === "") return null;

  const eventDateTime = new Date(eventDate + "T" + eventTime + ":00");
  const attendanceStart = new Date(eventDateTime.getTime() - (openBeforeHours * 60 * 60 * 1000));
  const attendanceClose = new Date(eventDateTime.getTime() + (2 * 60 * 60 * 1000));
  return { attendanceStart, attendanceClose };
}

// ===========================================================================
// PUBLIC — Participant search (header-based)
// ===========================================================================
function searchParticipant(keyword) {
  if (!keyword) return jsonResponse({ success: false, message: "Sila masukkan carian." });

  const timing = getEventTiming();
  let attendanceOpen = false;
  let attendanceStartDisplay = "Belum Ditetapkan";

  if (timing) {
    const { attendanceStart, attendanceClose } = timing;
    const now = new Date();
    attendanceOpen = (now >= attendanceStart && now <= attendanceClose);
    attendanceStartDisplay = Utilities.formatDate(attendanceStart, "Asia/Kuala_Lumpur", "dd/MM/yyyy, hh:mm a");
  }

  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const data = sheet.getDataRange().getDisplayValues();
  const results = [];
  const lowerKeyword = String(keyword).toLowerCase();

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
    return jsonResponse({ success: false, message: "System configuration error. Contact administrator." });
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const origNama = String(row[colName] || "").trim();
    const origPhone = String(row[colPhone] || "").trim();
    const origEmail = String(row[colEmail] || "").trim();
    const origPgcode = String(row[colPgcode] || "").trim();
    if (!origNama) continue;

    let hasReplacement = false;
    let repNama = "", repPhone = "", repEmail = "", repPgcode = "";

    if (row.length > colReplacement && row[colReplacement]) {
      try {
        const rep = JSON.parse(String(row[colReplacement]));
        if (rep && rep.approved !== false) {
          hasReplacement = true;
          repNama = String(rep.nama).trim();
          repPhone = String(rep.phone).trim();
          repEmail = String(rep.email).trim();
          repPgcode = String(rep.pgcode).trim();
        }
      } catch (e) { }
    }

    const matchOrig = origNama.toLowerCase().includes(lowerKeyword) || origPhone.includes(keyword) || origEmail.toLowerCase().includes(lowerKeyword) || origPgcode.toLowerCase().includes(lowerKeyword);
    const matchRep = hasReplacement && (repNama.toLowerCase().includes(lowerKeyword) || repPhone.includes(keyword) || repEmail.toLowerCase().includes(lowerKeyword) || repPgcode.toLowerCase().includes(lowerKeyword));

    if (matchOrig) {
      results.push({
        nama: origNama, phone: origPhone, email: origEmail, pgcode: origPgcode,
        type: hasReplacement ? 'REPLACED' : 'NORMAL',
        relativeName: hasReplacement ? repNama : '',
        attendanceOpen: hasReplacement ? false : attendanceOpen,
        attendanceStartDisplay: attendanceStartDisplay
      });
    }
    if (matchRep) {
      results.push({
        nama: repNama, phone: repPhone, email: repEmail, pgcode: repPgcode,
        type: 'REPLACEMENT',
        relativeName: origNama,
        attendanceOpen: attendanceOpen,
        attendanceStartDisplay: attendanceStartDisplay
      });
    }
  }

  if (results.length === 0) return jsonResponse({ success: false, message: "Peserta tidak dijumpai." });
  return jsonResponse({ success: true, data: results });
}

// ===========================================================================
// PUBLIC — Attendance submission
// ===========================================================================
function submitAttendance(data) {
  const timing = getEventTiming();
  const now = new Date();

  if (!timing) return jsonResponse({ success: false, message: "Pengesahan kehadiran belum dibuka." });
  const { attendanceStart, attendanceClose } = timing;
  if (now < attendanceStart || now > attendanceClose) {
    return jsonResponse({ success: false, message: "Pengesahan kehadiran belum dibuka atau telah ditutup." });
  }

  const ss = getActiveSpreadsheet();
  const attendanceSheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const existing = attendanceSheet.getDataRange().getValues();

  for (let i = 1; i < existing.length; i++) {
    if (existing[i][4] == data.pgcode || existing[i][2] == data.phone) {
      return jsonResponse({ success: false, message: "Anda telah membuat pengesahan kehadiran." });
    }
  }

  const timestamp = Utilities.formatDate(now, "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm:ss");
  attendanceSheet.appendRow([timestamp, data.nama, data.phone, data.email, data.pgcode, "HADIR"]);
  return jsonResponse({ success: true, message: "Kehadiran berjaya direkodkan." });
}

// ===========================================================================
// PUBLIC — Replacement (self-service)
// ===========================================================================
function submitReplacementPublic(data) {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  const searchKey = String(data.oldKeyword).toLowerCase().trim();

  let colName, colPhone, colPgcode, colReplacement;
  try {
    const cm = getColumnMap();
    colName = cm.name;
    colPhone = cm.phone;
    colPgcode = cm.pgcode;
    colReplacement = cm.replacement;
  } catch (e) {
    return jsonResponse({ success: false, message: "Configuration error." });
  }

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colPhone] || "").includes(searchKey) ||
        String(values[i][colPgcode] || "").toLowerCase() === searchKey ||
        String(values[i][colName] || "").toLowerCase().includes(searchKey)) {
      const repData = {
        nama: data.newNama.trim(), phone: data.newPhone.trim(),
        email: data.newEmail.trim(), pgcode: data.newPgcode.trim(),
        approved: false
      };
      sheet.getRange(i + 1, colReplacement + 1).setValue(JSON.stringify(repData));
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Maklumat peserta asal tidak dijumpai." });
}

// ===========================================================================
// PUBLIC — Wishlist submission
// ===========================================================================
function submitWishlist(data) {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WISHLIST_SHEET);
  const timestamp = Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([timestamp, data.nama.trim(), data.phone.trim(), data.email.trim(), data.pgcode.trim()]);
  return jsonResponse({ success: true });
}

// ===========================================================================
// ADMIN — WA Status update (token-protected, header-based)
// ===========================================================================
function updateWAStatus(data, token) {
  if (!validateAdminToken(token)) return authRequiredResponse();

  const newStatus = data.newStatus || "SUDAH";
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
    return jsonResponse({ success: false, message: "Configuration error." });
  }

  let updatedCount = 0;

  if (data.isBulk && Array.isArray(data.list)) {
    const updateMap = {};
    data.list.forEach(item => {
      if (item.pgcode) updateMap[item.pgcode] = true;
      if (item.phone) updateMap[item.phone] = true;
    });
    for (let i = 1; i < values.length; i++) {
      if (updateMap[values[i][colPgcode]] || updateMap[values[i][colPhone]]) {
        sheet.getRange(i + 1, colWaStatus + 1).setValue(newStatus);
        updatedCount++;
      }
    }
    return jsonResponse({ success: true, message: updatedCount + " status berjaya dikemaskini." });
  }

  for (let i = 1; i < values.length; i++) {
    if ((data.pgcode && values[i][colPgcode] == data.pgcode) || values[i][colPhone] == data.phone) {
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

  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getValues();

  let colPhone, colPgcode, colWaStatus, colReplacement;
  try {
    const cm = getColumnMap();
    colPhone = cm.phone;
    colPgcode = cm.pgcode;
    colWaStatus = cm.wastatus;
    colReplacement = cm.replacement;
  } catch (e) {
    return jsonResponse({ success: false, message: "Configuration error." });
  }

  for (let i = 1; i < values.length; i++) {
    if ((data.oldPgcode && values[i][colPgcode] == data.oldPgcode) || values[i][colPhone] == data.oldPhone) {
      const repData = {
        nama: data.newNama, phone: data.newPhone,
        email: data.newEmail, pgcode: data.newPgcode, approved: true
      };
      sheet.getRange(i + 1, colReplacement + 1).setValue(JSON.stringify(repData));
      sheet.getRange(i + 1, colWaStatus + 1).setValue("BELUM");
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Peserta asal tidak dijumpai." });
}

// ===========================================================================
// ADMIN — Handle replacement approval (token-protected, header-based)
// ===========================================================================
function handleApproval(data, token) {
  if (!validateAdminToken(token)) return authRequiredResponse();

  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getValues();

  let colPhone, colPgcode, colWaStatus, colReplacement;
  try {
    const cm = getColumnMap();
    colPhone = cm.phone;
    colPgcode = cm.pgcode;
    colWaStatus = cm.wastatus;
    colReplacement = cm.replacement;
  } catch (e) {
    return jsonResponse({ success: false, message: "Configuration error." });
  }

  for (let i = 1; i < values.length; i++) {
    if ((data.pgcode && values[i][colPgcode] == data.pgcode) || values[i][colPhone] == data.phone) {
      if (data.status === "APPROVE") {
        let rep = JSON.parse(values[i][colReplacement]);
        rep.approved = true;
        sheet.getRange(i + 1, colReplacement + 1).setValue(JSON.stringify(rep));
        sheet.getRange(i + 1, colWaStatus + 1).setValue("BELUM");
      } else if (data.status === "REJECT") {
        sheet.getRange(i + 1, colReplacement + 1).setValue("");
      }
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
}

// ===========================================================================
// ADMIN — Dashboard (header-based)
// ===========================================================================
function getDashboard() {
  const ss = getActiveSpreadsheet();
  const participantSheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const attendanceSheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const wishlistSheet = ss.getSheetByName(WISHLIST_SHEET);

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
    return jsonResponse({ success: false, message: "Configuration error." });
  }

  const participants = participantSheet.getDataRange().getValues();
  const attendance = attendanceSheet.getDataRange().getValues();
  let wishlistData = [];
  if (wishlistSheet) wishlistData = wishlistSheet.getDataRange().getDisplayValues();

  const hadirMap = {};
  for (let i = 1; i < attendance.length; i++) {
    const pgcode = attendance[i][4];
    if (pgcode) hadirMap[pgcode] = true;
  }

  const list = [];
  let hadir = 0;

  for (let i = 1; i < participants.length; i++) {
    const row = participants[i];
    if (!row[colName]) continue;

    let replacement = null;
    if (row.length > colReplacement && row[colReplacement]) {
      try { replacement = JSON.parse(String(row[colReplacement])); } catch (e) { }
    }

    const activePgcode = replacement && replacement.approved !== false ? replacement.pgcode : row[colPgcode];
    const status = hadirMap[activePgcode] ? "HADIR" : "TIDAK HADIR";

    let waStatus = row[colWaStatus] ? String(row[colWaStatus]).trim().toUpperCase() : "BELUM";
    if (waStatus === "TERHANTAR") waStatus = "SUDAH";
    if (waStatus === "TIADA WA") waStatus = "ERROR";
    if (!["BELUM", "SUDAH", "ERROR"].includes(waStatus)) waStatus = "BELUM";

    if (status === "HADIR") hadir++;

    list.push({
      nama: row[colName], phone: row[colPhone], email: row[colEmail], pgcode: row[colPgcode],
      status: status, waStatus: waStatus, replacement: replacement
    });
  }

  const wishlistList = [];
  for (let k = 1; k < wishlistData.length; k++) {
    if (wishlistData[k][1]) {
      wishlistList.push({
        timestamp: wishlistData[k][0], nama: wishlistData[k][1],
        phone: wishlistData[k][2], email: wishlistData[k][3], pgcode: wishlistData[k][4]
      });
    }
  }

  return jsonResponse({
    success: true, total: list.length, hadir: hadir, tidakHadir: list.length - hadir,
    list: list, wishlist: wishlistList, settings: getSettings()
  });
}
