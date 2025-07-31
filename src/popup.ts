interface TimerState {
  timeLeft: number;
  isRunning: boolean;
  intervalId: number | null;
  lastSaveTime?: number;
}

interface StoredState {
  timeLeft: number;
  isRunning: boolean;
  lastSaveTime: number;
}

export class PomodoroTimer {
  private static readonly DEFAULT_MINUTES = 25;
  private static readonly TIMER_INTERVAL_MS = 1000;

  private state: TimerState;
  private readonly timerDisplay: HTMLDivElement;
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
      intervalId: null
    };
    
    this.timerDisplay = this.getElementById<HTMLDivElement>('timerDisplay');
    this.startBtn = this.getElementById<HTMLButtonElement>('startBtn');
    this.pauseBtn = this.getElementById<HTMLButtonElement>('pauseBtn');
    this.preset25 = this.getElementById<HTMLButtonElement>('preset25');
    this.preset15 = this.getElementById<HTMLButtonElement>('preset15');
    this.preset5 = this.getElementById<HTMLButtonElement>('preset5');
    this.preset1sec = this.getElementById<HTMLButtonElement>('preset1sec');
    
    this.initEventListeners();
    this.restoreState().then(() => {
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
    this.startBtn.addEventListener('click', () => this.start());
    this.pauseBtn.addEventListener('click', () => this.pause());
    
    this.preset25.addEventListener('click', () => this.setTimeSeconds(25 * 60));
    this.preset15.addEventListener('click', () => this.setTimeSeconds(15 * 60));
    this.preset5.addEventListener('click', () => this.setTimeSeconds(5 * 60));
    this.preset1sec.addEventListener('click', () => this.setTimeSeconds(1));
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
    const savedState = result.pomodoroState as StoredState | undefined;
    return savedState || null;
  }

  private async applyRestoredState(savedState: StoredState): Promise<void> {
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
    await this.setTimeSeconds(PomodoroTimer.DEFAULT_MINUTES * 60);
  }

  // === UI更新 ===

  private updateDisplay(): void {
    const minutes = Math.floor(this.state.timeLeft / 60);
    const seconds = this.state.timeLeft % 60;
    this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
      lastSaveTime: Date.now()
    };
    
    await chrome.storage.local.set({ pomodoroState: stateToSave });
  }

  // === 外部参照API ===

  public getTimeLeft(): number {
    return this.state.timeLeft;
  }
  
  public getIsRunning(): boolean {
    return this.state.isRunning;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  new PomodoroTimer();
});