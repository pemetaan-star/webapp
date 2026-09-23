// Apps Script khusus penyimpanan dokumen enumerator ke Google Drive.
// Tidak menangani autentikasi, database, QC, supervisi, atau dashboard.

function doGet(e) {
  const fileId = String(e && e.parameter && e.parameter.fileId || '').trim();
  if (!fileId) return jsonResponse({ success: true, service: 'document-storage' });

  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty('NEXT_UPLOAD_SECRET') || '';
    if (!expectedSecret || e.parameter.secret !== expectedSecret) {
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
    const expectedSecret = properties.getProperty('NEXT_UPLOAD_SECRET') || '';
    const folderId = properties.getProperty('FOLDER_UTAMA') || '';

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ success: false, message: 'Upload tidak diizinkan.' });
    }
    if (!folderId || !payload.fileData || !payload.fileName) {
      return jsonResponse({ success: false, message: 'Folder Drive atau data dokumen belum lengkap.' });
    }

    const parentFolder = DriveApp.getFolderById(folderId);
    const requestedFolder = String(payload.folderName || 'Dokumen Enumerator').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const targetFolder = getOrCreateFolder(parentFolder, requestedFolder || 'Dokumen Enumerator');
    const safeName = String(payload.fileName).replace(/[\\/:*?"<>|]/g, '_');
    const file = targetFolder.createFile(
      Utilities.newBlob(
        Utilities.base64Decode(payload.fileData),
        payload.fileMime || 'application/octet-stream',
        safeName
      )
    );

    return jsonResponse({
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl()
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: 'Upload ke Google Drive gagal: ' + error.toString()
    });
  }
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
