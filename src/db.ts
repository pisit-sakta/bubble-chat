import { openDB, type IDBPDatabase } from 'idb';
import type { Conversation, Settings } from './types';

const DB_NAME = 'bubble';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('conversations')) {
          const store = db.createObjectStore('conversations', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      },
    });
  }
  return dbPromise;
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('conversations', 'updatedAt');
  return all.reverse();
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDb();
  return db.get('conversations', id);
}

export async function saveConversation(c: Conversation): Promise<void> {
  const db = await getDb();
  await db.put('conversations', c);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('conversations', id);
}

export async function loadSettings(): Promise<Settings | undefined> {
  const db = await getDb();
  return db.get('kv', 'settings');
}

export async function saveSettings(s: Settings): Promise<void> {
  const db = await getDb();
  await db.put('kv', s, 'settings');
}

export async function getKv<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return db.get('kv', key);
}

export async function setKv(key: string, val: unknown): Promise<void> {
  const db = await getDb();
  await db.put('kv', val, key);
}
