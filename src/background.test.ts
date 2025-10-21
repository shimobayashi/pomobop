import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundTimer } from './background';

// Chrome API モック
const mockChrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    create: vi.fn(),
  },
  runtime: {
    getURL: vi.fn().mockReturnValue('chrome-extension://test/notification.html'),
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
};

// グローバルなchromeオブジェクトをモック
(globalThis as any).chrome = mockChrome;

describe('BackgroundTimer', () => {
  let backgroundTimer: BackgroundTimer;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // すべてのモックをリセット
    vi.clearAllMocks();

    // デフォルトでchromeストレージは空を返すようにセット
    mockChrome.storage.local.get.mockResolvedValue({});

    // chrome.runtime.getURLのモック
    mockChrome.runtime.getURL.mockReturnValue('chrome-extension://test/notification.html');

    // コンソールをモック
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Date.now() をモック
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should set up message and alarm listeners', () => {
      backgroundTimer = new BackgroundTimer();

      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should create sync alarm on startup', async () => {
      backgroundTimer = new BackgroundTimer();

      // 少し待ってから確認（非同期初期化のため）
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('pomodoroSync', {
        delayInMinutes: 0.5,
        periodInMinutes: 0.5
      });
    });
  });

  describe('command handling', () => {
    beforeEach(async () => {
      backgroundTimer = new BackgroundTimer();

      // 初期化完了を待つ
      await new Promise(resolve => setTimeout(resolve, 10));

      // 初期化時のアラーム・ストレージ呼び出しのみクリア
      mockChrome.alarms.create.mockClear();
      mockChrome.alarms.clear.mockClear();
      mockChrome.storage.local.set.mockClear();
    });

    it('should handle START_TIMER command', async () => {
      const message = { type: 'START_TIMER' };

      // onMessage.addListenerに渡されたコールバック関数を取得
      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // メッセージハンドラーを呼び出し（非同期処理の完了を待つ）
      await messageHandler(message, {}, () => {});

      // 非同期処理が完了するまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 10));

      // タイマー開始の確認 - pomodoroTimerアラームが作成されること
      expect(mockChrome.alarms.create).toHaveBeenCalledWith('pomodoroTimer', {
        when: 1000000 + (25 * 60 * 1000) // 現在時刻 + 25分
      });
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('should handle PAUSE_TIMER command', async () => {
      const message = { type: 'PAUSE_TIMER' };

      // まずタイマーを開始状態にする
      const startMessage = { type: 'START_TIMER' };
      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      await messageHandler(startMessage, {}, () => {});

      // モックをクリア
      vi.clearAllMocks();

      // 一時停止
      await messageHandler(message, {}, () => {});

      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('pomodoroTimer');
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('should handle RESET_TIMER command', async () => {
      const message = { type: 'RESET_TIMER' };

      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      await messageHandler(message, {}, () => {});

      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('pomodoroTimer');
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        pomodoroState: expect.objectContaining({
          timeLeft: 25 * 60,
          isRunning: false,
          sessionType: 'work',
          cyclePosition: 1
        })
      });
    });

    it('should handle SET_TIME command', async () => {
      const message = { type: 'SET_TIME', timeLeft: 300 };

      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      await messageHandler(message, {}, () => {});

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        pomodoroState: expect.objectContaining({
          timeLeft: 300
        })
      });
    });

    it('should handle SET_TIME_AND_RESET command', async () => {
      const message = { type: 'SET_TIME_AND_RESET', timeLeft: 900 };

      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      await messageHandler(message, {}, () => {});

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        pomodoroState: expect.objectContaining({
          timeLeft: 900,
          isRunning: false,
          sessionType: 'work',
          cyclePosition: 1
        })
      });
    });
  });

  describe('timer completion', () => {
    it('should handle timer completion correctly', async () => {
      backgroundTimer = new BackgroundTimer();

      await backgroundTimer.handleTimerComplete();

      // 通知ページを開く
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test/notification.html'
      });

      // 次のセッションに遷移（2番目のサイクル、短い休憩）
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        pomodoroState: expect.objectContaining({
          timeLeft: 5 * 60, // 短い休憩は5分
          isRunning: false,
          sessionType: 'shortBreak',
          cyclePosition: 2
        })
      });
    });

    it('should handle tab creation error gracefully', async () => {
      mockChrome.tabs.create.mockRejectedValue(new Error('Tab creation failed'));
      backgroundTimer = new BackgroundTimer();

      await backgroundTimer.handleTimerComplete();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to open notification page:',
        expect.any(Error)
      );
    });
  });

  describe('state restoration', () => {
    it('should restore running timer from storage', async () => {
      const mockStorageResult = {
        pomodoroState: {
          timeLeft: 300,
          isRunning: true,
          endTime: 1000000 + 300000, // 5分後
          sessionType: 'work',
          cyclePosition: 1,
          startTime: 1000000 - 300000,
          pausedAt: null,
          pausedDuration: 0,
          lastSaveTime: 995000
        }
      };

      mockChrome.storage.local.get.mockResolvedValue(mockStorageResult);
      backgroundTimer = new BackgroundTimer();

      // 少し待って初期化完了を待つ
      await new Promise(resolve => setTimeout(resolve, 10));

      // タイマーアラームが設定されることを確認
      expect(mockChrome.alarms.create).toHaveBeenCalledWith('pomodoroTimer', {
        when: 1000000 + 300000
      });
    });

    it('should complete timer if time has already passed', async () => {
      const mockStorageResult = {
        pomodoroState: {
          timeLeft: 300,
          isRunning: true,
          endTime: 1000000 - 100000, // 過去の時刻
          sessionType: 'work',
          cyclePosition: 1,
          startTime: 1000000 - 400000,
          pausedAt: null,
          pausedDuration: 0,
          lastSaveTime: 950000
        }
      };

      mockChrome.storage.local.get.mockResolvedValue(mockStorageResult);
      backgroundTimer = new BackgroundTimer();

      // 少し待って初期化完了を待つ
      await new Promise(resolve => setTimeout(resolve, 10));

      // タイマー完了処理が呼ばれることを確認
      expect(mockChrome.tabs.create).toHaveBeenCalled();
    });

    it('should do nothing when no saved state exists', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});
      backgroundTimer = new BackgroundTimer();

      await new Promise(resolve => setTimeout(resolve, 10));

      // タイマーアラームは設定されない（同期アラームのみ）
      expect(mockChrome.alarms.create).not.toHaveBeenCalledWith('pomodoroTimer', expect.anything());
    });
  });

  describe('session cycle management', () => {
    it('should cycle through sessions correctly', async () => {
      backgroundTimer = new BackgroundTimer();

      // 8回完了して1周期をテスト
      for (let i = 1; i <= 8; i++) {
        await backgroundTimer.handleTimerComplete();

        const expectedSessionType = i % 2 === 1 ? 'shortBreak' : (i === 8 ? 'work' : 'work');
        const expectedCyclePosition = i === 8 ? 1 : i + 1;

        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
          pomodoroState: expect.objectContaining({
            cyclePosition: expectedCyclePosition
          })
        });
      }
    });
  });

  describe('sync alarm handling', () => {
    it('should send sync messages when running', async () => {
      backgroundTimer = new BackgroundTimer();

      // タイマーを開始状態にする
      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      await messageHandler({ type: 'START_TIMER' }, {}, () => {});

      // アラームハンドラーを取得
      const alarmHandler = mockChrome.alarms.onAlarm.addListener.mock.calls[0][0];

      // 同期アラームを発火
      await alarmHandler({ name: 'pomodoroSync' });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'STATE_SYNC',
        endTime: expect.any(Number),
        sessionType: 'work',
        cyclePosition: 1,
        isRunning: true,
        timeLeft: expect.any(Number)
      });
    });

    it('should handle timer completion alarm', async () => {
      backgroundTimer = new BackgroundTimer();

      const alarmHandler = mockChrome.alarms.onAlarm.addListener.mock.calls[0][0];

      // タイマー完了アラームを発火
      await alarmHandler({ name: 'pomodoroTimer' });

      // 通知ページが開かれることを確認
      expect(mockChrome.tabs.create).toHaveBeenCalled();
    });
  });
});