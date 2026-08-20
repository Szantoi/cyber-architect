import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';

const TestModalComponent = ({ isOpen, onClose }) => {
  const modalRef = useModalFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true">
      <input data-testid="first-input" placeholder="First" />
      <button data-testid="second-button">Second</button>
      <button data-testid="close-button" onClick={onClose}>Close</button>
    </div>
  );
};

describe('useModalFocusTrap Hook (a11y)', () => {
  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(<TestModalComponent isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('automatically focuses the first focusable element when modal opens', () => {
    render(<TestModalComponent isOpen={true} onClose={vi.fn()} />);

    const firstInput = screen.getByTestId('first-input');
    expect(document.activeElement).toBe(firstInput);
  });
});
