/* ============================================================
 * contact_form.js
 * 連絡フォーム（新規・表示・編集）
 * ============================================================ */

// ----------------------------------------
// グローバル変数
// ----------------------------------------
let kidsData = [];
let selectedKid = null;
let selectedDate = null;
let calendarData = null;
let contactType = null;
let currentYearMonth = null;
let isSubmitting = false;

// モード: "new" | "view" | "edit"
let mode = "new";
let contactId = null;

// ----------------------------------------
// お迎え時間 定義
// ----------------------------------------
const PICKUP_TIME = {
  DEFAULT: ["10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30"],
  CARE_A:  ["12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"],
  CARE_B:  ["12:00","12:30","13:00","13:30","14:00"],
  CARE_C:  ["16:00","17:00"]
};

// ----------------------------------------
// 連絡区分ごとの表示フィールド定義
// ----------------------------------------
const FORM_FIELDS = {
  "欠席":     ["row-baggage", "row-reason", "row-memo"],
  "遅刻":     ["row-send", "row-reason", "row-memo"],
  "早退":     ["row-pickup", "row-guardian", "row-reason", "row-memo"],
  "園バス":   ["row-bus", "row-guardian"],
  "預かり保育": ["row-care", "care-normal", "row-allergy", "row-memo"],
  "長期":     ["row-care", "care-long", "row-allergy", "row-memo"]
};

const ALL_FORM_FIELDS = [
  "row-baggage", "row-send", "row-pickup", "row-lunch",
  "row-guardian", "row-bus", "row-reason", "row-memo",
  "row-care", "row-allergy", "care-normal", "care-long"
];

// ============================================================
// 初期化
// ============================================================
document.addEventListener("DOMContentLoaded", initPage);

async function initPage() {
  try {
    if (typeof restoreAuthCode === "function") {
      restoreAuthCode();
    }

    const params = new URLSearchParams(location.search);
    contactType = params.get("type");
    mode        = params.get("mode") || "new";
    contactId   = params.get("contactId");

    hideAllAreas();
    hideAllButtons();

    if (mode === "new") {
      document.getElementById("editInfoArea").style.display = "block";
    } else if (mode === "view") {
      const cancelArea = document.getElementById("cancelArea");
      if (cancelArea) cancelArea.style.display = "block";
    } else if (mode === "edit") {
      document.getElementById("commonInfoArea").style.display = "block";
    }

    if (!contactType && mode === "new") {
      alert("連絡区分が指定されていません。");
      return;
    }

    // ヘッダー表示
    const typeEl = document.getElementById("viewContactType");
    if (typeEl && contactType) {
      typeEl.textContent = `${contactType} 連絡`;
    }

    if (!AUTH_CODE) {
      alert("認証情報がありません。LINEから再度アクセスしてください。");
      location.href = "index.html";
      return;
    }

    // 新規モード
    if (mode === "new") {
      await loadKids();
      document.getElementById("btnSubmit").style.display = "inline-block";
      document.getElementById("btnBack").style.display   = "inline-block";
      setupAllergyUI();
      return;
    }

    // 表示・編集モード
    const detail = await loadContactDetail();
    if (!detail) return;

    restoreBase(detail);
    enterViewMode(detail);

  } catch (e) {
    console.error(e);
    alert("初期化に失敗しました");
  }
}

