import '@testing-library/jest-dom';

// XYFlow reads the viewport transform while ResizeObserver reports node
// dimensions. JSDOM has no matrix implementation, so expose the small part
// of the browser API the renderer needs for deterministic component tests.
if (!globalThis.DOMMatrixReadOnly) {
  class DOMMatrixReadOnly {
    constructor() {
      this.m22 = 1;
    }
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnly;
  if (typeof window !== 'undefined') window.DOMMatrixReadOnly = DOMMatrixReadOnly;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.elements = new Set();
    }

    observe(target) {
      this.elements.add(target);
      queueMicrotask(() => {
        const entries = [...this.elements].map(element => ({
          target: element,
          contentRect: element.getBoundingClientRect()
        }));
        if (entries.length) this.callback(entries, this);
      });
    }

    unobserve(target) {
      this.elements.delete(target);
    }

    disconnect() {
      this.elements.clear();
    }
  };
}
