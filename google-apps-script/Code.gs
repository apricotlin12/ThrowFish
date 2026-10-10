/** ThrowFish score service. Paste this entire file into Apps Script's Code.gs. */
const THROWFISH = {
  spreadsheetId: '1R_YjVopuqSth7HJ-48nnZGfl6KBnGZO0Pse6GI93PTg',
  sheetId: 0,
  headers: ['暱稱', '分數', '空中翻轉', '高拋路線', '完美落盤'],
  receiptPrefix: 'ThrowFish submission: ',
};

/** Select this function and click Run once to check access and authorize the script. No rows are written. */
function setupThrowFish() {
  const sheet = getScoreSheet_();
  columnMap_(sheet);
  console.log('ThrowFish 設定完成：可存取試算表，五個欄位正確。本次未寫入資料。');
}

/** GET is read-only. Public data consists of the top three nicknames and scores. */
function doGet(e) {
  const params = (e && e.parameter) || {};
  let result;
  try {
    const action = params.action || 'leaderboard';
    if (action === 'health') {
      columnMap_(getScoreSheet_());
      result = { ok: true, service: 'ThrowFish', version: 1 };
    } else if (action === 'leaderboard') {
      result = { ok: true, leaders: topThree_() };
    } else if (action === 'receipt') {
      if (!validId_(params.id)) throw new Error('invalid_id');
      const sheet = getScoreSheet_();
      const columns = columnMap_(sheet);
      const row = findSubmission_(sheet, columns, params.id);
      const value = row ? Number(sheet.getRange(row, columns.total + 1).getValue()) : 0;
      if (row && Number.isSafeInteger(value) && value > 0) {
        result = { ok: true, id: params.id, state: 'saved', total: value };
      } else {
        const error = CacheService.getScriptCache().get('throwfish_error_' + params.id);
        result = error ? { ok: false, id: params.id, state: 'failed', error: error } :
          { ok: true, id: params.id, state: 'pending' };
      }
    } else {
      throw new Error('unknown_action');
    }
  } catch (error) {
    console.error(error);
    result = { ok: false, error: publicError_(error) };
  }
  return response_(result, params.callback);
}

/** Only POST can write. The game will send JSON as text/plain and confirm the receipt with a read-only GET. */
function doPost(e) {
  let input;
  let lock;
  try {
    const body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length > 4096) throw new Error('invalid_request');
    try { input = JSON.parse(body); } catch (_) { throw new Error('invalid_request'); }
    const score = validateScore_(input);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('busy');
    const sheet = getScoreSheet_();
    const columns = columnMap_(sheet);
    let row = findSubmission_(sheet, columns, score.id);
    if (row) {
      const existing = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (existing[columns.total] !== '' && existing[columns.total] != null) {
        if (Number(existing[columns.total]) !== score.total || Number(existing[columns.flip]) !== score.flip ||
            Number(existing[columns.route]) !== score.route || Number(existing[columns.landing]) !== score.landing ||
            ![score.nickname, nicknameCell_(score.nickname)].includes(String(existing[columns.nickname] || ''))) throw new Error('duplicate_conflict');
        return response_({ ok: true, id: score.id, state: 'saved', duplicate: true }, null);
      }
    } else {
      row = sheet.getLastRow() + 1;
      if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
      // Reserve the submission ID before writing. A retry can finish this row if a write was interrupted.
      sheet.getRange(row, columns.total + 1).setNote(THROWFISH.receiptPrefix + score.id);
      SpreadsheetApp.flush();
    }
    const values = new Array(sheet.getLastColumn()).fill('');
    // Force nickname text so an optional nickname cannot become a spreadsheet formula.
    sheet.getRange(row, columns.nickname + 1).setNumberFormat('@');
    values[columns.nickname] = nicknameCell_(score.nickname);
    values[columns.total] = score.total;
    values[columns.flip] = score.flip;
    values[columns.route] = score.route;
    values[columns.landing] = score.landing;
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove('throwfish_error_' + score.id);
    return response_({ ok: true, id: score.id, state: 'saved' }, null);
  } catch (error) {
    console.error(error);
    const code = publicError_(error);
    if (input && validId_(input.id)) CacheService.getScriptCache().put('throwfish_error_' + input.id, code, 21600);
    return response_({ ok: false, error: code }, null);
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function getScoreSheet_() {
  const book = SpreadsheetApp.openById(THROWFISH.spreadsheetId);
  const sheet = book.getSheets().find(function (candidate) { return candidate.getSheetId() === THROWFISH.sheetId; });
  if (!sheet) throw new Error('sheet_not_found');
  return sheet;
}

function columnMap_(sheet) {
  if (sheet.getLastColumn() < 5) throw new Error('headers_mismatch');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (value) { return String(value).trim(); });
  const names = ['nickname', 'total', 'flip', 'route', 'landing'];
  const columns = {};
  THROWFISH.headers.forEach(function (header, index) {
    const position = headers.indexOf(header);
    if (position < 0 || headers.lastIndexOf(header) !== position) throw new Error('headers_mismatch');
    columns[names[index]] = position;
  });
  return columns;
}

