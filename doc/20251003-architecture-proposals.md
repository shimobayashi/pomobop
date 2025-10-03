# ポモドーロタイマー アーキテクチャ提案書

## 概要

本文書では、Chrome拡張機能ポモドーロタイマー（pomobop）の設計について、4つのアーキテクチャ案を検討し、それぞれのメリット・デメリットを分析します。

## 現在のアーキテクチャの問題点

### 問題
1. **責任の分散**: ポップアップとバックグラウンドの両方で完了処理
2. **複雑な協調メカニズム**: フラグ(`pomodoroCompletedByPopup`)で重複防止
3. **状態の重複**: 2つの`TimerState`インターフェース（popup.ts と background.ts）
4. **テスタビリティ**: バックグラウンドとポップアップの相互作用が複雑

### 症状
- タイマー完了時にポップアップが二重に開かれる
- 状態遷移が正常に動作しない場合がある
- 競合状態による予期しない動作

## アーキテクチャ案

---

## 案1: ポップアップ主導型 👑 **推奨**

### 概要
ポップアップで全ての状態管理・完了処理を行い、バックグラウンドは純粋にalarms APIの橋渡しのみを担当する。

### アーキテクチャ図
```
┌─────────────────┐    ┌─────────────────┐
│   popup.ts      │    │  background.ts  │
│ ・状態管理      │    │ ・alarms API    │
│ ・UI更新        │◄───┤ ・イベント転送  │
│ ・完了処理      │    │                 │
│ ・通知タブ開く  │    │                 │
└─────────────────┘    └─────────────────┘
```

### 実装方針
```typescript
// popup.ts - 全ての責任を持つ
class PomodoroTimer {
  private state: TimerState;
  private intervalId: number | null = null;

  // タイマー制御
  start(): void;
  pause(): void;
  complete(): void;

  // 状態管理
  private updateState(): void;
  private saveState(): void;

  // UI更新
  private updateDisplay(): void;
  private updateButtons(): void;
}

// background.ts - 最小限のアラーム橋渡し
class BackgroundTimer {
  // alarms APIイベントをポップアップに通知するだけ
  private handleAlarm(): void {
    // ポップアップに完了を通知
    // または直接通知タブを開く（バックアップ）
  }
}
```

### メリット
- ✅ **シンプル**: 1つのクラスで全ロジック管理
- ✅ **テスタブル**: ポップアップ単体でテスト可能
- ✅ **デバッグ容易**: 状態変更が1箇所に集約
- ✅ **競合なし**: 複数箇所での状態変更がない
- ✅ **高レスポンス**: ユーザー操作への即座の反応
- ✅ **Chrome拡張のベストプラクティス**: ポップアップ主導が一般的

### デメリット
- ⚠️ **ポップアップ閉鎖時**: ブラウザが閉じている時は完了処理されない
- ⚠️ **通知遅延**: ポップアップが開かれるまで通知されない

### 対策
```typescript
// バックアップアラームで対策
async start() {
  // ポップアップでのタイマー開始
  this.startLocalTimer();

  // バックアップアラーム設定（ポップアップ閉鎖時用）
  const endTime = Date.now() + (this.state.timeLeft * 1000);
  await chrome.alarms.create('backup', { when: endTime });
}
```

---

## 案2: バックグラウンド主導型

### 概要
バックグラウンドで全ての状態管理を行い、ポップアップは表示のみを担当する。

### アーキテクチャ図
```
┌─────────────────┐    ┌─────────────────┐
│   popup.ts      │    │  background.ts  │
│ ・UI表示のみ    │◄───┤ ・状態管理      │
│ ・ユーザー操作  │────►│ ・完了処理      │
│   転送          │    │ ・通知タブ開く  │
└─────────────────┘    └─────────────────┘
```

### 通信メカニズム
```typescript
// popup.ts → background.ts (コマンド)
chrome.runtime.sendMessage({ type: 'START_TIMER' });

// background.ts → popup.ts (状態同期)
chrome.storage.local.set({ pomodoroState: newState });
chrome.storage.onChanged.addListener(/* popup側で監視 */);
```

### メリット
- ✅ **確実性**: ブラウザ閉鎖時も動作
- ✅ **一元管理**: 状態がバックグラウンドに集約
- ✅ **スケーラビリティ**: 複数UIから同じサービス利用可能
- ✅ **ビジネスロジック分離**: UIとロジックが完全分離

### デメリット
- ❌ **複雑**: ポップアップ↔バックグラウンド間の通信が複雑
- ❌ **テスト困難**: 2つのコンポーネント間の相互作用をテスト
- ❌ **レスポンス性**: ユーザー操作のレスポンスが遅い可能性
- ❌ **エラーハンドリング**: エラー発生箇所が複数

### 課題: タイマー更新の問題

