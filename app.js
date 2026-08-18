// 門人夥伴管理系統 - 前端邏輯
// 所有資料都是透過 config.js 裡設定的 Apps Script 網址跟 Google Sheet 溝通

// ---------- 入口分類定義：這裡決定首頁卡片跟每個分類底下的子頁籤 ----------
const CATEGORIES = [
  {
    key: 'meeting', title: '會議', desc: '會議記錄、追蹤待辦',
    subs: [
      { key: 'meeting-record', label: '會議記錄' },
      { key: 'meeting-track', label: '會議追蹤' },
      { key: 'meeting-todo-list', label: '待辦事項清單' },
      { key: 'meeting-calendar', label: '會議日曆' }
    ]
  },
  {
    key: 'project', title: '專案', desc: '建立事項、進度追蹤',
    subs: [
      { key: 'project-create', label: '專案建立' },
      { key: 'project-track', label: '專案進度追蹤' },
      { key: 'project-settlement', label: '分潤結算' },
      { key: 'project-settlement-summary', label: '分潤總覽' }
    ]
  },
  {
    key: 'product', title: '商品', desc: '商品建立、訂單紀錄',
    subs: [
      { key: 'product-create', label: '商品建立' },
      { key: 'product-orders', label: '訂單紀錄' }
    ]
  },
  {
    key: 'expense', title: '請款', desc: '申請請款、查詢紀錄',
    subs: [
      { key: 'expense-apply', label: '請款申請' },
      { key: 'expense-track', label: '請款紀錄' }
    ]
  },
  {
    key: 'attendance', title: '差勤', desc: '遲到請假登記與紀錄',
    subs: [
      { key: 'attendance-log', label: '差勤登記' },
      { key: 'attendance-track', label: '差勤紀錄' }
    ]
  },
  {
    key: 'member', title: '會員', desc: '會員資料建立與查詢',
    subs: [
      { key: 'member-create', label: '會員建立' },
      { key: 'member-list', label: '會員名單' }
    ]
  },
  {
    key: 'ledger', title: '記帳', desc: '四帳戶記帳、發票追蹤',
    subs: [
      { key: 'ledger-entry', label: '逐筆記帳' },
      { key: 'ledger-overview', label: '本月收支總覽' },
      { key: 'ledger-invoice', label: '發票待開立' }
    ]
  },
  {
    key: 'ticket', title: '售票／上課', desc: '售票登記、上課出席',
    subs: [
      { key: 'course-list', label: '課程' },
      { key: 'ticket-sales', label: '售票登記' },
      { key: 'class-session', label: '上課紀錄' },
      { key: 'student-overview', label: '學員總覽' }
    ]
  }
];

// ---------- 記帳：四個銀行帳戶各自一張分頁，欄位完全一致 ----------
const LEDGER_ACCOUNTS = [
  { key: 'market', label: '市集', type: 'ledgerMarket' },
  { key: 'edu', label: '教育', type: 'ledgerEdu' },
  { key: 'shop', label: '選品店', type: 'ledgerShop' },
  { key: 'door', label: '門人', type: 'ledgerDoor' }
];
const LEDGER_TYPE_BY_KEY = {};
LEDGER_ACCOUNTS.forEach(a => { LEDGER_TYPE_BY_KEY[a.key] = a.type; });
let ledgerCurrentAccountKey = LEDGER_ACCOUNTS[0].key;
let ledgerCurrentMonth = null; // 'YYYY-MM'，null 代表還沒初始化，會用今天所在的月份
let ledgerOpeningCache = {}; // { 帳戶label: { 起始日期, 起始餘額 } }
let ledgerRowsCache = {}; // { 帳戶key: [rows] }，記帳頁籤自己的快取，跟通用的 loadList 分開

// 每個「頁面 key」對應要讀取哪一種資料（給列表用；會議記錄／會議追蹤／專案建立／專案追蹤改用歷史文件清單，不用這個表）
const VIEW_DATA_TYPE = {
  'project-settlement': 'projectSettlement',
  'product-create': 'inventory',
  'product-orders': 'order',
  'expense-track': 'expense',
  'attendance-track': 'attendance',
  'member-list': 'member',
  'ticket-sales': 'ticket',
  'class-session': 'classSession'
};

const COLUMN_ORDER = {
  meeting: ['會議日期', '會議主題', '主持人', '缺席人員', '追蹤上次進度', '備註'],
  meetingTopic: ['會議主題', '議題標題', '議題內容', '備註'],
  meetingTodo: ['會議主題', '待辦事項內容', '負責人', '預計完成日', '狀態', '備註'],
  project: ['專案名稱', '專案類型', '主要負責人', '介紹人', '說明', '開始日期', '預計完成日', '備註'],
  projectItem: ['專案名稱', '事項內容', '負責人', '進度(%)', '狀態', '備註'],
  projectSettlement: ['專案名稱', '月份', '收入', '成本', '專案金額', '主要負責人分潤金額', '介紹人分潤金額', '公司利潤金額', '完成狀態', '放行狀態', '備註'],
  expense: ['申請日期', '申請人', '項目名稱', '金額', '說明', '審核狀態', '審核人', '審核日期', '收據附件', '備註'],
  attendance: ['日期', '姓名', '類型', '原因', '時數/天數', '本月累計次數', '備註'],
  inventory: ['品項名稱', '目前庫存', '安全庫存', '單位', '是否需補貨', '備註'],
  order: ['訂購日期', '品項名稱', '數量', '單價', '金額', '訂購人', '客戶/對象', '狀態', '備註'],
  member: ['會員名稱', '聯絡人', '電話', 'Email', '會員等級', '年費', '押金', '銀行', '帳號', '城市', '所屬區域',
           '加入日期', '到期日', '會員狀態', '介紹人', '地址', '品牌理念評估', '營運狀況評估', '備註'],
  ticketType: ['課程名稱', '票種', '堂數', '會員金額', '非會員金額', '可指定老師人數', '備註'],
  ticket: ['購買日期', '課程項目', '票種', '身分', '購買類型', '所屬店家', '購買人', '聯絡電話', 'LINE ID', '金額', '購買堂數', '指定老師', '備註'],
  classSession: ['課程項目', '日期', '師資', '課程名稱', '人數', '收入', '成本', '盈利', '備註']
};

const TAG_COLUMNS = new Set(['狀態', '審核狀態', '是否需補貨', '類型', '會員等級', '會員狀態', '完成狀態', '放行狀態', '票種', '身分', '出席狀態', '課程項目', '購買類型']);
const LINK_COLUMNS = new Set(['收據附件']);

// 明細列表用：點一列可以打開來源文件的詳細頁（目前所有明細列表都已改成卡片式，暫時沒有用到，保留機制供之後使用）
const DETAIL_LINK = {};

// ---------- 通用「編輯」功能：每種資料類型的中文名稱＋可編輯欄位設定 ----------
const TYPE_LABEL = {
  meeting: '會議記錄', meetingTopic: '會議議題', meetingTodo: '待辦事項', project: '專案', projectItem: '工作事項',
  projectSettlement: '分潤結算', projectExpenseItem: '支出項目', expense: '請款紀錄',
  attendance: '差勤紀錄', inventory: '庫存品項', order: '訂單', member: '會員資料',
  course: '課程', instructor: '講師', ticketType: '票種設定', ticket: '售票紀錄', classSession: '上課紀錄'
};

// type: text / textarea / number / date / month / select / partner / member / account
// 沒有列在這裡的欄位（例如公式欄位、編號、關聯欄位）不會出現在編輯表單裡
const FIELD_META = {
  meeting: {
    會議日期: { type: 'date' },
    會議主題: { type: 'text' },
    主持人: { type: 'partner' },
    缺席人員: { type: 'text' },
    追蹤上次進度: { type: 'textarea' },
    備註: { type: 'text' }
  },
  meetingTopic: {
    議題標題: { type: 'text' },
    議題內容: { type: 'textarea', optional: true },
    備註: { type: 'text', optional: true }
  },
  meetingTodo: {
    待辦事項內容: { type: 'text' },
    負責人: { type: 'partner' },
    預計完成日: { type: 'date' },
    狀態: { type: 'select', options: ['未開始', '進行中', '已完成'] },
    完成日期: { type: 'date', optional: true },
    備註: { type: 'text' }
  },
  project: {
    專案名稱: { type: 'text' },
    專案類型: { type: 'select', options: ['一次性專案', '長期性專案', '大型專案'] },
    主要負責人: { type: 'partner' },
    介紹人: { type: 'partner', optional: true },
    說明: { type: 'textarea' },
    開始日期: { type: 'date' },
    預計完成日: { type: 'date' },
    備註: { type: 'text' }
  },
  projectItem: {
    事項內容: { type: 'text' },
    負責人: { type: 'partner' },
    '進度(%)': { type: 'number' },
    狀態: { type: 'select', options: ['未開始', '進行中', '已完成', '延遲'] },
    備註: { type: 'text' }
  },
  projectSettlement: {
    月份: { type: 'month' },
    收入: { type: 'number' },
    完成狀態: { type: 'select', options: ['進行中', '已完成'] },
    備註: { type: 'text' }
  },
  projectExpenseItem: {
    項目說明: { type: 'text' },
    金額: { type: 'number' },
    備註: { type: 'text' }
  },
  expense: {
    申請日期: { type: 'date' },
    申請人: { type: 'partner' },
    項目名稱: { type: 'text' },
    金額: { type: 'number' },
    說明: { type: 'text' },
    備註: { type: 'text' }
  },
  attendance: {
    日期: { type: 'date' },
    姓名: { type: 'partner' },
    類型: { type: 'select', options: ['遲到', '請假', '曠職', '早退'] },
    原因: { type: 'text' },
    '時數/天數': { type: 'number' },
    備註: { type: 'text' }
  },
  inventory: {
    品項名稱: { type: 'text' },
    目前庫存: { type: 'number' },
    安全庫存: { type: 'number' },
    單位: { type: 'text' },
    備註: { type: 'text' }
  },
  order: {
    訂購日期: { type: 'date' },
    品項名稱: { type: 'text' },
    數量: { type: 'number' },
    單價: { type: 'number' },
    訂購人: { type: 'partner' },
    '客戶/對象': { type: 'text' },
    狀態: { type: 'select', options: ['待處理', '已出貨', '已取消'] },
    備註: { type: 'text' }
  },
  member: {
    會員名稱: { type: 'text' },
    聯絡人: { type: 'text', optional: true },
    電話: { type: 'text' },
    Email: { type: 'text' },
    會員等級: { type: 'select', options: ['共學者', '共創者', '領航者'] },
    年費: { type: 'number' },
    押金: { type: 'number' },
    銀行: { type: 'text', optional: true },
    帳號: { type: 'text', optional: true },
    城市: { type: 'text', optional: true },
    所屬區域: { type: 'text', optional: true },
    加入日期: { type: 'date' },
    到期日: { type: 'date', optional: true },
    會員狀態: { type: 'select', options: ['使用中', '已到期', '已退出'] },
    介紹人: { type: 'text', optional: true },
    地址: { type: 'text' },
    品牌理念評估: { type: 'textarea', optional: true },
    營運狀況評估: { type: 'textarea', optional: true },
    備註: { type: 'text' }
  },
  course: {
    課程名稱: { type: 'text' },
    備註: { type: 'text', optional: true }
  },
  ticketType: {
    課程名稱: { type: 'text' },
    票種: { type: 'select', options: ['年票', '季票', '單堂票'] },
    堂數: { type: 'number' },
    會員金額: { type: 'number' },
    非會員金額: { type: 'number' },
    可指定老師人數: { type: 'number', optional: true },
    備註: { type: 'text', optional: true }
  },
  ticket: {
    購買日期: { type: 'date' },
    課程項目: { type: 'text' },
    票種: { type: 'text' },
    身分: { type: 'select', options: ['會員', '非會員'] },
    購買類型: { type: 'select', options: ['店家購票', '個人購票'] },
    所屬店家: { type: 'text', optional: true },
    購買人: { type: 'text' },
    聯絡電話: { type: 'text', optional: true },
    'LINE ID': { type: 'text', optional: true },
    金額: { type: 'number' },
    購買堂數: { type: 'number' },
    指定老師: { type: 'text', optional: true },
    備註: { type: 'text', optional: true }
  },
  classSession: {
    課程項目: { type: 'text' },
    日期: { type: 'date' },
    師資: { type: 'instructor' },
    課程名稱: { type: 'text' },
    人數: { type: 'number', optional: true },
    收入: { type: 'number', optional: true },
    成本: { type: 'number', optional: true },
    備註: { type: 'text', optional: true }
  }
};

// 記帳：四個帳戶（市集／教育／選品店／門人）欄位完全一樣，共用同一份設定，「編輯」彈窗才看得到「發票開立日期」欄位
const LEDGER_FIELD_META = {
  日期: { type: 'date' },
  計入月份: { type: 'month', optional: true },
  帳目類別: { type: 'text' },
  場次別: { type: 'text', optional: true },
  項目明細: { type: 'text' },
  收入: { type: 'number', optional: true },
  支出: { type: 'number', optional: true },
  需要開立發票: { type: 'checkbox', optional: true },
  發票開立日期: { type: 'date', optional: true },
  備註: { type: 'text', optional: true }
};
LEDGER_ACCOUNTS.forEach(a => {
  FIELD_META[a.type] = LEDGER_FIELD_META;
  TYPE_LABEL[a.type] = a.label + '記帳';
  COLUMN_ORDER[a.type] = Object.keys(LEDGER_FIELD_META);
});

let partnerNamesCache = [];

function isConfigured() {
  return typeof APPS_SCRIPT_URL === 'string' &&
    APPS_SCRIPT_URL.startsWith('http') &&
    APPS_SCRIPT_URL.indexOf('/exec') !== -1;
}

// ---------- 通行密碼：如果管理者在「系統設定」分頁填了「系統密碼」，網頁會先要求輸入密碼才能使用 ----------
// 沒有填密碼的話，這整套機制不會啟用（維持原本誰有連結都能用的狀態），完全是選用功能。
const APP_PWD_KEY = 'menren_app_pwd';

function getStoredPassword() {
  try { return localStorage.getItem(APP_PWD_KEY) || ''; } catch (e) { return ''; }
}
function setStoredPassword(pwd) {
  try { localStorage.setItem(APP_PWD_KEY, pwd); } catch (e) { /* 瀏覽器不支援也沒關係，只是密碼不會被記住 */ }
}
function clearStoredPassword() {
  try { localStorage.removeItem(APP_PWD_KEY); } catch (e) {}
}

async function apiGet(params) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  url.searchParams.set('pwd', getStoredPassword());
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data && data.authError) { clearStoredPassword(); location.reload(); }
  return data;
}

// 統一的 POST 呼叫：用 text/plain 送出，避免瀏覽器對 Apps Script 發出 CORS 預檢請求（Apps Script 無法處理 OPTIONS）
async function apiPostRaw(bodyObj) {
  const body = Object.assign({}, bodyObj, { pwd: getStoredPassword() });
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data && data.authError) { clearStoredPassword(); location.reload(); }
  return data;
}

// 密碼「檢查」用，不經過上面會自動重整的 apiGet，避免密碼答錯時卡在無限重整
async function pingAccess(pwd) {
  try {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action', 'ping');
    url.searchParams.set('pwd', pwd || '');
    const res = await fetch(url.toString());
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    return true; // 連線失敗就先放行，讓後面的功能自己顯示連線錯誤，不要卡在密碼畫面出不去
  }
}

// 確保通過密碼檢查才繼續：如果系統設定沒填密碼，pingAccess 一定會回傳 true，不會出現輸入畫面
async function ensureAccess() {
  if (await pingAccess(getStoredPassword())) return true;
  return showPasswordGate();
}

function showPasswordGate() {
  return new Promise(resolve => {
    const gate = document.getElementById('password-gate');
    const input = document.getElementById('password-gate-input');
    const err = document.getElementById('password-gate-error');
    const btn = document.getElementById('password-gate-submit');
    gate.style.display = 'flex';
    err.style.display = 'none';
    input.value = '';
    input.focus();

    async function trySubmit() {
      const pwd = input.value;
      btn.disabled = true;
      btn.textContent = '確認中…';
      const ok = await pingAccess(pwd);
      btn.disabled = false;
      btn.textContent = '進入';
      if (ok) {
        setStoredPassword(pwd);
        gate.style.display = 'none';
        resolve(true);
      } else {
        err.style.display = 'block';
        input.select();
      }
    }
    btn.onclick = trySubmit;
    input.onkeydown = (e) => { if (e.key === 'Enter') trySubmit(); };
  });
}

