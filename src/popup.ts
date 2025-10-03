type SessionType = 'work' | 'shortBreak' | 'longBreak';

interface TimerState {
  // 表示計算用（真実の状態ではない）
  endTime: number | null;         // 表示計算用終了時刻
  isRunning: boolean;             // 表示用実行状態
  sessionType: SessionType;       // 表示用セッション種別
  cyclePosition: number;          // 表示用サイクル位置
  timeLeft: number;               // 一時停止時の残り時間表示用
  
  // ローカル表示制御
  displayIntervalId: number | null; // 1秒刻み表示用interval
}

interface StoredState {
  timeLeft: number;
  isRunning: boolean;
  lastSaveTime: number;
  sessionType: SessionType;
  cyclePosition: number;
  startTime: number | null;
  endTime: number | null;
  pausedAt: number | null;
  pausedDuration: number;
}

export class PomodoroTimer {
  private static readonly DEFAULT_MINUTES = 25;

  private displayState: TimerState;
  private readonly timerDisplay: HTMLDivElement;
  private readonly sessionTypeDisplay: HTMLDivElement;
  private readonly progressDotsDisplay: HTMLDivElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly preset25: HTMLButtonElement;
  private readonly preset15: HTMLButtonElement;
  private readonly preset5: HTMLButtonElement;
  private readonly preset1sec: HTMLButtonElement;

  constructor() {
    this.displayState = {
      endTime: null,
      isRunning: false,
      sessionType: 'work',
      cyclePosition: 1,
      timeLeft: 25 * 60, // デフォルト25分
      displayIntervalId: null
    };
    
    this.timerDisplay = this.getElementById<HTMLDivElement>('timerDisplay');
    this.sessionTypeDisplay = this.getElementById<HTMLDivElement>('sessionType');
    this.progressDotsDisplay = this.getElementById<HTMLDivElement>('progressDots');
    this.startBtn = this.getElementById<HTMLButtonElement>('startBtn');
    this.pauseBtn = this.getElementById<HTMLButtonElement>('pauseBtn');
    this.preset25 = this.getElementById<HTMLButtonElement>('preset25');
    this.preset15 = this.getElementById<HTMLButtonElement>('preset15');
    this.preset5 = this.getElementById<HTMLButtonElement>('preset5');
    this.preset1sec = this.getElementById<HTMLButtonElement>('preset1sec');
    
    this.initEventListeners();
    this.initStorageListener();
    this.initMessageListener();
    this.initializeFromBackground().then(() => {
      this.updateDisplay();
    });
  }