#### アプローチA: バックグラウンドで毎秒更新
```typescript
// background.ts
setInterval(() => {
  this.state.timeLeft--;
  chrome.storage.local.set({ pomodoroState: this.state }); // 毎秒書き込み
}, 1000);
```

**問題**:
- 💥 **パフォーマンス悪化**: 毎秒chrome.storage書き込み
- 💥 **ポップアップのラグ**: storage→popup更新で遅延
- 💥 **バッテリー消耗**: Service Workerが常時動作

#### アプローチB: ポップアップで表示更新
```typescript
// popup.ts - 表示用タイマー
setInterval(() => {
  this.displayTime--;
  this.updateDisplay();
}, 1000);

// background.ts - 完了判定のみ
chrome.alarms.create('completion', { when: endTime });
```

**問題**:
- 💥 **同期ズレ**: ポップアップとバックグラウンドで時間が異なる
- 💥 **複雑な同期**: どちらが正しい時間？

---

## 案2A: バックグラウンド完全主導型（詳細版）

### 基本思想
「バックグラウンドがすべての状態とタイミングを管理し、ポップアップは単純なビューアー」

### 詳細アーキテクチャ
```
┌─────────────────────────────────────────────────────────────┐
│                    popup.ts (Pure View)                    │
├─────────────────────────────────────────────────────────────┤
│ class PomodoroPopup {                                       │
│   // 状態なし - 完全にstateless                              │
│   render(state: TimerState): void                          │
│   onUserAction(action: string): void                       │
│ }                                                           │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
            Commands │                       │ State Updates
      (chrome.runtime.sendMessage)          │ (chrome.storage.onChanged)
                  │                       │
                  ▼                       ▲
┌─────────────────────────────────────────────────────────────┐
│                background.ts (Complete Logic)               │
├─────────────────────────────────────────────────────────────┤
│ class PomodoroService {                                     │
│   // 全状態管理                                              │
│   private state: TimerState                                 │
│   private intervalId: number | null                         │
│                                                             │
│   // タイマー制御                                            │
│   startTimer(): void                                        │
│   pauseTimer(): void                                        │
│   resetTimer(): void                                        │
│                                                             │
│   // 毎秒更新                                               │
│   private tick(): void                                      │
│   private scheduleNextTick(): void                          │
│                                                             │
│   // 状態同期                                               │
│   private saveAndBroadcast(): void                         │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### 実装例

#### background.ts
```typescript
class PomodoroService {
  private state: TimerState = {
    timeLeft: 25 * 60,
    isRunning: false,
    sessionType: 'work',
    cyclePosition: 1,
    lastUpdateTime: Date.now()
  };

  private intervalId: number | null = null;

  startTimer(): void {
    this.state.isRunning = true;
    this.state.lastUpdateTime = Date.now();
    this.scheduleNextTick();
    this.saveAndBroadcast();
  }

  private scheduleNextTick(): void {
    if (!this.state.isRunning) return;

    this.intervalId = setTimeout(() => {
      this.tick();
      this.scheduleNextTick();
    }, 1000);
  }

  private tick(): void {
    this.state.timeLeft--;
    this.state.lastUpdateTime = Date.now();

    if (this.state.timeLeft <= 0) {
      this.completeSession();
    } else {
      this.saveAndBroadcast(); // 毎秒storage書き込み
    }
  }

  private async saveAndBroadcast(): Promise<void> {
    await chrome.storage.local.set({ pomodoroState: this.state });
  }
}
```

#### popup.ts
```typescript
class PomodoroPopup {
  private initializeStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.pomodoroState) {
        this.render(changes.pomodoroState.newValue);
      }
    });
  }

  private async sendCommand(command: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: command });
  }

  private render(state: TimerState): void {
    this.updateTimeDisplay(state.timeLeft);
    this.updateButtons(state.isRunning);
  }
}
```

### 重大な問題点

#### パフォーマンス問題
```typescript
// 25分タイマーの場合
// 25分 × 60秒 = 1500回のdisk書き込み
// → バッテリー消耗、I/O負荷

// Chrome storage quota制限
// 毎秒書き込みは推奨されない
```

#### Service Worker制約
```typescript
// Chrome Service Worker は30秒でアイドル停止
// setInterval/setTimeout が途中で止まる
// → タイマー精度に問題
```

#### レスポンス遅延
```
ユーザークリック → sendMessage → background処理 → storage書き込み → popup更新
     即座              5ms          1ms           10ms          5ms
                               合計遅延: 21ms
```

---

## 案3: イベント駆動型

### 概要
カスタムイベントで疎結合にする。

### アーキテクチャ図
```
┌─────────────────┐    ┌─────────────────┐
│   popup.ts      │    │  background.ts  │
│ ・UI管理        │    │ ・alarms管理    │
│ ・ローカル状態  │    │ ・永続化        │
└─────┬───────────┘    └─────┬───────────┘
      │                        │
      └────────┐    ┌──────────┘
               │    │
        ┌──────▼────▼──────┐
        │   Event Bus      │
        │ ・timer_complete │
        │ ・timer_start    │
        │ ・timer_pause    │
        └──────────────────┘
