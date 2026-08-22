#!/usr/bin/env node
/**
 * ONE-TIME MIGRATION: loads a DrumScribe export (produced by
 * legacy-gas/temp-export.gs) into Firestore.
 *
 * Usage:
 *   node scripts/import-to-firebase.js path/to/export.json path/to/service-account-key.json
 *
 * - export.json:            the JSON you pasted from the Sheet's "Export All Data" dialog
 * - service-account-key.json: from Firebase Console > Project settings > Service accounts
 *                             > Generate new private key. Never commit this file.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const [, , exportPath, keyPath] = process.argv;

if (!exportPath || !keyPath) {
  console.error('Usage: node scripts/import-to-firebase.js <export.json> <service-account-key.json>');
  process.exit(1);
}

const exportData = JSON.parse(fs.readFileSync(path.resolve(exportPath), 'utf8'));
const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(keyPath), 'utf8'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const { config, songs } = exportData;

  console.log('Writing config/main ...');
  await db.collection('config').doc('main').set(config || { structures: [], symbols: [] });

  console.log(`Writing ${songs.length} song(s) ...`);
  for (const song of songs) {
    const ref = await db.collection('songs').add({
      title: song.meta.title,
      band: song.meta.band,
      bpm: song.meta.bpm,
      beat: song.meta.beat,
      rows: song.rows,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  - "${song.meta.title}" -> ${ref.id}`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
