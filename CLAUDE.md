# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

pomobop（リズムを刻む + ポモドーロ）は、Manifest V3を使用したChrome拡張機能のポモドーロタイマーです。

## 開発コマンド

```bash
# プロジェクトのビルド
npm run build

# 開発時の自動ビルド
npm run watch

# テスト実行
npm test

# テスト監視モード
npm run test:watch
```

## アーキテクチャ

### 主要コンポーネント

- **popup.ts** - ポップアップUI（PomodoroTimerクラス）
- **background.ts** - バックグラウンドサービスワーカー（BackgroundTimerクラス）
- **notification.ts** - タイマー完了時の通知画面

### 状態管理

両クラスが共通の`TimerState`インターフェースを使用して`chrome.storage.local`で状態を共有:

```typescript
interface TimerState {
  timeLeft: number;
  isRunning: boolean;
  intervalId: number | null;
  lastSaveTime?: number;
}

interface StoredState {
  timeLeft: number;
  isRunning: boolean;
  lastSaveTime: number;
}
```

### PomodoroTimerクラス設計

リファクタリングにより以下の共通メソッドで重複コードを排除:

- **`createTimerInterval()`**: タイマーのカウントダウン処理を統一
- **`updateButtonStates()`**: ボタンの有効/無効状態を一元管理
- **`start()`**: タイマー開始処理（旧`resumeTimer()`も統合）

### 型安全性

- DOM要素に具体的な型を指定（`HTMLDivElement`, `HTMLButtonElement`等）
- Chrome拡張APIの型を厳密に定義
- ジェネリック関数で型安全な要素取得

### アーキテクチャの特徴

1. **状態同期**: ポップアップとバックグラウンドが`chrome.storage.onChanged`でリアルタイム同期
2. **永続化**: タイマー状態はブラウザ終了後も保持され、経過時間を計算して復元
3. **バックグラウンド処理**: `chrome.alarms` APIでブラウザ終了中もタイマー動作
4. **完了時処理**: タイマー完了時に`notification.html`を新しいタブで開き、即座に25分にリセット
5. **DRY原則**: 重複コードを排除し、保守性を向上

### テスト

- **環境**: Vitest + jsdom
- **モック**: Chrome拡張API（storage, alarms, tabs等）をvi.fn()でモック
- **対象**: 両メインクラスの全メソッドをテスト
- **26テスト**: 型安全性向上後も全て通過

### ビルド

TypeScriptで`src/`から`dist/`にコンパイル。`manifest.json`は`dist/background.js`を参照。