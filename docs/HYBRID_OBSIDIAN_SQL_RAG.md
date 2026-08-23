# Hibrid Obsidian–SQL GraphRAG

Ez a modul az Obsidian Markdown vaultot tartja meg a humán, szakmai tartalom kanonikus forrásaként. Az SQL/ERP a hozzá kötött üzleti entitásazonosítók, kötelező strukturális mezők és új dokumentumvázak igazságforrása. Az explicit `[[wikilink]]` hivatkozásokat, a szerzői `CA:RELATIONS` blokkokat és az admin által kezelt, DB-first többrétegű gráfot elkülönített eredettel kezeli. A dokumentumokat heading-alapú chunkokra bontja, majd a kiválasztott dokumentumokhoz kötött, allowlistelt operatív tényeket fűzi a helyi LLM kontextusához. Az SQLite és a RAG-index továbbra is a vaultból származó vetület.

## Kanonikus ownership-határ

| Terület | Forrás | Megjegyzés |
| --- | --- | --- |
| Projektazonosító, név, létrehozási idő és generált váz | SQL/ERP | csak allowlistelt gateway-szerződésen át |
| Szakmai Markdown-törzs, sima wikilink és szerzői kapcsolat | Obsidian vault | a rendszer nem írja felül |
| DWG, PDF, média, külső hivatkozás és csatolmányfüggőség | dokumentummappa + `.ca-assets.json` | Obsidian-safe sidecar, nem nested frontmatter |
| Taxon-dimenzió, term, ikon, szín, alias, smart collection | SQLite taxonómia-registry | adminból konfigurálható |
| Saját gráf, éltípus, él-metaadat, tagság és audit | SQLite gráf-registry | admin/SQL által kezelt |
| `CA:SYSTEM` olvasható kapcsolati vetület | DB → Markdown | checksumos, csak rendszer által írható |
| FTS, embedding, RAG és keresési eredmény | SQLite/RAG | index- és lekérdezési vetület |

Ez nem két konkurens igazságforrás: a rendszer mindig az adott adattípus tulajdonosát használja, majd ellenőrzött vetületet készít.

## Biztonsági határ

A hibrid kontextus végpontja kizárólag hitelesített admin kérésből érhető el. A publikus `/api/docs`, `/api/knowledge/search` és `/api/rag/article-chunks` útvonalak nem kérdezik és nem fedik fel a gráf- vagy SQL-indexet.

Az `sql_project_id` az üzleti összekapcsoló kulcs; nem SQL-kód. A modul csak három fact profile-t ismer:

- `project_snapshot`
- `bom_availability`
- `production_risks`

Nyers SQL, táblanév, kapcsolatstring és tetszőleges fact profile nem kerülhet sem frontmatterbe, sem HTTP-kérésbe. Éles telepítésben a gateway egy külön belső szolgáltatás legyen read-only adatbázis-szerepkörrel, VPN/mTLS vagy azzal egyenértékű hálózati védelemmel.

## SQL-vezérelt projektindexek

Új SQL-hoz kötött projektnél a Push út az alapértelmezett: az üzemi rendszer eseménye a központi generátort hívja, amely a validált `project_snapshot` adataiból create-only módon létrehozza a `Content/02_SQL_Projects/<slug>/index.md` fájlt. A generált `sql_project_id`, `document_id`, `presentation_profile: knowledge`, a lapos `sql_binding_*`/`sql_fact_profiles` mezők, láthatóság, sablonverzió, valamint az üres `ca_graph_refs` és a `ca_sync_version: 1` emberi kéz nélkül kerül a frontmatterbe. A `ca_graph_refs` csak stabil gráfazonosító-lista; a teljes gráf és él-metaadat nem frontmatterben él.

```powershell
cd CyberArchitectReact
node server/scripts/generateSqlMarkdown.js PRJ-2026-884
```

A generátor egy DB-owned `knowledge_projects` munkateret és `project/<project_id>` gráfot is létrehoz vagy biztosít. A szinkron a projektnode és az indexdokumentum közé `contains` vetületi élt tart fenn; ez nem érinti a külön, saját epic/task/hatás relációkat. A generator létező fájlt nem ír felül, ezért a már megkezdett mérnöki törzs biztonságban marad. A Pull/Templater út későbbi kliensinterfész lehet ugyanehhez a központi szerződéshez; közvetlen SQL-kapcsolatot nem kaphat. Részletes szerződés: `docs/SQL_DRIVEN_MARKDOWN_GENERATION.md`.

## Kanonikus Obsidian vault