async function apiPost(type, data, file) {
  const body = { action: 'add', type, data };
  if (file) body.file = file;
  return apiPostRaw(body);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

function tagHtml(value) {
  if (!value) return '';
  return `<span class="tag ${escapeHtml(String(value))}">${escapeHtml(String(value))}</span>`;
}

// 多位老師／多個名字存成頓號分開的一段文字，這裡統一解析成陣列（頓號、逗號都算分隔符號）
function splitNames(str) {
  return String(str || '').split(/[、,，]/).map(s => s.trim()).filter(Boolean);
}

// 判斷一個欄位值是不是「勾選／TRUE」：Google Sheet 有時候會存成真的布林值 true，
// 有時候是文字 'TRUE'／'true'，這裡統一判斷，避免漏判
function isTruthyBool(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

// ---------- 手機畫面：確保寬表格不會把整個頁面撐開，改成表格自己左右滑動 ----------
// 任何剛塞進 DOM 的 <table>，如果還沒有被 .table-wrap／.doc-table-wrap 包住，就自動包一層；
// 接著量測是否真的比容器寬，是的話才在表格上方加一行「可以左右滑動」提示，避免看起來像是壞掉了。
function enhanceScrollableTables(root) {
  if (!root) return;
  root.querySelectorAll('table').forEach(table => {
    let wrap = table.parentElement;
    if (!wrap.classList.contains('table-wrap') && !wrap.classList.contains('doc-table-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'doc-table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
    const needsHint = table.scrollWidth > wrap.clientWidth + 2;
    const prev = wrap.previousElementSibling;
    if (needsHint) {
      if (!prev || !prev.classList.contains('scroll-hint')) {
        const p = document.createElement('p');
        p.className = 'scroll-hint';
        p.textContent = '← 表格可以左右滑動，查看更多欄位 →';
        wrap.parentNode.insertBefore(p, wrap);
      }
    } else if (prev && prev.classList.contains('scroll-hint')) {
      prev.remove();
    }
  });
}

// ---------- 首頁：待辦事項清單（只顯示「進行中」的，獨立條列顯示，點了可以到完整清單頁） ----------
async function loadDashboardStats() {
  const box = document.getElementById('dashboard-stats');
  if (!box) return;
  try {
    const todoRes = await apiGet({ action: 'list', type: 'meetingTodo' });
    const today = todayStr();
    const todos = (todoRes.ok ? todoRes.data : []) || [];

    const inProgress = todos
      .filter(t => t['狀態'] === '進行中')
      .sort((a, b) => String(a['預計完成日'] || '').localeCompare(String(b['預計完成日'] || '')));

    const listHtml = inProgress.length === 0
      ? '<p class="hint">目前沒有進行中的待辦事項。</p>'
      : '<ul class="hint-list">' + inProgress.map(t => {
          const due = t['預計完成日'] || '';
          const overdue = due && due < today;
          return `<li>${escapeHtml(t['負責人'] || '未指定')}｜${escapeHtml(t['待辦事項內容'] || '')}
            （預計完成日：${escapeHtml(due)}${overdue ? ' <span class="overdue-note">已逾期</span>' : ''}）</li>`;
        }).join('') + '</ul>';

    box.innerHTML = `
      <h2>待辦事項${inProgress.length > 0 ? '（' + inProgress.length + ' 筆）' : ''}</h2>
      ${listHtml}
      <button type="button" id="dashboard-todo-more" class="secondary">查看完整待辦事項清單</button>
    `;
    document.getElementById('dashboard-todo-more').addEventListener('click', () => {
      openCategory('meeting');
      showView('meeting-todo-list');
    });
    box.style.display = 'block';
  } catch (err) {
    box.style.display = 'none';
  }
}

// ---------- 首頁卡片 ----------
function buildHomeGrid() {
  const grid = document.getElementById('home-grid');
  grid.innerHTML = CATEGORIES.map(cat => `
    <div class="home-card" data-cat="${cat.key}">
      <div class="title">${escapeHtml(cat.title)}</div>
      <div class="desc">${escapeHtml(cat.desc)}</div>
    </div>
  `).join('');
  grid.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => openCategory(card.dataset.cat));
  });
}

// ---------- 導覽狀態切換 ----------
function openCategory(catKey) {
  const cat = CATEGORIES.find(c => c.key === catKey);
  if (!cat) return;
  const subTabs = document.getElementById('sub-tabs');
  subTabs.innerHTML = cat.subs.map((s, i) =>
    `<button data-view="${s.key}" class="${i === 0 ? 'active' : ''}">${escapeHtml(s.label)}</button>`
  ).join('');
  subTabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.getElementById('view-home').classList.remove('active');
  document.getElementById('category-header').classList.add('active');
  document.getElementById('page-title').textContent = cat.title;
  document.getElementById('page-subtitle').textContent = cat.desc;

  showView(cat.subs[0].key);
}

function goHome() {
  document.getElementById('category-header').classList.remove('active');
  document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-home').classList.add('active');
  document.getElementById('page-title').textContent = '門人夥伴管理系統';
  document.getElementById('page-subtitle').textContent = '請選擇要使用的功能';
  if (isConfigured()) loadDashboardStats();
}

function showView(viewKey) {
  document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewKey);
  if (target) target.classList.add('active');

  document.querySelectorAll('#sub-tabs button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewKey);
  });

  if (viewKey === 'meeting-record') { loadDocList('meeting'); loadLastMeetingReference(); }
  if (viewKey === 'meeting-track') loadMeetingTrackList();
  if (viewKey === 'meeting-todo-list') loadMeetingTodoListData();
  if (viewKey === 'meeting-calendar') loadMeetingCalendar();
  if (viewKey === 'project-create') loadDocList('project');
  if (viewKey === 'project-track') loadProjectTrackList();
  if (viewKey === 'project-settlement') { populateSettlementProjectSelect(); populateExpenseItemProjectSelect(); }
  if (viewKey === 'project-settlement-summary') loadSettlementSummaryData();
  if (viewKey === 'ledger-entry') loadLedgerView();
  if (viewKey === 'ledger-overview') loadLedgerView();
  if (viewKey === 'ledger-invoice') loadInvoicePendingList();
  if (viewKey === 'course-list') loadCourseList();
  if (viewKey === 'ticket-sales') loadTicketCourseComboOptions();
  if (viewKey === 'class-session') loadCourseNameSelectOptions('class-session-course-select');
  if (viewKey === 'student-overview') loadStudentOverview();

  const type = VIEW_DATA_TYPE[viewKey];
  if (type) loadList(type, viewKey);
}

// ---------- 夥伴姓名下拉選單 ----------
function fillPartnerSelect(sel) {
  sel.innerHTML = '<option value="">請選擇姓名</option>' +
    partnerNamesCache.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

function showPartnerWarning(text) {
  const box = document.getElementById('partner-warning');
  document.getElementById('partner-warning-text').textContent = text;
  box.style.display = 'block';
}

function hidePartnerWarning() {
  document.getElementById('partner-warning').style.display = 'none';
}

async function loadPartners() {
  try {
    const res = await apiGet({ action: 'partners' });
    if (!res.ok) {
      showPartnerWarning('讀取夥伴名單失敗：' + (res.error || '未知錯誤') + '（請確認 Apps Script 是否已用「新版本」重新部署）');
      return;
    }
    partnerNamesCache = res.data || [];
    document.querySelectorAll('select.partner-select').forEach(fillPartnerSelect);
    if (partnerNamesCache.length === 0) {
      showPartnerWarning('「夥伴名單」分頁目前是空的，請先到 Google Sheet 的「夥伴名單」分頁填入姓名（欄位標題要是「姓名」）。');
    } else {
      hidePartnerWarning();
    }
  } catch (err) {
    showPartnerWarning('無法連線到 Apps Script，請確認 config.js 裡的網址是否正確、且已部署為「所有人」都能存取。');
    console.error('讀取夥伴名單失敗', err);
  }
}

// ---------- 講師名單：跟「夥伴名單」完全分開，是「課程」設定授課老師專用的名單 ----------
let instructorNamesCache = [];

function fillInstructorSelect(sel) {
  sel.innerHTML = '<option value="">請選擇老師</option>' +
    instructorNamesCache.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

async function loadInstructors() {
  try {
    const res = await apiGet({ action: 'instructors' });
    if (!res.ok) return;
    instructorNamesCache = res.data || [];
    document.querySelectorAll('select.instructor-select').forEach(fillInstructorSelect);
  } catch (err) {
    console.error('讀取講師名單失敗', err);
  }
}

// ---------- 品項/專案名稱建議清單 ----------
async function loadDatalist(type, field, elementId) {
  try {
    const res = await apiGet({ action: 'list', type });
    if (!res.ok) return;
    const names = [...new Set(res.data.map(r => r[field]).filter(Boolean))];
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
  } catch (err) {
    console.error('讀取建議清單失敗', err);
  }
}

// ---------- 課程列表（課程只有名稱，授課老師跟票種都在點卡片後開的彈窗裡管理） ----------
let courseListCache = [];

async function loadCourseList() {
  const wrap = document.getElementById('course-list-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const [courseRes, ticketTypeRes] = await Promise.all([
      apiGet({ action: 'list', type: 'course' }),
      apiGet({ action: 'list', type: 'ticketType' })
    ]);
    if (!courseRes.ok) {
      wrap.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(courseRes.error || '')}</p>`;
      return;
    }
    courseListCache = courseRes.data || [];
    const ticketTypes = ticketTypeRes.ok ? (ticketTypeRes.data || []) : [];
    if (courseListCache.length === 0) {
      wrap.innerHTML = '<p class="hint">目前還沒有課程，請先在上面新增。</p>';
      return;
    }

    wrap.innerHTML = courseListCache.map(c => {
      const name = c['課程名稱'] || '';
      const types = ticketTypes.filter(t => (t['課程名稱'] || '') === name);
      const tagsHtml = types.length
        ? types.map(t => {
            const limitText = Number(t['可指定老師人數']) > 0 ? `限${t['可指定老師人數']}位老師` : '不限老師';
            return `<span class="tag">${escapeHtml(t['票種'] || '')}${escapeHtml(String(t['堂數'] || ''))}堂・${limitText}</span>`;
          }).join(' ')
        : '尚未設定票種';
      const teacherNames = splitNames(c['授課老師']);
      const teacherText = teacherNames.length ? '授課老師：' + teacherNames.join('、') : '尚未設定授課老師';
      return `
        <div class="doc-item" data-id="${escapeHtml(c['編號'] || '')}">
          <div class="doc-main">
            <div class="doc-title">${escapeHtml(name || '（未命名）')}</div>
            <div class="doc-meta">${tagsHtml}</div>
            <div class="doc-meta">${escapeHtml(teacherText)}</div>
          </div>
          <div class="doc-arrow">›</div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('.doc-item').forEach(el => {
      el.addEventListener('click', () => {
        const course = courseListCache.find(c => String(c['編號']) === el.dataset.id);
        if (course) openCourseDetail(course);
      });
    });
  } catch (err) {
    wrap.innerHTML = '<p class="hint">讀取失敗，請確認網路連線。</p>';
    console.error(err);
  }
}

// ---------- 課程設定彈窗：授課老師（講師名單）＋這個課程底下的票種方案（年票／季票／單堂票，各自堂數與價格） ----------
let courseDetailCurrent = null; // 目前開啟中的課程完整資料列

