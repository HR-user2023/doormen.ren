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

// 每個「頁面 key」對應要讀取哪一種資料（給列表用；會議記錄／專案建立改用歷史文件清單，不用這個表）
const VIEW_DATA_TYPE = {
  'meeting-track': 'meetingTodo',
  'project-track': 'projectItem',
  'product-create': 'inventory',
  'product-orders': 'order',
  'expense-track': 'expense',
  'attendance-track': 'attendance'
};

const COLUMN_ORDER = {
  meeting: ['會議日期', '會議主題', '主持人', '缺席人員', '本次會議內容', '追蹤上次進度', '備註'],
  meetingTodo: ['會議主題', '待辦事項內容', '負責人', '預計完成日', '狀態', '備註'],
  project: ['專案名稱', '說明', '開始日期', '預計完成日', '備註'],
  projectItem: ['專案名稱', '事項內容', '負責人', '進度(%)', '狀態', '備註'],
  expense: ['申請日期', '申請人', '項目名稱', '金額', '說明', '審核狀態', '審核人', '審核日期', '收據附件', '備註'],
  attendance: ['日期', '姓名', '類型', '原因', '時數/天數', '本月累計次數', '備註'],
  inventory: ['品項名稱', '目前庫存', '安全庫存', '單位', '是否需補貨', '備註'],
  order: ['訂購日期', '品項名稱', '數量', '單價', '金額', '訂購人', '客戶/對象', '狀態', '備註']
};

const TAG_COLUMNS = new Set(['狀態', '審核狀態', '是否需補貨', '類型']);
const LINK_COLUMNS = new Set(['收據附件']);

// 這兩種列表是「明細列」，點一列會打開來源文件（會議／專案）的詳細頁
const DETAIL_LINK = {
  meetingTodo: { fk: '會議編號', open: (id) => openDetail('meeting', id) },
  projectItem: { fk: '專案編號', open: (id) => openDetail('project', id) }
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
    let headerCols = cols.slice();
    if (isExpense) headerCols = headerCols.concat(['審核操作']);

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
      if (isExpense) {
        if (r['審核狀態'] === '待審核') {
          html += `<td class="row-actions">
            <button type="button" class="btn-approve" data-expense-id="${escapeHtml(r['編號'])}" data-decision="已核准">核准</button>
            <button type="button" class="btn-reject" data-expense-id="${escapeHtml(r['編號'])}" data-decision="已退回">退回</button>
          </td>`;
        } else {
          html += '<td>-</td>';
        }
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

    if (isExpense) {
      container.querySelectorAll('.btn-approve, .btn-reject').forEach(btn => {
        btn.addEventListener('click', () => decideExpense(btn.dataset.expenseId, btn.dataset.decision, type, viewKey));
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
    metaFn: (r) => `開始：${r['開始日期'] || '-'}　預計完成：${r['預計完成日'] || '-'}`,
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
          <span>🙅 缺席：${escapeHtml(meeting['缺席人員'] || '無')}</span>
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

async function openProjectDetail(projectId) {
  const content = document.getElementById('detail-content');
  content.innerHTML = '<p class="hint">載入中…</p>';
  document.getElementById('detail-overlay').classList.add('active');

  try {
    const [projectRes, itemRes] = await Promise.all([
      apiGet({ action: 'list', type: 'project' }),
      apiGet({ action: 'list', type: 'projectItem' })
    ]);
    if (!projectRes.ok) { content.innerHTML = '讀取失敗：' + escapeHtml(projectRes.error || ''); return; }
    const project = projectRes.data.find(p => String(p['編號']) === String(projectId));
    if (!project) { content.innerHTML = '<p class="hint">找不到這個專案。</p>'; return; }
    const items = (itemRes.ok ? itemRes.data : []).filter(i => String(i['專案編號']) === String(projectId));

    let itemHtml;
    if (items.length === 0) {
      itemHtml = '<p class="hint">這個專案還沒有工作事項</p>';
    } else {
      itemHtml = '<table class="doc-todo-table"><thead><tr><th>事項內容</th><th>負責人</th><th>進度(%)</th><th>狀態</th></tr></thead><tbody>' +
        items.map(i => `<tr>
            <td>${escapeHtml(i['事項內容'] || '')}</td>
            <td>${escapeHtml(i['負責人'] || '')}</td>
            <td>${escapeHtml(i['進度(%)'] !== undefined ? i['進度(%)'] : '')}</td>
            <td>${tagHtml(i['狀態'])}</td>
          </tr>`).join('') + '</tbody></table>';
    }

    content.innerHTML = `
      <div class="doc-header">
        <h2>${escapeHtml(project['專案名稱'] || '（未命名專案）')}</h2>
        <div class="doc-header-meta">
          <span>📅 開始：${escapeHtml(project['開始日期'] || '-')}</span>
          <span>🏁 預計完成：${escapeHtml(project['預計完成日'] || '-')}</span>
        </div>
      </div>
      ${docBlock('說明', project['說明'])}
      <div class="doc-block">
        <h4>工作事項（共 ${items.length} 筆）</h4>
        ${itemHtml}
      </div>
      ${docBlock('備註', project['備註'])}
    `;
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
  resetTodoRows();
  resetProjectItemRows();

  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  if (!isConfigured()) {
    document.getElementById('config-warning').style.display = 'block';
    return;
  }

  loadPartners();
  loadDatalist('inventory', '品項名稱', 'inventory-name-list');
}

document.addEventListener('DOMContentLoaded', init);