function validId_(id) {
  return typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
}

function nicknameCell_(nickname) {
  return /^[\s]*[=+@-]/.test(nickname) ? "'" + nickname : nickname;
}

function validateScore_(input) {
  if (!input || typeof input !== 'object' || !validId_(input.id)) throw new Error('invalid_request');
  const nickname = input.nickname == null ? '' : input.nickname;
  if (typeof nickname !== 'string' || nickname.trim().length > 30 || /[\u0000-\u001f\u007f]/.test(nickname)) throw new Error('invalid_nickname');
  const keys = ['total', 'flip', 'route', 'landing'];
  if (!keys.every(function (key) { return Number.isSafeInteger(input[key]) && input[key] >= 0; })) throw new Error('invalid_score');
  if (input.total === 0) throw new Error('zero_score');
  if (input.flip % 10 !== 0 || ![0, 10].includes(input.route) || ![0, 10].includes(input.landing)) throw new Error('invalid_score');
  const base = input.total - input.flip - input.route - input.landing;
  if (base !== 40 && base !== 60) throw new Error('invalid_score');
  if (base === 40 && (input.flip || input.route || input.landing)) throw new Error('invalid_score');
  return { id: input.id, nickname: nickname.trim(), total: input.total, flip: input.flip, route: input.route, landing: input.landing };
}

function findSubmission_(sheet, columns, id) {
  const count = sheet.getLastRow() - 1;
  if (count <= 0) return 0;
  const expected = THROWFISH.receiptPrefix + id;
  const notes = sheet.getRange(2, columns.total + 1, count, 1).getNotes();
  for (let index = 0; index < notes.length; index++) {
    if (notes[index][0] === expected) return index + 2;
  }
  return 0;
}

function topThree_() {
  const sheet = getScoreSheet_();
  const columns = columnMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues()
    .filter(function (row) { return typeof row[columns.total] === 'number' && Number.isSafeInteger(row[columns.total]) && row[columns.total] > 0; })
    .map(function (row) { return { nickname: String(row[columns.nickname] || '').trim(), score: row[columns.total] }; })
    .sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
}

function publicError_(error) {
  const message = error && error.message;
  return ['invalid_id', 'invalid_request', 'invalid_nickname', 'invalid_score', 'zero_score', 'busy',
    'duplicate_conflict', 'sheet_not_found', 'headers_mismatch', 'unknown_action'].includes(message) ? message : 'service_error';
}

function response_(value, callback) {
  const json = JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, function (character) {
    return '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0');
  });
  if (callback) {
    if (!/^throwfish_[A-Za-z0-9_]{1,80}$/.test(callback)) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'invalid_callback' })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
