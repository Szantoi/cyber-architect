import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeMeshExplorer from '../components/docs/KnowledgeMeshExplorer';

const graph = {
  root: { id: 1, slug: 'hybrid-root', title: 'Hibrid Tudásbázis' },
  documents: [
    { id: 1, slug: 'hybrid-root', title: 'Hibrid Tudásbázis', depth: 0 },
    { id: 2, slug: 'sql-security', title: 'SQL Biztonság', depth: 1 }
  ],
  edges: [{ id: 8, source_post_id: 1, target_post_id: 2, relation_type: 'wikilink' }]
};

const sharedGraph = {
  documents: [
    {
      id: 31,
      slug: 'knowledge-cad',
      title: 'CAD Tudástári útmutató',
      content_type: 'knowledge',
      category: 'CAD AUTOMATIZÁCIÓ',
      drive_path: 'knowledge/02_CAD_Automatizacio/knowledge-cad',
      dimensions: { iparag: ['Gyártás'], technologia: ['C# / .NET', 'AutoCAD API'], celcsoport: ['Műszaki Vezető'] },
      audio_url: 'https://example.com/cad.ogg',
      video_url: 'https://example.com/cad.mp4',
      created_at: '2026-08-20'
    },
    {
      id: 32,
      slug: 'blog-cad',
      title: 'CAD blog esettanulmány',
      content_type: 'blog',
      category: 'CAD AUTOMATIZÁCIÓ',
      drive_path: 'blog/02_CAD_Automatizacio/blog-cad',
      dimensions: { iparag: ['Gyártás'], technologia: ['Python'], celcsoport: ['COO / Operatív Vezető'] },
      created_at: '2026-08-18'
    },
    {
      id: 33,
      slug: 'security-rag',
      title: 'Biztonságos RAG architektúra',
      content_type: 'knowledge',
      category: 'ZÁRT VÁLLALATI RAG',
      drive_path: 'knowledge/01_Zart_Vallalati_RAG/security-rag',
      dimensions: { iparag: ['Pénzügy'], technologia: ['Node.js'], celcsoport: ['IT Biztonsági Vezető'] },
      created_at: '2026-08-16'
    }
  ],
  edges: [
    { id: 88, source_post_id: 31, target_post_id: 32, relation_type: 'wikilink' },
    { id: 89, source_post_id: 31, target_post_id: 33, relation_type: 'wikilink' }
  ]
};

