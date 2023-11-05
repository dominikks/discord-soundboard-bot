import { ChangeDetectionStrategy, Component, Inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { Event } from 'src/app/services/events.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  templateUrl: './event-log-dialog.component.html',
  styleUrls: ['./event-log-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLogDialogComponent {
  readonly displayedColumns = ['timestamp', 'icon', 'user', 'description'];
  readonly events = signal<Event[]>([]);

  constructor(@Inject(MAT_DIALOG_DATA) events: Observable<Event>, snackBar: MatSnackBar) {
    events.pipe(takeUntilDestroyed()).subscribe({
      next: event => this.events.mutate(events => events.push(event)),
      error: () => snackBar.open('Failed to fetch events.', 'Damn'),
    });
  }

  trackByIndex(index: number, _item: Event) {
    return index;
  }
}
