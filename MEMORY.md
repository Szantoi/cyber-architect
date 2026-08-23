# Projektmemória

Ez a fájl a következő fejlesztési körök tartós technikai kontextusa. A részletes indoklás a `docs/` leírásaiban és az ADR-ekben van.

## Tartós ownership-szabályok

- **Vault-first tartalom:** a humán olvasásra és szerkesztésre szánt anyag, a YAML frontmatter, a sima `[[wikilink]]` és a dokumentumhoz kötött csatolmányok a Vault `Content/<gyűjtemény>/<slug>/index.md` csomagjában élnek. Ez az egyetlen normál tartalmi írói hely.
- **Vetület, nem konkurens forrás:** a SQLite `blog_posts`, a `hybrid_rag_*` táblák és a keresési/indexelési rekordok a Vaultból felépített, lekérdezési célú vetületek. A közvetlen DB-s dokumentum-, mappa- és asset-író API-k fail-closed `VAULT_AUTHORITATIVE` választ adnak.
- **Régi gyökerek:** a `KnowledgeBase/` és `Blog/` nem kanonikus. A szinkron észleli őket és megáll; a `vault:migrate-content-packages` parancs használható egyszeri, backupos átköltöztetésre. A jelenlegi projektkészlet már `Content/` alatt van.
- `presentation_profile: knowledge | article` az olvasói megjelenítést vezérli. A `content_type: knowledge | blog` csak kompatibilitási SQLite-vetület; nem határozza meg a fájl helyét vagy ownershipét.

## Obsidian-dokumentumcsomag

- Egy dokumentum mappája tartalmazza az `index.md`-t, opcionálisan az `assets/` könyvtárat és a `.ca-assets.json` sidecart. A binárisok nem kerülnek RAG-szövegként az indexbe.
- Ha egy csomag `index.md` fájlja még nem rendelkezik frontmatterrel, az import stabil fallback slugként a csomagmappa nevét használja, nem az `index` nevet.
- Az új frontmatter lapos scalar/list tulajdonságokat használ. Taxon-hozzárendelés: `tax_*`; a gazdag taxonómia-registry (címke, ikon, alias, szín, smart collection) SQLite-tulajdon.
- Külső asset csak biztonságos HTTPS hivatkozás lehet; helyi asset útvonala relatív és a saját dokumentummappán belül marad.

## Többgráfos modell

- A dokumentum saját, ember által szerzői adata a sima `[[wikilink]]`, a lapos `ca_graph_refs` lista és a `CA:RELATIONS` blokk. Egy dokumentum több stabil gráfazonosítóra is hivatkozhat.
- A gráfdefiníciók, csúcsok, éltípusok, M:N tagságok, láthatóság, súly/bizonyosság, audit és a futtatási korlátok a SQLite gráf-registry tulajdonai. Ez nem ellentéte a Vault-first tartalomnak: más doménhez tartozó kanonikus adat.
- A `CA:SYSTEM` checksumos, DB által generált olvasási vetület. Kézi drift esetén a rendszer fail-closed; a `CA:RELATIONS` blokkot soha nem írja felül.
- A public `/graph` csak publikálható csúcsokat és gráfadatot ad ki. Az admin-preview külön, hitelesített nézet.

## Workflow v1

- A workflow külön DB-first futásidő-domén: verziózott definíciók, lépések, transitionök, guardok, példányok és append-only események SQLite-ban élnek.
- Egy workflow egy `graph_id` kontextushoz kapcsolódik, de a generikus wikilink vagy `CA:RELATIONS` sor nem válik futtatható transitionné.
- Markdownban csak a lapos `ca_workflow_definition_ref` és `ca_workflow_graph_ref` hivatkozás, magyarázat és kapcsolódó tudás szerepelhet.

## XYFlow és CAD-jellegű munkaterek

