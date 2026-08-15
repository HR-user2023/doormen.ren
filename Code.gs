/**
 * 門人夥伴管理系統 - Google Apps Script 後端
 * ------------------------------------------------
 * 使用方式（詳見「設定教學.md」）：
 * 1. 打開你的 Google Sheet
 * 2. 上方選單「擴充功能」→「Apps Script」
 * 3. 把這個檔案的全部內容貼進去，取代原本的內容
 * 4. 點選「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *    - 執行身分：我
 *    - 誰可以存取：所有人
 * 5. 部署完成後，複製「網頁應用程式網址」，貼到網頁 config.js 的 APPS_SCRIPT_URL
 */

// ====== 基本設定：分頁名稱 ======
var SHEET = {
  partners: '夥伴名單',
  meeting: '會議記錄',
  meetingTodo: '會議待辦事項',
  project: '專案',
  projectItem: '專案事項',
  expense: '內部請款',
  attendance: '遲到請假紀錄',
  inventory: '庫存清單',
  order: '訂單紀錄'
};

// 每種資料的欄位（要跟 Excel／Google Sheet 的欄位順序完全一致）
var COLUMNS = {
  meeting: ['編號', '會議日期', '會議主題', '主持人', '缺席人員', '本次會議內容',
            '追蹤上次進度', '備註'],
  meetingTodo: ['編號', '會議編號', '會議主題', '待辦事項內容', '負責人', '預計完成日', '狀態', '備註'],
  project: ['編號', '專案名稱', '說明', '開始日期', '預計完成日', '備註'],
  projectItem: ['編號', '專案編號', '專案名稱', '事項內容', '負責人', '進度(%)', '狀態', '備註'],
  expense: ['編號', '申請日期', '申請人', '項目名稱', '金額', '說明',
            '審核狀態', '審核人', '審核日期', '收據附件', '備註'],
  attendance: ['編號', '日期', '姓名', '類型', '原因', '時數/天數', '本月累計次數', '備註'],
  inventory: ['編號', '品項名稱', '目前庫存', '安全庫存', '單位', '是否需補貨', '備註'],
  order: ['編號', '訂購日期', '品項名稱', '數量', '單價', '金額', '訂購人', '客戶/對象', '狀態', '備註']
};

var ID_PREFIX = {
  meeting: 'M', meetingTodo: 'T', project: 'P', projectItem: 'W',
  expense: 'E', attendance: 'A', inventory: 'S', order: 'O'
};

// 收據附件要存放的 Google Drive 資料夾名稱
var RECEIPT_FOLDER_NAME = '門人夥伴管理系統-請款收據';

