# Hordozható Vault-munkatér és SQLite tárolás

Ez az útmutató azt írja le, hogyan tartozhat egy Obsidian Vault-hoz a saját
Cyber-Architect SQLite-adattára. A cél az, hogy a Markdownok, a sablonok, a
csatolmányok, a taxonómia- és gráf-registry, valamint a RAG-vetület egy
egyértelműen kijelölt munkatérhez tartozzon.

## Ajánlott munkatérstruktúra

```text
CyberArchitect-Vault/
  Content/
    01_Tudastar/
      pelda-dokumentum/
        index.md
        assets/
        .ca-assets.json
  ObsidianTemplates/
  .obsidian/
  .cyberarchitect/
    portfolio.sqlite
    portfolio.sqlite-wal
    portfolio.sqlite-shm
    backups/
```

A `.cyberarchitect` nem Markdown-tartalom és nem Obsidian-frontmatter. A
rejtett mappa megakadályozza, hogy a DB-fájlok a dokumentumok közé vagy az
Obsidian fájlnézetébe keveredjenek. A Vault-szinkron kizárólag a semleges
`Content/` gyökeret járja be; minden dokumentum saját
`<gyűjtemény>/<slug>/index.md` csomag. A webes nézetet a dokumentum
`presentation_profile` mezője választja ki, nem a fizikai gyűjteménynév.
Ha `KnowledgeBase/` vagy `Blog/` gyökér marad a Vaultban, a sync
fail-closed hibával megáll, amíg az egyszeri csomagmigráció le nem fut.

## Egy munkatér beállítása

A `.env` fájlban add meg ugyanannak a munkatérnek a Vault- és az
adatkönyvtárát. Windows alatt is abszolút útvonalat használj; a perjeleket
írhatod `/` alakban.

```dotenv
CYBER_ARCHITECT_CONTENT_ROOT=C:/Knowledge/CyberArchitect-Vault
CYBER_ARCHITECT_WORKSPACE_DATA_DIR=C:/Knowledge/CyberArchitect-Vault/.cyberarchitect
```

Első indításkor a szerver létrehozza a `.cyberarchitect` mappát, ha még nem
létezik, majd ott nyitja meg vagy hozza létre a `portfolio.sqlite` adatbázist.
A napi mentések alapértelmezésben ugyanitt, a `backups/` alatt készülnek.

PowerShellben egy egyszeri helyi futtatáshoz:

```powershell
$env:CYBER_ARCHITECT_CONTENT_ROOT = 'C:/Knowledge/CyberArchitect-Vault'
$env:CYBER_ARCHITECT_WORKSPACE_DATA_DIR = 'C:/Knowledge/CyberArchitect-Vault/.cyberarchitect'
npm run server
```

Docker Compose alatt ugyanazt az elvet használd az **in-container** útvonalakkal:

```dotenv
CYBER_ARCHITECT_CONTENT_ROOT=/app/data/content
CYBER_ARCHITECT_WORKSPACE_DATA_DIR=/app/data/content/.cyberarchitect
```

A Compose alapértéke kompatibilitásból továbbra is `/app/data/portfolio.sqlite`.
Csak egy ellenőrzött mentés és a fenti környezeti profil beállítása után helyezd
át Vault-munkatérbe.

Az aktív adatbázis helyét és méretét ellenőrizheted:

```powershell
node server/cli/portfolio-cli.js status
```

## Feloldási sorrend

Egy futó szerver mindig egy SQLite-fájlt használ. A célfájl sorrendben így
választódik ki:

| Elsőbbség | Beállítás | Eredmény |
| --- | --- | --- |
| 1. | `SQLITE_DB_PATH` | Pontosan ezt a fájlt nyitja meg. |
| 2. | `CYBER_ARCHITECT_WORKSPACE_DATA_DIR` | `<könyvtár>/portfolio.sqlite`. Ajánlott Vault-munkatér profil. |
| 3. | `SQLITE_DATA_DIR` | `<könyvtár>/portfolio.sqlite`. Kompatibilitási beállítás. |
| 4. | egyik sincs | A régi alkalmazásbeli `data/portfolio.sqlite`. |

