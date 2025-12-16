let kidsData = [];
let selectedKid = null;
let selectedDate = null;
let calendarData = null;
let contactType = null;

/****************************************************
 * 初期化
 ****************************************************/
document.addEventListener("DOMContentLoaded", initPage);

async function initPage() {
  const params = new URLSearchParams(location.search);
  contactType = params.get("type");

  if (!contactType) {
    alert("連絡区分が指定されていません");
    return;
  }

  restoreAuthCode();
  if (!window.AUTH_CODE) {
    alert("認証情報がありません。LINEから再度アクセスしてください。");
    location.href = "index.html";
    return;
  }

  document.getElementById("title").textContent = `${contactType}連絡`;
  await loadKids();
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
    className: selectedKid.class
  });

  if (!calendarData?.calendar?.length) {
    alert("連絡可能な日がありません");
    return;
  }

  renderCalendarGrid(calendarData);
}

/****************************************************
 * カレンダー Grid 描画
 ****************************************************/
function renderCalendarGrid({ calendar, lunchDates }) {

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const week = ["日","月","火","水","木","金","土"];
  week.forEach(w => {
    grid.insertAdjacentHTML("beforeend",
      `<div class="cal-head">${w}</div>`
    );
  });

  // 月初のズレ
  const firstDate = new Date(calendar[0]);
  for (let i = 0; i < firstDate.getDay(); i++) {
    grid.insertAdjacentHTML("beforeend", `<div></div>`);
  }

  calendar.forEach(dateStr => {
    const d = new Date(dateStr);
    const day = d.getDate();

    const cell = document.createElement("div");
    cell.className = "cal-day selectable";
    cell.textContent = day;

    if (lunchDates.includes(dateStr)) {
      cell.classList.add("lunch");
      cell.title = "給食あり";
    }

    cell.onclick = () => {
      document.querySelectorAll(".cal-day")
        .forEach(c => c.classList.remove("selected"));

      cell.classList.add("selected");
      selectedDate = dateStr;

      document.getElementById("formBody").style.display = "block";
      updateFormByType();
    };

    grid.appendChild(cell);
  });

  document.getElementById("calendarArea").classList.remove("hidden");
}

/****************************************************
 * 連絡区分別 UI 制御
 ****************************************************/
function updateFormByType() {

  const show = id => document.getElementById(id).style.display = "block";
  const hide = id => document.getElementById(id).style.display = "none";

  [
    "row-baggage","row-send","row-pickup",
    "row-lunch","row-guardian","row-bus"
  ].forEach(hide);

  setReasonOptions(contactType);

  if (contactType === "欠席") {
    show("row-baggage");
    hide("row-lunch");
  }

  if (contactType === "遅刻") {
    show("row-send");
    setSendTimes();
    if (calendarData.lunchDates.includes(selectedDate)) {
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

  if (contactType === "バスキャンセル") {
    show("row-bus");
    show("row-guardian");
  }
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
