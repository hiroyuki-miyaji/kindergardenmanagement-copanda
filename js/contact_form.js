/****************************************************
 * contact_form.js（設計前提どおり・最終版）
 * 役割：UI制御のみ
 * 前提：
 *  - app.js が先に読み込まれている
 *  - AUTH_CODE / apiGetKids / apiGetCalendar / apiSubmitContact が存在
 *  - LIFF 初期化は app.js のみ
 ****************************************************/

let kidsData = [];
let selectedKid = null;
let selectedDate = null;
let calendarData = null;
let contactType = null;

/****************************************************
 * 初期化（DOM Ready 待ち）
 ****************************************************/
document.addEventListener("DOMContentLoaded", initPage);

async function initPage() {
    try {

        if (typeof restoreAuthCode === "function") {
            restoreAuthCode();
        }
        
        // 1) URL パラメータ
        const params = new URLSearchParams(location.search);
        contactType = params.get("type");
        if (!contactType) {
            alert("連絡区分が指定されていません。");
            return;
        }

        // 2) 認証確認（LIFF は触らない）
        if (!window.AUTH_CODE) {
            alert("認証情報がありません。LINEから再度アクセスしてください。");
            location.href = "index.html";
            return;
        }

        // 3) 園児取得
        await loadKids();

        // 4) タイトル
        document.getElementById("title").textContent = `${contactType}連絡`;

    } catch (e) {
        console.error(e);
        alert("初期化に失敗しました");
    }
}

/****************************************************
 * 園児一覧取得
 ****************************************************/
async function loadKids() {
    const res = await apiGetKids(window.AUTH_CODE);

    if (!res || !res.kids) {
        alert("園児情報が取得できませんでした。");
        return;
    }

    kidsData = res.kids;

    const kidArea = document.getElementById("kidArea");
    kidArea.innerHTML = "";

    kidsData.forEach(kid => {
        kidArea.insertAdjacentHTML("beforeend", `
            <label class="inline-label">
                <input type="radio" name="kid" value="${kid.kidsid}">
                ${kid.name}
            </label>
        `);
    });

    // 園児選択時 → 即カレンダー取得
    kidArea.addEventListener("change", onKidSelected);
}

/****************************************************
 * 園児選択
 ****************************************************/
async function onKidSelected() {
    const kidId = document.querySelector("input[name=kid]:checked")?.value;
    if (!kidId) return;

    selectedKid = kidsData.find(k => k.kidsid === kidId);
    if (!selectedKid) return;

    // カレンダー取得（★ここが重要）
    calendarData = await apiGetCalendar({
        contactType,
        className: selectedKid.class,
        lunchAvailable: selectedKid.lunchAvailable
    });

    if (!calendarData || !calendarData.calendar) {
        alert("カレンダー情報が取得できませんでした。");
        return;
    }

    document.getElementById("date").disabled = false;
}

/****************************************************
 * 日付選択
 ****************************************************/
document.getElementById("date").addEventListener("change", () => {
    if (!calendarData || !selectedKid) return;

    selectedDate = document.getElementById("date").value;

    if (!calendarData.calendar.includes(selectedDate)) {
        alert("この日は連絡対象ではありません。");
        return;
    }

    document.getElementById("formBody").style.display = "block";
    updateFormByType();
});

/****************************************************
 * 連絡種別ごとのフォーム制御
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
        if (calendarData.lunchDates.includes(selectedDate))
            show("row-lunch");
    }

    if (contactType === "早退") {
        show("row-pickup");
        setPickupTimes();
        show("row-guardian");
        if (calendarData.lunchDates.includes(selectedDate))
            show("row-lunch");
    }

    if (contactType === "バスキャンセル") {
        show("row-bus");
        show("row-guardian");
    }
}

/****************************************************
 * 理由・時刻系（旧コード踏襲）
 ****************************************************/
function setReasonOptions(type) {
    const area = document.getElementById("reasonArea");
    area.innerHTML = "";

    const map = {
        "欠席": ["私用","通院","風邪","インフル","コロナ対応","忌引き","その他"],
        "遅刻": ["私用","通院","寝坊","その他"],
        "早退": ["私用","通院","その他"]
    };

    (map[type] || []).forEach(r =>
        area.insertAdjacentHTML("beforeend",
            `<label class="inline-label">
                <input type="radio" name="reason" value="${r}">${r}
            </label>`
        )
    );
}

function setSendTimes() {
    setTimes("send", ["9:30","10:00","10:30","11:00","11:30","12:00"]);
}
function setPickupTimes() {
    setTimes("pickup", ["10:00","10:30","11:00","11:30","12:00","12:30","13:00"]);
}
function setTimes(id, list) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    list.forEach(t => sel.insertAdjacentHTML("beforeend", `<option>${t}</option>`));
}

/****************************************************
 * 送信
 ****************************************************/
document.getElementById("btnSubmit").addEventListener("click", async () => {
    const payload = {
        authCode: window.AUTH_CODE,
        kidsid: selectedKid.kidsid,
        date: selectedDate,
        type: contactType
    };

    if (contactType === "欠席") {
        payload.reason = getRadio("reason");
        payload.memo = memo.value;
        payload.baggage = getRadio("baggage");
        payload.lunch = "不要";
    }

    if (contactType === "遅刻") {
        payload.send = send.value;
        payload.reason = getRadio("reason");
        payload.memo = memo.value;
        payload.lunch = getRadio("lunch");
    }

    if (contactType === "早退") {
        payload.pickup = pickup.value;
        payload.reason = getRadio("reason");
        payload.memo = memo.value;
        payload.lunch = getRadio("lunch");
        payload.guardian = getRadio("guardian");
    }

    if (contactType === "バスキャンセル") {
        payload.bus_morning = bus_morning.checked;
        payload.bus_evening = bus_evening.checked;
        payload.guardian = getRadio("guardian");
    }

    const res = await apiSubmitContact(payload);

    if (res?.result === "success") {
        alert("送信しました");
        location.href = "index.html";
    } else {
        alert("送信に失敗しました");
    }
});

function getRadio(name) {
    return document.querySelector(`input[name=${name}]:checked`)?.value ?? null;
}
