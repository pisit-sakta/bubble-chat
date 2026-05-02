import type { Settings } from './types';

// Cribbed from your local SillyTavern data/default-user/settings.json.
// These get used until the user runs "Sync from SillyTavern" (which overwrites with live values).
export const DEFAULT_SETTINGS: Settings = {
  // API Connections
  chat_completion_source: 'claude',
  reverse_proxy: '',
  proxy_password: '',
  claude_model: 'claude-opus-4-5',
  claude_alt_model: 'claude-opus-4-6',
  compact_model: 'claude-opus-4-6',
  custom_model: '',
  custom_url: '',
  bypass_status_check: false,
  show_external_models: false,

  // Sampling
  temp_openai: 1,
  top_p_openai: 1,
  top_k_openai: 0,
  freq_pen_openai: 0,
  pres_pen_openai: 0,
  repetition_penalty_openai: 1,
  min_p_openai: 0,
  top_a_openai: 0,

  // Limits
  openai_max_tokens: 64000,
  openai_max_context: 2000000,
  max_context_unlocked: true,
  seed: -1,
  n: 1,

  // Behavior
  stream_openai: true,
  reasoning_effort: 'auto',
  show_thoughts: true,
  squash_system_messages: false,
  use_sysprompt: false,
  names_behavior: 0,
  verbosity: 'auto',
  tool_reasoning_mode: 'disabled',
  function_calling: false,
  enable_web_search: false,

  // Prompts
  system_prompt: '',
  system_prompt_enabled: false,
  userstyle1_name: 'Style 1',
  userstyle1: '',
  userstyle1_enabled: false,
  userstyle2_name: 'Style 2',
  userstyle2: '',
  userstyle2_enabled: false,
  assistant_prefill: '',
  assistant_impersonation: '',
  continue_prefill: false,
  continue_postfix: ' ',
  continue_nudge_prompt: '[Continue your last message without repeating its original content.]',
  new_chat_prompt: '[Start a new Chat]',
  new_example_chat_prompt: '[Example Chat]',
  new_group_chat_prompt: '[Start a new group chat. Group members: {{group}}]',
  impersonation_prompt: "[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Write 1 reply only in internet RP style. Don't write as {{char}} or system. Don't describe actions of {{char}}.]",
  group_nudge_prompt: '[Write the next reply only as {{char}}.]',
  personality_format: '{{personality}}',
  scenario_format: '{{scenario}}',
  wi_format: '{0}',
  send_if_empty: '',

  // Bubble-specific (sync source)
  st_url: '',
  st_basic_user: '',
  st_basic_pass: '',
};

export const CLAUDE_MODELS = [
  'claude-opus-4-6',
  'claude-opus-4-5',
  'claude-opus-4-1',
  'claude-opus-4',
  'claude-sonnet-4-7',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4',
  'claude-3-7-sonnet',
  'claude-3-5-sonnet',
  'claude-3-5-haiku',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
];
