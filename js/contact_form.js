let kidsData = [];
let selectedKid = null;
let selectedDate = null;
let calendarData = null;
let contactType = null;
let currentYearMonth = null;
let isSubmitting = false;
// ★ 編集用
let mode = "new";
let contactId = null;
/****************************************************
 * 初期化
 ****************************************************/
document.addEventListener("DOMContentLoaded", initPage);

async function initPage() {
  try {
    if (typeof restoreAuthCode === "function") {
      restoreAuthCode();
    }

    const params = new URLSearchParams(location.search);
    contactType = params.get("type");
    mode = params.get("mode") || "new";
    contactId = params.get("contactId");
    
    if (!contactType && mode === "new") {
      alert("連絡区分が指定されていません。");
      return;
    }

    if (!AUTH_CODE) {
      alert("認証情報がありません。LINEから再度アクセスしてください。");
      location.href = "index.html";
      return;
    }


    /* =========================
       ✏️ 編集モード
       ========================= */
    if (mode === "edit") {
      document.getElementById("title").textContent =
        `連絡内容の確認・変更 : ${contactType}連絡`;

      const detail = await loadContactDetail();
      if (!detail) return;

      applyEditRestrictions();    // ← 日付・園児・預かり制御
      setupAllergyUI();
      restoreForm(detail);        // ← UI完全復元

      return; // ★★★ ここが最重要 ★★★
    }

    /* =========================
       🆕 新規モード
       ========================= */
    await loadKids();             // 新規のみ
    setupAllergyUI();             // 新規のみ

  } catch (e) {
    console.error(e);
    alert("初期化に失敗しました");
  }
}

/****************************************************
 * 編集モード：連絡詳細取得
 ****************************************************/
async function loadContactDetail() {
  if (!contactId) return null;

  const res = await callApi({
    action: "get_contact_detail",
    contactId,
    authCode: AUTH_CODE
  });

  if (res?.result !== "success" || !res.contact) {
    return null;
  }

  return res.contact; // ★ そのまま返す
}
/****************************************************
 * 編集制御（重要）
 ****************************************************/
function applyEditRestrictions() {
  // ★ 園児選択の案内文を非表示
  const label = document.getElementById("kidSelectLabel");
  if (label) label.style.display = "none";
  const kidArea = document.getElementById("kidArea");
  if (kidArea) kidArea.style.display = "none";  
  
  // 日付・園児は変更不可
  document
    .querySelectorAll("input[name=kid]")
    .forEach(r => (r.disabled = true));

  document.getElementById("selectedDateBox").classList.add("disabled");
  const cancelArea = document.getElementById("cancelArea");
  if (cancelArea) cancelArea.style.display = "block";
  
  // 預かり保育は「変更不可」
  if (["預かり保育", "長期"].includes(contactType)) {
    document.getElementById("btnSubmit").style.display = "none";
  }

  // 削除ボタン表示
  const delBtn = document.getElementById("btnDelete");
  const notice = document.getElementById("cancelLimitNotice");
  
  const isExpired =
    selectedDate && !["預かり保育", "長期"].includes(contactType) && isAfterCancelLimit(selectedDate);

  if (delBtn && !isExpired && !["預かり保育", "長期"].includes(contactType)) {
    delBtn.style.display = "inline-block";
    delBtn.onclick = onDeleteContact;
  } else if (delBtn) {
    delBtn.style.display = "none";
  }

  // ★ 補助テキスト表示
  if (notice) {
    notice.style.display = isExpired ? "block" : "none";
  }
}
/****************************************************
 * 画面復元
 ****************************************************/
