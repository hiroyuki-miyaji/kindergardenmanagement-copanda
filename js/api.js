/****************************************************
 * 設定
 ****************************************************/
const LIFF_ID = "あなたのLIFF_ID";
const API_URL = "あなたのLogicAppsエンドポイント";  // ←ここを書き換える


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
 * LogicApps 統合 API 呼び出し
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
 *   1. LIFFログイン
 *   2. LINEIDで保護者チェック
 *   3. 未登録 → register_parent.htmlへ
 ****************************************************/
async function initIndexPage() {
    const main = document.getElementById("main");

    const profile = await initLIFF();
    if (!profile) return;

    const lineId = profile.userId;

    const result = await callApi({
        action: "check_guardian",
        lineId: lineId
    });

    if (result.error) {
        main.innerHTML = "<p>通信エラーが発生しました。</p>";
        return;
    }

    // 未登録 → 初回登録画面へ
    if (!result.exists) {
        window.location.href = "register_parent.html";
        return;
    }

    // 登録済み → メニュー表示
    main.innerHTML = `
        <h3>${result.guardianName} さん</h3>
        <p>連絡内容を選択してください</p>

        <a class="menu-btn" href="contact_form.html?type=absence">欠席連絡</a>
        <a class="menu-btn" href="contact_form.html?type=tardy">遅刻連絡</a>
        <a class="menu-btn" href="contact_form.html?type=early">早退連絡</a>
        <a class="menu-btn" href="contact_form.html?type=bus">バスキャンセル</a>
        <a class="menu-btn" href="contact_form.html?type=hoiku">預かり保育予約</a>

        <hr />
        <a href="contact_list.html">連絡履歴を見る</a>
    `;
}


/****************************************************
 * register_parent.html ロジック
 ****************************************************/
async function initRegisterPage() {
    const profile = await initLIFF();
    if (!profile) return;

    const lineId = profile.userId;

    document.getElementById("btnRegister").onclick = async () => {
        const authCode = document.getElementById("authCode").value;
        const email = document.getElementById("email").value;
        const msg = document.getElementById("msg");

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

        if (res.result === "ok") {
            msg.textContent = "登録が完了しました。";
            setTimeout(() => (window.location.href = "index.html"), 700);
        } else {
            msg.textContent = "登録に失敗しました。" + (res.message ?? "");
        }
    };
}


/****************************************************
 * ページ判定 & 初期化実行
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
    const path = location.pathname;

    if (path.endsWith("index.html") || path.endsWith("/")) {
        initIndexPage();
    } else if (path.endsWith("register_parent.html")) {
        initRegisterPage();
    }
});
