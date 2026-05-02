import type { Settings, Conversation, Message } from './types';
import { DEFAULT_SETTINGS } from './defaults';
import {
  loadSettings, saveSettings,
  listConversations, getConversation, saveConversation, deleteConversation,
  getKv, setKv,
} from './db';

type Listener = () => void;

class Store {
  settings: Settings = { ...DEFAULT_SETTINGS };
  conversations: Conversation[] = [];
  current: Conversation | null = null;
  streaming = false;
  listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  async init() {
    const saved = await loadSettings();
    if (saved) this.settings = { ...DEFAULT_SETTINGS, ...saved };
    this.conversations = await listConversations();
    const lastId = (await getKv<string>('lastConversationId')) || undefined;
    if (lastId) {
      const c = await getConversation(lastId);
      if (c) this.current = c;
    }
    this.emit();
  }

  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    await saveSettings(this.settings);
    this.emit();
  }

  async newConversation(): Promise<Conversation> {
    const c: Conversation = {
      id: cryptoRandom(),
      title: 'New chat',
      messages: [],
      model: this.settings.claude_model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.conversations = [c, ...this.conversations];
    this.current = c;
    await saveConversation(c);
    await setKv('lastConversationId', c.id);
    this.emit();
    return c;
  }

  async selectConversation(id: string) {
    const c = await getConversation(id);
    if (c) {
      this.current = c;
      await setKv('lastConversationId', id);
      this.emit();
    }
  }

  async deleteCurrentConversation(id: string) {
    await deleteConversation(id);
    this.conversations = this.conversations.filter(c => c.id !== id);
    if (this.current?.id === id) {
      this.current = this.conversations[0] || null;
      if (this.current) await setKv('lastConversationId', this.current.id);
      else await setKv('lastConversationId', '');
    }
    this.emit();
  }

  async appendMessage(m: Message) {
    if (!this.current) await this.newConversation();
    this.current!.messages.push(m);
    this.current!.updatedAt = Date.now();
    if (this.current!.messages.length === 1 && m.role === 'user') {
      this.current!.title = (m.content || '(message)').slice(0, 60);
    }
    await this.saveCurrent();
  }

  async updateMessage(id: string, patch: Partial<Message>) {
    if (!this.current) return;
    const i = this.current.messages.findIndex(m => m.id === id);
    if (i === -1) return;
    this.current.messages[i] = { ...this.current.messages[i], ...patch };
    this.current.updatedAt = Date.now();
    await this.saveCurrent();
  }

  async saveCurrent() {
    if (!this.current) return;
    await saveConversation(this.current);
    // Also re-sort conversations list
    this.conversations = await listConversations();
    this.emit();
  }
}

function cryptoRandom() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const store = new Store();
export const newId = cryptoRandom;