  private getElementById<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T | null;
    if (!element) {
      throw new Error(`Element with id "${id}" not found`);
    }
    return element;
  }

  private initEventListeners(): void {
    this.startBtn.addEventListener('click', async () => {
      try {
        await this.sendCommand('START_TIMER');
      } catch (error) {
        console.log('Start command failed, background may not be ready');
      }
    });
    
    this.pauseBtn.addEventListener('click', async () => {
      try {
        await this.sendCommand('PAUSE_TIMER');
      } catch (error) {
        console.log('Pause command failed, background may not be ready');
      }
    });
    
    // プリセットボタン: 時間設定 + サイクルリセット + 自動開始
    this.preset25.addEventListener('click', () => this.setTimeAndStart(25 * 60));
    this.preset15.addEventListener('click', () => this.setTimeAndStart(15 * 60));
    this.preset5.addEventListener('click', () => this.setTimeAndStart(5 * 60));
    this.preset1sec.addEventListener('click', () => this.setTimeAndStart(1));
    
    // ポップアップ閉鎖時のクリーンアップ
    window.addEventListener('beforeunload', () => {
      this.stopDisplayLoop();
    });
  }

  private initStorageListener(): void {
    // chrome.storage.onChanged で状態同期
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.pomodoroState) {
        this.syncDisplayState(changes.pomodoroState.newValue);
      }
    });
  }

  private initMessageListener(): void {
    // 30秒同期メッセージの受信
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'STATE_SYNC') {
        this.handleSyncMessage(message);
      }
    });
  }

  private async initializeFromBackground(): Promise<void> {
    // まずstorageから直接読み込み（確実な方法）
    const result = await chrome.storage.local.get('pomodoroState');
    if (result.pomodoroState) {
      this.syncDisplayState(result.pomodoroState);
    }
    
    // バックグラウンドからの状態取得を試行（バックグラウンドが起動していない場合は失敗する）
    try {
      await this.sendCommand('GET_STATE');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('Background not ready yet, using storage state only:', errorMessage);
      // エラーは正常な状況なので、警告レベルで記録
    }
  }

  private async sendCommand(command: string, data?: any): Promise<void> {
    try {
      await chrome.runtime.sendMessage({ type: command, ...data });
    } catch (error) {
      // バックグラウンドが起動していない場合は正常な状況
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Could not establish connection')) {
        console.log(`Background not ready for command ${command}, will retry when available`);
      } else {
        console.error(`Failed to send command ${command}:`, error);
      }
      throw error; // 呼び出し元でのエラーハンドリングのため
    }
  }

  private syncDisplayState(backendState: StoredState): void {
    if (!backendState) return;
    
    // 表示用状態の同期
    this.displayState.isRunning = backendState.isRunning;
    this.displayState.sessionType = backendState.sessionType;
    this.displayState.cyclePosition = backendState.cyclePosition;
    this.displayState.timeLeft = backendState.timeLeft; // バックグラウンドからの残り時間を同期
    
    // endTime基準の表示計算（実行中のみ）
    if (backendState.endTime && backendState.isRunning) {
      // 2秒以上ズレている場合は補正
      if (!this.displayState.endTime || 
          Math.abs(this.displayState.endTime - backendState.endTime) > 2000) {
        this.displayState.endTime = backendState.endTime;
      }
    } else {
      this.displayState.endTime = null;
    }
    
    // 表示ループの開始/停止
    if (backendState.isRunning && !this.displayState.displayIntervalId) {
      this.startDisplayLoop();
    } else if (!backendState.isRunning && this.displayState.displayIntervalId) {
      this.stopDisplayLoop();
    }
    
    this.updateDisplay();
    this.updateButtonStates();
  }

  private handleSyncMessage(message: any): void {
    // 30秒同期メッセージでの軽量補正
    if (message.endTime && this.displayState.isRunning) {
      // 軽微な補正のみ（storage書き込みなし）
      if (!this.displayState.endTime || 
          Math.abs(this.displayState.endTime - message.endTime) > 2000) {
        this.displayState.endTime = message.endTime;
      }
    }
    
    this.displayState.sessionType = message.sessionType || this.displayState.sessionType;
    this.displayState.cyclePosition = message.cyclePosition || this.displayState.cyclePosition;
    this.displayState.isRunning = message.isRunning;
    
    // timeLeftも同期（特に一時停止時に重要）
    if (message.timeLeft !== undefined) {
      this.displayState.timeLeft = message.timeLeft;
    }
    
    this.updateDisplay();
  }

  private startDisplayLoop(): void {
    if (this.displayState.displayIntervalId) {
      clearInterval(this.displayState.displayIntervalId);
    }
    
    this.displayState.displayIntervalId = window.setInterval(() => {
      this.updateDisplay();
    }, 1000);
  }

  private stopDisplayLoop(): void {
    if (this.displayState.displayIntervalId) {
      clearInterval(this.displayState.displayIntervalId);
      this.displayState.displayIntervalId = null;
    }
  }

  private calculateDisplayTimeLeft(): number {
    if (!this.displayState.isRunning) {
      // 一時停止中はバックグラウンドから同期された残り時間を表示
      return this.displayState.timeLeft;
    }
    
    if (this.displayState.endTime) {
      // 実行中はendTime基準の精密計算（累積誤差なし）
      const now = Date.now();
      return Math.max(0, Math.ceil((this.displayState.endTime - now) / 1000));
    }
    
    // endTimeがない場合（初期状態など）はtimeLeftを使用
    return this.displayState.timeLeft;
  }

  private async setTimeAndStart(timeInSeconds: number): Promise<void> {
    try {
      // バックグラウンドにリセット＋時間設定を送信
      await this.sendCommand('RESET_TIMER');
      await this.sendCommand('SET_TIME', { timeLeft: timeInSeconds });
      await this.sendCommand('START_TIMER');
    } catch (error) {
      console.log('Preset commands failed, background may not be ready');
    }
  }

  private updateDisplay(): void {
    // 時間表示の更新
    const timeLeft = this.calculateDisplayTimeLeft();
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // セッション種別の表示更新
    const sessionTypeText = this.getSessionTypeText(this.displayState.sessionType);
    this.sessionTypeDisplay.textContent = sessionTypeText;

    // 進捗ドットの表示更新
    const progressDotsHtml = this.generateProgressDots(this.displayState.cyclePosition);
    this.progressDotsDisplay.innerHTML = progressDotsHtml;
  }

  private getSessionTypeText(sessionType: SessionType): string {
    switch (sessionType) {
      case 'work': return '作業中';
      case 'shortBreak': return '短い休憩';
      case 'longBreak': return '長い休憩';
    }
  }

  private generateProgressDots(position: number): string {
    const total = 8;
    
    let dotsHtml = '';
    for (let i = 1; i <= total; i++) {
      let symbol = '';
      let className = '';
      
      if (i % 2 === 1) {
        // 作業セッション
        symbol = i <= position ? '●' : '○';
        className = i <= position ? 'progress-work-done' : 'progress-work-todo';
      } else if (i === 8) {
        // 長い休憩
        symbol = i <= position ? '◆' : '◇';
        className = i <= position ? 'progress-long-done' : 'progress-long-todo';
      } else {
        // 短い休憩
        symbol = i <= position ? '▲' : '△';
        className = i <= position ? 'progress-short-done' : 'progress-short-todo';
      }
      
      dotsHtml += `<span class="${className}">${symbol}</span>`;
    }
    return dotsHtml;
  }

  private updateButtonStates(): void {
    this.startBtn.disabled = this.displayState.isRunning;
    this.pauseBtn.disabled = !this.displayState.isRunning;
  }

  // 外部参照API（後方互換性のため）
  public getTimeLeft(): number {
    return this.calculateDisplayTimeLeft();
  }

  public getSessionType(): SessionType {
    return this.displayState.sessionType;
  }

  public getCyclePosition(): number {
    return this.displayState.cyclePosition;
  }

  public getIsRunning(): boolean {
    return this.displayState.isRunning;
  }

  // 静的メソッド
  public static getSessionTypeFromPosition(position: number): SessionType {
    if (position % 2 === 1) return 'work';
    return position === 8 ? 'longBreak' : 'shortBreak';
  }

  public static getSessionDuration(sessionType: SessionType): number {
    switch (sessionType) {
      case 'work': return 25 * 60;
      case 'shortBreak': return 5 * 60;
      case 'longBreak': return 15 * 60;
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  new PomodoroTimer();
});