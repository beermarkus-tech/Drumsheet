// --- FIREBASE SETUP ---
// Fill this in with the config object from your Firebase project
// (Project settings -> General -> Your apps -> Web app -> SDK setup and configuration).
// This config is not a secret: it is meant to ship in client-side code. Access to your
// data is controlled by Firestore Security Rules, not by hiding this object.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc,
  collection, getDocs, query, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME'
};

// window.firebaseReady resolves once window.Firebase is populated. The rest of the
// app (classic, non-module scripts) awaits this before touching window.Firebase, so
// load order between this module and the classic scripts never matters.
window.firebaseReady = (async () => {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const CONFIG_DOC = doc(db, 'config', 'main');
  const SONGS_COL = collection(db, 'songs');

  async function getConfig() {
    const snap = await getDoc(CONFIG_DOC);
    return snap.exists() ? snap.data() : { structures: [], symbols: [] };
  }

  async function saveConfig(configData) {
    await setDoc(CONFIG_DOC, configData);
    return true;
  }

  async function listSongs() {
    const snap = await getDocs(SONGS_COL);
    return snap.docs.map(d => ({ id: d.id, title: d.data().title, band: d.data().band }));
  }

  async function createSong(meta) {
    const dupes = await getDocs(query(SONGS_COL, where('title', '==', meta.title)));
    if (!dupes.empty) throw new Error('A song with this title already exists.');

    const rows = [];
    for (let i = 0; i < 40; i++) rows.push({ structure: '', lyrics: '', gridData: '{}' });

    const ref = await addDoc(SONGS_COL, { ...meta, rows, updatedAt: serverTimestamp() });
    return { meta: { ...meta, id: ref.id }, rows };
  }

  async function loadSong(id) {
    const snap = await getDoc(doc(db, 'songs', id));
    if (!snap.exists()) throw new Error('Song not found.');
    const data = snap.data();
    return {
      meta: { id: snap.id, title: data.title, band: data.band, bpm: data.bpm, beat: data.beat },
      rows: data.rows || []
    };
  }

  async function saveSongRows(id, rows) {
    await updateDoc(doc(db, 'songs', id), { rows, updatedAt: serverTimestamp() });
    return true;
  }

  async function updateSongMeta(id, newMeta) {
    const dupes = await getDocs(query(SONGS_COL, where('title', '==', newMeta.title)));
    const conflict = dupes.docs.find(d => d.id !== id);
    if (conflict) throw new Error('A song with the new title already exists.');

    await updateDoc(doc(db, 'songs', id), newMeta);
    return { ...newMeta, id };
  }

  window.Firebase = {
    getConfig, saveConfig, listSongs, createSong, loadSong, saveSongRows, updateSongMeta
  };
})();
