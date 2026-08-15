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
      { key: 'project-track', label: '專案進度追蹤' },
      { key: 'project-settlement', label: '分潤結算' }
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

// 每個「頁面 key」對應要讀取哪一種資料（給列表用；會議記錄／專案建立改用歷史文件清單，不用這個表）
const VIEW_DATA_TYPE = {
  'meeting-track': 'meetingTodo',
  'project-settlement': 'projectSettlement',
  'product-create': 'inventory',
  'product-orders': 'order',
  'expense-track': 'expense',
  'attendance-track': 'attendance'
};

const COLUMN_ORDER = {
  meeting: ['會議日期', '會議主題', '主持人', '缺席人員', '本次會議內容', '追蹤上次進度', '備註'],
  meetingTodo: ['會議主題', '待辦事項內容', '負責人', '預計完成日', '狀態', '備註'],
  project: ['專案名稱', '專案類型', '主要負責人', '介紹人', '說明', '開始日期', '預計完成日', '備註'],
  projectItem: ['專案名稱', '事項內容', '負責人', '進度(%)', '狀態', '備註'],
  projectSettlement: ['專案名稱', '月份', '收入', '成本', '專案金額', '主要負責人分潤金額', '介紹人分潤金額', '公司利潤金額', '備註'],
  expense: ['申請日期', '申請人', '項目名稱', '金額', '說明', '審核狀態', '審核人', '審核日期', '收據附件', '備註'],
  attendance: ['日期', '姓名', '類型', '原因', '時數/天數', '本月累計次數', '備註'],
  inventory: ['品項名稱', '目前庫存', '安全庫存', '單位', '是否需補貨', '備註'],
  order: ['訂購日期', '品項名稱', '數量', '單價', '金額', '訂購人', '客戶/對象', '狀態', '備註']
};

const TAG_COLUMNS = new Set(['狀態', '審核狀態', '是否需補貨', '類型']);
const LINK_COLUMNS = new Set(['收據附件']);

// 這種列表是「明細列」，點一列會打開來源文件（會議）的詳細頁
const DETAIL_LINK = {
  meetingTodo: { fk: '會議編號', open: (id) => openDetail('meeting', id) }
};

// ---------- 通用「編輯」功能：每種資料類型的中文名稱＋可編輯欄位設定 ----------
const TYPE_LABEL = {
  meeting: '會議記錄', meetingTodo: '待辦事項', project: '專案', projectItem: '工作事項',
  projectSettlement: '分潤結算', projectExpenseItem: '支出項目', expense: '請款紀錄',
  attendance: '差勤紀錄', inventory: '庫存品項', order: '訂單'
};

// type: text / textarea / number / date / month / select / partner
// 沒有列在這裡的欄位（例如公式欄位、編號、關聯欄位）不會出現在編輯表單裡
const FIELD_META = {
  meeting: {
    會議日期: { type: 'date' },
    會議主題: { type: 'text' },
    主持人: { type: 'partner' },
    缺席人員: { type: 'text' },
    本次會議內容: { type: 'textarea' },
    追蹤上次進度: { type: 'textarea' },
    備註: { type: 'text' }
  },
  meetingTodo: {
    待辦事項內容: { type: 'text' },
    負責人: { type: 'partner' },
    預計完成日: { type: 'date' },
    狀態: { type: 'select', options: ['未開始', '進行中', '已完成'] },
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
  }
};

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

