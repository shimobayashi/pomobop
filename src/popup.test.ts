import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PomodoroTimer } from './popup';

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
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
  },
};

// グローバルなchromeオブジェクトをモック
(globalThis as any).chrome = mockChrome;

describe('PomodoroTimer', () => {
  let timer: PomodoroTimer;

  beforeEach(() => {
    // HTMLをセットアップ
    document.body.innerHTML = `
      <div id="sessionType">作業中</div>
      <div id="progressDots"></div>
      <div id="timerDisplay">25:00</div>
      <button id="startBtn">開始</button>
      <button id="pauseBtn" disabled>一時停止</button>
      <button id="preset25">25分</button>
      <button id="preset15">15分</button>
      <button id="preset5">5分</button>
      <button id="preset1sec">1秒テスト</button>
    `;

    // モックをリセット
    vi.clearAllMocks();

    // デフォルトでstorageは空を返す
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.runtime.sendMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      timer = new PomodoroTimer();

      // 初期化完了を待つ（Promise.resolveで確実に待つ）
      await Promise.resolve();
      await Promise.resolve();

      expect(timer.getTimeLeft()).toBe(25 * 60);
      expect(timer.getIsRunning()).toBe(false);
      expect(timer.getSessionType()).toBe('work');
      expect(timer.getCyclePosition()).toBe(1);
    });

    it('should set up event listeners', () => {
      timer = new PomodoroTimer();

      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should attempt to get initial state from background', async () => {
      timer = new PomodoroTimer();

      // 初期化完了を待つ
      await Promise.resolve();
      await Promise.resolve();

      const sendMessageCalls = mockChrome.runtime.sendMessage.mock.calls;
      const getStateCall = sendMessageCalls.find(call => call[0]?.type === 'GET_STATE');
      expect(getStateCall).toBeDefined();
    });
  });

  describe('display calculation', () => {
    it('should show timeLeft when not running', async () => {
      const mockState = {
        timeLeft: 300,
        isRunning: false,
        sessionType: 'work' as const,
        cyclePosition: 1,
        endTime: null,
        startTime: null,
        pausedAt: null,
        pausedDuration: 0,
        lastSaveTime: Date.now()
      };

      mockChrome.storage.local.get.mockResolvedValue({ pomodoroState: mockState });
      timer = new PomodoroTimer();

      await Promise.resolve();
      await Promise.resolve();

      expect(timer.getTimeLeft()).toBe(300);

      const display = document.getElementById('timerDisplay');
      expect(display?.textContent).toBe('05:00');
    });

    it('should calculate time from endTime when running', async () => {
      const now = Date.now();
      const endTime = now + 300000; // 5分後

      const mockState = {
        timeLeft: 300,
        isRunning: true,
        sessionType: 'work' as const,
        cyclePosition: 1,
        endTime: endTime,
        startTime: now,
        pausedAt: null,
        pausedDuration: 0,
        lastSaveTime: now
      };

      mockChrome.storage.local.get.mockResolvedValue({ pomodoroState: mockState });

      // Date.nowをモック
      vi.spyOn(Date, 'now').mockReturnValue(now);

      timer = new PomodoroTimer();

      await Promise.resolve();
      await Promise.resolve();

      expect(timer.getTimeLeft()).toBe(300);
    });

    it('should start display loop when running', async () => {
      vi.useFakeTimers();

      const mockState = {
        timeLeft: 300,
        isRunning: true,
        sessionType: 'work' as const,
        cyclePosition: 1,
        endTime: Date.now() + 300000,
        startTime: Date.now(),
        pausedAt: null,
        pausedDuration: 0,
        lastSaveTime: Date.now()
      };

      mockChrome.storage.local.get.mockResolvedValue({ pomodoroState: mockState });
      timer = new PomodoroTimer();

      await Promise.resolve();
      await Promise.resolve();

      expect(timer.getIsRunning()).toBe(true);

      // 1秒進める
      vi.advanceTimersByTime(1000);

      // 表示が更新されることを確認（タイマーループが動作）
      const display = document.getElementById('timerDisplay');
      expect(display?.textContent).not.toBe('25:00'); // 初期値から変わっている

      vi.useRealTimers();
    });
  });

  describe('command sending', () => {
    beforeEach(async () => {
      timer = new PomodoroTimer();
      await new Promise(resolve => setTimeout(resolve, 10));
      vi.clearAllMocks(); // 初期化時のsendMessage呼び出しをクリア
    });

    it('should send START_TIMER command when start button clicked', async () => {
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
      startBtn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'START_TIMER'
      });
    });

    it('should send PAUSE_TIMER command when pause button clicked', async () => {
      // まず実行中の状態を設定
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
      pauseBtn.disabled = false; // ボタンを有効化

      pauseBtn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'PAUSE_TIMER'
      });
    });

    it('should send preset commands when preset buttons clicked', async () => {
      const preset25Btn = document.getElementById('preset25') as HTMLButtonElement;
      preset25Btn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      // プリセットボタンは SET_TIME_AND_RESET → START_TIMER の順で送信
      const calls = mockChrome.runtime.sendMessage.mock.calls;
      expect(calls).toContainEqual([{ type: 'SET_TIME_AND_RESET', timeLeft: 25 * 60 }]);
      expect(calls).toContainEqual([{ type: 'START_TIMER' }]);
    });

    it('should send correct time for 1-second test button', async () => {
      const preset1secBtn = document.getElementById('preset1sec') as HTMLButtonElement;
      preset1secBtn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      // 1秒プリセットのコマンドを確認
      const calls = mockChrome.runtime.sendMessage.mock.calls;
      expect(calls).toContainEqual([{ type: 'SET_TIME_AND_RESET', timeLeft: 1 }]);
      expect(calls).toContainEqual([{ type: 'START_TIMER' }]);
    });

    it('should send correct time for 5-minute preset button', async () => {
      const preset5Btn = document.getElementById('preset5') as HTMLButtonElement;
      preset5Btn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      // 5分プリセットのコマンドを確認
      const calls = mockChrome.runtime.sendMessage.mock.calls;
      expect(calls).toContainEqual([{ type: 'SET_TIME_AND_RESET', timeLeft: 5 * 60 }]);
      expect(calls).toContainEqual([{ type: 'START_TIMER' }]);
    });

    it('should send JUMP_TO_POSITION command when progress dot clicked', async () => {
      const progressDotsDisplay = document.getElementById('progressDots') as HTMLDivElement;

      // 進捗ドットを設定（position 3 にクリック）
      progressDotsDisplay.innerHTML = '<span data-position="3" style="cursor: pointer;">●</span>';

      const dotElement = progressDotsDisplay.querySelector('[data-position="3"]') as HTMLElement;
      dotElement.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'JUMP_TO_POSITION',
        position: 3
      });
    });

    it('should handle clicks on progress dots without position data', async () => {
      const progressDotsDisplay = document.getElementById('progressDots') as HTMLDivElement;

      // data-position属性がない要素
      progressDotsDisplay.innerHTML = '<span style="cursor: pointer;">●</span>';

      const dotElement = progressDotsDisplay.querySelector('span') as HTMLElement;
      dotElement.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      // JUMP_TO_POSITIONは送信されないはず
      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'JUMP_TO_POSITION' })
      );
    });

    it('should handle send command errors gracefully', async () => {
      mockChrome.runtime.sendMessage.mockRejectedValue(new Error('Could not establish connection'));

      const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
      startBtn.click();

      await new Promise(resolve => setTimeout(resolve, 10));

      // エラーが発生してもアプリが停止しないことを確認
      expect(timer.getIsRunning()).toBe(false); // 状態は変わらない
    });
  });

  describe('state synchronization', () => {
    beforeEach(async () => {
      timer = new PomodoroTimer();
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should sync state from chrome.storage.onChanged', () => {
      const mockState = {
        timeLeft: 600,
        isRunning: true,
        sessionType: 'shortBreak',
        cyclePosition: 2,
        endTime: Date.now() + 600000,
        startTime: Date.now(),
        pausedAt: null,
        pausedDuration: 0,
        lastSaveTime: Date.now()
      };

      // storage.onChanged.addListenerに渡されたコールバックを取得
      const storageChangeHandler = mockChrome.storage.onChanged.addListener.mock.calls[0][0];

      // 状態変更をシミュレート
      storageChangeHandler(
        { pomodoroState: { newValue: mockState } },
        'local'
      );

      expect(timer.getTimeLeft()).toBe(600);
      expect(timer.getIsRunning()).toBe(true);
      expect(timer.getSessionType()).toBe('shortBreak');
      expect(timer.getCyclePosition()).toBe(2);
    });

    it('should handle 30-second sync messages', () => {
      const syncMessage = {
        type: 'STATE_SYNC',
        endTime: Date.now() + 300000,
        sessionType: 'work' as const,
        cyclePosition: 1,
        isRunning: true,
        timeLeft: 300
      };

      // runtime.onMessage.addListenerに渡されたコールバックを取得
      const messageHandler = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

      // 同期メッセージをシミュレート
      messageHandler(syncMessage, {}, () => {});

      expect(timer.getTimeLeft()).toBe(300);
      expect(timer.getIsRunning()).toBe(true);
    });

    it('should correct display time when drift is detected', () => {
      const now = Date.now();
      const correctEndTime = now + 300000;
      const driftedEndTime = now + 305000; // 5秒ずれ

      // まず、ずれた状態を設定
      timer['displayState'].endTime = driftedEndTime;
      timer['displayState'].isRunning = true;

      const mockState = {
        timeLeft: 300,
        isRunning: true,
        sessionType: 'work' as const,
        cyclePosition: 1,
        endTime: correctEndTime, // 正しい時刻
        startTime: now,
        pausedAt: null,
        pausedDuration: 0,
        lastSaveTime: now
      };

      const storageChangeHandler = mockChrome.storage.onChanged.addListener.mock.calls[0][0];
      storageChangeHandler(
        { pomodoroState: { newValue: mockState } },
        'local'
      );

      // 2秒以上のずれなので補正されることを確認
      expect(timer['displayState'].endTime).toBe(correctEndTime);
    });
  });

  describe('UI updates', () => {
    beforeEach(async () => {
      timer = new PomodoroTimer();
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should update button states based on running status', () => {
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;

      // 停止状態
      timer['displayState'].isRunning = false;
      timer['updateButtonStates']();

      expect(startBtn.disabled).toBe(false);
      expect(pauseBtn.disabled).toBe(true);

      // 実行状態
      timer['displayState'].isRunning = true;
      timer['updateButtonStates']();

      expect(startBtn.disabled).toBe(true);
      expect(pauseBtn.disabled).toBe(false);
    });

    it('should update session type display', () => {
      const sessionTypeElement = document.getElementById('sessionType');

      timer['displayState'].sessionType = 'work';
      timer['updateDisplay']();
      expect(sessionTypeElement?.textContent).toBe('作業中');

      timer['displayState'].sessionType = 'shortBreak';
      timer['updateDisplay']();
      expect(sessionTypeElement?.textContent).toBe('短い休憩');

      timer['displayState'].sessionType = 'longBreak';
      timer['updateDisplay']();
      expect(sessionTypeElement?.textContent).toBe('長い休憩');
    });

    it('should update progress dots correctly', () => {
      const progressDotsElement = document.getElementById('progressDots');

      // サイクル位置1（作業中）
      timer['displayState'].cyclePosition = 1;
      timer['updateDisplay']();

      const html1 = progressDotsElement?.innerHTML || '';
      expect(html1).toContain('progress-work-done'); // 完了した作業
      expect(html1).toContain('●');

      // サイクル位置2（短い休憩）
      timer['displayState'].cyclePosition = 2;
      timer['updateDisplay']();

      const html2 = progressDotsElement?.innerHTML || '';
      expect(html2).toContain('progress-short-done'); // 完了した短い休憩
      expect(html2).toContain('▲');

      // サイクル位置8（長い休憩）
      timer['displayState'].cyclePosition = 8;
      timer['updateDisplay']();

      const html8 = progressDotsElement?.innerHTML || '';
      expect(html8).toContain('progress-long-done'); // 完了した長い休憩
      expect(html8).toContain('◆');
    });

    it('should format time display correctly', () => {
      const timerDisplay = document.getElementById('timerDisplay');

      // 25分
      timer['displayState'].timeLeft = 25 * 60;
      timer['displayState'].isRunning = false;
      timer['updateDisplay']();
      expect(timerDisplay?.textContent).toBe('25:00');

      // 5分30秒
      timer['displayState'].timeLeft = 5 * 60 + 30;
      timer['updateDisplay']();
      expect(timerDisplay?.textContent).toBe('05:30');

      // 1分
      timer['displayState'].timeLeft = 60;
      timer['updateDisplay']();
      expect(timerDisplay?.textContent).toBe('01:00');

      // 30秒
      timer['displayState'].timeLeft = 30;
      timer['updateDisplay']();
      expect(timerDisplay?.textContent).toBe('00:30');
    });
  });

  describe('display loop management', () => {
    beforeEach(async () => {
      timer = new PomodoroTimer();
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should start display loop when timer starts', () => {
      timer['displayState'].isRunning = false;
      timer['displayState'].displayIntervalId = null;

      // タイマー開始をシミュレート
      const mockState = {
        timeLeft: 300,
        isRunning: true,
        sessionType: 'work' as const,
        cyclePosition: 1,
        endTime: Date.now() + 300000,
        startTime: Date.now(),
        pausedAt: null,
        pausedDuration: 0,
        lastSaveTime: Date.now()
      };

      timer['syncDisplayState'](mockState);

      expect(timer['displayState'].displayIntervalId).not.toBeNull();
    });

    it('should stop display loop when timer stops', () => {
      // まず実行状態にする
      timer['displayState'].isRunning = true;
      timer['startDisplayLoop']();

      expect(timer['displayState'].displayIntervalId).not.toBeNull();

      // 停止状態にする
      const mockState = {
        timeLeft: 300,
        isRunning: false,
        sessionType: 'work' as const,
        cyclePosition: 1,
        endTime: null,
        startTime: Date.now(),
        pausedAt: Date.now(),
        pausedDuration: 0,
        lastSaveTime: Date.now()
      };

      timer['syncDisplayState'](mockState);

      expect(timer['displayState'].displayIntervalId).toBeNull();
    });

    it('should clean up display loop on beforeunload', () => {
      timer['startDisplayLoop']();
      const intervalId = timer['displayState'].displayIntervalId;

      expect(intervalId).not.toBeNull();

      // beforeunloadイベントをシミュレート
      window.dispatchEvent(new Event('beforeunload'));

      expect(timer['displayState'].displayIntervalId).toBeNull();
    });
  });

  describe('static methods', () => {
    it('should determine session type from position correctly', () => {
      expect(PomodoroTimer.getSessionTypeFromPosition(1)).toBe('work');
      expect(PomodoroTimer.getSessionTypeFromPosition(2)).toBe('shortBreak');
      expect(PomodoroTimer.getSessionTypeFromPosition(3)).toBe('work');
      expect(PomodoroTimer.getSessionTypeFromPosition(4)).toBe('shortBreak');
      expect(PomodoroTimer.getSessionTypeFromPosition(5)).toBe('work');
      expect(PomodoroTimer.getSessionTypeFromPosition(6)).toBe('shortBreak');
      expect(PomodoroTimer.getSessionTypeFromPosition(7)).toBe('work');
      expect(PomodoroTimer.getSessionTypeFromPosition(8)).toBe('longBreak');
    });

    it('should return correct session durations', () => {
      expect(PomodoroTimer.getSessionDuration('work')).toBe(25 * 60);
      expect(PomodoroTimer.getSessionDuration('shortBreak')).toBe(5 * 60);
      expect(PomodoroTimer.getSessionDuration('longBreak')).toBe(15 * 60);
    });
  });

  describe('error handling', () => {
    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // DOM要素を削除

      expect(() => {
        timer = new PomodoroTimer();
      }).toThrow('Element with id "timerDisplay" not found');
    });

    it('should handle storage errors gracefully', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      timer = new PomodoroTimer();

      // 初期化の完了を待つ（エラーハンドリング含む）
      await Promise.resolve();
      await Promise.resolve();

      // エラーが発生してもデフォルト状態で動作することを確認
      expect(timer.getTimeLeft()).toBe(25 * 60);
      expect(timer.getIsRunning()).toBe(false);
    });
  });
});