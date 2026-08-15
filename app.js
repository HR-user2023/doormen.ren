// 門人夥伴管理系統 - 前端邏輯
// 所有資料都是透過 config.js 裡設定的 Apps Script 網址跟 Google Sheet 溝通

const COLUMN_ORDER = {
  meeting: ['會議日期', '會議主題', '主持人', '出席人員', '本次會議內容', '追蹤上次進度', '待辦事項', '負責人', '預計完成日', '狀態', '備註'],
  project: ['專案名稱', '事項內容', '負責人', '開始日期', '預計完成日', '進度(%)', '狀態', '備註'],
  expense: ['申請日期', '申請人', '項目名稱', '金額', '說明', '審核狀態', '審核人', '審核日期', '備註'],
  attendance: ['日期', '姓名', '類型', '原因', '時數/天數', '本月累計次數', '備註'],
  inventory: ['品項名稱', '目前庫存', '安全庫存', '單位', '是否需補貨', '備註'],
  order: ['訂購日期', '品項名稱', '數量', '單價', '金額', '訂購人', '客戶/對象', '狀態', '備註']
};

function isConfigured() {
  return typeof APPS_SCRIPT_URL === 'string' &&
    APPS_SCRIPT_URL.startsWith('http') &&
    APPS_SCRIPT_URL.indexOf('/exec') !== -1;
}

async function apiGet(params) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(type, data) {
  // 用 text/plain 送出，避免瀏覽器對 Apps Script 發出 CORS 預檢請求（Apps Script 無法處理 OPTIONS）
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ type, data })
  });
  return res.json();
}

// ---------- 分頁切換 ----------
function setupTabs() {
  const buttons = document.querySelectorAll('#tabs button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ---------- 夥伴姓名下拉選單 ----------
async function loadPartners() {
  try {
    const res = await apiGet({ action: 'partners' });
    if (!res.ok) return;
    const names = res.data;
    document.querySelectorAll('select.partner-select').forEach(sel => {
      sel.innerHTML = '<option value="">請選擇姓名</option>' +
        names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    });
  } catch (err) {
    console.error('讀取夥伴名單失敗', err);
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

// ---------- 列表渲染 ----------
function tagHtml(value) {
  if (!value) return '';
  return `<span class="tag ${escapeHtml(String(value))}">${escapeHtml(String(value))}</span>`;
}

const TAG_COLUMNS = new Set(['狀態', '審核狀態', '是否需補貨', '類型']);

async function loadList(type) {
  const container = document.querySelector(`[data-list="${type}"]`);
  if (!container) return;
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const res = await apiGet({ action: 'list', type });
    if (!res.ok) {
      container.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(res.error || '')}</p>`;
      return;
    }
    const rows = res.data.slice().reverse().slice(0, 50); // 最新 50 筆
    const cols = COLUMN_ORDER[type];
    if (rows.length === 0) {
      container.innerHTML = '<p class="hint">目前還沒有資料</p>';
      return;
    }
    let html = '<table><thead><tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>' + cols.map(c => {
        const val = r[c] !== undefined && r[c] !== null ? r[c] : '';
        return `<td>${TAG_COLUMNS.has(c) ? tagHtml(val) : escapeHtml(String(val))}</td>`;
      }).join('') + '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>`;
    console.error(err);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

// ---------- 表單送出 ----------
function setupForms() {
  document.querySelectorAll('form[data-type]').forEach(form => {
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
          loadList(type);
          if (type === 'inventory') loadDatalist('inventory', '品項名稱', 'inventory-name-list');
          if (type === 'project') loadDatalist('project', '專案名稱', 'project-name-list');
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

// ---------- 初始化 ----------
function init() {
  setupTabs();
  setupForms();

  if (!isConfigured()) {
    document.getElementById('config-warning').style.display = 'block';
    return;
  }

  loadPartners();
  loadDatalist('project', '專案名稱', 'project-name-list');
  loadDatalist('inventory', '品項名稱', 'inventory-name-list');

  ['meeting', 'project', 'expense', 'attendance', 'order', 'inventory'].forEach(loadList);
}

document.addEventListener('DOMContentLoaded', init);
