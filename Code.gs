/**
 * 門人夥伴管理系統 - 後端程式 (Google Apps Script)
 * 使用綁定此程式的 Google 試算表作為資料庫
 * ---------------------------------------------
 * 模組：會議記錄 / 專案進度表 / 內部請款 / 遲到請假紀錄 / 商品 / 訂單
 */

var TZ = 'Asia/Taipei';

// ===== 各工作表欄位定義 =====
var MEMBER_HEADERS       = ['姓名', '角色'];
var MEETING_HEADERS      = ['ID', '日期', '主題', '內容', '記錄人', '建立時間'];
var ACTIONITEM_HEADERS   = ['ID', '會議ID', '事項內容', '負責人', '狀態', '建立日期', '期限', '完成日期', '備註'];
var PROJECT_HEADERS      = ['ID', '專案名稱', '說明', '狀態', '建立日期'];
var PROJECTTASK_HEADERS  = ['ID', '專案ID', '事項內容', '負責人', '狀態', '進度', '期限', '備註', '更新時間'];
var REIMBURSE_HEADERS    = ['ID', '申請人', '申請日期', '類別', '金額', '說明', '狀態', '審核人', '審核日期', '審核備註'];
var ATTENDANCE_HEADERS   = ['ID', '姓名', '日期', '類型', '原因', '記錄時間'];
var PRODUCT_HEADERS      = ['ID', '商品名稱', '售價', '庫存數量', '說明', '建立時間'];
var ORDER_HEADERS        = ['ID', '訂單日期', '客戶名稱', '聯絡方式', '總金額', '付款狀態', '出貨狀態', '備註', '建立時間'];
var ORDERITEM_HEADERS    = ['ID', '訂單ID', '商品ID', '商品名稱', '單價', '數量', '小計'];

// ===================== 網頁進入點 =====================
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('門人夥伴管理系統')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===================== 共用工具函式 =====================
function getSheetSafe_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
  }
  return sheet;
}

function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row[0]) continue; // ID 為空表示空白列，略過
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    obj._row = r + 1; // 1-based 實際列號
    out.push(obj);
  }
  return out;
}

function findRowById_(sheet, id) {
  var objs = sheetToObjects_(sheet);
  for (var i = 0; i < objs.length; i++) {
    if (String(objs[i]['ID']) === String(id)) return objs[i]._row;
  }
  return -1;
}