function restoreForm(d) {
  // ===== 連絡区分（変更不可だが判定用）=====
  contactType = d.contactType;

  // ===== 園児（編集モードは API 値で固定）=====
  selectedKid = {
    kidsid: d.kids.kidsId,
    name: d.kids.name,
    class: d.kids.className,
    lunchAvailable: d.kids.lunchAvailable,
    busUser: d.kids.busUser
  };

  
  // ===== 日付（変更不可）=====
  selectedDate = d.date.slice(0, 10);
  updateFormByType();

  document.getElementById("selectedDateBox").textContent =
    selectedDate.replace(/-/g, "/");

  // ★ 日付選択不可
  document.getElementById("selectedDateBox").classList.add("disabled");

  // ★ 編集モードでは即フォーム表示
  document.getElementById("formBody").style.display = "block";
  
  // ===== 理由 =====
  if (d.reason) {
    const r = document.querySelector(`input[name=reason][value="${d.reason}"]`);
    if (r) r.checked = true;
  }

  // ===== 備考 =====
  if (d.memo) {
    document.getElementById("memo").value = d.memo;
  }

  // ===== 荷物 =====
  if (d.baggage) {
    const b = document.querySelector(`input[name=baggage][value="${d.baggage}"]`);
    if (b) b.checked = true;
  }

  // ===== 給食 =====
  if (d.lunch) {
    const l = document.querySelector(`input[name=lunch][value="${d.lunch}"]`);
    if (l) l.checked = true;
  }

  // ===== 送り時間 =====
  if (d.sendTime) {
    document.getElementById("send").value = d.sendTime;
  }

  // ===== お迎え時間 =====
  if (d.pickupTime) {
    document.getElementById("pickup").value = d.pickupTime;
  }

  // ===== 保護者 =====
  if (d.guardian) {
    const g = document.querySelector(`input[name=guardian][value="${d.guardian}"]`);
    if (g) g.checked = true;
  }

  if (d.guardianOther) {
    document.getElementById("guardianOther").value = d.guardianOther;
  }

  // ===== アレルギー =====
  if (d.allergy) {
    document.querySelector(`input[name=allergy_flag][value="あり"]`).checked = true;
    document.getElementById("allergy_options").style.display = "block";

    d.allergy.split(" ").forEach(v => {
      const a = document.querySelector(`input[name=allergy_item][value="${v}"]`);
      if (a) a.checked = true;
    });
  }  
}

/****************************************************
 * 削除処理
 ****************************************************/
async function onDeleteContact() {
  if (!confirm("この連絡をキャンセルしますか？")) return;

  const res = await callApi({
    action: "delete_contact",
    contactId,
    authCode: AUTH_CODE
  });

  if (res?.result !== "success") {
    alert(res?.message || "キャンセルできませんでした");
    return;
  }

  alert("キャンセルしました");
  location.href = "contact_list.html";
}

/****************************************************
 * 園児取得
 ****************************************************/
async function loadKids() {
  const res = await apiGetKids();
  kidsData = res?.kids ?? [];

  const area = document.getElementById("kidArea");
  area.innerHTML = "";

  kidsData.forEach(k => {
    area.insertAdjacentHTML("beforeend", `
      <label class="inline-label">
        <input type="radio" name="kid" value="${k.kidsid}">
        ${k.name}
      </label>
    `);
  });

  if (mode === "new") {
    area.addEventListener("change", onKidSelected);
  }

}

/****************************************************
 * 園児選択 → カレンダー取得
 ****************************************************/
async function onKidSelected() {
  const id = document.querySelector("input[name=kid]:checked")?.value;
  selectedKid = kidsData.find(k => k.kidsid === id);
  if (!selectedKid) return;
  
  // ★ 状態リセット（重要）
  selectedDate = null;
  currentYearMonth = null;
  document.getElementById("formBody").style.display = "none";
  document.getElementById("selectedDateBox").textContent =
    "日付を選択してください ▼";

  // ★ 予約人数表示を消す（後述）
  hideChildcareStatus();
  
  calendarData = await apiGetCalendar({
    contactType,
    className: selectedKid.class,
    lunchAvailable: selectedKid.lunchAvailable,
    busUser: selectedKid.busUser
  });

  if (!calendarData?.calendar?.length) {
    alert("連絡可能な日がありません");
    return;
  }

  document.getElementById("calendarArea").classList.remove("hidden");
  document.getElementById("calendarWrap").classList.add("hidden");

  renderCalendarGrid(calendarData);
}

