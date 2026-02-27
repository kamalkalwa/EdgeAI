/**
 * Onboarding Wizard — first-run import flow.
 */

import { state } from './state';
import { $, showToast, chatMessages, chatInput, pdfFileInput } from './dom';
import { sendChat } from './chat';
import { showWelcomeMessage } from './sessions';

let onboardingImportedTitle = '';

export async function isFirstRun(): Promise<boolean> {
  const result = await chrome.storage.local.get('onboardingComplete').catch(() => null);
  return !result?.onboardingComplete;
}

async function completeOnboarding(): Promise<void> {
  await chrome.storage.local.set({ onboardingComplete: true }).catch(console.error);
  $('onboarding').style.display = 'none';
  chatMessages.style.display = '';
  showWelcomeMessage();
}

function goToOnboardingStep(step: number): void {
  for (let i = 1; i <= 3; i++) {
    const el = $(`onboarding-step-${i}`);
    if (i === step) el.classList.add('active');
    else el.classList.remove('active');
  }
}

function advanceToStep3(title?: string): void {
  goToOnboardingStep(3);
  if (title) {
    onboardingImportedTitle = title;
    const suggestedQ = $('onboarding-suggested-q') as HTMLButtonElement;
    const suggestion = $('onboarding-suggestion');
    suggestedQ.textContent = `"What's in ${title}?"`;
    suggestedQ.style.display = '';
    suggestion.textContent = `Your data has been imported. Try asking a question about "${title}".`;
  }
}

export function showOnboarding(): void {
  chatMessages.style.display = 'none';
  $('onboarding').style.display = '';
  goToOnboardingStep(1);

  $('onboarding-next-1').addEventListener('click', () => goToOnboardingStep(2));

  $('onboarding-skip').addEventListener('click', () => completeOnboarding());

  $('onboarding-skip-2').addEventListener('click', () => completeOnboarding());

  // Step 2 import handlers
  $('onboarding-import-obsidian').addEventListener('click', async () => {
    if (!state.embeddingsReady) {
      showToast('Models still loading — please wait');
      return;
    }
    try {
      const btn = $('onboarding-import-obsidian') as HTMLButtonElement;
      btn.textContent = 'Opening vault…';
      const { selectVault, readVault } = await import('@/lib/connectors/obsidian');
      const vaultHandle = await selectVault();
      let count = 0;
      let firstTitle = '';
      for await (const doc of readVault(vaultHandle)) {
        await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
        if (!firstTitle) firstTitle = doc.metadata?.title ?? '';
        count++;
        btn.textContent = `Indexing… ${count} files`;
      }
      btn.textContent = `✓ ${count} files imported`;
      advanceToStep3(firstTitle || 'your vault');
    } catch {
      ($('onboarding-import-obsidian') as HTMLButtonElement).textContent = '🗃️  Import Obsidian Vault';
    }
  });

  $('onboarding-import-pdf').addEventListener('click', async () => {
    if (!state.embeddingsReady) {
      showToast('Models still loading — please wait');
      return;
    }
    pdfFileInput.click();
    pdfFileInput.addEventListener('change', async function onboardPdf() {
      pdfFileInput.removeEventListener('change', onboardPdf);
      const files = pdfFileInput.files;
      if (!files || files.length === 0) return;
      const btn = $('onboarding-import-pdf') as HTMLButtonElement;
      btn.textContent = 'Indexing…';
      const { indexPdfFiles } = await import('@/lib/connectors/pdf');
      let count = 0;
      let firstTitle = '';
      try {
        for await (const doc of indexPdfFiles(files)) {
          await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
          if (!firstTitle) firstTitle = doc.metadata?.title ?? '';
          count++;
        }
      } catch { /* ignore */ }
      btn.textContent = `✓ ${count} PDF${count !== 1 ? 's' : ''} imported`;
      pdfFileInput.value = '';
      advanceToStep3(firstTitle || 'your PDF');
    }, { once: true });
  });

  $('onboarding-index-tab').addEventListener('click', async () => {
    if (!state.embeddingsReady) {
      showToast('Models still loading — please wait');
      return;
    }
    const btn = $('onboarding-index-tab') as HTMLButtonElement;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id || !activeTab.url ||
          activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
        showToast('Cannot index this page');
        return;
      }
      btn.textContent = 'Indexing…';
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_CONTENT_FOR_INDEX' });
      if (!response?.payload?.content) {
        showToast('Could not extract content');
        btn.textContent = '🌐  Index Current Tab';
        return;
      }
      const { url, title, content } = response.payload;
      await chrome.runtime.sendMessage({
        type: 'INDEX_DOCUMENT',
        payload: {
          content,
          metadata: {
            title: title || url,
            source: 'web_page',
            sourcePath: url,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      });
      btn.textContent = `✓ "${title}" indexed`;
      advanceToStep3(title || 'this page');
    } catch {
      btn.textContent = '🌐  Index Current Tab';
      showToast('Failed to index tab');
    }
  });

  // Step 3: suggested question
  $('onboarding-suggested-q').addEventListener('click', async () => {
    await completeOnboarding();
    chatInput.value = `What's in ${onboardingImportedTitle}?`;
    chatInput.dispatchEvent(new Event('input'));
    sendChat();
  });

  // Step 3: start chatting
  $('onboarding-done').addEventListener('click', () => completeOnboarding());
}
