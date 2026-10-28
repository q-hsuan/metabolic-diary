/**
 * 雙軌代謝日記 — Google 雲端共用後端 (Google Apps Script)
 *
 * 資料會以一個 JSON 檔存在你自己的 Google 雲端硬碟 (檔名 metabolic-diary-data.json)。
 * - 擁有者手機：帶寫入密碼 POST 上傳資料
 * - 其他人手機：GET 讀取 (唯讀)
 * - 自動備份：每天第一次上傳前、以及上傳的資料比雲端少了紀錄時，
 *   先把雲端原本的資料另存到「metabolic-diary-backups」資料夾，保留 60 天
 *
 * 部署方式請見 README.md「雲端共用」章節。
 */

// ⚠️ 請改成你自己的寫入密碼，並在 App 的「雲端共用」設定中填入相同密碼
const WRITE_KEY = '請改成你自己的密碼';

const FILE_NAME = 'metabolic-diary-data.json';
const EMPTY_DATA = { glucose: [], meals: [], updatedAt: null };
const BACKUP_FOLDER_NAME = 'metabolic-diary-backups';
const BACKUP_KEEP_DAYS = 60;
const TIME_ZONE = 'Asia/Taipei';

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

function getBackupFolder_() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function recordIds_(data) {
  return [...(data.glucose || []), ...(data.meals || [])].map(r => String(r.id));
}

// 覆蓋雲端資料前先備份：每天一份，另外只要有紀錄會消失就再多存一份
function backupBeforeWrite_(oldContent, newData) {
  let oldData;
  try {
    oldData = JSON.parse(oldContent);
  } catch (err) {
    return;
  }
  const oldIds = recordIds_(oldData);
  if (oldIds.length === 0) return;

  const newIds = new Set(recordIds_(newData));
  const removedCount = oldIds.filter(id => !newIds.has(id)).length;

  const folder = getBackupFolder_();
  const now = new Date();
  const dailyName = 'backup-' + Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd') + '.json';
  if (!folder.getFilesByName(dailyName).hasNext()) {
    folder.createFile(dailyName, oldContent, 'application/json');
  }
  if (removedCount > 0) {
    const name = 'backup-' + Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd_HHmmss') + '_少了' + removedCount + '筆前.json';
    folder.createFile(name, oldContent, 'application/json');
  }

  // 超過保留天數的備份移到垃圾桶（30 天內仍可從垃圾桶救回）
  const cutoff = now.getTime() - BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated().getTime() < cutoff) f.setTrashed(true);
  }
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
    const file = getDataFile_();
    backupBeforeWrite_(file.getBlob().getDataAsString('UTF-8'), data);
    file.setContent(JSON.stringify(data));
  } finally {
    lock.releaseLock();
  }
  return jsonOutput_({ ok: true, updatedAt: data.updatedAt });
}
