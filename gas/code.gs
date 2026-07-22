const SHEET_ID = "1bR6V_w1E0e6Kwyf8lwwznXE_f88ZJ3yyonF6BhI-AMQ";
const PARTICIPANT_SHEET = "Form_Responses";
const ATTENDANCE_SHEET = "Kehadiran";
const SETTINGS_SHEET = "Settings";
const WISHLIST_SHEET = "Wishlist";

// =====================================================
// ROUTING SYSTEM: GET & POST
// =====================================================
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === "search") return searchParticipant(e.parameter.keyword);
    if (action === "dashboard") return getDashboard();
    if (action === "getConfig") return getPublicConfig(); 
    return jsonResponse({ success: false, message: "Invalid Request" });
  } catch (error) {
    return jsonResponse({ success: false, message: error.toString() });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === "attendance") return submitAttendance(body.data);
    if (body.action === "adminLogin") return adminLogin(body);
    if (body.action === "saveSettings") return saveSettings(body);
    if (body.action === "updateWAStatus") return updateWAStatus(body.data);
    if (body.action === "replaceParticipant") return replaceParticipant(body.data);
    if (body.action === "submitWishlist") return submitWishlist(body.data); 
    if (body.action === "submitReplacementPublic") return submitReplacementPublic(body.data); 
    if (body.action === "handleApproval") return handleApproval(body.data); 
    
    return jsonResponse({ success: false, message: "Invalid POST Request" });
  } catch (error) {
    return jsonResponse({ success: false, message: error.toString() });
  }
}

// =====================================================
// HELPER FUNCTIONS: SETTINGS & TIMING
// =====================================================
function getSettings() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SETTINGS_SHEET);
  const data = sheet.getRange("A1:B3").getDisplayValues(); 
  const settings = {};
  data.forEach(row => { if (row[0]) settings[row[0]] = row[1]; });
  return settings;
}

function getEventTiming() {
  const settings = getSettings();
  const eventDate = settings.EVENT_DATE; 
  const eventTime = settings.EVENT_TIME; 
  const openBeforeHours = Number(settings.OPEN_BEFORE_HOURS) || 5;

  if (!eventDate || !eventTime || eventDate.trim() === "" || eventTime.trim() === "") return null;

  const eventDateTime = new Date(`${eventDate}T${eventTime}:00`);
  const attendanceStart = new Date(eventDateTime.getTime() - (openBeforeHours * 60 * 60 * 1000));
  const attendanceClose = new Date(eventDateTime.getTime() + (2 * 60 * 60 * 1000)); 
  return { attendanceStart, attendanceClose };
}

function getPublicConfig() {
  return jsonResponse({ success: true, settings: getSettings() });
}

