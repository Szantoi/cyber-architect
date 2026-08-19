import { driveSyncService } from '../services/driveSyncService.js';
import fs from 'fs';
import path from 'path';

async function uploadRootGuides() {
  const token = await driveSyncService.getValidAccessToken();
  const status = driveSyncService.getStatus();
  const rootFolderId = status.drive_folder_id;
  if (!rootFolderId) return console.log('No rootFolderId');

  const files = ['AGENT_GUIDE.md', 'CONTENT_STANDARDS.md'];
  for (const name of files) {
    const filePath = path.resolve('../CyberArchitect', name);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');

    const q = `'${rootFolderId}' in parents and name = '${name}' and trashed = false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      const fileId = data.files[0].id;
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown'
        },
        body: content
      });
      console.log('✔ Frissítve a Google Drive CyberArchitect gyökerében:', name);
    } else {
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          parents: [rootFolderId],
          mimeType: 'text/markdown'
        })
      });
      const created = await createRes.json();
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown'
        },
        body: content
      });
      console.log('✔ Létrehozva a Google Drive CyberArchitect gyökerében:', name);
    }
  }
  console.log('✔ A ROOT ÚTMUTATÓK ÉS SZABÁLYOK SIKERESEN FELKERÜLTEK A GOOGLE DRIVE-RA!');
}

uploadRootGuides().catch(console.error);
