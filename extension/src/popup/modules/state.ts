/**
 * Shared popup state — every module imports from here.
 */

import type { ChatMessage, EdgeAISettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

export const state = {
  modelReady: false,
  embeddingsReady: false,
  isStreaming: false,
  conversationHistory: [] as ChatMessage[],
  activeTab: 'chat',
  currentSessionId: '',
};

export let currentSettings: EdgeAISettings = { ...DEFAULT_SETTINGS };

export function setCurrentSettings(s: EdgeAISettings): void {
  currentSettings = s;
}