function genId_() {
  return Utilities.getUuid().slice(0, 8);
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function setRowValues_(sheet, rowIndex, headers, obj) {
  var values = headers.map(function (h) {
    return (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
}

function appendObj_(sheet, headers, obj) {
  var values = headers.map(function (h) {
    return (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
  });
  sheet.appendRow(values);
}

// ===================== 初始整包資料 (首次載入用) =====================
function getInitialData() {
  return {
    members: getMembers(),
    meetings: getMeetings(),
    actionItems: getActionItems(),
    projects: getProjects(),
    projectTasks: getProjectTasks(),
    reimbursements: getReimbursements(),
    attendance: getAttendance(),
    products: getProducts(),
    orders: getOrders(),
    orderItems: getOrderItems()
  };
}

// ===================== 成員管理 =====================
function getMembers() {
  var sheet = getSheetSafe_('成員', MEMBER_HEADERS);
  var list = sheetToObjects_(sheet).map(function(o){ return {name:o['姓名'], role:o['角色']}; });
  // 若尚無成員，回傳空陣列讓前端引導新增
  return list;
}

function addMember(name, role) {
  name = (name || '').trim();
  if (!name) throw new Error('姓名不可為空');
  var sheet = getSheetSafe_('成員', MEMBER_HEADERS);
  var existing = sheetToObjects_(sheet);
  for (var i = 0; i < existing.length; i++) {
    if (existing[i]['姓名'] === name) throw new Error('這位夥伴已經存在');
  }
  sheet.appendRow([name, role || '一般夥伴']);
  return getMembers();
}

function deleteMember(name) {
  var sheet = getSheetSafe_('成員', MEMBER_HEADERS);
  var data = sheet.getDataRange().getValues();
  for (var r = data.length - 1; r >= 1; r--) {
    if (data[r][0] === name) sheet.deleteRow(r + 1);
  }
  return getMembers();
}

// ===================== 1. 會議記錄 =====================
function getMeetings() {
  var sheet = getSheetSafe_('會議記錄', MEETING_HEADERS);
  var list = sheetToObjects_(sheet);
  list.sort(function(a,b){ return (b['日期']||'') < (a['日期']||'') ? -1 : 1; });
  return list;
}

function getActionItems() {
  var sheet = getSheetSafe_('會議事項', ACTIONITEM_HEADERS);
  return sheetToObjects_(sheet);
}

function addMeeting(payload) {
  var sheet = getSheetSafe_('會議記錄', MEETING_HEADERS);
  var id = genId_();
  appendObj_(sheet, MEETING_HEADERS, {
    'ID': id,
    '日期': payload.date || today_(),
    '主題': payload.topic || '',
    '內容': payload.content || '',
    '記錄人': payload.recorder || '',
    '建立時間': nowStr_()
  });
  return id;
}

function deleteMeeting(id) {
  var sheet = getSheetSafe_('會議記錄', MEETING_HEADERS);
  var row = findRowById_(sheet, id);
  if (row > 0) sheet.deleteRow(row);
  // 同步刪除相關事項
  var itemSheet = getSheetSafe_('會議事項', ACTIONITEM_HEADERS);
  var items = sheetToObjects_(itemSheet);
  for (var i = items.length - 1; i >= 0; i--) {
    if (String(items[i]['會議ID']) === String(id)) itemSheet.deleteRow(items[i]._row);
  }
  return true;
}

function addActionItem(payload) {
  var sheet = getSheetSafe_('會議事項', ACTIONITEM_HEADERS);
  var id = genId_();
  appendObj_(sheet, ACTIONITEM_HEADERS, {
    'ID': id,
    '會議ID': payload.meetingId || '',
    '事項內容': payload.content || '',
    '負責人': payload.owner || '',
    '狀態': payload.status || '待處理',
    '建立日期': today_(),
    '期限': payload.deadline || '',
    '完成日期': '',
    '備註': payload.note || ''
  });
  return id;
}

function updateActionItem(id, payload) {
  var sheet = getSheetSafe_('會議事項', ACTIONITEM_HEADERS);
  var row = findRowById_(sheet, id);
  if (row < 0) throw new Error('找不到這個事項');
  var current = sheetToObjects_(sheet).filter(function(o){return o._row===row;})[0];
  var updated = {
    'ID': current['ID'],
    '會議ID': current['會議ID'],
    '事項內容': payload.content !== undefined ? payload.content : current['事項內容'],
    '負責人': payload.owner !== undefined ? payload.owner : current['負責人'],
    '狀態': payload.status !== undefined ? payload.status : current['狀態'],
    '建立日期': current['建立日期'],
    '期限': payload.deadline !== undefined ? payload.deadline : current['期限'],
    '完成日期': payload.status === '已完成' ? today_() : (payload.status && payload.status !== '已完成' ? '' : current['完成日期']),
    '備註': payload.note !== undefined ? payload.note : current['備註']
  };
  setRowValues_(sheet, row, ACTIONITEM_HEADERS, updated);
  return true;
}

function deleteActionItem(id) {
  var sheet = getSheetSafe_('會議事項', ACTIONITEM_HEADERS);
  var row = findRowById_(sheet, id);
  if (row > 0) sheet.deleteRow(row);
  return true;
}

// ===================== 2. 專案進度表 =====================
function getProjects() {
  var sheet = getSheetSafe_('專案', PROJECT_HEADERS);
  return sheetToObjects_(sheet);
}

function getProjectTasks() {
  var sheet = getSheetSafe_('專案事項', PROJECTTASK_HEADERS);
  return sheetToObjects_(sheet);
}

function addProject(payload) {
  var sheet = getSheetSafe_('專案', PROJECT_HEADERS);
  var id = genId_();
  appendObj_(sheet, PROJECT_HEADERS, {
    'ID': id,
    '專案名稱': payload.name || '',
    '說明': payload.desc || '',
    '狀態': payload.status || '進行中',
    '建立日期': today_()
  });
  return id;
}

function updateProject(id, payload) {
  var sheet = getSheetSafe_('專案', PROJECT_HEADERS);
  var row = findRowById_(sheet, id);
  if (row < 0) throw new Error('找不到這個專案');
  var current = sheetToObjects_(sheet).filter(function(o){return o._row===row;})[0];
  var updated = {
    'ID': current['ID'],
    '專案名稱': payload.name !== undefined ? payload.name : current['專案名稱'],
    '說明': payload.desc !== undefined ? payload.desc : current['說明'],
    '狀態': payload.status !== undefined ? payload.status : current['狀態'],
    '建立日期': current['建立日期']
  };
  setRowValues_(sheet, row, PROJECT_HEADERS, updated);
  return true;
}

function deleteProject(id) {
  var sheet = getSheetSafe_('專案', PROJECT_HEADERS);
  var row = findRowById_(sheet, id);
  if (row > 0) sheet.deleteRow(row);
  var taskSheet = getSheetSafe_('專案事項', PROJECTTASK_HEADERS);
  var tasks = sheetToObjects_(taskSheet);
  for (var i = tasks.length - 1; i >= 0; i--) {
    if (String(tasks[i]['專案ID']) === String(id)) taskSheet.deleteRow(tasks[i]._row);
  }
  return true;
}

function addProjectTask(payload) {
  var sheet = getSheetSafe_('專案事項', PROJECTTASK_HEADERS);
  var id = genId_();
  appendObj_(sheet, PROJECTTASK_HEADERS, {
    'ID': id,
    '專案ID': payload.projectId || '',
    '事項內容': payload.content || '',
    '負責人': payload.owner || '',
    '狀態': payload.status || '待處理',
    '進度': payload.progress || 0,
    '期限': payload.deadline || '',
    '備註': payload.note || '',
    '更新時間': nowStr_()
  });
  return id;
}

function updateProjectTask(id, payload) {
  var sheet = getSheetSafe_('專案事項', PROJECTTASK_HEADERS);
  var row = findRowById_(sheet, id);
  if (row < 0) throw new Error('找不到這個事項');
  var current = sheetToObjects_(sheet).filter(function(o){return o._row===row;})[0];
  var updated = {
    'ID': current['ID'],
    '專案ID': current['專案ID'],
    '事項內容': payload.content !== undefined ? payload.content : current['事項內容'],
    '負責人': payload.owner !== undefined ? payload.owner : current['負責人'],
    '狀態': payload.status !== undefined ? payload.status : current['狀態'],
    '進度': payload.progress !== undefined ? payload.progress : current['進度'],
    '期限': payload.deadline !== undefined ? payload.deadline : current['期限'],
    '備註': payload.note !== undefined ? payload.note : current['備註'],
    '更新時間': nowStr_()
  };
  setRowValues_(sheet, row, PROJECTTASK_HEADERS, updated);
  return true;
}

function deleteProjectTask(id) {
  var sheet = getSheetSafe_('專案事項', PROJECTTASK_HEADERS);
  var row = findRowById_(sheet, id);
  if (row > 0) sheet.deleteRow(row);
  return true;
}

// ===================== 3. 內部請款 =====================
function getReimbursements() {
  var sheet = getSheetSafe_('請款', REIMBURSE_HEADERS);
  var list = sheetToObjects_(sheet);
  list.sort(function(a,b){ return (b['申請日期']||'') < (a['申請日期']||'') ? -1 : 1; });
  return list;
}

function addReimbursement(payload) {
  var sheet = getSheetSafe_('請款', REIMBURSE_HEADERS);
  var id = genId_();
  appendObj_(sheet, REIMBURSE_HEADERS, {
    'ID': id,
    '申請人': payload.applicant || '',
    '申請日期': payload.date || today_(),
    '類別': payload.category || '',
    '金額': payload.amount || 0,
    '說明': payload.desc || '',
    '狀態': '待審核',
    '審核人': '',
    '審核日期': '',
    '審核備註': ''
  });
  return id;
}

function reviewReimbursement(id, payload) {
  var sheet = getSheetSafe_('請款', REIMBURSE_HEADERS);
  var row = findRowById_(sheet, id);
  if (row < 0) throw new Error('找不到這筆請款');
  var current = sheetToObjects_(sheet).filter(function(o){return o._row===row;})[0];
  var updated = {
    'ID': current['ID'],
    '申請人': current['申請人'],
    '申請日期': current['申請日期'],
    '類別': current['類別'],
    '金額': current['金額'],
    '說明': current['說明'],
    '狀態': payload.status || current['狀態'],
    '審核人': payload.reviewer || current['審核人'],
    '審核日期': today_(),
    '審核備註': payload.note !== undefined ? payload.note : current['審核備註']
  };
  setRowValues_(sheet, row, REIMBURSE_HEADERS, updated);
  return true;
}

function deleteReimbursement(id) {
  var sheet = getSheetSafe_('請款', REIMBURSE_HEADERS);
  var row = findRowById_(sheet, id);
  if (row > 0) sheet.deleteRow(row);
  return true;
}

// ===================== 4. 遲到請假紀錄 =====================
function getAttendance() {
  var sheet = getSheetSafe_('出缺勤', ATTENDANCE_HEADERS);
  var list = sheetToObjects_(sheet);
  list.sort(function(a,b){ return (b['日期']||'') < (a['日期']||'') ? -1 : 1; });
  return list;
}

function addAttendance(payload) {
  var sheet = getSheetSafe_('出缺勤', ATTENDANCE_HEADERS);
  var id = genId_();
  appendObj_(sheet, ATTENDANCE_HEADERS, {
    'ID': id,
    '姓名': payload.name || '',
    '日期': payload.date || today_(),
    '類型': payload.type || '遲到',
    '原因': payload.reason || '',
    '記錄時間': nowStr_()
  });
  return id;
}

function deleteAttendance(id) {
  var sheet = getSheetSafe_('出缺勤', ATTENDANCE_HEADERS);
  var row = findRowById_(sheet, id);
  if (row > 0) sheet.deleteRow(row);
  return true;
}

// ===================== 5. 商品 =====================
function getProducts() {
  var sheet = getSheetSafe_('商品', PRODUCT_HEADERS);
  return sheetToObjects_(sheet);
}

function addProduct(payload) {
  var name = (payload.name || '').trim();
  if (!name) throw new Error('請輸入商品名稱');
  var sheet = getSheetSafe_('商品', PRODUCT_HEADERS);
  var id = genId_();
  appendObj_(sheet, PRODUCT_HEADERS, {
    'ID': id,
    '商品名稱': name,
    '售價': Number(payload.price) || 0,
    '庫存數量': Number(payload.stock) || 0,
    '說明': payload.desc || '',
    '建立時間': nowStr_()
  });
  return id;
}

function updateProduct(id, payload) {
  var sheet = getSheetSafe_('商品', PRODUCT_HEADERS);
  var row = findRowById_(sheet, id);
  if (row < 0) throw new Error('找不到這個商品');
  var current = sheetToObjects_(sheet).filter(function(o){return o._row===row;})[0];
  var updated = {
    'ID': current['ID'],
    '商品名稱': payload.name !== undefined ? payload.name : current['商品名稱'],
    '售價': payload.price !== undefined ? Number(payload.price) : current['售價'],
    '庫存數量': payload.stock !== undefined ? Number(payload.stock) : current['庫存數量'],
    '說明': payload.desc !== undefined ? payload.desc : current['說明'],
    '建立時間': current['建立時間']
  };
  setRowValues_(sheet, row, PRODUCT_HEADERS, updated);
  return true;
}

function deleteProduct(id) {
  var sheet = getSheetSafe_('商品', PRODUCT_HEADERS);
  var row = findRowById_(sheet, id);
  if (row > 0) sheet.deleteRow(row);
  return true;
}

function adjustStock_(productId, delta) {
  var sheet = getSheetSafe_('商品', PRODUCT_HEADERS);
  var row = findRowById_(sheet, productId);
  if (row < 0) return; // 商品可能已被刪除，略過
  var colIndex = PRODUCT_HEADERS.indexOf('庫存數量') + 1;
  var cell = sheet.getRange(row, colIndex);
  var current = Number(cell.getValue()) || 0;
  cell.setValue(current + delta);
}

// ===================== 6. 訂單 =====================
function getOrders() {
  var sheet = getSheetSafe_('訂單', ORDER_HEADERS);
  var list = sheetToObjects_(sheet);
  list.sort(function(a,b){ return (b['訂單日期']||'') < (a['訂單日期']||'') ? -1 : 1; });
  return list;
}

function getOrderItems() {
  var sheet = getSheetSafe_('訂單明細', ORDERITEM_HEADERS);
  return sheetToObjects_(sheet);
}

function addOrder(payload) {
  var items = payload.items || [];
  if (items.length === 0) throw new Error('訂單至少要有一項商品');

  var productSheet = getSheetSafe_('商品', PRODUCT_HEADERS);
  var products = sheetToObjects_(productSheet);
  var shortages = [];
  items.forEach(function (it) {
    var prod = products.filter(function (p) { return String(p['ID']) === String(it.productId); })[0];
    if (prod && Number(prod['庫存數量']) < Number(it.qty)) {
      shortages.push(prod['商品名稱'] + '（剩 ' + prod['庫存數量'] + '，需要 ' + it.qty + '）');
    }
  });
  if (shortages.length > 0) throw new Error('庫存不足：' + shortages.join('、'));

  var total = items.reduce(function (sum, it) { return sum + Number(it.price) * Number(it.qty); }, 0);

  var orderSheet = getSheetSafe_('訂單', ORDER_HEADERS);
  var orderId = genId_();
  appendObj_(orderSheet, ORDER_HEADERS, {
    'ID': orderId,
    '訂單日期': payload.date || today_(),
    '客戶名稱': payload.customerName || '',
    '聯絡方式': payload.contact || '',
    '總金額': total,
    '付款狀態': '未付款',
    '出貨狀態': '待處理',
    '備註': payload.note || '',
    '建立時間': nowStr_()
  });

  var itemSheet = getSheetSafe_('訂單明細', ORDERITEM_HEADERS);
  items.forEach(function (it) {
    appendObj_(itemSheet, ORDERITEM_HEADERS, {
      'ID': genId_(),
      '訂單ID': orderId,
      '商品ID': it.productId,
      '商品名稱': it.productName,
      '單價': Number(it.price),
      '數量': Number(it.qty),
      '小計': Number(it.price) * Number(it.qty)
    });
    adjustStock_(it.productId, -Number(it.qty));
  });

  return orderId;
}

function restockOrder_(orderId) {
  var itemSheet = getSheetSafe_('訂單明細', ORDERITEM_HEADERS);
  var items = sheetToObjects_(itemSheet).filter(function (i) { return String(i['訂單ID']) === String(orderId); });
  items.forEach(function (i) { adjustStock_(i['商品ID'], Number(i['數量'])); });
}

function updateOrderStatus(id, payload) {
  var sheet = getSheetSafe_('訂單', ORDER_HEADERS);
  var row = findRowById_(sheet, id);
  if (row < 0) throw new Error('找不到這筆訂單');
  var current = sheetToObjects_(sheet).filter(function (o) { return o._row === row; })[0];
  var newShipStatus = payload.shipStatus !== undefined ? payload.shipStatus : current['出貨狀態'];

  // 若改成「取消」且原本不是取消，回補庫存（僅處理一次，避免重複回補）
  if (newShipStatus === '取消' && current['出貨狀態'] !== '取消') {
    restockOrder_(id);
  }

  var updated = {
    'ID': current['ID'],
    '訂單日期': current['訂單日期'],
    '客戶名稱': current['客戶名稱'],
    '聯絡方式': current['聯絡方式'],
    '總金額': current['總金額'],
    '付款狀態': payload.paymentStatus !== undefined ? payload.paymentStatus : current['付款狀態'],
    '出貨狀態': newShipStatus,
    '備註': payload.note !== undefined ? payload.note : current['備註'],
    '建立時間': current['建立時間']
  };
  setRowValues_(sheet, row, ORDER_HEADERS, updated);
  return true;
}

function deleteOrder(id) {
  var sheet = getSheetSafe_('訂單', ORDER_HEADERS);
  var row = findRowById_(sheet, id);
  if (row < 0) return true;
  var current = sheetToObjects_(sheet).filter(function (o) { return o._row === row; })[0];
  if (current['出貨狀態'] !== '取消') restockOrder_(id); // 尚未取消過的訂單，刪除時回補庫存
  sheet.deleteRow(row);

  var itemSheet = getSheetSafe_('訂單明細', ORDERITEM_HEADERS);
  var items = sheetToObjects_(itemSheet);
  for (var i = items.length - 1; i >= 0; i--) {
    if (String(items[i]['訂單ID']) === String(id)) itemSheet.deleteRow(items[i]._row);
  }
  return true;
}
