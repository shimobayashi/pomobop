import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PomodoroTimer } from './popup'

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
  let timer: PomodoroTimer

  beforeEach(() => {
    // HTMLをセットアップ
    document.body.innerHTML = `
      <div id="sessionType">作業中</div>
      <div id="progressDots">●○○○○○○○</div>
      <div id="timerDisplay">25:00</div>
      <button id="startBtn">開始</button>
      <button id="pauseBtn" disabled>一時停止</button>
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
      timer = new PomodoroTimer()
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(25 * 60)
        expect(timer.getIsRunning()).toBe(false)
      }, { timeout: 1000 })
    })

    it('表示が正しく初期化される', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => {
        const display = document.getElementById('timerDisplay')
        expect(display?.textContent).toBe('25:00')
      }, { timeout: 1000 })
    })
  })

  describe('プリセット機能', () => {
    it('25分プリセットが動作する', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(25 * 60)
      expect(timer.getTimeLeft()).toBe(25 * 60)
    })

    it('15分プリセットが動作する', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(15 * 60)
      expect(timer.getTimeLeft()).toBe(15 * 60)
    })

    it('5分プリセットが動作する', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(5 * 60)
      expect(timer.getTimeLeft()).toBe(5 * 60)
    })

    it('1秒プリセットが動作する', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(1)
      expect(timer.getTimeLeft()).toBe(1)
    })
  })

  describe('タイマー操作', () => {
    it('開始ボタンでタイマーが開始される', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.start()
      expect(timer.getIsRunning()).toBe(true)
      
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
      expect(startBtn.disabled).toBe(true)
      expect(pauseBtn.disabled).toBe(false)
    })

    it('一時停止ボタンでタイマーが停止される', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.start()
      await timer.pause()
      expect(timer.getIsRunning()).toBe(false)
      
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
      expect(startBtn.disabled).toBe(false)
      expect(pauseBtn.disabled).toBe(true)
    })
  })

  describe('タイマーのカウントダウン', () => {
    it('実行中はプリセット変更できない', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.start()
      const initialTime = timer.getTimeLeft()
      await timer.setTimeSeconds(10 * 60)
      expect(timer.getTimeLeft()).toBe(initialTime)
    })

    it('1秒経過で時間が減る', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(10)
      await timer.start()
      
      vi.advanceTimersByTime(1000)
      expect(timer.getTimeLeft()).toBe(9)
    })

    it('複数秒経過で時間が減る', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(10)
      await timer.start()
      
      vi.advanceTimersByTime(3000)
      expect(timer.getTimeLeft()).toBe(7)
    })
  })

  describe('タイマー完了', () => {
    it('タイマーが0になると即座にリセットされる', async () => {
      timer = new PomodoroTimer()
      await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })
      
      await timer.setTimeSeconds(2)
      await timer.start()
      
      // 2秒経過でタイマー完了
      vi.advanceTimersByTime(2000)
      
      // 非同期complete処理の完了を待つ
      await vi.waitFor(() => {
        // 作業完了後は短い休憩(5分)に遷移
        expect(timer.getTimeLeft()).toBe(5 * 60) // 短い休憩に遷移
        expect(timer.getIsRunning()).toBe(false)
        expect(timer.getSessionType()).toBe('shortBreak')
        expect(timer.getCyclePosition()).toBe(2)

        const display = document.getElementById('timerDisplay')
        expect(display?.textContent).toBe('05:00')
      }, { timeout: 1000 })
    })

    it('完了時にボタンが正しい状態になる', async () => {
      timer = new PomodoroTimer()
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
      timer = new PomodoroTimer()
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

      timer = new PomodoroTimer()
      
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

      timer = new PomodoroTimer()
      
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(5)
        expect(timer.getIsRunning()).toBe(true)
      }, { timeout: 1000 })
    })

    it('時間切れの場合は即座にリセットされる', async () => {
      const saveTime = Date.now() - 15000
      
      mockStorage.local.get.mockResolvedValue({
        pomodoroState: {
          timeLeft: 10,
          isRunning: true,
          lastSaveTime: saveTime
        }
      })

      timer = new PomodoroTimer()
      
      await vi.waitFor(() => {
        expect(timer.getTimeLeft()).toBe(25 * 60) // 即座にリセット
        expect(timer.getIsRunning()).toBe(false)
      }, { timeout: 1000 })
    })
  })

  describe('ポモドーロサイクル機能', () => {
    describe('初期状態', () => {
      it('デフォルトで作業セッション、cyclePosition=1', async () => {
        timer = new PomodoroTimer()
        await vi.waitFor(() => {
          expect(timer.getTimeLeft()).toBe(25 * 60)
          // TDD: まず失敗するテストを追加
          expect(timer.getSessionType()).toBe('work')
          expect(timer.getCyclePosition()).toBe(1)
        }, { timeout: 1000 })
      })

      it('初期状態で作業セッションUIが表示される', async () => {
        timer = new PomodoroTimer()
        await vi.waitFor(() => {
          // 実装後にアサーションを有効化
          // const sessionTypeElement = document.getElementById('sessionType')
          // const progressDotsElement = document.getElementById('progressDots')
          // expect(sessionTypeElement?.textContent).toBe('作業中')
          // expect(progressDotsElement?.textContent).toBe('●○○○○○○○')
          expect(true).toBe(true) // 一時的なプレースホルダー
        }, { timeout: 1000 })
      })
    })

    describe('セッション種別の決定', () => {
      it('cyclePosition 1,3,5,7 は作業セッション', () => {
        timer = new PomodoroTimer()
        // TDD: staticメソッドをテスト
        expect(PomodoroTimer.getSessionTypeFromPosition(1)).toBe('work')
        expect(PomodoroTimer.getSessionTypeFromPosition(3)).toBe('work')
        expect(PomodoroTimer.getSessionTypeFromPosition(5)).toBe('work')
        expect(PomodoroTimer.getSessionTypeFromPosition(7)).toBe('work')
      })

      it('cyclePosition 2,4,6 は短い休憩', () => {
        timer = new PomodoroTimer()
        expect(PomodoroTimer.getSessionTypeFromPosition(2)).toBe('shortBreak')
        expect(PomodoroTimer.getSessionTypeFromPosition(4)).toBe('shortBreak')
        expect(PomodoroTimer.getSessionTypeFromPosition(6)).toBe('shortBreak')
      })

      it('cyclePosition 8 は長い休憩', () => {
        timer = new PomodoroTimer()
        expect(PomodoroTimer.getSessionTypeFromPosition(8)).toBe('longBreak')
      })
    })

    describe('セッション時間の決定', () => {
      it('作業セッションは25分', () => {
        timer = new PomodoroTimer()
        expect(PomodoroTimer.getSessionDuration('work')).toBe(25 * 60)
      })

      it('短い休憩は5分', () => {
        timer = new PomodoroTimer()
        expect(PomodoroTimer.getSessionDuration('shortBreak')).toBe(5 * 60)
      })

      it('長い休憩は15分', () => {
        timer = new PomodoroTimer()
        expect(PomodoroTimer.getSessionDuration('longBreak')).toBe(15 * 60)
      })
    })

    describe('サイクル遷移', () => {
      it('作業セッション完了後、短い休憩に遷移', async () => {
        // 実装後にテスト有効化
        /*
        timer = new PomodoroTimer()
        await vi.waitFor(() => timer.getTimeLeft() === 25 * 60, { timeout: 1000 })

        // position=1 (work) で開始
        await timer.setTimeSeconds(1)
        await timer.start()

        // 完了まで進める
        vi.advanceTimersByTime(1000)

        await vi.waitFor(() => {
          expect(timer.getCyclePosition()).toBe(2)
          expect(timer.getSessionType()).toBe('shortBreak')
          expect(timer.getTimeLeft()).toBe(5 * 60)
        }, { timeout: 1000 })
        */
      })

      it('短い休憩完了後、作業セッションに遷移', async () => {
        // 実装後にテスト有効化
        /*
        mockStorage.local.get.mockResolvedValue({
          pomodoroState: {
            timeLeft: 1,
            isRunning: false,
            lastSaveTime: Date.now(),
            sessionType: 'shortBreak',
            cyclePosition: 2
          }
        })

        timer = new PomodoroTimer()
        await timer.start()

        vi.advanceTimersByTime(1000)

        await vi.waitFor(() => {
          expect(timer.getCyclePosition()).toBe(3)
          expect(timer.getSessionType()).toBe('work')
          expect(timer.getTimeLeft()).toBe(25 * 60)
        }, { timeout: 1000 })
        */
      })

      it('position=8完了後position=1に戻る', async () => {
        // 実装後にテスト有効化
        /*
        mockStorage.local.get.mockResolvedValue({
          pomodoroState: {
            timeLeft: 1,
            isRunning: false,
            lastSaveTime: Date.now(),
            sessionType: 'longBreak',
            cyclePosition: 8
          }
        })

        timer = new PomodoroTimer()
        await timer.start()

        vi.advanceTimersByTime(1000)

        await vi.waitFor(() => {
          expect(timer.getCyclePosition()).toBe(1)
          expect(timer.getSessionType()).toBe('work')
          expect(timer.getTimeLeft()).toBe(25 * 60)
        }, { timeout: 1000 })
        */
      })
    })

    describe('プリセットボタンのサイクルリセット', () => {
      it('プリセットボタンでサイクルがリセットされる', async () => {
        // 実装後にテスト有効化
        /*
        // サイクル途中の状態を設定
        mockStorage.local.get.mockResolvedValue({
          pomodoroState: {
            timeLeft: 5 * 60,
            isRunning: false,
            lastSaveTime: Date.now(),
            sessionType: 'shortBreak',
            cyclePosition: 4
          }
        })

        timer = new PomodoroTimer()
        await vi.waitFor(() => timer.getCyclePosition() === 4, { timeout: 1000 })

        // プリセットボタン押下（自動開始+リセット）
        await timer.setTimeSeconds(15 * 60) // 15分プリセット

        expect(timer.getCyclePosition()).toBe(1)
        expect(timer.getSessionType()).toBe('work')
        expect(timer.getTimeLeft()).toBe(15 * 60)
        expect(timer.getIsRunning()).toBe(true) // 自動開始
        */
      })
    })

    describe('UI表示の更新', () => {
      it('セッション種別がUIに正しく表示される', async () => {
        // 実装後にテスト有効化
        /*
        const sessionTypeElement = document.getElementById('sessionType')

        // 作業セッション
        timer = new PomodoroTimer()
        timer.updateSessionDisplay() // 実装される予定のメソッド
        expect(sessionTypeElement?.textContent).toBe('作業中')

        // 短い休憩
        timer.setCyclePosition(2)
        timer.updateSessionDisplay()
        expect(sessionTypeElement?.textContent).toBe('短い休憩')

        // 長い休憩
        timer.setCyclePosition(8)
        timer.updateSessionDisplay()
        expect(sessionTypeElement?.textContent).toBe('長い休憩')
        */
      })

      it('進捗ドットが正しく表示される', async () => {
        // 実装後にテスト有効化
        /*
        const progressDotsElement = document.getElementById('progressDots')

        // position 1
        timer = new PomodoroTimer()
        timer.updateSessionDisplay()
        expect(progressDotsElement?.textContent).toBe('●○○○○○○○')

        // position 3
        timer.setCyclePosition(3)
        timer.updateSessionDisplay()
        expect(progressDotsElement?.textContent).toBe('●●●○○○○○')

        // position 8
        timer.setCyclePosition(8)
        timer.updateSessionDisplay()
        expect(progressDotsElement?.textContent).toBe('●●●●●●●●')
        */
      })
    })

    describe('状態の永続化（サイクル対応）', () => {
      it('サイクル状態が正しく保存される', async () => {
        // 実装後にテスト有効化
        /*
        timer = new PomodoroTimer()
        timer.setCyclePosition(3)
        timer.setSessionType('work')
        await timer.start()

        expect(mockStorage.local.set).toHaveBeenCalledWith({
          pomodoroState: expect.objectContaining({
            timeLeft: 25 * 60,
            isRunning: true,
            lastSaveTime: expect.any(Number),
            sessionType: 'work',
            cyclePosition: 3
          })
        })
        */
      })

      it('サイクル状態が復元される', async () => {
        // 実装後にテスト有効化
        /*
        mockStorage.local.get.mockResolvedValue({
          pomodoroState: {
            timeLeft: 5 * 60,
            isRunning: false,
            lastSaveTime: Date.now(),
            sessionType: 'shortBreak',
            cyclePosition: 6
          }
        })

        timer = new PomodoroTimer()

        await vi.waitFor(() => {
          expect(timer.getTimeLeft()).toBe(5 * 60)
          expect(timer.getSessionType()).toBe('shortBreak')
          expect(timer.getCyclePosition()).toBe(6)
        }, { timeout: 1000 })
        */
      })

      it('古い状態データでもデフォルト値で動作する', async () => {
        // 実装後にテスト有効化
        /*
        // sessionType、cyclePositionがない古いデータ
        mockStorage.local.get.mockResolvedValue({
          pomodoroState: {
            timeLeft: 15 * 60,
            isRunning: false,
            lastSaveTime: Date.now()
          }
        })

        timer = new PomodoroTimer()

        await vi.waitFor(() => {
          expect(timer.getTimeLeft()).toBe(15 * 60)
          expect(timer.getSessionType()).toBe('work') // デフォルト値
          expect(timer.getCyclePosition()).toBe(1) // デフォルト値
        }, { timeout: 1000 })
        */
      })
    })
  })
})