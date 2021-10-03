import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { ErrorService } from './error.service';

type BaseEventData = { guildId: string; userName: string; userAvatarUrl: string };

export type Event = ({ type: 'PlaybackStarted'; soundName: string } | { type: 'PlaybackStopped' } | { type: 'RecordingSaved' }) &
  BaseEventData;

@Injectable({
  providedIn: 'root',
})
export class EventsService {
  constructor(private zone: NgZone, private errorService: ErrorService) {}

  getEventStream(guildId: string) {
    return new Observable(observer => {
      const eventSource = new EventSource(`/api/${guildId}/events`);

      eventSource.onmessage = event => {
        this.zone.run(() => {
          observer.next(event.data as Event);
        });
      };

      eventSource.onerror = error => {
        this.zone.run(() => {
          observer.error(error);
        });
      };
    });
  }
}
