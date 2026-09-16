import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname, basename } from "path";
import { marked } from "marked";

admin.initializeApp();

const PROJECT_DIR = join(__dirname, "..", "..");

function getMarkdownFiles(): string[] {
  if (!existsSync(PROJECT_DIR)) return [];
  return readdirSync(PROJECT_DIR)
    .filter(f => extname(f) === ".md")
    .sort();
}

function readMarkdownFile(filename: string): string {
  const filepath = join(PROJECT_DIR, filename);
  if (!existsSync(filepath)) return "";
  return readFileSync(filepath, "utf-8");
}

function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string;
}

function generateFileList(): string {
  const files = getMarkdownFiles();
  return files.map(f => {
    const name = basename(f, ".md");
    return `<li><a href="/${encodeURIComponent(f)}">${name}</a></li>`;
  }).join("");
}

function generateHtml(title: string, content: string, isFile: boolean = false): string {
  const fileList = generateFileList();
  const backLink = isFile ? `<p><a href="/">← 回到列表</a></p>` : "";
  
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - 企業導入 AI 策略框架庫</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; }
    h1, h2, h3 { color: #1a1a2e; }
    h1 { border-bottom: 2px solid #e94560; padding-bottom: 10px; }
    h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px; }
    a { color: #e94560; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; color: inherit; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #f8f9fa; }
    tr:nth-child(even) { background: #fafafa; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    .user-info { font-size: 14px; color: #666; }
    .logout-btn { background: #e94560; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
    .logout-btn:hover { background: #c73659; }
    .file-list { columns: 2; column-gap: 40px; }
    @media (max-width: 600px) { .file-list { columns: 1; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>企業導入 AI 策略框架庫</h1>
    <div class="user-info">
      <span id="userEmail">載入中...</span>
      <button class="logout-btn" onclick="logout()">登出</button>
    </div>
  </div>
  ${backLink}
  <div class="content">${content}</div>
  ${!isFile ? `<div class="file-list"><ul>${fileList}</ul></div>` : ""}
  
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <script>
    const firebaseConfig = ${JSON.stringify({
      apiKey: process.env.FIREBASE_API_KEY || "AIzaSyB7pZrJrLqw9Zz5vKqG8sZ7Y6X5V4N3M2Q",
      authDomain: "opencode-sk.firebaseapp.com",
      projectId: "opencode-sk"
    })};
    firebase.initializeApp(firebaseConfig);
    
    firebase.auth().onAuthStateChanged(user => {
      const el = document.getElementById("userEmail");
      if (user) {
        el.textContent = user.email || "已登入";
      } else {
        el.textContent = "未登入";
        window.location.href = "/login";
      }
    });
    
    function logout() {
      firebase.auth().signOut().then(() => {
        window.location.href = "/login";
      });
    }
  </script>
</body></html>`;
}

export const authGuard = functions.https.onRequest(async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const sessionCookie = req.cookies?.session || "";
    
    let user = null;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        user = decoded;
      } catch (e) {}
    } else if (sessionCookie) {
      try {
        const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
        user = decoded;
      } catch (e) {}
    }
    
    const path = req.path === "/" ? "/index.md" : req.path;
    const filename = decodeURIComponent(path.replace(/^\//, ""));
    
    if (!user) {
      if (req.path === "/login" || req.path.startsWith("/__/auth")) {
        res.send(getLoginPage());
        return;
      }
      res.redirect("/login");
      return;
    }
    
    if (req.path === "/login") {
      res.redirect("/");
      return;
    }
    
    if (req.path === "/" || req.path === "/index.md") {
      const content = readMarkdownFile("index.md");
      const html = renderMarkdown(content);
      res.send(generateHtml("首頁", html));
      return;
    }
    
    if (filename.endsWith(".md") && getMarkdownFiles().includes(filename)) {
      const content = readMarkdownFile(filename);
      const html = renderMarkdown(content);
      res.send(generateHtml(basename(filename, ".md"), html, true));
      return;
    }
    
    res.status(404).send(generateHtml("404", "<h1>404 - 找不到頁面</h1>"));
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

function getLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登入 - 企業導入 AI 策略框架庫</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .login-container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    h1 { text-align: center; color: #1a1a2e; margin-bottom: 10px; }
    .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
    .btn { width: 100%; padding: 14px; margin: 10px 0; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: transform 0.1s; }
    .btn:active { transform: scale(0.98); }
    .btn-google { background: white; border: 2px solid #ddd; color: #333; }
    .btn-google:hover { background: #f8f9fa; border-color: #ccc; }
    .btn-email { background: #e94560; color: white; }
    .btn-email:hover { background: #c73659; }
    .divider { text-align: center; margin: 20px 0; color: #999; position: relative; }
    .divider::before, .divider::after { content: ""; position: absolute; top: 50%; width: 40%; height: 1px; background: #ddd; }
    .divider::before { left: 0; }
    .divider::after { right: 0; }
    .error { background: #fee; color: #c00; padding: 12px; border-radius: 8px; margin-bottom: 20px; display: none; }
    .loading { display: none; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    svg { width: 20px; height: 20px; }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>🔐 企業導入 AI 策略框架庫</h1>
    <p class="subtitle">請登入以查看內容</p>
    <div class="error" id="error"></div>
    
    <button class="btn btn-google" onclick="signInWithGoogle()" id="btnGoogle">
      <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      使用 Google 登入
    </button>
    
    <div class="divider">或</div>
    
    <button class="btn btn-email" onclick="signInWithEmail()" id="btnEmail">
      使用 Email 登入
    </button>
  </div>

  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <script>
    const firebaseConfig = ${JSON.stringify({
      apiKey: process.env.FIREBASE_API_KEY || "AIzaSyB7pZrJrLqw9Zz5vKqG8sZ7Y6X5V4N3M2Q",
      authDomain: "opencode-sk.firebaseapp.com",
      projectId: "opencode-sk"
    })};
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    
    const provider = new firebase.auth.GoogleAuthProvider();
    
    function showError(msg) {
      const el = document.getElementById("error");
      el.textContent = msg;
      el.style.display = "block";
    }
    function hideError() { document.getElementById("error").style.display = "none"; }
    function setLoading(btn, loading) {
      btn.disabled = loading;
      btn.querySelector(".loading")?.remove();
      if (loading) {
        const span = document.createElement("span");
        span.className = "loading";
        span.textContent = " 載入中...";
        btn.appendChild(span);
      }
    }
    
    async function signInWithGoogle() {
      hideError();
      const btn = document.getElementById("btnGoogle");
      setLoading(btn, true);
      try {
        await auth.signInWithPopup(provider);
        window.location.href = "/";
      } catch (e) {
        showError("Google 登入失敗：" + e.message);
        setLoading(btn, false);
      }
    }
    
    async function signInWithEmail() {
      hideError();
      const email = prompt("請輸入 Email：");
      if (!email) return;
      const password = prompt("請輸入密碼：");
      if (!password) return;
      
      const btn = document.getElementById("btnEmail");
      setLoading(btn, true);
      try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = "/";
      } catch (e) {
        if (e.code === "auth/user-not-found" || e.code === "auth/wrong-password") {
          const create = confirm("帳號不存在或密碼錯誤，是否建立新帳號？");
          if (create) {
            try {
              await auth.createUserWithEmailAndPassword(email, password);
              window.location.href = "/";
              return;
            } catch (e2) {
              showError("建立帳號失敗：" + e2.message);
            }
          } else {
            showError("登入失敗：" + e.message);
          }
        } else {
          showError("登入失敗：" + e.message);
        }
        setLoading(btn, false);
      }
    }
    
    auth.onAuthStateChanged(user => {
      if (user) window.location.href = "/";
    });
  </script>
</body></html>`;
}