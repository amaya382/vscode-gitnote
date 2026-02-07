import * as vscode from "vscode";
import type { CoordinatorState } from "./operationCoordinator";

interface StatusDisplay {
  icon: string;
  label?: string;
  tooltip: string;
}

const STATUS: Record<CoordinatorState, StatusDisplay> = {
  idle: { icon: "$(circle-slash)", tooltip: "GitNote: Off" },
  watching: { icon: "$(note)", tooltip: "GitNote: Watching" },
  committing: { icon: "$(sync~spin)", label: "Committing", tooltip: "GitNote: Committing" },
  pushing: { icon: "$(cloud-upload)", label: "Pushing", tooltip: "GitNote: Pushing" },
  pulling: { icon: "$(cloud-download)", label: "Pulling", tooltip: "GitNote: Pulling" },
  error: { icon: "$(warning)", tooltip: "GitNote: Error" },
  paused: { icon: "$(debug-pause)", tooltip: "GitNote: Paused" },
};

export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private currentState: CoordinatorState = "idle";
  private countdown = 0;
  private countdownDigits = 2;
  private _showCountdown = true;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = "gitnote.toggle";
    this.render();
    this.item.show();
  }

  set showCountdown(value: boolean) {
    this._showCountdown = value;
    this.render();
  }

  update(state: CoordinatorState): void {
    this.currentState = state;
    this.countdown = 0;
    this.render();
  }

  updateCountdown(seconds: number): void {
    if (this.countdown === 0 && seconds > 0) {
      this.countdownDigits = String(seconds).length;
    }
    this.countdown = seconds;
    this.render();
  }

  private render(): void {
    const s = STATUS[this.currentState];

    if (this._showCountdown && this.countdown > 0 && this.currentState === "watching") {
      const padded = String(this.countdown).padStart(this.countdownDigits, "0");
      this.item.text = `${s.icon} ${padded}s`;
    } else if (s.label) {
      this.item.text = `${s.icon} ${s.label}`;
    } else {
      this.item.text = s.icon;
    }

    this.item.tooltip = s.tooltip;

    if (this.currentState === "error") {
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    } else if (this.currentState === "paused") {
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    } else {
      this.item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
