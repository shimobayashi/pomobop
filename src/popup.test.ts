import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PomodoroTimer } from './popup'

describe('PomodoroTimer', () => {
  let timer: PomodoroTimer

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
    
    timer = new PomodoroTimer()
    vi.useFakeTimers()
  })

  afterEach(() => {
    // タイマーをクリーンアップ
    timer.pause()
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

  describe('プリセット機能', () => {
    it('25分プリセットが動作する', () => {
      timer.setTime(25)
      expect(timer.getTimeLeft()).toBe(25 * 60)
    })

    it('15分プリセットが動作する', () => {
      timer.setTime(15)
      expect(timer.getTimeLeft()).toBe(15 * 60)
    })

    it('5分プリセットが動作する', () => {
      timer.setTime(5)
      expect(timer.getTimeLeft()).toBe(5 * 60)
    })

    it('1秒プリセットが動作する', () => {
      timer.setTimeSeconds(1)
      expect(timer.getTimeLeft()).toBe(1)
    })
  })

  describe('タイマー操作', () => {
    it('開始ボタンでタイマーが開始される', () => {
      timer.start()
      expect(timer.getIsRunning()).toBe(true)
      
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
      expect(startBtn.disabled).toBe(true)
      expect(pauseBtn.disabled).toBe(false)
    })

    it('一時停止ボタンでタイマーが停止される', () => {
      timer.start()
      timer.pause()
      expect(timer.getIsRunning()).toBe(false)
      
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
      expect(startBtn.disabled).toBe(false)
      expect(pauseBtn.disabled).toBe(true)
    })

    it('リセットボタンで25分に戻る', () => {
      timer.setTime(10)
      timer.reset()
      expect(timer.getTimeLeft()).toBe(25 * 60)
      expect(timer.getIsRunning()).toBe(false)
    })
  })

  describe('タイマーのカウントダウン', () => {
    it('実行中はプリセット変更できない', () => {
      timer.start()
      const initialTime = timer.getTimeLeft()
      timer.setTime(10)
      expect(timer.getTimeLeft()).toBe(initialTime)
    })

    it('1秒経過で時間が減る', () => {
      timer.setTimeSeconds(10)
      timer.start()
      
      vi.advanceTimersByTime(1000)
      expect(timer.getTimeLeft()).toBe(9)
    })

    it('複数秒経過で時間が減る', () => {
      timer.setTimeSeconds(10)
      timer.start()
      
      vi.advanceTimersByTime(3000)
      expect(timer.getTimeLeft()).toBe(7)
    })
  })

  describe('タイマー完了', () => {
    it('タイマーが0になると完了状態になる', () => {
      timer.setTimeSeconds(2)
      timer.start()
      
      // 2秒経過でタイマー完了
      vi.advanceTimersByTime(2000)
      
      expect(timer.getTimeLeft()).toBe(0)
      expect(timer.getIsRunning()).toBe(false)
      
      const display = document.getElementById('timerDisplay')
      expect(display?.textContent).toBe('完了！')
      expect(display?.style.color).toBe('rgb(39, 174, 96)') // #27ae60
    })

    it('完了後3秒でリセットされる', () => {
      timer.setTimeSeconds(1)
      timer.start()
      
      // 1秒経過でタイマー完了
      vi.advanceTimersByTime(1000)
      expect(timer.getTimeLeft()).toBe(0)
      
      const display = document.getElementById('timerDisplay')
      expect(display?.textContent).toBe('完了！')
      
      // さらに3秒経過でリセット
      vi.advanceTimersByTime(3000)
      expect(timer.getTimeLeft()).toBe(25 * 60)
      expect(display?.textContent).toBe('25:00')
      expect(display?.style.color).toBe('rgb(231, 76, 60)') // #e74c3c
    })

    it('完了時にボタンが正しい状態になる', () => {
      timer.setTimeSeconds(1)
      timer.start()
      
      // 1秒経過でタイマー完了
      vi.advanceTimersByTime(1000)
      
      const startBtn = document.getElementById('startBtn') as HTMLButtonElement
      const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
      
      expect(startBtn.disabled).toBe(false)
      expect(pauseBtn.disabled).toBe(true)
    })
  })
})