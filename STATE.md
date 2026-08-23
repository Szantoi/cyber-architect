# Aktuális állapot

Frissítve: 2026-08-23

## Aktív runtime — Vault-first tartalom

- A kanonikus emberi tartalom az Obsidian-kompatibilis `Content/<gyűjtemény>/<slug>/index.md` Markdown-csomagokban van. Ide tartozik a törzs, frontmatter, wikilinkek és az opcionális `assets/` + `.ca-assets.json` csomag.
- A korábbi `KnowledgeBase/` és `Blog/` gyökerek anyaga átkerült `Content/` alá. A normál szinkron csak a `Content/` fát olvassa; ha régi gyökeret talál, `VAULT_LEGACY_ROOT_DETECTED` hibával megáll, így nem keletkezhet párhuzamos forrás.
- SQLite, RAG és a dokumentumhoz kötött keresési adatok Markdownból épített vetületek. A közvetlen DB-s cikk-, mappa- és asset-módosító végpontok `VAULT_AUTHORITATIVE` hibával lezártak.
- `presentation_profile: knowledge | article` a webes olvasói nézetet választja. A `content_type` az SQLite-kompatibilitási vetület, nem külön dokumentumtípus.

| Információ | Kanonikus tulajdonos | Szerep |
| --- | --- | --- |
| Dokumentumtörzs, frontmatter, wikilink, dokumentumhoz tartozó asset | Obsidian `Content/` csomag | Emberi szerzői forrás |
| Keresés, RAG, FTS, dokumentumlista | SQLite/RAG | Újraépíthető lekérdezési vetület |
| Taxonómia definíciói, ikonok, aliasok, smart collectionök | SQLite taxonómia-registry | Konfiguráció és felületi metaadat |
| Gráfdefiníció, éltípus, tagság, audit | SQLite gráf-registry | Többgráfos struktúra és kontroll |
| `CA:RELATIONS`, `ca_graph_refs` | Markdown | Szerzői gráfinput |
| `CA:SYSTEM` | SQLite → Markdown | Checksumos, olvasható rendszer-vetület |
| Workflow futásidő és eseménytörténet | SQLite Workflow v1 | Verziózott állapotgép |

## Vault-szinkron és szerkesztés

- CLI előnézet: `npm run sync:knowledge:check`; alkalmazás: `npm run sync:knowledge`.
- Az admin `GET/PUT /api/admin/vault/documents/:slug` a teljes nyers Markdownot szerkeszti revision-védelemmel. Mentés után a Vault → SQLite/RAG/gráfvetület frissül; hiba esetén a fájl visszaáll.
- `POST /api/admin/vault/sync` alapból dry-run. Éles vetületfrissítéshez `dry_run: false` és `confirm: APPLY_CANONICAL_VAULT_SYNC` kell.
- Új dokumentumot, új csomagot, áthelyezést vagy átnevezést Obsidianban, az `ObsidianTemplates/` sablonokból kell létrehozni, majd szinkronizálni.
- Az egyszeri külső/legacy átköltöztető parancsok: `npm run vault:migrate-content-packages` és `npm run vault:migrate-content-packages:apply`. Az alkalmazás Vault-lokális backupot készít, és csak sikeres migráció után távolítja el az eredeti legacy fájlt.

## `/graph` és többgráfos állapot

- A gráf-registry irányított, címkézett, súlyozott multigráf. Ugyanaz a dokumentum, projekt, epic, task vagy taxon több gráf tagja lehet másolás nélkül.
- Publikus API: `GET /api/knowledge/graphs`, `GET /api/knowledge/graphs/:graphId`, `POST /api/knowledge/graphs/:graphId/traverse`. Az admin API `/api/admin/graphs` alatt kezeli a privát gráfokat, kapcsolatokat és dokumentumkötéseket.
- A `CA:RELATIONS` blokk csak az adott Markdown-dokumentum szerzői éleit vetíti a registrybe. A DB-ből kezelt kapcsolatok olvasási `CA:SYSTEM` blokkot kaphatnak; emberi Markdown nem íródik felül a blokkhatáron kívül.
- A publikus és admin-preview adatvédelmi határ érvényes: privát csúcs vagy él csak hitelesített admin-preview módban jelenhet meg.

## XYFlow munkatérprofilok

