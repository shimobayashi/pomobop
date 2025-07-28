// バックグラウンドスクリプト - タイマー管理
class BackgroundTimer {
  constructor() {
    this.alarmName = 'pomodoroTimer';
    this.init();
  }

  async init() {
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

  async handleStateChange(change) {
    const newState = change.newValue;
    const oldState = change.oldValue;

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

  async startBackgroundTimer(timeLeft) {
    // 既存のアラームをクリア
    await chrome.alarms.clear(this.alarmName);
    
    // 新しいアラームを設定
    const when = Date.now() + (timeLeft * 1000);
    await chrome.alarms.create(this.alarmName, { when });
    
    console.log(`Background timer started for ${timeLeft} seconds`);
  }

  async stopBackgroundTimer() {
    await chrome.alarms.clear(this.alarmName);
    console.log('Background timer stopped');
  }

  async handleTimerComplete() {
    console.log('Timer completed in background');
    
    // 状態を完了に更新
    const result = await chrome.storage.local.get('pomodoroState');
    if (result.pomodoroState) {
      const updatedState = {
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

    // 3秒後にリセット
    setTimeout(async () => {
      const resetState = {
        timeLeft: 25 * 60,
        isRunning: false,
        isCompleted: false,
        lastSaveTime: Date.now()
      };
      await chrome.storage.local.set({ pomodoroState: resetState });
    }, 3000);
  }

  async restoreTimer() {
    const result = await chrome.storage.local.get('pomodoroState');
    if (result.pomodoroState && result.pomodoroState.isRunning) {
      const state = result.pomodoroState;
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