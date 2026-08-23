# SQL-vezérelt Markdown generálás

## Cél és ownership-határ

Az üzemi SQL/ERP rendszer az új, SQL-hoz kötött dokumentumok strukturális igazságforrása:

- a projekt létezése, stabil azonosítója, neve és létrehozási ideje;
- a generált mappa, az `index.md`, a kontrollált frontmatter és a sablonverzió.

A kanonikus Obsidian vault a generálás után is a humán, szakmai tartalom helye:

- döntési kontextus, bizonyítékok, kockázatok és wikilinkek;
- a Markdown törzse, amelyet a generátor nem ír felül;
- a Vault → SQLite/RAG index bemenete.

Az SQLite/RAG továbbra is vetület, nem szerkesztési forrás. A taxonómia megjelenítési szerződése és a saját gráfok/élek a DB-registryben élnek, de a dokumentum szabad szakmai szövegét egyik sem írhatja felül. A határ azért fontos, hogy az SQL-ben rögzített üzleti adatok ne kézzel gépelt YAML-ből, a szakmai szöveg pedig ne adatbázis-triggerből származzon.

## Első megvalósítás: Push

A `server/services/sqlMarkdownGenerationService.js` egy create-only projektindex-generátor. Az új SQL-projektet az ERP/webalkalmazás eseménykezelője vagy ütemezett worker így indíthatja:

```powershell
cd CyberArchitectReact
node server/scripts/generateSqlMarkdown.js PRJ-2026-884
```

Biztonságos előnézethez:

```powershell
node server/scripts/generateSqlMarkdown.js PRJ-2026-884 --dry-run
```

Az alapértelmezett futás a fájl létrehozása után meghívja a Vault → SQLite/RAG szinkront is. Ha csak a vault-fájlt kell előállítani, például egy külön indexelő worker előtt:

```powershell
node server/scripts/generateSqlMarkdown.js PRJ-2026-884 --no-sync
```

A generált célútvonal determinisztikus:

```text
Content/02_SQL_Projects/project-prj-2026-884/index.md
```

Létező `index.md` esetén a futás `skipped_existing` eredményt ad. Ez szándékosan megőrzi a mérnök által már megírt dokumentumot, és egyidejű eseményeknél is kizárja a felülírást.

## Gateway-szerződés

A generátor nem kap címet, YAML-t, táblanevet, connection stringet vagy nyers SQL-t. Kizárólag a meglévő, allowlistelt `project_snapshot` profilt kéri a `HYBRID_SQL_FACT_GATEWAY_URL` belső gatewaytől:

```json
{
  "project_id": "PRJ-2026-884",
  "fact_profiles": ["project_snapshot"]
}
```

A gateway ERP-adapterének a következő, minimális `project_snapshot` szerződést kell visszaadnia:

```json
{
  "project_id": "PRJ-2026-884",
  "name": "CNC gyártás-előkészítési pilot",
  "created_at": "2026-08-21T07:30:00.000Z",
  "status": "active"
}
```

Az `project_id`, `name` és `created_at` kötelező. A generátor projektazonosító-eltérésre, hiányos vagy nem elérhető snapshotra hibával leáll, és nem hoz létre fájlt. Így nem keletkezhet „hihető”, de hibás YAML.

A generálás nem használhatja a `hybrid_rag_sql_snapshots` helyi pilot cache-t helyettesítő igazságforrásként. A gateway URL kötelező; ennek hiányában a generátor `SQL_PROJECT_SOURCE_NOT_AUTHORITATIVE` hibával megáll.

## Központi sablonkezelés

Az aktív, központilag szerkeszthető SQL-projektváz mindig az aktuális `CYBER_ARCHITECT_CONTENT_ROOT/ObsidianTemplates/ca_sql_project_index.md` fájlja. Konfiguráció nélkül ez a monorepo meglévő `CyberArchitect/ObsidianTemplates` katalógusára esik vissza. Így egy külön Vault-alapmappa saját sablonkatalógust kap; a rendszer nem nyúl át egy másik munkatér katalógusába. Az admin **Vault Templates** nézete ugyanennek a katalogizált fájlnak a listázását, szerkesztését, létrehozását és törlését kezeli az auditált `/api/admin/vault/templates` végpontokon. A következő generált projekt a sablon Markdown-törzsét kapja meg; a meglévő projektfájlok változatlanok maradnak.

A generátor kizárólag az alábbi, szűk placeholdereket oldja fel a törzsben: `{{project_name}}`, `{{sql_project_id}}`, `{{sql_created_at}}`, `{{sql_project_status}}`. Ez nem általános programozható sablonnyelv, ezért egy sablonszerkesztésből nem futhat SQL vagy JavaScript. A YAML frontmattert továbbra is a generátor szerializálja `js-yaml`-lel, így a felhasználónak nem kell manuálisan beírnia a `sql_project_id`, `document_id`, Obsidian-native `sql_binding_*`/`sql_fact_profiles`, láthatósági vagy RAG-mezőket.

