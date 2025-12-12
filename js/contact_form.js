/****************************************************
 * contactType による UI 表示制御ルール
 ****************************************************/
const CONTACT_RULES = {

    "欠席": {
        show: ["fld_reason", "fld_memo"],
        require: ["inputDate"],
        hide: ["fld_time", "fld_bus", "fld_lunch", "fld_menu"]
    },

    "遅刻": {
        show: ["fld_time", "fld_reason", "fld_memo", "fld_lunch"],
        require: ["inputDate", "time"],
        hide: ["fld_bus", "fld_menu"]
    },

    "早退": {
        show: ["fld_time", "fld_reason", "fld_memo"],
        require: ["inputDate", "time"],
        hide: ["fld_bus", "fld_lunch", "fld_menu"]
    },

    "園バス": {
        show: ["fld_bus", "fld_memo"],
        require: ["inputDate", "bus"],
        hide: ["fld_time", "fld_reason", "fld_lunch", "fld_menu"]
    },

    "預かり保育": {
        show: ["fld_menu", "fld_memo"],
        require: ["inputDate", "menu"],
        hide: ["fld_time", "fld_reason", "fld_bus", "fld_lunch"]
    },

    "長期": {
        show: ["fld_menu", "fld_memo"],
        require: ["inputDate"],
        hide: ["fld_time", "fld_reason", "fld_bus", "fld_lunch"]
    }
};


/****************************************************
 * URL から contactType 抽出
 ****************************************************/
const params = new URLSearchParams(location.search);
const contactType = params.get("type");
document.getElementById("title").textContent = contactType + "連絡";


/****************************************************
 * STEP1：園児一覧の取得
 ****************************************************/
let SELECTED_KID = null;
let KID_CLASS = null;

async function loadKids() {
    const res = await callApi({ action: "get_kids", authCode: AUTH_CODE });

    const box = document.getElementById("kidList");
    box.innerHTML = "";

    res.kids.forEach(k => {
        box.innerHTML += `
            <label><input type="radio" name="kid" value="${k.kidsid}" data-class="${k.class}" id="${k.id}">${k.name}</label>
        `;
    });

    box.addEventListener("change", e => {
        SELECTED_KID = e.target.value;
        KID_CLASS = e.target.dataset.class;
        initDateStep();
    });
}


/****************************************************
 * STEP2：日付選択の活性化（園児 & contactType が揃ったら）
 ****************************************************/
async function initDateStep() {

    // カレンダー取得
    const res = await callApi({
        action: "get_calendar",
        contactType: contactType,
        className: KID_CLASS
    });

    window.ALLOW_DATES = res.calendar; // ["2025-12-01","2025-12-03",...]

    document.getElementById("stepDate").style.display = "block";
    const input = document.getElementById("inputDate");

    input.addEventListener("change", () => {
        if (ALLOW_DATES.includes(input.value)) {
            initFormStep();
        } else {
            alert("この日は選択できません");
            input.value = "";
        }
    });
}


/****************************************************
 * STEP3：フォーム項目の表示制御
 ****************************************************/
function initFormStep() {

    document.getElementById("stepForm").style.display = "block";

    const rule = CONTACT_RULES[contactType];

    // 全項目非表示
    document.querySelectorAll("#stepForm > div").forEach(div => div.style.display = "none");

    // 表示
    rule.show.forEach(id => {
        document.getElementById(id).style.display = "block";
    });

    // 必須設定
    ["inputDate", "time", "bus", "menu"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.required = rule.require.includes(id);
    });
}


/****************************************************
 * STEP4：送信処理
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {

    loadKids();

    document.getElementById("btnSubmit").onclick = async () => {

        const payload = {
            action: "submit_contact",
            authCode: AUTH_CODE,
            contactType: contactType,
            kidId: SELECTED_KID,
            date: inputDate.value,
            time: time.value || null,
            reason: document.querySelector("input[name=reason]:checked")?.value || null,
            bus: bus.value || null,
            lunch: document.querySelector("input[name=lunch]:checked")?.value || null,
            menu: menu.value || null,
            memo: memo.value || null
        };

        const res = await callApi(payload);

        if (res.result === "success") {
            alert("送信しました");
            location.href = "index.html";
        } else {
            alert("送信に失敗しました");
        }
    };
});
