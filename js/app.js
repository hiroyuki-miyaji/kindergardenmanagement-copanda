/****************************************************
 * 設定
 ****************************************************/
const LIFF_ID = "2008634162-jVqAPKrD";
const API_URL =
  "https://prod-13.japaneast.logic.azure.com:443/workflows/7d86cca357d74a499d659ccfddac499c/triggers/When_an_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=qalRj8hNDNVdcAXhZ7cpC6KahERkg5W3NcBcPseEl14";

// ★ 認証後に保存する authcode
let AUTH_CODE = null;


/****************************************************
 * LIFF 初期化
 ****************************************************/
async function initLIFF() {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
        liff.login();
        return null;
    }

    return await liff.getProfile();
}


/****************************************************
 * LogicApps API 呼び出し
 ****************************************************/
async function callApi(body) {
    console.log("API Request:", body);

    let res;
    try {
        res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error("API fetch error:", e);
        return { error: "network_error" };
    }

    try {
        return await res.json();
    } catch (e) {
        console.error("API parse error:", e);
        return { error: "json_error" };
    }
}


/****************************************************
 * index.html ロジック
 ****************************************************/
async function initIndexPage() {
    const loading = document.getElementById("loading");
    const menu = document.getElementById("menu");
    const guardianNameLabel = document.getElementById("guardianName");

    const profile = await initLIFF();
    if (!profile) return;

    const lineId = profile.userId;

    // ★ LINEID → authcode の取得
    const result = await callApi({
        action: "check_guardian",
        lineId: lineId
    });

    if (result.error) {
        loading.innerHTML = "<p>通信エラーが発生しました。</p>";
        return;
    }

    if (!result.exists) {
        window.location.href = "register_guardian.html";
        return;
    }

    guardianNameLabel.textContent = `${result.guardianName} さん`;

    // ★ authcode を保持
    AUTH_CODE = result.authcode;

    loading.style.display = "none";
    menu.style.display = "block";

    // ★ authcode を使い、本日以降の連絡を取得
    loadUpcomingContacts();
}


/****************************************************
 * 本日以降の連絡一覧を取得して表示
 ****************************************************/
async function loadUpcomingContacts() {
    if (!AUTH_CODE) return;

    const today = new Date().toISOString().slice(0, 10);

    const res = await callApi({
        action: "get_contacts",
        authCode: AUTH_CODE,
        dateFrom: today
    });

    const ul = document.getElementById("contactList");
    ul.innerHTML = "";

    if (!res.items || res.items.length === 0) {
        ul.innerHTML = "<li>本日以降の連絡はありません</li>";
        return;
    }

    res.items.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `${c.date}：${c.type}`;
        ul.appendChild(li);
    });
}


/****************************************************
 * register_guardian.html ロジック
 ****************************************************/
async function initRegisterPage() {
    const profile = await initLIFF();
    if (!profile) return;

    const lineId = profile.userId;
    const msg = document.getElementById("msg");

    document.getElementById("btnRegister").onclick = async () => {
        const authCode = document.getElementById("authCode").value;
        const email = document.getElementById("email").value;

        if (!authCode || !email) {
            msg.textContent = "未入力の項目があります。";
            return;
        }

        const res = await callApi({
            action: "register_guardian_by_code",
            lineId: lineId,
            authCode: authCode,
            email: email
        });

        if (res.result === "success") {
            msg.textContent = "登録が完了しました。";
            setTimeout(() => (window.location.href = "index.html"), 700);
        } else {
            msg.textContent = "登録に失敗しました。" + (res.message ?? "");
        }
    };
}

/****************************************************
 * contact_list.html：連絡履歴一覧を取得して表示
 ****************************************************/
async function initContactListPage() {

    const loading = document.getElementById("loading");
    const historyBox = document.getElementById("historyBox");
    const ul = document.getElementById("historyList");

    await initLIFF();

    if (!AUTH_CODE) {
        loading.innerHTML = "<p>認証情報がありません。</p>";
        return;
    }

    const res = await callApi({
        action: "get_contact",
        authCode: AUTH_CODE,
        dateFrom:1970-01-01
    });

    loading.style.display = "none";
    historyBox.style.display = "block";

    ul.innerHTML = "";

    if (!res.items || res.items.length === 0) {
        ul.innerHTML = "<li>連絡履歴はありません</li>";
        return;
    }

    res.items.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `${c.date}：${c.type}（${c.childName ?? ""}）`;
        ul.appendChild(li);
    });
}

/****************************************************
 * ページ判定 & 初期化実行
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const path = location.pathname;

    if (path.endsWith("index.html") || path.endsWith("/")) {
        initIndexPage();
    } 
    else if (path.endsWith("register_guardian.html")) {
        initRegisterPage();
    }
    else if (path.endsWith("contact_list.html")) {
        initContactListPage();
    }
});