// =====================================================
// FUNGSI CARIAN PINTAR (LAMA & BARU)
// =====================================================
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

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PARTICIPANT_SHEET);
  const data = sheet.getDataRange().getDisplayValues(); 
  const results = [];
  const lowerKeyword = String(keyword).toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    const origNama = String(row[1]).trim();
    const origPhone = String(row[2]).trim();
    const origEmail = String(row[3]).trim();
    const origPgcode = String(row[4]).trim();
    if (!origNama) continue;

    let hasReplacement = false;
    let repNama = "", repPhone = "", repEmail = "", repPgcode = "";

    // Semak jika ada gantian yang TIDAK DITOLAK (Lama & Baru Lulus)
    if (row.length > 6 && row[6]) {
      try {
        const rep = JSON.parse(String(row[6]));
        // PERUBAHAN DI SINI: !== false
        if (rep && rep.approved !== false) {
          hasReplacement = true;
          repNama = String(rep.nama).trim();
          repPhone = String(rep.phone).trim();
          repEmail = String(rep.email).trim();
          repPgcode = String(rep.pgcode).trim();
        }
      } catch(e) {}
    }

    // Tentukan adakah carian padan dengan A (Lama) atau B (Baru)
    const matchOrig = origNama.toLowerCase().includes(lowerKeyword) || origPhone.includes(keyword) || origEmail.toLowerCase().includes(lowerKeyword) || origPgcode.toLowerCase().includes(lowerKeyword);
    const matchRep = hasReplacement && (repNama.toLowerCase().includes(lowerKeyword) || repPhone.includes(keyword) || repEmail.toLowerCase().includes(lowerKeyword) || repPgcode.toLowerCase().includes(lowerKeyword));

    // JIKA PADAN DENGAN PESERTA LAMA (A)
    if (matchOrig) {
      results.push({
        nama: origNama, phone: origPhone, email: origEmail, pgcode: origPgcode,
        type: hasReplacement ? 'REPLACED' : 'NORMAL', // Tanda jika dia dah diganti
        relativeName: hasReplacement ? repNama : '',  // Simpan nama si B
        attendanceOpen: hasReplacement ? false : attendanceOpen, // Kalau dah diganti, tutup butang Hadir
        attendanceStartDisplay: attendanceStartDisplay
      });
    }

    // JIKA PADAN DENGAN PESERTA BARU (B)
    if (matchRep) {
      results.push({
        nama: repNama, phone: repPhone, email: repEmail, pgcode: repPgcode,
        type: 'REPLACEMENT', // Tanda dia adalah pengganti
        relativeName: origNama, // Simpan nama si A
        attendanceOpen: attendanceOpen,
        attendanceStartDisplay: attendanceStartDisplay
      });
    }
  }

  if (results.length === 0) return jsonResponse({ success: false, message: "Peserta tidak dijumpai." });
  return jsonResponse({ success: true, data: results });
}

function submitAttendance(data) {
  const timing = getEventTiming();
  const now = new Date();

  if (!timing) return jsonResponse({ success: false, message: "Pengesahan kehadiran belum dibuka." });
  const { attendanceStart, attendanceClose } = timing;
  if (now < attendanceStart || now > attendanceClose) return jsonResponse({ success: false, message: "Pengesahan kehadiran belum dibuka atau telah ditutup." });

  const attendanceSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ATTENDANCE_SHEET);
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

function submitReplacementPublic(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getDisplayValues();
  const searchKey = String(data.oldKeyword).toLowerCase().trim();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][2].includes(searchKey) || values[i][4].toLowerCase() === searchKey || values[i][1].toLowerCase().includes(searchKey)) {
      
      const repData = {
        nama: data.newNama.trim(),
        phone: data.newPhone.trim(),
        email: data.newEmail.trim(),
        pgcode: data.newPgcode.trim(),
        approved: false 
      };
      
      sheet.getRange(i + 1, 7).setValue(JSON.stringify(repData)); 
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Maklumat peserta asal tidak dijumpai." });
}

function submitWishlist(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(WISHLIST_SHEET);
  const timestamp = Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([timestamp, data.nama.trim(), data.phone.trim(), data.email.trim(), data.pgcode.trim()]);
  return jsonResponse({ success: true });
}

// =====================================================
// ADMIN PANEL ENGINE & BACKOFFICE CONTROLLER
// =====================================================
function adminLogin(body) {
  const props = PropertiesService.getScriptProperties();
  if (body.username === props.getProperty("ADMIN_USERNAME") && body.password === props.getProperty("ADMIN_PASSWORD")) {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: false });
}

function saveSettings(body) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SETTINGS_SHEET);
  sheet.getRange("A1").setValue("EVENT_DATE");
  sheet.getRange("B1").setValue(`'${body.eventDate}`);
  sheet.getRange("A2").setValue("EVENT_TIME");
  sheet.getRange("B2").setValue(`'${body.eventTime}`);
  sheet.getRange("A3").setValue("OPEN_BEFORE_HOURS");
  sheet.getRange("B3").setValue(body.openBeforeHours);
  return jsonResponse({ success: true });
}

