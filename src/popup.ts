interface TimerState {
  timeLeft: number;
  isRunning: boolean;
  intervalId: number | null;
  lastSaveTime?: number; // 最後に保存した時刻
}

export class PomodoroTimer {
  private static readonly DEFAULT_MINUTES = 25;
  private static readonly TIMER_INTERVAL_MS = 1000;

  private state: TimerState;
  private readonly timerDisplay: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly preset25: HTMLButtonElement;
  private readonly preset15: HTMLButtonElement;
  private readonly preset5: HTMLButtonElement;
  private readonly preset1sec: HTMLButtonElement;

  constructor() {
    this.state = {
      timeLeft: PomodoroTimer.DEFAULT_MINUTES * 60, // デフォルト値
      isRunning: false,
      intervalId: null
    };
    
    this.timerDisplay = this.getElementById('timerDisplay');
    this.startBtn = this.getElementById('startBtn') as HTMLButtonElement;
    this.pauseBtn = this.getElementById('pauseBtn') as HTMLButtonElement;
    this.preset25 = this.getElementById('preset25') as HTMLButtonElement;
    this.preset15 = this.getElementById('preset15') as HTMLButtonElement;
    this.preset5 = this.getElementById('preset5') as HTMLButtonElement;
    this.preset1sec = this.getElementById('preset1sec') as HTMLButtonElement;
    
    this.initEventListeners();
    this.restoreState().then(() => {
      this.updateDisplay();
    });
  }

  private getElementById(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id "${id}" not found`);
    }
    return element;
  }

  private async saveState(): Promise<void> {
    const stateToSave = {
      timeLeft: this.state.timeLeft,
      isRunning: this.state.isRunning,
      lastSaveTime: Date.now()
    };
    
    await chrome.storage.local.set({ pomodoroState: stateToSave });
  }

  private async loadStateFromStorage(): Promise<TimerState | null> {
    const result = await chrome.storage.local.get('pomodoroState');
    return result.pomodoroState || null;
  }

  private calculateElapsedTime(lastSaveTime: number): number {
    return Math.floor((Date.now() - lastSaveTime) / 1000);
  }

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

  private updateButtonStates(): void {
    this.startBtn.disabled = this.state.isRunning;
    this.pauseBtn.disabled = !this.state.isRunning;
  }

  private async applyRestoredState(savedState: TimerState): Promise<void> {
    // タイマーが実行中だった場合、経過時間を計算
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
      // 停止中だった場合はそのまま復元
      this.state.timeLeft = savedState.timeLeft;
    }
  }

  private async restoreState(): Promise<void> {
    const savedState = await this.loadStateFromStorage();
    if (savedState) {
      await this.applyRestoredState(savedState);
    }
  }
  
  private initEventListeners(): void {
    this.startBtn.addEventListener('click', () => this.start());
    this.pauseBtn.addEventListener('click', () => this.pause());
    
    this.preset25.addEventListener('click', () => this.setTime(25));
    this.preset15.addEventListener('click', () => this.setTime(15));
    this.preset5.addEventListener('click', () => this.setTime(5));
    this.preset1sec.addEventListener('click', () => this.setTimeSeconds(1));
  }
  
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
  
  public async setTime(minutes: number): Promise<void> {
    if (!this.state.isRunning) {
      this.state.timeLeft = minutes * 60;
      this.updateDisplay();
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

  // テスト用のgetters
  public getTimeLeft(): number {
    return this.state.timeLeft;
  }
  
  public getIsRunning(): boolean {
    return this.state.isRunning;
  }
  
  private async complete(): Promise<void> {
    await this.pause();
    
    // デフォルト値にリセット
    await this.setTime(PomodoroTimer.DEFAULT_MINUTES);
  }
  
  private updateDisplay(): void {
    const minutes = Math.floor(this.state.timeLeft / 60);
    const seconds = this.state.timeLeft % 60;
    this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  new PomodoroTimer();
});