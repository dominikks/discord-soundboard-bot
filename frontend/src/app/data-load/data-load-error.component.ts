import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

@Component({
  template: `
    <div class="error-box">
      <mat-icon>error</mat-icon>
      <div>There was an error loading the required data. Please try again later.</div>
    </div>
    <button mat-button (click)="retry.emit()"><mat-icon>refresh</mat-icon> Retry</button>
  `,
  styles: [
    `
      @use '@angular/material' as mat;

      :host {
        @include mat.elevation(4);
        background-color: rgba(255, 0, 0, 0.2);
        border-radius: 5px;

        display: block;
        max-width: 400px;
        margin: 16px auto;
        padding: 16px;
      }

      .error-box {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        gap: 8px;

        mat-icon {
          flex-shrink: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataLoadErrorComponent {
  @Output() retry = new EventEmitter<void>();
}