// ============================================================
// 表示制御
// ============================================================
function hideAllAreas() {
  ["commonInfoArea", "editInfoArea", "viewDetailArea", "formBody"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function hideAllButtons() {
  ["btnEdit", "btnDeleteView", "btnBack", "btnSubmit", "cancelLimitNotice"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

// ============================================================
// 連絡詳細取得
// ============================================================
async function loadContactDetail() {
  if (!contactId) return null;

  const res = await callApi({
    action: "get_contact_detail",
    contactId,
    authCode: AUTH_CODE
  });

  if (res?.result !== "success" || !res.contact) return null;
  return res.contact;
}

// ============================================================
// 基本情報復元（表示・編集共通）
// ============================================================
function restoreBase(d) {
  contactType = d.contactType;

  selectedKid = {
    kidsid:        d.kids.kidsId,
    name:          d.kids.name,
    class:         d.kids.className,
    lunchAvailable: d.kids.lunchAvailable,
    busUser:       d.kids.busUser
  };

  selectedDate = d.date.slice(0, 10);

  const kidEl  = document.getElementById("viewKid");
  const dateEl = document.getElementById("viewDate");
  if (kidEl)  kidEl.textContent  = selectedKid.name;
  if (dateEl) dateEl.textContent = selectedDate.replace(/-/g, "/");
}

// ============================================================
// 表示モード
// ============================================================
function enterViewMode(d) {
  mode = "view";

  const actionArea = document.getElementById("actionArea");
  if (actionArea) actionArea.style.display = "block";

  document.getElementById("commonInfoArea").style.display  = "block";
  document.getElementById("viewDetailArea").style.display  = "block";
  document.getElementById("editInfoArea").style.display    = "none";
  document.getElementById("formBody").style.display        = "none";

  document.getElementById("viewDetail").innerHTML = buildViewDetail(d);

  // ボタン制御
  const btnEdit   = document.getElementById("btnEdit");
  const btnDelete = document.getElementById("btnDeleteView");
  const btnBack   = document.getElementById("btnBack");
  const btnSubmit = document.getElementById("btnSubmit");

  if (btnSubmit) btnSubmit.style.display = "none";
  if (btnBack)   btnBack.style.display   = "inline-block";

  // 編集ボタン（預かり保育・長期は不可）
  if (btnEdit) {
    const canEdit = !["預かり保育", "長期"].includes(contactType);
    btnEdit.style.display = canEdit ? "inline-block" : "none";
    if (canEdit) btnEdit.onclick = () => enterEditMode(d);
  }

  // キャンセルボタン
  if (btnDelete) {
    if (canCancelContact()) {
      btnDelete.style.display = "inline-block";
      btnDelete.onclick = onDeleteContact;
    } else {
      btnDelete.style.display = "none";
    }
  }

  // 戻るボタン
  document.getElementById("btnBack").onclick = () => {
    location.href = "index.html";
  };
}

// ============================================================
// キャンセル可否判定
// ============================================================
function canCancelContact() {
  if (!selectedDate) return false;
  return !isAfterCancelLimit(selectedDate);
}

// ============================================================
// 表示内容生成
// ============================================================
function buildViewDetail(d) {
  const lines = [];

  if (d.sendTime)     lines.push(`送り時間：${d.sendTime}`);
  if (d.pickupTime)   lines.push(`お迎え時間：${d.pickupTime}`);
  if (d.guardian)     lines.push(`来園者：${d.guardian}`);
  if (d.guardianOther) lines.push(`（${d.guardianOther}）`);
  if (d.baggage)      lines.push(`荷物：${d.baggage}`);
  if (d.lunch)        lines.push(`給食：${d.lunch}`);

  // 園バス
  if (d.contactType === "園バス") {
    const busLines = [];
    if (d.busMorning === "乗らない") busLines.push("朝バス：乗らない");
    if (d.busEvening === "乗らない") busLines.push("帰りバス：乗らない");
    if (busLines.length) {
      lines.push(`園バス：<br>${busLines.map(v => `・${v}`).join("<br>")}`);
    }
  }

  // 預かり保育・長期
  if (d.childcare) {
    const careLines = d.childcare.split(" ").map(v => `・${v}`);
    lines.push(`預かり区分：<br>${careLines.join("<br>")}`);
  }

  if (d.allergy) lines.push(`アレルギー：${d.allergy}`);
  if (d.reason)  lines.push(`理由：${d.reason}`);
  if (d.memo)    lines.push(`備考：${d.memo}`);

  return lines.join("<br>");
}

// ============================================================
// 編集モード
// ============================================================
function enterEditMode(d) {
  mode = "edit";

  const actionArea = document.getElementById("actionArea");
  if (actionArea) actionArea.style.display = "block";

  document.getElementById("viewDetailArea").style.display = "none";
  document.getElementById("formBody").style.display       = "block";

  restoreFormDetail(d);
  setupAllergyUI();
  applyEditRestrictions();

  // ボタン制御
  const btnEdit   = document.getElementById("btnEdit");
  const btnDelete = document.getElementById("btnDeleteView");
  const btnBack   = document.getElementById("btnBack");
  const btnSubmit = document.getElementById("btnSubmit");
  const notice    = document.getElementById("cancelLimitNotice");

  if (btnEdit) btnEdit.style.display = "none";
  if (btnBack) btnBack.style.display = "inline-block";

  // 預かり保育・長期は更新不可
  if (btnSubmit) {
    btnSubmit.style.display = ["預かり保育", "長期"].includes(contactType)
      ? "none"
      : "inline-block";
  }

  // キャンセルボタン
  if (btnDelete) {
    if (canCancelContact()) {
      btnDelete.style.display = "inline-block";
      btnDelete.onclick = onDeleteContact;
    } else {
      btnDelete.style.display = "none";
    }
  }

  // 期限切れなら送信不可
  if (selectedDate && isAfterCancelLimit(selectedDate)) {
    if (btnSubmit) btnSubmit.disabled = true;
    if (notice)    notice.style.display = "block";
  } else {
    if (notice) notice.style.display = "none";
  }
}

// ============================================================
// フォーム詳細復元（編集モード用）
// ============================================================
function restoreFormDetail(d) {
  if (!d) return;

  // フォーム構造切替（理由の復元より先に実行する必要あり）
  updateFormByType();

  // 理由
  if (d.reason) {
    const r = document.querySelector(`input[name=reason][value="${d.reason}"]`);
    if (r) r.checked = true;
  }

  // 備考
  const memo = document.getElementById("memo");
  if (memo && typeof d.memo === "string") memo.value = d.memo;

  // 荷物
  if (d.baggage) {
    const b = document.querySelector(`input[name=baggage][value="${d.baggage}"]`);
    if (b) b.checked = true;
  }

  // 給食
  if (d.lunch) {
    const l = document.querySelector(`input[name=lunch][value="${d.lunch}"]`);
    if (l) l.checked = true;
  }

  // 送り時間
  const send = document.getElementById("send");
  if (send && d.sendTime) send.value = d.sendTime;

  // お迎え時間（option 再生成後に復元するため、ここでは値だけ控える）
  // ※ 預かり保育・長期は updatePickupForCare() で option が作り直されるため、
  //   復元はこの関数末尾（再計算後）で行う。

  // 保護者
  if (d.guardian) {
    const g = document.querySelector(`input[name=guardian][value="${d.guardian}"]`);
    if (g) g.checked = true;
  }
  const guardianOther = document.getElementById("guardianOther");
  if (guardianOther && typeof d.guardianOther === "string") {
    guardianOther.value = d.guardianOther;
  }

  // 園バス
  if (contactType === "園バス") {
    const morning = document.getElementById("bus_morning");
    const evening = document.getElementById("bus_evening");
    if (morning) morning.checked = (d.busMorning === "乗らない");
    if (evening) evening.checked = (d.busEvening === "乗らない");
  }

  // アレルギー
  if (d.allergy) {
    const flag = document.querySelector(`input[name=allergy_flag][value="あり"]`);
    if (flag) flag.checked = true;

    const options = document.getElementById("allergy_options");
    if (options) options.style.display = "block";

    d.allergy.split(" ").forEach(v => {
      const a = document.querySelector(`input[name=allergy_item][value="${v}"]`);
      if (a) a.checked = true;
    });
  }

  // 預かり保育・長期：お迎え時間再計算
  if (["預かり保育", "長期"].includes(contactType)) {
    updatePickupForCare();
  }

  // お迎え時間の復元（option 生成・再計算が終わった後に値をセット）
  const pickup = document.getElementById("pickup");
  if (pickup && d.pickupTime) pickup.value = d.pickupTime;

  // 日付表示（編集不可）
  if (selectedDate) {
    const dateBox = document.getElementById("selectedDateBox");
    if (dateBox) {
      dateBox.textContent = selectedDate.replace(/-/g, "/");
      dateBox.classList.add("disabled");
    }
  }

  document.getElementById("formBody").style.display = "block";
}

// ============================================================
// 削除（キャンセル）
// ============================================================
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
  location.href = "index.html";
}

// ============================================================
// 編集モード制限適用
// ============================================================
function applyEditRestrictions() {
  const cancelArea = document.getElementById("cancelArea");
  if (cancelArea) cancelArea.style.display = "block";

  // 預かり保育・長期は更新不可
  if (["預かり保育", "長期"].includes(contactType)) {
    const submitBtn = document.getElementById("btnSubmit");
    if (submitBtn) submitBtn.style.display = "none";
  }
}

// ============================================================
// 園児取得
// ============================================================
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

// ============================================================
// 園児選択 → カレンダー取得
// ============================================================
async function onKidSelected() {
  const id = document.querySelector("input[name=kid]:checked")?.value;
  const found = kidsData.find(k => k.kidsid === id);
  if (!found) return;

  // extrac_xxx を含む全フィールドを保持
  selectedKid = {
    kidsid:         found.kidsid,
    name:           found.name,
    class:          found.class,
    lunchAvailable: found.lunchAvailable,
    busUser:        found.busUser,
    extrac_mon:     found.extrac_mon  ?? null,
    extrac_tue:     found.extrac_tue  ?? null,
    extrac_wed:     found.extrac_wed  ?? null,
    extrac_thu:     found.extrac_thu  ?? null,
    extrac_fri:     found.extrac_fri  ?? null
  };

  // 状態リセット
  selectedDate = null;
  currentYearMonth = null;
  document.getElementById("formBody").style.display = "none";
  document.getElementById("selectedDateBox").textContent = "日付を選択してください ▼";
  hideChildcareStatus();

  calendarData = await apiGetCalendar({
    contactType,
    className:      selectedKid.class,
    lunchAvailable: selectedKid.lunchAvailable,
    busUser:        selectedKid.busUser
  });

  if (!calendarData?.calendar?.length) {
    alert("連絡可能な日がありません");
    return;
  }

  document.getElementById("calendarArea").classList.remove("hidden");
  document.getElementById("calendarWrap").classList.add("hidden");

  renderCalendarGrid(calendarData);
}

// ============================================================
// カレンダー開閉
// ============================================================
document.getElementById("selectedDateBox")?.addEventListener("click", () => {
  document.getElementById("calendarWrap").classList.toggle("hidden");
});

// ============================================================
// カレンダー描画
// ============================================================
function renderCalendarGrid({ calendar, lunchDates, morningDates }) {
  const grid  = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarTitle");

  // 月ごとにグループ化
  const byMonth = {};
  calendar.forEach(d => {
    const ym = d.slice(0, 7);
    (byMonth[ym] ||= []).push(d);
  });

  const months = Object.keys(byMonth).sort();
  if (!currentYearMonth) currentYearMonth = months[0];

  // 課外クラス参加園児かどうか（いずれかの曜日が true なら参加）
  const isExtracKid = selectedKid && [
    "extrac_mon","extrac_tue","extrac_wed","extrac_thu","extrac_fri"
  ].some(k => selectedKid[k] === true);

  draw();

  function draw() {
    grid.innerHTML = "";
    title.textContent = currentYearMonth.replace("-", "年") + "月";

    const currentIndex = months.indexOf(currentYearMonth);
    const prevBtn = document.getElementById("prevMonth");
    const nextBtn = document.getElementById("nextMonth");

    // 前月ボタン
    prevBtn.disabled    = currentIndex <= 0;
    prevBtn.style.opacity = currentIndex <= 0 ? "0.3" : "1.0";
    prevBtn.onclick = currentIndex <= 0 ? null : () => {
      currentYearMonth = months[currentIndex - 1];
      draw();
    };

    // 次月ボタン
    nextBtn.disabled    = currentIndex >= months.length - 1;
    nextBtn.style.opacity = currentIndex >= months.length - 1 ? "0.3" : "1.0";
    nextBtn.onclick = currentIndex >= months.length - 1 ? null : () => {
      currentYearMonth = months[currentIndex + 1];
      draw();
    };

    // 曜日ヘッダー
    ["日","月","火","水","木","金","土"].forEach(w =>
      grid.insertAdjacentHTML("beforeend", `<div class="cal-head">${w}</div>`)
    );

    const dates     = byMonth[currentYearMonth];
    const firstDate = new Date(currentYearMonth + "-01");
    const lastDate  = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0);

    // 前空白
    for (let i = 0; i < firstDate.getDay(); i++) {
      grid.insertAdjacentHTML("beforeend", `<div class="cal-day empty"></div>`);
    }

    // 日付
    for (let d = 1; d <= lastDate.getDate(); d++) {
      const dateStr = `${currentYearMonth}-${String(d).padStart(2, "0")}`;
      const cell    = document.createElement("div");

      if (!dates.includes(dateStr)) {
        cell.className   = "cal-day disabled";
        cell.textContent = d;
      } else {
        cell.className   = "cal-day selectable";

        // * 付与判定：課外参加園児 かつ 課外カレンダーに含まれる日
        const isExtracDate = isExtracKid &&
          (calendarData?.extrac ?? []).includes(dateStr);

        cell.textContent = isExtracDate ? `${d}*` : d;

        if ((lunchDates   ?? []).includes(dateStr)) cell.classList.add("lunch");
        if ((morningDates ?? []).includes(dateStr)) cell.classList.add("morning");
        cell.onclick = async (e) => onDateSelected(dateStr, e.currentTarget);
      }
      grid.appendChild(cell);
    }
  }
}

// ============================================================
// 日付選択
// ============================================================
async function onDateSelected(dateStr, cellEl) {
  document.querySelectorAll(".cal-day").forEach(c => c.classList.remove("selected"));
  if (cellEl) cellEl.classList.add("selected");

  selectedDate = dateStr;
  document.getElementById("selectedDateBox").textContent = dateStr.replace(/-/g, "/");
  document.getElementById("calendarWrap").classList.add("hidden");
  document.getElementById("formBody").style.display = "block";

  updateFormByType();

  if (["預かり保育", "長期"].includes(contactType)) {
    await checkChildcareSummary();
  }
}

// ============================================================
// 連絡区分別 UI 制御
// ============================================================
function updateFormByType() {
  if (mode === "new" && !selectedDate) return;

  // 全フィールドを一旦非表示
  ALL_FORM_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  // 連絡区分に応じたフィールドを表示
  (FORM_FIELDS[contactType] ?? []).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });

  // 連絡区分ごとの追加処理
  if (["欠席", "遅刻", "早退"].includes(contactType)) {
    setReasonOptions(contactType);
  }

  if (contactType === "遅刻") {
    setSendTimes();
  }

  if (contactType === "早退") {
    setPickupTimesForLeave();
  }

  if (["預かり保育", "長期"].includes(contactType)) {
    updatePickupForCare();
  }

  // 預かり保育：課外選択肢の制御
  if (contactType === "預かり保育") {
    applyExtracOptions();
  }

  // 長期：課外選択肢の制御
  if (contactType === "長期") {
    applyExtracOptionsForLong();
  }
}

