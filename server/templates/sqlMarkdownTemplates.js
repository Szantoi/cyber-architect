const PROJECT_INDEX_TEMPLATE_ID = 'project-index-v1';

function inlineCode(value) {
  return `\`${String(value).replace(/`/g, '\\`')}\``;
}

/**
 * Central, versioned template registry for SQL-originated Markdown skeletons.
 * The YAML frontmatter is rendered separately by the generator so that values
 * from the operational source are always serialized safely.
 */
export const sqlMarkdownTemplates = Object.freeze({
  project_index: Object.freeze({
    id: PROJECT_INDEX_TEMPLATE_ID,
    version: 1,
    renderBody({ project }) {
      const statusLine = project.status
        ? `- **SQL státusz:** ${project.status}`
        : '- **SQL státusz:** nincs megadva a projekt-snapshotban';

      return [
        `# ${project.name}`,
        '',
        '> [!IMPORTANT]',
        '> A dokumentum vázát és az azonosítóit az SQL-alapú üzemi rendszer generálta. A szakmai tartalmat az alábbi fejezetekben szerkeszd; a generált frontmattert ne írd át kézzel.',
        '',
        '## SQL-ből rögzített adatok',
        '',
        `- **SQL projektazonosító:** ${inlineCode(project.id)}`,
        `- **Projekt neve:** ${project.name}`,
        `- **Létrehozva az üzemi rendszerben:** ${project.createdAt}`,
        statusLine,
        '',
        '## Cél és üzleti kontextus',
        '',
        'Írd le, milyen üzleti vagy mérnöki problémát old meg a projekt, és mi számít sikernek.',
        '',
        '## Műszaki döntések és bizonyítékok',
        '',
        '- Döntés:',
        '- Indoklás:',
        '- Bizonyíték / hivatkozás:',
        '- Kockázat vagy nyitott kérdés:',
        '',
        '## Következő lépések',
        '',
        '1. ',
        '2. ',
        '3. ',
        '',
        '## Kapcsolódó tudás',
        '',
        'Használj Obsidian wikilinkeket a kapcsolódó jegyzetekhez, például: `[[munkautasitas-cnc-elokeszites]]`.',
        '',
        '## Típusos rendszerkapcsolatok',
        '',
        'Projekt-, epic- és task-kapcsolatot az admin Gráfkezelőben vagy az alábbi emberi szerzői blokkban hozhatsz létre. `→` kifelé, `←` befelé mutat; `↔` két párosított irányított ívet kér. Egy vagy több gráfhoz így rendeld: `- depends_on → [[TASK-004]] · graphs: project/prj-2026-884, impact/production`. A rendszer az adatbázisban tartja az irányt, típust és auditot, majd külön, kijelölt `CA:SYSTEM` Markdown-blokkot frissít.',
        '',
        '<!-- CA:RELATIONS:BEGIN v1 -->',
        '## Saját típusos kapcsolatok',
        '<!-- CA:RELATIONS:END -->',
        ''
      ].join('\n');
    }
  })
});

export const SQL_MARKDOWN_TEMPLATE_IDS = Object.freeze({
  PROJECT_INDEX: PROJECT_INDEX_TEMPLATE_ID
});