/****************************************************
 * カレンダー開閉（疑似セレクト）
 ****************************************************/
document.getElementById("selectedDateBox")?.addEventListener("click", () => {
  document.getElementById("calendarWrap").classList.toggle("hidden");
});

/****************************************************
 * カレンダー描画（月切替・正規カレンダー）
 ****************************************************/
function renderCalendarGrid({ calendar, lunchDates }) {
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarTitle");
  grid.innerHTML = "";

  // 月ごとにグループ化
  const byMonth = {};
  calendar.forEach(d => {
    const ym = d.slice(0, 7);
    (byMonth[ym] ||= []).push(d);
  });

  const months = Object.keys(byMonth).sort();
  if (!currentYearMonth) currentYearMonth = months[0];

  draw();

  function draw() {
    grid.innerHTML = "";

    title.textContent = currentYearMonth.replace("-", "年") + "月";

    document.getElementById("prevMonth").onclick = () => {
      const i = months.indexOf(currentYearMonth);
      if (i > 0) {
        currentYearMonth = months[i - 1];
        draw();
      }
    };

    document.getElementById("nextMonth").onclick = () => {
      const i = months.indexOf(currentYearMonth);
      if (i < months.length - 1) {
        currentYearMonth = months[i + 1];
        draw();
      }
    };

    // 曜日
    ["日","月","火","水","木","金","土"].forEach(w =>
      grid.insertAdjacentHTML("beforeend", `<div class="cal-head">${w}</div>`)
    );

    const dates = byMonth[currentYearMonth];
    const firstDate = new Date(currentYearMonth + "-01");
    const lastDate = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0);

    // 前空白
    for (let i = 0; i < firstDate.getDay(); i++) {
      grid.insertAdjacentHTML("beforeend", `<div class="cal-day empty"></div>`);
    }

    // 日付
    for (let d = 1; d <= lastDate.getDate(); d++) {
      const dateStr = `${currentYearMonth}-${String(d).padStart(2,"0")}`;
      const cell = document.createElement("div");

      if (!dates.includes(dateStr)) {
        cell.className = "cal-day disabled";
        cell.textContent = d;
      } else {
        cell.className = "cal-day selectable";
        cell.textContent = d;

        if ((lunchDates ?? []).includes(dateStr)) {
          cell.classList.add("lunch");
        }

        cell.onclick = async (e) => {
        await onDateSelected(dateStr, e.currentTarget);
        };
      }

      grid.appendChild(cell);
    }
  }
}
/****************************************************
 * 日付選択時の処理
 ****************************************************/
async function onDateSelected(dateStr, cellEl) {
  document.querySelectorAll(".cal-day")
    .forEach(c => c.classList.remove("selected"));

  cellEl?.classList.add("selected");

  selectedDate = dateStr;

  document.getElementById("selectedDateBox").textContent =
    dateStr.replace(/-/g, "/");

  document.getElementById("calendarWrap").classList.add("hidden");
  document.getElementById("formBody").style.display = "block";

  updateFormByType();

  if (["預かり保育", "長期"].includes(contactType)) {
    await checkChildcareSummary();
  }
}


/****************************************************
 * 連絡区分別 UI 制御（未変更）
 ****************************************************/