```

### メリット
- ✅ **疎結合**: コンポーネント間の依存が少ない
- ✅ **拡張性**: 新機能追加が容易
- ✅ **テスタブル**: 各コンポーネントを独立テスト可能

### デメリット
- ❌ **複雑性**: イベント管理が複雑
- ❌ **デバッグ困難**: イベントフローの追跡が困難
- ❌ **オーバーエンジニアリング**: 小規模アプリには過剰

---

## 案4: ハイブリッド型（現在の改良版）

### 概要
現在の構造を整理し、明確な責任分離を行う。

### アーキテクチャ図
```
┌─────────────────┐    ┌─────────────────┐
│   popup.ts      │    │  background.ts  │
│ ・状態管理      │◄───┤ ・永続化        │
│ ・UI更新        │────►│ ・alarms管理    │
│ ・セッション遷移│    │ ・通知タブ      │
└─────────────────┘    └─────────────────┘
```

### 実装方針
```typescript
// popup.ts - メイン処理
class PomodoroTimer {
  async complete(): Promise<void> {
    await this.moveToNextSession();

    // バックグラウンドに完了通知
    await chrome.storage.local.set({
      pomodoroCompletedByPopup: true
    });
  }
}

// background.ts - 補助処理
class BackgroundTimer {
  async handleTimerComplete(): Promise<void> {
    const completed = await chrome.storage.local.get('pomodoroCompletedByPopup');

    if (completed.pomodoroCompletedByPopup) {
      // ポップアップが処理済み → 通知タブのみ
      await this.showNotification();
      await chrome.storage.local.remove('pomodoroCompletedByPopup');
    } else {
      // ポップアップが処理してない → 完全処理
      await this.showNotification();
      await this.resetState();
    }
  }
}
```

### メリット
- ✅ **現実的**: 現在のコードを活かせる
- ✅ **段階的改善**: 少しずつ改善可能
- ✅ **バランス**: シンプルさと確実性のバランス

### デメリット
- ⚠️ **複雑性残存**: 2箇所での処理は継続
- ⚠️ **同期問題**: タイミング依存の問題が残る可能性

---

## 比較表

| 項目 | 案1<br/>ポップアップ主導 | 案2<br/>バックグラウンド主導 | 案2A<br/>完全バックグラウンド | 案3<br/>イベント駆動 | 案4<br/>ハイブリッド |
|------|---------|---------|---------|---------|---------|
| **シンプルさ** | ⭐⭐⭐ | ⭐ | ⭐ | ⭐ | ⭐⭐ |
| **確実性** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **レスポンス性** | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ | ⭐⭐⭐ |
| **テスタビリティ** | ⭐⭐⭐ | ⭐ | ⭐ | ⭐⭐ | ⭐⭐ |
| **パフォーマンス** | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ | ⭐⭐⭐ |
| **保守性** | ⭐⭐⭐ | ⭐ | ⭐ | ⭐⭐ | ⭐⭐ |
| **実装コスト** | 低 | 中 | 高 | 高 | 低 |

## 推奨案と理由

### 🏆 推奨: **案1 - ポップアップ主導型**

#### 理由
1. **Chrome拡張の特性に適合**: ポップアップが主要UI
2. **シンプルで理解しやすい**: 1つのクラスで状態管理
3. **高いレスポンス性**: ユーザー操作への即座の反応
4. **テストが容易**: 単一コンポーネントでのテスト
5. **現実的**: Chrome拡張のベストプラクティス

#### 実装の方向性
```typescript
class PomodoroTimer {
  // メイン処理：ポップアップで全て管理
  // バックアップ：chrome.alarmsで保険

  async start() {
    this.startLocalTimer();
    await chrome.alarms.create('backup', { when: this.endTime });
  }
}
```

### 次点: **案4 - ハイブリッド型**
現在のコードベースから段階的に改善する場合の選択肢。

## Chrome拡張開発のベストプラクティス

### 推奨パターン
1. **ポップアップ主導** + **chrome.alarms バックアップ**
2. **最小限のService Worker**
3. **chrome.storage は状態永続化のみ**

### 避けるべきパターン
1. **Service Workerでの頻繁なsetInterval**
2. **毎秒のchrome.storage書き込み**
3. **複雑なコンポーネント間通信**

## 結論

ポモドーロタイマーのような**リアルタイム性が重要な小規模アプリケーション**では、**案1（ポップアップ主導型）**が最も適しています。

シンプルで確実、そしてChrome拡張の特性を活かした設計により、保守性とユーザー体験の両方を実現できます。