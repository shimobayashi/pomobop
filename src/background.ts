interface TimerState {
  // 時刻ベース状態管理（精度重視）
  startTime: number | null;       // タイマー開始時刻
  endTime: number | null;         // タイマー終了予定時刻
  pausedAt: number | null;        // 一時停止時刻
  pausedDuration: number;         // 累積一時停止時間

  // セッション情報
  sessionType: 'work' | 'shortBreak' | 'longBreak';
  cyclePosition: number;          // 1-8

  // 制御状態
  timeLeft: number;               // 残り時間（秒）
  isRunning: boolean;
  lastSaveTime?: number;          // 最終保存時刻
  lastUpdateTime: number;         // 最終更新時刻
}

export class BackgroundTimer {
  private readonly alarmName = 'pomodoroTimer';
  private readonly syncAlarmName = 'pomodoroSync';
  private state: TimerState;

  constructor() {
    this.state = {
      timeLeft: 25 * 60,
      isRunning: false,
      lastSaveTime: Date.now(),
      startTime: null,
      endTime: null,
      pausedAt: null,
      pausedDuration: 0,
      sessionType: 'work',
      cyclePosition: 1,
      lastUpdateTime: Date.now()
    };
    this.init();
  }

  private async init(): Promise<void> {
    // コマンドメッセージの監視
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 非同期処理を適切に処理
      this.handleCommand(message).catch(error => {
        console.error('Failed to handle command:', error);
      });
      return true; // 非同期レスポンスを示す
    });

    // アラームの監視
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.alarmName) {
        this.handleTimerComplete();
      } else if (alarm.name === this.syncAlarmName) {
        this.handleSyncAlarm();
      }
    });

    // 起動時の状態復元
    await this.restoreState();
    
    // 30秒同期アラームの開始
    await this.startSyncAlarm();
  }

  private async handleCommand(message: any): Promise<void> {
    switch (message.type) {
      case 'START_TIMER':
        await this.startTimer();
        break;
      case 'PAUSE_TIMER':
        await this.pauseTimer();
        break;
      case 'RESET_TIMER':
        await this.resetTimer();
        break;
      case 'SET_TIME':
        if (message.timeLeft) {
          await this.setTime(message.timeLeft);
        }
        break;
      case 'GET_STATE':
        // ポップアップ初期化時の状態要求
        await this.broadcastState();
        break;
    }
  }

  private async startTimer(): Promise<void> {
    if (!this.state.isRunning) {
      const now = Date.now();
      this.state.isRunning = true;
      this.state.startTime = now;
      this.state.endTime = now + (this.state.timeLeft * 1000);
      this.state.pausedAt = null; // 一時停止状態をクリア
      this.state.lastUpdateTime = now;
      
      // タイマー完了アラームを設定
      await chrome.alarms.clear(this.alarmName);
      await chrome.alarms.create(this.alarmName, { when: this.state.endTime });
      
      await this.saveAndBroadcastState();
      
      console.log(`Timer started: ${this.state.timeLeft} seconds remaining`);
    }
  }

  private async pauseTimer(): Promise<void> {
    if (this.state.isRunning) {
      const now = Date.now();
      
      // 一時停止する前に残り時間を計算（isRunningがtrueの状態で）
      const remainingTime = this.calculateCurrentTimeLeft();
      
      // 状態を一時停止に変更
      this.state.isRunning = false;
      this.state.pausedAt = now;
      this.state.timeLeft = remainingTime;
      this.state.lastUpdateTime = now;
      
      // アラームをクリア
      await chrome.alarms.clear(this.alarmName);
      
      await this.saveAndBroadcastState();
      
      console.log(`Timer paused: ${this.state.timeLeft} seconds remaining`);
    }
  }

  private async resetTimer(): Promise<void> {
    this.state.isRunning = false;
    this.state.timeLeft = 25 * 60;
    this.state.startTime = null;
    this.state.endTime = null;
    this.state.pausedAt = null;
    this.state.pausedDuration = 0;
    this.state.sessionType = 'work';
    this.state.cyclePosition = 1;
    this.state.lastUpdateTime = Date.now();
    
    await chrome.alarms.clear(this.alarmName);
    await this.saveAndBroadcastState();
    
    console.log('Timer reset');
  }

  private async setTime(timeLeft: number): Promise<void> {
    if (!this.state.isRunning) {
      this.state.timeLeft = timeLeft;
      this.state.lastUpdateTime = Date.now();
      await this.saveAndBroadcastState();
    }
  }

  private calculateCurrentTimeLeft(): number {
    if (!this.state.endTime) {
      return this.getSessionDuration(this.state.sessionType);
    }

    const now = Date.now();

    if (this.state.pausedAt) {
      // 一時停止中：一時停止時点での残り時間
      return Math.max(0, Math.ceil((this.state.endTime - this.state.pausedAt) / 1000));
    }

    if (this.state.isRunning) {
      // 実行中：現在時刻での残り時間
      return Math.max(0, Math.ceil((this.state.endTime - now) / 1000));
    }

    // 停止中
    return Math.max(0, Math.ceil((this.state.endTime - now) / 1000));
  }

  public async handleTimerComplete(): Promise<void> {
    console.log('Timer completed in background');
    
    // 通知ページを開く
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('notification.html')
      });
    } catch (error) {
      console.error('Failed to open notification page:', error);
    }

    // セッション遷移
    await this.moveToNextSession();
    
    // 新しいセッションの時間を設定
    const newDuration = this.getSessionDuration(this.state.sessionType);
    this.state.timeLeft = newDuration;
    this.state.isRunning = false;
    this.state.startTime = null;
    this.state.endTime = null;
    this.state.pausedAt = null;
    this.state.lastUpdateTime = Date.now();

    await this.saveAndBroadcastState();
  }

  private async moveToNextSession(): Promise<void> {
    // 次のサイクル位置に移動（8の次は1に戻る）
    this.state.cyclePosition = (this.state.cyclePosition % 8) + 1;
    
    // 新しい位置に基づいてセッション種別を決定
    this.state.sessionType = this.getSessionTypeFromPosition(this.state.cyclePosition);
  }

  private getSessionTypeFromPosition(position: number): 'work' | 'shortBreak' | 'longBreak' {
    if (position % 2 === 1) return 'work';
    return position === 8 ? 'longBreak' : 'shortBreak';
  }

  private getSessionDuration(sessionType: 'work' | 'shortBreak' | 'longBreak'): number {
    switch (sessionType) {
      case 'work': return 25 * 60;
      case 'shortBreak': return 5 * 60;
      case 'longBreak': return 15 * 60;
    }
  }

  private async startSyncAlarm(): Promise<void> {
    // 30秒ごとの同期アラーム
    await chrome.alarms.create(this.syncAlarmName, {
      delayInMinutes: 0.5,
      periodInMinutes: 0.5
    });
  }

  private async handleSyncAlarm(): Promise<void> {
    // 軽量同期メッセージ送信（実行中・停止中関係なく）
    try {
      const currentTimeLeft = this.calculateCurrentTimeLeft();
      await chrome.runtime.sendMessage({
        type: 'STATE_SYNC',
        endTime: this.state.endTime,
        sessionType: this.state.sessionType,
        cyclePosition: this.state.cyclePosition,
        isRunning: this.state.isRunning,
        timeLeft: currentTimeLeft
      });
    } catch (error) {
      // ポップアップが閉じている場合は無視
    }
  }

  private async saveAndBroadcastState(): Promise<void> {
    const stateToSave = {
      timeLeft: this.state.timeLeft,
      isRunning: this.state.isRunning,
      lastSaveTime: this.state.lastUpdateTime,
      sessionType: this.state.sessionType,
      cyclePosition: this.state.cyclePosition,
      startTime: this.state.startTime,
      endTime: this.state.endTime,
      pausedAt: this.state.pausedAt,
      pausedDuration: this.state.pausedDuration || 0
    };
    
    await chrome.storage.local.set({ pomodoroState: stateToSave });
  }

  private async broadcastState(): Promise<void> {
    await this.saveAndBroadcastState();
  }

  public async restoreState(): Promise<void> {
    const result = await chrome.storage.local.get('pomodoroState');
    const savedState = result.pomodoroState;
    
    if (savedState) {
      // 時刻ベース状態の復元
      this.state = {
        timeLeft: savedState.timeLeft || 25 * 60,
        isRunning: savedState.isRunning || false,
        lastSaveTime: savedState.lastSaveTime || Date.now(),
        sessionType: savedState.sessionType || 'work',
        cyclePosition: savedState.cyclePosition || 1,
        startTime: savedState.startTime || null,
        endTime: savedState.endTime || null,
        pausedAt: savedState.pausedAt || null,
        pausedDuration: savedState.pausedDuration || 0,
        lastUpdateTime: Date.now()
      };
      
      // 実行中のタイマーがあれば復元
      if (this.state.isRunning && this.state.endTime) {
        const now = Date.now();
        const remainingTime = Math.max(0, Math.ceil((this.state.endTime - now) / 1000));
        
        if (remainingTime > 0) {
          // まだ時間が残っている
          this.state.timeLeft = remainingTime;
          await chrome.alarms.create(this.alarmName, { when: this.state.endTime });
          console.log(`Timer restored: ${remainingTime} seconds remaining`);
        } else {
          // 既に完了している
          await this.handleTimerComplete();
        }
      }
    }
  }
}

// バックグラウンドタイマーを初期化
if (typeof window === 'undefined') {
  new BackgroundTimer();
}