function updateFormByType() {
  if (mode === "new" && !selectedDate) return;
  const show = id => document.getElementById(id).style.display = "block";
  const hide = id => document.getElementById(id).style.display = "none";

  [
    "row-baggage",  //荷物持ち帰り
    "row-send",     // 送り時間
    "row-pickup",   // お迎え時間
    "row-lunch",    // 給食
    "row-guardian", // 保護者
    "row-bus",      // キャンセルバス
    "row-reason",   // ★ 理由
    "row-memo",     // ★ 備考
    "row-care",     // 預かり保育
    "row-allergy",  // ★アレルギー
    "care-normal",  // 通常預かり保育
    "care-long"     // 長期預かり保育
  ].forEach(hide);
  
  // ===== 理由・備考の制御 =====
  if (["欠席", "遅刻", "早退"].includes(contactType)) {
    show("row-reason");
    show("row-memo");
    setReasonOptions(contactType);
  }

  if (contactType === "預かり保育") {
    show("row-care");
    show("care-normal");
    show("row-allergy");
    show("row-memo");
    updatePickupForCare();
  }

  if (contactType === "長期") {
    show("row-care");
    show("care-long");
    show("row-allergy");
    show("row-memo");
    updatePickupForCare();
  }
  
  if (contactType === "欠席") {
    show("row-baggage");
  }

  if (contactType === "遅刻") {
    show("row-send");
    setSendTimes();
    if ((calendarData?.lunchDates ?? []).includes(selectedDate)) {
      show("row-lunch");
    }
  }

  if (contactType === "早退") {
    show("row-pickup");
    setPickupTimesForLeave();
    show("row-guardian");
    if ((calendarData?.lunchDates ?? []).includes(selectedDate)) {
      show("row-lunch");
    }
  }
 
  if (contactType === "園バス") {
    show("row-bus");
    show("row-guardian");
  }
}
/****************************************************
 * 預かり保育：以下の制御を実施
 通常午後チェックで午後の預かり内容表示
 長期ロングの場合課外後を非表示
 お迎え時間の表示制御
 ****************************************************/
document.addEventListener("change", (e) => {

  // 通常：午後ON/OFF
  if (e.target?.id === "normal_afternoon") {
    const area = document.getElementById("normal_afternoon_options");
    if (area) {
      area.style.display = e.target.checked ? "block" : "none";
      if (!e.target.checked) {
        document.querySelectorAll("input[name=normal_base]")
          .forEach(r => r.checked = false);
      }
    }
  }

  // 長期：ショート／ロング
  if (e.target?.name === "long_base") {
    const isLong = e.target.value === "ロング";
    document.querySelectorAll("input[name=long_extra]").forEach(r => {
      r.checked = false;
      r.disabled = isLong;
    });
  }

  // お迎え時間再計算
  if (
    e.target?.id === "normal_morning" ||
    e.target?.id === "normal_afternoon" ||
    e.target?.name === "normal_base" ||
    e.target?.name === "long_base" ||
    e.target?.name === "long_extra"
  ) {
    updatePickupForCare();
  }
});
/****************************************************
 * アレルギー表示制御
 ****************************************************/
function setupAllergyUI() {
  const options = document.getElementById("allergy_options");
  if (!options) return;

  document.querySelectorAll("input[name=allergy_flag]").forEach(r => {
    r.addEventListener("change", () => {
      options.style.display = (r.value === "あり" && r.checked)
        ? "block"
        : "none";
    });
  });
}
/****************************************************
 * 預かり保育の予約済人数チェック
 ****************************************************/
async function checkChildcareSummary() {
  if (!selectedDate) return;

  const res = await callApi({
    action: "check_childcare",
    authCode: AUTH_CODE,
    date: selectedDate,
    careType: contactType // 「預かり保育」or「長期」
  });

  if (!res?.ok || !res.detail) {
    console.warn("定員情報を取得できませんでした");
    return;
  }

  showChildcareSummary(res.detail);
}

/****************************************************
 * 預かり保育の予約済件数取得
 ****************************************************/
function showChildcareSummary(detail) {
  const row = document.getElementById("childcareStatus");
  const text = document.getElementById("childcareStatusText");
  const btn = document.getElementById("btnSubmit");

  if (!row || !text || !btn) return;

  row.classList.remove("hidden");
  row.style.display = "block";

  const lines = [];
  let isFull = false;

  if (detail.morning) {
    const remain = detail.morning.limit - detail.morning.reserved;
    lines.push(
      `朝：残り ${detail.morning.limit - detail.morning.reserved} 名 (定員 ${detail.morning.limit} 名)`
    );
    if (remain <= 0) isFull = true;
  }

  if (detail.afternoon) {
    const remain = detail.afternoon.limit - detail.afternoon.reserved;
    lines.push(
      `午後：残り ${detail.afternoon.limit - detail.afternoon.reserved} 名 (定員 ${detail.morning.limit} 名)`
    );
    if (remain <= 0) isFull = true;
  }

  text.innerHTML = lines.join("<br>");

  // ★ 両方満員なら送信不可
  btn.disabled = isFull;
}

