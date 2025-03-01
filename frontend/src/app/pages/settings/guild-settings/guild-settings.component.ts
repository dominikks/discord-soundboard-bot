import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  Input,
  Pipe,
  PipeTransform,
  signal,
  ViewChild,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { KeyValuePipe, NgTemplateOutlet } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatSelect } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatOption } from '@angular/material/core';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { DataLoadDirective } from '../../../common/data-load/data-load.directive';
import { GuildSettingsService } from '../../../services/guild-settings.service';
import { RandomInfixesComponent } from '../random-infixes/random-infixes.component';
import { ApiService, RandomInfix, User } from '../../../services/api.service';
import { UnsavedChangesBoxComponent } from '../unsaved-changes-box/unsaved-changes-box.component';

type SavingState = 'saved' | 'saving' | 'error';

@Pipe({ name: 'filterInfixes' })
export class FilterRandomInfixesPipe implements PipeTransform {
  transform(value: RandomInfix[], guildId: string) {
    return value.filter(infix => infix.guildId === guildId);
  }
}

@Component({
  templateUrl: './guild-settings.component.html',
  styleUrls: ['./guild-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataLoadDirective,
    MatToolbar,
    MatTooltip,
    MatIcon,
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    NgTemplateOutlet,
    MatInput,
    MatSuffix,
    MatProgressSpinner,
    RandomInfixesComponent,
    UnsavedChangesBoxComponent,
    KeyValuePipe,
    FilterRandomInfixesPipe,
  ],
})
export class GuildSettingsComponent {
  private apiService = inject(ApiService);
  private guildSettingsService = inject(GuildSettingsService);
  private snackBar = inject(MatSnackBar);

  @ViewChild(RandomInfixesComponent) randomInfixesComponent!: RandomInfixesComponent;
  @Input({ required: true }) user!: User;

  readonly guildId = input.required<string>();
  private readonly guild = computed(() => this.user.guilds.find(guild => guild.id === this.guildId()));

  readonly guildName = computed(() => this.guild()?.name ?? 'Unknown guild');
  readonly guildRole = computed(() => this.guild()?.role);

  readonly data$ = computed(() => {
    return forkJoin({
      guildSettings: this.guildSettingsService.loadGuildSettings(this.guildId()),
      randomInfixes: this.apiService.loadRandomInfixes(),
    });
  });

  readonly userIsSaving = signal<SavingState | null>(null);
  readonly moderatorIsSaving = signal<SavingState | null>(null);
  readonly meanVolumeIsSaving = signal<SavingState | null>(null);
  readonly maxVolumeIsSaving = signal<SavingState | null>(null);

  readonly randomInfixesHasChanges = signal(false);
  readonly randomInfixIsSaving = signal(false);

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
      () => this.userIsSaving.set('error'),
    );
  }

  setModeratorRoleId(roleId: string, guildId: string) {
    this.moderatorIsSaving.set('saving');
    this.guildSettingsService.updateGuildSettings(guildId, { moderatorRoleId: roleId }).subscribe(
      () => this.moderatorIsSaving.set('saved'),
      () => this.moderatorIsSaving.set('error'),
    );
  }

  setMeanVolume(volume: string, guildId: string) {
    if (volume.length > 0 && +volume > -30 && +volume < 30) {
      this.meanVolumeIsSaving.set('saving');
      this.guildSettingsService.updateGuildSettings(guildId, { targetMeanVolume: +volume }).subscribe(
        () => this.meanVolumeIsSaving.set('saved'),
        () => this.meanVolumeIsSaving.set('error'),
      );
    }
  }

  setMaxVolume(volume: string, guildId: string) {
    if (volume.length > 0 && +volume > -30 && +volume < 30) {
      this.maxVolumeIsSaving.set('saving');
      this.guildSettingsService.updateGuildSettings(guildId, { targetMaxVolume: +volume }).subscribe(
        () => this.maxVolumeIsSaving.set('saved'),
        () => this.maxVolumeIsSaving.set('error'),
      );
    }
  }
}
