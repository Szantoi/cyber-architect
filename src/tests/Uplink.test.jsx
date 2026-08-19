import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Uplink from '../components/Uplink';
import { ContentProvider } from '../context/ContentContext';

describe('Uplink Component Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the contact form with identity, subject, message inputs and honeypot field', () => {
    render(
      <ContentProvider>
        <Uplink />
      </ContentProvider>
    );

    expect(screen.getByPlaceholderText(/Kovács Péter/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Belső céges AI tudásbázis/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Rövid leírás/i)).toBeInTheDocument();
    
    // Honeypot trap check
    const honeypot = screen.getByPlaceholderText(/Do not fill this field/i);
    expect(honeypot).toBeInTheDocument();
    expect(honeypot).toHaveAttribute('name', 'website');
  });

  it('renders transmit submit button', () => {
    render(
      <ContentProvider>
        <Uplink />
      </ContentProvider>
    );

    const submitBtn = screen.getByRole('button', { name: /ÜZENET KÜLDÉSE/i });
    expect(submitBtn).toBeInTheDocument();
  });
});
