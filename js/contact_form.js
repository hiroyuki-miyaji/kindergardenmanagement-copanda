/********************************************************************
 * contact_form.js  （登降園連絡フォーム）
 * - contactType は URL パラメータで確定
 * - getKids → kids データ保持
 * - getCalendar(contactType, class, lunchAvailable)
 * - calendar & lunchDates に基づき UI 制御
 ********************************************************************/

// ------------------------
// API CALL 共通
// ------------------------
async function callApi(payload) {
    console.log("▶ API Request:", payload);

    const res = await fetch("/api/logicapps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    return await res.json();
}

// ------------------------
// DOM エレメント取得
// ------------------------
const kidSelect = document.getElementById("kidSelect");
const dateSelect = document.getElementById("dateSelect");

const formFields = document.getElementById("formFields");

// 欠席
const reasonField_absent = document.getElementById("reason_absent");
const baggageField = document.getElementById("baggageField");

// 遅刻
const sendTimeField = document.getElementById("sendTimeField");
const reasonField_late = document.getElementById("reason_late");

// 早退
const pickupTimeField = document.getElementById("pickupTimeField");
const reasonField_early = document.getElementById("reason_early");
const guardianField = document.getElementById("guardianField");

// バスキャンセル
const busCancelField = document.getElementById("busCancelField");
const guardianField_bus = document.getElementById("guardianField_bus");

// 給食選択
const lunchField = document.getElementById("lunchField");

// 備考
const memoField = document.getElementById("memoField");

// 送信ボタン
const submitBtn = document.getElementById("submitBtn");

// URL パラメータから contactType を取得
const urlParams = new URLSearchParams(window.location.search);
const contactType = urlParams.get("type");

let kidsData = [];          // getKids の結果を保持
let selectedKid = null;     // 選択された園児
let calendarDates = [];     // 保育日
let lunchDates = [];        // 給食あり日


/********************************************************************
 * INIT：園児一覧のロード
 ********************************************************************/
window.addEventListener("DOMContentLoaded", async () => {
    await loadKids();
});

/********************************************************************
 * 園児一覧の取得 getKids
 ********************************************************************/
async function loadKids() {
    const res = await callApi({
        action: "getKids"
    });

    if (!res.kids || res.kids.length === 0) {
        kidSelect.innerHTML = "<option value=''>園児が登録されていません</option>";
        return;
    }

    kidsData = res.kids;

    kidSelect.innerHTML = "<option value=''>選択してください</option>";
    res.kids.forEach(k => {
        const op = document.createElement("option");
        op.value = k.kidsid;
        op.textContent = k.name + "（" + k.class + "）";
        kidSelect.appendChild(op);
    });
}

/********************************************************************
 * 園児が選択されたら → 日付選択をクリア & カレンダーを取得
 ********************************************************************/
kidSelect.addEventListener("change", async () => {
    const kidId = kidSelect.value;
    selectedKid = kidsData.find(k => k.kidsid === kidId);

    dateSelect.innerHTML = "<option value=''>日付選択...</option>";
    formFields.style.display = "none";

    if (selectedKid) {
        await loadCalendar();
    }
});

/********************************************************************
 * getCalendar(contactType, class, lunchAvailable)
 ********************************************************************/
async function loadCalendar() {
    const res = await callApi({
        action: "getCalendar",
        contactType: contactType,
        class: selectedKid.class,
        lunchAvailable: selectedKid.lunchAvailable
    });

    console.log("▶ calendar res:", res);

    calendarDates = res.calendar || [];
    lunchDates = res.lunchDates || [];

    // 日付プルダウン生成
    dateSelect.innerHTML = "<option value=''>選択してください</option>";
    calendarDates.forEach(d => {
        const op = document.createElement("option");
        op.value = d;
        op.textContent = d;
        dateSelect.appendChild(op);
    });
}

/********************************************************************
 * 日付を選択 → フォーム全体を表示 & 給食UI制御
 ********************************************************************/
dateSelect.addEventListener("change", () => {
    if (!dateSelect.value) {
        formFields.style.display = "none";
        return;
    }

    formFields.style.display = "block";
    updateFormByType(contactType);
});

/********************************************************************
 * 種別ごとのフォーム表示制御
 ********************************************************************/
function updateFormByType(type) {

    // 全て非表示
    reasonField_absent.style.display = "none";
    baggageField.style.display = "none";

    reasonField_late.style.display = "none";
    sendTimeField.style.display = "none";

    reasonField_early.style.display = "none";
    pickupTimeField.style.display = "none";
    guardianField.style.display = "none";

    busCancelField.style.display = "none";
    guardianField_bus.style.display = "none";

    lunchField.style.display = "none";
    memoField.style.display = "block"; // 備考は常に表示

    // 日付に給食があるか
    const isLunchDay = lunchDates.includes(dateSelect.value);

    // ----------------------------
    // 欠席
    // ----------------------------
    if (type === "欠席") {
        reasonField_absent.style.display = "block";
        baggageField.style.display = "block";
        lunchField.style.display = "none"; // 欠席は給食不要で固定
    }

    // ----------------------------
    // 遅刻
    // ----------------------------
    if (type === "遅刻") {
        reasonField_late.style.display = "block";
        sendTimeField.style.display = "block";

        if (isLunchDay) lunchField.style.display = "block";
    }

    // ----------------------------
    // 早退
    // ----------------------------
    if (type === "早退") {
        reasonField_early.style.display = "block";
        pickupTimeField.style.display = "block";
        guardianField.style.display = "block";

        if (isLunchDay) lunchField.style.display = "block";
    }

    // ----------------------------
    // バスキャンセル
    // ----------------------------
    if (type === "バスキャンセル") {
        busCancelField.style.display = "block";
        guardianField_bus.style.display = "block";
        lunchField.style.display = "none";
    }
}

/********************************************************************
 * 送信 submit_contact
 ********************************************************************/
submitBtn.addEventListener("click", async () => {
    if (!selectedKid || !dateSelect.value) {
        alert("園児・日付を選択してください");
        return;
    }

    const payload = {
        action: "submit_contact",
        contactType: contactType,
        kidsid: selectedKid.kidsid,
        date: dateSelect.value,

        reason: document.querySelector("input[name='reason']:checked")?.value || "",
        memo: document.getElementById("memo")?.value || "",

        lunch: document.querySelector("input[name='lunch']:checked")?.value || "",

        send: document.getElementById("sendTime")?.value || "",
        pickup: document.getElementById("pickupTime")?.value || "",

        guardian: document.querySelector("input[name='guardian']:checked")?.value || "",
        other: document.getElementById("guardian_other")?.value || "",

        baggage: document.querySelector("input[name='baggage']:checked")?.value || "",
        bus: document.querySelector("input[name='busCancel']:checked")?.value || ""
    };

    console.log("▶ submit payload:", payload);

    const res = await callApi(payload);

    if (res.result === "success") {
        alert("送信しました");
        location.href = "/mypage";
    } else {
        alert("送信に失敗しました");
    }
});
