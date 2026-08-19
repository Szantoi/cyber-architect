import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

const TestComponent = () => {
  const { theme, isDark, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="is-dark">{isDark ? 'dark' : 'light'}</span>
      <button onClick={toggleTheme}>Toggle</button>
      <button onClick={() => setTheme('light')}>SetLight</button>
      <button onClick={() => setTheme('dark')}>SetDark</button>
    </div>
  );
};

describe('ThemeContext Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('provides dark theme by default', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    expect(screen.getByTestId('is-dark').textContent).toBe('dark');
  });

  it('toggles theme between dark and light', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByText('Toggle');
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('theme-value').textContent).toBe('light');
    expect(screen.getByTestId('is-dark').textContent).toBe('light');
    expect(localStorage.getItem('cyber_theme')).toBe('light');

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    expect(screen.getByTestId('is-dark').textContent).toBe('dark');
    expect(localStorage.getItem('cyber_theme')).toBe('dark');
  });

  it('sets theme directly using setTheme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText('SetLight'));
    expect(screen.getByTestId('theme-value').textContent).toBe('light');

    fireEvent.click(screen.getByText('SetDark'));
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
  });
});