function hideChildcareStatus() {
  const row = document.getElementById("childcareStatus");
  if (!row) return;

  row.classList.add("hidden");
  row.style.display = "none";
}
/****************************************************
 * 送信処理
 ****************************************************/
document.getElementById("btnSubmit")?.addEventListener("click", onSubmitContact);

async function onSubmitContact() {
  
  try {
    // ===== 必須チェック =====
    if (!selectedKid && mode === "new") {
      alert("園児を選択してください");
      return;
    }
  
    if (!selectedDate && mode === "new") {
      alert("日付を選択してください");
      return;
    }
    
    const reason = document.querySelector("input[name=reason]:checked")?.value;
    if (!reason && ["欠席","遅刻","早退"].includes(contactType)) {
      alert("理由を選択してください");
      return;
    }

    if (isSubmitting) return; // ★ 二重送信防止
    isSubmitting = true;

    // ===== payload 作成 =====
    const payload = mode === "edit"
        ? buildUpdatePayload()
        : buildSubmitPayload();
    
    if (!payload) return;
    
    // ===== 送信 =====
    const btn = document.getElementById("btnSubmit");
    btn.disabled = true;
    btn.textContent = "送信中…";

    const res = mode === "edit"
        ? await callApi(payload)
        : await apiSubmitContact(payload);
    

    // ★★★ 追加：Logic Apps のエラー判定 ★★★
    if (!res || res.result !== "success") {
      alert(res?.message || "送信に失敗しました。");
      return; // ← ここで止める（画面遷移しない）
    }
    
    alert("連絡を送信しました");
    location.href = "index.html";

  } catch (e) {
    console.error(e);
    alert("送信に失敗しました。もう一度お試しください。");
  } finally {
    isSubmitting = false;
    const btn = document.getElementById("btnSubmit");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "送信";
    }
  }
}

/****************************************************
 * payload 作成
 ****************************************************/
function buildSubmitPayload() {
  const payload = {
    action: "submit_contact",
    lineId: localStorage.getItem("LINE_ID") || null, // ★追加
    authCode: AUTH_CODE,
    contactType,
    date: selectedDate,
    kid: selectedKid.kidsid,
    busUser: selectedKid.busUser,
    reason: document.querySelector("input[name=reason]:checked")?.value || null,
    memo: document.getElementById("memo")?.value || null
  };

  // ===== 連絡区分別 =====
  if (contactType === "欠席") {
    payload.baggage =
      document.querySelector("input[name=baggage]:checked")?.value || null;

    payload.lunch =
      document.querySelector("input[name=lunch]:checked")?.value || null;
  }

  if (contactType === "遅刻") {
    payload.sendTime = document.getElementById("send")?.value || null;
    payload.lunch =
      document.querySelector("input[name=lunch]:checked")?.value || null;
  }

  if (contactType === "早退") {
    payload.guardian =
      document.querySelector("input[name=guardian]:checked")?.value || null;

    payload.guardianOther =
      document.getElementById("guardianOther")?.value || null;

    payload.lunch =
      document.querySelector("input[name=lunch]:checked")?.value || null;
  }

  if (contactType === "園バス") {
    payload.busMorning =
      document.getElementById("bus_morning")?.checked
        ? document.getElementById("bus_morning").value
        : null;

    payload.busEvening =
      document.getElementById("bus_evening")?.checked
        ? document.getElementById("bus_evening").value
        : null;

    payload.guardian =
      document.querySelector("input[name=guardian]:checked")?.value || null;

    payload.guardianOther =
      document.getElementById("guardianOther")?.value || null;
  }
  
  if (["預かり保育", "長期"].includes(contactType)) {
    const care = getCareValue();
    if (!care) return null;
    payload.care = care;
  }
// =====お迎え時間 =====
const pickupEl = document.getElementById("pickup");
if (pickupEl && pickupEl.offsetParent !== null) {
  payload.pickupTime = pickupEl.value || null;
}
// ===== アレルギー =====
const allergyFlag =
  document.querySelector("input[name=allergy_flag]:checked")?.value;

if (allergyFlag === "あり") {
  const items = Array.from(
    document.querySelectorAll("input[name=allergy_item]:checked")
  ).map(i => i.value);

  payload.allergy = items.length ? items.join(" ") : null;
} else {
  payload.allergy = null;
}
  
/* ★★★ 追加：長期預かり保育のみ ★★★ */
if (contactType === "長期") {
  payload.longCareType =
    document.querySelector("input[name=long_base]:checked")?.value || null;
}
  
  return payload;
}
/****************************************************
 * 更新用 payload
 ****************************************************/
