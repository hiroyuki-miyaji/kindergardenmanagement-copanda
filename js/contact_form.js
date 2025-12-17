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
    lunchAvailable: selectedKid.lunchAvailable
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
    "row-baggage","row-send","row-pickup",
    "row-lunch","row-guardian","row-bus"
  ].forEach(hide);

  setReasonOptions(contactType);

  if (contactType === "欠席") {
    show("row-baggage");
  }

  if (contactType === "遅刻") {
    show("row-send");
    setSendTimes();
    if (calendarData.lunchDates.includes(selectedDate)) show("row-lunch");
  }

  if (contactType === "早退") {
    show("row-pickup");
    setPickupTimes();
    show("row-guardian");
    if (calendarData.lunchDates.includes(selectedDate)) show("row-lunch");
  }

  if (contactType === "バスキャンセル") {
    show("row-bus");
    show("row-guardian");
  }
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

    alert("連絡を送信しました");
    location.href = "index.html";

  } catch (e) {
    console.error(e);
    alert("送信に失敗しました。もう一度お試しください。");
  } finally {
    document.getElementById("btnSubmit").disabled = false;
  }
}

function buildSubmitPayload() {
  const payload = {
    action: "submit_contact",
    authCode: AUTH_CODE,
    contactType,
    date: selectedDate,
    kid: selectedKid.kidsid,
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

  if (contactType === "バスキャンセル") {
    payload.bus = {
      morning: document.getElementById("bus_morning")?.checked || false,
      evening: document.getElementById("bus_evening")?.checked || false
    };

    payload.guardian =
      document.querySelector("input[name=guardian]:checked")?.value || null;

    payload.guardianOther =
      document.getElementById("guardianOther")?.value || null;
  }

  return payload;
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