A `CYBER_ARCHITECT_CONTENT_ROOT` által megadott szerveroldali mappa az egyetlen tartalmi írói hely. A fejlesztői alapérték a workspace `CyberArchitect/` mappája; éles környezetben ezt a teljes Obsidian vaultot írható bind mounttal add a generáló workernek. A normál korpusz kizárólag a semleges `Content/` gyökér: minden dokumentum `Content/<gyűjtemény>/<slug>/index.md` csomagban él. A blog és tudástár nem eltérő dokumentumtípus, csak `presentation_profile` szerinti webes nézet. Az `.obsidian/`, `ObsidianTemplates/` és a többi vault-beállítás nem tartalomforrás.

A történeti `KnowledgeBase/` és `Blog/` gyökerek nem olvashatók normál szinkronforrásként. Észlelésük `VAULT_LEGACY_ROOT_DETECTED` hibával megállítja az indexelést; egyszeri átköltöztetéshez a backupos `vault:migrate-content-packages` migrátort kell használni.

Az adott Vault-hoz saját, rejtett SQLite-munkatér is kapcsolható:
`CYBER_ARCHITECT_WORKSPACE_DATA_DIR=<vault>/.cyberarchitect`. Ide kerül a
`portfolio.sqlite`, a WAL mellékfájljai és a helyi backupok; a crawler ezt nem
olvassa. Egy adatbázisban több logikai projekt és projektgráf kezelhető, de egy
szerverfolyamat egyetlen fizikai munkatér-adatbázist használ. Az élő SQLite
WAL-fájlokat Obsidian Sync/OneDrive/Dropbox/Git szinkronból ki kell zárni.
Részletek: [Workspace tárolás](WORKSPACE_STORAGE.md).

A normál feldolgozó útvonal soha nem olvas Google Drive-ból és nem merge-öl felhős konfliktusfájlokat. A régi `/api/admin/drive/sync` végpont szándékosan `CLOUD_PULL_DISABLED` választ ad. A felhő legfeljebb külön kezelt export-, mentési vagy hibajavítási cél lehet.

## Obsidian sablonok és dokumentumcsomagok

Az aktív Vault saját `ObsidianTemplates/.ca-template-catalog.json` katalógusában szerepelnek a központi sablonok. A jelenlegi készletek a tudásjegyzetet, SQL-projektindexet, projekt–epic–task modellt, döntési jegyzetet és a csatolmánycsomagot mutatják be. Az admin **Vault Templates** nézete ezeket a fájlokat kezeli; a `ca_sql_project_index` törzse a következő SQL-generálásnál lép életbe. A hagyományos `Hybrid Manufacturing Knowledge Note.md` és `Hybrid Meeting Note.md` kompatibilis legacy kiindulópontok maradnak.

Az `ObsidianTemplates` nem a dokumentumgyökerek alatt van, ezért a crawler nem indexeli cikként. SQL-vezérelt projekthez a frontmattert ne másold kézzel: a központi generátor tulajdonolja. A belső dokumentumoknál maradjon a `visibility: private`, `published: false` és `classification: internal` alapérték, amíg a publikálás nem tudatos döntés.

Minden csatolmányos dokumentum saját mappát használ:

```text
dokumentum-slug/
  index.md
  .ca-assets.json
  assets/
    cad/gyartocella.dwg
    preview/gyartocella.png
```

A `.ca-assets.json` a fájltípust, megjelenítési ikont, elérhetőséget, előnézetet és függőségeket tárolja. Helyi rekord kizárólag ebben a mappában lévő relatív fájlt érhet el; külső GitHub, YouTube, Drive vagy egyéb forrás `source: "external"` + HTTPS URI. A bináris nem válik RAG-szöveggé, de a kártya és a dokumentum asset-jelvényt, ikont és biztonságos megnyitási hivatkozást kaphat.

## Konfigurálható taxonómia és Obsidian Properties

A három fő kategória nem a felületben vagy beágyazott YAML-ban van rögzítve. A SQLite taxonómia-registry kezeli a megjelenített nevet, ikont, színt, termeket, aliasokat, kapcsolatokat, szűrhetőséget, csoportosíthatóságot és a smart collection szabályait. A kezdeti három technikai dimenzió `industry`, `technology` és `audience_role`; frontmatter-kulcsaik `tax_industry`, `tax_technology` és `tax_audience_role`. A `pain_point` további, adminból aktiválható dimenzió. A dokumentum viszont saját frontmatterében hordozza a tényleges hozzárendelést:

