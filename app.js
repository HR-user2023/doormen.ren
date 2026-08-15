// 門人夥伴管理系統 - 前端邏輯
// 所有資料都是透過 config.js 裡設定的 Apps Script 網址跟 Google Sheet 溝通

// ---------- 入口分類定義：這裡決定首頁卡片跟每個分類底下的子頁籤 ----------
const CATEGORIES = [
  {
    key: 'meeting', icon: '📝', title: '會議', desc: '會議記錄、追蹤待辦',
    subs: [
      { key: 'meeting-record', label: '會議記錄' },
      { key: 'meeting-track', label: '會議追蹤' }
    ]
  },
  {
    key: 'project', icon: '📊', title: '專案', desc: '建立事項、進度追蹤',
    subs: [
      { key: 'project-create', label: '專案建立' },
      { key: 'project-track', label: '專案進度追蹤' }
    ]
  },
  {
    key: 'product', icon: '📦', title: '商品', desc: '商品建立、訂單紀錄',
    subs: [
      { key: 'product-create', label: '商品建立' },
      { key: 'product-orders', label: '訂單紀錄' }
    ]
  },
  {
    key: 'expense', icon: '💰', title: '請款', desc: '申請請款、查詢紀錄',
    subs: [
      { key: 'expense-apply', label: '請款申請' },
      { key: 'expense-track', label: '請款紀錄' }
    ]
  },
  {
    key: 'attendance', icon: '🕒', title: '差勤', desc: '遲到請假登記與紀錄',
    subs: [
      { key: 'attendance-log', label: '差勤登記' },
      { key: 'attendance-track', label: '差勤紀錄' }
    ]
  }
];

// 每個「頁面 key」對應要讀取哪一種資料（給列表用；會議記錄改用下面的歷史文件清單，不用這個表）
const VIEW_DATA_TYPE = {
  'meeting-track': 'meetingTodo',
  'project-track': 'project',
  'product-create': 'inventory',
  'product-orders': 'order',
  'expense-track': 'expense',
  'attendance-track': 'attendance'
};

const COLUMN_ORDER = {
  meeting: ['會議日期', '會議主題', '主持人', '出席人員', '本次會議內容', '追蹤上次進度', '備註'],
  meetingTodo: ['會議主題', '待辦事項內容', '負責人', '預計完成日', '狀態', '備註'],
  project: ['專案名稱', '事項內容', '負責人', '開始日期', '預計完成日', '進度(%)', '狀態', '備註'],
  expense: ['申請日期', '申請人', '項目名稱', '金額', '說明', '審核狀態', '審核人', '審核日期', '備註'],
  attendance: ['日期', '姓名', '類型', '原因', '時數/天數', '本月累計次數', '備註'],
  inventory: ['品項名稱', '目前庫存', '安全庫存', '單位', '是否需補貨', '備註'],
  order: ['訂購日期', '品項名稱', '數量', '單價', '金額', '訂購人', '客戶/對象', '狀態', '備註']
};

const TAG_COLUMNS = new Set(['狀態', '審核狀態', '是否需補貨', '類型']);

let partnerNamesCache = [];

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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

function tagHtml(value) {
  if (!value) return '';
  return `<span class="tag ${escapeHtml(String(value))}">${escapeHtml(String(value))}</span>`;
}

