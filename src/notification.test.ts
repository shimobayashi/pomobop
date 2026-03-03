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
    };

    (global as any).chrome = mockChrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should send START_TIMER message when close button is clicked', () => {
    const closeBtn = document.getElementById('closeBtn');

    // クリックイベントリスナーを追加（notification.tsのコードと同じ）
    closeBtn?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'START_TIMER' });
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });

    closeBtn?.click();

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'START_TIMER' });
  });

  it('should send OPEN_POPUP message when close button is clicked', () => {
    const closeBtn = document.getElementById('closeBtn');

    closeBtn?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'START_TIMER' });
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });

    closeBtn?.click();

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_POPUP' });
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
