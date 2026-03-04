document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      // バックグラウンドにタイマー開始コマンドを送信（background.tsがポップアップ表示・通知タブ閉じ・タイマー開始を順に処理）
      chrome.runtime.sendMessage({ type: 'START_TIMER' });
    });
  }
});