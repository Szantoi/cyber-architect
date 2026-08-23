import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SystemArchitectureView from '../components/architecture/SystemArchitectureView';

describe('SystemArchitectureView Component', () => {
  it('renders the SQL-to-Multigraph and workflow canonical architecture', () => {
    render(
      <BrowserRouter>
        <SystemArchitectureView />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: /SQL-vezérelt tudásrendszer/i })).toBeDefined();
    expect(screen.getByText(/STRUCTURAL_TRUTH/i)).toBeDefined();
    expect(screen.getByText(/HUMAN_CONTEXT/i)).toBeDefined();
    expect(screen.getByText(/RELATION_TRUTH/i)).toBeDefined();
    expect(screen.getByText(/PROCESS_TRUTH/i)).toBeDefined();

    expect(screen.getByRole('button', { name: /SQL \/ ERP: strukturális igazság/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Központi Markdown-generátor/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Taxonómia-registry/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /DB-first többrétegű multigráf/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Workflow runtime: formális állapotgép/i })).toBeDefined();

    const projectGraph = screen.getByTestId('project-epic-task-model');
    expect(within(projectGraph).getByText('PRJ-2026-884')).toBeDefined();
    expect(within(projectGraph).getByText('EPIC-014')).toBeDefined();
    expect(within(projectGraph).getByText('TASK-042')).toBeDefined();
    expect(within(projectGraph).getAllByText('contains')).toHaveLength(2);
    expect(screen.getAllByText(/M:N tagság/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/maximum 6 mélységig/i)).toBeDefined();

    const workflow = screen.getByTestId('workflow-state-machine-model');
    expect(within(workflow).getByText('DRAFT')).toBeDefined();
    expect(within(workflow).getByText('VERIFY')).toBeDefined();
    expect(within(workflow).getByText('REVIEW')).toBeDefined();
    expect(within(workflow).getByText('COMPLETE')).toBeDefined();
    expect(screen.getByText(/Workflow ≠ knowledge edge/i)).toBeDefined();
  });

  it('shows the selected taxonomy registry contract', async () => {
    render(
      <BrowserRouter>
        <SystemArchitectureView />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Taxonómia-registry/i }));

    expect(screen.getByText(/Admin által konfigurált dimenziók/i)).toBeDefined();
    expect(screen.getByText(/smart collection/i)).toBeDefined();
    expect(await screen.findByText(/A fájl csak stabil tax_industry/i)).toBeDefined();
  });
});
