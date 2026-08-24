import { defineCadCuiSystem } from '@szantoi/cad-cui-system';

// The framework lives in the shared package. This thin adapter intentionally
// keeps application-specific panel IDs, labels and capability rules local.
export {
  CadCuiCommandPalette,
  CadCuiContextMenu,
  CadCuiCustomizer,
  CadCuiProvider,
  CadCuiQuickAccess,
  CadCuiRibbon,
  defineCadCuiSystem,
  loadCadCuiState,
  sanitizeCadCuiState,
  saveCadCuiState,
  selectCadCuiCommands,
  useCadCui,
  useCadCuiCommand
} from '@szantoi/cad-cui-system';

const EMPTY_LIST = Object.freeze([]);

export const CAD_CUI_STATE_VERSION = 1;
export const CAD_CUI_STORAGE_KEY = 'graph-cui-preferences:v1';

export const GRAPH_CUI_SYSTEM = defineCadCuiSystem({
  id: 'graph-workspace',
  version: CAD_CUI_STATE_VERSION,
  storageKey: CAD_CUI_STORAGE_KEY,
  defaults: {
    activeTab: 'view',
    hiddenCommandIds: EMPTY_LIST,
    accentMode: 'spectrum',
    density: 'regular',
    detail: 'guided',
    quickAccessIds: ['workspace.panels', 'workspace.search', 'view.layers', 'view.inspector']
  },
  calibration: {
    accentModes: [
      { id: 'spectrum', label: 'SPEKTRUM', color: '#00fbfb', detail: 'Fülönként eltérő CAD-szín' },
      { id: 'cyan', label: 'CIÁN', color: '#00fbfb', detail: 'Egységes rendszer-szín' },
      { id: 'magenta', label: 'MAGENTA', color: '#ff00ff', detail: 'Műveleti fókusz' },
      { id: 'plasma', label: 'PLAZMA', color: '#80ff00', detail: 'Analitikai fókusz' }
    ],
    densities: [
      { id: 'compact', label: 'TÖMÖR', detail: 'Rövidebb sorok, több munkatér' },
      { id: 'regular', label: 'EGYENSÚLY', detail: 'Olvasható információs sűrűség' }
    ],
    details: [
      { id: 'focus', label: 'FÓKUSZ', detail: 'Csak címek és állapotok' },
      { id: 'guided', label: 'INFORMATÍV', detail: 'Rövid magyarázatok is látszanak' }
    ]
  },
  panels: [
    { id: 'graph-model-space', componentKey: 'modelSpace', title: 'MODELTÉR', icon: 'network', accent: '#00fbfb', width: 960, height: 680, defaultPlacement: 'root', locked: true },
    { id: 'graph-workspace-manager-panel', componentKey: 'workspaceManager', title: 'PANELEK', icon: 'panels', accent: '#00fbfb', width: 486, height: 610, defaultPlacement: 'floating', floatingPosition: { x: 92, y: 48 }, utility: true },
    { id: 'graph-search-panel', componentKey: 'search', title: 'KERESŐ', icon: 'search', accent: '#80ff00', width: 620, height: 620, defaultPlacement: 'floating', floatingPosition: { x: 74, y: 82 } },
    { id: 'graph-ribbon-panel', componentKey: 'ribbonSettings', title: 'SZALAG', icon: 'palette', accent: '#b86dff', width: 356, height: 620, defaultPlacement: 'floating', floatingPosition: { x: 108, y: 78 } },
    { id: 'graph-explorer-panel', componentKey: 'explorer', title: 'EXPLORER', icon: 'folder-tree', accent: '#00fbfb', width: 304, height: 620, defaultPlacement: 'left', floatingPosition: { x: 24, y: 54 } },
    { id: 'graph-layers-panel', componentKey: 'layers', title: 'RÉTEGEK', icon: 'layers', accent: '#ff55d7', width: 318, height: 520, defaultPlacement: 'floating', floatingPosition: { x: 20, y: 58 } },
    { id: 'graph-flow-panel', componentKey: 'flowView', title: 'XYFLOW NÉZET', icon: 'network', accent: '#80ff00', width: 860, height: 650, defaultPlacement: 'floating', floatingPosition: { x: 52, y: 72 } },
    { id: 'graph-properties-panel', componentKey: 'properties', title: 'INSPEKTOR', icon: 'settings', accent: '#4bc8ff', width: 342, height: 520, defaultPlacement: 'right', floatingPosition: { x: 118, y: 60 } },
    { id: 'graph-traversal-panel', componentKey: 'traversal', title: 'ÚTVONALAK', icon: 'route', accent: '#80ff00', width: 430, height: 570, defaultPlacement: 'floating', floatingPosition: { x: 96, y: 108 } },
    { id: 'graph-admin-panel', componentKey: 'admin', title: 'SZERKESZTŐ', icon: 'network', accent: '#ff00ff', width: 430, height: 660, defaultPlacement: 'floating', floatingPosition: { x: 80, y: 40 }, adminOnly: true }
  ],
  // The ribbon reads as a work sequence: configure the model space, analyse it,
  // then edit it. Supporting workbench commands deliberately sit after that flow.
  tabs: [
    { id: 'view', label: 'MEGJELENÍTÉS', color: '#00fbfb', tone: 'cyan' },
    { id: 'tools', label: 'ELEMZÉS', color: '#80ff00', tone: 'green' },
    { id: 'edit', label: 'SZERKESZTÉS', color: '#ff55d7', tone: 'magenta' },
    { id: 'ai', label: 'AI MŰVELETEK', color: '#ff8a00', tone: 'amber' },
    { id: 'integrations', label: 'INTEGRÁCIÓK', color: '#4ce6d4', tone: 'cyan' },
    { id: 'file', label: 'MUNKATÉR', color: '#8ba0b3', tone: 'neutral' }
  ],
  commands: [
    { id: 'navigation.home', label: 'FŐOLDAL', detail: 'Vissza a főoldalra', icon: 'home', tone: 'cyan', customizable: false, intent: { type: 'route.navigate', to: '/' } },
    { id: 'workspace.panels', label: 'PANELEK', detail: 'CAD munkatér és ablakkezelő', icon: 'panels', tone: 'cyan', toolId: 'panels', shortcut: 'Ctrl+Shift+P', intent: { type: 'panel.open', panelId: 'graph-workspace-manager-panel' }, placements: [{ surface: 'ribbon', tab: 'file', group: 'PANELEK', order: 20 }, { surface: 'quick-access', order: 10 }, { surface: 'context', menu: 'node', order: 40 }, { surface: 'context', menu: 'edge', order: 40 }, { surface: 'context', menu: 'canvas', order: 30 }] },
    { id: 'workspace.search', label: 'KERESŐ', detail: 'RAG-kereső lebegő nézetben', icon: 'search', tone: 'green', toolId: 'search', shortcut: 'Ctrl+K', intent: { type: 'panel.open', panelId: 'graph-search-panel' }, placements: [{ surface: 'ribbon', tab: 'file', group: 'PANELEK', order: 30 }, { surface: 'ribbon', tab: 'ai', group: 'AI MUNKATÉR', order: 20 }, { surface: 'quick-access', order: 20 }, { surface: 'context', menu: 'canvas', order: 10 }] },
    { id: 'workspace.explorer', label: 'EXPLORER', detail: 'Dokumentum- és projektfa', icon: 'folder-tree', tone: 'cyan', toolId: 'explorer', intent: { type: 'panel.open', panelId: 'graph-explorer-panel' }, placements: [{ surface: 'ribbon', tab: 'file', group: 'DOKUMENTUMOK', order: 10 }] },
    { id: 'workspace.ribbon-settings', label: 'SZALAG', detail: 'Szalag és tartalom kalibrálása', icon: 'palette', tone: 'violet', customizable: false, alwaysVisible: true, intent: { type: 'panel.open', panelId: 'graph-ribbon-panel' }, placements: [{ surface: 'ribbon', tab: 'file', group: 'FELÜLET', order: 40 }, { surface: 'context', menu: 'canvas', order: 40 }] },
    { id: 'view.layers', label: 'RÉTEGEK', detail: 'Megjelenítési rétegverem', icon: 'layers', tone: 'magenta', toolId: 'layers', shortcut: 'L', intent: { type: 'panel.open', panelId: 'graph-layers-panel' }, placements: [{ surface: 'ribbon', tab: 'view', group: 'RÉTEGEK', order: 10 }, { surface: 'ribbon', tab: 'integrations', group: 'ADATBÁZIS', label: 'DB-RÉTEGEK', order: 20 }, { surface: 'quick-access', order: 30 }, { surface: 'context', menu: 'node', label: 'RÉTEGVEREM', order: 20 }, { surface: 'context', menu: 'edge', label: 'RÉTEGVEREM', order: 20 }] },
    { id: 'view.xyflow', label: 'XYFLOW', detail: 'Pont- és részletes projektkártya nézet', icon: 'network', tone: 'green', toolId: 'flow', intent: { type: 'panel.open', panelId: 'graph-flow-panel' }, placements: [{ surface: 'ribbon', tab: 'view', group: 'NÉZET', order: 20 }, { surface: 'ribbon', tab: 'integrations', group: 'ADATBÁZIS', label: 'PROJEKTNÉZET', order: 25 }, { surface: 'quick-access', order: 35 }] },
    { id: 'view.inspector', label: 'INSPEKTOR', detail: 'Kijelölt elem paraméterei', icon: 'settings', tone: 'blue', toolId: 'inspector', shortcut: 'I', intent: { type: 'panel.open', panelId: 'graph-properties-panel' }, placements: [{ surface: 'ribbon', tab: 'view', group: 'INFORMÁCIÓ', order: 30 }, { surface: 'ribbon', tab: 'edit', group: 'KONTEXTUS', order: 30 }, { surface: 'ribbon', tab: 'integrations', group: 'ADATBÁZIS', label: 'KÖTÉSEK', icon: 'link', order: 30 }, { surface: 'quick-access', order: 40 }, { surface: 'context', menu: 'node', label: 'TULAJDONSÁGOK', order: 10 }, { surface: 'context', menu: 'edge', label: 'TULAJDONSÁGOK', order: 10 }] },
    { id: 'analysis.traversal', label: 'ÚTVONALAK', detail: 'Gráfbejárás és RAG-útvonalak', icon: 'route', tone: 'green', toolId: 'traversal', intent: { type: 'panel.open', panelId: 'graph-traversal-panel' }, placements: [{ surface: 'ribbon', tab: 'tools', group: 'ÚTVONALAK', order: 10 }, { surface: 'ribbon', tab: 'ai', group: 'AI MUNKATÉR', label: 'RAG ÚTVONAL', order: 30 }, { surface: 'context', menu: 'node', order: 30 }, { surface: 'context', menu: 'edge', order: 30 }] },
    { id: 'editor.open', label: 'SZERKESZTŐ', detail: 'Admin csúcs- és kapcsolatkezelés', icon: 'network', tone: 'magenta', toolId: 'editor', requires: ['admin'], intent: { type: 'panel.open', panelId: 'graph-admin-panel' }, placements: [{ surface: 'ribbon', tab: 'edit', group: 'CSOMÓPONTOK', label: 'ÚJ CSÚCS', order: 10 }, { surface: 'context', menu: 'node', label: 'SZERKESZTÉS', order: 50 }, { surface: 'context', menu: 'edge', label: 'SZERKESZTÉS', order: 50 }] },
    { id: 'editor.connect', label: 'ÖSSZEKÖTÉS', detail: 'Szerkesztői kapcsolatkezelés', icon: 'link', tone: 'magenta', toolId: 'editor', requires: ['admin'], intent: { type: 'panel.open', panelId: 'graph-admin-panel' }, placements: [{ surface: 'ribbon', tab: 'edit', group: 'KAPCSOLATOK', order: 20 }] },
    { id: 'workspace.toggle-fullscreen', label: 'TELJES KÉP', detail: 'Modelltér teljes képernyős módja', icon: 'maximize', tone: 'violet', toolId: 'fullscreen', intent: { type: 'workspace.toggle-fullscreen' }, placements: [{ surface: 'ribbon', tab: 'view', group: 'KAMERA', order: 40 }] },
    { id: 'workspace.reset-layout', label: 'ALAPNÉZET', detail: 'Csak a modelltér helyreállítása', icon: 'refresh', tone: 'violet', toolId: 'reset', intent: { type: 'workspace.reset-layout' }, placements: [{ surface: 'ribbon', tab: 'file', group: 'FELÜLET', order: 50 }] },
    { id: 'workspace.save-layout', label: 'MENTÉS', detail: 'Aktuális panelkiosztás mentése', icon: 'save', tone: 'cyan', customizable: false, intent: { type: 'workspace.save-layout' } },
    { id: 'workspace.restore-layout', label: 'VISSZAÁLLÍTÁS', detail: 'Mentett panelkiosztás visszaállítása', icon: 'restore', tone: 'cyan', customizable: false, intent: { type: 'workspace.restore-layout' } },
    { id: 'workspace.factory-layout', label: 'GYÁRI', detail: 'Alap panelkiosztás visszaállítása', icon: 'refresh', tone: 'magenta', customizable: false, intent: { type: 'workspace.factory-layout' } },
    { id: 'workspace.place-panel', label: 'PANEL ELHELYEZÉSE', detail: 'Panel dokkolása vagy lebegtetése', icon: 'move', tone: 'cyan', customizable: false, intent: { type: 'panel.place' } },
    { id: 'workspace.reset-panel', label: 'PANEL ALAPHELYZET', detail: 'Egy panel alaphelyzetbe állítása', icon: 'refresh', tone: 'violet', customizable: false, intent: { type: 'panel.reset' } }
  ]
});

// Compatibility exports keep graph-specific surfaces on one source of truth.
export const RIBBON_TABS = GRAPH_CUI_SYSTEM.tabs;
export const RIBBON_ACCENT_MODES = GRAPH_CUI_SYSTEM.calibration.accentModes;
export const CAD_CONTENT_DENSITIES = GRAPH_CUI_SYSTEM.calibration.densities;
export const CAD_CONTENT_DETAILS = GRAPH_CUI_SYSTEM.calibration.details;
export const DEFAULT_RIBBON_PREFERENCES = Object.freeze({ hiddenToolIds: EMPTY_LIST, accentMode: GRAPH_CUI_SYSTEM.defaultState.accentMode, minimized: false });
export const DEFAULT_CAD_CONTENT_PREFERENCES = Object.freeze({ density: GRAPH_CUI_SYSTEM.defaultState.density, detail: GRAPH_CUI_SYSTEM.defaultState.detail });
export const RIBBON_TOOL_OPTIONS = Object.freeze(GRAPH_CUI_SYSTEM.commands
  .filter(command => command.customizable && command.toolId)
  .map(command => ({ id: command.toolId, label: command.label, detail: command.detail }))
  .filter((command, index, commands) => commands.findIndex(candidate => candidate.id === command.id) === index));