function buildUpdatePayload() {
  const payload = {
    action: "update_contact",
    authCode: AUTH_CODE,
    contactId,               // ★必須
    contactType              // ★判定用（変更不可だが送る）
  };

  // ===== 理由・備考 =====
  payload.reason =
    document.querySelector("input[name=reason]:checked")?.value || null;

  payload.memo =
    document.getElementById("memo")?.value || null;

  // ===== 欠席 =====
  if (contactType === "欠席") {
    payload.baggage =
      document.querySelector("input[name=baggage]:checked")?.value || null;

    payload.lunch =
      document.querySelector("input[name=lunch]:checked")?.value || null;
  }

  // ===== 遅刻 =====
  if (contactType === "遅刻") {
    payload.sendTime =
      document.getElementById("send")?.value || null;

    payload.lunch =
      document.querySelector("input[name=lunch]:checked")?.value || null;
  }

  // ===== 早退 =====
  if (contactType === "早退") {
    payload.pickupTime =
      document.getElementById("pickup")?.value || null;

    payload.guardian =
      document.querySelector("input[name=guardian]:checked")?.value || null;

    payload.guardianOther =
      document.getElementById("guardianOther")?.value || null;

    payload.lunch =
      document.querySelector("input[name=lunch]:checked")?.value || null;
  }

  // ===== 園バス =====
  if (contactType === "園バス") {
    payload.busMorning =
      document.getElementById("bus_morning")?.checked
        ? document.getElementById("bus_morning").value
        : null;

    payload.busEvening =
      document.getElementById("bus_evening")?.checked
        ? document.getElementById("bus_evening").value
        : null;

    payload.guardian =
      document.querySelector("input[name=guardian]:checked")?.value || null;

    payload.guardianOther =
      document.getElementById("guardianOther")?.value || null;
  }

  // ===== アレルギー =====
  const allergyFlag =
    document.querySelector("input[name=allergy_flag]:checked")?.value;

  if (allergyFlag === "あり") {
    const items = Array.from(
      document.querySelectorAll("input[name=allergy_item]:checked")
    ).map(i => i.value);

    payload.allergy = items.length ? items.join(" ") : null;
  } else {
    payload.allergy = null;
  }

  return payload;
}
/****************************************************
 * 戻るボタン
 ****************************************************/
document.getElementById("btnBack")?.addEventListener("click", () => {
  // メニューへ
  location.href = "index.html";
});
/****************************************************
 * 預かり内容生成（追加）
 ****************************************************/
