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
  apiKey: 'AIzaSyAQT8HXa0Acc34m_9H_QXiNhOttQyds0Kc',
  authDomain: 'drumsheet-cc676.firebaseapp.com',
  projectId: 'drumsheet-cc676',
  storageBucket: 'drumsheet-cc676.firebasestorage.app',
  messagingSenderId: '490664045380',
  appId: '1:490664045380:web:09bea719ae5f4c58ea4511'
};

// If you're reusing an existing Firebase project and added Drumsheet as a second,
// *named* Firestore database (Firestore Database > database selector > Create
// database) rather than a new project, put that database ID here. Leave it null
// to use the project's "(default)" database.
const FIRESTORE_DATABASE_ID = null;

// window.firebaseReady resolves once window.Firebase is populated. The rest of the
// app (classic, non-module scripts) awaits this before touching window.Firebase, so
// load order between this module and the classic scripts never matters.
window.firebaseReady = (async () => {
  const app = initializeApp(firebaseConfig);
  const db = FIRESTORE_DATABASE_ID ? getFirestore(app, FIRESTORE_DATABASE_ID) : getFirestore(app);

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

  // Autosave writes title/band/bpm/beat and rows together in one update.
  async function saveSong(id, data) {
    await updateDoc(doc(db, 'songs', id), { ...data, updatedAt: serverTimestamp() });
    return true;
  }

  async function isTitleTaken(title, exceptId) {
    const dupes = await getDocs(query(SONGS_COL, where('title', '==', title)));
    return dupes.docs.some(d => d.id !== exceptId);
  }

  window.Firebase = {
    getConfig, saveConfig, listSongs, createSong, loadSong, saveSong, isTitleTaken
  };
})();
