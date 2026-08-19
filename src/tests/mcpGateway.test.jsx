import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import McpAgentGateway from '../components/mcp/McpAgentGateway';

describe('McpAgentGateway Component', () => {
  it('renders MCP Agent Gateway header and title', () => {
    render(
      <BrowserRouter>
        <McpAgentGateway />
      </BrowserRouter>
    );

    const mcpHeaders = screen.getAllByText(/MODEL CONTEXT PROTOCOL/i);
    expect(mcpHeaders.length).toBeGreaterThan(0);
    expect(screen.getByText(/AI Ágens Csatlakozás/i)).toBeInTheDocument();
  });

  it('renders all client configuration tabs and switches active tab', () => {
    render(
      <BrowserRouter>
        <McpAgentGateway />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/Claude Desktop/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cursor IDE/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Claude Code/i).length).toBeGreaterThan(0);

    // Click Cursor tab
    fireEvent.click(screen.getAllByText(/Cursor IDE/i)[0]);
    expect(screen.getAllByText('.cursor/mcp.json').length).toBeGreaterThan(0);
  });

  it('renders all live MCP tools catalog', () => {
    render(
      <BrowserRouter>
        <McpAgentGateway />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/search_knowledge/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/get_knowledge_article/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/list_projects/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/get_architecture_blueprint/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/create_message_uplink/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/get_system_health/).length).toBeGreaterThan(0);
  });
});