// ============================================================
// 預かり保育：チェックボックス変更時の制御
// ============================================================
document.addEventListener("change", (e) => {

  // 通常：午後ON/OFF
  if (e.target?.id === "normal_afternoon") {
    const area = document.getElementById("normal_afternoon_options");
    if (area) {
      area.style.display = e.target.checked ? "block" : "none";
      if (!e.target.checked) {
        document.querySelectorAll("input[name=normal_base]").forEach(r => r.checked = false);
        // 午後OFFで警告も消す
        updateNormalWarning();
      }
    }
    // 午後ONになったタイミングでも選択肢を再制御
    if (e.target.checked) applyExtracOptions();
  }

  // 長期：ショート／ロング切替
  if (e.target?.name === "long_base") {
    const isLong = e.target.value === "ロング";
    document.querySelectorAll("input[name=long_extra]").forEach(r => {
      r.checked  = false;
      r.disabled = isLong;
    });
    applyExtracOptionsForLong();
    // ロング選択時は警告不要（課外選択できないため）
    updateLongWarning();
  }

  // 預かり保育：通常 / 課外後1 / 課外後2 の選択変化
  if (e.target?.name === "normal_base") {
    updateNormalWarning();
    updatePickupForCare();
  }

  // 長期：課外後1 / 課外後2 の選択変化
  if (e.target?.name === "long_extra") {
    updateLongWarning();
    updatePickupForCare();
  }

  // お迎え時間の再計算（既存トリガー維持）
  const pickupTriggers = [
    "normal_morning", "normal_afternoon",
    "long_base", "long_extra"
  ];
  if (pickupTriggers.some(id =>
    e.target?.id === id || e.target?.name === id
  )) {
    updatePickupForCare();
  }
});