function getCareValue() {
  const v = [];

  if (contactType === "預かり保育") {
    const morning = document.getElementById("normal_morning");
    if (morning?.checked && morning.value) {
      v.push(morning.value);
    }

    if (document.getElementById("normal_afternoon")?.checked) {
      const base =
        document.querySelector("input[name=normal_base]:checked")?.value;
      if (!base) {
        alert("午後の内容を選択してください");
        return null;
      }
      v.push(base);
    }

    if (v.length === 0) {
      alert("朝預または午後を選択してください");
      return null;
    }
  }

  if (contactType === "長期") {
    const base =
      document.querySelector("input[name=long_base]:checked")?.value;
    if (!base) {
      alert("ショート／ロングを選択してください");
      return null;
    }

    const longmorning = document.getElementById("long_morning");
    if (longmorning?.checked && longmorning.value) {
      v.push(longmorning.value);
    }
    // 課外（ショート時のみ）
    if (base === "ショート") {
      const extra =
        document.querySelector("input[name=long_extra]:checked")?.value;
      if (extra) {
        v.push(extra);
      }
    }
  }

  return v.join(" ");
}
/****************************************************
 * 補助
 ****************************************************/
function setReasonOptions(type) {
  const map = {
    "欠席": ["私用","通院","体調不良","その他"],
    "遅刻": ["私用","通院","寝坊","その他"],
    "早退": ["私用","通院","その他"]
  };

  const area = document.getElementById("reasonArea");
  area.innerHTML = "";

  (map[type] || []).forEach(r => {
    area.insertAdjacentHTML("beforeend", `
      <label class="inline-label">
        <input type="radio" name="reason" value="${r}">${r}
      </label>
    `);
  });
}
/****************************************************
 * お迎え時間 制御
 ****************************************************/
function updatePickupForCare() {
  updatePickupVisibility();
  updatePickupTimes();
}

function updatePickupVisibility() {
  const row = document.getElementById("row-pickup");
  if (!row) return;

  if (contactType === "預かり保育") {
    const morning = document.getElementById("normal_morning")?.checked;
    const afternoon = document.getElementById("normal_afternoon")?.checked;
    row.style.display = (morning && !afternoon) ? "none" : "block";
    return;
  }

  row.style.display = "block";
}

function updatePickupTimes() {
  let list = [];

  if (contactType === "預かり保育") {
    const base =
      document.querySelector("input[name=normal_base]:checked")?.value;

    if (["課外後1", "課外後2"].includes(base)) {
      list = PICKUP_TIME.CARE_C;
    } else {
      list = PICKUP_TIME.CARE_A;
    }
  }

  if (contactType === "長期") {
    const base =
      document.querySelector("input[name=long_base]:checked")?.value;

    if (base === "ショート") {
      const extra =
        document.querySelector("input[name=long_extra]:checked")?.value;
      list = ["課外後1","課外後2"].includes(extra)
        ? PICKUP_TIME.CARE_C
        : PICKUP_TIME.CARE_B;
    }

    if (base === "ロング") {
      list = PICKUP_TIME.CARE_A;
    }
  }

  if (list.length) {
    setTimes("pickup", list);
  }
}

/****************************************************
 * お迎え時間 定義（用途別）
 ****************************************************/
const PICKUP_TIME = {
  // 遅刻・早退（既存）
  DEFAULT: [
    "10:00","10:30","11:00","11:30","12:00"
  ],

  // 預かり保育・長期 共通
  CARE_A: [ // ①
    "12:00","12:30","13:00","13:30",
    "14:00","14:30","15:00","15:30",
    "16:00","16:30","17:00"
  ],
  CARE_B: [ // ②
    "12:00","12:30","13:00","13:30","14:00"
  ],
  CARE_C: [ // ③
    "16:00","17:00"
  ]
};
// 9:10判定用ユーティリティ
function isAfterCancelLimit(dateStr) {
  if (!dateStr) return false;

  const now = new Date();
  const target = new Date(dateStr + "T09:10:00");

  // 当日かつ 9:10 超え
  return (
    now.toDateString() === target.toDateString() &&
    now > target
  );
}
// ===== その他 =====
function setSendTimes() {
  setTimes("send", ["9:30","10:00","10:30","11:00","11:30"]);
}
function setPickupTimesForLeave() {
  setTimes("pickup", PICKUP_TIME.DEFAULT);
}
function setTimes(id, list) {
  const sel = document.getElementById(id);
  sel.innerHTML = "";
  list.forEach(t => sel.insertAdjacentHTML("beforeend", `<option>${t}</option>`));
}