- A `/graph` CAD-jellegű `MODEL` / `LAYOUT n` / `+` fülsávja külön panelkiosztásokat kezel helyi böngészőtárban. A kapcsolódó XYFlow panel két olvasási módot ad: **PONT** az áttekintéshez, **RÉSZLETES** a projekt-, workflow- és loop-követéshez.
- A Graph Flow munkatérben a megjelenítési mód, a húzott csomópontpozíciók és a kamera (pan/nagyítás) profilonként, gráfonként elkülönülnek. A tárolás kliensoldali; nem ír DB-gráfot, nem hoz létre relációt és nem kerül szinkronizálásra a Vaulttal.
- A visszaállítás `@xyflow/react` `defaultViewport`, `onNodeDragStop` és `onMoveEnd` API-kra épül. Hibás vagy régi tárolt állapot esetén a rendszer az alapelrendezést használja.
- A munkatérprofil címkéjén látható tooltip ezt az izolációt jelzi. A CAD UI általános építőelemei a külön `@szantoi/cad-cui-system` csomagban vannak; a host nem használ lokális `file:` függőséget.
- A közös csomag aktuális kiadása `v0.4.0`, GitHub commit `042e828` (`https://github.com/Szantoi/cad-cui-system`). A host lockolt feloldása `042e828a29d0af47dda91ff4ebd5fa78e5207fb7`.
- A host-specifikus parancs- és képességdefiníció a `src/components/graph/ui/CadCuiSystem.jsx` tulajdona; az általános vizuális komponensek a shared csomagból érkeznek a `GraphCadUi.jsx` kompatibilitási adapteren keresztül.
- A v0.4.0 első host-integrációja elkészült: a Graph ribbon tool-gombjai a közös `CadToolButton` primitívet használják, változatlan `data-*` tesztazonosítókkal, parancsokkal és XYFlow-viselkedéssel.

## Workflow v1

- A Workflow v1 a gráfhoz kapcsolódó, de attól külön DB-first állapotgép: `workflow_definitions`, immutable `workflow_versions`, lépések, transitionök, példányok és append-only események.
- A Markdown tudást és hivatkozást hordozhat, de nem kanonikus workflow-állapotot vagy futtatási transitiont.

## Munkatér és Drive

- Egy hordozható munkatér a Vaultból és annak opcionális `.cyberarchitect/portfolio.sqlite` adatbázisából áll. Egy Node-folyamat egy fizikai SQLite DB-t tart nyitva; külön Vault+DB pároshoz külön folyamat vagy újraindítás kell.
- A Google Drive nem tartalmi forrás: a normál Drive pull `CLOUD_PULL_DISABLED`. A Drive státusz a `Content/` fájlszámot mutatja; a régi Drive-helyreállító kód csak kompatibilitási/break-glass szerepben maradt.

## Ellenőrzött állapot

- A tényleges Vault előnézet 31 `index.md` dokumentumot talált hibamentesen, majd a vetületfrissítés 31 dokumentumot indexelt.
- Az XYFlow munkatérállapot célzott Vitest és Playwright ellenőrzése zöld: Model/Layout profilváltáskor a mód, a húzott csomópont és a kamera külön áll vissza. A teljes futás zöld: 95 tesztfájl, 517 sikeres teszt, 1 kihagyott. Az `npm run lint` és az `npm run build` is hibamentesen lefutott.
- A CAD CUI `v0.4.0` kiadásán 9 tesztfájlban 50 teszt, library build, demo build és `npm pack --dry-run` sikeres. A hoston 13 célzott Graph CAD teszt, célzott ESLint, production build és a Playwright gráf-folyamat is sikeres.

## Következő fejlesztési határ

- Valós Obsidian-szerkesztési és mobilos többgráfos ellenőrzés nagyobb tartalomkészlettel.
- Termékdöntés kell arról, hogy a jelenleg helyi XYFlow munkatérállapot kapjon-e explicit visszaállítás/export/import funkciót vagy felhasználói szintű szerveroldali szinkront.
- A következő CAD-lépés a `CadWorkspaceRibbon` és a `CadContextUi` fokozatos host-integrációja. A jelenlegi, vizuálisan érzékeny saját gráf-markup csak célzott teszt- és képernyőellenőrzés mellett váltható ki.
- Dokumentum-archiválás/törlés számára külön, explicit karbantartási folyamat kell: Vault-fájl eltávolítása nem töröl automatikusan SQLite/RAG-vetületet.
- A dirty munkafa témánkénti felülvizsgálata, backup-retenció és deploy-folyamat dokumentálása továbbra is kiadás előtti feladat.
