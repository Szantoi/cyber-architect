import { driveSyncService } from '../services/driveSyncService.js';
import fs from 'fs';
import path from 'path';

async function uploadLocalFolderRecursive(localFolderPath, parentDriveFolderId, accessToken) {
  const items = fs.readdirSync(localFolderPath, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(localFolderPath, item.name);

    if (item.isDirectory()) {
      // 1. Mappa létrehozása a Drive-on, ha még nincs
      console.log(`📁 Mappa ellenőrzése / létrehozása Drive-on: "${item.name}"`);
      const subFolderId = await driveSyncService.getOrCreateCloudFolder(parentDriveFolderId, item.name, accessToken);
      // Rekurzív feltöltés az almappába
      await uploadLocalFolderRecursive(itemPath, subFolderId, accessToken);
    } else if (item.isFile() && item.name.endsWith('.md')) {
      // 2. Fájl feltöltése a Drive-ra
      const content = fs.readFileSync(itemPath, 'utf-8');
      const fileName = item.name;

      console.log(`  📄 Fájl feltöltése: ${fileName} -> Drive mappa ID: ${parentDriveFolderId}`);

      const q = `'${parentDriveFolderId}' in parents and name = '${fileName}' and trashed = false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
      const res = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();

      if (data.files && data.files.length > 0) {
        const fileId = data.files[0].id;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'text/markdown'
          },
          body: content
        });
        console.log(`    ✔ Frissítve: ${fileName}`);
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: fileName,
            parents: [parentDriveFolderId],
            mimeType: 'text/markdown'
          })
        });
        const created = await createRes.json();
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'text/markdown'
          },
          body: content
        });
        console.log(`    ✔ Új fájl létrehozva: ${fileName}`);
      }
    }
  }
}

async function fullSyncToDrive() {
  console.log('=== TELJES GOOGLE DRIVE KÖNYVTÁR ÉS FÁJL FELTÖLTÉS ===');
  const token = await driveSyncService.getValidAccessToken();
  const status = driveSyncService.getStatus();

  const knowledgeFolderId = status.drive_knowledge_folder_id;
  const blogFolderId = status.drive_blog_folder_id;

  const rootDir = path.resolve('..');
  const localKnowledgeDir = path.join(rootDir, 'CyberArchitect', 'KnowledgeBase');
  const localBlogDir = path.join(rootDir, 'CyberArchitect', 'Blog');

  // 1. Knowledge Base feltöltése
  if (knowledgeFolderId && fs.existsSync(localKnowledgeDir)) {
    console.log(`\n--- 🧠 KNOWLEDGE BASE FELTÖLTÉSE (Drive ID: ${knowledgeFolderId}) ---`);
    await uploadLocalFolderRecursive(localKnowledgeDir, knowledgeFolderId, token);
  }

  // 2. Blog feltöltése
  if (blogFolderId && fs.existsSync(localBlogDir)) {
    console.log(`\n--- 📝 BLOG FELTÖLTÉSE (Drive ID: ${blogFolderId}) ---`);
    await uploadLocalFolderRecursive(localBlogDir, blogFolderId, token);
  }

  console.log('\n=== ✔ TELJES HIERARCHIKUS FELTÖLTÉS SIKERESEN BEFEJEZŐDÖTT! ===');
}

fullSyncToDrive().catch(console.error);
