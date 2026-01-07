import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { Event } from 'src/app/services/events.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatePipe } from '@angular/common';
import { MatCell, MatCellDef, MatColumnDef, MatRow, MatRowDef, MatTable } from '@angular/material/table';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { ScrollIntoViewDirective } from '../../../common/scroll-into-view.directive';
import { EventDescriptionPipe } from '../../../common/event-description.pipe';

@Component({
  templateUrl: './event-log-dialog.component.html',
  styleUrls: ['./event-log-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatTable,
    MatColumnDef,
    MatCellDef,
    MatCell,
    MatIcon,
    MatRowDef,
    MatRow,
    ScrollIntoViewDirective,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    DatePipe,
    EventDescriptionPipe,
  ],
})
export class EventLogDialogComponent {
  readonly displayedColumns = ['timestamp', 'icon', 'user', 'description'];
  readonly events = signal<Event[]>([]);

  constructor() {
    const events = inject<Observable<Event>>(MAT_DIALOG_DATA);
    const snackBar = inject(MatSnackBar);

    events.pipe(takeUntilDestroyed()).subscribe({
      next: event => this.events.update(events => [...events, event]),
      error: () => snackBar.open('Failed to fetch events.', 'Damn', { duration: undefined }),
    });
  }
}
