// Apps Script khusus penyimpanan dokumen enumerator ke Google Drive.
// Tidak menangani autentikasi, database, QC, supervisi, atau dashboard.

function doGet(e) {
  const fileId = String(e && e.parameter && e.parameter.fileId || '').trim();
  if (!fileId) return jsonResponse({ success: true, service: 'document-storage' });

  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = String(properties.getProperty('NEXT_UPLOAD_SECRET') || '').trim().replace(/^['"]|['"]$/g, '');
    const receivedSecret = String(e.parameter.secret || '').trim().replace(/^['"]|['"]$/g, '');
    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return jsonResponse({ success: false, message: 'Preview tidak diizinkan.' });
    }

    const file = DriveApp.getFileById(fileId);
    return jsonResponse({
      success: true,
      fileName: file.getName(),
      mimeType: file.getMimeType(),
      fileData: Utilities.base64Encode(file.getBlob().getBytes())
    });
  } catch (error) {
    return jsonResponse({ success: false, message: 'Preview dokumen gagal: ' + error.toString() });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData && e.postData.contents || '{}');
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = String(properties.getProperty('NEXT_UPLOAD_SECRET') || '').trim().replace(/^['"]|['"]$/g, '');
    const folderId = properties.getProperty('FOLDER_UTAMA') || '';

    const receivedSecret = String(payload.secret || '').trim().replace(/^['"]|['"]$/g, '');
    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return jsonResponse({ success: false, message: 'Upload tidak diizinkan.' });
    }
    if (payload.action === 'deleteFiles') {
      return deleteDriveFiles(payload.fileIds);
    }
    if (!folderId || !payload.fileData || !payload.fileName) {
      return jsonResponse({ success: false, message: 'Folder Drive atau data dokumen belum lengkap.' });
    }

    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      return jsonResponse({ success: false, message: 'Idempotency key dokumen belum lengkap.' });
    }
    if (!/^[a-zA-Z0-9_-]{8,160}$/.test(idempotencyKey)) {
      return jsonResponse({ success: false, message: 'Idempotency key dokumen tidak valid.' });
    }
    if (String(payload.fileData).length > 14000000) {
      return jsonResponse({ success: false, message: 'Ukuran dokumen terlalu besar.' });
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const idempotencyProperties = PropertiesService.getScriptProperties();
      const existingFileId = idempotencyProperties.getProperty('UPLOAD_' + idempotencyKey);
      if (existingFileId) {
        try {
          const existingFile = DriveApp.getFileById(existingFileId);
          return jsonResponse({ success: true, fileId: existingFile.getId(), fileName: existingFile.getName(), fileUrl: existingFile.getUrl(), idempotent: true });
        } catch (existingFileError) {
          idempotencyProperties.deleteProperty('UPLOAD_' + idempotencyKey);
        }
      }

      const parentFolder = DriveApp.getFolderById(folderId);
      const targetFolder = getUploadTargetFolder(parentFolder, payload);
      const safeName = String(payload.fileName).replace(/[\\/:*?"<>|]/g, '_');
      const file = targetFolder.createFile(
        Utilities.newBlob(
          Utilities.base64Decode(payload.fileData),
          payload.fileMime || 'application/octet-stream',
          safeName
        )
      );
      idempotencyProperties.setProperty('UPLOAD_' + idempotencyKey, file.getId());

      return jsonResponse({
        success: true,
        fileId: file.getId(),
        fileName: file.getName(),
        fileUrl: file.getUrl()
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      message: 'Upload ke Google Drive gagal: ' + error.toString()
    });
  }
}

function deleteDriveFiles(fileIds) {
  const rootFolderId = PropertiesService.getScriptProperties().getProperty('FOLDER_UTAMA') || '';
  if (!Array.isArray(fileIds) || fileIds.length > 20) {
    return jsonResponse({ success: false, message: 'Daftar dokumen tidak valid.' });
  }
  if (!rootFolderId) {
    return jsonResponse({ success: false, message: 'Folder utama belum dikonfigurasi.' });
  }
  const uniqueFileIds = Array.from(new Set(fileIds.map(function(fileId) {
    return String(fileId || '').trim();
  }).filter(Boolean)));
  if (uniqueFileIds.some(function(fileId) {
    return !/^[a-zA-Z0-9_-]{10,200}$/.test(fileId);
  })) {
    return jsonResponse({ success: false, message: 'ID dokumen tidak valid.' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    uniqueFileIds.forEach(function(fileId) {
      const file = DriveApp.getFileById(fileId);
      if (!isInDriveFolderTree(file, rootFolderId)) {
        throw new Error('Dokumen berada di luar folder penyimpanan aplikasi.');
      }
      file.setTrashed(true);
    });
    return jsonResponse({ success: true, deletedFiles: uniqueFileIds.length });
  } finally {
    lock.releaseLock();
  }
}

function isInDriveFolderTree(file, rootFolderId) {
  const folders = [];
  const fileParents = file.getParents();
  while (fileParents.hasNext()) folders.push(fileParents.next());
  const visited = {};
  while (folders.length) {
    const folder = folders.pop();
    const folderId = folder.getId();
    if (folderId === rootFolderId) return true;
    if (visited[folderId]) continue;
    visited[folderId] = true;
    const ancestors = folder.getParents();
    while (ancestors.hasNext()) folders.push(ancestors.next());
  }
  return false;
}

function getUploadTargetFolder(parentFolder, payload) {
  const requestedFolder = String(payload.folderName || '').trim();
  if (requestedFolder === 'Persetujuan QC') {
    return getOrCreateFolder(parentFolder, requestedFolder);
  }

  const enumeratorName = sanitizeFolderName(payload.enumeratorName);
  const hotspotCode = sanitizeFolderName(payload.hotspotCode);
  if (!enumeratorName || !hotspotCode) {
    throw new Error('Nama enumerator dan kode hotspot wajib diisi.');
  }

  const enumeratorRootFolder = getOrCreateFolder(parentFolder, 'Enumerator');
  const enumeratorFolder = getOrCreateFolder(enumeratorRootFolder, enumeratorName);
  return getOrCreateFolder(enumeratorFolder, hotspotCode);
}

function sanitizeFolderName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
