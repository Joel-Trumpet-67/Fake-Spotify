// Tiny promise wrapper around IndexedDB. Everything lives on this device.
const DB_NAME = 'encore';
const VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('tracks', { keyPath: 'id' }); // metadata
        db.createObjectStore('audio'); // id -> Blob
        db.createObjectStore('art'); // artKey -> Blob
        db.createObjectStore('playlists', { keyPath: 'id' });
        db.createObjectStore('kv'); // misc settings/state
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });

export async function get(store, key) {
  const db = await open();
  return req(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await open();
  return req(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, value, key) {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  key === undefined ? t.objectStore(store).put(value) : t.objectStore(store).put(value, key);
  return done(t);
}

export async function del(store, key) {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).delete(key);
  return done(t);
}

export async function clear(store) {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).clear();
  return done(t);
}