// ============================================================
// 預かり保育：「通常」選択時の赤字警告表示制御
// 課外開催日に「通常」を選んだ場合のみ警告を表示する
// ============================================================
function updateNormalWarning() {
  const warning = document.getElementById("extracNormalWarning");
  if (!warning) return;

  const selectedBase = document.querySelector("input[name=normal_base]:checked")?.value;
  const show = isExtracDay() && selectedBase === "通常";
  warning.style.display = show ? "block" : "none";
}

// ============================================================
// 長期：「通常（ショート）」選択時の赤字警告表示制御
// 課外開催日にショートかつ課外後未選択（＝通常扱い）の場合に警告表示
// ============================================================
function updateLongWarning() {
  const warning = document.getElementById("extracNormalWarningLong");
  if (!warning) return;

  const base  = document.querySelector("input[name=long_base]:checked")?.value;
  const extra = document.querySelector("input[name=long_extra]:checked")?.value;
  // ショート選択中、かつ課外後が未選択（通常扱い）の場合に警告
  const show = isExtracDay() && base === "ショート" && !extra;
  warning.style.display = show ? "block" : "none";
}

// ============================================================
// 預かり保育：課外選択肢の表示制御
//   課外参加園児 かつ 課外開催日　→ 通常〇（警告あり）/ 課外後1・2〇
//   それ以外　　　　　　　　　　　→ 通常〇 / 課外後1・2 disabled
// ============================================================
function applyExtracOptions() {
  const area = document.getElementById("normal_afternoon_options");
  if (!area) return;

  const extrac = isExtracDay(); // 課外参加園児 かつ 課外開催日

  document.querySelectorAll("input[name=normal_base]").forEach(r => {
    const isExtracOption = ["課外後1", "課外後2"].includes(r.value);

    if (isExtracOption) {
      // 課外後1・2：課外開催日のみ選択可
      r.disabled = !extrac;
      if (!extrac && r.checked) r.checked = false;
    } else {
      // 通常：常時選択可
      r.disabled = false;
    }

    const label = r.closest("label");
    if (label) label.style.opacity = r.disabled ? "0.4" : "1.0";
  });
}

