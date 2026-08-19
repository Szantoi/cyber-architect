import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentProvider, useContent } from '../context/ContentContext';

const TestComponent = () => {
  const { settings, skills, projects, isLoading } = useContent();
  return (
    <div>
      <span data-testid="loading-state">{isLoading ? 'loading' : 'ready'}</span>
      <h1 data-testid="hero-title">{settings.hero_title}</h1>
      <span data-testid="skills-count">{skills.length}</span>
      <span data-testid="projects-count">{projects.length}</span>
    </div>
  );
};

describe('ContentContext Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads default settings initially and fetches from /api/content', async () => {
    const mockData = {
      settings: { hero_title: 'Mocked Architect' },
      skills: [{ id: 1, name: 'AI Engineering' }],
      projects: [{ id: 'PRJ_01', title: 'DocCapture' }],
      recentBlogs: []
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    render(
      <ContentProvider>
        <TestComponent />
      </ContentProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('ready');
    });

    expect(screen.getByTestId('hero-title').textContent).toBe('Mocked Architect');
    expect(screen.getByTestId('skills-count').textContent).toBe('1');
    expect(screen.getByTestId('projects-count').textContent).toBe('1');
  });

  it('falls back gracefully to defaults if API fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network Offline'));

    render(
      <ContentProvider>
        <TestComponent />
      </ContentProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('ready');
    });

    expect(screen.getByTestId('hero-title').textContent).toContain('Szántói');
  });
});
