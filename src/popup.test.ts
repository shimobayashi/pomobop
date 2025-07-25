import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import './popup' // メインファイルを読み込み

// Chrome Storage APIのモック
const mockStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined)
  }
};

// Chromeオブジェクトのモック
Object.defineProperty(global, 'chrome', {
  value: {
    storage: mockStorage
  },
  writable: true,
  configurable: true
});

describe('PomodoroTimer', () => {
  let timer: any

  beforeEach(() => {
    // HTMLをセットアップ
    document.body.innerHTML = `
      <div id="timerDisplay">25:00</div>
      <button id="startBtn">開始</button>
      <button id="pauseBtn" disabled>一時停止</button>
      <button id="resetBtn">リセット</button>
      <button id="preset25">25分</button>
      <button id="preset15">15分</button>
      <button id="preset5">5分</button>
      <button id="preset1sec">1秒テスト</button>
    `
    
    // モックをリセット
    mockStorage.local.get.mockClear()
    mockStorage.local.set.mockClear()
    mockStorage.local.get.mockResolvedValue({}) // デフォルトで空の状態

    vi.useFakeTimers()
  })

  afterEach(() => {
    if (timer) {
      timer.pause()
    }
    vi.useRealTimers()
  })

  describe('初期化', () => {
    it('デフォルトで25分に設定される', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(25 * 60)
        expect(timer.getIsRunning()).toBe(false)
      }, { timeout: 1000 })
    })

    it('表示が正しく初期化される', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => {
        const display = document.getElementById('timerDisplay')
        expect(display?.textContent).toBe('25:00')
      }, { timeout: 1000 })
    })
  })

  describe('プリセット機能', () => {
    it('25分プリセットが動作する', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTime(25)
      expect(timer.getTimeLeft()).toBe(25 * 60)
    })

    it('15分プリセットが動作する', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTime(15)
      expect(timer.getTimeLeft()).toBe(15 * 60)
    })

    it('5分プリセットが動作する', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTime(5)
      expect(timer.getTimeLeft()).toBe(5 * 60)
    })

    it('1秒プリセットが動作する', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(1)
      expect(timer.getTimeLeft()).toBe(1)
    })
  })

  describe('タイマー操作', () => {
    it('開始ボタンでタイマーが開始される', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.start()
      expect(timer.getIsRunning()).toBe(true)
      
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
      expect(startBtn.disabled).toBe(true)
      expect(pauseBtn.disabled).toBe(false)
    })

    it('一時停止ボタンでタイマーが停止される', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.start()
      await timer.pause()
      expect(timer.getIsRunning()).toBe(false)
      
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
      expect(startBtn.disabled).toBe(false)
      expect(pauseBtn.disabled).toBe(true)
    })

    it('リセットボタンで25分に戻る', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTime(10)
      await timer.reset()
      expect(timer.getTimeLeft()).toBe(25 * 60)
      expect(timer.getIsRunning()).toBe(false)
    })
  })

  describe('タイマーのカウントダウン', () => {
    it('実行中はプリセット変更できない', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.start()
      const initialTime = timer.getTimeLeft()
      await timer.setTime(10)
      expect(timer.getTimeLeft()).toBe(initialTime)
    })

    it('1秒経過で時間が減る', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(10)
      await timer.start()
      
      vi.advanceTimersByTime(1000)
      expect(timer.getTimeLeft()).toBe(9)
    })

    it('複数秒経過で時間が減る', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(10)
      await timer.start()
      
      vi.advanceTimersByTime(3000)
      expect(timer.getTimeLeft()).toBe(7)
    })
  })

  describe('タイマー完了', () => {
    it('タイマーが0になると完了状態になる', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(2)
      await timer.start()
      
      // 2秒経過でタイマー完了
      vi.advanceTimersByTime(2000)
      
      // 非同期complete処理の完了を待つ
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(0)
        expect(timer.getIsRunning()).toBe(false)
        
        const display = document.getElementById('timerDisplay')
        expect(display?.textContent).toBe('完了！')
        expect(display?.style.color).toBe('rgb(39, 174, 96)') // #27ae60
      }, { timeout: 1000 })
    })

    it('完了後3秒でリセットされる', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(1)
      await timer.start()
      
      // 1秒経過でタイマー完了
      vi.advanceTimersByTime(1000)
      
      // 完了状態を待つ
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(0)
        const display = document.getElementById('timerDisplay')
        expect(display?.textContent).toBe('完了！')
      }, { timeout: 1000 })
      
      // さらに3秒経過でリセット
      vi.advanceTimersByTime(3000)
      
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(25 * 60)
        const display = document.getElementById('timerDisplay')
        expect(display?.textContent).toBe('25:00')
        expect(display?.style.color).toBe('rgb(231, 76, 60)') // #e74c3c
      }, { timeout: 1000 })
    })

    it('完了時にボタンが正しい状態になる', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(1)
      await timer.start()
      
      // 1秒経過でタイマー完了
      vi.advanceTimersByTime(1000)
      
      // 完了処理の完了を待つ
      await vi.waitFor(() => {
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement
        const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
        
        expect(startBtn.disabled).toBe(false)
        expect(pauseBtn.disabled).toBe(true)
      }, { timeout: 1000 })
    })
  })

  describe('状態の永続化', () => {
    it('タイマー開始時に状態が保存される', async () => {
      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.start()
      
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        pomodoroState: expect.objectContaining({
          timeLeft: 25 * 60,
          isRunning: true,
          lastSaveTime: expect.any(Number)
        })
      })
    })

    it('停止中の状態が復元される', async () => {
      mockStorage.local.get.mockResolvedValue({
        pomodoroState: {
          timeLeft: 15 * 60,
          isRunning: false,
          lastSaveTime: Date.now()
        }
      })

      timer = new (globalThis as any).PomodoroTimer()
      
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(15 * 60)
        expect(timer.getIsRunning()).toBe(false)
      }, { timeout: 1000 })
    })

    it('実行中の状態が正しく復元される', async () => {
      const saveTime = Date.now() - 5000
      
      mockStorage.local.get.mockResolvedValue({
        pomodoroState: {
          timeLeft: 10,
          isRunning: true,
          lastSaveTime: saveTime
        }
      })

      timer = new (globalThis as any).PomodoroTimer()
      
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(5)
        expect(timer.getIsRunning()).toBe(true)
      }, { timeout: 1000 })
    })

    it('時間切れの場合は完了状態になる', async () => {
      const saveTime = Date.now() - 15000
      
      mockStorage.local.get.mockResolvedValue({
        pomodoroState: {
          timeLeft: 10,
          isRunning: true,
          lastSaveTime: saveTime
        }
      })

      timer = new (globalThis as any).PomodoroTimer()
      
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(0)
        expect(timer.getIsRunning()).toBe(false)
        
        const display = document.getElementById('timerDisplay')
        expect(display?.textContent).toBe('完了！')
      }, { timeout: 1000 })
    })

    it('Chrome拡張環境でない場合は状態保存をスキップ', async () => {
      // configurable: trueを追加して削除可能にする
      Object.defineProperty(global, 'chrome', {
        value: undefined,
        writable: true,
        configurable: true
      })

      timer = new (globalThis as any).PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })

      await timer.start()
      
      // 状態保存が呼ばれないことを確認
      expect(mockStorage.local.set).not.toHaveBeenCalled()

      // Chromeオブジェクトを復元
      Object.defineProperty(global, 'chrome', {
        value: {
          storage: mockStorage
        },
        writable: true,
        configurable: true
      })
    })
  })
})