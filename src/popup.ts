type SessionType = 'work' | 'shortBreak' | 'longBreak';

interface TimerState {
  timeLeft: number;
  isRunning: boolean;
  intervalId: number | null;
  lastSaveTime?: number;
  sessionType: SessionType;
  cyclePosition: number;
}

interface StoredState {
  timeLeft: number;
  isRunning: boolean;
  lastSaveTime: number;
  sessionType: SessionType;
  cyclePosition: number;
}

export class PomodoroTimer {
  private static readonly DEFAULT_MINUTES = 25;
  private static readonly TIMER_INTERVAL_MS = 1000;

  private state: TimerState;
  private readonly timerDisplay: HTMLDivElement;
  private readonly sessionTypeDisplay: HTMLDivElement;
  private readonly progressDotsDisplay: HTMLDivElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly preset25: HTMLButtonElement;
  private readonly preset15: HTMLButtonElement;
  private readonly preset5: HTMLButtonElement;
  private readonly preset1sec: HTMLButtonElement;

  // === 初期化フロー ===
  
  constructor() {
    this.state = {
      timeLeft: PomodoroTimer.DEFAULT_MINUTES * 60,
      isRunning: false,
      intervalId: null,
      sessionType: 'work',
      cyclePosition: 1
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
    this.restoreState().then(() => {
      this.updateDisplay();
      this.updateSessionDisplay();
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
    this.startBtn.addEventListener('click', () => this.start());
    this.pauseBtn.addEventListener('click', () => this.pause());
    
    // プリセットボタン: 時間設定 + サイクルリセット + 自動開始
    this.preset25.addEventListener('click', () => this.setTimeAndResetCycle(25 * 60));
    this.preset15.addEventListener('click', () => this.setTimeAndResetCycle(15 * 60));
    this.preset5.addEventListener('click', () => this.setTimeAndResetCycle(5 * 60));
    this.preset1sec.addEventListener('click', () => this.setTimeAndResetCycle(1));
  }

  // === 状態復元フロー ===

  private async restoreState(): Promise<void> {
    const savedState = await this.loadStateFromStorage();
    if (savedState) {
      await this.applyRestoredState(savedState);
    }
  }

  private async loadStateFromStorage(): Promise<StoredState | null> {
    const result = await chrome.storage.local.get('pomodoroState');
    const savedState = result.pomodoroState as any;
    
    if (!savedState) return null;
    
    // 後方互換性: 古いデータにデフォルト値を設定
    return {
      timeLeft: savedState.timeLeft,
      isRunning: savedState.isRunning,
      lastSaveTime: savedState.lastSaveTime,
      sessionType: savedState.sessionType || 'work',
      cyclePosition: savedState.cyclePosition || 1
    };
  }

  private async applyRestoredState(savedState: StoredState): Promise<void> {
    // 新しいプロパティを復元
    this.state.sessionType = savedState.sessionType;
    this.state.cyclePosition = savedState.cyclePosition;
    
    if (savedState.isRunning && savedState.lastSaveTime) {
      const elapsed = this.calculateElapsedTime(savedState.lastSaveTime);
      this.state.timeLeft = Math.max(0, savedState.timeLeft - elapsed);
      
      if (this.state.timeLeft > 0) {
        await this.start();
      } else {
        this.state.timeLeft = 0;
        await this.complete();
      }
    } else {
      this.state.timeLeft = savedState.timeLeft;
    }
    
    // UI更新
    this.updateSessionDisplay();
  }

  private calculateElapsedTime(lastSaveTime: number): number {
    return Math.floor((Date.now() - lastSaveTime) / 1000);
  }

  // === ユーザー操作API ===
  
  public async start(): Promise<void> {
    if (!this.state.isRunning) {
      this.state.isRunning = true;
      this.updateButtonStates();
      this.state.intervalId = this.createTimerInterval();
      await this.saveState();
    }
  }
  
  public async pause(): Promise<void> {
    if (this.state.isRunning) {
      this.state.isRunning = false;
      this.updateButtonStates();
      
      if (this.state.intervalId) {
        clearInterval(this.state.intervalId);
        this.state.intervalId = null;
      }

      await this.saveState();
    }
  }
  
  public async setTimeSeconds(seconds: number): Promise<void> {
    if (!this.state.isRunning) {
      this.state.timeLeft = seconds;
      this.updateDisplay();
      await this.saveState();
    }
  }

  // === タイマー実行フロー ===

  private createTimerInterval(): number {
    return window.setInterval(async () => {
      this.state.timeLeft--;
      
      if (this.state.timeLeft <= 0) {
        this.state.timeLeft = 0;
        await this.complete();
        return;
      }
      
      this.updateDisplay();
      await this.saveState();
    }, PomodoroTimer.TIMER_INTERVAL_MS);
  }

  private async complete(): Promise<void> {
    await this.pause();
    
    // 次のセッションに遷移
    this.moveToNextSession();
    
    // 新しいセッションの時間を設定
    const newDuration = PomodoroTimer.getSessionDuration(this.state.sessionType);
    await this.setTimeSeconds(newDuration);
    
    // UI更新
    this.updateSessionDisplay();
  }

  // === サイクル管理 ===

  private async moveToNextSession(): Promise<void> {
    // 次のサイクル位置に移動（8の次は1に戻る）
    this.state.cyclePosition = (this.state.cyclePosition % 8) + 1;
    
    // 新しい位置に基づいてセッション種別を決定
    this.state.sessionType = PomodoroTimer.getSessionTypeFromPosition(this.state.cyclePosition);
    
    // 状態を保存
    await this.saveState();
  }

  private async setTimeAndResetCycle(timeInSeconds: number): Promise<void> {
    // サイクルをリセット
    this.state.sessionType = 'work';
    this.state.cyclePosition = 1;
    
    // 時間を設定
    await this.setTimeSeconds(timeInSeconds);
    
    // UI更新
    this.updateSessionDisplay();
    
    // 自動開始
    await this.start();
  }

  // === UI更新 ===

  private updateDisplay(): void {
    const minutes = Math.floor(this.state.timeLeft / 60);
    const seconds = this.state.timeLeft % 60;
    this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private updateSessionDisplay(): void {
    // セッション種別の表示更新
    const sessionTypeText = this.getSessionTypeText(this.state.sessionType);
    this.sessionTypeDisplay.textContent = sessionTypeText;

    // 進捗ドットの表示更新（HTMLとして設定）
    const progressDotsHtml = this.generateProgressDots(this.state.cyclePosition);
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
    this.startBtn.disabled = this.state.isRunning;
    this.pauseBtn.disabled = !this.state.isRunning;
  }

  // === 状態永続化 ===

  private async saveState(): Promise<void> {
    const stateToSave: StoredState = {
      timeLeft: this.state.timeLeft,
      isRunning: this.state.isRunning,
      lastSaveTime: Date.now(),
      sessionType: this.state.sessionType,
      cyclePosition: this.state.cyclePosition
    };
    
    await chrome.storage.local.set({ pomodoroState: stateToSave });
  }

  // === 外部参照API ===

  public getTimeLeft(): number {
    return this.state.timeLeft;
  }

  public getSessionType(): SessionType {
    return this.state.sessionType;
  }

  public getCyclePosition(): number {
    return this.state.cyclePosition;
  }

  // === 静的メソッド ===

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
  
  public getIsRunning(): boolean {
    return this.state.isRunning;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  new PomodoroTimer();
});