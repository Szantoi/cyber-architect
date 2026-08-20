import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import MarkdownRenderer from '../components/markdown/MarkdownRenderer.jsx';

const renderMarkdown = (content) => render(
  <MemoryRouter>
    <MarkdownRenderer content={content} />
  </MemoryRouter>
);

describe('MarkdownRenderer security', () => {
  it('removes executable raw HTML and unsafe URL protocols', () => {
    const { container } = renderMarkdown([
      '<script>window.__markdownXss = true</script>',
      '<img src="https://example.com/image.png" onerror="window.__markdownXss = true">',
      '<a href="javascript:alert(1)">unsafe link</a>',
    ].join('\n'));

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).not.toHaveAttribute('onerror');
    expect(screen.getByText('unsafe link').closest('a')).not.toHaveAttribute('href', expect.stringMatching(/^javascript:/i));
  });

  it('preserves approved interactive directives after sanitization', () => {
    renderMarkdown(':::details[Biztonságos részletek]\nA védett **tartalom**.\n:::');

    fireEvent.click(screen.getByRole('button', { name: /biztonságos részletek/i }));
    expect(screen.getByText(/védett/)).toBeInTheDocument();
  });

  it('rejects unsafe media directive URLs', () => {
    const { container } = renderMarkdown(':::audio src="javascript:alert(1)" title="Unsafe"\n:::');
    expect(container.querySelector('audio')).toBeNull();
  });
});
