import type { Settings, Message } from './types';

// OpenAI Chat Completions request body
interface ContentTextPart  { type: 'text';      text: string; }
interface ContentImagePart { type: 'image_url'; image_url: { url: string }; }
type ContentPart = ContentTextPart | ContentImagePart;

interface RequestMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

interface RequestBody {
  model: string;
  messages: RequestMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  n?: number;
  stream?: boolean;
}

export interface StreamCallbacks {
  onText: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onDone: (full: { text: string; thinking?: string }) => void;
  onError: (error: Error) => void;
}

// Build the messages array from our internal Message[] + attachments.
// Images become OpenAI vision parts. Text/PDF attachments are inlined as text blocks.
function buildRequestMessages(history: Message[], systemPrompt: string): RequestMessage[] {
  const out: RequestMessage[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    out.push({ role: 'system', content: systemPrompt });
  }
  for (const m of history) {
    if (m.role === 'system') continue; // system handled above
    const parts: ContentPart[] = [];
    let textBody = m.content || '';
    const fileAttachments = (m.attachments || []).filter(a => a.kind !== 'image');
    if (fileAttachments.length) {
      const filesBlock = fileAttachments
        .map(a => `<attached_file name="${a.name}" type="${a.mime}">\n${a.text || ''}\n</attached_file>`)
        .join('\n\n');
      textBody = filesBlock + (textBody ? '\n\n' + textBody : '');
    }
    if (textBody) parts.push({ type: 'text', text: textBody });
    for (const a of m.attachments || []) {
      if (a.kind === 'image' && a.dataUrl) {
        parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
      }
    }
    out.push({
      role: m.role,
      content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts.length ? parts : '',
    });
  }
  return out;
}

export async function streamChat(
  settings: Settings,
  messages: Message[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const url = settings.reverse_proxy.replace(/\/$/, '') + '/chat/completions';
  const model =
    settings.chat_completion_source === 'custom' && settings.custom_model
      ? settings.custom_model
      : settings.claude_model;

  const body: RequestBody = {
    model,
    messages: buildRequestMessages(messages, systemPrompt),
    stream: !!settings.stream_openai,
  };

  if (settings.temp_openai !== undefined) body.temperature = settings.temp_openai;
  if (settings.top_p_openai !== undefined && settings.top_p_openai !== 1) body.top_p = settings.top_p_openai;
  if (settings.top_k_openai && settings.top_k_openai > 0) body.top_k = settings.top_k_openai;
  if (settings.openai_max_tokens) body.max_tokens = settings.openai_max_tokens;
  if (settings.freq_pen_openai) body.frequency_penalty = settings.freq_pen_openai;
  if (settings.pres_pen_openai) body.presence_penalty = settings.pres_pen_openai;
  if (settings.seed !== undefined && settings.seed !== -1) body.seed = settings.seed;
  if (settings.n && settings.n > 1) body.n = settings.n;

  let fullText = '';
  let fullThinking = '';

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.proxy_password}`,
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 400)}`);
    }

    if (!body.stream) {
      const json: any = await resp.json();
      const text =
        json?.choices?.[0]?.message?.content ??
        json?.content?.[0]?.text ??
        '';
      const thinking = json?.choices?.[0]?.message?.reasoning_content ?? undefined;
      fullText = typeof text === 'string' ? text : Array.isArray(text) ? text.map((p: any) => p.text || '').join('') : '';
      if (thinking) fullThinking = thinking;
      if (fullText) callbacks.onText(fullText);
      if (fullThinking && callbacks.onThinking) callbacks.onThinking(fullThinking);
      callbacks.onDone({ text: fullText, thinking: fullThinking || undefined });
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const evt: any = JSON.parse(data);
          // OpenAI Chat Completions delta
          const delta = evt?.choices?.[0]?.delta;
          if (delta) {
            if (typeof delta.content === 'string' && delta.content) {
              fullText += delta.content;
              callbacks.onText(delta.content);
            } else if (Array.isArray(delta.content)) {
              for (const part of delta.content) {
                if (part?.type === 'text' && typeof part.text === 'string') {
                  fullText += part.text;
                  callbacks.onText(part.text);
                }
              }
            }
            if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
              fullThinking += delta.reasoning_content;
              callbacks.onThinking?.(delta.reasoning_content);
            }
            if (typeof delta.thinking === 'string' && delta.thinking) {
              fullThinking += delta.thinking;
              callbacks.onThinking?.(delta.thinking);
            }
          }
          // Anthropic-style fallback (some proxies pass through native events)
          if (evt?.type === 'content_block_delta' && evt?.delta) {
            if (evt.delta.type === 'text_delta' && evt.delta.text) {
              fullText += evt.delta.text;
              callbacks.onText(evt.delta.text);
            } else if (evt.delta.type === 'thinking_delta' && evt.delta.thinking) {
              fullThinking += evt.delta.thinking;
              callbacks.onThinking?.(evt.delta.thinking);
            }
          }
        } catch {
          /* skip bad chunk */
        }
      }
    }

    callbacks.onDone({ text: fullText, thinking: fullThinking || undefined });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      callbacks.onDone({ text: fullText, thinking: fullThinking || undefined });
      return;
    }
    callbacks.onError(e as Error);
  }
}

