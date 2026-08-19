#!/usr/bin/env node

/**
 * CYBER-ARCHITECT PORTFOLIO CLI
 * Standalone Operations, Administration, Audit & Content Management Tool
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbService } from '../services/dbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFilePath = path.join(__dirname, '../portfolio.db');
const backupsDir = path.join(__dirname, '../backups');

const ANSI = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function printBanner() {
  console.log(`
${ANSI.cyan}${ANSI.bold}================================================================${ANSI.reset}
${ANSI.magenta}${ANSI.bold}   [CYBER-ARCHITECT PORTFOLIO // OPERATIONS & AUDIT CLI]        ${ANSI.reset}
${ANSI.cyan}${ANSI.bold}================================================================${ANSI.reset}
`);
}

function printHelp() {
  printBanner();
  console.log(`
${ANSI.bold}HASZNÁLAT:${ANSI.reset}
  npm run cli <parancs> [argumentumok] [kapcsolók]

${ANSI.bold}ELÉRHETŐ PARANCSOK:${ANSI.reset}
  ${ANSI.green}stats${ANSI.reset}                               Rendszer telemetria és rekordszámok
  ${ANSI.green}audit${ANSI.reset} / ${ANSI.green}audit list${ANSI.reset}                  Audit napló & eseménystream megtekintése
  ${ANSI.green}settings list${ANSI.reset}                       Weboldal beállítások listázása
  ${ANSI.green}settings set <kulcs> <érték>${ANSI.reset}        Beállítás mentése (--pin <PIN>)
  ${ANSI.green}projects list${ANSI.reset}                       The Grid projektek listázása
  ${ANSI.green}projects add --title "..."${ANSI.reset}          Új projekt rögzítése
  ${ANSI.green}projects delete <id>${ANSI.reset}                Projekt törlése
  ${ANSI.green}skills list${ANSI.reset}                         Arsenal készségek listázása
  ${ANSI.green}skills add --name "..."${ANSI.reset}            Új készség hozzáadása
  ${ANSI.green}skills delete <id>${ANSI.reset}                  Készség törlése
  ${ANSI.green}blogs${ANSI.reset} / ${ANSI.green}blog list${ANSI.reset}                   Cikkek listázása
  ${ANSI.green}blog publish --file <útvonal>${ANSI.reset}       Cikk publikálása Markdown fájlból
  ${ANSI.green}blog publish --title "..."${ANSI.reset}          Cikk közzététele
  ${ANSI.green}blog delete <id>${ANSI.reset}                      Cikk törlése
  ${ANSI.green}messages${ANSI.reset}                            Beérkező Uplink kapcsolatfelvételek
  ${ANSI.green}mark-read <id>${ANSI.reset}                     Üzenet olvasottnak jelölése
  ${ANSI.green}backup${ANSI.reset}                               SQLite adatbázis azonnali mentése
  ${ANSI.green}update-pin <újPin>${ANSI.reset}                 Admin PIN kód módosítása

${ANSI.yellow}KAPCSOLÓK:${ANSI.reset}
  --json          Kimenet formázott JSON formátumban scriptek és ágensek számára
  --pin <PIN>     Admin hitelesítési PIN (alapértelmezett: 1337 vagy ADMIN_PIN)
  --limit <N>     Visszaadott rekordok száma (pl. audit listánál)
  --help          Súgó megjelenítése
`);
}

function parseArgs(rawArgs) {
  const args = rawArgs.slice(2);
  const parsed = {
    command: args[0] ? args[0].toLowerCase() : 'help',
    subcommand: args[1] ? args[1].toLowerCase() : null,
    positionals: [],
    flags: {}
  };

  let startIndex = 1;
  if (['settings', 'projects', 'project', 'skills', 'skill', 'blog', 'blogs', 'audit'].includes(parsed.command)) {
    startIndex = 2;
  }

  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed.flags[key] = next;
        i++;
      } else {
        parsed.flags[key] = true;
      }
    } else {
      parsed.positionals.push(arg);
    }
  }

  return parsed;
}

function checkAuth(flags) {
  const pin = flags.pin || process.env.ADMIN_PIN || process.env.PORTFOLIO_API_KEY || '1337';
  if (!dbService.verifyAuthTokenOrKey(pin)) {
    console.error(`${ANSI.red}✖ ACCESS_DENIED: Érvénytelen PIN vagy API kulcs.${ANSI.reset}`);
    process.exit(1);
  }
}

async function main() {
  const parsed = parseArgs(process.argv);
  const isJson = Boolean(parsed.flags.json);

  if (parsed.command === 'help' || parsed.flags.help) {
    printHelp();
    return;
  }

  if (!isJson && parsed.command !== 'help') {
    printBanner();
  }

  switch (parsed.command) {
    case 'stats':
    case 'status': {
      const settings = dbService.getSettings();
      const skills = dbService.getSkills();
      const projects = dbService.getProjects();
      const blogs = dbService.getBlogPosts({ publishedOnly: false });
      const messages = dbService.getMessages();
      const unreadMsgs = messages.filter(m => !m.read_status);
      const auditLogs = dbService.getAuditLogs({ limit: 1 });

      let dbSizeKb = 0;
      if (fs.existsSync(dbFilePath)) {
        dbSizeKb = (fs.statSync(dbFilePath).size / 1024).toFixed(2);
      }

      if (isJson) {
        console.log(JSON.stringify({
          dbFilePath,
          dbSizeKb,
          settingsCount: Object.keys(settings).length,
          skillsCount: skills.length,
          projectsCount: projects.length,
          blogsCount: blogs.length,
          messagesCount: messages.length,
          unreadMessagesCount: unreadMsgs.length,
          lastAuditActivity: auditLogs[0] ? auditLogs[0].created_at : null
        }, null, 2));
      } else {
        console.log(`${ANSI.bold}RENDSZER TELEMETRIA ÉS REKORDOK:${ANSI.reset}`);
        console.log(`  • Adatbázis fájl:      ${ANSI.cyan}${dbFilePath}${ANSI.reset} (${dbSizeKb} KB)`);
        console.log(`  • Hero cím:            ${ANSI.green}${settings.hero_title ? settings.hero_title.replace('\n', ' ') : 'N/A'}${ANSI.reset}`);
        console.log(`  • Arsenal modulok:     ${ANSI.green}${skills.length} db${ANSI.reset}`);
        console.log(`  • The Grid projektek:  ${ANSI.green}${projects.length} db${ANSI.reset}`);
        console.log(`  • Blog cikkek:         ${ANSI.green}${blogs.length} db${ANSI.reset} (${blogs.filter(b => b.published).length} publikálva)`);
        console.log(`  • Uplink üzenetek:     ${unreadMsgs.length > 0 ? ANSI.yellow : ANSI.green}${messages.length} db (${unreadMsgs.length} olvasatlan)${ANSI.reset}`);
        if (auditLogs[0]) {
          console.log(`  • Utolsó audit esemény: ${ANSI.magenta}${auditLogs[0].action} (${auditLogs[0].actor})${ANSI.reset} @ ${auditLogs[0].created_at}`);
        }
        console.log('');
      }
      break;
    }

    case 'audit': {
      checkAuth(parsed.flags);
      const limit = Number(parsed.flags.limit) || 20;
      const entity = parsed.flags.entity || null;
      const logs = dbService.getAuditLogs({ limit, entity });

      if (isJson) {
        console.log(JSON.stringify(logs, null, 2));
      } else {
        console.log(`${ANSI.bold}AUDIT TRAIL & VÁLTOZÁSNAPLÓ (${logs.length} esemény):${ANSI.reset}\n`);
        if (logs.length === 0) {
          console.log(`  ${ANSI.dim}[NINCS RÖGZÍTETT AUDIT BEJEGYZÉS]${ANSI.reset}\n`);
        } else {
          logs.forEach(l => {
            const actorBadge = l.actor === 'MCP_AGENT' 
              ? `${ANSI.cyan}[MCP_AGENT]${ANSI.reset}` 
              : l.actor === 'CLI_OPERATOR'
              ? `${ANSI.yellow}[CLI_OPERATOR]${ANSI.reset}`
              : `${ANSI.magenta}[${l.actor}]${ANSI.reset}`;

            console.log(`  #${l.id} ${actorBadge} ${ANSI.bold}${l.action}${ANSI.reset} on ${ANSI.green}${l.entity}${ANSI.reset} (ID: ${l.entity_id || 'N/A'}) @ ${l.created_at}`);
          });
          console.log('');
        }
      }
      break;
    }

    case 'settings': {
      if (parsed.subcommand === 'list' || !parsed.subcommand) {
        const settings = dbService.getSettings();
        if (isJson) {
          console.log(JSON.stringify(settings, null, 2));
        } else {
          console.log(`${ANSI.bold}GLOBÁLIS BEÁLLÍTÁSOK:${ANSI.reset}`);
          for (const [k, v] of Object.entries(settings)) {
            console.log(`  ${ANSI.cyan}${k.padEnd(24)}:${ANSI.reset} ${v}`);
          }
          console.log('');
        }
      } else if (parsed.subcommand === 'set') {
        checkAuth(parsed.flags);
        const key = parsed.positionals[0];
        const val = parsed.positionals.slice(1).join(' ') || parsed.flags.value;
        if (!key || !val) {
          console.error(`${ANSI.red}Hiba: Add meg a kulcsot és az új értéket!${ANSI.reset}`);
          process.exit(1);
        }
        dbService.updateSettings({ [key]: val }, 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify({ success: true, key, val }));
        } else {
          console.log(`${ANSI.green}✔ Beállítás mentve:${ANSI.reset} [${key}] = "${val}"\n`);
        }
      }
      break;
    }

    case 'projects':
    case 'project': {
      if (parsed.subcommand === 'list' || !parsed.subcommand) {
        const projects = dbService.getProjects();
        if (isJson) {
          console.log(JSON.stringify(projects, null, 2));
        } else {
          console.log(`${ANSI.bold}THE GRID PROJEKTEK (${projects.length} db):${ANSI.reset}\n`);
          projects.forEach(p => {
            console.log(`  ${ANSI.cyan}[${p.id}]${ANSI.reset} ${ANSI.bold}${p.title}${ANSI.reset} | ${ANSI.yellow}${p.status}${ANSI.reset}`);
            console.log(`    Tagek: ${p.tags.join(', ')}`);
            console.log(`    Leírás: ${p.desc}`);
            console.log(`    Memória: ${p.addr} // Auth: ${p.sec_auth}\n`);
          });
        }
      } else if (parsed.subcommand === 'add') {
        checkAuth(parsed.flags);
        const title = parsed.flags.title;
        const desc = parsed.flags.desc || '';
        const tags = parsed.flags.tags ? parsed.flags.tags.split(',').map(t => t.trim()) : [];
        const status = parsed.flags.status || 'ÉLES RENDSZER';
        const img = parsed.flags.img || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1000&auto=format&fit=crop';
        const addr = parsed.flags.addr || '0xFA';
        const sec_auth = parsed.flags.sec_auth || 'ZÁRT BELSŐ HÁLÓZAT';

        if (!title) {
          console.error(`${ANSI.red}Hiba: A --title megadása kötelező!${ANSI.reset}`);
          process.exit(1);
        }

        const project = dbService.createProject({ title, desc, tags, status, img, addr, sec_auth }, 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify(project, null, 2));
        } else {
          console.log(`${ANSI.green}✔ Új projekt sikeresen létrehozva:${ANSI.reset} [${project.id}] ${project.title}\n`);
        }
      } else if (parsed.subcommand === 'delete') {
        checkAuth(parsed.flags);
        const id = parsed.positionals[0] || parsed.flags.id;
        if (!id) {
          console.error(`${ANSI.red}Hiba: Add meg a törlendő projekt ID-t!${ANSI.reset}`);
          process.exit(1);
        }
        dbService.deleteProject(id, 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify({ success: true, deletedId: id }));
        } else {
          console.log(`${ANSI.green}✔ Projekt törölve:${ANSI.reset} [${id}]\n`);
        }
      }
      break;
    }

    case 'skills':
    case 'skill': {
      if (parsed.subcommand === 'list' || !parsed.subcommand) {
        const skills = dbService.getSkills();
        if (isJson) {
          console.log(JSON.stringify(skills, null, 2));
        } else {
          console.log(`${ANSI.bold}ARSENAL KÉSZSÉGEK (${skills.length} db):${ANSI.reset}\n`);
          skills.forEach(s => {
            console.log(`  ${ANSI.cyan}[#${s.id}]${ANSI.reset} ${ANSI.bold}${s.name}${ANSI.reset} (Szint: ${s.level})`);
            console.log(`    ${s.desc}\n`);
          });
        }
      } else if (parsed.subcommand === 'add') {
        checkAuth(parsed.flags);
        const name = parsed.flags.name;
        const desc = parsed.flags.desc || '';
        const level = parsed.flags.level || '0.95';
        const icon = parsed.flags.icon || 'terminal';
        const color = parsed.flags.color || 'var(--neon-cyan)';

        if (!name) {
          console.error(`${ANSI.red}Hiba: A --name megadása kötelező!${ANSI.reset}`);
          process.exit(1);
        }

        const skill = dbService.createSkill({ name, desc, level, icon, color }, 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify(skill, null, 2));
        } else {
          console.log(`${ANSI.green}✔ Készség rögzítve:${ANSI.reset} [#${skill.id}] ${skill.name}\n`);
        }
      } else if (parsed.subcommand === 'delete') {
        checkAuth(parsed.flags);
        const id = parsed.positionals[0] || parsed.flags.id;
        if (!id) {
          console.error(`${ANSI.red}Hiba: Add meg a készség ID-t!${ANSI.reset}`);
          process.exit(1);
        }
        dbService.deleteSkill(id, 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify({ success: true, deletedId: id }));
        } else {
          console.log(`${ANSI.green}✔ Készség törölve:${ANSI.reset} [#${id}]\n`);
        }
      }
      break;
    }

    case 'blogs':
    case 'blog': {
      if (parsed.subcommand === 'list' || !parsed.subcommand) {
        const blogs = dbService.getBlogPosts({ publishedOnly: false });
        if (isJson) {
          console.log(JSON.stringify(blogs, null, 2));
        } else {
          console.log(`${ANSI.bold}DECRYPTION LOGS CIKKEK (${blogs.length} db):${ANSI.reset}\n`);
          blogs.forEach(b => {
            const pub = b.published ? `${ANSI.green}[PUBLIKÁLVA]${ANSI.reset}` : `${ANSI.yellow}[VÁZLAT]${ANSI.reset}`;
            console.log(`  ${pub} ${ANSI.cyan}#${b.id}${ANSI.reset} [${b.category}] ${ANSI.bold}${b.title}${ANSI.reset} (${b.created_at})`);
            console.log(`    Slug: /blog/${b.slug} | Olvasási idő: ${b.read_time}`);
            console.log(`    ${b.summary}\n`);
          });
        }
      } else if (parsed.subcommand === 'publish') {
        checkAuth(parsed.flags);
        let title = parsed.flags.title;
        let summary = parsed.flags.summary;
        let content = parsed.flags.content;
        const category = parsed.flags.category || 'ADATBIZTONSÁG';
        const read_time = parsed.flags.read_time || '4 PERC';

        if (parsed.flags.file) {
          const filePath = path.resolve(process.cwd(), parsed.flags.file);
          if (!fs.existsSync(filePath)) {
            console.error(`${ANSI.red}Hiba: A fájl nem található: ${filePath}${ANSI.reset}`);
            process.exit(1);
          }
          content = fs.readFileSync(filePath, 'utf-8');
          if (!title) {
            const firstHeading = content.match(/^#\s+(.+)$/m);
            title = firstHeading ? firstHeading[1] : path.basename(filePath, path.extname(filePath));
          }
          if (!summary) {
            const firstPara = content.split('\n\n').find(p => p.trim() && !p.startsWith('#'));
            summary = firstPara ? firstPara.slice(0, 160) + '...' : 'Rendszernapló és esettanulmány.';
          }
        }

        if (!title || !content) {
          console.error(`${ANSI.red}Hiba: Cím (--title) és tartalom (--content vagy --file) szükséges!${ANSI.reset}`);
          process.exit(1);
        }

        const post = dbService.createBlogPost({ title, summary: summary || title, content, category, read_time, published: 1 }, 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify(post, null, 2));
        } else {
          console.log(`${ANSI.green}✔ Cikk publikálva:${ANSI.reset} "${post.title}" (/${post.slug})\n`);
        }
      } else if (parsed.subcommand === 'delete') {
        checkAuth(parsed.flags);
        const id = parsed.positionals[0] || parsed.flags.id;
        if (!id) {
          console.error(`${ANSI.red}Hiba: Add meg a törlendő cikk ID-t!${ANSI.reset}`);
          process.exit(1);
        }
        dbService.deleteBlogPost(id, 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify({ success: true, deletedId: id }));
        } else {
          console.log(`${ANSI.green}✔ Cikk törölve:${ANSI.reset} [#${id}]\n`);
        }
      }
      break;
    }

    case 'messages':
    case 'inbox': {
      checkAuth(parsed.flags);
      const messages = dbService.getMessages();
      if (isJson) {
        console.log(JSON.stringify(messages, null, 2));
      } else {
        console.log(`${ANSI.bold}BEÉRKEZŐ UPLINK ÜZENETEK (${messages.length} db):${ANSI.reset}\n`);
        messages.forEach(msg => {
          const status = msg.read_status ? `${ANSI.green}[OLVASVA]${ANSI.reset}` : `${ANSI.yellow}${ANSI.bold}[ÚJ ÜZENET]${ANSI.reset}`;
          console.log(`  ${status} ${ANSI.cyan}#${msg.id}${ANSI.reset} | ${ANSI.bold}${msg.identity}${ANSI.reset} (${new Date(msg.created_at).toLocaleString()})`);
          console.log(`    Tárgy: ${msg.subject}`);
          if (msg.message) console.log(`    Üzenet: ${msg.message}`);
          console.log('  --------------------------------------------------------------');
        });
        console.log('');
      }
      break;
    }

    case 'mark-read': {
      checkAuth(parsed.flags);
      const id = parsed.positionals[0] || parsed.flags.id;
      if (!id) {
        console.error(`${ANSI.red}Hiba: Add meg az üzenet ID-t! (pl. mark-read 1)${ANSI.reset}`);
        process.exit(1);
      }
      dbService.markMessageRead(id, 1);
      if (isJson) {
        console.log(JSON.stringify({ success: true, id }));
      } else {
        console.log(`${ANSI.green}✔ #${id} üzenet olvasottnak jelölve.${ANSI.reset}\n`);
      }
      break;
    }

    case 'backup':
    case 'snapshot': {
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `portfolio_backup_${timestamp}.db`;
      const targetPath = path.join(backupsDir, backupFileName);

      fs.copyFileSync(dbFilePath, targetPath);
      const sizeKb = (fs.statSync(targetPath).size / 1024).toFixed(2);

      if (isJson) {
        console.log(JSON.stringify({ success: true, file: targetPath, sizeKb }));
      } else {
        console.log(`${ANSI.green}${ANSI.bold}✔ Adatbázis snapshot sikeresen elkészült!${ANSI.reset}`);
        console.log(`  • Mentési útvonal: ${ANSI.cyan}${targetPath}${ANSI.reset} (${sizeKb} KB)\n`);
      }
      break;
    }

    case 'update-pin':
    case 'set-pin': {
      const newPin = parsed.positionals[0] || parsed.flags.pin;
      if (!newPin || newPin.length < 4) {
        console.error(`${ANSI.red}Hiba: Az új PIN kódnak legalább 4 karakteresnek kell lennie.${ANSI.reset}`);
        process.exit(1);
      }
      dbService.updatePin(newPin, 'CLI_OPERATOR');
      if (isJson) {
        console.log(JSON.stringify({ success: true, message: 'PIN_UPDATED' }));
      } else {
        console.log(`${ANSI.green}✔ Admin PIN kód sikeresen frissítve és Bcrypttel hashelve.${ANSI.reset}\n`);
      }
      break;
    }

    case 'rollback':
    case 'revert': {
      checkAuth(parsed.flags);
      const auditId = parsed.positionals[0] || parsed.flags.id;
      if (!auditId) {
        console.error(`${ANSI.red}Hiba: Add meg a visszavonandó audit bejegyzés azonosítóját! (pl. rollback 5)${ANSI.reset}`);
        process.exit(1);
      }
      try {
        const result = dbService.rollbackAuditEntry(Number(auditId), 'CLI_OPERATOR');
        if (isJson) {
          console.log(JSON.stringify({ success: true, rolledBackId: auditId, result }));
        } else {
          console.log(`${ANSI.green}✔ Rollback sikeresen végrehajtva az audit #${auditId} bejegyzésre!${ANSI.reset}\n`);
        }
      } catch (err) {
        console.error(`${ANSI.red}✖ Rollback sikertelen:${ANSI.reset}`, err.message);
        process.exit(1);
      }
      break;
    }

    default:
      printHelp();
      break;
  }
}

main().catch(err => {
  console.error(`${ANSI.red}[CLI FATAL ERROR]${ANSI.reset}`, err);
  process.exit(1);
});
