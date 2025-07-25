class PomodoroTimer {
  constructor() {
    this.timeLeft = 25 * 60; // 25分をデフォルト
    this.isRunning = false;
    this.intervalId = null;
    
    this.timerDisplay = document.getElementById('timerDisplay');
    this.startBtn = document.getElementById('startBtn');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.preset25 = document.getElementById('preset25');
    this.preset15 = document.getElementById('preset15');
    this.preset5 = document.getElementById('preset5');
    this.preset1sec = document.getElementById('preset1sec');
    
    this.initEventListeners();
    this.updateDisplay();
  }
  
  initEventListeners() {
    this.startBtn.addEventListener('click', () => this.start());
    this.pauseBtn.addEventListener('click', () => this.pause());
    this.resetBtn.addEventListener('click', () => this.reset());
    
    this.preset25.addEventListener('click', () => this.setTime(25));
    this.preset15.addEventListener('click', () => this.setTime(15));
    this.preset5.addEventListener('click', () => this.setTime(5));
    this.preset1sec.addEventListener('click', () => this.setTimeSeconds(1));
  }
  
  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.startBtn.disabled = true;
      this.pauseBtn.disabled = false;
      
      this.intervalId = setInterval(() => {
        this.timeLeft--;
        this.updateDisplay();
        
        if (this.timeLeft <= 0) {
          this.complete();
        }
      }, 1000);
    }
  }
  
  pause() {
    if (this.isRunning) {
      this.isRunning = false;
      this.startBtn.disabled = false;
      this.pauseBtn.disabled = true;
      
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }
  }
  
  reset() {
    this.pause();
    this.timeLeft = 25 * 60;
    this.updateDisplay();
  }
  
  setTime(minutes) {
    if (!this.isRunning) {
      this.timeLeft = minutes * 60;
      this.updateDisplay();
    }
  }
  
  setTimeSeconds(seconds) {
    if (!this.isRunning) {
      this.timeLeft = seconds;
      this.updateDisplay();
    }
  }
  
  complete() {
    this.pause();
    this.timerDisplay.textContent = "完了！";
    this.timerDisplay.style.color = "#27ae60";
    
    // 3秒後にリセット
    setTimeout(() => {
      this.reset();
      this.timerDisplay.style.color = "#e74c3c";
    }, 3000);
  }
  
  updateDisplay() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  new PomodoroTimer();
});