- A publikus gráfmunkatér olvasási vászna a `src/components/graph/XYFlowDisplayCanvas.jsx`; a `DirectedMultigraphCanvas` a DB-first multigráf adaptere. A PONT és RÉSZLETES mód csak a megjelenítési sűrűséget változtatja, nem módosít gráf- vagy workflow-adatot.
- A `MODEL` / `LAYOUT n` / `+` munkatérfülek saját Dockview panelkiosztást tárolnak a `graph-workspace-layouts:v1` böngészőtárban. A Graph Flow panel módja profilonként és gráfonként külön kulcsot kap: `directed-multigraph-display:workspace:<profileId>:<graphId>:v2`.
- A húzott csomópontpozíció és a kameraállás külön, verziózott `:canvas-state:v1` JSON-állapot. Formája `{ version: 1, positions, viewport }`; legfeljebb 300 pozíciót fogad el, validálja a koordinátákat, a zoomot `0.12..2.5` közé szorítja, hibás `localStorage`-adatnál pedig biztonságosan alapelrendezésre esik vissza.
- A profilváltás újrainicializálja az XYFlow vásznat, ezért a Model és minden Layout külön módot, csomópontelrendezést és kameraállást kap. A Graph Management és a Workflow Studio nem használja ezt a munkatér-specifikus vászonállapotot; saját szemantikájuk megmarad.
- A generikus CAD UI primitívek kanonikus forrása a külön GitHub-repozitóriumú `@szantoi/cad-cui-system`: `https://github.com/Szantoi/cad-cui-system`. Az aktuális kiadás `v0.4.0`, commit `042e828`; a host lockfájlja ezt a konkrét revisiont rögzíti. Fejlesztői `file:` hivatkozás nem kerülhet kiadási konfigurációba.
- A csomag renderer-, router-, Dockview- és CAD-motor-független. A host birtokolja a doménállapotot, a jogosultságot, a navigációt és a parancsok végrehajtását; a közös komponensek kontrollált state-et és callbackeket fogadnak.
- A `CadCuiRuntime` az egységes parancs-registry, csoportosítás, állapot- és jogosultság-/letiltási feloldás helye. A ribbon, quick-access sáv, parancspaletta és kontextusmenü új funkciói ebből a közös definícióból épüljenek fel.
- Az új, konfigurálható munkatér-elemek: `CadWorkspaceRibbon`, `CadNavigationBar`, `CadVisualStylePicker`, `CadViewportScalePicker` és `CadSelectionSetPanel`. Új CAD-króm komponenst először ebben a csomagban kell kialakítani, majd kiadás után a hosthoz kapcsolni.
- A gráfoldal átmeneti kompatibilitási rétege a `src/components/graph/ui/GraphCadUi.jsx`: ez importálja a közös stílust és reexportálja a host által használt CAD-primitíveket. A Graph ribbon tool-gombjai már a közös `CadToolButton` elemet használják; a gráf-specifikus DOM-ot csak fokozatosan szabad tovább migrálni, hogy az XYFlow-, billentyűzetes és tesztazonosítós viselkedés megmaradjon.

## Üzemeltetési szerződés

- Ellenőrzés: `npm run sync:knowledge:check`; alkalmazás: `npm run sync:knowledge`. Az alkalmazás a teljes `Content/` előellenőrzése után, atomikusan frissíti a SQLite/RAG/gráfvetületeket.
- Az admin szerkesztő a teljes nyers Markdownot olvassa és írja optimista SHA-256 revision-védelemmel. Létrehozás, átnevezés és áthelyezés Obsidianban, a sablonokból történik; ezután szinkron szükséges.
- A Google Drive normál pull útja le van tiltva (`CLOUD_PULL_DISABLED`). A Drive legfeljebb nem kanonikus, kontrollált tükör- vagy helyreállítási cél.
- A `.cyberarchitect/portfolio.sqlite`, `-wal` és `-shm` fájlokat nem szabad Obsidian Sync, OneDrive, Dropbox vagy Git segítségével élőben szinkronizálni.

## Nyitott, de nem blokkoló feladatok

- Valós, nagyobb Vault-készleten ellenőrizni a mobilos többgráfos navigációt, a `CA:RELATIONS` szerzői munkafolyamatát és a dokumentumcsomag assetjeit.
- Több teljesen független Vault + SQLite munkatérhez továbbra is külön szerverfolyamat vagy kontrollált újraindítás kell; egy folyamat egy fizikai SQLite DB-t kezel.
 
