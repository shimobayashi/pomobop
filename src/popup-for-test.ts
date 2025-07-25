interface TimerState {
  timeLeft: number;
  isRunning: boolean;
  intervalId: number | null;
  lastSaveTime?: number; // 最後に保存した時刻
}

export class PomodoroTimer {
  private state: TimerState;
  private readonly timerDisplay: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly preset25: HTMLButtonElement;
  private readonly preset15: HTMLButtonElement;
  private readonly preset5: HTMLButtonElement;
  private readonly preset1sec: HTMLButtonElement;

  constructor() {
    this.state = {
      timeLeft: 25 * 60, // 25分をデフォルト
      isRunning: false,
      intervalId: null
    };
    
    this.timerDisplay = this.getElementById('timerDisplay');
    this.startBtn = this.getElementById('startBtn') as HTMLButtonElement;
    this.pauseBtn = this.getElementById('pauseBtn') as HTMLButtonElement;
    this.resetBtn = this.getElementById('resetBtn') as HTMLButtonElement;
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
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ pomodoroState: stateToSave });
    }
  }

  private async restoreState(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get('pomodoroState');
      if (result.pomodoroState) {
        const savedState = result.pomodoroState;
        
        // タイマーが実行中だった場合、経過時間を計算
        if (savedState.isRunning && savedState.lastSaveTime) {
          const elapsed = Math.floor((Date.now() - savedState.lastSaveTime) / 1000);
          this.state.timeLeft = Math.max(0, savedState.timeLeft - elapsed);
          
          if (this.state.timeLeft > 0) {
            this.resumeTimer();
          } else {
            await this.complete();
          }
        } else {
          // 停止中だった場合はそのまま復元
          this.state.timeLeft = savedState.timeLeft;
        }
      }
    }
  }

  private resumeTimer(): void {
    this.state.isRunning = true;
    this.startBtn.disabled = true;
    this.pauseBtn.disabled = false;
    
    this.state.intervalId = window.setInterval(async () => {
      this.state.timeLeft--;
      this.updateDisplay();
      await this.saveState();
      
      if (this.state.timeLeft <= 0) {
        await this.complete();
      }
    }, 1000);
  }
  
  private initEventListeners(): void {
    this.startBtn.addEventListener('click', () => this.start());
    this.pauseBtn.addEventListener('click', () => this.pause());
    this.resetBtn.addEventListener('click', () => this.reset());
    
    this.preset25.addEventListener('click', () => this.setTime(25));
    this.preset15.addEventListener('click', () => this.setTime(15));
    this.preset5.addEventListener('click', () => this.setTime(5));
    this.preset1sec.addEventListener('click', () => this.setTimeSeconds(1));
  }
  
  public async start(): Promise<void> {
    if (!this.state.isRunning) {
      this.state.isRunning = true;
      this.startBtn.disabled = true;
      this.pauseBtn.disabled = false;
      
      this.state.intervalId = window.setInterval(async () => {
        this.state.timeLeft--;
        this.updateDisplay();
        await this.saveState();
        
        if (this.state.timeLeft <= 0) {
          await this.complete();
        }
      }, 1000);

      await this.saveState();
    }
  }
  
  public async pause(): Promise<void> {
    if (this.state.isRunning) {
      this.state.isRunning = false;
      this.startBtn.disabled = false;
      this.pauseBtn.disabled = true;
      
      if (this.state.intervalId) {
        clearInterval(this.state.intervalId);
        this.state.intervalId = null;
      }

      await this.saveState();
    }
  }
  
  public async reset(): Promise<void> {
    await this.pause();
    this.state.timeLeft = 25 * 60;
    this.updateDisplay();
    await this.saveState();
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
    this.timerDisplay.textContent = "完了！";
    this.timerDisplay.style.color = "#27ae60";
    
    // 3秒後にリセット
    setTimeout(async () => {
      await this.reset();
      this.timerDisplay.style.color = "#e74c3c";
    }, 3000);
  }
  
  private updateDisplay(): void {
    const minutes = Math.floor(this.state.timeLeft / 60);
    const seconds = this.state.timeLeft % 60;
    this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}