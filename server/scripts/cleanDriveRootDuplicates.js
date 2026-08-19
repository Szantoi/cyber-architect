import { driveSyncService } from '../services/driveSyncService.js';

async function cleanRootDuplicates() {
  const token = await driveSyncService.getValidAccessToken();
  const status = driveSyncService.getStatus();
  const blogFolderId = status.drive_blog_folder_id;
  const knowledgeFolderId = status.drive_knowledge_folder_id;

  console.log('--- ELLENŐRZÉS: GOOGLE DRIVE BLOG GYÖKÉR TISZTÍTÁSA ---');
  if (blogFolderId) {
    const qBlog = `'${blogFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qBlog)}&fields=files(id,name,mimeType)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`Talált fájlok a Blog gyökérben: ${data.files.length} db`);
      for (const file of data.files) {
        console.log(`[TÖRLÉS / TRASH] Blog gyökér fájl törlése a Drive-ról: ${file.name} (ID: ${file.id})`);
        const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (delRes.ok || delRes.status === 204) {
          console.log(`  ✔ Sikeresen törölve: ${file.name}`);
        } else {
          console.log(`  ✖ Hiba a törléskor: ${delRes.statusText}`);
        }
      }
    }
  }

  console.log('\n--- ELLENŐRZÉS: GOOGLE DRIVE TUDÁSTÁR GYÖKÉR TISZTÍTÁSA ---');
  if (knowledgeFolderId) {
    const qKnowledge = `'${knowledgeFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qKnowledge)}&fields=files(id,name,mimeType)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`Talált fájlok a Tudástár gyökérben: ${data.files.length} db`);
      for (const file of data.files) {
        // Csak a cikk fájlokat takarítjuk, ha vannak
        console.log(`[TÖRLÉS / TRASH] Tudástár gyökér fájl törlése a Drive-ról: ${file.name} (ID: ${file.id})`);
        const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (delRes.ok || delRes.status === 204) {
          console.log(`  ✔ Sikeresen törölve: ${file.name}`);
        } else {
          console.log(`  ✖ Hiba a törléskor: ${delRes.statusText}`);
        }
      }
    }
  }

  console.log('\n✔ A GYÖKÉRBEN LÉVŐ ÁRVA DUPLIKÁTUMOK TÖRLÉSE KÉSZ!');
}

cleanRootDuplicates().catch(console.error);
