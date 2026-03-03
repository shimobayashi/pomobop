document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      // バックグラウンドにタイマー開始コマンドを送信（background.tsが全通知タブを閉じる）
      chrome.runtime.sendMessage({ type: 'START_TIMER' });

      // バックグラウンドにポップアップを開くコマンドを送信
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });
  }
});