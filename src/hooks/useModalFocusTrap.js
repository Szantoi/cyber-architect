import { useEffect, useRef } from 'react';

/**
 * useModalFocusTrap Hook (WCAG 2.1 AA Compliant)
 * 
 * - Traps keyboard focus inside the modal container.
 * - Handles Escape key to trigger onClose callback.
 * - Restores focus to the trigger element when the modal is closed.
 */
export function useModalFocusTrap(isOpen, onClose) {
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember the element that had focus before opening the modal
    triggerRef.current = document.activeElement;

    const modalElement = modalRef.current;
    if (!modalElement) return;

    // Focus the first focusable element inside the modal
    const focusableElements = modalElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (e) => {
      // Escape key closes modal
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }

      // Tab key focus trap
      if (e.key === 'Tab') {
        const focusables = Array.from(
          modalElement.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => !el.disabled && el.offsetParent !== null);

        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: moving backwards
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: moving forwards
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to original element
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  return modalRef;
}