function updateWAStatus(data) {
  const newStatus = data.newStatus || "SUDAH"; 
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getValues();
  let updatedCount = 0;

  if (data.isBulk && Array.isArray(data.list)) {
    const updateMap = {};
    data.list.forEach(item => {
      if (item.pgcode) updateMap[item.pgcode] = true;
      if (item.phone) updateMap[item.phone] = true;
    });
    for (let i = 1; i < values.length; i++) {
      if (updateMap[values[i][4]] || updateMap[values[i][2]]) {
        sheet.getRange(i + 1, 6).setValue(newStatus);
        updatedCount++;
      }
    }
    return jsonResponse({ success: true, message: `${updatedCount} status berjaya dikemaskini.` });
  }

  for (let i = 1; i < values.length; i++) {
    if ((data.pgcode && values[i][4] == data.pgcode) || values[i][2] == data.phone) {
      sheet.getRange(i + 1, 6).setValue(newStatus); 
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Peserta tidak dijumpai." });
}

function replaceParticipant(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if ((data.oldPgcode && values[i][4] == data.oldPgcode) || values[i][2] == data.oldPhone) {
      const repData = { nama: data.newNama, phone: data.newPhone, email: data.newEmail, pgcode: data.newPgcode, approved: true };
      sheet.getRange(i + 1, 7).setValue(JSON.stringify(repData));
      sheet.getRange(i + 1, 6).setValue("BELUM");
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Peserta asal tidak dijumpai." });
}

function handleApproval(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PARTICIPANT_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if ((data.pgcode && values[i][4] == data.pgcode) || values[i][2] == data.phone) {
      if (data.status === "APPROVE") {
        let rep = JSON.parse(values[i][6]);
        rep.approved = true; 
        sheet.getRange(i + 1, 7).setValue(JSON.stringify(rep));
        sheet.getRange(i + 1, 6).setValue("BELUM"); 
      } else if (data.status === "REJECT") {
        sheet.getRange(i + 1, 7).setValue(""); 
      }
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, message: "Rekod tidak dijumpai." });
}

function getDashboard() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const participantSheet = ss.getSheetByName(PARTICIPANT_SHEET);
  const attendanceSheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const wishlistSheet = ss.getSheetByName(WISHLIST_SHEET);

  const participants = participantSheet.getDataRange().getValues();
  const attendance = attendanceSheet.getDataRange().getValues();
  let wishlistData = [];
  if (wishlistSheet) wishlistData = wishlistSheet.getDataRange().getDisplayValues();

  const hadirMap = {};
  for (let i = 1; i < attendance.length; i++) {
    const pgcode = attendance[i][4];
    if(pgcode) hadirMap[pgcode] = true;
  }

  const list = [];
  let hadir = 0;

  for (let i = 1; i < participants.length; i++) {
    const row = participants[i];
    if (!row[1]) continue; 

    let replacement = null;
    if (row.length > 6 && row[6]) {
      try { replacement = JSON.parse(String(row[6])); } catch(e) {}
    }

    // LOGIK BARU: Baca semua rekod selagi ia tidak ditolak (false)
    const activePgcode = replacement && replacement.approved !== false ? replacement.pgcode : row[4];
    const status = hadirMap[activePgcode] ? "HADIR" : "TIDAK HADIR";
    
    let waStatus = row[5] ? String(row[5]).trim().toUpperCase() : "BELUM"; 
    if (waStatus === "TERHANTAR") waStatus = "SUDAH";
    if (waStatus === "TIADA WA") waStatus = "ERROR";
    if (!["BELUM", "SUDAH", "ERROR"].includes(waStatus)) waStatus = "BELUM";

    if (status === "HADIR") hadir++;

    list.push({
      nama: row[1], phone: row[2], email: row[3], pgcode: row[4],
      status: status, waStatus: waStatus, replacement: replacement
    });
  }

  const wishlistList = [];
  for (let k = 1; k < wishlistData.length; k++) {
    if(wishlistData[k][1]) {
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

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}