import { describe, it, expect } from 'vitest';
import { sanitizeText, validateUplinkPayload } from '../../security/sanitizer.js';

describe('Security Sanitizer Unit Tests', () => {
  describe('sanitizeText', () => {
    it('strips dangerous HTML tags and script elements', () => {
      const malicious = 'Hello <script>alert("XSS")</script> World';
      const clean = sanitizeText(malicious);
      expect(clean).toBe('Hello  World');
      expect(clean).not.toContain('<script>');
    });

    it('removes javascript: URIs and dangerous event handlers', () => {
      const input = 'Click <a href="javascript:alert(1)">here</a> onload onerror';
      const clean = sanitizeText(input);
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('onload');
      expect(clean).not.toContain('javascript:');
    });

    it('enforces maximum character length limit', () => {
      const longText = 'A'.repeat(150);
      const truncated = sanitizeText(longText, 100);
      expect(truncated.length).toBe(100);
    });

    it('handles null and undefined values safely', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
      expect(sanitizeText(123)).toBe('');
    });
  });

  describe('validateUplinkPayload', () => {
    it('accepts valid contact uplink payloads', () => {
      const payload = {
        identity: 'Kovács János (janos@ceg.hu)',
        subject: 'Folyamatfelmérés & Automatizáció',
        message: 'Szeretnénk felvenni a kapcsolatot egy AI pilot kapcsán.',
        website: '' // Empty honeypot
      };

      const result = validateUplinkPayload(payload);
      expect(result.isValid).toBe(true);
      expect(result.isBot).toBe(false);
      expect(result.data.identity).toBe('Kovács János (janos@ceg.hu)');
      expect(result.data.subject).toBe('Folyamatfelmérés & Automatizáció');
    });

    it('detects honeypot bot submissions and marks as spam', () => {
      const botPayload = {
        identity: 'Spam Bot',
        subject: 'Buy crypto',
        message: 'Check out cheap crypto deals',
        website: 'http://spam-link.ru' // Honeypot trap filled
      };

      const result = validateUplinkPayload(botPayload);
      expect(result.isBot).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('rejects missing or empty required fields', () => {
      const emptyPayload = {
        identity: '',
        subject: '',
        message: ''
      };

      const result = validateUplinkPayload(emptyPayload);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('sanitizes input values in uplink submissions', () => {
      const xssPayload = {
        identity: 'Tesztelő <script>evil()</script>',
        subject: 'Érdeklődés javascript:void(0)',
        message: 'Kérdés',
        website: ''
      };

      const result = validateUplinkPayload(xssPayload);
      expect(result.isValid).toBe(true);
      expect(result.data.identity).not.toContain('<script>');
      expect(result.data.subject).not.toContain('javascript:');
    });
  });
});