// ============================================================
// 長期：課外選択肢の表示制御
//   課外参加園児 かつ 課外開催日　→ 課外後1・2〇（ロング時は除く）
//   それ以外　　　　　　　　　　　→ 課外後1・2 disabled
//   ロング選択中　　　　　　　　　→ 課外後1・2 disabled（既存ロジック維持）
// ============================================================
function applyExtracOptionsForLong() {
  const isLong = document.querySelector("input[name=long_base]:checked")?.value === "ロング";
  const extrac = isExtracDay(); // 課外参加園児 かつ 課外開催日

  document.querySelectorAll("input[name=long_extra]").forEach(r => {
    // ロング選択中 または 課外開催日でない場合は disabled
    r.disabled = isLong || !extrac;
    if (r.disabled && r.checked) r.checked = false;

    const label = r.closest("label");
    if (label) label.style.opacity = r.disabled ? "0.4" : "1.0";
  });

  // お迎え時間も更新
  updatePickupForCare();
}

// ============================================================
// アレルギー表示制御
// ============================================================
function setupAllergyUI() {
  const options = document.getElementById("allergy_options");
  if (!options) return;

  document.querySelectorAll("input[name=allergy_flag]").forEach(r => {
    r.addEventListener("change", () => {
      options.style.display = (r.value === "あり" && r.checked) ? "block" : "none";
    });
  });
}

