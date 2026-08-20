import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import MarkdownRenderer from '../components/markdown/MarkdownRenderer.jsx';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn().mockResolvedValue({
    svg: '<svg role="img" aria-label="Teszt diagram"></svg>',
  }),
}));

vi.mock('mermaid', () => ({ default: mermaidMock }));

const renderMarkdown = (content) => render(
  <MemoryRouter>
    <MarkdownRenderer content={content} />
  </MemoryRouter>
);

describe('MarkdownRenderer code blocks', () => {
  it('loads Mermaid only when a Mermaid block is rendered', async () => {
    const codeView = renderMarkdown('```javascript\nconst answer = 42;\n```');

    expect(screen.getByText('JAVASCRIPT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /másolás/i })).toBeInTheDocument();
    expect(mermaidMock.initialize).not.toHaveBeenCalled();
    codeView.unmount();

    const { container } = renderMarkdown('```mermaid\ngraph TD\n  A --> B\n```');

    await waitFor(() => {
      expect(container.querySelector('svg[aria-label="Teszt diagram"]')).toBeInTheDocument();
    });
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' })
    );
    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid_/),
      'graph TD\n  A --> B'
    );
  });
});
