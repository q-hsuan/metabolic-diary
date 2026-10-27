/**
 * 雙軌代謝日記 — Google 雲端共用後端 (Google Apps Script)
 *
 * 資料會以一個 JSON 檔存在你自己的 Google 雲端硬碟 (檔名 metabolic-diary-data.json)。
 * - 擁有者手機：帶寫入密碼 POST 上傳資料
 * - 其他人手機：GET 讀取 (唯讀)
 *
 * 部署方式請見 README.md「雲端共用」章節。
 */

// ⚠️ 請改成你自己的寫入密碼，並在 App 的「雲端共用」設定中填入相同密碼
const WRITE_KEY = '請改成你自己的密碼';

const FILE_NAME = 'metabolic-diary-data.json';
const EMPTY_DATA = { glucose: [], meals: [], updatedAt: null };

function getDataFile_() {
  const props = PropertiesService.getScriptProperties();
  const fileId = props.getProperty('FILE_ID');
  if (fileId) {
    try {
      return DriveApp.getFileById(fileId);
    } catch (err) {
      // 檔案被刪除時重新建立
    }
  }
  const file = DriveApp.createFile(FILE_NAME, JSON.stringify(EMPTY_DATA), 'application/json');
  props.setProperty('FILE_ID', file.getId());
  return file;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const file = getDataFile_();
  return ContentService.createTextOutput(file.getBlob().getDataAsString('UTF-8'))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ ok: false, error: '資料格式錯誤' });
  }
  if (body.key !== WRITE_KEY) {
    return jsonOutput_({ ok: false, error: '寫入密碼錯誤' });
  }

  const data = {
    glucose: Array.isArray(body.glucose) ? body.glucose : [],
    meals: Array.isArray(body.meals) ? body.meals : [],
    updatedAt: new Date().toISOString()
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getDataFile_().setContent(JSON.stringify(data));
  } finally {
    lock.releaseLock();
  }
  return jsonOutput_({ ok: true, updatedAt: data.updatedAt });
}