// ============================================================
// 預かり保育：定員チェック
// ============================================================
async function checkChildcareSummary() {
  if (!selectedDate) return;

  const res = await callApi({
    action:   "check_childcare",
    authCode: AUTH_CODE,
    date:     selectedDate,
    careType: contactType
  });

  if (!res?.ok || !res.detail) {
    console.warn("定員情報を取得できませんでした");
    return;
  }

  showChildcareSummary(res.detail);
}

function showChildcareSummary(detail) {
  const row  = document.getElementById("childcareStatus");
  const text = document.getElementById("childcareStatusText");
  const btn  = document.getElementById("btnSubmit");
  if (!row || !text || !btn) return;

  row.classList.remove("hidden");
  row.style.display = "block";

  const lines = [];
  let isFull  = false;

  if (detail.morning) {
    const remain = detail.morning.limit - detail.morning.reserved;
    lines.push(`朝：残り ${remain} 名 (定員 ${detail.morning.limit} 名)`);
    if (remain <= 0) isFull = true;
  }

  if (detail.afternoon) {
    const remain = detail.afternoon.limit - detail.afternoon.reserved;
    lines.push(`午後：残り ${remain} 名 (定員 ${detail.afternoon.limit} 名)`);
    if (remain <= 0) isFull = true;
  }

  text.innerHTML   = lines.join("<br>");
  btn.disabled     = isFull;
}

function hideChildcareStatus() {
  const row = document.getElementById("childcareStatus");
  if (!row) return;
  row.classList.add("hidden");
  row.style.display = "none";
}

// ============================================================
// 送信処理
// ============================================================
document.getElementById("btnSubmit")?.addEventListener("click", onSubmitContact);

