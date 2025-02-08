import { Pipe, PipeTransform } from '@angular/core';
import { Event } from './services/events.service';

@Pipe({ name: 'eventDescription' })
export class EventDescriptionPipe implements PipeTransform {
  transform(event: Event): string {
    switch (event.type) {
      case 'PlaybackStarted':
        return `played the sound '${event.soundName}'`;
      case 'PlaybackStopped':
        return 'stopped the playback';
      case 'RecordingSaved':
        return 'saved a recording';
      case 'JoinedChannel':
        return `connected the soundboard to channel '${event.channelName}'`;
      case 'LeftChannel':
        return 'disconnected the soundboard';
    }
  }
}
