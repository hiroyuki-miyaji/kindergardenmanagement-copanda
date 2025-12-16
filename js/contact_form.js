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

        // 1) URL パラメータ
        const params = new URLSearchParams(location.search);
        contactType = params.get("type");
        if (!contactType) {
            alert("連絡区分が指定されていません。");
            return;
        }

        // 2) 認証確認（LIFF には触らない）
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

    renderCalendarGrid(calendarData);
}
/****************************************************
 * カレンダー開閉
 ****************************************************/
document.getElementById("calendarToggle")?.addEventListener("click", () => {
  const area = document.getElementById("calendarArea");
  area.classList.toggle("hidden");

  if (!area.classList.contains("hidden")) {
    renderCalendarGrid(calendarData);
  }
});

/****************************************************
 * カレンダー描画（月切替対応）
 ****************************************************/
function renderCalendarGrid({ calendar, lunchDates }) {
  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

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

    const header = document.createElement("div");
    header.className = "calendar-header";
    header.innerHTML = `
      <button type="button" id="prevMonth">‹</button>
      <span>${currentYearMonth.replace("-", "年")}月</span>
      <button type="button" id="nextMonth">›</button>
    `;
    grid.appendChild(header);

    document.getElementById("prevMonth").onclick = () => {
      const i = months.indexOf(currentYearMonth);
      if (i > 0) { currentYearMonth = months[i - 1]; draw(); }
    };
    document.getElementById("nextMonth").onclick = () => {
      const i = months.indexOf(currentYearMonth);
      if (i < months.length - 1) { currentYearMonth = months[i + 1]; draw(); }
    };

    ["日","月","火","水","木","金","土"].forEach(w =>
      grid.insertAdjacentHTML("beforeend", `<div class="cal-head">${w}</div>`)
    );

    const dates = byMonth[currentYearMonth];
    const first = new Date(dates[0]);
    for (let i = 0; i < first.getDay(); i++) {
      grid.insertAdjacentHTML("beforeend", `<div></div>`);
    }

    dates.forEach(dateStr => {
      const d = new Date(dateStr);
      const cell = document.createElement("div");
      cell.className = "cal-day selectable";
      cell.textContent = d.getDate();

      if ((lunchDates ?? []).includes(dateStr)) {
        cell.classList.add("lunch");
      }

      cell.onclick = () => {
        document.querySelectorAll(".cal-day").forEach(c => c.classList.remove("selected"));
        cell.classList.add("selected");
        selectedDate = dateStr;

        // カレンダーを閉じる
        document.getElementById("calendarArea").classList.add("hidden");

        document.getElementById("formBody").style.display = "block";
        updateFormByType();
      };

      grid.appendChild(cell);
    });
  }
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