async function onSubmitContact() {
  try {
    // 必須チェック
    if (!selectedKid && mode === "new") {
      alert("園児を選択してください");
      return;
    }
    if (!selectedDate && mode === "new") {
      alert("日付を選択してください");
      return;
    }
    if (!document.querySelector("input[name=reason]:checked") &&
        ["欠席","遅刻","早退"].includes(contactType)) {
      alert("理由を選択してください");
      return;
    }
    if (contactType === "欠席" &&
        !document.querySelector("input[name=baggage]:checked")) {
      alert("荷物持ち帰りについて選択してください");
      return;
    }
    if (["早退", "園バス"].includes(contactType) &&
        !document.querySelector("input[name=guardian]:checked")) {
      alert("来園する保護者を選択してください");
      return;
    }
    if (contactType === "園バス") {
      const morning = document.getElementById("bus_morning").checked;
      const evening = document.getElementById("bus_evening").checked;
      if (!morning && !evening) {
        alert("キャンセルするバス（朝・帰り）を少なくとも1つ選択してください");
        return;
      }
    }

    if (isSubmitting) return;
    isSubmitting = true;

    const payload = mode === "edit" ? buildUpdatePayload() : buildSubmitPayload();
    if (!payload) return;

    const btn = document.getElementById("btnSubmit");
    btn.disabled    = true;
    btn.textContent = "送信中…";

    const res = mode === "edit"
      ? await callApi(payload)
      : await apiSubmitContact(payload);

    if (!res || res.result !== "success") {
      alert(res?.message || "送信に失敗しました。");
      return;
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
      btn.disabled    = false;
      btn.textContent = "送信";
    }
  }
}

