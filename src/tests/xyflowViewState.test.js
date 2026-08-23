import { afterEach, describe, expect, it } from 'vitest';
import {
  emptyXYFlowViewState,
  readXYFlowViewState,
  writeXYFlowViewState,
  XYFLOW_MAX_ZOOM,
  XYFLOW_MIN_ZOOM,
  XYFLOW_VIEW_STATE_VERSION
} from '../components/graph/xyflowViewState.js';

afterEach(() => localStorage.clear());

describe('XYFlow workspace canvas state', () => {
  it('restores only safe node coordinates and bounds the stored viewport zoom', () => {
    const key = 'directed-multigraph-display:workspace:model:project/demo:v2:canvas-state:v1';
    localStorage.setItem(key, JSON.stringify({
      version: XYFLOW_VIEW_STATE_VERSION,
      positions: {
        'task:valid': { x: 280.5, y: -42 },
        'task:missing-y': { x: 18 },
        'task:far-away': { x: 1000001, y: 12 }
      },
      viewport: { x: -76, y: 34, zoom: 9 }
    }));

    expect(readXYFlowViewState(key)).toEqual({
      version: XYFLOW_VIEW_STATE_VERSION,
      positions: { 'task:valid': { x: 280.5, y: -42 } },
      viewport: { x: -76, y: 34, zoom: XYFLOW_MAX_ZOOM }
    });

    localStorage.setItem(key, JSON.stringify({
      version: XYFLOW_VIEW_STATE_VERSION,
      positions: {},
      viewport: { x: 0, y: 0, zoom: -4 }
    }));
    expect(readXYFlowViewState(key).viewport).toEqual({ x: 0, y: 0, zoom: XYFLOW_MIN_ZOOM });
  });

  it('falls back safely for malformed or incompatible browser storage', () => {
    const key = 'xyflow-view-state-invalid';
    localStorage.setItem(key, '{not-json');
    expect(readXYFlowViewState(key)).toEqual(emptyXYFlowViewState());

    localStorage.setItem(key, JSON.stringify({ version: 0, positions: { node: { x: 1, y: 1 } } }));
    expect(readXYFlowViewState(key)).toEqual(emptyXYFlowViewState());
  });

  it('keeps canvas coordinates and camera isolated per workspace profile', () => {
    const modelKey = 'directed-multigraph-display:workspace:model:project/demo:v2:canvas-state:v1';
    const layoutKey = 'directed-multigraph-display:workspace:layout-1:project/demo:v2:canvas-state:v1';
    const modelState = {
      version: XYFLOW_VIEW_STATE_VERSION,
      positions: { 'task:TASK-004': { x: 248, y: 132 } },
      viewport: { x: -42, y: 18, zoom: 0.86 }
    };
    const layoutState = {
      version: XYFLOW_VIEW_STATE_VERSION,
      positions: { 'task:TASK-004': { x: 504, y: 64 } },
      viewport: { x: 126, y: -30, zoom: 1.2 }
    };

    expect(writeXYFlowViewState(modelKey, modelState)).toBe(true);
    expect(writeXYFlowViewState(layoutKey, layoutState)).toBe(true);
    expect(readXYFlowViewState(modelKey)).toEqual(modelState);
    expect(readXYFlowViewState(layoutKey)).toEqual(layoutState);
  });
});