```yaml
taxonomy_schema: 2
tax_industry: [gyartas]
tax_technology: [obsidian, graph-rag]
tax_audience_role: [folyamatmernok]
tags: [ca/industry/gyartas, ca/technology/obsidian]
```

Ezek mind Obsidian-native, legfelső szintű listamezők. Az értékek stabil ASCII term-slugok; a magyar címke és az ikon az admin által karbantartott registryből jön. Ne használd az új fájlokban a nested `dimensions` objektumot, és az Obsidian "megjelenítés eként: text" párbeszédében ne konvertáld a meglévő objektumot szöveggé. A régi `dimensions` szerződés csak átmeneti olvasási kompatibilitás, biztonságos dry-run/backup migrátorral.

## DB-first, irányított többrétegű gráf

A rendszer formális modellje irányított, címkézett, súlyozott multigráf. Egy él `e = (u, v, τ, w, c, p)`: forráscsúcs, célcsúcs, éltípus, súly, bizonyosság és proveniencia. Egy dokumentum, SQL-projekt, epic, task vagy taxon globális, stabil csúcsazonosítóval több gráf tagja lehet; a tagság nem másolat. Azonos csúcspár között több, különböző jelentésű él megengedett.

Az admin a Graph Controlban kezeli a saját gráfokat, csúcsokat, éltípusokat, színeket, ikonokat, láthatóságot és M:N tagságokat. Éltípusonként beállítható az engedélyezett forrás- és célcsúcstípus, az inverz típus, az önhurok, az alapértelmezett súly/bizonyosság/költség, a láthatóság és az aktív állapot; a multigráfmodell a párhuzamos éleket alapértelmezetten megengedi.

Minden tárolt kapcsolat irányított ív:

- `A → B`: egy állított él;
- `A ↔ B`: két párosított, külön tárolt ív közös `relation_group_id` alatt;
- `contains` ↔ `part_of`: lehet inverz nézet, de ez nem azonos két független, kétirányúan bizonyított állítással.

### Markdown-kapcsolati szerződés

Az ember vagy agent a sima `[[wikilink]]` mellett a következő, szerzői blokkban írhat típusos kapcsolatot:

```markdown
<!-- CA:RELATIONS:BEGIN v1 -->
## Saját típusos kapcsolatok

- depends_on → [[TASK-004]] · graph: project/prj-2026-884
- blocks ← [[TASK-018]] · graph: project/prj-2026-884
- related_to ↔ [[EPIC-002]] · graphs: project/prj-2026-884, impact/production
<!-- CA:RELATIONS:END -->
```

Az import a blokkot validálja, majd csak az adott dokumentumhoz tartozó `origin: markdown_projection` éleket cseréli. A `CA:RELATIONS` blokkot a rendszer sosem generálja vagy írja felül.

Az adminból vagy SQL-szinkronból létrehozott kapcsolat DB-tulajdonú. A rendszer a kapcsolt valódi vault-Markdownokba csak egy checksumos, olvasható `CA:SYSTEM` blokkot vetít; a forrásoldal `→`, a céloldal `←` jelölést kap. Ha ezt a blokkot kézzel módosítják, drift-hiba keletkezik, ezért nincs néma felülírás. A cél, amelyhez nincs valódi Markdown-fájl, a DB-gráfban ettől még érvényes csúcs marad, csak nem kap hamis wikilinket.

### Biztonságos gráflekérdezés

A publikus, csak publikus láthatóságú gráfokhoz a következő végpontok érhetők el:

```text
GET  /api/knowledge/graphs
GET  /api/knowledge/graphs/:graphId
POST /api/knowledge/graphs/:graphId/traverse
```

Az admin ugyanennek a privát változatát használja a `/api/admin/graphs` alatt. A bejárás deklaratív, Zod-validált AST: irány (`outbound`, `inbound`, `both`), engedélyezett éltípusok, csúcstípusok, eredet, időpont és minimum bizonyosság szűrhető. Nyers SQL vagy JavaScript nem küldhető; a mélység legfeljebb 6, a csúcsok száma legfeljebb 250.

## Vault → SQLite/RAG indexelés

```powershell
cd CyberArchitectReact
npm run sync:knowledge:check
npm run sync:knowledge
```

A preview, majd az apply a konfigurált Vault kizárólagos `Content/` Markdownjait szinkronizálja a portál adattárával, és ugyanabban a futásban felépíti a privát `hybrid_rag_*` indexet:

