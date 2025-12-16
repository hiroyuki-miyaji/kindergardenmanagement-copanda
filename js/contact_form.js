/****************************************************
 * contact_form.js（app.js 構造に完全準拠した最終版）
 ****************************************************/

let selectedKid = null;
let selectedDate = null;
let calendarData = null;       // { calendar:[], lunchDates:[] }

// URL パラメータで連絡種別を確定
const url = new URL(location.href);
const contactType = url.searchParams.get("type");    // 欠席 / 遅刻 / 早退 / バスキャンセル


/****************************************************
 * 初期化
 ****************************************************/
document.addEventListener("DOMContentLoaded", async () => {

    // app.js が restoreAuthCode を呼び、AUTH_CODE を復元済みの前提
    if (!AUTH_CODE) {
        alert("認証情報がありません。LINEから再度アクセスしてください。");
        return;
    }

    document.getElementById("title").textContent = `連絡フォーム（${contactType}）`;

    await loadKids();
    hideAllRows();

    document.getElementById("btnBack").onclick = () => history.back();
    document.getElementById("btnSubmit").onclick = submitContact;
});


/****************************************************
 * 1. 園児一覧を取得（app.js の apiGetKids を利用）
 ****************************************************/
async function loadKids() {

    const res = await apiGetKids();

    if (!res || !res.value) {
        alert("園児情報の取得に失敗しました");
        return;
    }

    const kids = res.value;
    const kidArea = document.getElementById("kidArea");
    kidArea.innerHTML = "";

    kids.forEach(kid => {
        const div = document.createElement("div");
        div.innerHTML = `
            <label>
                <input type="radio" name="kid" value="${kid.kidsid}">
                ${kid.name}（${kid.class}）
            </label>
        `;
        kidArea.appendChild(div);
    });

    // 選択後カレンダー取得
    kidArea.addEventListener("change", () => {
        const kidId = document.querySelector('input[name="kid"]:checked').value;
        selectedKid = kids.find(k => k.kidsid === kidId);

        selectedDate = null;
        document.getElementById("date").value = "";

        hideAllRows();
        loadCalendar();
    });
}


/****************************************************
 * 2. カレンダー取得（app.js の apiGetCalendar を利用）
 ****************************************************/
async function loadCalendar() {

    const res = await apiGetCalendar(contactType, selectedKid.class);

    if (!res || res.result !== "success") {
        alert("カレンダーの取得に失敗しました");
        return;
    }

    calendarData = res;

    const dateInput = document.getElementById("date");
    dateInput.disabled = false;

    dateInput.onchange = () => {
        selectedDate = dateInput.value;
        updateFormVisibility();
    };
}


/****************************************************
 * 3. 日付選択後にフォーム本体を表示
 ****************************************************/
function updateFormVisibility() {

    if (!selectedKid || !selectedDate) return;

    document.getElementById("formBody").style.display = "block";

    hideAllRows();

    // 連絡種別ごとの行表示
    switch (contactType) {

        case "欠席":
            showRow("row-baggage");
            showRow("row-reason");
            showRow("row-memo");
            // 給食不要を自動セット
            document.querySelector('input[name="lunch"][value="不要"]').checked = true;
            showRow("row-lunch");
            break;

        case "遅刻":
            showRow("row-send");
            showRow("row-reason");
            showRow("row-memo");
            setupTime("send", 9, 30, 12, 0);
            handleLunchVisibility();
            break;

        case "早退":
            showRow("row-pickup");
            showRow("row-reason");
            showRow("row-memo");
            showRow("row-guardian");
            setupTime("pickup", 10, 0, 13, 30);
            handleLunchVisibility();
            break;

        case "バスキャンセル":
            showRow("row-bus");
            showRow("row-guardian");
            // 給食は不要
            break;
    }
}


/****************************************************
 * 4. 行の表示管理
 ****************************************************/
function hideAllRows() {
    document.querySelectorAll("#formBody .row").forEach(r => r.style.display = "none");
}

function showRow(id) {
    document.getElementById(id).style.display = "block";
}


/****************************************************
 * 5. 時刻セレクトを生成
 ****************************************************/
function setupTime(selectId, startH, startM, endH, endM) {

    const sel = document.getElementById(selectId);
    sel.innerHTML = "";

    let time = new Date(2000, 0, 1, startH, startM);
    const end = new Date(2000, 0, 1, endH, endM);

    while (time <= end) {
        const hh = String(time.getHours()).padStart(2, "0");
        const mm = String(time.getMinutes()).padStart(2, "0");
        const opt = document.createElement("option");
        opt.value = `${hh}:${mm}`;
        opt.textContent = `${hh}:${mm}`;
        sel.appendChild(opt);
        time.setMinutes(time.getMinutes() + 30);
    }
}


/****************************************************
 * 6. 給食の表示制御
 ****************************************************/
function handleLunchVisibility() {
    const isLunchDay = calendarData.lunchDates.includes(selectedDate);
    const row = document.getElementById("row-lunch");
    row.style.display = isLunchDay ? "block" : "none";
}


/****************************************************
 * 7. submit_contact（app.js の apiSubmitContact を利用）
 ****************************************************/
async function submitContact() {

    const payload = {
        kidsid: selectedKid.kidsid,
        contactType,
        date: selectedDate,
        reason: getRadioValue("reason"),
        memo: document.getElementById("memo").value,
        baggage: getRadioValue("baggage"),
        lunch: getRadioValue("lunch"),
        send: document.getElementById("send")?.value,
        pickup: document.getElementById("pickup")?.value,
        guardian: getRadioValue("guardian"),
        other: document.getElementById("guardianOther").value,
        bus: getBusCancel()
    };

    console.log("Submit Payload:", payload);

    const res = await apiSubmitContact(payload);

    if (res.result === "success") {
        alert("送信しました");
        location.href = "index.html";
    } else {
        alert("送信に失敗しました");
    }
}


/****************************************************
 * Utility
 ****************************************************/
function getRadioValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
}

function getBusCancel() {
    let arr = [];
    if (document.getElementById("bus_morning").checked) arr.push("朝バス");
    if (document.getElementById("bus_evening").checked) arr.push("帰りバス");
    return arr;
}
