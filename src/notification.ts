document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      // バックグラウンドにタイマー開始コマンドを送信
      chrome.runtime.sendMessage({ type: 'START_TIMER' });

      // バックグラウンドにポップアップを開くコマンドを送信
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });

      // 現在のタブを閉じる
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    });
  }
});