import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RagEvidenceModal from '../components/common/RagEvidenceModal';

const ModalHarness = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Bizonyítékok megnyitása</button>
      <RagEvidenceModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        topicTitle="Teszt témakör"
        searchQuery="teszt"
      />
    </>
  );
};

describe('RagEvidenceModal accessibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves focus into the named dialog and restores it after Escape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    }));

    render(
      <MemoryRouter>
        <ModalHarness />
      </MemoryRouter>
    );

    const trigger = screen.getByRole('button', { name: /Bizonyítékok megnyitása/i });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: /Teszt témakör/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /RAG találatok bezárása/i })).toHaveFocus();
    await screen.findByText(/Nincs közvetlen találat/i);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('announces the active result filter with aria-pressed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    }));

    render(
      <MemoryRouter>
        <ModalHarness />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Bizonyítékok megnyitása/i }));
    await screen.findByText(/Nincs közvetlen találat/i);
    const articleFilter = screen.getByRole('button', { name: /CIKKEK \/ ESETTANULMÁNYOK/i });
    fireEvent.click(articleFilter);

    expect(articleFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /ÖSSZES TALÁLAT/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
