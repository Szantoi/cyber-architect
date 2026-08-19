import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import KnowledgeMeshExplorer from '../components/docs/KnowledgeMeshExplorer';

describe('KnowledgeMeshExplorer Component Unit Tests', () => {
  it('renders graph topology header and interactive node graph', () => {
    render(<KnowledgeMeshExplorer onSelectDoc={vi.fn()} />);

    expect(screen.getByText(/KNOWLEDGE_MESH_TOPOLOGY/i)).toBeInTheDocument();
    expect(screen.getByText(/Interaktív Technológiai Kapcsolati Térkép/i)).toBeInTheDocument();
  });

  it('triggers onSelectDoc callback when clicking a node', () => {
    const handleSelect = vi.fn();
    render(<KnowledgeMeshExplorer onSelectDoc={handleSelect} />);

    const ragNode = screen.getByText('AI RAG Core');
    fireEvent.click(ragNode);

    expect(handleSelect).toHaveBeenCalledWith('zart-rag-architektura-specifikacio');
  });
});
