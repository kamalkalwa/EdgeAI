/**
 * Mic Grant Page — Requests microphone permission in a full tab context.
 *
 * Chrome extension popups close when the browser permission dialog appears
 * (focus shifts away). This page opens in a regular tab where the dialog
 * works normally. Once permission is granted, this tab auto-closes and
 * the user can use voice input from the popup.
 */

const btnGrant = document.getElementById('btn-grant') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;

btnGrant.addEventListener('click', async () => {
  btnGrant.disabled = true;
  btnGrant.textContent = 'Requesting access…';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Release the stream immediately — we just needed the permission grant
    stream.getTracks().forEach((t) => t.stop());

    statusEl.className = 'status success';
    statusEl.textContent = 'Microphone access granted! You can now use voice input in EdgeAI.';
    btnGrant.textContent = 'Access Granted';

    // Auto-close after a short delay so the user sees the success message
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('NotAllowedError') || msg.includes('Permission denied') || msg.includes('Permission dismissed') || msg.includes('not allowed')) {
      statusEl.className = 'status error';
      statusEl.innerHTML =
        'Permission denied. To fix this:<br><br>' +
        '1. Click the lock icon in the address bar<br>' +
        '2. Find "Microphone" and set it to "Allow"<br>' +
        '3. Then click the button again';
    } else {
      statusEl.className = 'status error';
      statusEl.textContent = `Error: ${msg}`;
    }

    btnGrant.disabled = false;
    btnGrant.textContent = 'Try Again';
  }
});

export {};