// ============================================================
// Payload 生成（共通部分）
// ============================================================
function buildCommonPayload() {
  const payload = {
    authCode:    AUTH_CODE,
    contactType,
    reason: document.querySelector("input[name=reason]:checked")?.value || null,
    memo:   document.getElementById("memo")?.value || null
  };

  // 欠席
  if (contactType === "欠席") {
    payload.baggage = document.querySelector("input[name=baggage]:checked")?.value || null;
  }

  // 遅刻
  if (contactType === "遅刻") {
    payload.sendTime = document.getElementById("send")?.value || null;
  }

  // 早退
  if (contactType === "早退") {
    const pickupEl = document.getElementById("pickup");
    if (pickupEl && pickupEl.offsetParent !== null && !pickupEl.value) {
      alert("お迎え時間を選択してください。");
      pickupEl.focus();
      return null;
    }
    payload.pickupTime    = pickupEl?.value || null;
    payload.guardian      = document.querySelector("input[name=guardian]:checked")?.value || null;
    payload.guardianOther = document.getElementById("guardianOther")?.value || null;
  }

  // 園バス
  if (contactType === "園バス") {
    const busM = document.getElementById("bus_morning");
    const busE = document.getElementById("bus_evening");
    payload.busMorning    = busM?.checked ? busM.value : null;
    payload.busEvening    = busE?.checked ? busE.value : null;
    payload.guardian      = document.querySelector("input[name=guardian]:checked")?.value || null;
    payload.guardianOther = document.getElementById("guardianOther")?.value || null;
  }

  // アレルギー
  const allergyFlag = document.querySelector("input[name=allergy_flag]:checked")?.value;
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

// ============================================================
// 新規送信用 Payload
// ============================================================
function buildSubmitPayload() {
  const common = buildCommonPayload();
  if (!common) return null;   // 早退のお迎え時間未選択など、共通チェックで中断

  const payload = {
    ...common,
    action:  "submit_contact",
    lineId: localStorage.getItem(window.storageKey("LINE_ID")) || null,
    date:    selectedDate,
    kid:     selectedKid.kidsid,
    busUser: selectedKid.busUser
  };

  // お迎え時間（表示中の場合のみ）：未選択はエラー
  const pickupEl = document.getElementById("pickup");
  if (pickupEl && pickupEl.offsetParent !== null) {
    if (!pickupEl.value) {
      alert("お迎え時間を選択してください。");
      pickupEl.focus();
      return null;
    }
    payload.pickupTime = pickupEl.value;
  }

  // 預かり保育・長期
  if (["預かり保育", "長期"].includes(contactType)) {
    const care = getCareValue();
    if (!care) return null;
    payload.care = care;
  }

  // 長期のみ
  if (contactType === "長期") {
    payload.longCareType =
      document.querySelector("input[name=long_base]:checked")?.value || null;
  }

  return payload;
}

// ============================================================
// 更新用 Payload
// ============================================================
function buildUpdatePayload() {
  const common = buildCommonPayload();
  if (!common) return null;   // 早退のお迎え時間未選択など、共通チェックで中断

  return {
    ...common,
    action:    "update_contact",
    contactId,
    busUser:   selectedKid?.busUser ?? null
  };
}

// ============================================================
// 戻るボタン
// ============================================================
document.getElementById("btnBack")?.addEventListener("click", () => {
  window.location.replace("index.html");
});

// ============================================================
// 預かり内容生成
// ============================================================
function getCareValue() {
  const v = [];

  if (contactType === "預かり保育") {
    const morning   = document.getElementById("normal_morning");
    const afternoon = document.getElementById("normal_afternoon");

    if (morning?.checked && morning.value) v.push(morning.value);

    if (afternoon?.checked) {
      const base = document.querySelector("input[name=normal_base]:checked")?.value;
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
    const base = document.querySelector("input[name=long_base]:checked")?.value;
    if (!base) {
      alert("ショート／ロングを選択してください");
      return null;
    }
    v.push(base);

    const longmorning = document.getElementById("long_morning");
    if (longmorning?.checked && longmorning.value) v.push(longmorning.value);

    if (base === "ショート") {
      const extra = document.querySelector("input[name=long_extra]:checked")?.value;
      if (extra) v.push(extra);
    }
  }

  return v.join(" ");
}

// ============================================================
// 補助関数
// ============================================================
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

function isAfterCancelLimit(dateStr) {
  if (!dateStr) return false;
  const now    = new Date();
  const target = new Date(dateStr + "T09:10:00");
  return now.toDateString() === target.toDateString() && now > target;
}

// ============================================================
// 課外クラス表示可否判定
// 選択日が extrac カレンダーに含まれ、かつ
// 園児の該当曜日の extrac_xxx が true の場合のみ true
// ============================================================
function isExtracDay() {
  if (!selectedDate || !selectedKid || !calendarData?.extrac) return false;

  // 選択日が課外カレンダーに含まれるか
  if (!calendarData.extrac.includes(selectedDate)) return false;

  // 選択日の曜日（0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土）
  const dayIndex = new Date(selectedDate).getDay();
  const dayKeys  = [null, "extrac_mon", "extrac_tue", "extrac_wed", "extrac_thu", "extrac_fri", null];
  const key      = dayKeys[dayIndex];

  // 日・土は課外なし
  if (!key) return false;

  return selectedKid[key] === true;
}

function setSendTimes() {
  setTimes("send", ["9:30","10:00","10:30","11:00","11:30","12:00"]);
}

function setPickupTimesForLeave() {
  setTimes("pickup", PICKUP_TIME.DEFAULT, { placeholder: true });
}

function setTimes(id, list, { placeholder = false } = {}) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = "";
  // お迎え時間などで初期値ブランク（未選択）を明示したい場合
  if (placeholder) {
    sel.insertAdjacentHTML(
      "beforeend",
      `<option value="" disabled selected>選択してください</option>`
    );
  }
  list.forEach(t =>
    sel.insertAdjacentHTML("beforeend", `<option value="${t}">${t}</option>`)
  );
}

function updatePickupForCare() {
  updatePickupVisibility();
  updatePickupTimes();
}

function updatePickupVisibility() {
  const row = document.getElementById("row-pickup");
  if (!row) return;

  if (contactType === "預かり保育") {
    const morning   = document.getElementById("normal_morning")?.checked;
    const afternoon = document.getElementById("normal_afternoon")?.checked;
    row.style.display = (morning && !afternoon) ? "none" : "block";
    return;
  }

  row.style.display = "block";
}

function updatePickupTimes() {
  let list = [];

  if (contactType === "預かり保育") {
    const base = document.querySelector("input[name=normal_base]:checked")?.value;
    list = ["課外後1","課外後2"].includes(base) ? PICKUP_TIME.CARE_C : PICKUP_TIME.CARE_A;
  }

  if (contactType === "長期") {
    const base = document.querySelector("input[name=long_base]:checked")?.value;
    if (base === "ショート") {
      const extra = document.querySelector("input[name=long_extra]:checked")?.value;
      list = ["課外後1","課外後2"].includes(extra) ? PICKUP_TIME.CARE_C : PICKUP_TIME.CARE_B;
    }
    if (base === "ロング") {
      list = PICKUP_TIME.CARE_A;
    }
  }

  if (list.length) setTimes("pickup", list, { placeholder: true });
}