// ── Bootstrap from SillyTavern: pull live settings + prompts ──
export async function fetchSettingsFromST(stUrl: string, basicUser: string, basicPass: string): Promise<Partial<Settings> | null> {
  const url = stUrl.replace(/\/$/, '') + '/api/settings/get';
  const auth = btoa(`${basicUser}:${basicPass}`);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'X-CSRF-Token': await fetchCsrfToken(stUrl, auth),
      },
      body: JSON.stringify({}),
      credentials: 'omit',
    });
    if (!resp.ok) throw new Error(`ST returned HTTP ${resp.status}`);
    const json: any = await resp.json();
    const stRaw = typeof json?.settings === 'string' ? json.settings : JSON.stringify(json.settings || json);
    const parsed = JSON.parse(stRaw);
    return mapStOaiToSettings(parsed?.oai_settings || parsed);
  } catch (e) {
    console.warn('Bootstrap fetch failed:', e);
    return null;
  }
}

async function fetchCsrfToken(stUrl: string, auth: string): Promise<string> {
  const r = await fetch(stUrl.replace(/\/$/, '') + '/csrf-token', {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) return '';
  const j: any = await r.json().catch(() => ({}));
  return j?.token || '';
}

function mapStOaiToSettings(oai: any): Partial<Settings> {
  if (!oai || typeof oai !== 'object') return {};
  const pick = (k: string) => (k in oai ? oai[k] : undefined);
  const out: Partial<Settings> = {};
  const directKeys: (keyof Settings)[] = [
    'chat_completion_source', 'reverse_proxy', 'proxy_password',
    'claude_model', 'custom_model', 'custom_url',
    'bypass_status_check', 'show_external_models',
    'temp_openai', 'top_p_openai', 'top_k_openai',
    'freq_pen_openai', 'pres_pen_openai', 'repetition_penalty_openai',
    'min_p_openai', 'top_a_openai',
    'openai_max_tokens', 'openai_max_context', 'max_context_unlocked',
    'seed', 'n',
    'stream_openai', 'reasoning_effort', 'show_thoughts',
    'squash_system_messages', 'use_sysprompt', 'names_behavior',
    'verbosity', 'tool_reasoning_mode',
    'function_calling', 'enable_web_search',
    'assistant_prefill', 'assistant_impersonation',
    'continue_prefill', 'continue_postfix', 'continue_nudge_prompt',
    'new_chat_prompt', 'new_example_chat_prompt', 'new_group_chat_prompt',
    'impersonation_prompt', 'group_nudge_prompt',
    'personality_format', 'scenario_format', 'wi_format', 'send_if_empty',
  ];
  for (const k of directKeys) {
    const v = pick(k as string);
    if (v !== undefined) (out as any)[k] = v;
  }
  // Try to extract a system prompt from the prompts list
  if (Array.isArray(oai.prompts)) {
    const main = oai.prompts.find((p: any) => p?.identifier === 'main' || p?.name === 'Main Prompt');
    if (main?.content) out.system_prompt = main.content;
  }
  return out;
}

// ── Attachment helpers (file → Attachment) ──
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function fileToText(file: File): Promise<string> {
  return await file.text();
}
