import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TaxonomyTab from '../components/admin/tabs/TaxonomyTab.jsx';

const registry = {
  schema_version: 2,
  dimensions: [{
    id: 'industry',
    frontmatter_key: 'tax_industry',
    label: 'IPARÁG',
    icon_key: 'factory',
    color: '#00FBFB',
    filterable: true,
    groupable: true,
    multi_select: true,
    terms: [{ id: 'manufacturing', slug: 'manufacturing', label: 'Gyártás' }]
  }, {
    id: 'technology',
    frontmatter_key: 'tax_technology',
    label: 'TECHNOLÓGIA',
    icon_key: 'cpu',
    color: '#FF00FF',
    filterable: true,
    groupable: true,
    multi_select: true,
    terms: [{ id: 'sql', slug: 'sql', label: 'SQL' }]
  }],
  relations: [],
  smart_collections: []
};

const jsonResponse = (body) => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

function renderTab() {
  const onNotify = vi.fn();
  const adminFetch = vi.fn(async (url, options) => {
    if (url === '/api/admin/knowledge/taxonomy' && !options) return jsonResponse({ taxonomy: registry });
    if (url === '/api/admin/taxonomy/relations' && options?.method === 'POST') return jsonResponse({ relation: {} });
    if (url === '/api/admin/smart-collections' && options?.method === 'POST') return jsonResponse({ collection: {} });
    throw new Error(`Unexpected admin request: ${url}`);
  });

  render(<TaxonomyTab adminFetch={adminFetch} onNotify={onNotify} />);
  return { adminFetch, onNotify };
}

describe('TaxonomyTab strict API payloads', () => {
  it('creates a valid term relationship with the supported type, 0–1 weight, and direction', async () => {
    const { adminFetch } = renderTab();
    fireEvent.click(await screen.findByRole('tab', { name: /kapcsolatok/i }));
    fireEvent.click(screen.getByRole('button', { name: /kapcsolat/i }));

    fireEvent.change(screen.getByLabelText('FORRÁS TERM'), { target: { value: 'manufacturing' } });
    fireEvent.change(screen.getByLabelText('CÉL TERM'), { target: { value: 'sql' } });
    fireEvent.change(screen.getByLabelText('KAPCSOLAT TÍPUSA'), { target: { value: 'recommended_with' } });
    fireEvent.change(screen.getByLabelText('SÚLY (0–1)'), { target: { value: '0.65' } });
    fireEvent.click(screen.getByLabelText('Kétirányú kapcsolat'));
    fireEvent.click(screen.getByRole('button', { name: 'LÉTREHOZÁS' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      '/api/admin/taxonomy/relations',
      expect.objectContaining({ method: 'POST' })
    ));
    const [, options] = adminFetch.mock.calls.find((call) => call[0] === '/api/admin/taxonomy/relations');
    expect(JSON.parse(options.body)).toEqual({
      source_term_id: 'manufacturing',
      target_term_id: 'sql',
      relation_type: 'recommended_with',
      weight: 0.65,
      bidirectional: true
    });
  });

  it('serializes a smart collection as the server-side safe DSL instead of UI-only fields', async () => {
    const { adminFetch } = renderTab();
    fireEvent.click(await screen.findByRole('tab', { name: /smart gyűjtemények/i }));
    fireEvent.click(screen.getByRole('button', { name: /gyűjtemény/i }));

    fireEvent.change(screen.getByLabelText('MEGJELENŐ NÉV'), { target: { value: 'Gyártási tudás' } });
    fireEvent.change(screen.getByLabelText('CANONICAL SLUG'), { target: { value: 'gyartasi-tudas' } });
    fireEvent.change(screen.getByLabelText('CSOPORTOSÍTÁS'), { target: { value: 'taxonomy:industry' } });
    fireEvent.change(screen.getByLabelText('Szabály mező 1'), { target: { value: 'dimensions.tax_industry' } });
    fireEvent.change(screen.getByLabelText('Szabály érték 1'), { target: { value: 'manufacturing' } });
    fireEvent.click(screen.getByRole('button', { name: 'LÉTREHOZÁS' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      '/api/admin/smart-collections',
      expect.objectContaining({ method: 'POST' })
    ));
    const [, options] = adminFetch.mock.calls.find((call) => call[0] === '/api/admin/smart-collections');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      slug: 'gyartasi-tudas',
      name: 'Gyártási tudás',
      color: '#80FF00',
      group_by: { type: 'taxonomy_dimension', dimension_id: 'industry' },
      rule: {
        type: 'all',
        rules: [{ type: 'taxonomy', dimension_id: 'industry', term_ids: ['manufacturing'], match: 'any' }]
      }
    });
    expect(body).not.toHaveProperty('label');
    expect(body).not.toHaveProperty('rules');
    expect(body).not.toHaveProperty('rule_logic');
  });

  it('lets an admin force a document into a saved Smart collection and then restore automatic membership', async () => {
    const onNotify = vi.fn();
    const editableRegistry = {
      ...registry,
      smart_collections: [{
        id: 'manual-collection',
        slug: 'manual-collection',
        name: 'Kézi tartalom',
        active: true,
        rule: { type: 'content', field: 'category', operator: 'equals', value: 'MATCH' },
        group_by: { type: 'none' },
        layout: { view: 'cards' }
      }]
    };
    const membershipPath = '/api/admin/smart-collections/manual-collection/overrides/7';
    const adminFetch = vi.fn(async (url, options) => {
      if (url === '/api/admin/knowledge/taxonomy' && !options) return jsonResponse({ taxonomy: editableRegistry });
      if (url === '/api/admin/blog?content_type=knowledge&visibility=all') return jsonResponse([{
        id: 7,
        title: 'Kizárandó dokumentum',
        slug: 'kizarando-dokumentum',
        content_type: 'knowledge',
        category: 'OTHER',
        published: 0
      }]);
      if (url === '/api/admin/smart-collections/manual-collection/overrides') return jsonResponse({ overrides: [] });
      if (url === membershipPath && options?.method === 'PUT') return jsonResponse({ override: { post_id: 7, mode: 'include' } });
      if (url === membershipPath && options?.method === 'DELETE') return jsonResponse({ success: true });
      throw new Error(`Unexpected admin request: ${url}`);
    });

    render(<TaxonomyTab adminFetch={adminFetch} onNotify={onNotify} />);
    fireEvent.click(await screen.findByRole('tab', { name: /smart gyűjtemények/i }));
    fireEvent.click(screen.getByRole('button', { name: /kézi tartalom/i }));
    await screen.findByText(/tartalom tagság/i);
    fireEvent.click(screen.getByRole('button', { name: /összes \(1\)/i }));
    expect(await screen.findByText('Kizárandó dokumentum')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'BEVESZ' }));
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      membershipPath,
      expect.objectContaining({ method: 'PUT' })
    ));
    const [, includeOptions] = adminFetch.mock.calls.find(call => call[0] === membershipPath && call[1]?.method === 'PUT');
    expect(JSON.parse(includeOptions.body)).toEqual({ mode: 'include' });
    expect(await screen.findByText('KÉZI FELVÉTEL')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'AUTOMATIKUS' }));
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      membershipPath,
      expect.objectContaining({ method: 'DELETE' })
    ));
  });
});
