/* ==========================================================
   أكاديمية الحريف — المنطق البرمجي (نسخة Supabase)
   تسجيل الدخول (صاحب الحساب فقط) + إدارة الأعضاء (إضافة / تعديل / حذف / بحث)
   + الحضور والغياب + التقييم اليومي + نسخة احتياطية (تصدير/استيراد)
   البيانات على قاعدة بيانات Supabase — متزامنة لحظياً على كل الأجهزة
   ========================================================== */
(function(){
  "use strict";

  /* ---------- إعدادات Supabase ---------- */
  var SUPABASE_URL = "https://vykoloahxpyryunyjsko.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_W4cm7U5Xbq65SSRgTghe2w_D4MkrYdv";
  var sbLocal = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: true } });
  var sbSession = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true } });
  var sb = sbLocal; // العميل النشط حالياً — يتحدد فعلياً عند الدخول أو عند استعادة الجلسة
  var realtimeChannel = null;

  var loginView = document.getElementById("loginView");
  var appView = document.getElementById("appView");
  var toastEl = document.getElementById("toast");
  var toastTimer;

  function showToast(msg, isErr){
    toastEl.textContent = msg;
    toastEl.classList.toggle("err", !!isErr);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2600);
  }
  function todayStr(){
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }

  /* ---------- تطبيع بيانات عضو مستورد من نسخة احتياطية قديمة ---------- */
  function normalize(m){
    if(!Array.isArray(m.attendance)) m.attendance = [];
    if(!Array.isArray(m.ratings)) m.ratings = [];
    return m;
  }

  var members = [];

  /* ---------- جلب البيانات من Supabase ---------- */
  async function fetchMembers(){
    var res = await sb.from("members")
      .select("id,code,name,age,phone,position,join_date,attendance(date,present),ratings(date,score,note)")
      .order("join_date", { ascending: false });
    if(res.error){ showToast("تعذر تحميل بيانات الأعضاء — تأكد من الاتصال بالإنترنت", true); return null; }
    return res.data.map(function(m){
      return { id:m.id, code:m.code, name:m.name, age:m.age, phone:m.phone, position:m.position,
        joinDate:m.join_date, attendance:m.attendance||[], ratings:m.ratings||[] };
    });
  }
  async function refreshAll(){
    var list = await fetchMembers(); if(!list) return; members = list;
    renderAll();
  }
  function setupRealtime(){
    if(realtimeChannel) return;
    realtimeChannel = sb.channel("members-sync")
      .on("postgres_changes", { event:"*", schema:"public", table:"members" }, scheduleRefresh)
      .on("postgres_changes", { event:"*", schema:"public", table:"attendance" }, scheduleRefresh)
      .on("postgres_changes", { event:"*", schema:"public", table:"ratings" }, scheduleRefresh)
      .subscribe();
  }
  function teardownRealtime(){
    if(realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  }

  /* ---------- جلسة الدخول (Supabase Auth) ---------- */
  async function resolveSession(){
    var r1 = await sbLocal.auth.getSession();
    if(r1.data && r1.data.session){ sb = sbLocal; return r1.data.session; }
    var r2 = await sbSession.auth.getSession();
    if(r2.data && r2.data.session){ sb = sbSession; return r2.data.session; }
    return null;
  }

  async function enterApp(){
    loginView.style.display = "none";
    appView.classList.add("active");
    await refreshAll();
    setupRealtime();
  }
  function showLogin(){
    appView.classList.remove("active");
    loginView.style.display = "flex";
  }

  /* ---------- نموذج تسجيل الدخول ---------- */
  var loginForm = document.getElementById("loginForm");
  var loginErr = document.getElementById("loginErr");
  var toggleEye = document.getElementById("toggleEye");
  var eyeIcon = document.getElementById("eyeIcon");
  var loginPassword = document.getElementById("loginPassword");
  var loginBtn = loginForm.querySelector(".btn-main");

  toggleEye.addEventListener("click", function(){
    var showing = loginPassword.type === "text";
    loginPassword.type = showing ? "password" : "text";
    eyeIcon.innerHTML = showing
      ? '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a21.6 21.6 0 015.06-6.06M9.9 4.24A10.4 10.4 0 0112 4c7 0 11 7 11 7a21.6 21.6 0 01-3.22 4.31M14.12 14.12a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/>';
  });

  loginForm.addEventListener("submit", async function(e){
    e.preventDefault();
    var email = document.getElementById("loginEmail").value.trim().toLowerCase();
    var pass = loginPassword.value;
    var remember = document.getElementById("remember").checked;
    if(!email || !pass) return;

    loginBtn.disabled = true; loginErr.textContent = "";
    var client = remember ? sbLocal : sbSession;
    try{
      var res = await client.auth.signInWithPassword({ email: email, password: pass });
      if(res.error){ loginErr.textContent = "البريد الإلكتروني أو كلمة المرور غير صحيحة"; loginBtn.disabled = false; return; }
      sb = client;
      showToast("تم تسجيل الدخول بنجاح");
      await enterApp();
      loginForm.reset();
    }catch(err){
      loginErr.textContent = "تعذر الاتصال بالخادم، تأكد من الإنترنت وحاول تاني";
    }
    loginBtn.disabled = false;
  });

  document.getElementById("forgotLink").addEventListener("click", function(e){
    e.preventDefault();
    showToast("تواصل مع إدارة الأكاديمية لاستعادة كلمة المرور");
  });

  document.getElementById("logoutBtn").addEventListener("click", async function(){
    teardownRealtime();
    showLogin(); members = []; try{ await sb.auth.signOut(); }catch(e){}
    members = [];
    showLogin();
    showToast("تم تسجيل الخروج");
  });

  /* ---------- طيّ لوحة الإضافة ---------- */
  var addPanelHead = document.getElementById("addPanelHead");
  var addPanelBody = document.getElementById("addPanelBody");
  var addChev = document.getElementById("addChev");
  addPanelHead.addEventListener("click", function(){
    addPanelBody.classList.toggle("open");
    addChev.classList.toggle("open");
  });

  /* ---------- طيّ لوحة النسخ الاحتياطي ---------- */
  var bkPanelHead = document.getElementById("bkPanelHead");
  var bkPanelBody = document.getElementById("bkPanelBody");
  var bkChev = document.getElementById("bkChev");
  if(bkPanelHead){
    bkPanelHead.addEventListener("click", function(){
      bkPanelBody.classList.toggle("open");
      bkChev.classList.toggle("open");
    });
  }

  /* ---------- إضافة عضو ---------- */
  var addForm = document.getElementById("addForm");
  var mName = document.getElementById("mName");
  var mAge = document.getElementById("mAge");
  var mPhone = document.getElementById("mPhone");
  var mPos = document.getElementById("mPos");
  var errName = document.getElementById("errName");
  var errAge = document.getElementById("errAge");
  var errPhone = document.getElementById("errPhone");

  function validPhone(v){
    var digits = v.replace(/[\s\-]/g,"");
    return /^\+?\d{7,14}$/.test(digits);
  }

  addForm.addEventListener("submit", async function(e){
    e.preventDefault();
    errName.textContent = ""; errAge.textContent = ""; errPhone.textContent = "";
    var name = mName.value.trim();
    var age = parseInt(mAge.value, 10);
    var phone = mPhone.value.trim();
    var pos = mPos.value;
    var ok = true;

    if(name.length < 2){ errName.textContent = "الرجاء إدخال اسم صحيح"; ok = false; }
    if(!age || age < 4 || age > 60){ errAge.textContent = "أدخل عمرًا بين 4 و 60"; ok = false; }
    if(!validPhone(phone)){ errPhone.textContent = "أدخل رقم هاتف صحيح"; ok = false; }
    if(!ok) return;

    var submitBtn = addForm.querySelector(".add-btn");
    submitBtn.disabled = true;
    try{
      var codeRes = await sb.rpc("next_member_code");
      if(codeRes.error) throw codeRes.error;
      var code = codeRes.data;
      var ins = await sb.from("members").insert({ code: code, name: name, age: age, phone: phone, position: pos || null }).select().single();
      if(ins.error) throw ins.error;
      addForm.reset();
      await refreshAll();
      showToast("تمت إضافة " + name + " — الكود: " + code);
    }catch(err){
      showToast("تعذر إضافة العضو، تأكد من الإنترنت وحاول تاني", true);
    }
    submitBtn.disabled = false;
  });

  /* ---------- البحث ---------- */
  var searchInput = document.getElementById("searchInput");
  var searchTimer;
  searchInput.addEventListener("input", function(){ clearTimeout(searchTimer); searchTimer = setTimeout(renderList, 120); });
  searchInput.addEventListener("keydown", function(e){ // ماسح باركود USB بيكتب الكود ويضغط Enter
    if(e.key !== "Enter") return;
    var v = searchInput.value.trim();
    if(/^HRF-\d+$/i.test(v)){ registerByCode(v); searchInput.value = ""; renderList(); }
  });

  /* ---------- العرض ---------- */
  var memberListEl = document.getElementById("memberList");
  var emptyState = document.getElementById("emptyState");
  memberListEl.addEventListener("click", function(e){
    var b = e.target.closest("button[data-id]"); if(!b) return;
    var id = b.dataset.id, c = b.classList;
    if(c.contains("track")) openTrack(id); else if(c.contains("edit")) openEdit(id);
    else if(c.contains("del")) openDelete(id); else if(c.contains("qr")) openCard(id);
  });

  function initials(name){
    var parts = name.trim().split(/\s+/);
    return (parts[0] ? parts[0][0] : "") + (parts[1] ? parts[1][0] : "");
  }
  function fmtDate(iso){
    var d = new Date(iso);
    return d.toLocaleDateString("ar-EG", { year:"numeric", month:"short", day:"numeric" });
  }
  function fmtDay(ymd){
    var d = new Date(ymd + "T00:00:00");
    return d.toLocaleDateString("ar-EG", { month:"short", day:"numeric", weekday:"short" });
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function attendanceRate(m){
    if(!m.attendance.length) return null;
    var present = m.attendance.filter(function(a){ return a.present; }).length;
    return Math.round((present / m.attendance.length) * 100);
  }
  function avgRating(m){
    if(!m.ratings.length) return null;
    var sum = m.ratings.reduce(function(s,r){ return s + r.score; }, 0);
    return Math.round((sum / m.ratings.length) * 10) / 10;
  }

  function renderList(){
    var q = searchInput.value.trim().toLowerCase();
    var filtered = members.filter(function(m){
      if(!q) return true;
      return m.name.toLowerCase().indexOf(q) !== -1 ||
             m.phone.indexOf(q) !== -1 ||
             (m.code || "").toLowerCase().indexOf(q) !== -1;
    });

    memberListEl.innerHTML = "";
    emptyState.style.display = members.length === 0 ? "block" : "none";

    if(members.length > 0 && filtered.length === 0){
      var noRes = document.createElement("div");
      noRes.className = "empty";
      noRes.innerHTML = "<p>لا توجد نتائج مطابقة للبحث</p>";
      memberListEl.appendChild(noRes);
      return;
    }

    var frag = document.createDocumentFragment(), todayKey = todayStr();
    filtered.forEach(function(m){
      var rate = attendanceRate(m);
      var avg = avgRating(m);
      var card = document.createElement("div");
      card.className = "member-card" + (m.attendance.some(function(a){ return a.date === todayKey && a.present; }) ? " present-today" : "");
      card.innerHTML =
        '<div class="avatar">' + initials(m.name) + '</div>' +
        '<div class="m-info">' +
          '<div class="m-top"><span class="m-name">' + escapeHtml(m.name) + '</span><span class="code-badge">' + escapeHtml(m.code || "") + '</span></div>' +
          '<div class="m-meta">' +
            '<span><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>' + m.age + ' سنة</span>' +
            '<span><svg class="icon" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.9a16 16 0 006 6l1.4-1.4a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.8 2z"/></svg>' + escapeHtml(m.phone) + '</span>' +
            '<span><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' + fmtDate(m.joinDate) + '</span>' +
          '</div>' +
          '<div class="m-chips">' +
            (m.position ? '<span class="pos-chip">' + escapeHtml(m.position) + '</span>' : '') +
            '<span class="mini-chip att' + (rate===null?' na':(rate>=75?' good':rate>=50?' mid':' low')) + '">' +
              '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' + (rate===null ? 'لا يوجد حضور' : 'حضور ' + rate + '%') +
            '</span>' +
            '<span class="mini-chip rate">' +
              '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6z"/></svg>' + (avg===null ? 'بدون تقييم' : avg + '/10') +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="m-actions">' +
          '<button class="qr" data-id="' + m.id + '" aria-label="كارنيه QR"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v7M14 20h3"/></svg></button>' +
          '<button class="track" data-id="' + m.id + '" aria-label="الحضور والتقييم"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 15l2.5 2.5L16 12"/></svg></button>' +
          '<button class="edit" data-id="' + m.id + '" aria-label="تعديل"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>' +
          '<button class="del" data-id="' + m.id + '" aria-label="حذف"><svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg></button>' +
        '</div>';
      frag.appendChild(card);
    });

    memberListEl.appendChild(frag);
  }

  function renderStats(){
    document.getElementById("statTotal").textContent = members.length;
    var avg = members.length ? Math.round(members.reduce(function(s,m){ return s + m.age; }, 0) / members.length) : 0;
    document.getElementById("statAvgAge").textContent = avg;
    var now = new Date();
    var thisMonth = members.filter(function(m){
      var d = new Date(m.joinDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    document.getElementById("statMonth").textContent = thisMonth;
    var todays = members.filter(function(m){
      return m.attendance.some(function(a){ return a.date === todayStr() && a.present; });
    }).length;
    var statToday = document.getElementById("statTodayPresent");
    if(statToday) statToday.textContent = todays;
  }

  function renderAll(){ renderStats(); renderList(); }

  /* ---------- نافذة التعديل ---------- */
  var editModalBg = document.getElementById("editModalBg");
  var editName = document.getElementById("editName");
  var editAge = document.getElementById("editAge");
  var editPhone = document.getElementById("editPhone");
  var editPos = document.getElementById("editPos");
  var editErr = document.getElementById("editErr");
  var editCodeShow = document.getElementById("editCodeShow");
  var currentEditId = null;

  function openEdit(id){
    var m = members.find(function(x){ return x.id === id; });
    if(!m) return;
    currentEditId = id;
    editName.value = m.name;
    editAge.value = m.age;
    editPhone.value = m.phone;
    editPos.value = m.position || "";
    editCodeShow.textContent = m.code || "";
    editErr.textContent = "";
    editModalBg.classList.add("open");
  }
  document.getElementById("editCancel").addEventListener("click", function(){ editModalBg.classList.remove("open"); });
  editModalBg.addEventListener("click", function(e){ if(e.target === editModalBg) editModalBg.classList.remove("open"); });

  document.getElementById("editSave").addEventListener("click", async function(){
    var name = editName.value.trim();
    var age = parseInt(editAge.value, 10);
    var phone = editPhone.value.trim();

    if(name.length < 2){ editErr.textContent = "الرجاء إدخال اسم صحيح"; return; }
    if(!age || age < 4 || age > 60){ editErr.textContent = "أدخل عمرًا بين 4 و 60"; return; }
    if(!validPhone(phone)){ editErr.textContent = "أدخل رقم هاتف صحيح"; return; }

    try{
      var upd = await sb.from("members").update({ name: name, age: age, phone: phone, position: editPos.value || null }).eq("id", currentEditId);
      if(upd.error) throw upd.error;
      await refreshAll();
      editModalBg.classList.remove("open"); showToast("تم تحديث بيانات " + name);
    }catch(err){
      editErr.textContent = "تعذر حفظ التعديل، حاول تاني"; return;
    }
    editModalBg.classList.remove("open");
  });

  /* ---------- نافذة الحذف ---------- */
  var delModalBg = document.getElementById("delModalBg");
  var delName = document.getElementById("delName");
  var currentDelId = null;

  function openDelete(id){
    var m = members.find(function(x){ return x.id === id; });
    if(!m) return;
    currentDelId = id;
    delName.textContent = m.name;
    delModalBg.classList.add("open");
  }
  document.getElementById("delCancel").addEventListener("click", function(){ delModalBg.classList.remove("open"); });
  delModalBg.addEventListener("click", function(e){ if(e.target === delModalBg) delModalBg.classList.remove("open"); });

  document.getElementById("delConfirm").addEventListener("click", async function(){
    var m = members.find(function(x){ return x.id === currentDelId; });
    try{
      var del = await sb.from("members").delete().eq("id", currentDelId);
      if(del.error) throw del.error;
      await refreshAll();
      if(m) showToast("تم حذف " + m.name, true);
    }catch(err){
      showToast("تعذر الحذف، حاول تاني", true);
    }
    delModalBg.classList.remove("open");
  });

  /* ---------- نافذة الحضور والتقييم ---------- */
  var trackModalBg = document.getElementById("trackModalBg");
  var trackName = document.getElementById("trackName");
  var trackCode = document.getElementById("trackCode");
  var trackTabAtt = document.getElementById("trackTabAtt");
  var trackTabRate = document.getElementById("trackTabRate");
  var trackPaneAtt = document.getElementById("trackPaneAtt");
  var trackPaneRate = document.getElementById("trackPaneRate");
  var attRateNum = document.getElementById("attRateNum");
  var attTodayState = document.getElementById("attTodayState");
  var attHistory = document.getElementById("attHistory");
  var ratingScore = document.getElementById("ratingScore");
  var ratingScoreOut = document.getElementById("ratingScoreOut");
  var ratingNote = document.getElementById("ratingNote");
  var ratingAvgNum = document.getElementById("ratingAvgNum");
  var ratingHistory = document.getElementById("ratingHistory");
  var currentTrackId = null;

  function currentTrackMember(){
    return members.find(function(x){ return x.id === currentTrackId; });
  }

  function switchTrackTab(tab){
    var isAtt = tab === "att";
    trackTabAtt.classList.toggle("on", isAtt);
    trackTabRate.classList.toggle("on", !isAtt);
    trackPaneAtt.style.display = isAtt ? "block" : "none";
    trackPaneRate.style.display = isAtt ? "none" : "block";
  }
  trackTabAtt.addEventListener("click", function(){ switchTrackTab("att"); });
  trackTabRate.addEventListener("click", function(){ switchTrackTab("rate"); });

  function renderTrackAtt(){
    var m = currentTrackMember(); if(!m || !trackModalBg.classList.contains("open")) return;
    var rate = attendanceRate(m);
    attRateNum.textContent = rate === null ? "—" : (rate + "%");
    var today = todayStr();
    var rec = m.attendance.find(function(a){ return a.date === today; });
    attTodayState.innerHTML =
      '<button class="att-btn present' + (rec && rec.present ? ' on' : '') + '" data-v="1">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> حاضر اليوم</button>' +
      '<button class="att-btn absent' + (rec && !rec.present ? ' on' : '') + '" data-v="0">' +
        '<svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg> غائب اليوم</button>';
    attTodayState.querySelectorAll(".att-btn").forEach(function(btn){
      btn.addEventListener("click", async function(){
        var present = btn.dataset.v === "1";
        btn.disabled = true;
        try{
          var up = await sb.from("attendance").upsert({ member_id: m.id, date: today, present: present }, { onConflict: "member_id,date" });
          if(up.error) throw up.error;
          await refreshAll();
          renderTrackAtt();
          showToast(present ? "اتسجل حضور " + m.name + " النهارده" : "اتسجل غياب " + m.name + " النهارده");
        }catch(err){ showToast("تعذر حفظ الحضور، حاول تاني", true); }
        btn.disabled = false;
      });
    });
    var sorted = m.attendance.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
    attHistory.innerHTML = sorted.length ? sorted.map(function(a){
      return '<div class="hist-row"><span>' + fmtDay(a.date) + '</span><span class="hist-badge ' + (a.present ? 'ok' : 'no') + '">' + (a.present ? "حاضر" : "غائب") + '</span></div>';
    }).join("") : '<p class="hist-empty">لا يوجد سجل حضور بعد</p>';
  }

  function renderTrackRate(keepInput){
    var m = currentTrackMember(); if(!m || !trackModalBg.classList.contains("open")) return;
    var avg = avgRating(m);
    ratingAvgNum.textContent = avg === null ? "—" : (avg + "/10");
    var today = todayStr();
    var rec = m.ratings.find(function(r){ return r.date === today; });
    if(!keepInput) ratingScore.value = rec ? rec.score : 7;
    ratingScoreOut.textContent = ratingScore.value;
    if(!keepInput){ ratingNote.value = rec ? (rec.note || "") : ""; ratingScoreOut.textContent = ratingScore.value; }
    var sorted = m.ratings.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
    ratingHistory.innerHTML = sorted.length ? sorted.map(function(r){
      return '<div class="hist-row rate-row"><span>' + fmtDay(r.date) + '</span><span class="hist-badge score">' + r.score + '/10</span>' +
        (r.note ? '<span class="hist-note">' + escapeHtml(r.note) + '</span>' : '') + '</div>';
    }).join("") : '<p class="hist-empty">لا يوجد تقييم بعد</p>';
  }

  ratingScore.addEventListener("input", function(){ ratingScoreOut.textContent = ratingScore.value; });

  document.getElementById("ratingSave").addEventListener("click", async function(){
    var m = currentTrackMember(); if(!m) return;
    var today = todayStr();
    var score = parseInt(ratingScore.value, 10);
    var note = ratingNote.value.trim();
    var btn = document.getElementById("ratingSave");
    btn.disabled = true;
    try{
      var up = await sb.from("ratings").upsert({ member_id: m.id, date: today, score: score, note: note || null }, { onConflict: "member_id,date" });
      if(up.error) throw up.error;
      await refreshAll();
      renderTrackRate();
      showToast("اتحفظ تقييم " + m.name + " النهارده (" + score + "/10)");
    }catch(err){ showToast("تعذر حفظ التقييم، حاول تاني", true); }
    btn.disabled = false;
  });

  function openTrack(id){
    var m = members.find(function(x){ return x.id === id; });
    if(!m) return;
    currentTrackId = id;
    trackName.textContent = m.name;
    trackCode.textContent = m.code || "";
    trackModalBg.classList.add("open");
    switchTrackTab("att");
    renderTrackAtt();
    renderTrackRate();
  }
  document.getElementById("trackClose").addEventListener("click", function(){ trackModalBg.classList.remove("open"); });
  trackModalBg.addEventListener("click", function(e){ if(e.target === trackModalBg) trackModalBg.classList.remove("open"); });

  /* ---------- نسخة احتياطية: تصدير / استيراد ---------- */
  var exportBtn = document.getElementById("exportBtn");
  var importBtn = document.getElementById("importBtn");
  var importFile = document.getElementById("importFile");

  if(exportBtn){
    exportBtn.addEventListener("click", function(){
      try{
        var blob = new Blob([JSON.stringify({ members: members, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "harif-academy-backup-" + todayStr() + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("تم تنزيل النسخة الاحتياطية");
      }catch(e){ showToast("تعذر إنشاء النسخة الاحتياطية", true); }
    });
  }
  if(importBtn && importFile){
    importBtn.addEventListener("click", function(){ importFile.click(); });
    importFile.addEventListener("change", function(){
      var file = importFile.files[0];
      if(!file) return;
      var reader = new FileReader();
      reader.onload = async function(){
        try{
          var data = JSON.parse(reader.result);
          var list = Array.isArray(data) ? data : (Array.isArray(data.members) ? data.members : null);
          if(!list) throw new Error("bad format");
          var existingCodes = {};
          members.forEach(function(m){ if(m.code) existingCodes[m.code] = m.id; });
          var added = 0, updated = 0;
          for(var i=0; i<list.length; i++){
            var im = normalize(list[i]);
            var memberId = existingCodes[im.code];
            if(!memberId){
              var code = im.code;
              if(!code || existingCodes[code] !== undefined){
                var codeRes = await sb.rpc("next_member_code");
                code = codeRes.data || ("HRF-" + Date.now());
              }
              var ins = await sb.from("members").insert({
                code: code, name: im.name, age: im.age, phone: im.phone,
                position: im.position || null, join_date: im.joinDate || new Date().toISOString()
              }).select().single();
              if(ins.error) continue;
              memberId = ins.data.id;
              existingCodes[code] = memberId;
              added++;
            } else {
              await sb.from("members").update({ name: im.name, age: im.age, phone: im.phone, position: im.position || null }).eq("id", memberId);
              updated++;
            }
            if(im.attendance && im.attendance.length){
              var attRows = im.attendance.map(function(a){ return { member_id: memberId, date: a.date, present: !!a.present }; });
              await sb.from("attendance").upsert(attRows, { onConflict: "member_id,date" });
            }
            if(im.ratings && im.ratings.length){
              var rateRows = im.ratings.map(function(r){ return { member_id: memberId, date: r.date, score: r.score, note: r.note || null }; });
              await sb.from("ratings").upsert(rateRows, { onConflict: "member_id,date" });
            }
          }
          await refreshAll();
          showToast("تم الاستيراد: " + added + " عضو جديد، " + updated + " تحديث");
        }catch(e){ showToast("ملف النسخة الاحتياطية غير صالح", true); }
        importFile.value = "";
      };
      reader.readAsText(file);
    });
  }

  /* ---------- تحميل مكتبات الـQR عند الحاجة فقط (تشغيل أسرع للموقع) ---------- */
  var libCache = {};
  function loadLib(src){
    if(!libCache[src]) libCache[src] = new Promise(function(res, rej){
      var s = document.createElement("script"); s.src = src; s.onload = res;
      s.onerror = function(){ delete libCache[src]; rej(new Error("load")); };
      document.head.appendChild(s);
    });
    return libCache[src];
  }
  var QR_GEN = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
  var QR_SCAN = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";

  /* تحديث مؤجّل: يجمع أحداث التزامن المتتالية في تحميل واحد بدل تحميل لكل حدث */
  var refreshTimer;
  function scheduleRefresh(){
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async function(){ await refreshAll(); renderTrackAtt(); renderTrackRate(true); }, 400);
  }

  var actx;
  function beep(ok){
    try{
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (ok ? 0.12 : 0.3));
    }catch(e){}
    if(navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
  }

  /* ---------- ماسح الكارنيه: تسجيل الحضور بمسح الـQR مباشرة ---------- */
  var scanBg = document.getElementById("scanModalBg");
  var scanResult = document.getElementById("scanResult");
  var scanCountEl = document.getElementById("scanCount");
  var scanManual = document.getElementById("scanManual");
  var scanner = null, scanBusy = false, scanCount = 0, lastScan = { code:"", t:0 };

  function feedback(type, msg){
    scanResult.className = "scan-result " + type;
    scanResult.textContent = msg;
    if(!scanBg.classList.contains("open")) showToast(msg, type === "err");
  }

  async function registerByCode(raw){
    var code = String(raw || "").trim().toUpperCase();
    if(!code || scanBusy) return;
    var now = Date.now();
    if(code === lastScan.code && now - lastScan.t < 3000) return; // منع تكرار نفس المسح
    lastScan = { code: code, t: now };
    var m = members.find(function(x){ return (x.code || "").toUpperCase() === code; });
    if(!m){ feedback("err", "كود غير موجود: " + code); beep(false); return; }
    var today = todayStr();
    var rec = m.attendance.find(function(a){ return a.date === today; });
    if(rec && rec.present){ feedback("warn", m.name + " — حضوره متسجل النهارده بالفعل"); beep(false); return; }
    scanBusy = true;
    try{
      var up = await sb.from("attendance").upsert({ member_id: m.id, date: today, present: true }, { onConflict: "member_id,date" });
      if(up.error) throw up.error;
      m.attendance = m.attendance.filter(function(a){ return a.date !== today; }).concat([{ date: today, present: true }]);
      scanCount++; scanCountEl.textContent = scanCount;
      renderStats(); renderList();
      feedback("ok", "اتسجل حضور " + m.name + " ✓");
      beep(true);
    }catch(err){
      lastScan.t = 0;
      feedback("err", "تعذر حفظ الحضور — تأكد من الإنترنت وامسح تاني");
      beep(false);
    }
    scanBusy = false;
  }

  async function openScan(){
    scanBg.classList.add("open");
    scanCount = 0; scanCountEl.textContent = "0";
    scanResult.className = "scan-result"; scanResult.textContent = "جاري تشغيل الكاميرا…";
    try{
      await loadLib(QR_SCAN);
      if(!scanBg.classList.contains("open")) return;
      scanner = new Html5Qrcode("scanReader", { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } },
        function(text){ registerByCode(text); }, function(){});
      scanResult.textContent = "وجّه الكاميرا على QR الكارنيه";
    }catch(e){
      scanner = null;
      feedback("err", "تعذر تشغيل الكاميرا — اسمح للموقع باستخدامها (لازم رابط https) أو اكتب الكود بالأسفل");
    }
  }
  async function closeScan(){
    scanBg.classList.remove("open");
    if(scanner){ var s = scanner; scanner = null; try{ await s.stop(); s.clear(); }catch(e){} }
  }
  document.getElementById("scanOpen").addEventListener("click", openScan);
  document.getElementById("scanClose").addEventListener("click", closeScan);
  scanBg.addEventListener("click", function(e){ if(e.target === scanBg) closeScan(); });
  scanManual.addEventListener("keydown", function(e){
    if(e.key !== "Enter") return;
    e.preventDefault();
    var v = scanManual.value; scanManual.value = "";
    registerByCode(v);
  });

  /* ---------- كارنيه اللاعب (QR) : عرض / تنزيل / طباعة ---------- */
  var cardBg = document.getElementById("cardModalBg");
  var cardImg = document.getElementById("cardImg");
  var cardMember = null;

  function drawCard(m){
    var W = 640, H = 900, c = document.createElement("canvas");
    c.width = W; c.height = H;
    var x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
    var g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "#15305c"); g.addColorStop(1, "#2f5fdb");
    x.fillStyle = g; x.fillRect(0, 0, W, 170);
    x.textAlign = "center"; x.direction = "rtl";
    x.fillStyle = "#ffffff"; x.font = "900 44px Cairo, Tajawal, sans-serif"; x.fillText("أكاديمية الحريف", W/2, 92);
    x.font = "500 22px Tajawal, sans-serif"; x.fillText("كارنيه لاعب", W/2, 135);
    var q = qrcode(0, "M"); q.addData(m.code); q.make();
    var n = q.getModuleCount(), cell = Math.floor(400 / n), qs = cell * n, ox = Math.round((W - qs) / 2), oy = 225;
    x.fillStyle = "#15305c";
    for(var r = 0; r < n; r++) for(var k = 0; k < n; k++) if(q.isDark(r, k)) x.fillRect(ox + k*cell, oy + r*cell, cell, cell);
    x.fillStyle = "#243149"; x.font = "800 40px Cairo, Tajawal, sans-serif"; x.fillText(m.name, W/2, 720, W - 80);
    x.fillStyle = "#2f5fdb"; x.direction = "ltr"; x.font = "800 34px Cairo, Tajawal, sans-serif"; x.fillText(m.code, W/2, 782);
    x.fillStyle = "#78859b"; x.direction = "rtl"; x.font = "500 20px Tajawal, sans-serif"; x.fillText("امسح الكود لتسجيل الحضور", W/2, 850);
    return c;
  }
  async function openCard(id){
    var m = members.find(function(x){ return x.id === id; });
    if(!m || !m.code) return;
    cardMember = m;
    cardImg.removeAttribute("src");
    cardBg.classList.add("open");
    try{
      await loadLib(QR_GEN);
      if(document.fonts && document.fonts.load){
        await Promise.race([document.fonts.load("900 44px Cairo"), new Promise(function(r){ setTimeout(r, 1500); })]);
      }
      cardImg.src = drawCard(m).toDataURL("image/png");
    }catch(e){
      cardBg.classList.remove("open");
      showToast("تعذر إنشاء الكارنيه — تأكد من الإنترنت وحاول تاني", true);
    }
  }
  document.getElementById("cardClose").addEventListener("click", function(){ cardBg.classList.remove("open"); });
  cardBg.addEventListener("click", function(e){ if(e.target === cardBg) cardBg.classList.remove("open"); });
  document.getElementById("cardDownload").addEventListener("click", function(){
    if(!cardImg.src || !cardMember) return;
    var a = document.createElement("a");
    a.href = cardImg.src; a.download = "card-" + cardMember.code + ".png";
    document.body.appendChild(a); a.click(); a.remove();
  });
  document.getElementById("cardPrint").addEventListener("click", function(){
    if(!cardImg.src) return;
    document.body.classList.add("printing-card"); window.print();
  });
  window.addEventListener("afterprint", function(){ document.body.classList.remove("printing-card"); });
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape"){ closeScan(); cardBg.classList.remove("open"); }
  });

  /* لو الجلسة انتهت أو اتلغت من جهاز تاني: ارجع لشاشة الدخول بدل ما الموقع يفضل فاضي */
  [sbLocal, sbSession].forEach(function(c){
    c.auth.onAuthStateChange(function(evt){
      if(evt === "SIGNED_OUT" && c === sb && appView.classList.contains("active")){
        teardownRealtime(); members = []; showLogin(); showToast("انتهت الجلسة — سجّل الدخول تاني", true);
      }
    });
  });

  /* ---------- بدء التشغيل: استعادة الجلسة لو موجودة ---------- */
  (async function boot(){
    try{
      var session = await resolveSession();
      if(session){ await enterApp(); }
    }catch(e){ /* يفضل يعرض شاشة الدخول */ }
  })();

})();
