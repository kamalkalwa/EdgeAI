/**
 * Stealth Mode — Picture-in-Picture (ADR-010)
 *
 * Opens the full EdgeAI popup UI inside a Document PiP window via iframe.
 * PiP windows are excluded from screen capture (getDisplayMedia),
 * making this invisible to screen sharing participants.
 *
 * This extension page acts as the "opener" — the PiP window stays
 * alive as long as this tab is open.
 */

const btnLaunch = document.getElementById('btn-launch') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;

let pipWindow: Window | null = null;

btnLaunch.addEventListener('click', async () => {
  // Check API availability
  if (!('documentPictureInPicture' in window)) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Picture-in-Picture is not supported in your browser. Chrome 116+ required.';
    return;
  }

  btnLaunch.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Opening stealth window…';

  try {
    // TypeScript doesn't have types for Document PiP yet
    const docPip = (window as unknown as {
      documentPictureInPicture: {
        requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
      };
    }).documentPictureInPicture;

    pipWindow = await docPip.requestWindow({ width: 400, height: 600 });

    // Load the full popup UI inside the PiP window via iframe.
    // The ?stealth=1 param tells popup.ts to adapt its layout (fill PiP, hide stealth button).
    const doc = pipWindow.document;
    doc.body.style.margin = '0';
    doc.body.style.overflow = 'hidden';

    const iframe = doc.createElement('iframe');
    iframe.src = chrome.runtime.getURL('src/popup/popup.html?stealth=1');
    iframe.style.cssText = 'width:100%; height:100vh; border:none;';
    doc.body.appendChild(iframe);

    statusEl.className = 'status active';
    statusEl.textContent = 'Stealth mode is active. This window is invisible to screen sharing.';
    btnLaunch.textContent = 'Relaunch Stealth Chat';
    btnLaunch.disabled = false;

    // Detect PiP close
    pipWindow.addEventListener('pagehide', () => {
      pipWindow = null;
      statusEl.className = 'status';
      statusEl.textContent = 'Stealth chat closed.';
    });
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = `Failed to open: ${err instanceof Error ? err.message : String(err)}`;
    btnLaunch.disabled = false;
  }
});

export {};
