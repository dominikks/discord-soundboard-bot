import { Component, Inject, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Event } from 'src/app/services/events.service';

@Component({
  templateUrl: './event-log-dialog.component.html',
  styleUrls: ['./event-log-dialog.component.scss'],
})
export class EventLogDialogComponent implements OnDestroy {
  private onDestroy$ = new Subject<void>();

  displayedColumns = ['timestamp', 'icon', 'user', 'description'];
  events: Event[] = [];

  constructor(@Inject(MAT_DIALOG_DATA) events: Observable<Event>) {
    events.pipe(takeUntil(this.onDestroy$)).subscribe(event => (this.events = [...this.events, event]));
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  trackByIndex(index: number, _item: Event) {
    return index;
  }
}