// ---------- 首頁卡片 ----------
function buildHomeGrid() {
  const grid = document.getElementById('home-grid');
  grid.innerHTML = CATEGORIES.map(cat => `
    <div class="home-card" data-cat="${cat.key}">
      <span class="icon">${cat.icon}</span>
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
  document.getElementById('page-title').textContent = cat.icon + ' ' + cat.title;
  document.getElementById('page-subtitle').textContent = cat.desc;

  showView(cat.subs[0].key);
}

function goHome() {
  document.getElementById('category-header').classList.remove('active');
  document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-home').classList.add('active');
  document.getElementById('page-title').textContent = '門人夥伴管理系統';
  document.getElementById('page-subtitle').textContent = '請選擇要使用的功能';
}

function showView(viewKey) {
  document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewKey);
  if (target) target.classList.add('active');

  document.querySelectorAll('#sub-tabs button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewKey);
  });

  if (viewKey === 'meeting-record') {
    loadMeetingDocList();
  }
  const type = VIEW_DATA_TYPE[viewKey];
  if (type) loadList(type, viewKey);
}

// ---------- 夥伴姓名下拉選單 ----------
function fillPartnerSelect(sel) {
  sel.innerHTML = '<option value="">請選擇姓名</option>' +
    partnerNamesCache.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

async function loadPartners() {
  try {
    const res = await apiGet({ action: 'partners' });
    if (!res.ok) return;
    partnerNamesCache = res.data;
    document.querySelectorAll('select.partner-select').forEach(fillPartnerSelect);
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

// ---------- 動態待辦事項列（會議表單用） ----------
function addTodoRow() {
  const tmpl = document.getElementById('todo-row-template');
  const node = tmpl.content.firstElementChild.cloneNode(true);
  fillPartnerSelect(node.querySelector('.todo-owner'));
  node.querySelector('.todo-remove').addEventListener('click', () => node.remove());
  document.getElementById('todo-rows').appendChild(node);
}

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
    const clickable = type === 'meetingTodo';
    let html = '<table><thead><tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(r => {
      const rowAttr = clickable ? ` class="clickable-row" data-meeting-id="${escapeHtml(r['會議編號'] || '')}"` : '';
      html += `<tr${rowAttr}>` + cols.map(c => {
        const val = r[c] !== undefined && r[c] !== null ? r[c] : '';
        return `<td>${TAG_COLUMNS.has(c) ? tagHtml(val) : escapeHtml(String(val))}</td>`;
      }).join('') + '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    if (clickable) {
      container.querySelectorAll('tr[data-meeting-id]').forEach(tr => {
        tr.addEventListener('click', () => openMeetingDetail(tr.dataset.meetingId));
      });
    }
  } catch (err) {
    container.innerHTML = `<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>`;
    console.error(err);
  }
}

// ---------- 會議：歷史紀錄清單（文件卡片） ----------
async function loadMeetingDocList() {
  const container = document.querySelector('[data-doclist="meeting"]');
  if (!container) return;
  container.innerHTML = '<p class="hint">載入中…</p>';
  try {
    const res = await apiGet({ action: 'list', type: 'meeting' });
    if (!res.ok) {
      container.innerHTML = `<p class="hint">讀取失敗：${escapeHtml(res.error || '')}</p>`;
      return;
    }
    const rows = res.data.slice().reverse().slice(0, 50);
    if (rows.length === 0) {
      container.innerHTML = '<p class="hint">目前還沒有會議記錄</p>';
      return;
    }
    container.innerHTML = rows.map(r => `
      <div class="doc-item" data-meeting-id="${escapeHtml(r['編號'] || '')}">
        <div class="doc-main">
          <div class="doc-title">${escapeHtml(r['會議主題'] || '（未命名會議）')}</div>
          <div class="doc-meta">${escapeHtml(r['會議日期'] || '')}　主持人：${escapeHtml(r['主持人'] || '')}</div>
        </div>
        <div class="doc-arrow">›</div>
      </div>
    `).join('');
    container.querySelectorAll('.doc-item').forEach(el => {
      el.addEventListener('click', () => openMeetingDetail(el.dataset.meetingId));
    });
  } catch (err) {
    container.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

// ---------- 會議詳細頁（彈窗，文件式） ----------
function docBlock(title, value) {
  const has = value && String(value).trim();
  return `
    <div class="doc-block">
      <h4>${escapeHtml(title)}</h4>
      <div class="doc-block-body ${has ? '' : 'empty'}">${has ? escapeHtml(value) : '（無）'}</div>
    </div>`;
}

async function openMeetingDetail(meetingId) {
  if (!meetingId) return;
  const content = document.getElementById('meeting-detail-content');
  content.innerHTML = '<p class="hint">載入中…</p>';
  document.getElementById('meeting-detail-overlay').classList.add('active');

  try {
    const [meetingRes, todoRes] = await Promise.all([
      apiGet({ action: 'list', type: 'meeting' }),
      apiGet({ action: 'list', type: 'meetingTodo' })
    ]);
    if (!meetingRes.ok) { content.innerHTML = '讀取失敗：' + escapeHtml(meetingRes.error || ''); return; }
    const meeting = meetingRes.data.find(m => String(m['編號']) === String(meetingId));
    if (!meeting) { content.innerHTML = '<p class="hint">找不到這筆會議記錄。</p>'; return; }
    const todos = (todoRes.ok ? todoRes.data : []).filter(t => String(t['會議編號']) === String(meetingId));

    let todoHtml;
    if (todos.length === 0) {
      todoHtml = '<p class="hint">這次會議沒有待辦事項</p>';
    } else {
      todoHtml = '<table class="doc-todo-table"><thead><tr><th>待辦事項</th><th>負責人</th><th>預計完成日</th><th>狀態</th></tr></thead><tbody>' +
        todos.map(t => `<tr>
            <td>${escapeHtml(t['待辦事項內容'] || '')}</td>
            <td>${escapeHtml(t['負責人'] || '')}</td>
            <td>${escapeHtml(t['預計完成日'] || '')}</td>
            <td>${tagHtml(t['狀態'])}</td>
          </tr>`).join('') + '</tbody></table>';
    }

    content.innerHTML = `
      <div class="doc-header">
        <h2>${escapeHtml(meeting['會議主題'] || '（未命名會議）')}</h2>
        <div class="doc-header-meta">
          <span>📅 ${escapeHtml(meeting['會議日期'] || '')}</span>
          <span>🙋 主持人：${escapeHtml(meeting['主持人'] || '')}</span>
          <span>👥 出席：${escapeHtml(meeting['出席人員'] || '')}</span>
        </div>
      </div>
      ${docBlock('本次會議內容', meeting['本次會議內容'])}
      ${docBlock('追蹤上次進度', meeting['追蹤上次進度'])}
      <div class="doc-block">
        <h4>待辦事項（共 ${todos.length} 筆）</h4>
        ${todoHtml}
      </div>
      ${docBlock('備註', meeting['備註'])}
    `;
  } catch (err) {
    content.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
    console.error(err);
  }
}

function closeMeetingDetail() {
  document.getElementById('meeting-detail-overlay').classList.remove('active');
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');

    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });
    const todoRows = collectTodoRows();

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

      msg.textContent = `✅ 已送出（會議編號：${meetingId}，待辦事項 ${todoRows.length} 筆）`;
      msg.className = 'status-msg ok';
      form.reset();
      resetTodoRows();
      loadMeetingDocList();
    } catch (err) {
      msg.textContent = '❌ 送出失敗，請確認設定或網路連線';
      msg.className = 'status-msg error';
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- 一般表單送出（會議表單除外，走上面專屬的邏輯） ----------
function setupForms() {
  document.querySelectorAll('form[data-type]').forEach(form => {
    if (form.id === 'meeting-form') return;
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
  buildHomeGrid();
  document.getElementById('back-btn').addEventListener('click', goHome);
  setupForms();
  setupFilters();
  setupMeetingForm();
  resetTodoRows();

  document.getElementById('meeting-detail-close').addEventListener('click', closeMeetingDetail);
  document.getElementById('meeting-detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'meeting-detail-overlay') closeMeetingDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMeetingDetail();
  });

  if (!isConfigured()) {
    document.getElementById('config-warning').style.display = 'block';
    return;
  }

  loadPartners();
  loadDatalist('project', '專案名稱', 'project-name-list');
  loadDatalist('inventory', '品項名稱', 'inventory-name-list');
}

document.addEventListener('DOMContentLoaded', init);
