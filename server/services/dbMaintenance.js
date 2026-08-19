import { db } from '../db.js';
import { logger } from '../logger.js';

let maintenanceTimer = null;

/**
 * SQLite WAL Checkpoint & DB Optimization Routine
 * Executes WAL checkpoint and B-tree optimization without locking the database.
 */
export const dbMaintenance = {
  performCheckpoint(mode = 'PASSIVE') {
    try {
      const validModes = ['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE'];
      const targetMode = validModes.includes(mode.toUpperCase()) ? mode.toUpperCase() : 'PASSIVE';

      // Run WAL checkpoint
      const result = db.pragma(`wal_checkpoint(${targetMode})`, { simple: false });
      
      // Run SQLite query planner index optimization
      db.pragma('optimize');

      logger.info(`[DB_MAINTENANCE] WAL Checkpoint (${targetMode}) completed.`, result);
      return {
        success: true,
        mode: targetMode,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      logger.error('[DB_MAINTENANCE] Failed to execute WAL checkpoint:', err);
      return {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  },

  startPeriodicMaintenance(intervalMs = 3600000) { // Default: Every 1 hour
    if (maintenanceTimer) {
      clearInterval(maintenanceTimer);
    }

    maintenanceTimer = setInterval(() => {
      this.performCheckpoint('PASSIVE');
    }, intervalMs);

    if (maintenanceTimer.unref) {
      maintenanceTimer.unref(); // Prevent timer from keeping process alive on exit
    }

    logger.info(`[DB_MAINTENANCE] Scheduled periodic SQLite WAL maintenance every ${Math.round(intervalMs / 1000 / 60)} minutes.`);
  },

  stopPeriodicMaintenance() {
    if (maintenanceTimer) {
      clearInterval(maintenanceTimer);
      maintenanceTimer = null;
    }
  }
};
