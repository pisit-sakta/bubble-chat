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

  // Edit a message's content: archive its current state + everything downstream
  // as a variant on this message, then update content + truncate downstream.
  async forkAtMessage(id: string, newPatch: Partial<Message>): Promise<number> {
    if (!this.current) return -1;
    const i = this.current.messages.findIndex(m => m.id === id);
    if (i === -1) return -1;
    const m = this.current.messages[i];
    const downstream = this.current.messages.slice(i + 1).map(snapshotMessage);

    if (!m.variants) m.variants = [];
    // Capture current state as a variant (the "old" version).
    m.variants.push({
      content: m.content,
      thinking: m.thinking,
      attachments: m.attachments,
      createdAt: m.createdAt,
      error: m.error,
      downstreamSnapshot: downstream,
    });
    // Apply the new (edit) patch as the new live state, with empty downstream snapshot.
    m.variants.push({
      content: newPatch.content ?? m.content,
      thinking: newPatch.thinking ?? undefined,
      attachments: newPatch.attachments ?? m.attachments,
      createdAt: Date.now(),
      error: undefined,
      downstreamSnapshot: [],
    });
    m.activeVariant = m.variants.length - 1;
    Object.assign(m, m.variants[m.activeVariant]);
    delete (m as any).downstreamSnapshot;
    // Truncate live conversation to this message
    this.current.messages = this.current.messages.slice(0, i + 1);
    this.current.updatedAt = Date.now();
    await this.saveCurrent();
    return i;
  }

  // Switch which variant of a message is active. Archives the current downstream,
  // restores the picked variant's downstream snapshot.
  async switchVariant(id: string, newIndex: number) {
    if (!this.current) return;
    const i = this.current.messages.findIndex(m => m.id === id);
    if (i === -1) return;
    const m = this.current.messages[i];
    if (!m.variants || newIndex < 0 || newIndex >= m.variants.length) return;
    const oldIndex = m.activeVariant ?? 0;
    if (oldIndex === newIndex) return;
    // Capture live downstream into the currently-active variant
    const liveDownstream = this.current.messages.slice(i + 1).map(snapshotMessage);
    m.variants[oldIndex] = {
      ...m.variants[oldIndex],
      content: m.content,
      thinking: m.thinking,
      attachments: m.attachments,
      error: m.error,
      downstreamSnapshot: liveDownstream,
    };
    // Switch in the picked variant
    const v = m.variants[newIndex];
    m.activeVariant = newIndex;
    m.content = v.content;
    m.thinking = v.thinking;
    m.attachments = v.attachments;
    m.error = v.error;
    this.current.messages = [...this.current.messages.slice(0, i + 1), ...(v.downstreamSnapshot || []).map(restoreSnapshot)];
    this.current.updatedAt = Date.now();
    await this.saveCurrent();
  }

  // Regenerate: archive current assistant message + downstream as variant, drop
  // the assistant message so a fresh stream produces a new sibling.
  // Returns true if a fork was prepared.
  async forkForRegenerate(id: string): Promise<boolean> {
    if (!this.current) return false;
    const i = this.current.messages.findIndex(m => m.id === id);
    if (i === -1 || this.current.messages[i].role !== 'assistant') return false;
    const m = this.current.messages[i];
    const downstream = this.current.messages.slice(i + 1).map(snapshotMessage);
    if (!m.variants) m.variants = [];
    m.variants.push({
      content: m.content,
      thinking: m.thinking,
      attachments: m.attachments,
      createdAt: m.createdAt,
      error: m.error,
      downstreamSnapshot: downstream,
    });
    // Mark this message as "regen-pending" — content cleared, will be replaced.
    m.activeVariant = m.variants.length;  // will become latest after streaming completes
    m.content = '';
    m.thinking = undefined;
    m.error = undefined;
    // Truncate downstream
    this.current.messages = this.current.messages.slice(0, i + 1);
    this.current.updatedAt = Date.now();
    await this.saveCurrent();
    return true;
  }

  // After a regen finishes, capture the current state into the activeVariant slot
  async finalizeRegenVariant(id: string) {
    if (!this.current) return;
    const m = this.current.messages.find(m => m.id === id);
    if (!m || !m.variants) return;
    const idx = m.activeVariant ?? m.variants.length;
    m.variants[idx] = {
      content: m.content,
      thinking: m.thinking,
      attachments: m.attachments,
      createdAt: m.createdAt,
      error: m.error,
      downstreamSnapshot: [],
    };
    m.activeVariant = idx;
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

function snapshotMessage(m: Message): Message {
  // Deep-ish clone for variant storage
  return JSON.parse(JSON.stringify(m));
}
function restoreSnapshot(m: Message): Message {
  return { ...m };
}

function cryptoRandom() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const store = new Store();
export const newId = cryptoRandom;