A relatív értékek az alkalmazás gyökeréhez képest oldódnak fel, ezért a
CLI, a szerver és a mentőprogram ugyanazt a fájlt fogja használni.

## Több projekt és több fizikai munkatér

Egy munkatér-adatbázisban tetszőleges számú logikai projekt lehet. A
`knowledge_projects`, a `project/<id>` gráfok, a projekt–epic–task csúcsok és
a kapcsolatok ugyanabban az SQLite-adatbázisban, egymástól stabil azonosítókkal
elválasztva élnek. Ez a normál módja annak, hogy egy szerverrel több projekten
dolgozz.

A Tudástár szűrősávjában a **Projekt / munkatér** választó a publikus
projektkatalógusból töltődik. A választás `project_id` URL-paraméterként is
megosztható, és a lista, valamint a RAG-keresés ugyanarra a projektre szűkül.
Az API a `project_id` formátumot használja; kompatibilitásból a
`/api/knowledge/search` a korábbi `projectId` paramétert is fogadja.

Két teljesen független Vault + SQLite munkatérhez két külön szerverfolyamat
szükséges (más porttal), vagy a szervert le kell állítani és másik `.env`
profillal kell újraindítani. Az alkalmazás egy folyamaton belül szándékosan nem
váltogat adatbázist, mert a szolgáltatások és a migrációk egyetlen, konzisztens
SQLite-kapcsolatra épülnek.

## Egységes dokumentumcsomagra átállás

A régi `KnowledgeBase/` és `Blog/` fákat egyszer, ellenőrzötten kell
`Content/<gyűjtemény>/<slug>/index.md` csomagokra átköltöztetni. A migrátor
megőrzi a Markdown törzsét és az ismert frontmattert, egységesíti a csomaghoz
tartozó `ca_*`/taxonómia mezőket, Vault-lokális backupot készít, majd csak
sikeres futás után távolítja el a régi másolatot.

```powershell
# Előnézet: nem módosít fájlt
npm run vault:migrate-content-packages

# Alkalmazás: timestampes Vault-lokális mentést készít
npm run vault:migrate-content-packages:apply
```

Ha egy fájl frontmattere hibás, egy célcsomag már létezik, vagy slug/`document_id`
ütközés van, a migrátor nem ír át bizonytalan dokumentumot. Javítsd a
frontmattert vagy oldd fel az ütközést, majd ismét futtasd az előnézetet.

## Mentés és átköltözés

Készíts pillanatképet az aktív adatbázisról:

```powershell
node server/cli/portfolio-cli.js backup
```

A mentés SQLite `VACUUM INTO` pillanatkép, ezért WAL módban is konzisztens.
A rendszer sosem helyezi át automatikusan a meglévő adatbázist új Vault-ba:
ez elkerüli, hogy egy rossz környezeti változó üres adatbázist hozzon létre.

Biztonságos átköltözéskor előbb készíts és ellenőrizz mentést, állítsd le a
szervert, másold a jóváhagyott pillanatképet az új
`.cyberarchitect/portfolio.sqlite` helyre, majd az új környezeti profillal
indítsd el. Az eredeti adatbázist hagyd meg, amíg az új munkatér `status` és
Vault-sync ellenőrzése sikeres.

## Szinkronizációs szabály

Ne szinkronizáld az élő `portfolio.sqlite`, `-wal` vagy `-shm` fájlokat
Obsidian Sync, OneDrive, Dropbox, Git vagy más fájlszinkron szolgáltatáson át.
Ezek nem hordozható dokumentumok, és a többgépes, párhuzamos megnyitás
sérülést vagy inkonzisztens RAG-/gráfvetületet okozhat. A Vault-tal együtt
csak a lezárt, ellenőrzött mentést kezeld; a `.cyberarchitect/**` könyvtárat
zárd ki a külső szinkronból.

Kapcsolódó leírás: [rendszerarchitektúra](SYSTEM_ARCHITECTURE.md).