// 統一的 POST 呼叫：用 text/plain 送出，避免瀏覽器對 Apps Script 發出 CORS 預檢請求（Apps Script 無法處理 OPTIONS）
async function apiPostRaw(bodyObj) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(bodyObj)
  });
  return res.json();
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

  if (viewKey === 'meeting-record') loadDocList('meeting');
  if (viewKey === 'project-create') loadDocList('project');
  if (viewKey === 'project-track') loadProjectTrackList();
  if (viewKey === 'project-settlement') populateSettlementProjectSelect();

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
    if (m.type === 'number') {
      return `<label>${label}<input type="number" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
    }
    if (m.type === 'date') {
      return `<label>${label}<input type="date" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
    }
    if (m.type === 'month') {
      return `<label>${label}<input type="month" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
    }
    return `<label>${label}<input type="text" name="${escapeHtml(field)}" value="${escapeHtml(rawVal)}" /></label>`;
  }).join('') + `<div class="submit-row"><button type="submit" class="primary">儲存修改</button><span class="status-msg"></span></div>`;

  form.querySelectorAll('select.partner-select').forEach(sel => {
    fillPartnerSelect(sel);
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

// ---------- 月結分潤：專案下拉選單（送出時要帶入專案編號＋專案名稱） ----------
async function populateSettlementProjectSelect() {
  const sel = document.getElementById('settlement-project-select');
  if (!sel) return;
  try {
    const res = await apiGet({ action: 'list', type: 'project' });
    if (!res.ok) return;
    // 「大型專案」不做分潤結算，不列在這個選單裡
    const projects = res.data.slice().reverse().filter(p => p['專案類型'] !== '大型專案');
    sel.innerHTML = '<option value="">請選擇專案</option>' +
      projects.map(p => `<option value="${escapeHtml(p['編號'])}">${escapeHtml(p['專案名稱'] || '')}</option>`).join('');
  } catch (err) {
    console.error('讀取專案清單失敗', err);
  }
}

function setupSettlementProjectSync() {
  const sel = document.getElementById('settlement-project-select');
  const nameInput = document.getElementById('settlement-project-name');
  if (!sel || !nameInput) return;
  sel.addEventListener('change', () => {
    const opt = sel.options[sel.selectedIndex];
    nameInput.value = opt ? opt.textContent : '';
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

    container.innerHTML = projects.map(p => {
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
    }).join('');

    container.querySelectorAll('.doc-item').forEach(el => {
      el.addEventListener('click', () => openDetail('project', el.dataset.id));
    });
  } catch (err) {
    container.innerHTML = '<p class="hint">讀取失敗，請確認網路連線或設定是否正確。</p>';
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
            <span>📅 ${escapeHtml(meeting['會議日期'] || '')}</span>
            <span>🙋 主持人：${escapeHtml(meeting['主持人'] || '')}</span>
            <span>🙅 缺席：${escapeHtml(meeting['缺席人員'] || '無')}</span>
          </div>
        </div>
        <button type="button" class="secondary" id="btn-edit-meeting">編輯會議記錄</button>
      </div>
      ${docBlock('本次會議內容', meeting['本次會議內容'])}
      ${docBlock('追蹤上次進度', meeting['追蹤上次進度'])}
      <div class="doc-block">
        <h4>待辦事項（共 ${todos.length} 筆）</h4>
        ${todoHtml}
      </div>
      ${docBlock('備註', meeting['備註'])}
    `;

    document.getElementById('btn-edit-meeting').addEventListener('click', () => {
      openEditModal('meeting', meeting, () => { openMeetingDetail(meetingId); loadDocList('meeting'); });
    });
    content.querySelectorAll('[data-todo-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = todos.find(x => String(x['編號']) === btn.dataset.todoId);
        if (t) openEditModal('meetingTodo', t, () => openMeetingDetail(meetingId));
      });
    });
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
            <span>${project['專案類型'] ? '🏷️ ' + escapeHtml(project['專案類型']) : ''}</span>
            <span>🙋 主要負責人：${escapeHtml(project['主要負責人'] || '-')}</span>
            <span>🔗 介紹人：${escapeHtml(project['介紹人'] || '無')}</span>
            <span>📅 開始：${escapeHtml(project['開始日期'] || '-')}</span>
            <span>🏁 預計完成：${escapeHtml(project['預計完成日'] || '-')}</span>
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
      loadDocList('meeting');
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
function setupProjectForm() {
  const form = document.getElementById('project-form');
  if (!form) return;

  document.getElementById('add-project-item-row').addEventListener('click', addProjectItemRow);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.status-msg');

    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });
    const itemRows = collectProjectItemRows();

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

      msg.textContent = `✅ 已送出（專案編號：${projectId}，工作事項 ${itemRows.length} 筆）`;
      msg.className = 'status-msg ok';
      form.reset();
      resetProjectItemRows();
      loadDocList('project');
      loadProjectTrackList();
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

// ---------- 一般表單送出（會議／專案／請款表單走各自專屬邏輯，這裡處理其餘的） ----------
const CUSTOM_FORM_IDS = new Set(['meeting-form', 'project-form', 'expense-form']);

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
  setupProjectForm();
  setupExpenseForm();
  setupSettlementProjectSync();
  resetTodoRows();
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeEditModal(); closeCostItemsModal(); closeDetail(); }
  });

  if (!isConfigured()) {
    document.getElementById('config-warning').style.display = 'block';
    return;
  }

  loadPartners();
  loadDatalist('inventory', '品項名稱', 'inventory-name-list');
  populateSettlementProjectSelect();
}

document.addEventListener('DOMContentLoaded', init);