async function openCourseDetail(course) {
  courseDetailCurrent = course;
  const courseId = course['編號'];
  const courseName = course['課程名稱'] || '';
  document.getElementById('tickettype-title').textContent = '課程設定－' + courseName;

  const teacherMsg = document.getElementById('course-teacher-msg');
  teacherMsg.textContent = '';
  teacherMsg.className = 'status-msg';
  document.getElementById('course-new-teacher-input').value = '';
  renderCourseTeacherBox(splitNames(course['授課老師']));

  const addForm = document.getElementById('tickettype-add-form');
  addForm.reset();
  const msg = addForm.querySelector('.status-msg');
  msg.textContent = '';
  msg.className = 'status-msg';

  addForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = addForm.querySelector('button[type="submit"]');
    const data = {};
    new FormData(addForm).forEach((value, key) => { data[key] = value; });
    data['課程名稱'] = courseName || '';

    btn.disabled = true;
    msg.textContent = '新增中…';
    msg.className = 'status-msg';
    try {
      const res = await apiPost('ticketType', data);
      if (res.ok) {
        addForm.reset();
        msg.textContent = '✅ 已新增';
        msg.className = 'status-msg ok';
        await renderTicketTypeList(courseName);
        loadCourseList();
      } else {
        msg.textContent = '❌ 新增失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 新增失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById('tickettype-overlay').classList.add('active');
  await renderTicketTypeList(courseName);
}

// 授課老師勾選清單：只顯示「這個課程自己新增過」的老師，不會看到其他課程新增過的講師
// （名字還是會存進共用的「講師名單」分頁，只是畫面上每個課程各自獨立顯示）
let courseTeacherWorkingList = []; // 目前這個課程設定視窗裡看得到的老師名字

function renderCourseTeacherBox(selectedNames) {
  const box = document.getElementById('course-teacher-box');
  if (!box) return;
  courseTeacherWorkingList = Array.from(new Set(selectedNames || []));
  if (courseTeacherWorkingList.length === 0) {
    box.innerHTML = '<p class="hint">這個課程還沒有老師，請在下面輸入名字新增。</p>';
    return;
  }
  box.innerHTML = courseTeacherWorkingList.map(n => `
    <label>
      <input type="checkbox" class="course-teacher-cb" value="${escapeHtml(n)}" checked />
      <span>${escapeHtml(n)}</span>
    </label>
  `).join('');
}

// 直接在課程設定彈窗裡輸入名字，新增一位講師（存到「講師名單」，跟夥伴名單無關），新增後自動勾選
// 只會出現在「這個課程」的清單裡；如果這個名字之前已經在別的課程新增過，就不會重複寫進「講師名單」分頁
async function addCourseTeacherInline() {
  const input = document.getElementById('course-new-teacher-input');
  const name = input.value.trim();
  if (!name) return;
  const msg = document.getElementById('course-teacher-msg');

  if (courseTeacherWorkingList.includes(name)) {
    msg.textContent = '這位老師已經在這個課程的清單裡了';
    msg.className = 'status-msg';
    input.value = '';
    return;
  }

  try {
    let ok = true;
    if (!instructorNamesCache.includes(name)) {
      const res = await apiPost('instructor', { 姓名: name });
      ok = res.ok;
      if (ok) {
        instructorNamesCache.push(name);
      } else {
        msg.textContent = '❌ 新增講師失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    }
    if (ok) {
      const currentlyChecked = Array.from(document.querySelectorAll('#course-teacher-box .course-teacher-cb:checked')).map(cb => cb.value);
      currentlyChecked.push(name);
      renderCourseTeacherBox(currentlyChecked);
      input.value = '';
      msg.textContent = '✅ 已新增講師「' + name + '」，記得按下面「儲存授課老師」套用到這個課程';
      msg.className = 'status-msg ok';
    }
  } catch (err) {
    msg.textContent = '❌ 新增講師失敗，請確認網路連線';
    msg.className = 'status-msg error';
    console.error(err);
  }
}

// 儲存這個課程勾選的授課老師（存回「課程」分頁的「授課老師」欄位，多位用頓號分開）
async function saveCourseTeachers() {
  if (!courseDetailCurrent) return;
  const btn = document.getElementById('course-teacher-save-btn');
  const msg = document.getElementById('course-teacher-msg');
  const names = Array.from(document.querySelectorAll('#course-teacher-box .course-teacher-cb:checked')).map(cb => cb.value);
  btn.disabled = true;
  msg.textContent = '儲存中…';
  msg.className = 'status-msg';
  try {
    const res = await apiPostRaw({ action: 'update', type: 'course', id: courseDetailCurrent['編號'], data: { 授課老師: names.join('、') } });
    if (res.ok) {
      courseDetailCurrent['授課老師'] = names.join('、');
      msg.textContent = '✅ 已儲存';
      msg.className = 'status-msg ok';
      loadCourseList();
    } else {
      msg.textContent = '❌ 儲存失敗：' + res.error;
      msg.className = 'status-msg error';
    }
  } catch (err) {
    msg.textContent = '❌ 儲存失敗，請確認網路連線';
    msg.className = 'status-msg error';
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

async function renderTicketTypeList(courseName) {
  const listEl = document.getElementById('tickettype-list');
  listEl.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const res = await apiGet({ action: 'list', type: 'ticketType' });
    if (!res.ok) { listEl.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(res.error || '')}</p>`; return; }
    const items = res.data.filter(t => (t['課程名稱'] || '') === (courseName || ''));
    if (items.length === 0) {
      listEl.innerHTML = '<p class="hint">目前還沒有票種，請在上面新增（例如年票10堂、季票3堂）。</p>';
      return;
    }
    listEl.innerHTML =
      '<table class="doc-todo-table"><thead><tr><th>票種</th><th>堂數</th><th>會員金額</th><th>非會員金額</th><th>可指定老師人數</th><th></th></tr></thead><tbody>' +
      items.map(t => `<tr>
          <td>${tagHtml(t['票種'] || '')}</td>
          <td>${escapeHtml(t['堂數'] !== undefined ? t['堂數'] : '')}</td>
          <td>${escapeHtml(t['會員金額'] !== undefined ? t['會員金額'] : '')}</td>
          <td>${escapeHtml(t['非會員金額'] !== undefined ? t['非會員金額'] : '')}</td>
          <td>${Number(t['可指定老師人數']) > 0 ? escapeHtml(String(t['可指定老師人數'])) + '位' : '不限'}</td>
          <td><button type="button" class="btn-edit" data-id="${escapeHtml(t['編號'])}">編輯</button></td>
        </tr>`).join('') +
      '</tbody></table>';
    enhanceScrollableTables(listEl);

    listEl.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(t => String(t['編號']) === btn.dataset.id);
        if (item) {
          openEditModal('ticketType', item, () => {
            renderTicketTypeList(courseName);
            loadCourseList();
          });
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<p class="hint">讀取失敗，請確認網路連線。</p>';
    console.error(err);
  }
}

function closeTicketTypeModal() {
  document.getElementById('tickettype-overlay').classList.remove('active');
  courseDetailCurrent = null;
}

// ---------- 課程對應的授課老師（限制「售票登記」指定老師、「上課紀錄」師資的候選名單，只列這個課程勾過的講師） ----------
let courseInstructorsByName = {};

async function loadCourseInstructorMap() {
  try {
    const res = await apiGet({ action: 'list', type: 'course' });
    courseInstructorsByName = {};
    (res.ok ? res.data || [] : []).forEach(c => {
      courseInstructorsByName[c['課程名稱'] || ''] = splitNames(c['授課老師']);
    });
  } catch (err) {
    console.error('讀取課程授課老師失敗', err);
  }
}

// 老師勾選框的通用「最多選N位」邏輯，售票登記單人／多人購買共用
function updateTeacherCheckboxCounter(box, counterEl) {
  if (!box) return;
  const limit = Number(box.dataset.limit) || 0;
  const checkboxes = Array.from(box.querySelectorAll('input[type="checkbox"]'));
  const checkedCount = checkboxes.filter(cb => cb.checked).length;
  checkboxes.forEach(cb => {
    cb.disabled = !cb.checked && checkedCount >= limit;
  });
  if (counterEl) counterEl.textContent = `（最多選 ${limit} 位，已選 ${checkedCount} 位）`;
}

// ---------- 售票登記：售票用的「課程＋票種＋堂數」下拉選單，選了會自動帶出金額、堂數，以及可指定老師的勾選名單 ----------
let ticketTypeCache = [];
let ticketBaseAmount = 0;
let ticketBaseLessons = 0;

async function loadTicketCourseComboOptions() {
  const sel = document.getElementById('ticket-course-combo-select');
  if (!sel) return;
  try {
    const [ticketTypeRes] = await Promise.all([
      apiGet({ action: 'list', type: 'ticketType' }),
      loadCourseInstructorMap()
    ]);
    ticketTypeCache = ticketTypeRes.ok ? (ticketTypeRes.data || []) : [];
    sel.innerHTML = '<option value="">請選擇課程與票種</option>' +
      ticketTypeCache.map((c, idx) =>
        `<option value="${idx}">${escapeHtml(c['課程名稱'] || '')}－${escapeHtml(c['票種'] || '')}（${escapeHtml(String(c['堂數'] || ''))}堂）</option>`
      ).join('');
    updateTicketComboFields();
  } catch (err) {
    console.error('讀取票種設定失敗', err);
  }
}

function updateTicketComboFields() {
  const sel = document.getElementById('ticket-course-combo-select');
  const identitySel = document.getElementById('ticket-identity-select');
  const amountInput = document.getElementById('ticket-amount-input');
  const lessonsInput = document.getElementById('ticket-lessons-input');
  const hint = document.getElementById('ticket-amount-hint');
  if (!sel || !identitySel || !amountInput) return;
  const item = ticketTypeCache[Number(sel.value)];
  if (!item) {
    if (hint) hint.textContent = '';
    ticketBaseAmount = 0;
    ticketBaseLessons = 0;
    renderTicketTeacherBox(0, '');
    refreshAllMultiRowTeacherBoxes();
    return;
  }
  const amt = identitySel.value === '非會員' ? item['非會員金額'] : item['會員金額'];
  ticketBaseAmount = Number(amt) || 0;
  ticketBaseLessons = Number(item['堂數']) || 0;
  applyTicketQty();
  if (hint) hint.textContent = `（會員 ${item['會員金額'] || 0}／非會員 ${item['非會員金額'] || 0}，共${item['堂數'] || 0}堂）`;
  renderTicketTeacherBox(Number(item['可指定老師人數']) || 0, item['課程名稱'] || '');
  refreshAllMultiRowTeacherBoxes();
}

// 數量改變時，金額跟購買堂數都以「單張」為基準乘上數量（單人購買才用得到）
function applyTicketQty() {
  const amountInput = document.getElementById('ticket-amount-input');
  const lessonsInput = document.getElementById('ticket-lessons-input');
  const qtyInput = document.getElementById('ticket-qty-input');
  if (!amountInput || !lessonsInput) return;
  const qty = Math.max(1, Number(qtyInput && qtyInput.value) || 1);
  amountInput.value = ticketBaseAmount * qty;
  lessonsInput.value = ticketBaseLessons * qty;
}

// ---------- 售票登記：指定老師勾選名單（依票種的「可指定老師人數」顯示／隱藏，候選名單是課程勾過的講師） ----------
function renderTicketTeacherBox(limit, courseName) {
  const field = document.getElementById('ticket-teacher-field');
  const box = document.getElementById('ticket-teacher-box');
  if (!field || !box) return;
  if (!limit || limit <= 0) {
    field.style.display = 'none';
    box.innerHTML = '';
    box.dataset.limit = '0';
    return;
  }
  field.style.display = '';
  box.dataset.limit = String(limit);
  const pool = courseInstructorsByName[courseName] || [];
  if (pool.length === 0) {
    box.innerHTML = '<p class="hint">這個課程還沒有設定授課老師，請先到「課程」頁籤點課程卡片新增。</p>';
    return;
  }
  box.innerHTML = pool.map(n => `
    <label>
      <input type="checkbox" class="ticket-teacher-cb" value="${escapeHtml(n)}" />
      <span>${escapeHtml(n)}</span>
    </label>
  `).join('');
  box.querySelectorAll('.ticket-teacher-cb').forEach(cb => {
    cb.addEventListener('change', updateTicketTeacherCounter);
  });
  updateTicketTeacherCounter();
}

function updateTicketTeacherCounter() {
  updateTeacherCheckboxCounter(document.getElementById('ticket-teacher-box'), document.getElementById('ticket-teacher-counter'));
}

// ---------- 售票登記：一次幫多人買，每一列各自的指定老師勾選框 ----------
function getCurrentTicketTypeItem() {
  const sel = document.getElementById('ticket-course-combo-select');
  return sel ? ticketTypeCache[Number(sel.value)] : null;
}

function renderMultiRowTeacherBox(rowEl) {
  const item = getCurrentTicketTypeItem();
  const field = rowEl.querySelector('.multi-teacher-field');
  const box = rowEl.querySelector('.multi-teacher-box');
  const counter = rowEl.querySelector('.multi-teacher-counter');
  if (!field || !box) return;
  const limit = item ? (Number(item['可指定老師人數']) || 0) : 0;
  if (!limit) {
    field.style.display = 'none';
    box.innerHTML = '';
    box.dataset.limit = '0';
    return;
  }
  field.style.display = '';
  box.dataset.limit = String(limit);
  const pool = item ? (courseInstructorsByName[item['課程名稱'] || ''] || []) : [];
  if (pool.length === 0) {
    box.innerHTML = '<p class="hint">這個課程還沒有設定授課老師。</p>';
    return;
  }
  box.innerHTML = pool.map(n => `
    <label>
      <input type="checkbox" class="multi-teacher-cb" value="${escapeHtml(n)}" />
      <span>${escapeHtml(n)}</span>
    </label>
  `).join('');
  box.querySelectorAll('.multi-teacher-cb').forEach(cb => {
    cb.addEventListener('change', () => updateTeacherCheckboxCounter(box, counter));
  });
  updateTeacherCheckboxCounter(box, counter);
}

function refreshAllMultiRowTeacherBoxes() {
  document.querySelectorAll('#ticket-multi-rows .multi-row').forEach(renderMultiRowTeacherBox);
}

// ---------- 售票登記：一次幫多人買，動態新增／移除學員列 ----------
let ticketMultiRowCount = 0;

function addTicketMultiRow() {
  const tmpl = document.getElementById('ticket-multi-row-template');
  const node = tmpl.content.firstElementChild.cloneNode(true);
  ticketMultiRowCount += 1;
  node.querySelector('.row-title').textContent = '學員 ' + ticketMultiRowCount;
  node.querySelector('.ticket-multi-remove').addEventListener('click', () => {
    node.remove();
    renumberTicketMultiRows();
  });
  document.getElementById('ticket-multi-rows').appendChild(node);
  renderMultiRowTeacherBox(node);
  return node;
}

function renumberTicketMultiRows() {
  const rows = document.querySelectorAll('#ticket-multi-rows .multi-row');
  rows.forEach((row, idx) => { row.querySelector('.row-title').textContent = '學員 ' + (idx + 1); });
  ticketMultiRowCount = rows.length;
}

function resetTicketMultiRows() {
  document.getElementById('ticket-multi-rows').innerHTML = '';
  ticketMultiRowCount = 0;
  addTicketMultiRow();
}

// ---------- 售票登記：單人／多人購買模式切換 ----------
function setTicketMode(mode) {
  document.getElementById('ticket-mode-single-btn').classList.toggle('active', mode === 'single');
  document.getElementById('ticket-mode-multi-btn').classList.toggle('active', mode === 'multi');
  document.getElementById('ticket-single-block').style.display = mode === 'single' ? '' : 'none';
  document.getElementById('ticket-multi-block').style.display = mode === 'multi' ? '' : 'none';
}

function updateTicketStoreFieldVisibility() {
  const sel = document.getElementById('ticket-buytype-select');
  const field = document.getElementById('ticket-store-field');
  if (!sel || !field) return;
  field.style.display = sel.value === '店家購票' ? '' : 'none';
}

// 課程項目、身分、購買類型、所屬店家、購買日期、備註是單人／多人購買共用的基本資料
function collectTicketBaseData() {
  const buyType = document.getElementById('ticket-buytype-select').value;
  return {
    購買日期: document.getElementById('ticket-date-input').value,
    身分: document.getElementById('ticket-identity-select').value,
    購買類型: buyType,
    所屬店家: buyType === '店家購票' ? document.getElementById('ticket-store-input').value : '',
    備註: document.getElementById('ticket-note-input').value
  };
}

// ---------- 售票登記：單人購買送出 ----------
async function submitTicketSingle() {
  const btn = document.getElementById('ticket-single-submit');
  const msg = document.getElementById('ticket-single-msg');
  const item = getCurrentTicketTypeItem();
  if (!item) {
    msg.textContent = '❌ 請先選擇課程項目';
    msg.className = 'status-msg error';
    return;
  }
  const nameInput = document.getElementById('ticket-single-name');
  const buyerName = nameInput.value.trim();
  if (!buyerName) {
    msg.textContent = '❌ 請填購買人姓名';
    msg.className = 'status-msg error';
    return;
  }
  const teacherBox = document.getElementById('ticket-teacher-box');
  const selectedTeachers = teacherBox
    ? Array.from(teacherBox.querySelectorAll('.ticket-teacher-cb:checked')).map(cb => cb.value)
    : [];

  const data = Object.assign(collectTicketBaseData(), {
    課程項目: item['課程名稱'] || '',
    票種: item['票種'] || '',
    購買人: buyerName,
    聯絡電話: document.getElementById('ticket-single-phone').value,
    'LINE ID': document.getElementById('ticket-single-line').value,
    金額: document.getElementById('ticket-amount-input').value,
    購買堂數: document.getElementById('ticket-lessons-input').value,
    指定老師: selectedTeachers.join('、')
  });

  btn.disabled = true;
  msg.textContent = '送出中…';
  msg.className = 'status-msg';
  try {
    const res = await apiPost('ticket', data);
    if (res.ok) {
      msg.textContent = '✅ 已送出（編號：' + res.id + '）';
      msg.className = 'status-msg ok';
      nameInput.value = '';
      document.getElementById('ticket-single-phone').value = '';
      document.getElementById('ticket-single-line').value = '';
      document.getElementById('ticket-qty-input').value = '1';
      applyTicketQty();
      renderTicketTeacherBox(Number(item['可指定老師人數']) || 0, item['課程名稱'] || '');
      loadList('ticket', 'ticket-sales');
    } else {
      msg.textContent = '❌ 送出失敗：' + res.error;
      msg.className = 'status-msg error';
    }
  } catch (err) {
    msg.textContent = '❌ 送出失敗，請確認網路連線';
    msg.className = 'status-msg error';
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

// ---------- 售票登記：一次幫多人買送出（每一位各自變成一筆獨立的售票紀錄） ----------
async function submitTicketMulti() {
  const btn = document.getElementById('ticket-multi-submit');
  const msg = document.getElementById('ticket-multi-msg');
  const item = getCurrentTicketTypeItem();
  if (!item) {
    msg.textContent = '❌ 請先選擇課程項目';
    msg.className = 'status-msg error';
    return;
  }
  const rows = Array.from(document.querySelectorAll('#ticket-multi-rows .multi-row'));
  const entries = [];
  rows.forEach(row => {
    const name = row.querySelector('.multi-name').value.trim();
    if (!name) return;
    const phone = row.querySelector('.multi-phone').value;
    const line = row.querySelector('.multi-line').value;
    const teacherBox = row.querySelector('.multi-teacher-box');
    const teachers = teacherBox
      ? Array.from(teacherBox.querySelectorAll('.multi-teacher-cb:checked')).map(cb => cb.value)
      : [];
    entries.push({ name, phone, line, teachers });
  });
  if (entries.length === 0) {
    msg.textContent = '❌ 請至少填一位學員的姓名';
    msg.className = 'status-msg error';
    return;
  }

  const base = collectTicketBaseData();
  const unitAmount = base.身分 === '非會員' ? item['非會員金額'] : item['會員金額'];
  btn.disabled = true;
  msg.textContent = '送出中…';
  msg.className = 'status-msg';
  let successCount = 0;
  const failNames = [];
  for (const entry of entries) {
    const data = Object.assign({}, base, {
      課程項目: item['課程名稱'] || '',
      票種: item['票種'] || '',
      購買人: entry.name,
      聯絡電話: entry.phone,
      'LINE ID': entry.line,
      金額: unitAmount,
      購買堂數: item['堂數'],
      指定老師: entry.teachers.join('、')
    });
    try {
      const res = await apiPost('ticket', data);
      if (res.ok) successCount += 1;
      else failNames.push(entry.name);
    } catch (err) {
      failNames.push(entry.name);
    }
  }
  btn.disabled = false;
  if (failNames.length === 0) {
    msg.textContent = `✅ 已送出 ${successCount} 筆售票紀錄`;
    msg.className = 'status-msg ok';
    resetTicketMultiRows();
  } else {
    msg.textContent = `⚠️ 送出 ${successCount}／${entries.length} 筆成功，失敗：${failNames.join('、')}`;
    msg.className = 'status-msg error';
  }
  loadList('ticket', 'ticket-sales');
}

// ---------- 上課紀錄用：課程項目下拉選單（只列課程名稱，不分票種），並準備每個課程對應的授課老師名單 ----------
async function loadCourseNameSelectOptions(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    await loadCourseInstructorMap();
    const names = Object.keys(courseInstructorsByName).filter(Boolean);
    const current = sel.value;
    sel.innerHTML = '<option value="">請選擇課程項目</option>' +
      names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (names.includes(current)) sel.value = current;
    updateClassSessionTeacherOptions();
  } catch (err) {
    console.error('讀取課程失敗', err);
  }
}

// 上課紀錄：「師資」下拉只列出目前選到的課程勾過的講師
function updateClassSessionTeacherOptions() {
  const courseSel = document.getElementById('class-session-course-select');
  const teacherSel = document.getElementById('class-session-teacher-select');
  if (!courseSel || !teacherSel) return;
  const pool = courseInstructorsByName[courseSel.value] || [];
  const current = teacherSel.value;
  teacherSel.innerHTML = '<option value="">請選擇老師</option>' +
    pool.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (pool.includes(current)) teacherSel.value = current;
}

function setupClassSessionForm() {
  const courseSel = document.getElementById('class-session-course-select');
  if (courseSel) courseSel.addEventListener('change', updateClassSessionTeacherOptions);
}

// ---------- 售票登記表單：設定各種切換／連動事件（金額換算、購買類型、單人多人模式） ----------
function setupTicketSalesForm() {
  const combo = document.getElementById('ticket-course-combo-select');
  const identitySel = document.getElementById('ticket-identity-select');
  const buytypeSel = document.getElementById('ticket-buytype-select');
  const qtyInput = document.getElementById('ticket-qty-input');
  if (combo) combo.addEventListener('change', updateTicketComboFields);
  if (identitySel) identitySel.addEventListener('change', updateTicketComboFields);
  if (buytypeSel) buytypeSel.addEventListener('change', updateTicketStoreFieldVisibility);
  if (qtyInput) qtyInput.addEventListener('input', applyTicketQty);

  document.getElementById('ticket-mode-single-btn').addEventListener('click', () => setTicketMode('single'));
  document.getElementById('ticket-mode-multi-btn').addEventListener('click', () => setTicketMode('multi'));
  document.getElementById('ticket-multi-add-btn').addEventListener('click', addTicketMultiRow);
  document.getElementById('ticket-single-submit').addEventListener('click', submitTicketSingle);
  document.getElementById('ticket-multi-submit').addEventListener('click', submitTicketMulti);

  updateTicketStoreFieldVisibility();
  setTicketMode('single');
  resetTicketMultiRows();
}

// ---------- 動態明細列（會議待辦事項／專案工作事項共用機制） ----------
function addDynamicRow(templateId, containerId) {
  const tmpl = document.getElementById(templateId);
  const node = tmpl.content.firstElementChild.cloneNode(true);
  const ownerSelect = node.querySelector('.partner-select');
  if (ownerSelect) fillPartnerSelect(ownerSelect);
  node.querySelector('.todo-remove').addEventListener('click', () => node.remove());
  document.getElementById(containerId).appendChild(node);
  return node;
}

function addTodoRow() { addDynamicRow('todo-row-template', 'todo-rows'); }
function resetTodoRows() {
  document.getElementById('todo-rows').innerHTML = '';
  addTodoRow();
}
function collectTodoRows() {
  const rows = [];
  document.querySelectorAll('#todo-rows .todo-row').forEach(row => {
    const content = row.querySelector('.todo-content').value.trim();
    const owner = row.querySelector('.todo-owner').value;
    const due = row.querySelector('.todo-due').value;
    if (content) rows.push({ 待辦事項內容: content, 負責人: owner, 預計完成日: due });
  });
  return rows;
}

function addTopicRow() { addDynamicRow('topic-row-template', 'topic-rows'); }
function resetTopicRows() {
  document.getElementById('topic-rows').innerHTML = '';
  addTopicRow();
}
function collectTopicRows() {
  const rows = [];
  document.querySelectorAll('#topic-rows .topic-row').forEach(row => {
    const title = row.querySelector('.topic-title').value.trim();
    const content = row.querySelector('.topic-content').value.trim();
    if (title) rows.push({ 議題標題: title, 議題內容: content });
  });
  return rows;
}

function addProjectItemRow() { addDynamicRow('project-item-row-template', 'project-item-rows'); }
function resetProjectItemRows() {
  document.getElementById('project-item-rows').innerHTML = '';
  addProjectItemRow();
}
function collectProjectItemRows() {
  const rows = [];
  document.querySelectorAll('#project-item-rows .project-item-row').forEach(row => {
    const content = row.querySelector('.item-content').value.trim();
    const owner = row.querySelector('.item-owner').value;
    const progress = row.querySelector('.item-progress').value;
    const status = row.querySelector('.item-status').value;
    if (content) rows.push({ 事項內容: content, 負責人: owner, '進度(%)': progress || 0, 狀態: status });
  });
  return rows;
}

// ---------- 通用編輯彈窗（所有資料類型共用：會議、待辦事項、專案、工作事項、分潤結算、支出項目、請款、差勤、庫存、訂單） ----------
function openEditModal(type, row, onSaved) {
  const meta = FIELD_META[type];
  if (!meta) return;
  const overlay = document.getElementById('edit-overlay');
  const form = document.getElementById('edit-form');

  document.getElementById('edit-title').textContent = '編輯' + (TYPE_LABEL[type] || '');

  form.innerHTML = Object.keys(meta).map(field => {
    const m = meta[field];
    const rawVal = row[field] !== undefined && row[field] !== null ? row[field] : '';
    const label = escapeHtml(field) + (m.optional ? '（選填）' : '');

    if (m.type === 'textarea') {
      return `<label class="full">${label}<textarea name="${escapeHtml(field)}">${escapeHtml(rawVal)}</textarea></label>`;
    }
    if (m.type === 'select') {
      const opts = m.options.map(o =>
        `<option value="${escapeHtml(o)}" ${String(rawVal) === o ? 'selected' : ''}>${escapeHtml(o)}</option>`
      ).join('');
      return `<label>${label}<select name="${escapeHtml(field)}">${opts}</select></label>`;
    }
    if (m.type === 'partner') {
      return `<label>${label}<select name="${escapeHtml(field)}" class="partner-select" data-current="${escapeHtml(rawVal)}"></select></label>`;
    }
    if (m.type === 'instructor') {
      return `<label>${label}<select name="${escapeHtml(field)}" class="instructor-select" data-current="${escapeHtml(rawVal)}"></select></label>`;
    }
    if (m.type === 'number') {
      return `<label>${label}<input type="number" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
    }
    if (m.type === 'date') {
      return `<label>${label}<input type="date" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
    }
    if (m.type === 'month') {
      return `<label>${label}<input type="month" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
    }
    if (m.type === 'checkbox') {
      return `<label class="full checkbox-row"><input type="checkbox" name="${escapeHtml(field)}" ${isTruthyBool(rawVal) ? 'checked' : ''} />${label}</label>`;
    }
    return `<label>${label}<input type="text" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
  }).join('') + `<div class="submit-row"><button type="submit" class="primary">儲存修改</button><span class="status-msg"></span></div>`;

  form.querySelectorAll('select.partner-select').forEach(sel => {
    fillPartnerSelect(sel);
    const cur = sel.dataset.current;
    if (cur) sel.value = cur;
  });
  form.querySelectorAll('select.instructor-select').forEach(sel => {
    fillInstructorSelect(sel);
    const cur = sel.dataset.current;
    if (cur) sel.value = cur;
  });

  overlay.classList.add('active');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');
    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });
    // 勾選框沒勾的話 FormData 不會帶到這個欄位，這裡另外明確補上 TRUE/FALSE，避免「取消勾選」存不進去
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.name] = cb.checked ? 'TRUE' : 'FALSE'; });

    btn.disabled = true;
    msg.textContent = '儲存中…';
    msg.className = 'status-msg';

    try {
      const res = await apiPostRaw({ action: 'update', type, id: row['編號'], data });
      if (res.ok) {
        msg.textContent = '✅ 已儲存';
        msg.className = 'status-msg ok';
        closeEditModal();
        if (onSaved) onSaved();
      } else {
        msg.textContent = '❌ 儲存失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 儲存失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  };
}

function closeEditModal() {
  document.getElementById('edit-overlay').classList.remove('active');
}

// ---------- 支出明細彈窗（某一筆分潤結算底下的支出項目，可逐筆新增／編輯） ----------
async function openCostItemsModal(settlementId, label, projectName, month, onChange) {
  document.getElementById('costitem-title').textContent = '支出明細－ ' + label;
  const addForm = document.getElementById('costitem-add-form');
  addForm.reset();
  const msg = addForm.querySelector('.status-msg');
  msg.textContent = '';
  msg.className = 'status-msg';

  addForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = addForm.querySelector('button[type="submit"]');
    const data = {};
    new FormData(addForm).forEach((value, key) => { data[key] = value; });
    data['分潤編號'] = settlementId;
    data['專案名稱'] = projectName || '';
    data['月份'] = month || '';

    btn.disabled = true;
    msg.textContent = '新增中…';
    msg.className = 'status-msg';

    try {
      const res = await apiPost('projectExpenseItem', data);
      if (res.ok) {
        addForm.reset();
        msg.textContent = '✅ 已新增';
        msg.className = 'status-msg ok';
        await renderCostItemsList(settlementId, projectName, month, onChange);
        if (onChange) onChange();
      } else {
        msg.textContent = '❌ 新增失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 新增失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById('costitem-overlay').classList.add('active');
  await renderCostItemsList(settlementId, projectName, month, onChange);
}

async function renderCostItemsList(settlementId, projectName, month, onChange) {
  const listEl = document.getElementById('costitem-list');
  listEl.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const res = await apiGet({ action: 'list', type: 'projectExpenseItem' });
    if (!res.ok) { listEl.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(res.error || '')}</p>`; return; }
    const items = res.data.filter(i => String(i['分潤編號']) === String(settlementId));
    if (items.length === 0) {
      listEl.innerHTML = '<p class="hint">目前還沒有支出項目，成本會是 0。</p>';
      return;
    }
    const total = items.reduce((sum, i) => sum + (Number(i['金額']) || 0), 0);
    listEl.innerHTML =
      '<table class="doc-todo-table"><thead><tr><th>項目說明</th><th>金額</th><th>備註</th><th></th></tr></thead><tbody>' +
      items.map(i => `<tr>
          <td>${escapeHtml(i['項目說明'] || '')}</td>
          <td>${escapeHtml(i['金額'] !== undefined ? i['金額'] : '')}</td>
          <td>${escapeHtml(i['備註'] || '')}</td>
          <td><button type="button" class="btn-edit" data-id="${escapeHtml(i['編號'])}">編輯</button></td>
        </tr>`).join('') +
      `</tbody></table><p class="hint">目前加總成本：${total}</p>`;
    enhanceScrollableTables(listEl);

    listEl.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(i => String(i['編號']) === btn.dataset.id);
        if (item) {
          openEditModal('projectExpenseItem', item, () => {
            renderCostItemsList(settlementId, projectName, month, onChange);
            if (onChange) onChange();
          });
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<p class="hint">讀取失敗，請確認網路連線。</p>';
    console.error(err);
  }
}

function closeCostItemsModal() {
  document.getElementById('costitem-overlay').classList.remove('active');
}

// ---------- 上課紀錄：出席名單彈窗（勾選誰來、誰沒來，名單以「售票登記」年票／季票購買人為主） ----------
let attendanceCurrentSession = null;
let attendanceRows = []; // [{ name, present }]

async function openAttendanceModal(session) {
  attendanceCurrentSession = session;
  document.getElementById('attendance-title').textContent =
    '出席名單－ ' + (session['日期'] || '') + ' ' + (session['課程名稱'] || '');
  const msg = document.getElementById('attendance-msg');
  msg.textContent = '';
  msg.className = 'status-msg';
  document.getElementById('attendance-add-name').value = '';
  document.getElementById('attendance-list').innerHTML = '<p class="hint">載入中…</p>';
  document.getElementById('attendance-overlay').classList.add('active');

  try {
    const [ticketRes, attendanceRes] = await Promise.all([
      apiGet({ action: 'list', type: 'ticket' }),
      apiGet({ action: 'list', type: 'classAttendance' })
    ]);
    if (!ticketRes.ok) {
      document.getElementById('attendance-list').innerHTML =
        `<p class="hint">讀取售票登記失敗：${escapeHtml(ticketRes.error || '')}</p>`;
      return;
    }

    const sessionCourse = session['課程項目'] || '';
    const sessionTeacher = session['師資'] || '';
    // 只看「同一個課程項目」的售票紀錄，加總每個人的「購買堂數」，並記錄每個人是否有不限老師的票、以及指定過哪些老師
    const purchasedByName = {};
    const unrestrictedByName = {};
    const teacherSetByName = {};
    (ticketRes.data || []).forEach(t => {
      if ((t['課程項目'] || '') !== sessionCourse) return;
      const name = t['購買人'];
      if (!name) return;
      purchasedByName[name] = (purchasedByName[name] || 0) + (Number(t['購買堂數']) || 0);
      const teacherText = String(t['指定老師'] || '').trim();
      if (!teacherText) {
        unrestrictedByName[name] = true;
      } else {
        const names = teacherText.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
        (teacherSetByName[name] = teacherSetByName[name] || new Set());
        names.forEach(n => teacherSetByName[name].add(n));
      }
    });

    // 這一堂課有沒有指定教課老師（師資留空就視為不限），判斷這個人的票是否符合這一堂的老師
    function teacherMatches(name) {
      if (!sessionTeacher) return true;
      if (unrestrictedByName[name]) return true;
      const set = teacherSetByName[name];
      return !!(set && set.has(sessionTeacher));
    }
    function restrictionLabel(name) {
      if (unrestrictedByName[name]) return '不限老師';
      const set = teacherSetByName[name];
      return set && set.size ? '指定 ' + Array.from(set).join('、') + ' 老師' : '不限老師';
    }

    // 同一個課程項目底下，這個人總共出席過幾次（不分哪一堂課），用來扣掉購買堂數
    const attendedByName = {};
    const allAttendance = attendanceRes.ok ? (attendanceRes.data || []) : [];
    allAttendance.forEach(a => {
      if ((a['課程項目'] || '') !== sessionCourse) return;
      if (a['出席狀態'] !== '出席') return;
      const name = a['購買人'];
      if (!name) return;
      attendedByName[name] = (attendedByName[name] || 0) + 1;
    });

    const remainingByName = {};
    Object.keys(purchasedByName).forEach(name => {
      remainingByName[name] = purchasedByName[name] - (attendedByName[name] || 0);
    });

    // 「剩餘堂數」大於 0，而且老師也符合的人才預設列入名單
    const validNames = Object.keys(remainingByName).filter(name => remainingByName[name] > 0 && teacherMatches(name));

    const existing = allAttendance.filter(a => String(a['上課紀錄編號']) === String(session['編號']));
    const existingMap = {};
    existing.forEach(a => { existingMap[a['購買人']] = a['出席狀態']; });

    // 名單以還有剩餘堂數且老師符合的人為主；之前存過但現在不符合的人（例如單堂票已用完、或老師換人）也一併帶出來，避免資料不見
    const names = validNames.slice();
    existing.forEach(a => {
      if (a['購買人'] && !names.includes(a['購買人'])) names.push(a['購買人']);
    });

    attendanceRows = names.map(name => ({
      name,
      // 沒有存過紀錄的人，預設勾選（視為出席），需要老師自己取消勾選缺席的人
      present: existingMap[name] ? existingMap[name] === '出席' : true,
      remaining: remainingByName[name],
      restriction: purchasedByName[name] !== undefined ? restrictionLabel(name) : undefined
    }));

    renderAttendanceChecklist();
  } catch (err) {
    document.getElementById('attendance-list').innerHTML = '<p class="hint">讀取失敗，請確認網路連線。</p>';
    console.error(err);
  }
}

function renderAttendanceChecklist() {
  const listEl = document.getElementById('attendance-list');
  if (attendanceRows.length === 0) {
    listEl.innerHTML = '<p class="hint">目前這個課程項目沒有還有剩餘堂數的購買人，可以在下面手動加入姓名。</p>';
    return;
  }
  listEl.innerHTML = '<div class="attendance-checklist">' + attendanceRows.map((row, idx) => {
    const bits = [];
    if (row.remaining !== undefined) bits.push(`剩${row.remaining}堂`);
    if (row.restriction) bits.push(row.restriction);
    return `
      <label>
        <input type="checkbox" data-idx="${idx}" ${row.present ? 'checked' : ''} />
        ${escapeHtml(row.name)}${bits.length ? `<span class="optional-note">（${escapeHtml(bits.join('・'))}）</span>` : ''}
      </label>
    `;
  }).join('') + '</div>';

  listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      attendanceRows[Number(cb.dataset.idx)].present = cb.checked;
    });
  });
}