Az alkalmazáskódbeli `server/templates/sqlMarkdownTemplates.js` a verziózott, biztonságos fallback: akkor szolgál ki vázat, ha a Vault-katalógus átmenetileg nem olvasható egy admin mentés közben. Nem ez a napi sablonszerkesztési felület.

A generált gráfmutató is lapos és Obsidian-kompatibilis:

```yaml
ca_graph_refs: []
ca_sync_version: 1
```

Az üres `ca_graph_refs` nem hoz létre gráfot vagy élt; csak kijelöli a rendszer-owned, később stabil gráfazonosítókkal feltölthető helyet. A teljes él-metaadat — irány, típus, súly, bizonyosság, bizonyíték, audit és tagság — SQLite-ban él, nem YAML-objektumként.

## Projektmunkatér és automatikus projektgráf

A sikeresen létrehozott SQL-projekt saját `knowledge_projects` munkateret és hozzá stabil, DB-owned `project/<project_id>` gráfot kap. A Vault-szinkron a dokumentum ismert `project_id` értékéből fenntart egy rendszereredetű `projekt → contains → dokumentum` élt ebben a gráfban. Ez csak vetület: nem írja felül és nem törli a kézzel vagy adminból létrehozott epic-, task-, függőségi vagy hatáséleket.

Így egy projektindexből később természetesen felépíthető a `projekt → epic → task` szerkezet, miközben ugyanaz a task más — például `impact/production` — gráfban is tag maradhat.

## Dokumentummappa, DWG és külső források

Minden projektdokumentum saját mappába kerül. Ha melléklet, DWG, modell, PDF, kép, hang, videó vagy külső hivatkozás tartozik hozzá, a mappa szerződése:

```text
project-prj-2026-884/
  index.md
  .ca-assets.json
  assets/
    cad/cella-elrendezes.dwg
    preview/cella-elrendezes.png
```

A gazdag csatolmány-metaadat a `.ca-assets.json` sidecarban él, nem a frontmatterben. Ezért az Obsidian Properties nem alakítja `[object Object]` szöveggé. A manifest helyi fájlnál kizárólag a dokumentum saját mappáján belüli relatív útvonalat fogad el; külső GitHub, YouTube, Drive vagy más forrás `source: "external"` + HTTPS URI rekord. A rendszer a bináris fájlok tartalmát nem teszi RAG-szöveggé, viszont a típust, ikont, elérhetőséget, előnézetet és függőségeket indexeli, hogy a kártyán és a dokumentumnál megjeleníthető legyen.

## Típusos projekt-, epic- és task-kapcsolatok

A generált sablon üres, ember/agent által írható `CA:RELATIONS` blokkot tartalmaz. Ez wikilinkhez hasonló, de szigorúbb és adatbázisban karbantartott kapcsolatot jelöl:

```markdown
<!-- CA:RELATIONS:BEGIN v1 -->
## Saját típusos kapcsolatok

- contains → [[EPIC-003]] · graph: project/prj-2026-884
- depends_on → [[TASK-004]] · graph: project/prj-2026-884
- blocks ← [[TASK-018]] · graph: project/prj-2026-884
<!-- CA:RELATIONS:END -->
```

- `→` az aktuális jegyzetből kifelé, `←` az aktuális jegyzetbe befelé mutat.
- `↔` két párosított, külön tárolt irányított ívet hoz létre.
- Egy sor `graphs:` formában több gráfhoz is rendelhető; a csúcs és az él ettől nem másolódik.
- A Vault-sync csak regisztrált gráfhoz és éltípushoz enged szerzői élt létrehozni, és kizárólag az adott dokumentum `markdown_projection` eredetű kapcsolatait cseréli.

Az adminból vagy SQL-szinkronból létrehozott, DB-owned kapcsolat a kapcsolt Markdownba egy checksumos `CA:SYSTEM` blokkban jelenhet meg. Ez csak olvasható vetület: kézi módosításakor driftet jelez a rendszer, és a DB-t nem írja vissza a Markdown alapján.

## Következő fázisok

1. ERP/webalkalmazás eseményéből indított, hitelesített worker vagy admin API, amely a projekt létrehozása után hívja a generátort.
2. Generálási manifest és a SQL-tulajdonú mezők írási ownership-recordja; a Markdown törzs változatlan marad.
3. Pull kliens az Obsidian/Templater számára, amely ugyanazt a központi szolgáltatást használja. Ehhez a gatewayben külön, allowlistelt aktívprojekt-listázó szerződés kell; közvetlen SQL-kapcsolat az Obsidianból nem megengedett.
4. Kontrollált SQL-tulajdonú frontmatter drift-ellenőrzés, amely nem érinti a `CA:RELATIONS` szerzői blokkot vagy a szakmai Markdown-törzset.
