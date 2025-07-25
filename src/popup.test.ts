import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PomodoroTimer } from './popup-for-test'

// Chrome Storage APIのモック
const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn()
  }
};

// Chromeオブジェクトのモック
Object.defineProperty(global, 'chrome', {
  value: {
    storage: mockStorage
  },
  writable: true
});

describe('PomodoroTimer', () => {
  let timer: PomodoroTimer

  beforeEach(async () => {
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
    
    timer = new PomodoroTimer()
    // 初期化完了を待つ
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  afterEach(() => {
    if (timer) {
      timer.pause()
    }
    vi.useRealTimers()
  })

  describe('初期化', () => {
    it('デフォルトで25分に設定される', () => {
      expect(timer.getTimeLeft()).toBe(25 * 60)
      expect(timer.getIsRunning()).toBe(false)
    })

    it('表示が正しく初期化される', () => {
      const display = document.getElementById('timerDisplay')
      expect(display?.textContent).toBe('25:00')
    })
  })

  describe('状態の永続化', () => {
    it('タイマー開始時に状態が保存される', async () => {
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
      // 保存された状態をモック
      mockStorage.local.get.mockResolvedValue({
        pomodoroState: {
          timeLeft: 15 * 60, // 15分
          isRunning: false,
          lastSaveTime: Date.now()
        }
      })

      // 新しいタイマーインスタンスを作成（復元をテスト）
      const newTimer = new PomodoroTimer()
      await new Promise(resolve => setTimeout(resolve, 0)) // 非同期初期化を待つ
      
      expect(newTimer.getTimeLeft()).toBe(15 * 60)
      expect(newTimer.getIsRunning()).toBe(false)
    })

    it('実行中の状態が正しく復元される', async () => {
      const saveTime = Date.now() - 5000 // 5秒前に保存
      
      mockStorage.local.get.mockResolvedValue({
        pomodoroState: {
          timeLeft: 10, // 10秒
          isRunning: true,
          lastSaveTime: saveTime
        }
      })

      const newTimer = new PomodoroTimer()
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // 5秒経過しているので、10 - 5 = 5秒になっているはず
      expect(newTimer.getTimeLeft()).toBe(5)
      expect(newTimer.getIsRunning()).toBe(true)
    })

    it('時間切れの場合は完了状態になる', async () => {
      const saveTime = Date.now() - 15000 // 15秒前に保存
      
      mockStorage.local.get.mockResolvedValue({
        pomodoroState: {
          timeLeft: 10, // 10秒（既に時間切れ）
          isRunning: true,
          lastSaveTime: saveTime
        }
      })

      const newTimer = new PomodoroTimer()
      await new Promise(resolve => setTimeout(resolve, 0))
      
      expect(newTimer.getTimeLeft()).toBe(0)
      expect(newTimer.getIsRunning()).toBe(false)
      
      const display = document.getElementById('timerDisplay')
      expect(display?.textContent).toBe('完了！')
    })

    it('Chrome拡張環境でない場合は状態保存をスキップ', async () => {
      // Chromeオブジェクトを一時的に削除
      const originalChrome = (global as any).chrome
      delete (global as any).chrome

      await timer.start()
      
      // 状態保存が呼ばれないことを確認
      expect(mockStorage.local.set).not.toHaveBeenCalled()

      // Chromeオブジェクトを復元
      ;(global as any).chrome = originalChrome
    })
  })

  describe('基本機能', () => {
    it('プリセット機能が動作する', async () => {
      await timer.setTime(15)
      expect(timer.getTimeLeft()).toBe(15 * 60)
    })

    it('タイマーが正常に動作する', async () => {
      await timer.setTimeSeconds(3)
      await timer.start()
      
      vi.advanceTimersByTime(1000)
      expect(timer.getTimeLeft()).toBe(2)
      
      vi.advanceTimersByTime(2000)
      expect(timer.getTimeLeft()).toBe(0)
      expect(timer.getIsRunning()).toBe(false)
    })
  })
})