describe('KnowledgeMeshExplorer Component Unit Tests', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(url => {
      if (String(url) === '/api/graph/documents') {
        return Promise.resolve({ ok: true, json: async () => ({ documents: sharedGraph.documents }) });
      }
      if (String(url) === '/api/graph') {
        return Promise.resolve({ ok: true, json: async () => sharedGraph });
      }
      if (String(url).startsWith('/api/graph/blog-cad')) {
        return Promise.resolve({ ok: true, json: async () => ({ root: sharedGraph.documents[1], documents: [sharedGraph.documents[1]], edges: [] }) });
      }
      if (String(url).startsWith('/api/search/unified')) {
        return Promise.resolve({ ok: true, json: async () => ({ results: [{ ...sharedGraph.documents[1], hybridRelevanceScore: 0.92 }] }) });
      }
      if (String(url) === '/api/docs') {
        return Promise.resolve({ ok: true, json: async () => ({ docs: [{ slug: 'hybrid-root', title: 'Hibrid Tudásbázis' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => graph });
    }));
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('renders the public graph header and live graph topology', async () => {
    render(<KnowledgeMeshExplorer onSelectDoc={vi.fn()} />);
    expect(screen.getByText(/PUBLIC_KNOWLEDGE_GRAPH/i)).toBeInTheDocument();
    await screen.findByRole('button', { name: /Hibrid Tudásbázis csomópont megnyitása/i });
    expect(screen.getByText((_, element) => element?.textContent === '2 CSOMÓPONT')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '1 EXPLICIT ÉL')).toBeInTheDocument();
  });

  it('opens the selected public document from the explicit open control', async () => {
    const handleSelect = vi.fn();
    render(<KnowledgeMeshExplorer onSelectDoc={handleSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: /SQL Biztonság csomópont megnyitása/i }));
    fireEvent.click(screen.getByRole('button', { name: 'MEGNYITÁS', exact: true }));
    expect(handleSelect).toHaveBeenCalledWith('sql-security', expect.any(Object));
  });

  it('exposes graph nodes as keyboard-operable controls', async () => {
    const handleSelect = vi.fn();
    render(<KnowledgeMeshExplorer onSelectDoc={handleSelect} />);
    const node = await screen.findByRole('button', { name: /SQL Biztonság csomópont megnyitása/i });
    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'MEGNYITÁS', exact: true }));
    await waitFor(() => expect(handleSelect).toHaveBeenCalledWith('sql-security', expect.any(Object)));
  });

  it('adds unified article search to the shared Blog + Knowledge graph and preserves the Blog target', async () => {
    const handleSelect = vi.fn();
    render(<KnowledgeMeshExplorer scope="shared" onSelectDoc={handleSelect} />);

    const search = await screen.findByRole('searchbox', { name: 'Cikkkeresés a Tudástárban és Blogban' });
    fireEvent.change(search, { target: { value: 'CAD' } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/search/unified?q=CAD&scope=all&limit=20'),
      expect.any(Object)
    ));
    await screen.findAllByText('CAD blog esettanulmány');

    fireEvent.keyDown(search, { key: 'Enter' });
    await screen.findByText('KAPCSOLATI FÓKUSZ');
    fireEvent.click(await screen.findByRole('button', { name: 'CIKK MEGNYITÁSA', exact: true }));

    await waitFor(() => expect(handleSelect).toHaveBeenCalledWith(
      'blog-cad',
      expect.objectContaining({ content_type: 'blog' }),
      'CAD'
    ));
  });

  it('integrates folder navigation and the three cascading RAG facets with the shared graph', async () => {
    render(<KnowledgeMeshExplorer scope="shared" onSelectDoc={vi.fn()} />);

    expect(await screen.findByRole('complementary', { name: 'Mappa-navigátor és gráfszűrők' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /CAD AUTOMATIZÁCIÓ/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Iparág szűrő' }), { target: { value: 'Gyártás' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Technológia szűrő' }), { target: { value: 'C# / .NET' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Célcsoport szűrő' }), { target: { value: 'Műszaki Vezető' } });

    await waitFor(() => expect(screen.getByTestId('graph-search-console')).toHaveTextContent('MUTATVA: 1 / 3 CIKK'));
    expect(screen.getByText((_, element) => element?.textContent === '1 / 1 LÁTHATÓ CSOMÓPONT')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /CAD Tudástári útmutató/i }).length).toBeGreaterThan(0);
  });

  it('creates an interactive, non-duplicating set view from the selected graph dimension', async () => {
    render(<KnowledgeMeshExplorer scope="shared" onSelectDoc={vi.fn()} />);

    const groupingControl = await screen.findByRole('combobox', { name: 'Halmazosítás szerint' });
    expect(screen.getAllByTestId('graph-cluster-boundary')).toHaveLength(2);

    fireEvent.change(groupingControl, { target: { value: 'technology' } });

    await waitFor(() => expect(screen.getByTestId('graph-cluster-controls')).toHaveTextContent('C# / .NET'));
    expect(screen.getAllByTestId('graph-cluster-boundary')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /CAD Tudástári útmutató csomópont kijelölése/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /C# \/ \.NET \(1\)/i }));
    await waitFor(() => expect(screen.getByTestId('graph-cluster-controls')).toHaveTextContent('C# / .NET AKTÍV'));
    expect(screen.getByText((_, element) => element?.textContent === '1 / 3 LÁTHATÓ CSOMÓPONT')).toBeInTheDocument();
  });

  it('drags a graph node and magnetically carries its directly connected leaf with it', async () => {
    render(<KnowledgeMeshExplorer scope="shared" onSelectDoc={vi.fn()} />);

    const node = await screen.findByTestId('graph-node-31');
    const connectedNode = screen.getByTestId('graph-node-32');
    const edge = screen.getByTestId('graph-edge-88');
    const startNodeX = Number(node.dataset.positionX);
    const startNodeY = Number(node.dataset.positionY);
    const startConnectedX = Number(connectedNode.dataset.positionX);

    fireEvent.pointerDown(node, { pointerId: 7, clientX: startNodeX, clientY: startNodeY, button: 0 });
    fireEvent.pointerMove(node, { pointerId: 7, clientX: startNodeX + 60, clientY: startNodeY + 18 });
    fireEvent.pointerUp(node, { pointerId: 7, clientX: startNodeX + 60, clientY: startNodeY + 18 });

    await waitFor(() => expect(Number(node.dataset.positionX)).not.toBe(startNodeX));
    expect(Number(connectedNode.dataset.positionX)).not.toBe(startConnectedX);
    expect(edge).toHaveAttribute('x1', node.dataset.positionX);
    expect(edge).toHaveAttribute('y1', node.dataset.positionY);
    expect(screen.getByTestId('graph-reset-layout')).toBeEnabled();

    fireEvent.click(node);
    expect(node).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByTestId('graph-reset-layout'));
    await waitFor(() => expect(Number(node.dataset.positionX)).toBe(startNodeX));
    expect(Number(connectedNode.dataset.positionX)).toBe(startConnectedX);
  });

  it('lets an elastic cluster membrane expand around a member dragged beyond its original static boundary', async () => {
    render(<KnowledgeMeshExplorer scope="shared" onSelectDoc={vi.fn()} />);

    const node = await screen.findByTestId('graph-node-33');
    const membranePath = screen.getByTestId('graph-cluster-membrane-content_type-0');
    const membraneBoundary = membranePath.closest('[data-testid="graph-cluster-boundary"]');
    const startNodeX = Number(node.dataset.positionX);
    const startNodeY = Number(node.dataset.positionY);
    const startMembraneMaxX = Number(membraneBoundary.dataset.membraneMaxX);

    fireEvent.pointerDown(node, { pointerId: 8, clientX: startNodeX, clientY: startNodeY, button: 0 });
    fireEvent.pointerMove(node, { pointerId: 8, clientX: startNodeX + 250, clientY: startNodeY });
    fireEvent.pointerUp(node, { pointerId: 8, clientX: startNodeX + 250, clientY: startNodeY });

    await waitFor(() => expect(Number(node.dataset.positionX)).toBeGreaterThan(startMembraneMaxX));
    await waitFor(() => expect(Number(membraneBoundary.dataset.membraneMaxX)).toBeGreaterThan(startMembraneMaxX + 100));
    expect(Number(membraneBoundary.dataset.membraneMaxX)).toBeGreaterThan(Number(node.dataset.positionX));

    fireEvent.click(screen.getByTestId('graph-reset-layout'));
    await waitFor(() => expect(Number(node.dataset.positionX)).toBe(startNodeX));
    expect(Number(membraneBoundary.dataset.membraneMaxX)).toBe(startMembraneMaxX);
  });

  it('offers label, spacing, zoom and pan controls for the graph universe', async () => {
    render(<KnowledgeMeshExplorer scope="shared" onSelectDoc={vi.fn()} />);

    await screen.findByTestId('graph-node-31');
    const spacing = screen.getByLabelText('Csomópontok minimális távolsága');
    const labelMode = screen.getByLabelText('Csomópontcímkék megjelenítése');
    const viewport = screen.getByTestId('graph-viewport');
    const canvas = screen.getByTestId('graph-canvas');

    fireEvent.change(spacing, { target: { value: '140' } });
    expect(spacing).toHaveValue('140');
    expect(canvas).toHaveAttribute('viewBox', '0 0 1842 1032');

    fireEvent.change(labelMode, { target: { value: 'all' } });
    expect(screen.getByTestId('graph-node-label-31')).toBeInTheDocument();
    expect(screen.getByTestId('graph-node-label-32')).toBeInTheDocument();
    fireEvent.change(labelMode, { target: { value: 'hidden' } });
    expect(screen.queryByTestId('graph-node-label-31')).not.toBeInTheDocument();

    fireEvent.wheel(canvas, { deltaY: -100 });
    expect(viewport).toHaveAttribute('data-zoom', '1');
    fireEvent.wheel(canvas, { deltaY: -100, shiftKey: true });
    expect(viewport).toHaveAttribute('data-zoom', '1.1');
    fireEvent.click(screen.getByRole('button', { name: 'Nézet illesztése' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nagyítás' }));
    expect(viewport).toHaveAttribute('data-zoom', '1.1');
    const zoomedTransform = viewport.getAttribute('transform');
    fireEvent.pointerDown(screen.getByTestId('graph-pan-surface'), { pointerId: 21, clientX: 100, clientY: 80, button: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 21, clientX: 148, clientY: 108 });
    fireEvent.pointerUp(canvas, { pointerId: 21, clientX: 148, clientY: 108 });
    await waitFor(() => expect(viewport).not.toHaveAttribute('transform', zoomedTransform));
    fireEvent.click(screen.getByRole('button', { name: 'Nézet illesztése' }));
    expect(viewport).toHaveAttribute('data-zoom', '1');
    expect(viewport).toHaveAttribute('transform', 'translate(0 0) scale(1)');
  });

  it('expands a selected folder, shows its articles, and collapses the remaining folder cards', async () => {
    render(<KnowledgeMeshExplorer scope="shared" onSelectDoc={vi.fn()} />);

    const folderNavigation = await screen.findByRole('navigation', { name: 'Gráf mappák' });
    const cadFolder = within(folderNavigation).getByRole('button', { name: /CAD AUTOMATIZÁCIÓ/i });
    fireEvent.click(cadFolder);

    expect(cadFolder).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('CAD AUTOMATIZÁCIÓ cikkei')).toHaveTextContent('CAD Tudástári útmutató');
    expect(screen.getByLabelText('CAD AUTOMATIZÁCIÓ cikkei')).toHaveTextContent('CAD blog esettanulmány');
    expect(within(folderNavigation).queryByRole('button', { name: /ZÁRT VÁLLALATI RAG/i })).not.toBeInTheDocument();

    fireEvent.click(within(folderNavigation).getByRole('button', { name: /SZÜLŐKÖNYVTÁR/i }));
    expect(await within(folderNavigation).findByRole('button', { name: /ZÁRT VÁLLALATI RAG/i })).toBeInTheDocument();
  });
});