function closeAttendanceModal() {
  document.getElementById('attendance-overlay').classList.remove('active');
  attendanceCurrentSession = null;
  attendanceRows = [];
}

function setupAttendanceModal() {
  document.getElementById('attendance-add-btn').addEventListener('click', () => {
    const input = document.getElementById('attendance-add-name');
    const name = input.value.trim();
    if (!name) return;
    if (attendanceRows.some(r => r.name === name)) { input.value = ''; return; }
    attendanceRows.push({ name, present: true });
    input.value = '';
    renderAttendanceChecklist();
  });

  document.getElementById('attendance-save-btn').addEventListener('click', async () => {
    if (!attendanceCurrentSession) return;
    const btn = document.getElementById('attendance-save-btn');
    const msg = document.getElementById('attendance-msg');
    btn.disabled = true;
    msg.textContent = '儲存中…';
    msg.className = 'status-msg';
    try {
      const items = attendanceRows.map(r => ({ 購買人: r.name, 出席狀態: r.present ? '出席' : '缺席' }));
      const res = await apiPostRaw({
        action: 'saveClassAttendance',
        sessionId: attendanceCurrentSession['編號'],
        courseItem: attendanceCurrentSession['課程項目'],
        date: attendanceCurrentSession['日期'],
        courseName: attendanceCurrentSession['課程名稱'],
        items
      });
      if (res.ok) {
        msg.textContent = '✅ 已儲存';
        msg.className = 'status-msg ok';
      } else {
        msg.textContent = '❌ 儲存失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 儲存失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 學員總覽：不用另外填資料，即時從「售票登記」＋「上課出席名單」算出來 ----------
async function loadStudentOverview() {
  const wrap = document.getElementById('student-overview-wrap');
  wrap.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const [ticketRes, attendanceRes] = await Promise.all([
      apiGet({ action: 'list', type: 'ticket' }),
      apiGet({ action: 'list', type: 'classAttendance' })
    ]);
    if (!ticketRes.ok) {
      wrap.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(ticketRes.error || '')}</p>`;
      return;
    }

    // 依「購買人＋課程項目」分組（同一人可能同時有瑜珈年票、皮拉提斯季票，要分開算）
    const groups = {}; // key -> { name, courseItem, ticketType, identity, purchased, lastDate }
    const orderedKeys = [];
    function getGroup(name, course) {
      const key = name + '' + course;
      if (!groups[key]) {
        groups[key] = { name, courseItem: course, purchased: 0, teacherSet: new Set(), unrestricted: false };
        orderedKeys.push(key);
      }
      return groups[key];
    }

    (ticketRes.data || []).forEach(t => {
      const name = t['購買人'];
      if (!name) return;
      const g = getGroup(name, t['課程項目'] || '');
      g.purchased += Number(t['購買堂數']) || 0;
      const teacherText = String(t['指定老師'] || '').trim();
      if (!teacherText) {
        g.unrestricted = true;
      } else {
        teacherText.split(/[、,，]/).map(s => s.trim()).filter(Boolean).forEach(n => g.teacherSet.add(n));
      }
      // 用「購買日期」最新的一筆，當作目前顯示的票種／身分／聯絡方式／購買類型
      if (!g.lastDate || String(t['購買日期'] || '') >= String(g.lastDate)) {
        g.lastDate = t['購買日期'];
        g.ticketType = t['票種'];
        g.identity = t['身分'];
        g.phone = t['聯絡電話'];
        g.buyType = t['購買類型'];
        g.store = t['所屬店家'];
        g.line = t['LINE ID'];
      }
    });

    const attendanceByKey = {};
    const attendanceRows = attendanceRes.ok ? (attendanceRes.data || []) : [];
    attendanceRows.forEach(a => {
      const name = a['購買人'];
      if (!name) return;
      const course = a['課程項目'] || '';
      getGroup(name, course);
      const key = name + '' + course;
      (attendanceByKey[key] = attendanceByKey[key] || []).push(a);
    });

    orderedKeys.sort((ka, kb) => {
      const a = groups[ka], b = groups[kb];
      return a.name.localeCompare(b.name, 'zh-Hant') || String(a.courseItem).localeCompare(String(b.courseItem), 'zh-Hant');
    });

    if (orderedKeys.length === 0) {
      wrap.innerHTML = '<p class="hint">目前還沒有售票或上課出席資料。</p>';
      return;
    }

    const rowsHtml = orderedKeys.map((key, idx) => {
      const g = groups[key];
      const records = attendanceByKey[key] || [];
      const attended = records.filter(r => r['出席狀態'] === '出席').length;
      const remaining = g.purchased - attended;
      const teacherText = g.unrestricted ? '不限' : (g.teacherSet.size ? Array.from(g.teacherSet).join('、') : '-');
      const buyTypeText = g.buyType === '店家購票'
        ? '店家購票' + (g.store ? '（' + escapeHtml(g.store) + '）' : '')
        : (g.buyType ? escapeHtml(g.buyType) : '-');
      return `
        <tr>
          <td>${escapeHtml(g.name)}</td>
          <td>${escapeHtml(g.phone || '-')}</td>
          <td>${g.courseItem ? escapeHtml(g.courseItem) : '-'}</td>
          <td>${g.ticketType ? escapeHtml(g.ticketType) : '-'}</td>
          <td>${g.identity ? tagHtml(g.identity) : '-'}</td>
          <td>${buyTypeText}</td>
          <td>${escapeHtml(teacherText)}</td>
          <td class="amt">${g.purchased}</td>
          <td class="amt">${attended}</td>
          <td class="amt">${remaining}</td>
          <td><button type="button" class="btn-student-detail" data-idx="${idx}">查看明細</button></td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="cat-table">
        <thead><tr><th>姓名</th><th>電話</th><th>課程項目</th><th>票種</th><th>身分</th><th>購買類型</th><th>指定老師</th><th>購買堂數</th><th>已出席</th><th>剩餘堂數</th><th>操作</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    enhanceScrollableTables(wrap);

    wrap.querySelectorAll('.btn-student-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = orderedKeys[Number(btn.dataset.idx)];
        const g = groups[key];
        openStudentDetail(g, attendanceByKey[key] || []);
      });
    });
  } catch (err) {
    wrap.innerHTML = '<p class="hint">讀取失敗，請確認網路連線。</p>';
    console.error(err);
  }
}

function openStudentDetail(g, records) {
  const content = document.getElementById('detail-content');
  const sorted = [...records].sort((a, b) => String(b['日期'] || '').localeCompare(String(a['日期'] || '')));
  const attended = sorted.filter(r => r['出席狀態'] === '出席').length;
  const rowsHtml = sorted.map(r => `
    <tr>
      <td>${escapeHtml(r['日期'] || '')}</td>
      <td>${escapeHtml(r['課程名稱'] || '')}</td>
      <td>${tagHtml(r['出席狀態'] || '')}</td>
    </tr>
  `).join('');
  const contactBits = [];
  if (g.phone) contactBits.push('電話：' + g.phone);
  if (g.line) contactBits.push('LINE ID：' + g.line);
  if (g.buyType === '店家購票') contactBits.push('所屬店家：' + (g.store || '-'));
  else if (g.buyType) contactBits.push(g.buyType);
  content.innerHTML = `
    <h3>${escapeHtml(g.name)}　${escapeHtml(g.courseItem || '')}　上課明細</h3>
    ${contactBits.length ? `<p class="hint">${escapeHtml(contactBits.join('・'))}</p>` : ''}
    <p class="hint">共 ${sorted.length} 堂，出席 ${attended} 次、缺席 ${sorted.length - attended} 次。</p>
    ${sorted.length ? `
      <table class="cat-table">
        <thead><tr><th>日期</th><th>課程名稱</th><th>出席狀態</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    ` : '<p class="hint">目前還沒有上課紀錄。</p>'}
  `;
  document.getElementById('detail-overlay').classList.add('active');
}

// ---------- 分潤結算：專案下拉選單（登記收入、登記支出兩個表單共用） ----------
async function populateProjectSelect(selectEl) {
  if (!selectEl) return;
  try {
    const res = await apiGet({ action: 'list', type: 'project' });
    if (!res.ok) return;
    // 「大型專案」不做分潤結算，不列在這個選單裡
    const projects = res.data.slice().reverse().filter(p => p['專案類型'] !== '大型專案');
    selectEl.innerHTML = '<option value="">請選擇專案</option>' +
      projects.map(p => `<option value="${escapeHtml(p['編號'])}">${escapeHtml(p['專案名稱'] || '')}</option>`).join('');
  } catch (err) {
    console.error('讀取專案清單失敗', err);
  }
}

async function populateSettlementProjectSelect() {
  await populateProjectSelect(document.getElementById('settlement-project-select'));
}

async function populateExpenseItemProjectSelect() {
  await populateProjectSelect(document.getElementById('expense-item-project-select'));
}

function syncProjectSelectName(selectId, nameInputId) {
  const sel = document.getElementById(selectId);
  const nameInput = document.getElementById(nameInputId);
  if (!sel || !nameInput) return;
  sel.addEventListener('change', () => {
    const opt = sel.options[sel.selectedIndex];
    nameInput.value = opt ? opt.textContent : '';
  });
}

/**
 * 把 "YYYY-MM" 格式的月份字串往後加 n 個月，回傳新的 "YYYY-MM" 字串。
 */
function addMonths(monthStr, n) {
  const [y, m] = monthStr.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}

/**
 * 找到（或自動建立）某個專案在某個月份的分潤結算列，回傳它的編號。
 * 如果已經有這筆結算，且有帶入 revenueToSet，會直接更新收入（不會產生重複紀錄）。
 * revenueToSet 傳 undefined 表示不動收入欄位（例如只是要登記支出時使用）。
 */
async function findOrCreateSettlement(projectId, projectName, month, revenueToSet) {
  const res = await apiGet({ action: 'list', type: 'projectSettlement' });
  const rows = res.ok ? res.data : [];
  const existing = rows.find(r => String(r['專案編號']) === String(projectId) && String(r['月份']) === String(month));

  const hasRevenue = revenueToSet !== undefined && revenueToSet !== null && revenueToSet !== '';

  if (existing) {
    if (hasRevenue) {
      await apiPostRaw({ action: 'update', type: 'projectSettlement', id: existing['編號'], data: { 收入: revenueToSet } });
    }
    return existing['編號'];
  }

  const createRes = await apiPost('projectSettlement', {
    專案編號: projectId,
    專案名稱: projectName,
    月份: month,
    收入: hasRevenue ? revenueToSet : 0
  });
  return createRes.id;
}

// ---------- 登記收入表單：同一個專案＋月份重複填會直接更新，不會產生重複結算列 ----------
function setupSettlementForm() {
  const form = document.getElementById('settlement-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');

    const projectSelect = document.getElementById('settlement-project-select');
    const projectId = projectSelect.value;
    const projectName = document.getElementById('settlement-project-name').value;
    const month = document.getElementById('settlement-month').value;
    const income = document.getElementById('settlement-income').value;
    const note = document.getElementById('settlement-note').value.trim();

    if (!projectId || !month || income === '') {
      msg.textContent = '❌ 請選擇專案、月份，並填寫收入';
      msg.className = 'status-msg error';
      return;
    }

    btn.disabled = true;
    msg.textContent = '送出中…';
    msg.className = 'status-msg';

    try {
      const id = await findOrCreateSettlement(projectId, projectName, month, income);
      if (note) {
        await apiPostRaw({ action: 'update', type: 'projectSettlement', id, data: { 備註: note } });
      }
      msg.textContent = `✅ 已儲存 ${month} 的收入`;
      msg.className = 'status-msg ok';
      form.reset();
      document.getElementById('settlement-project-name').value = '';
      loadList('projectSettlement', 'project-settlement');
    } catch (err) {
      msg.textContent = '❌ 送出失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 登記支出表單：不用先知道收入、不用先建立分潤結算，直接選專案＋月份就能登記支出 ----------
function setupExpenseItemQuickForm() {
  const form = document.getElementById('expense-item-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');

    const projectSelect = document.getElementById('expense-item-project-select');
    const projectId = projectSelect.value;
    const projectName = document.getElementById('expense-item-project-name').value;
    const month = document.getElementById('expense-item-month').value;
    const desc = document.getElementById('expense-item-desc').value.trim();
    const amount = document.getElementById('expense-item-amount').value;
    const note = document.getElementById('expense-item-note').value.trim();

    if (!projectId || !month || !desc || amount === '') {
      msg.textContent = '❌ 請選擇專案、月份，並填寫項目說明與金額';
      msg.className = 'status-msg error';
      return;
    }

    btn.disabled = true;
    msg.textContent = '送出中…';
    msg.className = 'status-msg';

    try {
      const settlementId = await findOrCreateSettlement(projectId, projectName, month, undefined);
      const res = await apiPost('projectExpenseItem', {
        分潤編號: settlementId,
        專案名稱: projectName,
        月份: month,
        項目說明: desc,
        金額: amount,
        備註: note
      });
      if (res.ok) {
        msg.textContent = `✅ 已新增支出（${month}）`;
        msg.className = 'status-msg ok';
        form.reset();
        document.getElementById('expense-item-project-name').value = '';
        loadList('projectSettlement', 'project-settlement');
      } else {
        msg.textContent = '❌ 新增失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 新增失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 列表渲染（一般表格） ----------
async function loadList(type, viewKey) {
  const container = document.querySelector(`#view-${viewKey} [data-list="${type}"]`);
  if (!container) return;
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const res = await apiGet({ action: 'list', type });
    if (!res.ok) {
      container.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(res.error || '')}</p>`;
      return;
    }
    let rows = res.data.slice().reverse(); // 最新在前

    const filterBox = document.querySelector(`#view-${viewKey} [data-filter="${type}"]`);
    if (filterBox && filterBox.checked) {
      rows = rows.filter(r => r['狀態'] !== '已完成');
    }

    rows = rows.slice(0, 50); // 最多顯示 50 筆
    const cols = COLUMN_ORDER[type];
    if (rows.length === 0) {
      container.innerHTML = '<p class="hint">目前還沒有資料</p>';
      return;
    }

    const linkInfo = DETAIL_LINK[type];
    const isExpense = type === 'expense';
    const isSettlement = type === 'projectSettlement';
    const isClassSession = type === 'classSession';
    const canEdit = !!FIELD_META[type];
    let headerCols = cols.slice();
    if (canEdit || isExpense || isSettlement) headerCols = headerCols.concat(['操作']);

    let html = '<table><thead><tr>' + headerCols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(r => {
      const rowAttr = linkInfo ? ` class="clickable-row" data-fk-id="${escapeHtml(r[linkInfo.fk] || '')}"` : '';
      html += `<tr${rowAttr}>` + cols.map(c => {
        const val = r[c] !== undefined && r[c] !== null ? r[c] : '';
        if (LINK_COLUMNS.has(c)) {
          return `<td>${val ? `<a class="receipt-link" href="${escapeHtml(val)}" target="_blank" rel="noopener">查看附件</a>` : '-'}</td>`;
        }
        return `<td>${TAG_COLUMNS.has(c) ? tagHtml(val) : escapeHtml(String(val))}</td>`;
      }).join('');

      if (canEdit || isExpense || isSettlement) {
        let actionHtml = '';
        if (canEdit) {
          actionHtml += `<button type="button" class="btn-edit" data-edit-id="${escapeHtml(r['編號'])}">編輯</button>`;
        }
        if (isSettlement) {
          const label = escapeHtml((r['專案名稱'] || '') + '　' + (r['月份'] || ''));
          actionHtml += ` <button type="button" class="btn-costitems" data-settlement-id="${escapeHtml(r['編號'])}" data-settlement-label="${label}" data-project-name="${escapeHtml(r['專案名稱'] || '')}" data-month="${escapeHtml(r['月份'] || '')}">支出明細</button>`;
        }
        if (isClassSession) {
          actionHtml += ` <button type="button" class="btn-attendance" data-session-id="${escapeHtml(r['編號'])}">出席名單</button>`;
        }
        if (isExpense && r['審核狀態'] === '待審核') {
          actionHtml += ` <button type="button" class="btn-approve" data-expense-id="${escapeHtml(r['編號'])}" data-decision="已核准">核准</button>
            <button type="button" class="btn-reject" data-expense-id="${escapeHtml(r['編號'])}" data-decision="已退回">退回</button>`;
        }
        html += `<td class="row-actions">${actionHtml}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    enhanceScrollableTables(container);

    if (linkInfo) {
      container.querySelectorAll('tr[data-fk-id]').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button, a')) return;
          if (tr.dataset.fkId) linkInfo.open(tr.dataset.fkId);
        });
      });
    }

    if (canEdit) {
      container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rowData = rows.find(r => String(r['編號']) === btn.dataset.editId);
          if (rowData) openEditModal(type, rowData, () => loadList(type, viewKey));
        });
      });
    }

    if (isSettlement) {
      container.querySelectorAll('.btn-costitems').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCostItemsModal(
            btn.dataset.settlementId, btn.dataset.settlementLabel,
            btn.dataset.projectName, btn.dataset.month,
            () => loadList(type, viewKey)
          );
        });
      });
    }

    if (isExpense) {
      container.querySelectorAll('.btn-approve, .btn-reject').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          decideExpense(btn.dataset.expenseId, btn.dataset.decision, type, viewKey);
        });
      });
    }

    if (isClassSession) {
      container.querySelectorAll('.btn-attendance').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rowData = rows.find(r => String(r['編號']) === btn.dataset.sessionId);
          if (rowData) openAttendanceModal(rowData);
        });
      });
    }
  } catch (err) {
    container.innerHTML = `<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>`;
    console.error(err);
  }
}

// ---------- 請款審核 ----------
async function decideExpense(id, decision, type, viewKey) {
  const approver = document.getElementById('approver-select').value;
  if (!approver) {
    alert('請先在上方選擇「審核人」再進行核准／退回');
    return;
  }
  try {
    const res = await apiPostRaw({ action: 'approveExpense', id, data: { 審核狀態: decision, 審核人: approver } });
    if (res.ok) {
      loadList(type, viewKey);
    } else {
      alert('操作失敗：' + res.error);
    }
  } catch (err) {
    alert('操作失敗，請確認網路連線');
    console.error(err);
  }
}

// ---------- 歷史紀錄清單（文件卡片，會議／專案共用） ----------
const DOC_CONFIG = {
  meeting: {
    titleField: '會議主題',
    metaFn: (r) => `${r['會議日期'] || ''}　主持人：${r['主持人'] || ''}`,
    emptyText: '目前還沒有會議記錄'
  },
  project: {
    titleField: '專案名稱',
    metaFn: (r) => `${r['專案類型'] ? '【' + escapeHtml(r['專案類型']) + '】　' : ''}主要負責人：${r['主要負責人'] || '-'}${r['介紹人'] ? '　介紹人：' + escapeHtml(r['介紹人']) : ''}　開始：${r['開始日期'] || '-'}　預計完成：${r['預計完成日'] || '-'}`,
    emptyText: '目前還沒有專案'
  }
};

async function loadDocList(entity) {
  const container = document.querySelector(`[data-doclist="${entity}"]`);
  if (!container) return;
  const cfg = DOC_CONFIG[entity];
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const res = await apiGet({ action: 'list', type: entity });
    if (!res.ok) {
      container.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(res.error || '')}</p>`;
      return;
    }
    const rows = res.data.slice().reverse().slice(0, 50);
    if (rows.length === 0) {
      container.innerHTML = `<p class="hint">${escapeHtml(cfg.emptyText)}</p>`;
      return;
    }
    container.innerHTML = rows.map(r => `
      <div class="doc-item" data-id="${escapeHtml(r['編號'] || '')}">
        <div class="doc-main">
          <div class="doc-title">${escapeHtml(r[cfg.titleField] || '（未命名）')}</div>
          <div class="doc-meta">${cfg.metaFn(r)}</div>
        </div>
        <div class="doc-arrow">›</div>
      </div>
    `).join('');
    container.querySelectorAll('.doc-item').forEach(el => {
      el.addEventListener('click', () => openDetail(entity, el.dataset.id));
    });
  } catch (err) {
    container.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

// ---------- 專案進度追蹤：每個專案一張簡易卡片（名稱、類型、負責人、工作事項進度摘要），點進去才有完整內容 ----------
async function loadProjectTrackList() {
  const container = document.querySelector('#view-project-track [data-doclist="project-track"]');
  if (!container) return;
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const [projectRes, itemRes] = await Promise.all([
      apiGet({ action: 'list', type: 'project' }),
      apiGet({ action: 'list', type: 'projectItem' })
    ]);
    if (!projectRes.ok) {
      container.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(projectRes.error || '')}</p>`;
      return;
    }
    const projects = projectRes.data.slice().reverse().slice(0, 50);
    const items = itemRes.ok ? itemRes.data : [];
    if (projects.length === 0) {
      container.innerHTML = '<p class="hint">目前還沒有專案</p>';
      return;
    }

    function renderCard(p) {
      const pid = p['編號'];
      const pItems = items.filter(i => String(i['專案編號']) === String(pid));
      const total = pItems.length;
      const doneCount = pItems.filter(i => i['狀態'] === '已完成').length;
      const avgProgress = total > 0
        ? Math.round(pItems.reduce((sum, i) => sum + (Number(i['進度(%)']) || 0), 0) / total)
        : 0;
      const progressText = total === 0
        ? '尚無工作事項'
        : `工作事項 ${total} 筆・已完成 ${doneCount} 筆・平均進度 ${avgProgress}%`;

      return `
        <div class="doc-item" data-id="${escapeHtml(pid || '')}">
          <div class="doc-main">
            <div class="doc-title">${escapeHtml(p['專案名稱'] || '（未命名）')}${p['專案類型'] ? `<span class="tag">${escapeHtml(p['專案類型'])}</span>` : ''}</div>
            <div class="doc-meta">主要負責人：${escapeHtml(p['主要負責人'] || '-')}　${progressText}</div>
            ${total > 0 ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${avgProgress}%"></div></div>` : ''}
          </div>
          <div class="doc-arrow">›</div>
        </div>
      `;
    }

    // 依「專案類型」分類顯示，比較好找（沒有類型的舊資料歸在「未分類」）
    const TYPE_ORDER = ['一次性專案', '長期性專案', '大型專案', '未分類'];
    const groups = {};
    projects.forEach(p => {
      const t = p['專案類型'] && TYPE_ORDER.indexOf(p['專案類型']) !== -1 ? p['專案類型'] : '未分類';
      (groups[t] = groups[t] || []).push(p);
    });

    container.innerHTML = TYPE_ORDER
      .filter(t => groups[t] && groups[t].length > 0)
      .map(t => `
        <div class="subsection">
          <h3>${escapeHtml(t)}（${groups[t].length}）</h3>
          <div class="doc-list">${groups[t].map(renderCard).join('')}</div>
        </div>
      `).join('');

    container.querySelectorAll('.doc-item').forEach(el => {
      el.addEventListener('click', () => openDetail('project', el.dataset.id));
    });
  } catch (err) {
    container.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

// ---------- 分潤總覽：每月需要分潤的專案，依「主要負責人」分類，可查詢過去月份 ----------
const settlementSummaryCache = { projects: [], settlements: [] };

async function loadSettlementSummaryData() {
  const container = document.getElementById('settlement-summary-container');
  const monthSel = document.getElementById('settlement-summary-month');
  if (!container || !monthSel) return;
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const [projectRes, settlementRes] = await Promise.all([
      apiGet({ action: 'list', type: 'project' }),
      apiGet({ action: 'list', type: 'projectSettlement' })
    ]);
    settlementSummaryCache.projects = projectRes.ok ? projectRes.data : [];
    settlementSummaryCache.settlements = settlementRes.ok ? settlementRes.data : [];

    if (!monthSel.dataset.wired) {
      monthSel.addEventListener('change', renderSettlementSummary);
      monthSel.dataset.wired = '1';
    }
    populateSettlementSummaryMonths();
    renderSettlementSummary();
  } catch (err) {
    container.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

function populateSettlementSummaryMonths() {
  const sel = document.getElementById('settlement-summary-month');
  const months = Array.from(new Set(settlementSummaryCache.settlements.map(r => r['月份']).filter(Boolean)))
    .sort().reverse();
  const current = sel.value;
  sel.innerHTML = '<option value="">全部月份</option>' + months.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  if (months.indexOf(current) !== -1) sel.value = current;
}

function renderSettlementSummary() {
  const container = document.getElementById('settlement-summary-container');
  const monthSel = document.getElementById('settlement-summary-month');
  if (!container || !monthSel) return;
  const month = monthSel.value;

  const ownerMap = {};
  settlementSummaryCache.projects.forEach(p => { ownerMap[p['編號']] = p['主要負責人'] || '未指定負責人'; });

  let rows = settlementSummaryCache.settlements;
  if (month) rows = rows.filter(r => String(r['月份']) === month);

  if (rows.length === 0) {
    container.innerHTML = '<p class="hint">目前沒有符合的分潤結算紀錄。</p>';
    return;
  }

  const groups = {};
  rows.forEach(r => {
    const owner = ownerMap[r['專案編號']] || '未指定負責人';
    (groups[owner] = groups[owner] || []).push(r);
  });
  const owners = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  container.innerHTML = owners.map(owner => {
    const items = groups[owner].slice().sort((a, b) => String(b['月份'] || '').localeCompare(String(a['月份'] || '')));
    const subtotal = items.reduce((sum, r) => sum + (Number(r['主要負責人分潤金額']) || 0), 0);
    return `
      <div class="subsection">
        <h3>${escapeHtml(owner)}（${items.length} 筆，主要負責人分潤小計 NT$ ${subtotal.toLocaleString()}）</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>專案名稱</th><th>月份</th><th>收入</th><th>成本</th><th>專案金額</th><th>主要負責人分潤</th><th>介紹人分潤</th><th>完成狀態</th><th>放行狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${items.map(r => {
                const released = r['放行狀態'] === '已放行';
                const completed = r['完成狀態'] === '已完成';
                let actionHtml;
                if (released) {
                  actionHtml = `<button type="button" class="secondary btn-release" data-settlement-id="${escapeHtml(r['編號'])}" data-decision="未放行">取消放行</button>`;
                } else if (completed) {
                  actionHtml = `<button type="button" class="secondary btn-release" data-settlement-id="${escapeHtml(r['編號'])}" data-decision="已放行">放行</button>`;
                } else {
                  actionHtml = `<span class="hint" style="margin:0;">尚未完成，無法放行</span>`;
                }
                return `<tr>
                <td>${escapeHtml(r['專案名稱'] || '')}</td>
                <td>${escapeHtml(r['月份'] || '')}</td>
                <td>${escapeHtml(String(r['收入'] ?? ''))}</td>
                <td>${escapeHtml(String(r['成本'] ?? ''))}</td>
                <td>${escapeHtml(String(r['專案金額'] ?? ''))}</td>
                <td>${escapeHtml(String(r['主要負責人分潤金額'] ?? ''))}</td>
                <td>${escapeHtml(String(r['介紹人分潤金額'] ?? ''))}</td>
                <td>${tagHtml(r['完成狀態'] || '進行中')}</td>
                <td>${tagHtml(r['放行狀態'] || '未放行')}</td>
                <td class="row-actions">${actionHtml}</td>
              </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  enhanceScrollableTables(container);

  container.querySelectorAll('.btn-release').forEach(btn => {
    btn.addEventListener('click', () => decideSettlementRelease(btn.dataset.settlementId, btn.dataset.decision));
  });
}

// ---------- 分潤總覽：財務標記分潤結算是否已放行（撥款） ----------
async function decideSettlementRelease(id, decision) {
  const releaser = document.getElementById('settlement-release-select').value;
  if (decision === '已放行' && !releaser) {
    alert('請先在上方選擇「放行人」再進行放行');
    return;
  }
  try {
    const res = await apiPostRaw({ action: 'releaseSettlement', id, data: { 放行狀態: decision, 放行人: releaser } });
    if (res.ok) {
      await loadSettlementSummaryData();
    } else {
      alert('操作失敗：' + res.error);
    }
  } catch (err) {
    alert('操作失敗，請確認網路連線');
    console.error(err);
  }
}

// ---------- 會議追蹤：每次會議一張簡易卡片（以會議日期排序、待辦事項完成摘要），點進去才有完整內容 ----------
async function loadMeetingTrackList() {
  const container = document.querySelector('#view-meeting-track [data-doclist="meeting-track"]');
  if (!container) return;
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const [meetingRes, todoRes] = await Promise.all([
      apiGet({ action: 'list', type: 'meeting' }),
      apiGet({ action: 'list', type: 'meetingTodo' })
    ]);
    if (!meetingRes.ok) {
      container.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(meetingRes.error || '')}</p>`;
      return;
    }
    // 以會議日期排序（新到舊）
    const meetings = meetingRes.data.slice().sort((a, b) => String(b['會議日期'] || '').localeCompare(String(a['會議日期'] || ''))).slice(0, 50);
    const todos = todoRes.ok ? todoRes.data : [];
    if (meetings.length === 0) {
      container.innerHTML = '<p class="hint">目前還沒有會議記錄</p>';
      return;
    }

    container.innerHTML = meetings.map(m => {
      const mid = m['編號'];
      const mTodos = todos.filter(t => String(t['會議編號']) === String(mid));
      const total = mTodos.length;
      const doneCount = mTodos.filter(t => t['狀態'] === '已完成').length;
      const progressText = total === 0
        ? '尚無待辦事項'
        : `待辦事項 ${total} 筆・已完成 ${doneCount} 筆`;

      return `
        <div class="doc-item" data-id="${escapeHtml(mid || '')}">
          <div class="doc-main">
            <div class="doc-title">${escapeHtml(m['會議日期'] || '')}　${escapeHtml(m['會議主題'] || '（未命名）')}</div>
            <div class="doc-meta">主持人：${escapeHtml(m['主持人'] || '-')}　${progressText}</div>
            ${total > 0 ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.round(doneCount / total * 100)}%"></div></div>` : ''}
          </div>
          <div class="doc-arrow">›</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.doc-item').forEach(el => {
      el.addEventListener('click', () => openDetail('meeting', el.dataset.id));
    });
  } catch (err) {
    container.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

// ---------- 待辦事項清單：所有會議的待辦事項，依「負責人」分類，可直接標記完成／取消完成 ----------
// 標記完成只會更新這筆待辦事項自己的「狀態」與「完成日期」，不會動到會議記錄本身的內容（會議記錄是年末績效考核用的歷史紀錄，維持原樣）。
// 項目不會因為完成而消失，會留在清單裡並顯示完成日期，方便留存紀錄；還沒完成的排在前面，已完成的排在後面。
function todayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const meetingTodoListCache = { meetings: [], todos: [] };

async function loadMeetingTodoListData() {
  const container = document.getElementById('meeting-todo-list-container');
  const filterSel = document.getElementById('todo-status-filter');
  if (!container) return;
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const [meetingRes, todoRes] = await Promise.all([
      apiGet({ action: 'list', type: 'meeting' }),
      apiGet({ action: 'list', type: 'meetingTodo' })
    ]);
    if (!todoRes.ok) {
      container.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(todoRes.error || '')}</p>`;
      return;
    }
    meetingTodoListCache.meetings = meetingRes.ok ? meetingRes.data : [];
    meetingTodoListCache.todos = todoRes.data;

    if (filterSel && !filterSel.dataset.wired) {
      filterSel.addEventListener('change', renderMeetingTodoList);
      filterSel.dataset.wired = '1';
    }
    renderMeetingTodoList();
  } catch (err) {
    container.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

function renderMeetingTodoList() {
  const container = document.getElementById('meeting-todo-list-container');
  const filterSel = document.getElementById('todo-status-filter');
  if (!container) return;
  const filter = filterSel ? filterSel.value : '';

  const meetingMap = {};
  meetingTodoListCache.meetings.forEach(m => { meetingMap[m['編號']] = m; });

  if (meetingTodoListCache.todos.length === 0) {
    container.innerHTML = '<p class="hint">目前還沒有任何待辦事項。</p>';
    return;
  }

  const visibleTodos = filter ? meetingTodoListCache.todos.filter(t => (t['狀態'] || '未開始') === filter) : meetingTodoListCache.todos;
  if (visibleTodos.length === 0) {
    container.innerHTML = '<p class="hint">沒有符合篩選條件的待辦事項。</p>';
    return;
  }

  const groups = {};
  visibleTodos.forEach(t => {
    const owner = t['負責人'] || '未指定負責人';
    (groups[owner] = groups[owner] || []).push(t);
  });
  const owners = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const today = todayStr();

  container.innerHTML = owners.map(owner => {
    const openCount = groups[owner].filter(t => t['狀態'] !== '已完成').length;
    const countLabel = filter ? `共 ${groups[owner].length} 筆` : `共 ${groups[owner].length} 筆，還在進行中 ${openCount} 筆`;
    // 還沒完成的排前面（依預計完成日，快到期的優先）；已完成的排後面（依完成日期，最近完成的優先）
    const items = groups[owner].slice().sort((a, b) => {
      const aDone = a['狀態'] === '已完成';
      const bDone = b['狀態'] === '已完成';
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (!aDone) {
        const da = a['預計完成日'] || '9999-99-99';
        const db = b['預計完成日'] || '9999-99-99';
        return da.localeCompare(db);
      }
      const da2 = a['完成日期'] || '';
      const db2 = b['完成日期'] || '';
      return db2.localeCompare(da2);
    });
    return `
      <div class="subsection">
        <h3>${escapeHtml(owner)}（${countLabel}）</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>建立日期（會議日期）</th><th>會議主題</th><th>待辦事項</th><th>預計完成日</th><th>狀態</th><th>完成日期</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${items.map(t => {
                const meeting = meetingMap[t['會議編號']] || {};
                const due = t['預計完成日'] || '';
                const done = t['狀態'] === '已完成';
                const overdue = !done && due && due < today;
                const actionHtml = done
                  ? `<button type="button" class="secondary btn-complete-todo" data-todo-id="${escapeHtml(t['編號'])}" data-decision="進行中">取消完成</button>`
                  : `<button type="button" class="secondary btn-complete-todo" data-todo-id="${escapeHtml(t['編號'])}" data-decision="已完成">標記完成</button>`;
                return `<tr>
                  <td>${escapeHtml(meeting['會議日期'] || '')}</td>
                  <td>${escapeHtml(meeting['會議主題'] || '')}</td>
                  <td>${escapeHtml(t['待辦事項內容'] || '')}</td>
                  <td>${escapeHtml(due)}${overdue ? ' <span class="overdue-note">已逾期</span>' : ''}</td>
                  <td>${tagHtml(t['狀態'])}</td>
                  <td>${escapeHtml(t['完成日期'] || '-')}</td>
                  <td class="row-actions">${actionHtml}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  enhanceScrollableTables(container);

  container.querySelectorAll('.btn-complete-todo').forEach(btn => {
    btn.addEventListener('click', async () => {
      const decision = btn.dataset.decision;
      btn.disabled = true;
      btn.textContent = '儲存中…';
      try {
        const res = await apiPostRaw({ action: 'completeTodo', id: btn.dataset.todoId, data: { 狀態: decision } });
        if (res.ok) {
          loadMeetingTodoListData();
        } else {
          alert('操作失敗：' + res.error);
          btn.disabled = false;
          btn.textContent = decision === '已完成' ? '標記完成' : '取消完成';
        }
      } catch (err) {
        alert('操作失敗，請確認網路連線');
        console.error(err);
        btn.disabled = false;
        btn.textContent = decision === '已完成' ? '標記完成' : '取消完成';
      }
    });
  });
}

// ---------- 會議日曆：月曆檢視，顯示已登記的會議日期 ----------
let calendarCurrentMonth = null; // 'YYYY-MM' 格式，null 代表還沒初始化，會用今天所在的月份
let calendarMeetingsCache = [];

async function loadMeetingCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  if (!calendarCurrentMonth) calendarCurrentMonth = todayStr().slice(0, 7);
  grid.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const res = await apiGet({ action: 'list', type: 'meeting' });
    calendarMeetingsCache = res.ok ? (res.data || []) : [];
    renderCalendar();
  } catch (err) {
    grid.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('calendar-month-label');
  const dayDetail = document.getElementById('calendar-day-detail');
  if (!grid) return;

  const [year, month] = calendarCurrentMonth.split('-').map(Number); // month: 1-12
  label.textContent = `${year} 年 ${month} 月`;
  dayDetail.innerHTML = '';

  // 把這個月的會議依日期分組（同一天可能不只一場會議）
  const byDate = {};
  calendarMeetingsCache.forEach(m => {
    const d = m['會議日期'];
    if (d && String(d).slice(0, 7) === calendarCurrentMonth) {
      (byDate[d] = byDate[d] || []).push(m);
    }
  });

  const firstOfMonth = new Date(year, month - 1, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=週日
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = todayStr();
  const pad = n => String(n).padStart(2, '0');

  const weekHeaderHtml = ['日', '一', '二', '三', '四', '五', '六']
    .map(w => `<div class="calendar-weekday">${w}</div>`).join('');

  let cellsHtml = '';
  for (let i = 0; i < startWeekday; i++) cellsHtml += '<div class="calendar-cell calendar-cell-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const meetings = byDate[dateStr] || [];
    const hasMeeting = meetings.length > 0;
    const isToday = dateStr === today;
    cellsHtml += `
      <div class="calendar-cell${hasMeeting ? ' calendar-has-meeting' : ''}${isToday ? ' calendar-today' : ''}" data-date="${dateStr}">
        <div class="calendar-date">${d}</div>
        ${hasMeeting ? `<div class="calendar-dot" title="${escapeHtml(meetings.map(m => m['會議主題'] || '').join('、'))}">${meetings.length} 場</div>` : ''}
      </div>`;
  }

  grid.innerHTML = `<div class="calendar-grid-inner">${weekHeaderHtml}${cellsHtml}</div>`;

  grid.querySelectorAll('.calendar-has-meeting').forEach(cell => {
    cell.addEventListener('click', () => {
      const dateStr = cell.dataset.date;
      const meetings = byDate[dateStr] || [];
      dayDetail.innerHTML = `
        <h3>${escapeHtml(dateStr)} 的會議（${meetings.length} 場）</h3>
        <div class="doc-list">${meetings.map(m => `
          <div class="doc-item" data-id="${escapeHtml(m['編號'] || '')}">
            <div class="doc-main">
              <div class="doc-title">${escapeHtml(m['會議主題'] || '（未命名）')}</div>
              <div class="doc-meta">主持人：${escapeHtml(m['主持人'] || '')}</div>
            </div>
            <div class="doc-arrow">›</div>
          </div>
        `).join('')}</div>
      `;
      dayDetail.querySelectorAll('.doc-item').forEach(el => {
        el.addEventListener('click', () => openDetail('meeting', el.dataset.id));
      });
    });
  });
}

// ---------- 共用：未完成待辦事項表格（含「未完成原因」欄位，可直接編輯儲存）----------
// 「未完成原因」存在該筆待辦事項自己的「備註」欄位裡（會議待辦事項分頁），不管在哪裡編輯，存的都是同一筆資料。
function renderUnfinishedTodoTable(todos) {
  if (todos.length === 0) {
    return '<p class="hint">上次待辦事項都已如期完成，沒有需要追蹤的項目。</p>';
  }
  return '<table class="doc-todo-table"><thead><tr><th>待辦事項</th><th>負責人</th><th>狀態</th><th>未完成原因</th><th></th></tr></thead><tbody>' +
    todos.map(t => `<tr>
        <td>${escapeHtml(t['待辦事項內容'] || '')}</td>
        <td>${escapeHtml(t['負責人'] || '')}</td>
        <td>${tagHtml(t['狀態'])}</td>
        <td><input type="text" class="unfinished-reason-input" data-todo-id="${escapeHtml(t['編號'])}" value="${escapeHtml(t['備註'] || '')}" placeholder="寫下未完成的原因" /></td>
        <td><button type="button" class="secondary btn-save-reason" data-todo-id="${escapeHtml(t['編號'])}">儲存</button></td>
      </tr>`).join('') + '</tbody></table>';
}

function wireUnfinishedReasonButtons(container) {
  container.querySelectorAll('.btn-save-reason').forEach(btn => {
    btn.addEventListener('click', async () => {
      const todoId = btn.dataset.todoId;
      const input = container.querySelector(`.unfinished-reason-input[data-todo-id="${todoId}"]`);
      const reason = input ? input.value : '';
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = '儲存中…';
      try {
        const res = await apiPostRaw({ action: 'update', type: 'meetingTodo', id: todoId, data: { 備註: reason } });
        btn.textContent = res.ok ? '已儲存' : '失敗';
      } catch (err) {
        btn.textContent = '失敗';
        console.error(err);
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = originalText; }, 1500);
      }
    });
  });
}

// ---------- 共用：會議議題列表（標題＋內容條列顯示，數量不限；editable=true 時每筆可以點「編輯」修改） ----------
function renderTopicList(topics, editable) {
  if (topics.length === 0) {
    return '<p class="hint">（沒有議題紀錄）</p>';
  }
  return '<ol class="topic-list">' + topics.map(t => `
      <li>
        <div class="topic-body">
          <div class="topic-title">${escapeHtml(t['議題標題'] || '')}</div>
          ${t['議題內容'] ? `<div class="topic-content-text">${escapeHtml(t['議題內容'])}</div>` : ''}
        </div>
        ${editable ? `<button type="button" class="secondary btn-edit-topic" data-topic-id="${escapeHtml(t['編號'])}">編輯</button>` : ''}
      </li>
    `).join('') + '</ol>';
}

// ---------- 上次會議記錄（追溯參考）：新增會議記錄頁面上方顯示最近一次會議的內容與未完成待辦事項 ----------
async function loadLastMeetingReference() {
  const card = document.getElementById('last-meeting-ref-card');
  const content = document.getElementById('last-meeting-ref-content');
  if (!card || !content) return;
  try {
    const [meetingRes, topicRes, todoRes] = await Promise.all([
      apiGet({ action: 'list', type: 'meeting' }),
      apiGet({ action: 'list', type: 'meetingTopic' }),
      apiGet({ action: 'list', type: 'meetingTodo' })
    ]);
    if (!meetingRes.ok || meetingRes.data.length === 0) {
      card.style.display = 'none';
      return;
    }
    // 以會議日期找出最近一次的會議（日期相同時，用清單裡較後面的當作較新）
    const meetings = meetingRes.data.slice().sort((a, b) => String(a['會議日期'] || '').localeCompare(String(b['會議日期'] || '')));
    const last = meetings[meetings.length - 1];
    const topics = (topicRes.ok ? topicRes.data : []).filter(t => String(t['會議編號']) === String(last['編號']));
    const todos = (todoRes.ok ? todoRes.data : []).filter(t => String(t['會議編號']) === String(last['編號']));
    const unfinished = todos.filter(t => t['狀態'] !== '已完成');

    const todoHtml = renderUnfinishedTodoTable(unfinished);

    content.innerHTML = `
      <div class="doc-header-meta" style="margin-bottom:10px;">
        <span>會議日期：${escapeHtml(last['會議日期'] || '')}</span>
        <span>會議主題：${escapeHtml(last['會議主題'] || '')}</span>
        <span>主持人：${escapeHtml(last['主持人'] || '')}</span>
      </div>
      <div class="doc-block">
        <h4>上次會議議題（共 ${topics.length} 筆）</h4>
        ${renderTopicList(topics, false)}
      </div>
      <div class="doc-block">
        <h4>上次未如期完成的待辦事項（共 ${unfinished.length} 筆，全部 ${todos.length} 筆）</h4>
        ${todoHtml}
      </div>
    `;
    card.style.display = 'block';
    enhanceScrollableTables(content);

    wireUnfinishedReasonButtons(content);
  } catch (err) {
    card.style.display = 'none';
    console.error(err);
  }
}

// ---------- 詳細頁（彈窗，文件式，會議／專案共用） ----------
function docBlock(title, value) {
  const has = value && String(value).trim();
  return `
    <div class="doc-block">
      <h4>${escapeHtml(title)}</h4>
      <div class="doc-block-body ${has ? '' : 'empty'}">${has ? escapeHtml(value) : '（無）'}</div>
    </div>`;
}

async function openDetail(entity, id) {
  if (!id) return;
  if (entity === 'meeting') return openMeetingDetail(id);
  if (entity === 'project') return openProjectDetail(id);
}

async function openMeetingDetail(meetingId) {
  const content = document.getElementById('detail-content');
  content.innerHTML = '<p class="hint">載入中…</p>';
  document.getElementById('detail-overlay').classList.add('active');

  try {
    const [meetingRes, topicRes, todoRes] = await Promise.all([
      apiGet({ action: 'list', type: 'meeting' }),
      apiGet({ action: 'list', type: 'meetingTopic' }),
      apiGet({ action: 'list', type: 'meetingTodo' })
    ]);
    if (!meetingRes.ok) { content.innerHTML = '讀取失敗：' + escapeHtml(meetingRes.error || ''); return; }
    const meeting = meetingRes.data.find(m => String(m['編號']) === String(meetingId));
    if (!meeting) { content.innerHTML = '<p class="hint">找不到這筆會議記錄。</p>'; return; }
    const topics = (topicRes.ok ? topicRes.data : []).filter(t => String(t['會議編號']) === String(meetingId));
    const todos = (todoRes.ok ? todoRes.data : []).filter(t => String(t['會議編號']) === String(meetingId));
    const allTodos = todoRes.ok ? todoRes.data : [];

    // 找出「上一次會議」（按會議日期排序，排在這場會議前面那一場），列出它未完成的待辦事項（內容／負責人／未完成原因），方便追蹤
    const sortedMeetings = meetingRes.data.slice().sort((a, b) => String(a['會議日期'] || '').localeCompare(String(b['會議日期'] || '')));
    const idx = sortedMeetings.findIndex(m => String(m['編號']) === String(meetingId));
    const prevMeeting = idx > 0 ? sortedMeetings[idx - 1] : null;
    let prevBlockHtml = '';
    if (prevMeeting) {
      const prevTodos = allTodos.filter(t => String(t['會議編號']) === String(prevMeeting['編號']));
      const prevUnfinished = prevTodos.filter(t => t['狀態'] !== '已完成');
      prevBlockHtml = `
        <div class="doc-block">
          <h4>上次會議（${escapeHtml(prevMeeting['會議日期'] || '')}　${escapeHtml(prevMeeting['會議主題'] || '')}）未完成的待辦事項（共 ${prevUnfinished.length} 筆，全部 ${prevTodos.length} 筆）</h4>
          ${renderUnfinishedTodoTable(prevUnfinished)}
        </div>
      `;
    }

    let todoHtml;
    if (todos.length === 0) {
      todoHtml = '<p class="hint">這次會議沒有待辦事項</p>';
    } else {
      todoHtml = '<table class="doc-todo-table"><thead><tr><th>待辦事項</th><th>負責人</th><th>預計完成日</th><th>狀態</th><th></th></tr></thead><tbody>' +
        todos.map(t => `<tr>
            <td>${escapeHtml(t['待辦事項內容'] || '')}</td>
            <td>${escapeHtml(t['負責人'] || '')}</td>
            <td>${escapeHtml(t['預計完成日'] || '')}</td>
            <td>${tagHtml(t['狀態'])}</td>
            <td><button type="button" class="btn-edit" data-todo-id="${escapeHtml(t['編號'])}">編輯</button></td>
          </tr>`).join('') + '</tbody></table>';
    }

    content.innerHTML = `
      <div class="doc-header doc-header-actions">
        <div>
          <h2>${escapeHtml(meeting['會議主題'] || '（未命名會議）')}</h2>
          <div class="doc-header-meta">
            <span>會議日期：${escapeHtml(meeting['會議日期'] || '')}</span>
            <span>主持人：${escapeHtml(meeting['主持人'] || '')}</span>
            <span>缺席：${escapeHtml(meeting['缺席人員'] || '無')}</span>
          </div>
        </div>
        <button type="button" class="secondary" id="btn-edit-meeting">編輯會議記錄</button>
      </div>
      <div class="doc-block">
        <h4>本次會議議題（共 ${topics.length} 筆）</h4>
        ${renderTopicList(topics, true)}
      </div>
      ${docBlock('追蹤上次進度', meeting['追蹤上次進度'])}
      ${prevBlockHtml}
      <div class="doc-block">
        <h4>待辦事項（共 ${todos.length} 筆）</h4>
        ${todoHtml}
      </div>
      ${docBlock('備註', meeting['備註'])}
    `;
    enhanceScrollableTables(content);

    document.getElementById('btn-edit-meeting').addEventListener('click', () => {
      openEditModal('meeting', meeting, () => {
        openMeetingDetail(meetingId);
        loadDocList('meeting');
        loadMeetingTrackList();
        loadLastMeetingReference();
        loadMeetingTodoListData();
      });
    });
    content.querySelectorAll('.btn-edit[data-todo-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = todos.find(x => String(x['編號']) === btn.dataset.todoId);
        if (t) {
          openEditModal('meetingTodo', t, () => {
            openMeetingDetail(meetingId);
            loadMeetingTrackList();
            loadLastMeetingReference();
            loadMeetingTodoListData();
          });
        }
      });
    });
    content.querySelectorAll('.btn-edit-topic[data-topic-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tp = topics.find(x => String(x['編號']) === btn.dataset.topicId);
        if (tp) {
          openEditModal('meetingTopic', tp, () => {
            openMeetingDetail(meetingId);
          });
        }
      });
    });
    wireUnfinishedReasonButtons(content);
  } catch (err) {
    content.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

async function openProjectDetail(projectId) {
  const content = document.getElementById('detail-content');
  content.innerHTML = '<p class="hint">載入中…</p>';
  document.getElementById('detail-overlay').classList.add('active');

  try {
    const [projectRes, itemRes, settlementRes] = await Promise.all([
      apiGet({ action: 'list', type: 'project' }),
      apiGet({ action: 'list', type: 'projectItem' }),
      apiGet({ action: 'list', type: 'projectSettlement' })
    ]);
    if (!projectRes.ok) { content.innerHTML = '讀取失敗：' + escapeHtml(projectRes.error || ''); return; }
    const project = projectRes.data.find(p => String(p['編號']) === String(projectId));
    if (!project) { content.innerHTML = '<p class="hint">找不到這個專案。</p>'; return; }
    const items = (itemRes.ok ? itemRes.data : []).filter(i => String(i['專案編號']) === String(projectId));
    const settlements = (settlementRes.ok ? settlementRes.data : []).filter(r => String(r['專案編號']) === String(projectId));

    let itemHtml;
    if (items.length === 0) {
      itemHtml = '<p class="hint">這個專案還沒有工作事項</p>';
    } else {
      itemHtml = '<table class="doc-todo-table"><thead><tr><th>事項內容</th><th>負責人</th><th>進度(%)</th><th>狀態</th><th></th></tr></thead><tbody>' +
        items.map(i => `<tr>
            <td>${escapeHtml(i['事項內容'] || '')}</td>
            <td>${escapeHtml(i['負責人'] || '')}</td>
            <td>${escapeHtml(i['進度(%)'] !== undefined ? i['進度(%)'] : '')}</td>
            <td>${tagHtml(i['狀態'])}</td>
            <td><button type="button" class="btn-edit" data-item-id="${escapeHtml(i['編號'])}">編輯</button></td>
          </tr>`).join('') + '</tbody></table>';
    }

    let settlementBlock = '';
    if (project['專案類型'] === '大型專案') {
      settlementBlock = `<div class="doc-block"><h4>分潤結算</h4><p class="hint">「大型專案」類型不做分潤結算。</p></div>`;
    } else if (settlements.length === 0) {
      settlementBlock = `<div class="doc-block"><h4>分潤結算</h4><p class="hint">目前還沒有分潤結算紀錄，可以到「分潤結算」頁籤新增。</p></div>`;
    } else {
      const rows = settlements.slice().sort((a, b) => String(a['月份'] || '').localeCompare(String(b['月份'] || '')));
      const settlementHtml = '<table class="doc-todo-table"><thead><tr><th>月份</th><th>收入</th><th>成本</th><th>專案金額</th><th>主要負責人分潤</th><th>介紹人分潤</th><th>公司利潤</th><th></th></tr></thead><tbody>' +
        rows.map(s => `<tr>
            <td>${escapeHtml(s['月份'] || '')}</td>
            <td>${escapeHtml(s['收入'] !== undefined ? s['收入'] : '')}</td>
            <td>${escapeHtml(s['成本'] !== undefined ? s['成本'] : '')}</td>
            <td>${escapeHtml(s['專案金額'] !== undefined ? s['專案金額'] : '')}</td>
            <td>${escapeHtml(s['主要負責人分潤金額'] !== undefined ? s['主要負責人分潤金額'] : '')}</td>
            <td>${escapeHtml(s['介紹人分潤金額'] !== undefined ? s['介紹人分潤金額'] : '')}</td>
            <td>${escapeHtml(s['公司利潤金額'] !== undefined ? s['公司利潤金額'] : '')}</td>
            <td class="row-actions">
              <button type="button" class="btn-edit" data-settlement-id="${escapeHtml(s['編號'])}">編輯</button>
              <button type="button" class="btn-costitems" data-costitems-id="${escapeHtml(s['編號'])}">支出明細</button>
            </td>
          </tr>`).join('') + '</tbody></table>';
      settlementBlock = `
        <div class="doc-block">
          <h4>分潤結算紀錄（共 ${settlements.length} 筆）</h4>
          ${settlementHtml}
        </div>`;
    }

    content.innerHTML = `
      <div class="doc-header doc-header-actions">
        <div>
          <h2>${escapeHtml(project['專案名稱'] || '（未命名專案）')}</h2>
          <div class="doc-header-meta">
            <span>${project['專案類型'] ? escapeHtml(project['專案類型']) : ''}</span>
            <span>主要負責人：${escapeHtml(project['主要負責人'] || '-')}</span>
            <span>介紹人：${escapeHtml(project['介紹人'] || '無')}</span>
            <span>開始：${escapeHtml(project['開始日期'] || '-')}</span>
            <span>預計完成：${escapeHtml(project['預計完成日'] || '-')}</span>
          </div>
        </div>
        <button type="button" class="secondary" id="btn-edit-project">編輯專案</button>
      </div>
      ${docBlock('說明', project['說明'])}
      <div class="doc-block">
        <h4>工作事項（共 ${items.length} 筆）</h4>
        ${itemHtml}
      </div>
      ${settlementBlock}
      ${docBlock('備註', project['備註'])}
    `;
    enhanceScrollableTables(content);

    document.getElementById('btn-edit-project').addEventListener('click', () => {
      openEditModal('project', project, () => { openProjectDetail(projectId); loadDocList('project'); loadProjectTrackList(); });
    });
    content.querySelectorAll('[data-item-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = items.find(x => String(x['編號']) === btn.dataset.itemId);
        if (i) openEditModal('projectItem', i, () => { openProjectDetail(projectId); loadProjectTrackList(); });
      });
    });
    content.querySelectorAll('[data-settlement-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = settlements.find(x => String(x['編號']) === btn.dataset.settlementId);
        if (s) openEditModal('projectSettlement', s, () => openProjectDetail(projectId));
      });
    });
    content.querySelectorAll('[data-costitems-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = settlements.find(x => String(x['編號']) === btn.dataset.costitemsId);
        if (s) {
          openCostItemsModal(
            s['編號'], (s['專案名稱'] || '') + '　' + (s['月份'] || ''),
            s['專案名稱'], s['月份'],
            () => openProjectDetail(projectId)
          );
        }
      });
    });
  } catch (err) {
    content.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('active');
}

// ---------- 篩選開關 ----------
function setupFilters() {
  document.querySelectorAll('[data-filter]').forEach(box => {
    box.addEventListener('change', () => {
      const viewKey = box.closest('.content-view').id.replace('view-', '');
      loadList(box.dataset.filter, viewKey);
    });
  });
}

// ---------- 會議表單：多筆待辦事項的送出邏輯 ----------
function setupMeetingForm() {
  const form = document.getElementById('meeting-form');
  if (!form) return;

  document.getElementById('add-todo-row').addEventListener('click', addTodoRow);
  document.getElementById('add-topic-row').addEventListener('click', addTopicRow);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');

    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });
    const todoRows = collectTodoRows();
    const topicRows = collectTopicRows();

    btn.disabled = true;
    msg.textContent = '送出中…';
    msg.className = 'status-msg';

    try {
      const meetingRes = await apiPost('meeting', data);
      if (!meetingRes.ok) {
        msg.textContent = '❌ 送出失敗：' + meetingRes.error;
        msg.className = 'status-msg error';
        return;
      }
      const meetingId = meetingRes.id;

      for (const topic of topicRows) {
        await apiPost('meetingTopic', {
          會議編號: meetingId,
          會議主題: data['會議主題'],
          議題標題: topic.議題標題,
          議題內容: topic.議題內容
        });
      }

      for (const todo of todoRows) {
        await apiPost('meetingTodo', {
          會議編號: meetingId,
          會議主題: data['會議主題'],
          待辦事項內容: todo.待辦事項內容,
          負責人: todo.負責人,
          預計完成日: todo.預計完成日,
          狀態: '未開始'
        });
      }

      msg.textContent = `✅ 已送出（會議編號：${meetingId}，議題 ${topicRows.length} 筆，待辦事項 ${todoRows.length} 筆）`;
      msg.className = 'status-msg ok';
      form.reset();
      resetTodoRows();
      resetTopicRows();
      loadDocList('meeting');
      loadMeetingTrackList();
      loadLastMeetingReference();
      loadMeetingTodoListData();
    } catch (err) {
      msg.textContent = '❌ 送出失敗，請確認設定或網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 專案表單：多筆工作事項的送出邏輯 ----------
// 依「專案類型」自動顯示／隱藏收入登記欄位（一次性專案／長期性專案才需要填收入）
function updateProjectIncomeFieldsVisibility() {
  const typeSel = document.getElementById('project-type-select');
  const section = document.getElementById('project-income-fields');
  const label = document.getElementById('project-income-label');
  const hint = document.getElementById('project-income-hint');
  const onetimeFields = document.getElementById('project-income-onetime-fields');
  const longtermFields = document.getElementById('project-income-longterm-fields');
  if (!typeSel || !section) return;

  if (typeSel.value === '一次性專案') {
    section.style.display = 'block';
    onetimeFields.style.display = 'grid';
    longtermFields.style.display = 'none';
    label.textContent = '收入登記（選填）';
    hint.innerHTML = '<ul class="hint-list">' +
      '<li>填「收入」即可，送出專案後會自動建立一筆分潤結算</li>' +
      '<li>成本不用現在就知道，之後可以到「分潤結算」頁籤逐筆新增支出</li>' +
      '</ul>';
  } else if (typeSel.value === '長期性專案') {
    section.style.display = 'block';
    onetimeFields.style.display = 'none';
    longtermFields.style.display = 'grid';
    label.textContent = '每月固定收入登記（選填）';
    hint.innerHTML = '<ul class="hint-list">' +
      '<li>填「起始月份」與「每月固定金額」，送出專案後會自動建立 12 個月的分潤結算（金額固定相同）</li>' +
      '<li>之後如果金額有變動，可以到「分潤結算」頁籤個別編輯調整</li>' +
      '</ul>';
  } else {
    section.style.display = 'none';
  }
}

function setupProjectForm() {
  const form = document.getElementById('project-form');
  if (!form) return;

  document.getElementById('add-project-item-row').addEventListener('click', addProjectItemRow);
  document.getElementById('project-type-select').addEventListener('change', updateProjectIncomeFieldsVisibility);
  updateProjectIncomeFieldsVisibility();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');

    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });
    const itemRows = collectProjectItemRows();

    const incomeSection = document.getElementById('project-income-fields');
    const incomeVisible = incomeSection && incomeSection.style.display !== 'none';
    const isLongTerm = data['專案類型'] === '長期性專案';

    const incomeMonthEl = document.getElementById('project-income-month');
    const incomeAmountEl = document.getElementById('project-income-amount');
    const incomeMonth = incomeMonthEl ? incomeMonthEl.value : '';
    const incomeAmount = incomeAmountEl ? incomeAmountEl.value : '';

    const startMonthEl = document.getElementById('project-longterm-start-month');
    const fixedAmountEl = document.getElementById('project-longterm-amount');
    const startMonth = startMonthEl ? startMonthEl.value : '';
    const fixedAmount = fixedAmountEl ? fixedAmountEl.value : '';

    if (incomeVisible && !isLongTerm && incomeAmount && !incomeMonth) {
      msg.textContent = '❌ 有填「收入」的話，請一併選擇「入帳月份」';
      msg.className = 'status-msg error';
      return;
    }
    if (incomeVisible && isLongTerm && fixedAmount && !startMonth) {
      msg.textContent = '❌ 有填「每月固定金額」的話，請一併選擇「起始月份」';
      msg.className = 'status-msg error';
      return;
    }

    btn.disabled = true;
    msg.textContent = '送出中…';
    msg.className = 'status-msg';

    try {
      const projectRes = await apiPost('project', data);
      if (!projectRes.ok) {
        msg.textContent = '❌ 送出失敗：' + projectRes.error;
        msg.className = 'status-msg error';
        return;
      }
      const projectId = projectRes.id;

      for (const item of itemRows) {
        await apiPost('projectItem', {
          專案編號: projectId,
          專案名稱: data['專案名稱'],
          事項內容: item.事項內容,
          負責人: item.負責人,
          '進度(%)': item['進度(%)'],
          狀態: item.狀態
        });
      }

      let incomeNote = '';
      if (incomeVisible && isLongTerm && fixedAmount && startMonth) {
        for (let i = 0; i < 12; i++) {
          const month = addMonths(startMonth, i);
          await apiPost('projectSettlement', {
            專案編號: projectId,
            專案名稱: data['專案名稱'],
            月份: month,
            收入: fixedAmount
          });
        }
        incomeNote = '，已自動建立 12 個月的分潤結算';
      } else if (incomeVisible && !isLongTerm && incomeAmount) {
        await findOrCreateSettlement(projectId, data['專案名稱'], incomeMonth, incomeAmount);
        incomeNote = '，已登記收入';
      }

      msg.textContent = `✅ 已送出（專案編號：${projectId}，工作事項 ${itemRows.length} 筆${incomeNote}）`;
      msg.className = 'status-msg ok';
      form.reset();
      resetProjectItemRows();
      updateProjectIncomeFieldsVisibility();
      loadDocList('project');
      loadProjectTrackList();
      populateSettlementProjectSelect();
    } catch (err) {
      msg.textContent = '❌ 送出失敗，請確認設定或網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 請款表單：支援上傳收據照片 ----------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // data:image/png;base64,xxxx
      const base64 = result.substring(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupExpenseForm() {
  const form = document.getElementById('expense-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');

    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });

    const fileInput = document.getElementById('expense-receipt');
    const selectedFile = fileInput.files[0];

    btn.disabled = true;
    msg.textContent = selectedFile ? '上傳附件中…' : '送出中…';
    msg.className = 'status-msg';

    try {
      let filePayload = null;
      if (selectedFile) {
        if (selectedFile.size > 8 * 1024 * 1024) {
          msg.textContent = '❌ 照片檔案太大，請控制在 8MB 以內';
          msg.className = 'status-msg error';
          btn.disabled = false;
          return;
        }
        const base64 = await fileToBase64(selectedFile);
        filePayload = { base64, mimeType: selectedFile.type, filename: selectedFile.name };
        msg.textContent = '送出中…';
      }

      const res = await apiPost('expense', data, filePayload);
      if (res.ok) {
        msg.textContent = '✅ 已送出（編號：' + res.id + '）';
        msg.className = 'status-msg ok';
        form.reset();
      } else {
        msg.textContent = '❌ 送出失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 送出失敗，請確認設定或網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 記帳：市集／教育／選品店／門人四個帳戶，同一個入口切換帳戶，各自存到自己的分頁 ----------
let ledgerFormSetup = false;

// 「逐筆記帳」「本月收支總覽」是兩個分開的頁籤，各自有自己的帳戶切換列，這裡把兩個都畫出來、保持同步
const LEDGER_ACCOUNT_TAB_CONTAINER_IDS = ['ledger-account-tabs', 'ledger-overview-account-tabs'];

function renderLedgerAccountTabs() {
  LEDGER_ACCOUNT_TAB_CONTAINER_IDS.forEach(id => {
    const box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = LEDGER_ACCOUNTS.map(a =>
      `<button type="button" data-account="${a.key}" class="${a.key === ledgerCurrentAccountKey ? 'active' : ''}">${escapeHtml(a.label)}</button>`
    ).join('');
    box.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.account === ledgerCurrentAccountKey) return;
        ledgerCurrentAccountKey = btn.dataset.account;
        ledgerCurrentMonth = null; // 換帳戶時，月份總覽改成該帳戶預設的最新月份
        renderLedgerAccountTabs();
        refreshLedgerAccountView();
      });
    });
  });
}

async function loadLedgerOpeningBalances() {
  if (Object.keys(ledgerOpeningCache).length > 0) return;
  try {
    const res = await apiGet({ action: 'ledgerOpening' });
    if (res.ok) {
      (res.data || []).forEach(r => {
        ledgerOpeningCache[r['帳戶']] = { 起始日期: r['起始日期'], 起始餘額: Number(r['起始餘額']) || 0 };
      });
    }
  } catch (err) {
    console.error('讀取記帳起始餘額失敗', err);
  }
}

async function fetchLedgerRows(accountKey) {
  const type = LEDGER_TYPE_BY_KEY[accountKey];
  const res = await apiGet({ action: 'list', type });
  const rows = res.ok ? (res.data || []) : [];
  ledgerRowsCache[accountKey] = rows;
  return rows;
}

// 依日期（同日再依編號）排序後，從起始餘額往下累加，回傳每一筆附上 _balance（累加後的帳戶餘額）
function computeLedgerRunningBalances(rows, openingBalance) {
  const sorted = [...rows].sort((a, b) => {
    const d = String(a['日期'] || '').localeCompare(String(b['日期'] || ''));
    if (d !== 0) return d;
    return String(a['編號'] || '').localeCompare(String(b['編號'] || ''));
  });
  let running = openingBalance;
  return sorted.map(r => {
    running += (Number(r['收入']) || 0) - (Number(r['支出']) || 0);
    return Object.assign({}, r, { _balance: running });
  });
}

async function loadLedgerView() {
  if (!ledgerFormSetup) { setupLedgerForm(); setupLedgerArchiveButton(); ledgerFormSetup = true; }
  renderLedgerAccountTabs();
  await loadLedgerOpeningBalances();
  await refreshLedgerAccountView();
}

// 「存檔到 Google Sheet」：把目前畫面上算好的本月收支總覽（含各帳目類別小計）寫一份到「記帳月結存檔」分頁
function setupLedgerArchiveButton() {
  const btn = document.getElementById('ledger-archive-btn');
  const msg = document.getElementById('ledger-archive-msg');
  btn.addEventListener('click', async () => {
    if (!ledgerLastOverview) return;
    btn.disabled = true;
    msg.textContent = '存檔中…';
    msg.className = 'status-msg';
    try {
      const res = await apiPostRaw({ action: 'archiveLedgerMonth', account: ledgerLastOverview.account, month: ledgerLastOverview.month, items: ledgerLastOverview.items });
      if (res.ok) {
        msg.textContent = '✅ 已存檔';
        msg.className = 'status-msg ok';
      } else {
        msg.textContent = '❌ 存檔失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 存檔失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

async function refreshLedgerAccountView() {
  const account = LEDGER_ACCOUNTS.find(a => a.key === ledgerCurrentAccountKey);
  document.getElementById('ledger-list-title').textContent = account.label + '帳戶　逐筆記錄';

  const opening = ledgerOpeningCache[account.label];
  const asofHint = document.getElementById('ledger-asof-hint');
  asofHint.textContent = opening ? `帳戶餘額以 ${opening.起始日期} 的餘額（${Number(opening.起始餘額).toLocaleString()}）為基準往下累加` : '';

  const wrap = document.getElementById('ledger-table-wrap');
  wrap.innerHTML = '<p class="hint">載入中…</p>';

  const rows = await fetchLedgerRows(ledgerCurrentAccountKey);
  const withBalance = computeLedgerRunningBalances(rows, opening ? opening.起始餘額 : 0);

  renderLedgerTable(withBalance);
  populateLedgerMonthSelect(withBalance);
}

function renderLedgerTable(withBalance) {
  const wrap = document.getElementById('ledger-table-wrap');
  if (withBalance.length === 0) {
    wrap.innerHTML = '<p class="hint">這個帳戶還沒有任何記帳記錄。</p>';
    return;
  }
  const newestFirst = [...withBalance].reverse();
  const rowsHtml = newestFirst.map(r => `
    <tr>
      <td>${escapeHtml(r['日期'] || '')}</td>
      <td>${escapeHtml(r['帳目類別'] || '')}</td>
      <td>${escapeHtml(r['項目明細'] || '')}</td>
      <td class="amt in">${r['收入'] ? Number(r['收入']).toLocaleString() : '-'}</td>
      <td class="amt out">${r['支出'] ? Number(r['支出']).toLocaleString() : '-'}</td>
      <td class="amt">${Number(r._balance).toLocaleString()}</td>
      <td>${isTruthyBool(r['需要開立發票']) ? (r['發票開立日期'] ? '已開立' : '待開立') : '-'}</td>
      <td><button type="button" class="btn-edit" data-id="${escapeHtml(r['編號'])}">編輯</button></td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="cat-table">
      <thead>
        <tr><th>日期</th><th>帳目類別</th><th>項目明細</th><th>收入</th><th>支出</th><th>帳戶餘額</th><th>發票</th><th>操作</th></tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  enhanceScrollableTables(wrap);

  wrap.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = withBalance.find(r => String(r['編號']) === btn.dataset.id);
      if (!row) return;
      openEditModal(LEDGER_TYPE_BY_KEY[ledgerCurrentAccountKey], row, refreshLedgerAccountView);
    });
  });
}

// 「計入月份」有填就用那個，沒填就用「日期」所在的月份 —— 讓薪資這種要算進別月份損益的記錄可以正確歸類
function ledgerEffectiveMonth(r) {
  return r['計入月份'] || String(r['日期'] || '').slice(0, 7);
}

function populateLedgerMonthSelect(withBalance) {
  const sel = document.getElementById('ledger-month-select');
  const months = [...new Set(withBalance.map(ledgerEffectiveMonth).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  if (months.length === 0) {
    sel.innerHTML = '';
    document.getElementById('ledger-overview-content').innerHTML = '<p class="hint">這個帳戶還沒有資料，無法顯示本月收支總覽。</p>';
    return;
  }
  if (!ledgerCurrentMonth || months.indexOf(ledgerCurrentMonth) === -1) {
    ledgerCurrentMonth = months[0];
  }
  sel.innerHTML = months.map(m => `<option value="${m}" ${m === ledgerCurrentMonth ? 'selected' : ''}>${m.replace('-', ' 年 ')} 月</option>`).join('');
  sel.onchange = () => {
    ledgerCurrentMonth = sel.value;
    renderLedgerOverview(withBalance, ledgerCurrentMonth);
  };
  renderLedgerOverview(withBalance, ledgerCurrentMonth);
}

// 「本月收支總覽」最後一次算好的結果，給「存檔到 Google Sheet」按鈕用，不用重新算一次
let ledgerLastOverview = null;

function renderLedgerOverview(withBalance, month) {
  const box = document.getElementById('ledger-overview-content');
  const monthRows = withBalance.filter(r => ledgerEffectiveMonth(r) === month && r['帳目類別'] !== '前月餘額');

  let totalIn = 0, totalOut = 0;
  const cats = {};
  monthRows.forEach(r => {
    const inc = Number(r['收入']) || 0;
    const out = Number(r['支出']) || 0;
    totalIn += inc;
    totalOut += out;
    const cat = r['帳目類別'] || '（未分類）';
    if (!cats[cat]) cats[cat] = { in: 0, out: 0 };
    cats[cat].in += inc;
    cats[cat].out += out;
  });

  // 每個支出類別佔當月總收入的比例（例如人員薪資佔收入 7.2%），沒有收入的月份就顯示 - ，不會除以 0
  const pctOfIncome = out => (totalIn > 0 && out > 0) ? (out / totalIn * 100).toFixed(1) + '%' : '-';

  const sortedCats = Object.keys(cats).sort((a, b) => (cats[b].in + cats[b].out) - (cats[a].in + cats[a].out));
  const catRows = sortedCats.map(cat => `
      <tr>
        <td>${escapeHtml(cat)}</td>
        <td class="amt in">${cats[cat].in ? cats[cat].in.toLocaleString() : '-'}</td>
        <td class="amt out">${cats[cat].out ? cats[cat].out.toLocaleString() : '-'}</td>
        <td class="amt">${pctOfIncome(cats[cat].out)}</td>
      </tr>
    `).join('');

  box.innerHTML = `
    <div class="ledger-big-numbers">
      <div class="box in"><div class="label">收入</div><div class="value">${totalIn.toLocaleString()}</div></div>
      <div class="box out"><div class="label">支出</div><div class="value">${totalOut.toLocaleString()}</div></div>
      <div class="box balance"><div class="label">結餘（收入－支出）</div><div class="value">${(totalIn - totalOut).toLocaleString()}</div></div>
    </div>
    ${catRows ? `
      <details class="cat-detail" open>
        <summary>各帳目類別小計（點可收合）</summary>
        <table class="cat-table">
          <thead><tr><th>帳目類別</th><th>收入</th><th>支出</th><th>支出佔收入%</th></tr></thead>
          <tbody>${catRows}</tbody>
        </table>
        <p class="hint">「支出佔收入%」是這個類別的支出，佔當月總收入的比例，方便看哪個項目花費比重比較大；當月沒有收入的話會顯示「-」。</p>
      </details>
    ` : '<p class="hint">這個月沒有記帳記錄。</p>'}
  `;

  const account = LEDGER_ACCOUNTS.find(a => a.key === ledgerCurrentAccountKey);
  ledgerLastOverview = {
    account: account.label,
    month,
    items: [
      { '項目': '合計', '收入': totalIn, '支出': totalOut },
      ...sortedCats.map(cat => ({ '項目': cat, '收入': cats[cat].in, '支出': cats[cat].out }))
    ]
  };
  const archiveMsg = document.getElementById('ledger-archive-msg');
  if (archiveMsg) { archiveMsg.textContent = ''; archiveMsg.className = 'status-msg'; }
}

function setupLedgerForm() {
  const form = document.getElementById('ledger-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');
    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.name] = cb.checked ? 'TRUE' : 'FALSE'; });

    btn.disabled = true;
    msg.textContent = '送出中…';
    msg.className = 'status-msg';

    try {
      const type = LEDGER_TYPE_BY_KEY[ledgerCurrentAccountKey];
      const res = await apiPost(type, data);
      if (res.ok) {
        msg.textContent = '✅ 已送出（編號：' + res.id + '）';
        msg.className = 'status-msg ok';
        form.reset();
        await refreshLedgerAccountView();
      } else {
        msg.textContent = '❌ 送出失敗：' + res.error;
        msg.className = 'status-msg error';
      }
    } catch (err) {
      msg.textContent = '❌ 送出失敗，請確認網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 發票待開立：合併四個帳戶，只列出「需要開立發票」但「還沒填開立日期」的記錄 ----------
async function loadInvoicePendingList() {
  const wrap = document.getElementById('invoice-pending-wrap');
  wrap.innerHTML = '<p class="hint">載入中…</p>';

  try {
    const results = await Promise.all(LEDGER_ACCOUNTS.map(a => apiGet({ action: 'list', type: a.type })));
    const pending = [];
    results.forEach((res, i) => {
      const account = LEDGER_ACCOUNTS[i];
      if (!res.ok) return;
      (res.data || []).forEach(r => {
        if (isTruthyBool(r['需要開立發票']) && !r['發票開立日期']) {
          pending.push(Object.assign({ _account: account }, r));
        }
      });
    });
    pending.sort((a, b) => String(b['日期'] || '').localeCompare(String(a['日期'] || '')));
    renderInvoicePendingList(pending);
  } catch (err) {
    wrap.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

function renderInvoicePendingList(pending) {
  const wrap = document.getElementById('invoice-pending-wrap');
  if (pending.length === 0) {
    wrap.innerHTML = '<p class="hint">目前沒有需要開立發票的記錄。</p>';
    return;
  }
  const today = todayStr();
  const rowsHtml = pending.map((r, i) => {
    const amount = Number(r['收入']) || Number(r['支出']) || 0;
    return `
      <tr>
        <td>${escapeHtml(r._account.label)}</td>
        <td>${escapeHtml(r['日期'] || '')}</td>
        <td>${escapeHtml(r['項目明細'] || '')}</td>
        <td class="amt">${amount ? amount.toLocaleString() : '-'}</td>
        <td><span class="badge pending">未開立</span></td>
        <td>
          <div class="invoice-mark-row">
            <input type="date" class="invoice-date-input" value="${today}" data-idx="${i}" />
            <button type="button" class="btn-edit mark-issued-btn" data-idx="${i}">標記已開立</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="cat-table">
      <thead><tr><th>帳戶</th><th>記帳日期</th><th>項目</th><th>金額</th><th>發票開立日期</th><th>操作</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  enhanceScrollableTables(wrap);

  wrap.querySelectorAll('.mark-issued-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.idx);
      const row = pending[idx];
      const dateInput = wrap.querySelector(`.invoice-date-input[data-idx="${idx}"]`);
      const dateVal = dateInput.value;
      if (!dateVal) { alert('請先選擇發票開立日期'); return; }
      btn.disabled = true;
      btn.textContent = '處理中…';
      try {
        const res = await apiPostRaw({
          action: 'update',
          type: row._account.type,
          id: row['編號'],
          data: { '發票開立日期': dateVal }
        });
        if (res.ok) {
          await loadInvoicePendingList();
        } else {
          alert('標記失敗：' + res.error);
          btn.disabled = false;
          btn.textContent = '標記已開立';
        }
      } catch (err) {
        alert('標記失敗，請確認網路連線');
        console.error(err);
        btn.disabled = false;
        btn.textContent = '標記已開立';
      }
    });
  });
}

// ---------- 一般表單送出（會議／專案／請款表單走各自專屬邏輯，這裡處理其餘的） ----------
const CUSTOM_FORM_IDS = new Set(['meeting-form', 'project-form', 'expense-form', 'ledger-form', 'ticket-sales-form']);

function setupForms() {
  document.querySelectorAll('form[data-type]').forEach(form => {
    if (CUSTOM_FORM_IDS.has(form.id)) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = form.dataset.type;
      const btn = form.querySelector('button[type="submit"]');
      const msg = form.querySelector('.status-msg');

      const data = {};
      new FormData(form).forEach((value, key) => { data[key] = value; });

      btn.disabled = true;
      msg.textContent = '送出中…';
      msg.className = 'status-msg';

      try {
        const res = await apiPost(type, data);
        if (res.ok) {
          msg.textContent = '✅ 已送出（編號：' + res.id + '）';
          msg.className = 'status-msg ok';
          form.reset();
          // 同步更新畫面上跟這個類型有關的列表／建議清單
          document.querySelectorAll(`[data-list="${type}"]`).forEach(el => {
            const viewKey = el.closest('.content-view').id.replace('view-', '');
            loadList(type, viewKey);
          });
          if (type === 'inventory') loadDatalist('inventory', '品項名稱', 'inventory-name-list');
          if (type === 'course') loadCourseList();
          if (type === 'classSession') updateClassSessionTeacherOptions();
        } else {
          msg.textContent = '❌ 送出失敗：' + res.error;
          msg.className = 'status-msg error';
        }
      } catch (err) {
        msg.textContent = '❌ 送出失敗，請確認設定或網路連線';
        msg.className = 'status-msg error';
        console.error(err);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// ---------- 會員表單：選「會員等級」自動帶入建議年費（仍可手動調整） ----------
const MEMBER_TIER_FEES = { '共學者': 6000, '共創者': 18000, '領航者': 360000 };

function setupMemberTierAutofill() {
  const tierSel = document.getElementById('member-tier-select');
  const feeInput = document.getElementById('member-fee-input');
  if (!tierSel || !feeInput) return;
  tierSel.addEventListener('change', () => {
    const fee = MEMBER_TIER_FEES[tierSel.value];
    if (fee !== undefined) feeInput.value = fee;
  });
}

// ---------- 初始化 ----------
async function init() {
  buildHomeGrid();
  document.getElementById('back-btn').addEventListener('click', goHome);
  setupForms();
  setupFilters();
  setupMeetingForm();
  setupProjectForm();
  setupExpenseForm();
  setupSettlementForm();
  setupExpenseItemQuickForm();
  setupMemberTierAutofill();
  syncProjectSelectName('settlement-project-select', 'settlement-project-name');
  syncProjectSelectName('expense-item-project-select', 'expense-item-project-name');
  resetTodoRows();
  resetTopicRows();
  resetProjectItemRows();

  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetail();
  });
  document.getElementById('edit-close').addEventListener('click', closeEditModal);
  document.getElementById('edit-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'edit-overlay') closeEditModal();
  });
  document.getElementById('costitem-close').addEventListener('click', closeCostItemsModal);
  document.getElementById('costitem-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'costitem-overlay') closeCostItemsModal();
  });
  document.getElementById('tickettype-close').addEventListener('click', closeTicketTypeModal);
  document.getElementById('tickettype-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'tickettype-overlay') closeTicketTypeModal();
  });
  document.getElementById('course-add-teacher-btn').addEventListener('click', addCourseTeacherInline);
  document.getElementById('course-teacher-save-btn').addEventListener('click', saveCourseTeachers);
  setupAttendanceModal();
  setupTicketSalesForm();
  setupClassSessionForm();
  document.getElementById('attendance-close').addEventListener('click', closeAttendanceModal);
  document.getElementById('attendance-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'attendance-overlay') closeAttendanceModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeEditModal(); closeCostItemsModal(); closeTicketTypeModal(); closeAttendanceModal(); closeDetail(); }
  });

  document.getElementById('calendar-prev').addEventListener('click', () => {
    const [y, m] = calendarCurrentMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1); // m 是 1-12，減 2 等於上個月（js Date 月份是 0-11）
    calendarCurrentMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    renderCalendar();
  });
  document.getElementById('calendar-next').addEventListener('click', () => {
    const [y, m] = calendarCurrentMonth.split('-').map(Number);
    const next = new Date(y, m, 1); // m 是 1-12，剛好等於下個月（js Date 月份是 0-11）
    calendarCurrentMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    renderCalendar();
  });

  if (!isConfigured()) {
    document.getElementById('config-warning').style.display = 'block';
    return;
  }

  // 如果管理者有在「系統設定」填「系統密碼」，這裡會先跳出輸入畫面，答對才會繼續載入資料
  const granted = await ensureAccess();
  if (!granted) return;

  loadPartners();
  loadInstructors();
  loadDatalist('inventory', '品項名稱', 'inventory-name-list');
  populateSettlementProjectSelect();
  populateExpenseItemProjectSelect();
  loadDashboardStats();
}

document.addEventListener('DOMContentLoaded', init);

// 註冊 Service Worker：讓手機瀏覽器可以把這個網頁「加入主畫面」，像 App 一樣全螢幕開啟
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 註冊失敗不影響網頁其他功能，靜默忽略即可（例如用 file:// 開啟本機檔案時就會失敗）
    });
  });
}
