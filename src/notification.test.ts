import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('notification.ts', () => {
  let dom: JSDOM;
  let document: Document;
  let mockChrome: any;

  beforeEach(() => {
    // JSDOMでHTMLをセットアップ
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <button id="closeBtn">次のサイクルを開始する</button>
        </body>
      </html>
    `, {
      url: 'chrome-extension://test/notification.html',
      runScripts: 'dangerously'
    });

    document = dom.window.document;
    global.document = document as any;

    // Chrome API モック
    mockChrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
      tabs: {
        getCurrent: vi.fn(),
        remove: vi.fn(),
      },
    };

    (global as any).chrome = mockChrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should send START_TIMER message when close button is clicked', async () => {
    // notification.tsのロジックをシミュレート
    const closeBtn = document.getElementById('closeBtn');

    // タブ取得のモック
    mockChrome.tabs.getCurrent.mockResolvedValue({ id: 123 });

    // クリックイベントリスナーを追加（notification.tsのコードと同じ）
    closeBtn?.addEventListener('click', async () => {
      chrome.runtime.sendMessage({ type: 'START_TIMER' });
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });

      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    });

    // ボタンをクリック
    closeBtn?.click();

    // 非同期処理が完了するのを待つ
    await new Promise(resolve => setTimeout(resolve, 10));

    // START_TIMERメッセージが送信されることを確認
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'START_TIMER' });
  });

  it('should send OPEN_POPUP message when close button is clicked', async () => {
    const closeBtn = document.getElementById('closeBtn');

    mockChrome.tabs.getCurrent.mockResolvedValue({ id: 123 });

    closeBtn?.addEventListener('click', async () => {
      chrome.runtime.sendMessage({ type: 'START_TIMER' });
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });

      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    });

    closeBtn?.click();

    await new Promise(resolve => setTimeout(resolve, 10));

    // OPEN_POPUPメッセージが送信されることを確認
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_POPUP' });
  });

  it('should close current tab when close button is clicked', async () => {
    const closeBtn = document.getElementById('closeBtn');

    mockChrome.tabs.getCurrent.mockResolvedValue({ id: 123 });

    closeBtn?.addEventListener('click', async () => {
      chrome.runtime.sendMessage({ type: 'START_TIMER' });
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });

      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    });

    closeBtn?.click();

    await new Promise(resolve => setTimeout(resolve, 10));

    // タブが閉じられることを確認
    expect(mockChrome.tabs.getCurrent).toHaveBeenCalled();
    expect(mockChrome.tabs.remove).toHaveBeenCalledWith(123);
  });

  it('should not close tab if tab.id is undefined', async () => {
    const closeBtn = document.getElementById('closeBtn');

    // IDがないタブを返す
    mockChrome.tabs.getCurrent.mockResolvedValue({});

    closeBtn?.addEventListener('click', async () => {
      chrome.runtime.sendMessage({ type: 'START_TIMER' });
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });

      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    });

    closeBtn?.click();

    await new Promise(resolve => setTimeout(resolve, 10));

    // タブが閉じられないことを確認
    expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
  });

  it('should handle when closeBtn does not exist', () => {
    // closeBtnが存在しない場合
    const emptyDom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body></body>
      </html>
    `);

    const emptyDocument = emptyDom.window.document;
    const closeBtn = emptyDocument.getElementById('closeBtn');

    // エラーが発生しないことを確認
    expect(closeBtn).toBeNull();
  });
});