1. YAML frontmatter validálás és hash;
2. heading-alapú chunkolás + FTS5/BM25 index;
3. Obsidian `[[wikilink]]` és a kompatibilis frontmatter-kapcsolatok élei;
4. `sql_project_id` és az Obsidian-native `sql_binding_*`/`sql_fact_profiles` normalizálása;
5. taxon-slugok, aliasok és relációs hozzárendelések feloldása;
6. sima wikilinkek és `CA:RELATIONS` blokkok validálása, szerzői gráfvetület frissítése;
7. `project_id` esetén projekt-munkatér és `projekt → contains → dokumentum` vetület fenntartása;
8. `.ca-assets.json` metaadatainak, elérhetőségének és függőségeinek indexelése;
9. feloldott linkek és backlinkek összehangolása.

A CLI csak akkor ír az SQLite-ba, ha a teljes vault előellenőrzése hibamentes: hibás frontmatter, duplikált slug, duplikált `document_id` vagy útvonal-azonosító esetén egyetlen rekord sem frissül. Ez a fail-closed működés megakadályozza, hogy egy konfliktusmásolat „utolsó fájl nyer” elven átvegye az igazság szerepét.

Az admin felületen ugyanez a **VAULT / OBSIDIAN → SQLITE + RAG** előnézet/alkalmazás művelet. A CMS- és MCP-oldali közvetlen cikkírás szándékosan le van tiltva; a kivétel a szűk, SQL-vezérelt create-only generátor. Emberi szerkesztéshez a vaultban módosítsd a Markdown-törzset, aztán indexelj.

Egy vault-fájl törlése nem töröl automatikusan SQLite- vagy RAG-adatot. Az archiválás/törlés külön, kifejezetten jóváhagyott karbantartási művelet marad, így egy Obsidian- vagy fájlrendszerhiba nem okozhat csendes adatvesztést.

## Lokális snapshot pilot

Éles ERP-kapcsolat nélkül is tesztelhető a teljes retrieval út. Admin tokennel tölthető fel egy rövid élettartamú, profilokra bontott lokális snapshot:

```powershell
$headers = @{ "x-admin-token" = "<ADMIN_JWT>" }
$body = @{
  facts = @{
    project_snapshot = @{ status = "ELŐKÉSZÍTÉS"; as_of = "2026-08-20T10:00:00Z" }
    bom_availability = @{ shortage_count = 2; available_ratio = 0.94 }
  }
  as_of = "2026-08-20T10:00:00Z"
  expires_at = "2026-08-20T12:00:00Z"
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Put `
  -Uri "http://localhost:3001/api/admin/hybrid-rag/sql-snapshots/PRJ-2026" `
  -Headers $headers -ContentType "application/json" -Body $body
```

A snapshot csak a helyi pilot és retrieval út számára való. Valós gyártási, pénzügyi vagy személyes adatot ne tárolj a publikus portfólió adatbázisában; a SQL-vezérelt generátor soha nem használhatja ezt a snapshotot strukturális igazságforrásként.

## Belső LLM-kontektszolgáltatás

```powershell
$headers = @{ "x-admin-token" = "<ADMIN_JWT>" }
$body = @{ query = "Milyen BOM-kockázat akadályozza a projektet?"; graph_depth = 1 } | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3001/api/admin/hybrid-rag/context" `
  -Headers $headers -ContentType "application/json" -Body $body
```

A válasz `chunks`, `graph`, `sql_context` és `llm_context` mezőt ad. Az utóbbi a helyi modellnek átadható, de a modellnek nem ad adatbázis- vagy eszközjogosultságot. Minden SQL tényhez tartozik `source`, `as_of`, `availability` és stale/unavailable jelzés.

A tényleges gráf szemrevételezéséhez:

```text
GET /api/admin/hybrid-rag/graph/:slug?depth=1
```

## Éles SQL fact gateway

Konfiguráld a `.env` fájlban az alábbi értékeket:

```dotenv
HYBRID_SQL_FACT_GATEWAY_URL=https://internal.example.local/rag/facts
HYBRID_SQL_FACT_GATEWAY_TOKEN=<secret-from-secret-store>
HYBRID_SQL_FACT_GATEWAY_TIMEOUT_MS=4000
```

A gateway kizárólag ezt a szerződést kapja:

```json
{
  "project_id": "PRJ-2026",
  "fact_profiles": ["project_snapshot", "bom_availability"]
}
```

Válaszul profilokra bontott `facts`, `as_of` és opcionális `expires_at` érkezik. Gateway hiba esetén a retrieval rendszer csak akkor esik vissza helyi snapshotra, ha ilyen létezik; különben az LLM-kontekstus kifejezetten `unavailable` állapotot jelez. Ez a fallback nem vonatkozik a SQL-vezérelt Markdown-generálásra.
