import { ChangeDetectionStrategy, Component, computed, Input, signal, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { ApiService, RandomInfix } from '../../services/api.service';
import { RandomInfixesComponent } from '../random-infixes/random-infixes.component';
import { GuildSettings, GuildSettingsService } from '../../services/guild-settings.service';
import { DataLoadDirective } from '../../data-load/data-load.directive';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { NgIf, NgFor, NgTemplateOutlet, NgSwitch, NgSwitchCase, KeyValuePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatSelect } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatOption } from '@angular/material/core';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { UnsavedChangesBoxComponent } from '../unsaved-changes-box/unsaved-changes-box.component';

type SavingState = 'saved' | 'saving' | 'error';

@Component({
  templateUrl: './guild-settings.component.html',
  styleUrls: ['./guild-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataLoadDirective,
    MatToolbar,
    MatTooltip,
    NgIf,
    MatIcon,
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    NgFor,
    NgTemplateOutlet,
    MatInput,
    MatSuffix,
    NgSwitch,
    NgSwitchCase,
    MatProgressSpinner,
    RandomInfixesComponent,
    UnsavedChangesBoxComponent,
    KeyValuePipe,
  ],
})
export class GuildSettingsComponent {
  @ViewChild(RandomInfixesComponent) randomInfixesComponent: RandomInfixesComponent;

  private readonly _guildId = signal<string>(null);
  @Input({ required: true }) set guildId(value: string) {
    this._guildId.set(value);
  }

  readonly guild = computed(() => {
    return this.apiService.user().guilds.find(guild => guild.id === this._guildId());
  });
  readonly role = computed(() => {
    return this.guild()?.role;
  });

  readonly data$ = computed(() => {
    return forkJoin([this.guildSettingsService.loadGuildSettings(this._guildId()), this.apiService.loadRandomInfixes()]);
  });
  readonly loadedData = signal<[GuildSettings, RandomInfix[]]>(null);

  readonly guildSettings = computed(() => this.loadedData()[0]);
  readonly randomInfixes = computed(() => this.loadedData()[1]);

  readonly filteredRandomInfixes = computed(() => {
    const randomInfixes = this.randomInfixes();
    return randomInfixes.filter(infix => infix.guildId === this._guildId());
  });

  readonly userIsSaving = signal<SavingState>(null);
  readonly moderatorIsSaving = signal<SavingState>(null);
  readonly meanVolumeIsSaving = signal<SavingState>(null);
  readonly maxVolumeIsSaving = signal<SavingState>(null);

  readonly randomInfixesHasChanges = signal(false);
  readonly randomInfixIsSaving = signal(false);

  constructor(private apiService: ApiService, private guildSettingsService: GuildSettingsService, private snackBar: MatSnackBar) {}

  saveRandomInfixes() {
    this.randomInfixIsSaving.set(true);
    this.randomInfixesComponent
      .saveChanges()
      .pipe(finalize(() => this.randomInfixIsSaving.set(false)))
      .subscribe({
        error: err => {
          console.error(err);
          this.snackBar.open('Failed to save random buttons.', 'Damn', { duration: undefined });
        },
      });
  }

  setUserRoleId(roleId: string, guildId: string) {
    this.userIsSaving.set('saving');
    this.guildSettingsService.updateGuildSettings(guildId, { userRoleId: roleId }).subscribe(
      () => this.userIsSaving.set('saved'),
      () => this.userIsSaving.set('error')
    );
  }

  setModeratorRoleId(roleId: string, guildId: string) {
    this.moderatorIsSaving.set('saving');
    this.guildSettingsService.updateGuildSettings(guildId, { moderatorRoleId: roleId }).subscribe(
      () => this.moderatorIsSaving.set('saved'),
      () => this.moderatorIsSaving.set('error')
    );
  }

  setMeanVolume(volume: string, guildId: string) {
    if (volume.length > 0 && +volume > -30 && +volume < 30) {
      this.meanVolumeIsSaving.set('saving');
      this.guildSettingsService.updateGuildSettings(guildId, { targetMeanVolume: +volume }).subscribe(
        () => this.meanVolumeIsSaving.set('saved'),
        () => this.meanVolumeIsSaving.set('error')
      );
    }
  }

  setMaxVolume(volume: string, guildId: string) {
    if (volume.length > 0 && +volume > -30 && +volume < 30) {
      this.maxVolumeIsSaving.set('saving');
      this.guildSettingsService.updateGuildSettings(guildId, { targetMaxVolume: +volume }).subscribe(
        () => this.maxVolumeIsSaving.set('saved'),
        () => this.maxVolumeIsSaving.set('error')
      );
    }
  }
}
