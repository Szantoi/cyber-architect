import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CadCuiCommandPalette, CadCuiContextMenu, CadCuiCustomizer, CadCuiProvider, CadCuiQuickAccess, CadCuiRibbon, defineCadCuiSystem, GRAPH_CUI_SYSTEM, loadCadCuiState, sanitizeCadCuiState, selectCadCuiCommands, useCadCui } from '../components/graph/ui/CadCuiSystem.jsx';

const TEST_STORAGE_KEY = 'test-cad-cui-preferences:v1';
const TEST_CUI = defineCadCuiSystem({
  id: 'test-cui',
  storageKey: TEST_STORAGE_KEY,
  defaults: { activeTab: 'file', accentMode: 'cyan', density: 'regular', detail: 'guided', quickAccessIds: ['open-explorer'] },
  calibration: {
    accentModes: [{ id: 'cyan', label: 'CIÁN' }, { id: 'magenta', label: 'MAGENTA' }],
    densities: [{ id: 'compact', label: 'TÖMÖR' }, { id: 'regular', label: 'EGYENSÚLY' }],
    details: [{ id: 'focus', label: 'FÓKUSZ' }, { id: 'guided', label: 'INFORMATÍV' }]
  },
  tabs: [{ id: 'file', label: 'FILE', tone: 'cyan' }, { id: 'view', label: 'VIEW', tone: 'blue' }],
  commands: [
    { id: 'open-explorer', label: 'EXPLORER', detail: 'Dokumentumok megnyitása', tone: 'cyan', toolId: 'explorer', intent: { type: 'panel.open', panelId: 'explorer' }, placements: [{ surface: 'ribbon', tab: 'file', order: 10 }, { surface: 'quick-access', order: 10 }, { surface: 'context', menu: 'node', order: 10 }] },
    { id: 'go-knowledge', label: 'TUDÁSTÁR', detail: 'Ugrás a tudástárba', tone: 'green', intent: { type: 'route.navigate', to: '/knowledge?project_id=prj-alpha' }, placements: [{ surface: 'ribbon', tab: 'file', order: 20 }, { surface: 'context', menu: 'node', order: 20 }] },
    { id: 'admin-editor', label: 'SZERKESZTŐ', detail: 'Védett admin parancs', tone: 'magenta', requires: ['admin'], intent: { type: 'panel.open', panelId: 'editor' }, placements: [{ surface: 'ribbon', tab: 'file', order: 30 }] }
  ]
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="cui-location">{`${location.pathname}${location.search}`}</output>;
}

function CUIStateProbe() {
  const { state, executeCommand } = useCadCui();
  return <section data-testid="cui-state" data-cad-density={state.density} data-cad-detail={state.detail} data-cui-accent={state.accentMode}>
    <button type="button" onClick={() => { void executeCommand('admin-editor', { source: 'api' }); }}>ADMIN API</button>
  </section>;
}

function CUIFixture({ capabilities, handlers, onCommand }) {
  return <CadCuiProvider registry={TEST_CUI} capabilities={capabilities} handlers={handlers} onCommand={onCommand}>
    <LocationProbe />
    <CUIStateProbe />
    <CadCuiRibbon data-testid="fixture-ribbon" />
    <CadCuiQuickAccess data-testid="fixture-quick-access" />
    <CadCuiContextMenu data-testid="fixture-context-menu" menuId="node" />
    <CadCuiCommandPalette data-testid="fixture-command-palette" />
    <CadCuiCustomizer data-testid="fixture-customizer" />
  </CadCuiProvider>;
}

function renderCUI({ capabilities = {}, handlers = {}, onCommand = vi.fn() } = {}) {
  return render(<MemoryRouter initialEntries={['/graph']}>
    <Routes>
      <Route path="*" element={<CUIFixture capabilities={capabilities} handlers={handlers} onCommand={onCommand} />} />
    </Routes>
  </MemoryRouter>);
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('CAD CUI system', () => {
  it('keeps the production ribbon, panel catalogue and local menus in one declarative registry', () => {
    const publicView = selectCadCuiCommands(GRAPH_CUI_SYSTEM, GRAPH_CUI_SYSTEM.defaultState, { surface: 'ribbon', tabId: 'view' });
    const adminEdit = selectCadCuiCommands(GRAPH_CUI_SYSTEM, GRAPH_CUI_SYSTEM.defaultState, { surface: 'ribbon', tabId: 'edit', capabilities: { admin: true } });
    const nodeMenu = selectCadCuiCommands(GRAPH_CUI_SYSTEM, GRAPH_CUI_SYSTEM.defaultState, { surface: 'context', menuId: 'node' });

    expect(GRAPH_CUI_SYSTEM.panels.map(panel => panel.id)).toEqual(expect.arrayContaining(['graph-explorer-panel', 'graph-layers-panel', 'graph-flow-panel', 'graph-properties-panel', 'graph-admin-panel']));
    expect(publicView.map(command => command.id)).toEqual(['workspace.panels', 'workspace.search', 'view.layers', 'view.xyflow', 'view.inspector', 'analysis.traversal', 'workspace.toggle-fullscreen']);
    expect(publicView.map(command => command.placement.group)).toEqual(['MUNKATÉR', 'MUNKATÉR', 'MEGJELENÍTÉS', 'MEGJELENÍTÉS', 'MEGJELENÍTÉS', 'MEGJELENÍTÉS', 'KAMERA']);
    expect(adminEdit.map(command => command.id)).toEqual(['workspace.panels', 'editor.open', 'editor.connect', 'view.inspector', 'analysis.traversal']);
    expect(nodeMenu.map(command => command.label)).toEqual(['TULAJDONSÁGOK', 'RÉTEGVEREM', 'ÚTVONALAK', 'PANELEK']);
  });

  it('keeps an immutable, sanitized preference boundary including legacy hidden tool state', () => {
    const state = sanitizeCadCuiState(TEST_CUI, {
      activeTab: 'missing',
      hiddenToolIds: ['explorer'],
      accentMode: 'missing',
      density: 'compact',
      detail: 'missing',
      quickAccessIds: ['open-explorer', 'unknown']
    });

    expect(state).toMatchObject({ activeTab: 'file', accentMode: 'cyan', density: 'compact', detail: 'guided', quickAccessIds: ['open-explorer'] });
    expect(state.hiddenCommandIds).toEqual(['open-explorer']);
    expect(loadCadCuiState(TEST_CUI, { getItem: () => '{broken-json' })).toMatchObject({ activeTab: 'file', density: 'regular' });
    expect(TEST_CUI.defaultState.density).toBe('regular');
  });

  it('dispatches the same declarative intent from ribbon, quick access and context surfaces', async () => {
    const panelOpen = vi.fn();
    const onCommand = vi.fn();
    renderCUI({ handlers: { 'panel.open': panelOpen }, onCommand });

    fireEvent.click(within(screen.getByTestId('fixture-ribbon')).getByRole('button', { name: 'EXPLORER' }));
    await waitFor(() => expect(panelOpen).toHaveBeenLastCalledWith(expect.objectContaining({ commandId: 'open-explorer', source: 'ribbon', intent: expect.objectContaining({ panelId: 'explorer' }) })));

    fireEvent.click(within(screen.getByTestId('fixture-quick-access')).getByRole('button', { name: 'EXPLORER' }));
    await waitFor(() => expect(panelOpen).toHaveBeenLastCalledWith(expect.objectContaining({ commandId: 'open-explorer', source: 'quick-access' })));

    fireEvent.click(within(screen.getByTestId('fixture-context-menu')).getByRole('menuitem', { name: 'EXPLORER' }));
    await waitFor(() => expect(panelOpen).toHaveBeenLastCalledWith(expect.objectContaining({ commandId: 'open-explorer', source: 'context' })));
    expect(onCommand).toHaveBeenCalledTimes(3);
  });

  it('uses the real React Router navigation adapter and command palette filtering', async () => {
    renderCUI();

    fireEvent.click(within(screen.getByTestId('fixture-ribbon')).getByRole('button', { name: 'TUDÁSTÁR' }));
    await waitFor(() => expect(screen.getByTestId('cui-location')).toHaveTextContent('/knowledge?project_id=prj-alpha'));

    const palette = screen.getByTestId('fixture-command-palette');
    fireEvent.change(within(palette).getByLabelText('Parancs keresése'), { target: { value: 'explorer' } });
    await waitFor(() => expect(within(palette).getByRole('button', { name: 'EXPLORER' })).toBeInTheDocument());
    expect(within(palette).queryByRole('button', { name: 'TUDÁSTÁR' })).not.toBeInTheDocument();
  });

  it('persists density, detail and accent calibration while respecting command capability checks', async () => {
    const panelOpen = vi.fn();
    const first = renderCUI({ handlers: { 'panel.open': panelOpen } });
    const customizer = screen.getByTestId('fixture-customizer');

    expect(within(screen.getByTestId('fixture-ribbon')).queryByRole('button', { name: 'SZERKESZTŐ' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ADMIN API' }));
    expect(panelOpen).not.toHaveBeenCalled();

    fireEvent.click(within(customizer).getByRole('tab', { name: 'TÖMÖR' }));
    fireEvent.click(within(customizer).getByRole('tab', { name: 'FÓKUSZ' }));
    fireEvent.click(within(customizer).getByRole('tab', { name: 'MAGENTA' }));
    await waitFor(() => {
      expect(screen.getByTestId('cui-state')).toHaveAttribute('data-cad-density', 'compact');
      expect(screen.getByTestId('cui-state')).toHaveAttribute('data-cad-detail', 'focus');
      expect(JSON.parse(localStorage.getItem(TEST_STORAGE_KEY))).toMatchObject({ preferences: { density: 'compact', detail: 'focus', accentMode: 'magenta' } });
    });

    first.unmount();
    renderCUI({ capabilities: { admin: true }, handlers: { 'panel.open': panelOpen } });
    expect(screen.getByTestId('cui-state')).toHaveAttribute('data-cad-density', 'compact');
    expect(screen.getByTestId('cui-state')).toHaveAttribute('data-cad-detail', 'focus');
    fireEvent.click(within(screen.getByTestId('fixture-ribbon')).getByRole('button', { name: 'SZERKESZTŐ' }));
    await waitFor(() => expect(panelOpen).toHaveBeenLastCalledWith(expect.objectContaining({ commandId: 'admin-editor', intent: expect.objectContaining({ panelId: 'editor' }) })));
  });
});
