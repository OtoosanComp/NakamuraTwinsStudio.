// Fotos guardadas (proyectos editables) en IndexedDB y ajustes de la app.
import type { EditState } from '../engine/editState';

export interface Project {
  id: string;
  created: number;
  updated: number;
  original: Blob;
  edit: EditState;
  thumb: string; // dataURL
  presetName?: string;
}

const DB = 'nts';
const STORE = 'projects';

function open(): Promise<IDBDatabase> {
  return new Promise((ok, bad) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => bad(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((ok, bad) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
}

export const projects = {
  list: async () => (await tx<Project[]>('readonly', (s) => s.getAll())).sort((a, b) => b.updated - a.updated),
  put: (p: Project) => tx('readwrite', (s) => s.put(p)),
  remove: (id: string) => tx('readwrite', (s) => s.delete(id)),
};

export interface Settings {
  geminiKey: string;
  geminiModel: string;
  showTips: boolean;
}

export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];

const SETTINGS_KEY = 'nts.settings';

export function loadSettings(): Settings {
  const def: Settings = { geminiKey: '', geminiModel: GEMINI_MODELS[0], showTips: true };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
