    // TEST GAS URL (tukar balik ke production selepas ujian)
    const API_URL = "https://script.google.com/macros/s/AKfycbynTH21RMJr1snG0guq_AWmmJCtt5Zitncm18vbIc5vIBmeoWy0IEgkhOI-AJ0md2AqYw/exec";
    // PRODUCTION: https://script.google.com/macros/s/AKfycbw...DWSZ/exec 

    function switchPage(pageId) {
      document.querySelectorAll('.page-section').forEach(page => page.classList.add('hidden'));
      document.getElementById(pageId).classList.remove('hidden');
    }

    // Fungsi navigasi halaman depan awam
    function switchFrontTab(tabId) {
      document.querySelectorAll('.front-content').forEach(tab => tab.classList.add('hidden'));
      document.getElementById(tabId).classList.remove('hidden');
      
      // Kemaskini warna butang aktif
      document.querySelectorAll('[id^="btn-"]').forEach(btn => {
        btn.className = "flex-1 text-center py-3 font-bold text-sm rounded-xl transition text-slate-600 hover:text-slate-900";
      });
      document.getElementById('btn-' + tabId).className = "flex-1 text-center py-3 font-bold text-sm rounded-xl transition bg-white text-slate-900 shadow-sm";
    }

    // ================= FUNGSI PAPARAN CARIAN AWAM (DIKEMASKINI) =================
    async function searchParticipant() {
      const keyword = document.getElementById("searchInput").value.trim();
      if (!keyword) return Swal.fire("Oops", "Sila masukkan maklumat carian", "warning");

      Swal.fire({ title: 'Semak Peserta...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const response = await fetch(`${API_URL}?action=search&keyword=${encodeURIComponent(keyword)}`);
        const data = await response.json(); 
        Swal.close();

        // ------------------------------------------------------------------
        // LOGIK 1: JIKA TIADA NAMA & KUOTA PENUH (AUTO-PROMPT WISHLIST)
        // ------------------------------------------------------------------
        if (!data.success) {
          const confirmWishlist = await Swal.fire({
            title: 'Harap Maaf, Kuota Penuh!',
            html: '<p class="text-sm">Rekod anda tidak dijumpai dan tempat duduk BootCamp telah penuh.</p><br><p class="text-sm font-bold text-slate-800">Adakah anda ingin memasukkan nama ke dalam Senarai Menunggu (Wishlist)?</p>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d4a017', // Warna Gold
            cancelButtonColor: '#64748b', // Warna Kelabu
            confirmButtonText: 'Ya, Setuju',
            cancelButtonText: 'Tutup'
          });

          // Jika klik 'Ya, Setuju', auto-buka tab Wishlist
          if (confirmWishlist.isConfirmed) {
            switchFrontTab('wishlist-tab');
          }
          return; // Hentikan fungsi di sini
        }

        // ------------------------------------------------------------------
        // LOGIK 2: JIKA NAMA DIJUMPAI (PAPAR BUTANG HADIR & WA GROUP)
        // ------------------------------------------------------------------
        const container = document.getElementById("participantResult"); 
        container.innerHTML = "";
        
        // Link WhatsApp Group yang Tuan berikan
        const waLink = "https://chat.whatsapp.com/IDHqogXTdvkCdd3XvTOg5e"; 

        data.data.forEach(participant => {
          let statusTag = "";
          let actionHTML = "";

          // Semak Status Pengganti
          if (participant.type === 'REPLACED') {
            statusTag = `<div class="bg-red-50 text-red-700 text-xs font-bold px-3 py-2 rounded-lg mb-3 inline-block border border-red-200 shadow-sm">❌ Slot ini telah diganti oleh: ${participant.relativeName}</div>`;
            actionHTML = `<div class="mt-4 bg-slate-100 text-slate-500 p-4 rounded-2xl text-sm font-semibold text-center border border-slate-200">Kehadiran untuk nama ini telah ditutup kerana slot telah diserahkan.</div>`;
          } else {
            if (participant.type === 'REPLACEMENT') {
              statusTag = `<div class="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-2 rounded-lg mb-3 inline-block border border-blue-200 shadow-sm">✅ Peserta Pengganti kepada: ${participant.relativeName}</div>`;
            }

            // UI Butang Hadir
            let btnHadir = participant.attendanceOpen 
              ? `<button onclick='submitAttendance(${JSON.stringify(participant)})' class="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-green-700 transition">SAYA HADIR</button>`
              : `<div class="bg-yellow-100 border border-yellow-400 text-yellow-800 p-3 rounded-xl text-xs font-semibold text-center mb-2">Daftar Kehadiran mulai dibuka<br>pada: <b>${participant.attendanceStartDisplay}</b></div>`;

            // UI Butang WhatsApp
            let btnWA = `<a href="${waLink}" target="_blank" class="w-full block text-center bg-slate-900 text-white py-3 rounded-xl font-bold shadow-md hover:bg-slate-800 transition mt-2">Untuk Update Terkini,<br>sertai Group WhatsApp 💬</a>`;

            // Gabungkan kedua-dua butang
            actionHTML = `<div class="mt-4">${btnHadir}${btnWA}</div>`;
          }

          container.innerHTML += `
            <div class="bg-white border-2 border-slate-100 rounded-2xl p-5 mb-4 shadow-md mt-4">
              ${statusTag}
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div class="col-span-2 border-b pb-2"><p class="text-xs text-slate-400 font-bold uppercase">Nama Penuh</p><p class="font-bold text-slate-800 text-base">${participant.nama}</p></div>
                <div><p class="text-xs text-slate-400 font-bold uppercase">No Telefon</p><p class="font-semibold text-slate-700">${participant.phone}</p></div>
                <div><p class="text-xs text-slate-400 font-bold uppercase">PG Code</p><p class="font-semibold text-slate-700">${participant.pgcode || '-'}</p></div>
              </div>
              ${actionHTML}
            </div>`;
        });
        container.classList.remove("hidden");
      } catch (error) { Swal.fire("Error", error.message, "error"); }
    }

    async function submitAttendance(participant) {
      Swal.fire({ title: 'Submit Kehadiran...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const response = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "attendance", data: participant }) });
        const result = await response.json(); Swal.close();
        if (!result.success) return Swal.fire("Oops", result.message, "warning");
        switchPage('successPage');
      } catch (error) { Swal.fire("Error", error.message, "error"); }
    }

    // ================= NEW: SUBMIT REPLACEMENT (PUBLIC) =================
    async function submitPublicReplacement() {
      const oldKeyword = document.getElementById("repOldKeyword").value.trim();
      const newNama = document.getElementById("repNewNama").value.trim();
      const newPhone = document.getElementById("repNewPhone").value.trim();
      const newEmail = document.getElementById("repNewEmail").value.trim();
      const newPgcode = document.getElementById("repNewPgcode").value.trim();

      if (!oldKeyword || !newNama || !newPhone) {
        return Swal.fire("Isi Maklumat", "No HP Asal, Nama Baru, dan No HP Baru wajib diisi!", "warning");
      }

      Swal.fire({ title: 'Memproses Gantian...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "submitReplacementPublic", data: { oldKeyword, newNama, newPhone, newEmail, newPgcode } })
        });
        const result = await response.json(); Swal.close();

        if (result.success) {
          await Swal.fire("Berjaya!", "Gantian nama anda telah selamat disimpan dalam sistem. Pengganti boleh menyemak nama mereka di tab semakan.", "success");
          document.getElementById("repOldKeyword").value = "";
          document.getElementById("repNewNama").value = "";
          document.getElementById("repNewPhone").value = "";
          document.getElementById("repNewEmail").value = "";
          document.getElementById("repNewPgcode").value = "";
          switchFrontTab('search-tab');
        } else {
          Swal.fire("Gagal", result.message, "error");
        }
      } catch (e) { Swal.fire("Error", e.message, "error"); }
    }

    // ================= NEW: SUBMIT WISHLIST (PUBLIC) =================
    async function submitPublicWishlist() {
      const nama = document.getElementById("wishNama").value.trim();
      const phone = document.getElementById("wishPhone").value.trim();
      const email = document.getElementById("wishEmail").value.trim();
      const pgcode = document.getElementById("wishPgcode").value.trim();

      if (!nama || !phone) return Swal.fire("Isi Borang", "Nama dan No. Telefon wajib diisi!", "warning");

      Swal.fire({ title: 'Merekod Wishlist...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "submitWishlist", data: { nama, phone, email, pgcode } })
        });
        const result = await response.json(); Swal.close();

        if (result.success) {
          Swal.fire("Terima Kasih!", "Nama anda telah selamat dimasukkan ke dalam Senarai Wishlist. AJK akan menghantar WhatsApp jemputan jika ada kekosongan slot.", "success");
          document.getElementById("wishNama").value = "";
          document.getElementById("wishPhone").value = "";
          document.getElementById("wishEmail").value = "";
          document.getElementById("wishPgcode").value = "";
        } else {
          Swal.fire("Gagal", "Sistem gagal merekod wishlist.", "error");
        }
      } catch (e) { Swal.fire("Error", e.message, "error"); }
    }

    // ================= ADMIN LOGIN (DIKEMASKINI) =================
    function showAdminLogin() { switchPage('adminLoginPage'); }
    
    async function loginAdmin() {
      const username = document.getElementById("adminUsername").value.trim();
      const password = document.getElementById("adminPassword").value.trim();
      
      // Semak jika kotak dibiarkan kosong
      if (!username || !password) {
        return Swal.fire("Maklumat Tidak Lengkap", "Sila masukkan Username dan Password.", "warning");
      }

      Swal.fire({ title: 'Authentication...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const response = await fetch(API_URL, { 
          method: "POST", 
          body: JSON.stringify({ action: "adminLogin", username: username, password: password }) 
        });
        
        // --- TEMP: Response diagnostics (remove after TEST GAS verified) ---
        console.log("[TEMP] adminLogin response status:", response.status);
        console.log("[TEMP] adminLogin response url:", response.url);
        const contentType = response.headers.get("content-type");
        console.log("[TEMP] adminLogin content-type:", contentType);
        
        const rawText = await response.text();
        console.log("[TEMP] adminLogin raw (first 200 chars):", rawText.substring(0, 200));
        
        if (!contentType || !contentType.includes("application/json")) {
          Swal.close();
          console.error("[TEMP] Non-JSON response:", rawText.substring(0, 500));
          return Swal.fire(
            "TEST GAS Deployment Error",
            "Server returned " + contentType + " instead of JSON.\n\nStatus: " + response.status + "\nURL: " + response.url + "\n\nPastikan:\n1. GAS URL guna /exec (bukan /dev atau editor)\n2. Deployment: Execute as Me, Access Anyone\n3. code.test.gs disalin sepenuhnya",
            "error"
          );
        }
        
        let result;
        try { result = JSON.parse(rawText); } catch(e) {
          Swal.close();
          return Swal.fire("JSON Parse Error", "Gagal membaca response JSON.\n\n" + e.message + "\n\nRaw: " + rawText.substring(0, 200), "error");
        }
        // --- END TEMP diagnostics ---
        
        Swal.close();

        if (!result.success) {
          return Swal.fire("Login Gagal", "Username atau password salah", "error");
        }
        
        sessionStorage.setItem("admin_logged_in", "true");
        sessionStorage.setItem("admin_token", result.token);
        sessionStorage.setItem("admin_token_expires", result.expiresAt);
        switchPage('adminPage');
        loadDashboard();
        
        // Jalankan validateSetup selepas login untuk diagnostic
        validateSetupSilent();
        
      } catch (error) { 
        Swal.close();
        Swal.fire("Ralat Server", "Sistem gagal berhubung. Sila pastikan URL API dan tetapan Deployment GAS adalah tepat.", "error");
        console.error("Ralat Login:", error);
      }
    }

    // ================= LOAD DASHBOARD SYSTEM (V1: error handling) =================
    async function loadDashboard() {
      try {
        const response = await fetch(`${API_URL}?action=dashboard`);
        const data = await response.json();

        // Check for backend error response
        if (!data.success) {
          console.error("[dashboard] Backend error:", data.message || data);
          document.getElementById("totalPeserta").innerText = "ERR";
          document.getElementById("hadirCount").innerText = "ERR";
          document.getElementById("tidakHadirCount").innerText = "ERR";
          return;
        }

        window.lastFetchedList = data.list || []; 
        window.lastFetchedSettings = data.settings || {}; 

        document.getElementById("totalPeserta").innerText = data.total ?? 0;
        document.getElementById("hadirCount").innerText = data.hadir ?? 0;
        document.getElementById("tidakHadirCount").innerText = data.tidakHadir ?? 0;

        // Populate SuperAdmin settings fields + dynamic public page
        if (data.settings) {
          populateAllSettings(data.settings);
          // Also populate old dashboard fields if they exist
          if (data.settings.EVENT_DATE) { const el = document.getElementById('eventDate'); if (el) el.value = data.settings.EVENT_DATE; }
          const evtTime = data.settings.EVENT_START_TIME || data.settings.EVENT_TIME;
          if (evtTime) { const el = document.getElementById('eventTime'); if (el) el.value = evtTime; }
          if (data.settings.OPEN_BEFORE_HOURS) { const el = document.getElementById('openBeforeHours'); if (el) el.value = data.settings.OPEN_BEFORE_HOURS; }
        }

        // 1. MAIN TABLE RENDER
        let html = "";
        if (data.list && data.list.length > 0) {
        data.list.forEach(item => {
          const statusBadge = item.status === "HADIR" 
            ? '<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200">HADIR</span>' 
            : '<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold border border-red-200">BELUM HADIR</span>';

          let selectBg = 'bg-gray-100 text-gray-600 border-gray-200';
          if (item.waStatus === "SUDAH") selectBg = 'bg-blue-100 text-blue-700 border-blue-200';
          if (item.waStatus === "ERROR") selectBg = 'bg-red-100 text-red-700 border-red-200';

          const waBadge = `
            <select class="text-xs font-bold rounded-full px-2 py-1 outline-none border cursor-pointer text-center appearance-none ${selectBg}"
              onchange="confirmChangeWAStatus(this, '${item.pgcode}', '${item.phone}', '${item.nama}', '${item.waStatus}')">
              <option value="BELUM" ${item.waStatus === 'BELUM' ? 'selected' : ''}>BELUM</option>
              <option value="SUDAH" ${item.waStatus === 'SUDAH' ? 'selected' : ''}>SUDAH</option>
              <option value="ERROR" ${item.waStatus === 'ERROR' ? 'selected' : ''}>ERROR</option>
            </select>`;

          const hasRep = item.replacement ? true : false;
          // PASTIKAN BACA REKOD LAMA YANG TIADA STATUS ( !== false )
          const isApproved = hasRep && item.replacement.approved !== false;
          const isPending = hasRep && item.replacement.approved === false;

          let displayNama = `<span class="font-bold text-slate-800">${item.nama}</span>`;
          let displayPhone = `<span class="font-medium text-slate-600">${item.phone}</span>`;
          let displayPgcode = `<span class="font-medium text-slate-600">${item.pgcode || '-'}</span>`;
          let actionBtn = "";

          const activePhone = isApproved ? item.replacement.phone : item.phone;
          const activeNama = isApproved ? item.replacement.nama : item.nama;
          const activePgcode = isApproved ? item.replacement.pgcode : item.pgcode;

          if (isApproved) {
            // HANYA PAPAR NAMA BARU (TIADA STRIKETHROUGH) + BADGE GANTI
            displayNama = `<span class="font-bold text-blue-700">${item.replacement.nama}</span> <span class="bg-blue-50 text-blue-600 border border-blue-200 text-[9px] px-1.5 py-0.5 rounded font-bold ml-1 uppercase">Ganti</span>`;
            displayPhone = `<span class="font-medium text-slate-800">${item.replacement.phone}</span>`;
            displayPgcode = `<span class="font-medium text-slate-800">${item.replacement.pgcode || '-'}</span>`;
            actionBtn = `<button onclick="promptReplace('${item.pgcode}', '${item.phone}', '${item.nama}')" class="text-slate-400 hover:text-yellow-600 transition" title="Ganti Baru"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.704-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg></button>`;
          } else if (isPending) {
            displayNama = `<span class="font-bold text-slate-800">${item.nama}</span><br/><span class="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 animate-pulse">⏳ Mohon Ganti: ${item.replacement.nama}</span>`;
            actionBtn = `
              <div class="flex justify-center gap-1.5">
                <button onclick="processApproval('${item.pgcode}', '${item.phone}', 'APPROVE', '${item.replacement.nama}')" class="bg-green-600 text-white font-extrabold px-2 py-1 rounded text-xs hover:bg-green-700">✓</button>
                <button onclick="processApproval('${item.pgcode}', '${item.phone}', 'REJECT', '${item.replacement.nama}')" class="bg-red-600 text-white font-extrabold px-2 py-1 rounded text-xs hover:bg-red-700">✗</button>
              </div>`;
          } else {
            actionBtn = `<button onclick="promptReplace('${item.pgcode}', '${item.phone}', '${item.nama}')" class="text-slate-400 hover:text-yellow-600 transition"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.704-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg></button>`;
          }

          html += `
            <tr class="hover:bg-slate-50 transition">
              <td class="p-4"><input type="checkbox" class="wa-checkbox w-4 h-4 accent-yellow-600 cursor-pointer" value="${activePhone}" data-nama="${activeNama}" data-pgcode="${activePgcode}"></td>
              <td class="p-4">${displayNama}</td>
              <td class="p-4">${displayPhone}</td>
              <td class="p-4">${displayPgcode}</td>
              <td class="p-4">${waBadge}</td>
              <td class="p-4">${statusBadge}</td>
              <td class="p-4 text-center">${actionBtn}</td>
            </tr>`;
        });
        } else {
          html = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Tiada data peserta. Sila sahkan Sheet dan validateSetup.</td></tr>`;
        }
        document.getElementById("adminTable").innerHTML = html;

        // 2. WISHLIST TABLE RENDER
        let wishHtml = "";
        if (data.wishlist && data.wishlist.length > 0) {
          data.wishlist.forEach(w => {
            const msg = encodeURIComponent(`Salam Tuan/Puan *${w.nama}*.\n\nKami dapati ada slot kosong untuk BootCamp BOARDS! Anda dijemput menyertai group rasmi melalui link ini:\nhttps://chat.whatsapp.com/IDHqogXTdvkCdd3XvTOg5e`);
            wishHtml += `
              <tr class="hover:bg-slate-50 transition text-slate-700">
                <td class="p-4 text-xs text-slate-400">${w.timestamp}</td>
                <td class="p-4 font-bold text-slate-800">${w.nama}</td>
                <td class="p-4">${w.phone}</td>
                <td class="p-4 text-slate-500">${w.email || '-'}</td>
                <td class="p-4 text-xs font-bold">${w.pgcode || '-'}</td>
                <td class="p-4 text-center"><a href="https://wa.me/${formatPhoneNumber(w.phone)}?text=${msg}" target="_blank" class="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600 hover:text-white transition">Hubungi WA 💬</a></td>
              </tr>`;
          });
          document.getElementById("wishlistTable").innerHTML = wishHtml;
        } else {
          document.getElementById("wishlistTable").innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Tiada peserta dalam wishlist setakat ini.</td></tr>`;
        }
      } catch (error) { console.error("Ralat Dashboard:", error); }
    }
    
    // ================= CHANGE STATUS SINGLE & PUKAL =================
    async function confirmChangeWAStatus(selectEl, pgcode, phone, nama, oldStatus) {
      const newStatus = selectEl.value;
      const confirm = await Swal.fire({
        title: 'Tukar Status?', text: `Anda pasti nak tukar status WA untuk ${nama} kepada ${newStatus}?`,
        icon: 'question', showCancelButton: true, confirmButtonColor: '#d4a017', confirmButtonText: 'Ya, Tukar!'
      });
      if (!confirm.isConfirmed) { selectEl.value = oldStatus; return; }

      Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const token = sessionStorage.getItem("admin_token");
        const response = await fetch(API_URL, {
          method: "POST", body: JSON.stringify({ action: "updateWAStatus", token: token, data: { pgcode, phone, newStatus } })
        });
        const result = await response.json();
        if (result.code === "AUTH_REQUIRED") { logoutAdmin(); return; }
        if (result.success) { Swal.fire("Berjaya", "Status dikemaskini.", "success"); loadDashboard(); } 
        else { Swal.fire("Gagal", result.message, "error"); selectEl.value = oldStatus; }
      } catch (error) { Swal.fire("Error", error.message, "error"); selectEl.value = oldStatus; }
    }

    async function changeBulkWAStatus() {
      const selected = document.querySelectorAll(".wa-checkbox:checked");
      const newStatus = document.getElementById("bulkStatusSelect").value;
      if (selected.length === 0) return Swal.fire("Pilih Peserta", "Sila tick sekurang-kurangnya satu peserta.", "warning");
      if (!newStatus) return Swal.fire("Pilih Status", "Sila pilih status (BELUM/SUDAH/ERROR).", "warning");

      const confirm = await Swal.fire({
        title: 'Tukar Status Pukal?', text: `Anda pasti nak tukar status WA untuk ${selected.length} peserta kepada [ ${newStatus} ]?`,
        icon: 'question', showCancelButton: true, confirmButtonColor: '#d4a017', confirmButtonText: 'Ya, Kemaskini!'
      });
      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'Mengemaskini...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const listToUpdate = [];
      selected.forEach(box => { listToUpdate.push({ phone: box.value, pgcode: box.getAttribute("data-pgcode") }); });

      try {
        const token = sessionStorage.getItem("admin_token");
        const response = await fetch(API_URL, {
          method: "POST", body: JSON.stringify({ action: "updateWAStatus", token: token, data: { isBulk: true, newStatus: newStatus, list: listToUpdate } })
        });
        const result = await response.json(); Swal.close();
        if (result.code === "AUTH_REQUIRED") { logoutAdmin(); return; }
        if (result.success) {
          await Swal.fire("Berjaya", result.message, "success");
          document.getElementById("bulkStatusSelect").value = "";
          document.getElementById("selectAllWA").checked = false;
          toggleAllWA(); loadDashboard();
        } else { Swal.fire("Gagal", result.message, "error"); }
      } catch (error) { Swal.fire("Error", error.message, "error"); }
    }

    // ================= REPLACEMENT MANUAL FROM ADMIN =================
    async function promptReplace(oldPgcode, oldPhone, oldNama) {
      const { value: formValues } = await Swal.fire({
        title: 'Gantikan Peserta',
        html: `
          <p class="mb-4 text-xs text-slate-500 text-left">Gantikan slot <b>${oldNama}</b> dengan individu baru:</p>
          <input id="swal-nama" class="w-full border rounded-xl p-3 mb-3 outline-none text-sm" placeholder="Nama Penuh Baru">
          <input id="swal-phone" class="w-full border rounded-xl p-3 mb-3 outline-none text-sm" placeholder="No Telefon Baru">
          <input id="swal-email" class="w-full border rounded-xl p-3 mb-3 outline-none text-sm" placeholder="Email Baru">
          <input id="swal-pgcode" class="w-full border rounded-xl p-3 outline-none text-sm" placeholder="PG Code Baru (Jika Ada)">`,
        focusConfirm: false, showCancelButton: true, confirmButtonColor: '#d4a017', confirmButtonText: 'Simpan',
        preConfirm: () => {
          const nama = document.getElementById('swal-nama').value.trim();
          const phone = document.getElementById('swal-phone').value.trim();
          const email = document.getElementById('swal-email').value.trim();
          const pgcode = document.getElementById('swal-pgcode').value.trim();
          if (!nama || !phone) { Swal.showValidationMessage('Nama & Telefon wajib diisi!'); return false; }
          return { nama, phone, email, pgcode };
        }
      });

      if (formValues) {
        Swal.fire({ title: 'Menyimpan Gantian...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
          const token = sessionStorage.getItem("admin_token");
          const res = await fetch(API_URL, {
            method: 'POST', body: JSON.stringify({ action: 'replaceParticipant', token: token, data: { oldPgcode, oldPhone, newNama: formValues.nama, newPhone: formValues.phone, newEmail: formValues.email, newPgcode: formValues.pgcode } })
          });
          const data = await res.json();
          if (data.success) { Swal.fire('Berjaya', 'Peserta diganti!', 'success'); loadDashboard(); } else { Swal.fire('Gagal', data.message, 'error'); }
        } catch(e) { Swal.fire('Error', e.message, 'error'); }
      }
    }

    // ================= WHATSAPP ENGINE =================
    function toggleAllWA() {
      const isChecked = document.getElementById("selectAllWA").checked;
      document.querySelectorAll(".wa-checkbox").forEach(box => box.checked = isChecked);
    }

    function formatPhoneNumber(phone) {
      let cleaned = phone.toString().replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '6' + cleaned;
      else if (!cleaned.startsWith('6')) cleaned = '60' + cleaned;
      return cleaned;
    }

    async function sendBulkWA() {
      const selected = document.querySelectorAll(".wa-checkbox:checked");
      if (selected.length === 0) return Swal.fire("Pilih Peserta", "Sila tick sekurang-kurangnya satu peserta.", "warning");

      const confirm = await Swal.fire({
        title: `Hantar ${selected.length} Jemputan?`, text: "WhatsApp akan dibuka bergilir. Klik 'Send' di setiap tetingkap.",
        icon: 'info', showCancelButton: true, confirmButtonText: 'Mula Mesej'
      });
      if (!confirm.isConfirmed) return;

      const groupLink = "https://chat.whatsapp.com/IDHqogXTdvkCdd3XvTOg5e";

      for (let i = 0; i < selected.length; i++) {
        const box = selected[i];
        const rawPhone = box.value; const nama = box.getAttribute("data-nama"); const pgcode = box.getAttribute("data-pgcode");
        const formattedPhone = formatPhoneNumber(rawPhone);
        
        const message = `Salam Tuan/Puan *${nama}*.\n\nTerima kasih kerana mendaftar. Anda dijemput untuk menyertai group rasmi BootCamp BOARDS melalui pautan di bawah:\n\n👉 ${groupLink}\n\nJumpa di sana!`;
        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');

        try {
          const token = sessionStorage.getItem("admin_token");
          await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "updateWAStatus", token: token, data: { pgcode, phone: rawPhone, newStatus: "SUDAH" } }) });
        } catch (err) {}

        if (i < selected.length - 1) {
          await Swal.fire({ title: `Dibuka untuk ${nama}`, text: "Sila tekan 'Send' di WhatsApp, kemudian klik Seterusnya.", icon: 'success', confirmButtonText: 'Seterusnya ➡️', allowOutsideClick: false });
        }
      }
      Swal.fire("Selesai!", "Semua senarai diproses.", "success");
      document.getElementById("selectAllWA").checked = false; toggleAllWA(); loadDashboard();
    }

    // ================= SETTINGS ENGINE (V1: token + settings format) =================
    async function saveSettings() {
      const eventDate = document.getElementById("eventDate").value;
      const eventTime = document.getElementById("eventTime").value;
      const openBeforeHours = document.getElementById("openBeforeHours").value;
      const token = sessionStorage.getItem("admin_token");
      if (!token) { Swal.fire("Sesi Tamat", "Sila login semula.", "warning"); logoutAdmin(); return; }

      Swal.fire({ title: 'Save Settings...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const response = await fetch(API_URL, { 
          method: "POST", 
          body: JSON.stringify({ 
            action: "saveSettings", 
            token: token,
            settings: {
              EVENT_DATE: eventDate,
              EVENT_START_TIME: eventTime,
              OPEN_BEFORE_HOURS: openBeforeHours
            }
          }) 
        });
        const result = await response.json(); Swal.close();
        if (result.code === "AUTH_REQUIRED") { logoutAdmin(); return; }
        if (!result.success) return Swal.fire("Error", result.message || "Gagal save settings", "error");
        Swal.fire("Berjaya", result.message || "Settings disimpan", "success");
      } catch (error) { Swal.fire("Error", error.message, "error"); }
    }

    function deleteSettings() {
      Swal.fire({ title: 'Padam Jadual?', text: "Peserta tidak boleh check-in sehingga jadual baru diset.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Ya, Padam!' }).then((result) => {
        if (result.isConfirmed) {
          document.getElementById("eventDate").value = ""; document.getElementById("eventTime").value = ""; document.getElementById("openBeforeHours").value = "5";
          saveSettings();
        }
      });
    }

    async function logoutAdmin() { 
      const token = sessionStorage.getItem("admin_token");
      if (token) {
        try { await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "adminLogout", token: token }) }); } catch(e) {}
      }
      sessionStorage.removeItem("admin_logged_in");
      sessionStorage.removeItem("admin_token");
      sessionStorage.removeItem("admin_token_expires");
      location.reload(); 
    }

   // ================= COUNTDOWN TIMER ENGINE =================
    let countdownInterval;

    async function initPublicPage() {
      try {
        const response = await fetch(`${API_URL}?action=getConfig`);
        const data = await response.json();
        
        if (data.success && data.settings.EVENT_DATE && data.settings.EVENT_TIME) {
          startCountdown(data.settings.EVENT_DATE, data.settings.EVENT_TIME);
        }
      } catch (e) {
        console.error("Gagal memuatkan tetapan pemasa:", e);
      }
    }

    function startCountdown(dateStr, timeStr) {
      const targetDate = new Date(`${dateStr}T${timeStr}:00`).getTime();
      const container = document.getElementById('countdownContainer');
      
      if (isNaN(targetDate)) return; 
      
      container.classList.remove('hidden'); 

      countdownInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
    clearInterval(countdownInterval);
    
    // 1. Tukar teks pemasa seperti biasa
    if (container) {
        container.innerHTML = '<div class="text-center font-extrabold text-red-600 text-sm uppercase p-2">❌ AKSES TAMAT</div>';
    }
    
    // 2. SOROKKAN container (Bukan padam), supaya skrip admin tidak crash
    const mainContainer = document.getElementById('mainAppContainer');
    if (mainContainer) {
        mainContainer.classList.add('hidden'); 
    }
    
    // 3. PAPARKAN mesej sistem ditutup yang asing
    const closedMessage = document.getElementById('systemClosedMessage');
    if (closedMessage) {
        closedMessage.classList.remove('hidden');
    }
    
    return;
}
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById("cd-days").innerText = days.toString().padStart(2, '0');
        document.getElementById("cd-hours").innerText = hours.toString().padStart(2, '0');
        document.getElementById("cd-mins").innerText = minutes.toString().padStart(2, '0');
        document.getElementById("cd-secs").innerText = seconds.toString().padStart(2, '0');
      }, 1000);
    }

    // ================= KEKALKAN LOGIN & LOAD PUBLIC DATA (V1: token check) =================
    async function validateSetupSilent() {
      const panel = document.getElementById("sysValidationPanel");
      const badge = document.getElementById("sysValBadge");
      const sheetsDiv = document.getElementById("sysValSheets");
      const colsDiv = document.getElementById("sysValColumns");
      const errDiv = document.getElementById("sysValErrors");
      if (!panel) return;
      
      panel.classList.remove("hidden");
      badge.textContent = "Checking...";
      badge.className = "px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700";
      
      const token = sessionStorage.getItem("admin_token");
      if (!token) { badge.textContent = "No token"; badge.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700"; return; }
      
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "validateSetup", token: token })
        });
        const data = await response.json();
        
        if (data.success) {
          badge.textContent = "✓ OK";
          badge.className = "px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700";
        } else {
          badge.textContent = "✗ FAILED";
          badge.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700";
        }
        
        // Render sheets
        if (data.sheets) {
          sheetsDiv.innerHTML = Object.entries(data.sheets).map(([name, ok]) =>
            `<div class="flex items-center gap-2 bg-slate-50 rounded-lg p-2"><span>${ok ? '✅' : '❌'}</span><span class="font-mono">${name}</span></div>`
          ).join('');
        }
        
        // Render columns
        if (data.columns) {
          colsDiv.innerHTML = "Headers: " + Object.entries(data.columns).map(([k, v]) => 
            `<span class="bg-slate-100 px-2 py-0.5 rounded font-mono">${k}=col${v}</span>`
          ).join(' ');
        }
        
        // Render errors/warnings
        let msgs = [];
        if (data.errors && data.errors.length > 0) msgs = msgs.concat(data.errors.map(e => '❌ ' + e));
        if (data.warnings && data.warnings.length > 0) msgs = msgs.concat(data.warnings.map(w => '⚠️ ' + w));
        errDiv.innerHTML = msgs.join('<br>');
        
      } catch(e) {
        badge.textContent = "Error";
        badge.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700";
        errDiv.textContent = e.message;
      }
    }

    // ================= SUPERADMIN SETTINGS ENGINE =================
    function switchSettingsTab(tabId) {
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
      document.querySelectorAll('.settings-tab').forEach(t => { t.classList.remove('bg-slate-900','text-white'); t.classList.add('text-slate-500'); });
      const panel = document.getElementById('tab-' + tabId);
      if (panel) panel.classList.remove('hidden');
      const btn = document.getElementById('stab-' + tabId);
      if (btn) { btn.classList.add('bg-slate-900','text-white'); btn.classList.remove('text-slate-500'); }
    }

    // Benefits CRUD
    let benefitsData = [];
    function renderBenefits() {
      const list = document.getElementById('benefits-list');
      if (!list) return;
      list.innerHTML = benefitsData.map((b, i) => `
        <div class="flex items-center gap-2 bg-slate-50 rounded-lg p-2 text-sm">
          <span class="w-8 text-center">${b.icon || '✅'}</span>
          <span class="flex-1">${b.text}</span>
          <button onclick="benefitsData.splice(${i},1);renderBenefits()" class="text-red-500 hover:text-red-700 text-xs font-bold">✕</button>
        </div>`).join('');
    }
    function addBenefit() {
      const text = document.getElementById('benefit-text').value.trim();
      if (!text) return;
      benefitsData.push({ text, icon: document.getElementById('benefit-icon').value || '✅', order: benefitsData.length + 1 });
      document.getElementById('benefit-text').value = '';
      renderBenefits();
    }

    // Schedule CRUD
    let scheduleData = [];
    function renderSchedule() {
      const list = document.getElementById('schedule-list');
      if (!list) return;
      list.innerHTML = scheduleData.map((s, i) => `
        <div class="flex items-center gap-2 bg-slate-50 rounded-lg p-2 text-sm">
          <span class="font-mono font-bold w-16">${s.time}</span>
          <span class="font-medium flex-1">${s.title}</span>
          <span class="text-slate-400 text-xs hidden md:inline w-32 truncate">${s.description || ''}</span>
          <button onclick="scheduleData.splice(${i},1);renderSchedule()" class="text-red-500 hover:text-red-700 text-xs font-bold">✕</button>
        </div>`).join('');
    }
    function addScheduleItem() {
      const time = document.getElementById('sched-time').value;
      const title = document.getElementById('sched-title').value.trim();
      if (!time || !title) return;
      scheduleData.push({ time, title, description: document.getElementById('sched-desc').value.trim(), order: scheduleData.length + 1 });
      document.getElementById('sched-time').value = '';
      document.getElementById('sched-title').value = '';
      document.getElementById('sched-desc').value = '';
      renderSchedule();
    }

    // Get all settings field values
    function collectAllSettings() {
      const prefix = 's-';
      const boolFields = ['SYSTEM_ENABLED','WISHLIST_ENABLED','REPLACEMENT_ENABLED'];
      const settings = {};
      
      // Collect all input/textarea fields with id="s-KEY"
      document.querySelectorAll('[id^="' + prefix + '"]').forEach(el => {
        const key = el.id.substring(prefix.length);
        if (boolFields.includes(key)) {
          settings[key] = el.checked ? 'true' : 'false';
        } else {
          settings[key] = el.value;
        }
      });
      
      // Add JSON fields
      settings.BENEFITS_JSON = JSON.stringify(benefitsData);
      settings.SCHEDULE_JSON = JSON.stringify(scheduleData);
      
      // Map legacy eventDate/eventTime for backward compat
      if (!settings.EVENT_DATE && document.getElementById('eventDate')) settings.EVENT_DATE = document.getElementById('eventDate').value;
      if (!settings.EVENT_START_TIME && document.getElementById('eventTime')) settings.EVENT_START_TIME = document.getElementById('eventTime').value;
      
      return settings;
    }

    // Populate all fields from config
    function populateAllSettings(settings) {
      if (!settings) return;
      const prefix = 's-';
      const boolFields = ['SYSTEM_ENABLED','WISHLIST_ENABLED','REPLACEMENT_ENABLED'];
      
      Object.entries(settings).forEach(([key, value]) => {
        if (key === 'BENEFITS_JSON' && value) {
          try { benefitsData = JSON.parse(value); renderBenefits(); } catch(e) {}
          return;
        }
        if (key === 'SCHEDULE_JSON' && value) {
          try { scheduleData = JSON.parse(value); renderSchedule(); } catch(e) {}
          return;
        }
        // Legacy fields — populate old inputs too
        if (key === 'EVENT_DATE') { const el = document.getElementById('eventDate'); if (el) el.value = value; }
        if (key === 'EVENT_START_TIME' || key === 'EVENT_TIME') {
          const el = document.getElementById('eventTime'); if (el) el.value = value;
        }
        
        const el = document.getElementById(prefix + key);
        if (!el) return;
        if (boolFields.includes(key)) {
          el.checked = (value === 'true' || value === true);
        } else {
          el.value = value || '';
        }
      });
      
      // Also populate dynamic public page
      applyPublicSettings(settings);
    }

    // Load settings from getConfig
    async function loadAllSettings() {
      showSettingsStatus('Loading...', 'text-yellow-600');
      try {
        const response = await fetch(API_URL + '?action=getConfig');
        const data = await response.json();
        if (data.success && data.settings) {
          populateAllSettings(data.settings);
          showSettingsStatus('Settings loaded', 'text-green-600');
        } else {
          showSettingsStatus('Failed to load settings: ' + (data.message || 'unknown'), 'text-red-600');
        }
      } catch(e) {
        showSettingsStatus('Error: ' + e.message, 'text-red-600');
      }
    }

    // Save all settings
    async function saveAllSettings() {
      const token = sessionStorage.getItem("admin_token");
      if (!token) { Swal.fire("Sesi Tamat","Sila login semula.","warning"); logoutAdmin(); return; }
      
      const settings = collectAllSettings();
      showSettingsStatus('Saving...', 'text-yellow-600');
      
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "saveSettings", token: token, settings: settings })
        });
        const result = await response.json();
        
        if (result.code === "AUTH_REQUIRED") { logoutAdmin(); return; }
        
        if (result.success) {
          let msg = result.message || 'Settings saved';
          if (result.rejected && result.rejected.length > 0) {
            msg += ' (' + result.rejected.length + ' field(s) rejected: ' + result.rejected.map(r => r.key).join(', ') + ')';
            showSettingsStatus(msg, 'text-yellow-600');
          } else {
            showSettingsStatus(msg, 'text-green-600');
          }
          // Refresh public page
          loadAllSettings();
        } else {
          showSettingsStatus('Error: ' + (result.message || 'Save failed'), 'text-red-600');
        }
      } catch(e) {
        showSettingsStatus('Error: ' + e.message, 'text-red-600');
      }
    }

    function showSettingsStatus(msg, cls) {
      const el = document.getElementById('settingsStatus');
      if (!el) return;
      el.textContent = msg;
      el.className = 'text-xs mb-3 ' + (cls || 'text-slate-600');
      el.classList.remove('hidden');
    }

    // Dynamic public page rendering
    function applyPublicSettings(s) {
      if (!s) return;
      
      if (s.EVENT_NAME) { const el = document.querySelector('#userPage + * h1, header h1, .gold-gradient h1'); /* update header */ }
      // Update branding colors
      if (s.PRIMARY_COLOR && s.SECONDARY_COLOR) {
        const style = document.getElementById('dynamic-brand-style') || (() => { const st = document.createElement('style'); st.id = 'dynamic-brand-style'; document.head.appendChild(st); return st; })();
        style.textContent = `.gold-gradient { background: linear-gradient(135deg, ${s.PRIMARY_COLOR}, ${s.SECONDARY_COLOR}) !important; }`;
      }
      // Update poster
      if (s.POSTER_URL) {
        const posters = document.querySelectorAll('img[src*="boards.jpeg"], img[alt*="Poster"]');
        posters.forEach(img => { img.src = s.POSTER_URL; img.alt = s.EVENT_NAME || s.EVENT_SHORT_NAME || ''; });
      }
      // Update footer
      if (s.FOOTER_TEXT) {
        const footerOrg = document.querySelector('footer p:first-child');
        if (footerOrg) footerOrg.innerHTML = '&copy; <span id="currentYear"></span> ' + s.FOOTER_TEXT;
      }
      // Update PDF title/venue for generatePhysicalPDF
      window.dynamicPdfTitle = s.PDF_TITLE || '';
      window.dynamicPdfVenue = s.PDF_VENUE || '';
      window.dynamicEventName = s.EVENT_NAME || '';
      window.dynamicEventShort = s.EVENT_SHORT_NAME || '';
      window.dynamicWhatsAppLink = s.WHATSAPP_GROUP_LINK || '';
      window.dynamicWhatsAppMsg = s.WHATSAPP_INVITE_MESSAGE || '';
      window.dynamicQuota = s.PARTICIPANT_QUOTA || '';
      window.dynamicVenue = s.EVENT_VENUE || '';
      window.dynamicSchedule = s.SCHEDULE_JSON ? JSON.parse(s.SCHEDULE_JSON) : null;
      window.dynamicClosedMsg = s.CLOSED_MESSAGE || '';
      window.dynamicSuccessMsg = s.SUCCESS_MESSAGE || '';
      
      // Update schedule in success page if available
      if (window.dynamicSchedule && window.dynamicEventName) updateSuccessSchedule();
    }
    
    function updateSuccessSchedule() {
      const schedTitle = document.querySelector('#successPage h3');
      if (schedTitle && window.dynamicEventName) schedTitle.textContent = 'Aturcara ' + window.dynamicEventName;
      // Schedule items rendering uses existing logic in the public section
    }

    window.onload = function() {
      // 0. Setkan auto-tahun pada footer
      const yearEl = document.getElementById('currentYear');
      if (yearEl) yearEl.textContent = new Date().getFullYear();

      // 1. Sentiasa jalankan enjin timer untuk paparan depan
      initPublicPage();

      // 2. Semak memori login admin (V1: check token + expiry)
      const token = sessionStorage.getItem("admin_token");
      const expires = sessionStorage.getItem("admin_token_expires");
      const now = Math.floor(Date.now() / 1000);
      if (token && expires && now < Number(expires)) {
        switchPage('adminPage');
        loadDashboard();
      } else if (token) {
        // Token expired — clear session
        sessionStorage.removeItem("admin_token");
        sessionStorage.removeItem("admin_token_expires");
        sessionStorage.removeItem("admin_logged_in");
      }
    };
    
    // ================= ENJIN CETAKAN SENARAI FIZIKAL (PDF) =================
    function generatePhysicalPDF() {
      if (!window.lastFetchedList || window.lastFetchedList.length === 0) {
        return Swal.fire("Tiada Data", "Sila tunggu sehingga dashboard selesai memuatkan data senarai terlebih dahulu.", "warning");
      }

      const settings = window.lastFetchedSettings || {};
      const dateStr = settings.EVENT_DATE ? new Date(settings.EVENT_DATE).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
      const timeStr = settings.EVENT_TIME || '-';

      let printWindow = window.open('', '_blank');
      let tableRows = "";
      let bil = 1;

      window.lastFetchedList.forEach(item => {
        // LOGIK BARU: Pastikan sistem mengutamakan peserta PENGGANTI. 
        // Ia akan papar nama pengganti selagi permohonan itu tidak berstatus 'false' (Ditolak).
        const isApproved = item.replacement && item.replacement.approved !== false;
        
        const nama = isApproved ? item.replacement.nama : item.nama;
        const phone = isApproved ? item.replacement.phone : item.phone;
        const pgcode = isApproved ? item.replacement.pgcode : item.pgcode;

        tableRows += `
          <tr style="page-break-inside: avoid;">
            <td style="border: 1px solid #cbd5e1; padding: 12px 8px; text-align: center; font-size: 12px;">${bil}</td>
            <td style="border: 1px solid #cbd5e1; padding: 12px 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; max-width: 250px; overflow: hidden; text-overflow: ellipsis;">${nama}</td>
            <td style="border: 1px solid #cbd5e1; padding: 12px 8px; text-align: center; font-size: 12px;">${phone}</td>
            <td style="border: 1px solid #cbd5e1; padding: 12px 8px; text-align: center; font-size: 12px; font-weight: 600; color: #334155;">${pgcode || '-'}</td>
            <td style="border: 1px solid #cbd5e1; padding: 12px 8px; width: 140px; height: 35px;"></td>
          </tr>
        `;
        bil++;
      });

      let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Senarai Kehadiran Fizikal - BootCamp BOARDS</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body { font-family: 'Inter', sans-serif; color: #0f172a; padding: 20px; background-color: #ffffff; }
            .header { text-align: center; margin-bottom: 25px; border-bottom: 4px double #d4a017; padding-bottom: 12px; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
            .header p { margin: 6px 0 0 0; font-size: 12px; color: #475569; font-weight: 500; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 10px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
            @media print {
              body { padding: 0; }
              thead { display: table-header-group; }
              @page { size: A4; margin: 1.5cm 1.2cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>BootCamp BOARDS: <br>Urus dan Follow Up Pelanggan Sistematik</h1>
            <p>Senarai Pendaftaran & Kehadiran Fizikal Peserta • Tarikh: ${dateStr} • Masa: ${timeStr} • Tempat: Thinker Table, Bangi Gateway</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 6%;">Bil</th>
                <th style="width: 44%; text-align: left;">Nama Penuh Peserta</th>
                <th style="width: 15%;">No. Telefon</th>
                <th style="width: 15%;">PG Code</th>
                <th style="width: 20%;">Tandatangan</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      setTimeout(function() { printWindow.close(); }, 500);
    }
    
    // ================= FUNGSI PROSES KELULUSAN GANTIAN =================
    async function processApproval(pgcode, phone, status, pendingNama) {
      const actionText = status === "APPROVE" ? "MENGESAHKAN LULUS" : "MENOLAK";
      const confirmColor = status === "APPROVE" ? '#16a34a' : '#dc2626';
      
      const confirm = await Swal.fire({
        title: 'Kelulusan Gantian',
        text: `Anda pasti nak ${actionText} permohonan gantian kepada ${pendingNama}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: confirmColor,
        confirmButtonText: status === "APPROVE" ? 'Ya, Sahkan!' : 'Ya, Tolak'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'Mengemaskini Rekod...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const token = sessionStorage.getItem("admin_token");
        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "handleApproval", token: token, data: { pgcode, phone, status } })
        });
        const result = await response.json(); 
        Swal.close();
        
        if (result.success) {
          Swal.fire("Berjaya", `Permohonan gantian telah selesai diproses.`, "success");
          loadDashboard(); // Refresh jadual dashboard automatik
        } else {
          Swal.fire("Gagal", result.message, "error");
        }
      } catch (e) { 
        Swal.fire("Error", e.message, "error"); 
      }
    }
