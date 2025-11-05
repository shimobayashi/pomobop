document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      // バックグラウンドにタイマー開始コマンドを送信（応答を待たない）
      chrome.runtime.sendMessage({ type: 'START_TIMER' });

      // 現在のタブを閉じる
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    });
  }
});