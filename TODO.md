# Teendők

Frissítve: 2026-08-23

## Következő prioritások

- [ ] **XYFlow munkatér átadhatósága:** dönts az explicit profil-visszaállításról, export/import funkcióról vagy felhasználói szintű szerveroldali szinkronról. A jelenlegi Model/Layout vászonállapot szándékosan csak a helyi böngészőtárban él.
- [ ] **CAD workspace host-integráció:** a `CadWorkspaceRibbon` és `CadContextUi` elemeket fokozatosan vezesd be a gráfoldalra. A jelenlegi `data-*` tesztazonosítók, billentyűparancsok, XYFlow-események és CAD-es vizuális arányok nem sérülhetnek; minden lépéshez célzott és vizuális regressziós ellenőrzés kell.
- [ ] **Személyre szabható CAD munkatér:** perzisztáld felhasználónként a ribbon-fülek, quick-access parancsok, nyitott/dokkolt panelek, megjelenítési profil és viewport-vezérlők beállításait. A publikus és admin nézetnek külön preferencia-scope kell.
- [ ] **TypeScript-irány:** rögzítsd a shared csomag és a host fokozatos TypeScript-migrációjának döntését (publikus prop-típusok, build és consumer-kompatibilitás), mielőtt a CAD UI API-ja tovább szélesedik.
- [ ] **Valós Obsidian-kör:** hozz létre sablonból új `Content/<gyűjtemény>/<slug>/index.md` csomagot, szerkeszd két ablakból, ellenőrizd a revision-konfliktust, majd futtasd a preview és apply Vault-szinkront.
- [ ] **Többgráfos szerzői UX:** valós kapcsolatokkal próbáld ki a `ca_graph_refs` és `CA:RELATIONS` szerzői utat, több gráf választóját, a publikus/private határt és mobilon a gráfmembránokat.
- [ ] **Asset-csomag ellenőrzése:** PNG, PDF, DWG és tiltott/hibás asset manifest tesztelése a dokumentum saját `assets/` mappájában; mobilon hosszú fájlnevek, képek, táblázatok és kódblokkok ne lógjanak ki.
- [ ] **Archiválási szerződés:** tervezd meg a Markdown-csomagok archiválását/törlését és a hozzá tartozó SQLite/RAG-vetület explicit, visszaállítható takarítását.
- [ ] **Nagy tartalomkészlet:** értékeld a szerveroldali cursor-lapozás, RAG-részletbetöltés és gráf-snapshot korlátok szükségességét.
- [ ] **Release-forrás:** a nagy, dirty munkafát témánként át kell nézni, majd a Vault-first, gráf, asset és cachejavításokat reprodukálható commitokba kell menteni. Ne használj vak resetet vagy távoli git pull-t.
- [ ] **Üzemeltetés:** dokumentáld az Nginx `sw.js` no-cache szabályt, a Tailscale SSH-alapú release folyamatot, valamint a SQLite snapshot- és release-retenciót.

## Csak explicit, külső migrációnál

- [ ] Külső vagy történeti Vault esetén előbb `npm run vault:migrate-content-packages` dry-run, majd dokumentumonkénti slug-/`document_id`-/frontmatter-diff jóváhagyása. Csak ezután futtatható az `:apply` parancs.
- [ ] Google Drive-ból érkező anyag ne legyen automatikus importforrás. Ha helyreállítás kell, a visszaállított fájlt előbb a `Content/` csomagszerződéshez kell igazítani és Vault preview-val validálni.

## Lezárt

- [x] A külön GitHubon kezelt `@szantoi/cad-cui-system` `v0.4.0` kiadása (`042e828`), majd a host reprodukálható frissítése a lockolt GitHub-függőségre; deployolható konfigurációba nem került `file:` hivatkozás.
- [x] A Graph ribbon első host-migrációja a közös `CadToolButton` primitívre, a meglévő gráf-specifikus működés megtartásával.
- [x] A shared package és a host ellenőrzése: 50 package teszt, 13 célzott host teszt, lint, production build és Playwright gráf-folyamat sikeres.
- [x] XYFlow-alapú PONT és RÉSZLETES grafikus megjelenítés bevezetése a projekt- és workflow-topológiák olvasási nézetéhez.
- [x] CAD-jellegű `MODEL` / `LAYOUT n` / `+` munkatérfülek, önálló panelkiosztásokkal.
- [x] Model/Layout profilonként elkülönített XYFlow mód, húzott csomópontpozíció és kameraállapot, hibás tárolt adat elleni védelemmel és böngészős regressziós teszttel.
- [x] A régi `KnowledgeBase/` és `Blog/` teszt/demó dokumentumok `Content/<gyűjtemény>/<slug>/index.md` csomagokba migrálása, Vault-lokális backup készítésével.
- [x] A normál szinkron Content-only lett; a legacy gyökerek fail-closed blokkolók, nem másodlagos importforrások.
- [x] A Markdown az elsődleges dokumentumforrás; SQLite/RAG/gráfvetület atomikusan a Vaultból frissül.
- [x] Admin Vault-szerkesztő revision-védelemmel; DB-s dokumentum-, mappa- és asset-módosító útvonalak lezárása.
- [x] `index.md` csomagok frontmatter nélküli fallback azonosítása a csomagmappa nevével, nem ütköző `index` sluggá.
- [x] Többgráfos ownership rögzítése: Markdown szerzői kapcsolatok, SQLite gráf-registry és `CA:SYSTEM` rendszer-vetület.
