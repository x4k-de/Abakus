// Backup: alle Daten als eine JSON-Datei exportieren bzw. wieder einspielen.
// Empfehlung: regelmäßig exportieren und in iCloud Drive ablegen.

import { type AbakusDB, db as defaultDb, saveSettings } from './db';
import type { Asset, Booking, Settings } from './types';

export const BACKUP_FORMAT = 'abakus-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  assets: Asset[];
  bookings: Booking[];
  settings?: Settings;
}

export async function createBackup(database: AbakusDB = defaultDb): Promise<BackupFile> {
  const [assets, bookings, settings] = await Promise.all([
    database.assets.toArray(),
    database.bookings.toArray(),
    database.settings.get('settings'),
  ]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), assets, bookings, settings };
}

export function validateBackup(data: unknown): BackupFile {
  const d = data as Partial<BackupFile>;
  if (!d || d.format !== BACKUP_FORMAT || !Array.isArray(d.assets) || !Array.isArray(d.bookings)) {
    throw new Error('Das ist keine gültige Abakus-Backup-Datei.');
  }
  if ((d.version ?? 0) > BACKUP_VERSION) throw new Error('Das Backup stammt aus einer neueren App-Version.');
  return d as BackupFile;
}

/** Ersetzt alle vorhandenen Daten durch den Inhalt des Backups. */
export async function restoreBackup(backup: BackupFile, database: AbakusDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.assets, database.bookings, database.settings, async () => {
    await database.assets.clear();
    await database.bookings.clear();
    await database.assets.bulkAdd(backup.assets);
    await database.bookings.bulkAdd(backup.bookings);
    if (backup.settings) await database.settings.put(backup.settings);
  });
}

export async function downloadBackup(database: AbakusDB = defaultDb): Promise<void> {
  const backup = await createBackup(database);
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
  const name = `abakus-backup-${backup.exportedAt.slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  // Auf dem iPhone: Teilen-Menü (z. B. "In Dateien sichern" -> iCloud Drive)
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: 'Abakus-Backup' });
      await saveSettings({ lastBackup: backup.exportedAt }, database);
      return;
    } catch {
      /* abgebrochen -> normaler Download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  await saveSettings({ lastBackup: backup.exportedAt }, database);
}
