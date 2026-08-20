import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SystemArchitectureView from '../components/architecture/SystemArchitectureView';

describe('SystemArchitectureView Component', () => {
  it('renders pipeline blueprint and security guarantees', () => {
    render(
      <BrowserRouter>
        <SystemArchitectureView />
      </BrowserRouter>
    );

    // Verify main headings
    expect(screen.getByText(/Hogyan Működik a Rendszer\?/i)).toBeDefined();
    expect(screen.getByText(/Zárt Vállalati RAG & Architektúra Blueprint/i)).toBeDefined();

    // Verify pipeline steps exist
    expect(screen.getAllByText(/Ellenőrzött Google Drive Import/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SQLite WAL & FTS5 Hibrid Keresőmotor/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kaszkádolt Dimenziós Taxonómia Motor/i).length).toBeGreaterThan(0);

    // Verify system layers & security
    expect(screen.getAllByText(/PRESENTATION LAYER/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/API & SERVICE LAYER/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DATA & RAG ENGINE/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Írásmentes dry-run előnézet/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Drive file ID alapú forrásazonosság/i).length).toBeGreaterThan(0);
  });
});
