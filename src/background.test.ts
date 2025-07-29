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
  },
};

// グローバルなchromeオブジェクトをモック
global.chrome = mockChrome as any;

describe('BackgroundTimer', () => {
  let backgroundTimer: BackgroundTimer;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // すべてのモックをリセット
    vi.clearAllMocks();
    
    // コンソールをモック
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Date.now() をモック
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
    
    // setTimeoutをモック
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
      fn();
      return 1 as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startBackgroundTimer', () => {
    it('should clear existing alarms and create new alarm', async () => {
      backgroundTimer = new BackgroundTimer();
      
      await backgroundTimer.startBackgroundTimer(300);
      
      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('pomodoroTimer');
      expect(mockChrome.alarms.create).toHaveBeenCalledWith('pomodoroTimer', {
        when: 1000000 + 300000, // Date.now() + timeLeft * 1000
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('Background timer started for 300 seconds');
    });
  });

  describe('stopBackgroundTimer', () => {
    it('should clear alarms', async () => {
      backgroundTimer = new BackgroundTimer();
      
      await backgroundTimer.stopBackgroundTimer();
      
      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('pomodoroTimer');
      expect(consoleLogSpy).toHaveBeenCalledWith('Background timer stopped');
    });
  });

  describe('handleTimerComplete', () => {
    it('should update state and open notification page', async () => {
      const mockStorageResult = {
        pomodoroState: {
          timeLeft: 100,
          isRunning: true,
          lastSaveTime: 999000,
        },
      };
      
      mockChrome.storage.local.get.mockResolvedValue(mockStorageResult);
      backgroundTimer = new BackgroundTimer();
      
      await backgroundTimer.handleTimerComplete();
      
      // 状態更新の確認
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        pomodoroState: {
          timeLeft: 100,
          isRunning: false,
          isCompleted: true,
          lastSaveTime: 1000000,
        },
      });
      
      // 通知ページ開始の確認
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test/notification.html',
      });
      
      // リセット処理の確認（setTimeoutがすぐ実行されるモック）
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        pomodoroState: {
          timeLeft: 25 * 60,
          isRunning: false,
          isCompleted: false,
          lastSaveTime: 1000000,
        },
      });
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Timer completed in background');
    });

    it('should handle notification page creation error', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});
      mockChrome.tabs.create.mockRejectedValue(new Error('Tab creation failed'));
      
      backgroundTimer = new BackgroundTimer();
      
      await backgroundTimer.handleTimerComplete();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to open notification page:',
        expect.any(Error)
      );
    });
  });

  describe('restoreTimer', () => {
    it('should start background timer when timer is running with remaining time', async () => {
      const mockStorageResult = {
        pomodoroState: {
          timeLeft: 300,
          isRunning: true,
          lastSaveTime: 995000, // 5秒前
        },
      };
      
      mockChrome.storage.local.get.mockResolvedValue(mockStorageResult);
      backgroundTimer = new BackgroundTimer();
      
      const startTimerSpy = vi.spyOn(backgroundTimer, 'startBackgroundTimer').mockResolvedValue();
      
      await backgroundTimer.restoreTimer();
      
      // 経過時間を差し引いた残り時間でタイマー開始
      expect(startTimerSpy).toHaveBeenCalledWith(295); // 300 - 5
    });

    it('should complete timer when remaining time is 0', async () => {
      const mockStorageResult = {
        pomodoroState: {
          timeLeft: 300,
          isRunning: true,
          lastSaveTime: 700000, // 300秒以上前
        },
      };
      
      mockChrome.storage.local.get.mockResolvedValue(mockStorageResult);
      backgroundTimer = new BackgroundTimer();
      
      const completeTimerSpy = vi.spyOn(backgroundTimer, 'handleTimerComplete').mockResolvedValue();
      
      await backgroundTimer.restoreTimer();
      
      expect(completeTimerSpy).toHaveBeenCalled();
    });

    it('should do nothing when no running timer state exists', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});
      backgroundTimer = new BackgroundTimer();
      
      const startTimerSpy = vi.spyOn(backgroundTimer, 'startBackgroundTimer').mockResolvedValue();
      const completeTimerSpy = vi.spyOn(backgroundTimer, 'handleTimerComplete').mockResolvedValue();
      
      await backgroundTimer.restoreTimer();
      
      expect(startTimerSpy).not.toHaveBeenCalled();
      expect(completeTimerSpy).not.toHaveBeenCalled();
    });

    it('should do nothing when timer is not running', async () => {
      const mockStorageResult = {
        pomodoroState: {
          timeLeft: 300,
          isRunning: false,
          lastSaveTime: 999000,
        },
      };
      
      mockChrome.storage.local.get.mockResolvedValue(mockStorageResult);
      backgroundTimer = new BackgroundTimer();
      
      const startTimerSpy = vi.spyOn(backgroundTimer, 'startBackgroundTimer').mockResolvedValue();
      const completeTimerSpy = vi.spyOn(backgroundTimer, 'handleTimerComplete').mockResolvedValue();
      
      await backgroundTimer.restoreTimer();
      
      expect(startTimerSpy).not.toHaveBeenCalled();
      expect(completeTimerSpy).not.toHaveBeenCalled();
    });
  });

  describe('constructor and event listeners', () => {
    it('should set up storage and alarm listeners', () => {
      backgroundTimer = new BackgroundTimer();
      
      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();
      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });
  });
});