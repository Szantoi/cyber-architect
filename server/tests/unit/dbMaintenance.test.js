import { describe, it, expect } from 'vitest';
import { dbMaintenance } from '../../services/dbMaintenance.js';

describe('Database Maintenance Service Unit Tests', () => {
  it('successfully executes a PASSIVE wal_checkpoint without errors', () => {
    const result = dbMaintenance.performCheckpoint('PASSIVE');

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('mode', 'PASSIVE');
    expect(result).toHaveProperty('timestamp');
  });

  it('handles invalid modes gracefully by falling back to PASSIVE', () => {
    const result = dbMaintenance.performCheckpoint('INVALID_MODE');

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('mode', 'PASSIVE');
  });
});