// ====== 入口：GET（讀取資料）======
function doGet(e) {
  try {
    var action = e.parameter.action;

    if (action === 'partners') {
      return jsonResponse({ ok: true, data: getPartnerNames() });
    }

    if (action === 'list') {
      var type = e.parameter.type;
      if (!SHEET[type]) return jsonResponse({ ok: false, error: '未知的資料類型：' + type });
      return jsonResponse({ ok: true, data: getSheetData(SHEET[type]) });
    }

    return jsonResponse({ ok: false, error: '缺少 action 參數' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// ====== 入口：POST（新增資料／審核請款）======
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || 'add';

    if (action === 'add') {
      var type = body.type;
      var data = body.data || {};

      if (!COLUMNS[type]) {
        return jsonResponse({ ok: false, error: '未知的資料類型：' + type });
      }

      if (body.file && body.file.base64) {
        data['收據附件'] = uploadFileToDrive(body.file);
      }

      var id = addRow(type, data);
      return jsonResponse({ ok: true, id: id });
    }

    if (action === 'approveExpense') {
      approveExpense(body.id, body.data || {});
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: '未知的操作：' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// ====== 共用工具 ======

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetData(sheetName) {
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var isEmpty = row.every(function (v) { return v === '' || v === null; });
    if (isEmpty) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var val = row[c];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[headers[c]] = val;
    }
    rows.push(obj);
  }
  return rows;
}

function getPartnerNames() {
  var rows = getSheetData(SHEET.partners);
  return rows.map(function (r) { return r['姓名']; }).filter(function (n) { return n; });
}

function makeId(type) {
  var now = new Date();
  var stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyMMddHHmmss');
  var rand = Math.floor(Math.random() * 90 + 10); // 兩位數亂數，降低同秒撞號機率
  return ID_PREFIX[type] + stamp + rand;
}

/**
 * 新增一列資料到指定分頁。
 * data 是一個物件，key 對應欄位中文名稱（編號除外，會自動產生）。
 * 針對有公式的欄位（金額、是否需補貨、本月累計次數），新增後會自動補上公式。
 */
function addRow(type, data) {
  var sheetName = SHEET[type];
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到分頁：' + sheetName);

  var headers = COLUMNS[type];
  var id = makeId(type);

  var rowValues = headers.map(function (h) {
    if (h === '編號') return id;
    return data[h] !== undefined ? data[h] : '';
  });

  sheet.appendRow(rowValues);
  var newRow = sheet.getLastRow();

  // 補上公式欄位
  if (type === 'order') {
    var col = headers.indexOf('金額') + 1; // 數量*單價
    sheet.getRange(newRow, col).setFormula('=D' + newRow + '*E' + newRow);
  }
  if (type === 'inventory') {
    var col2 = headers.indexOf('是否需補貨') + 1;
    sheet.getRange(newRow, col2).setFormula('=IF(C' + newRow + '<D' + newRow + ',"需補貨","充足")');
  }
  if (type === 'attendance') {
    var col3 = headers.indexOf('本月累計次數') + 1;
    var formula = '=IFERROR(COUNTIFS($C$2:$C$' + newRow + ',C' + newRow +
      ',$B$2:$B$' + newRow + ',">="&EOMONTH(B' + newRow + ',-1)+1,' +
      '$B$2:$B$' + newRow + ',"<="&EOMONTH(B' + newRow + ',0)),0)';
    sheet.getRange(newRow, col3).setFormula(formula);
  }

  return id;
}

/**
 * 找到指定分頁中「編號」欄位等於 id 的那一列。
 * 回傳 { sheet, headers, rowIndex }，rowIndex 是實際的試算表列號（從1算起）。
 * 找不到會丟出例外。
 */
function findRowById(type, id) {
  var sheetName = SHEET[type];
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到分頁：' + sheetName);

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('編號');

  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(id)) {
      return { sheet: sheet, headers: headers, rowIndex: r + 1 };
    }
  }
  throw new Error('找不到編號：' + id);
}

/**
 * 審核請款：更新審核狀態／審核人，審核日期由伺服器自動填入今天的日期。
 * data 需要有 審核狀態（例如「已核准」或「已退回」）與 審核人。
 */
function approveExpense(id, data) {
  var found = findRowById('expense', id);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var updates = {
    '審核狀態': data['審核狀態'] || '',
    '審核人': data['審核人'] || '',
    '審核日期': today
  };

  Object.keys(updates).forEach(function (key) {
    var col = found.headers.indexOf(key);
    if (col !== -1) {
      found.sheet.getRange(found.rowIndex, col + 1).setValue(updates[key]);
    }
  });
}

/**
 * 把前端傳來的 base64 圖片存到 Google Drive，回傳可分享的檢視連結。
 * file = { base64, mimeType, filename }
 */
function uploadFileToDrive(file) {
  var folder = getOrCreateReceiptFolder();
  var bytes = Utilities.base64Decode(file.base64);
  var blob = Utilities.newBlob(bytes, file.mimeType || 'image/jpeg', file.filename || ('receipt_' + new Date().getTime()));
  var driveFile = folder.createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return driveFile.getUrl();
}

function getOrCreateReceiptFolder() {
  var folders = DriveApp.getFoldersByName(RECEIPT_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(RECEIPT_FOLDER_NAME);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
