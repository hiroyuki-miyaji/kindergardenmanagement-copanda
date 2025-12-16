/****************************************************
 * contact_form.js（完全修正版・認証対応）
 ****************************************************/

let kidsData = [];          // getKids の結果キャッシュ
let selectedKid = null;     // { kidid, name, class, lunchAvailable }
let selectedDate = null;    // YYYY-MM-DD
let calendarData = null;    // { calendar: [], lunchDates: [] }
let contactType = null;     // URL param

/****************************************************
 * LIFF → AUTH_CODE → kids 取得（ここが最重要）
 ****************************************************/
async function initPage() {

    // 1) URL パラメータの contactType を取得
    const urlParams = new URLSearchParams(location.search);
    contactType = urlParams.get("type");
    if (!contactType) {
        alert("連絡区分が指定されていません。");
        return;
    }

    // 2) まず LIFF 初期化
    const profile = await initLIFF();
    if (!profile) return;

    // 3) authcode の復元
    restoreAuthCode();

    if (!AUTH_CODE) {
        alert("認証情報がありません。LINE から再度アクセスしてください。");
        location.href = "index.html";
        return;
    }

    // 4) 園児一覧取得
    await loadKids();

    // 5) タイトルセット
    document.getElementById("title").textContent =
        contactType + "連絡";
}

/****************************************************
 * 園児一覧取得（認証済）
 ****************************************************/
async function loadKids() {
    const res = await apiGetKids();   // ★AUTH_CODE が内部で付与される

    if (!res || !res.kids) {
        alert("園児情報が取得できませんでした。");
        return;
    }

    kidsData = res.kids;

    const kidArea = document.getElementById("kidArea");
    kidArea.innerHTML = "";

    kidsData.forEach(kid => {
        const id = `kid_${kid.kidsid}`;
        kidArea.innerHTML +=
            `<label class="inline-label">
                <input type="radio" name="kid" value="${kid.kidsid}" id="${id}">
                ${kid.name}
            </label>`;
    });

    // 選択時
    kidArea.addEventListener("change", () => {
        const kidId = document.querySelector("input[name=kid]:checked").value;
        selectedKid = kidsData.find(k => k.kidsid === kidId);

        document.getElementById("date").disabled = false;
    });
}

/****************************************************
 * 日付選択後 → カレンダー取得 → フォーム表示
 ****************************************************/
document.getElementById("date").addEventListener("change", async () => {

    if (!selectedKid) return;

    selectedDate = document.getElementById("date").value;

    // カレンダー取得
    const res = await apiGetCalendar(
        contactType,
        selectedKid.class,
        selectedKid.lunchAvailable
    );

    if (!res || !res.calendar) {
        alert("カレンダー情報が取得できませんでした。");
        return;
    }

    calendarData = res;

    // 日付が利用可能か判定
    if (!calendarData.calendar.includes(selectedDate)) {
        alert("この日は連絡対象ではありません。");
        return;
    }

    // フォーム表示
    document.getElementById("formBody").style.display = "block";

    updateFormByType();
});

/****************************************************
 * 連絡種別ごとのフォーム制御
 ****************************************************/
function updateFormByType() {

    const show = id => document.getElementById(id).style.display = "block";
    const hide = id => document.getElementById(id).style.display = "none";

    hide("row-baggage");
    hide("row-send");
    hide("row-pickup");
    hide("row-lunch");
    hide("row-guardian");
    hide("row-bus");

    // 理由セット
    setReasonOptions(contactType);

    if (contactType === "欠席") {
        show("row-baggage");
        hide("row-lunch"); // 常に不要
    }

    if (contactType === "遅刻") {
        show("row-send");
        setSendTimes();
        if (calendarData.lunchDates.includes(selectedDate))
            show("row-lunch");
    }

    if (contactType === "早退") {
        show("row-pickup");
        setPickupTimes();
        if (calendarData.lunchDates.includes(selectedDate))
            show("row-lunch");
        show("row-guardian");
    }

    if (contactType === "バスキャンセル") {
        show("row-bus");
        show("row-guardian");
        hide("row-lunch");
        hide("row-reason");
    }
}

/****************************************************
 * 理由セット
 ****************************************************/
function setReasonOptions(type) {
    const area = document.getElementById("reasonArea");
    area.innerHTML = "";

    let list = [];

    if (type === "欠席") {
        list = ["私用", "通院", "風邪", "インフル", "コロナ対応", "コロナ", "忌引き", "その他"];
    }
    if (type === "遅刻") {
        list = ["私用", "通院", "寝坊", "その他"];
    }
    if (type === "早退") {
        list = ["私用", "通院", "その他"];
    }

    list.forEach(r =>
        area.innerHTML +=
            `<label class="inline-label"><input type="radio" name="reason" value="${r}">${r}</label>`
    );
}

/****************************************************
 * 時刻セット
 ****************************************************/
function setSendTimes() {
    const sel = document.getElementById("send");
    sel.innerHTML = "";
    const times = ["9:30","10:00","10:30","11:00","11:30","12:00"];
    times.forEach(t => sel.innerHTML += `<option>${t}</option>`);
}

function setPickupTimes() {
    const sel = document.getElementById("pickup");
    sel.innerHTML = "";
    const times = ["10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30"];
    times.forEach(t => sel.innerHTML += `<option>${t}</option>`);
}

/****************************************************
 * 送信
 ****************************************************/
document.getElementById("btnSubmit").addEventListener("click", async () => {

    const payload = {
        kidsid: selectedKid.kidsid,
        date: selectedDate,
        type: contactType
    };

    if (contactType === "欠席") {
        payload.reason = getRadio("reason");
        payload.memo = document.getElementById("memo").value;
        payload.baggage = getRadio("baggage");
        payload.lunch = "不要";
    }

    if (contactType === "遅刻") {
        payload.send = document.getElementById("send").value;
        payload.reason = getRadio("reason");
        payload.memo = document.getElementById("memo").value;
        payload.lunch = getRadio("lunch");
    }

    if (contactType === "早退") {
        payload.pickup = document.getElementById("pickup").value;
        payload.reason = getRadio("reason");
        payload.memo = document.getElementById("memo").value;
        payload.lunch = getRadio("lunch");
        payload.guardian = getRadio("guardian");
        if (payload.guardian === "その他")
            payload.other = document.getElementById("guardianOther").value;
    }

    if (contactType === "バスキャンセル") {
        payload.bus_morning = document.getElementById("bus_morning").checked;
        payload.bus_evening = document.getElementById("bus_evening").checked;
        payload.guardian = getRadio("guardian");
        if (payload.guardian === "その他")
            payload.other = document.getElementById("guardianOther").value;
    }

    const res = await apiSubmitContact(payload);

    if (res.result === "success") {
        alert("送信しました");
        location.href = "index.html";
    } else {
        alert("送信に失敗しました");
    }
});

function getRadio(name) {
    const el = document.querySelector(`input[name=${name}]:checked`);
    return el ? el.value : null;
}

/****************************************************
 * 起動
 ****************************************************/
document.addEventListener("DOMContentLoaded", initPage);
