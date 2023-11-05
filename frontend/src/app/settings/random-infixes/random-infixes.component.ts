import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { tap } from 'rxjs/operators';
import { RandomInfix } from 'src/app/services/api.service';
import { GuildSettingsService } from '../../services/guild-settings.service';

@Component({
  selector: 'app-random-infixes',
  templateUrl: './random-infixes.component.html',
  styleUrls: ['./random-infixes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RandomInfixesComponent implements OnChanges {
  @Input({ required: true }) guildId: string;
  @Input({ required: true }) randomInfixes: RandomInfix[];
  @Output() hasChanges = new EventEmitter<boolean>();

  infixes: RandomInfix[];

  constructor(private guildSettingsService: GuildSettingsService, private cdRef: ChangeDetectorRef) {}

  addRandomInfix() {
    this.infixes.push({ guildId: this.guildId, displayName: '', infix: '' });
    this.infixes = this.infixes.slice();
    this.hasChanges.emit(true);
  }

  removeRandomInfix(index: number) {
    this.infixes.splice(index, 1);
    this.infixes = this.infixes.slice();
    this.hasChanges.emit(true);
  }

  ngOnChanges(changes: SimpleChanges) {
    if ('randomInfixes' in changes && this.infixes == null) {
      this.discardChanges();
    }
  }

  discardChanges() {
    this.infixes = [...this.randomInfixes];
    this.hasChanges.emit(false);
  }

  saveChanges() {
    return this.guildSettingsService
      .updateRandomInfixes(
        this.guildId,
        this.infixes.filter(infix => infix.displayName.length > 0 && infix.infix.length > 0)
      )
      .pipe(
        tap(() => {
          this.randomInfixes = this.infixes;
          this.discardChanges();
          this.cdRef.markForCheck();
        })
      );
  }
}
