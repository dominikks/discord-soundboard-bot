import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';

type BaseEventData = { guildId: string; userName: string; userAvatarUrl: string; timestamp: number };

export type Event = ({ type: 'PlaybackStarted'; soundName: string } | { type: 'PlaybackStopped' } | { type: 'RecordingSaved' }) &
  BaseEventData;

@Injectable({
  providedIn: 'root',
})
export class EventsService {
  constructor(private zone: NgZone) {}

  getEventStream(guildId: string): Observable<Event> {
    return new Observable(observer => {
      const eventSource = new EventSource(`/api/${guildId}/events`);

      eventSource.onmessage = event => {
        this.zone.run(() => {
          observer.next(JSON.parse(event.data) as Event);
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
