interface TimerState {
  timeLeft: number;
  isRunning: boolean;
  lastSaveTime?: number;
  isCompleted?: boolean;
  intervalId?: number | null; // background.tsでは使用しないためオプショナル
}

class BackgroundTimer {
  private readonly alarmName = 'pomodoroTimer';

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // ストレージの変更を監視
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.pomodoroState) {
        this.handleStateChange(changes.pomodoroState);
      }
    });

    // アラームの設定を確認
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.alarmName) {
        this.handleTimerComplete();
      }
    });

    // 起動時の状態復元
    await this.restoreTimer();
  }

  private async handleStateChange(change: chrome.storage.StorageChange): Promise<void> {
    const newState: TimerState = change.newValue;
    const oldState: TimerState = change.oldValue;

    if (!newState) return;

    // タイマーが開始された場合
    if (newState.isRunning && (!oldState || !oldState.isRunning)) {
      await this.startBackgroundTimer(newState.timeLeft);
    }
    
    // タイマーが停止された場合
    if (!newState.isRunning && oldState && oldState.isRunning) {
      await this.stopBackgroundTimer();
    }
  }

  public async startBackgroundTimer(timeLeft: number): Promise<void> {
    // 既存のアラームをクリア
    await chrome.alarms.clear(this.alarmName);
    
    // 新しいアラームを設定
    const when = Date.now() + (timeLeft * 1000);
    await chrome.alarms.create(this.alarmName, { when });
    
    console.log(`Background timer started for ${timeLeft} seconds`);
  }

  public async stopBackgroundTimer(): Promise<void> {
    await chrome.alarms.clear(this.alarmName);
    console.log('Background timer stopped');
  }

  public async handleTimerComplete(): Promise<void> {
    console.log('Timer completed in background');
    
    // 状態を完了に更新
    const result = await chrome.storage.local.get('pomodoroState');
    if (result.pomodoroState) {
      const updatedState: TimerState = {
        ...result.pomodoroState,
        timeLeft: 0,
        isRunning: false,
        isCompleted: true,
        lastSaveTime: Date.now()
      };
      
      await chrome.storage.local.set({ pomodoroState: updatedState });
    }

    // 通知ページを開く
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('notification.html')
      });
    } catch (error) {
      console.error('Failed to open notification page:', error);
    }

    // 即座にリセット
    const resetState: TimerState = {
      timeLeft: 25 * 60,
      isRunning: false,
      isCompleted: false,
      lastSaveTime: Date.now()
    };
    await chrome.storage.local.set({ pomodoroState: resetState });
  }

  public async restoreTimer(): Promise<void> {
    const result = await chrome.storage.local.get('pomodoroState');
    if (result.pomodoroState && result.pomodoroState.isRunning) {
      const state: TimerState = result.pomodoroState;
      const elapsed = Math.floor((Date.now() - (state.lastSaveTime || 0)) / 1000);
      const remainingTime = Math.max(0, state.timeLeft - elapsed);
      
      if (remainingTime > 0) {
        await this.startBackgroundTimer(remainingTime);
      } else {
        // 既に完了している
        await this.handleTimerComplete();
      }
    }
  }
}

// バックグラウンドタイマーを初期化
new BackgroundTimer();