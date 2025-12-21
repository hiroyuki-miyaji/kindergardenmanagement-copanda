let kidsData = [];
let selectedKid = null;
let selectedDate = null;
let calendarData = null;
let contactType = null;
let currentYearMonth = null;

/****************************************************
 * 初期化
 ****************************************************/
document.addEventListener("DOMContentLoaded", initPage);

async function initPage() {
  try {
    if (typeof restoreAuthCode === "function") {
      restoreAuthCode();
    }
    await Promise.resolve();

    const params = new URLSearchParams(location.search);
    contactType = params.get("type");
    if (!contactType) {
      alert("連絡区分が指定されていません。");
      return;
    }

    if (!AUTH_CODE) {
      alert("認証情報がありません。LINEから再度アクセスしてください。");
      location.href = "index.html";
      return;
    }

    document.getElementById("title").textContent = `${contactType}連絡`;
    await loadKids();
    setupAllergyUI();

  } catch (e) {
    console.error(e);
    alert("初期化に失敗しました");
  }
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

  area.addEventListener("change", onKidSelected);
}

/****************************************************
 * 園児選択 → カレンダー取得
 ****************************************************/
async function onKidSelected() {
  const id = document.querySelector("input[name=kid]:checked")?.value;
  selectedKid = kidsData.find(k => k.kidsid === id);
  if (!selectedKid) return;

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

        cell.onclick = () => {
          document.querySelectorAll(".cal-day").forEach(c => c.classList.remove("selected"));
          cell.classList.add("selected");

          selectedDate = dateStr;
          document.getElementById("selectedDateBox").textContent =
            dateStr.replace(/-/g, "/");

          document.getElementById("calendarWrap").classList.add("hidden");
          document.getElementById("formBody").style.display = "block";
          updateFormByType();
        };
      }

      grid.appendChild(cell);
    }
  }
}

/****************************************************
 * 連絡区分別 UI 制御（未変更）
 ****************************************************/
function updateFormByType() {
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
    "row-allergy"   // ★アレルギー
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
    hide("care-long");
    show("row-allergy");
    show("row-memo");
  }

  if (contactType === "長期") {
    show("row-care");
    show("care-long");
    hide("care-normal");
    show("row-allergy");
    show("row-memo");
  }
  
  if (contactType === "欠席") {
    show("row-baggage");
  }

  if (contactType === "遅刻") {
    show("row-send");
    setSendTimes();
    if (calendarData.lunchDates.includes(selectedDate)){
      show("row-lunch");
    }
  }

  if (contactType === "早退") {
    show("row-pickup");
    setPickupTimes();
    show("row-guardian");
    if (calendarData.lunchDates.includes(selectedDate)){
      show("row-lunch");
    }
  }

  if (contactType === "早退") {
    show("row-pickup");
    setPickupTimes();
    show("row-guardian");
    if (calendarData.lunchDates.includes(selectedDate)) {
      show("row-lunch");
    }
  }
  
  if (contactType === "園バス") {
    show("row-bus");
    show("row-guardian");
  }
}
/****************************************************
 * 預かり保育：通常 午後チェック制御
 ****************************************************/
document.addEventListener("change", (e) => {
  if (e.target?.id === "normal_afternoon") {
    const area = document.getElementById("normal_afternoon_options");
    if (!area) return;

    area.style.display = e.target.checked ? "block" : "none";

    // 午後を外したらラジオ選択も解除
    if (!e.target.checked) {
      document
        .querySelectorAll("input[name=normal_base]")
        .forEach(r => r.checked = false);
    }
  }
});
/****************************************************
 * 預かり保育：長期（ショート／ロング）制御
 ****************************************************/
document.addEventListener("change", (e) => {

  // ===== ベース（ショート／ロング）切替 =====
  if (e.target?.name === "long_base") {
    const isLong = e.target.value === "ロング";

    const extras = document.querySelectorAll(
      "input[name=long_extra]"
    );

    extras.forEach(radio => {
      if (isLong) {
        // ロング時：課外は不可
        radio.checked = false;
        radio.disabled = true;
      } else {
        // ショート時：課外可
        radio.disabled = false;
      }
    });
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
 * 送信処理
 ****************************************************/
document.getElementById("btnSubmit")?.addEventListener("click", onSubmitContact);

async function onSubmitContact() {
  try {
    // ===== 必須チェック =====
    if (!selectedKid) {
      alert("園児を選択してください");
      return;
    }

    if (!selectedDate) {
      alert("日付を選択してください");
      return;
    }

    const reason = document.querySelector("input[name=reason]:checked")?.value;
    if (!reason && ["欠席","遅刻","早退"].includes(contactType)) {
      alert("理由を選択してください");
      return;
    }

    // ===== payload 作成 =====
    const payload = buildSubmitPayload();

    // ===== 送信 =====
    document.getElementById("btnSubmit").disabled = true;

    const res = await apiSubmitContact(payload);

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
    document.getElementById("btnSubmit").disabled = false;
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
    payload.pickupTime = document.getElementById("pickup")?.value || null;

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
 * 預かり内容生成（追加）
 ****************************************************/
function getCareValue() {
  const v = [];

  if (contactType === "預かり保育") {
    if (document.getElementById("normal_morning")?.checked) v.push("朝");

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
      alert("朝または午後を選択してください");
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

    if (document.getElementById("long_morning")?.checked) v.push("朝");
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
 * 補助（未変更）
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

function setSendTimes() {
  setTimes("send", ["9:30","10:00","10:30","11:00","11:30"]);
}
function setPickupTimes() {
  setTimes("pickup", ["10:00","10:30","11:00","11:30","12:00"]);
}
function setTimes(id, list) {
  const sel = document.getElementById(id);
  sel.innerHTML = "";
  list.forEach(t => sel.insertAdjacentHTML("beforeend", `<option>${t}</option>`));
}
