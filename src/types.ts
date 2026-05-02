// All settings tracked. Mirrors what's in ST's "AI Response Configuration" + "API Connections" tabs.
// Naming kept close to ST's `oai_settings.*` keys so bootstrap-from-ST is a 1:1 copy.

export type ChatCompletionSource = 'claude' | 'openai' | 'custom';

export interface Settings {
  // ── API Connections ──
  chat_completion_source: ChatCompletionSource;
  reverse_proxy: string;          // e.g. https://claude-code-proxy-production.up.railway.app/v1
  proxy_password: string;         // sent as Bearer token
  claude_model: string;
  custom_model: string;
  custom_url: string;
  bypass_status_check: boolean;
  show_external_models: boolean;

  // ── Sampling ──
  temp_openai: number;
  top_p_openai: number;
  top_k_openai: number;
  freq_pen_openai: number;
  pres_pen_openai: number;
  repetition_penalty_openai: number;
  min_p_openai: number;
  top_a_openai: number;

  // ── Limits ──
  openai_max_tokens: number;
  openai_max_context: number;
  max_context_unlocked: boolean;
  seed: number;
  n: number;

  // ── Behavior ──
  stream_openai: boolean;
  reasoning_effort: 'auto' | 'low' | 'medium' | 'high';
  show_thoughts: boolean;
  squash_system_messages: boolean;
  use_sysprompt: boolean;
  names_behavior: number;
  verbosity: 'auto' | 'low' | 'medium' | 'high';
  tool_reasoning_mode: 'disabled' | 'auto' | 'always';
  function_calling: boolean;
  enable_web_search: boolean;

  // ── Prompts ──
  system_prompt: string;          // Bubble-specific: system message used by default
  assistant_prefill: string;
  assistant_impersonation: string;
  continue_prefill: boolean;
  continue_postfix: string;
  continue_nudge_prompt: string;
  new_chat_prompt: string;
  new_example_chat_prompt: string;
  new_group_chat_prompt: string;
  impersonation_prompt: string;
  group_nudge_prompt: string;
  personality_format: string;
  scenario_format: string;
  wi_format: string;
  send_if_empty: string;

  // ── Bubble-specific ──
  st_url: string;                 // Used only for the "re-sync from SillyTavern" feature
  st_basic_user: string;
  st_basic_pass: string;
}

export interface Attachment {
  id: string;
  kind: 'image' | 'pdf' | 'text';
  name: string;
  mime: string;
  size: number;
  // For images: data URL (base64). For text: extracted plain text. For PDF: extracted text + filename.
  dataUrl?: string;
  text?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;             // captured if model returns reasoning content
  attachments?: Attachment[];
  createdAt: number;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  systemPromptOverride?: string;  // optional per-chat override
  createdAt: number;
  updatedAt: number;
}
