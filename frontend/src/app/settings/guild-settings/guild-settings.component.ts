import { animate, state, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { finalize, map, shareReplay, takeUntil } from 'rxjs/operators';
import { ApiService, Guild, GuildData, RandomInfix, UserRole } from 'src/app/services/api.service';
import { ErrorService } from 'src/app/services/error.service';
import { RandomInfixesComponent } from '../random-infixes/random-infixes.component';

type SavingState = 'idle' | 'saving' | 'error';

@Component({
  selector: 'app-guild-settings',
  templateUrl: './guild-settings.component.html',
  styleUrls: ['./guild-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('savingCheckmark', [
      state('*', style({ opacity: 0 })),
      transition('false => true', [style({ opacity: 1 }), animate('2s'), animate('500ms', style({ opacity: 0 }))]),
    ]),
  ],
})
export class GuildSettingsComponent implements OnDestroy {
  @ViewChild(RandomInfixesComponent) randomInfixesComponent: RandomInfixesComponent;
  private onDestroy$ = new Subject<void>();

  guild$: Observable<Guild>;
  role$: Observable<UserRole>;
  guildSettings$: Observable<GuildData>;
  randomInfixes$: Observable<RandomInfix[]>;

  userIsSaving$ = new BehaviorSubject<SavingState>('idle');
  moderatorIsSaving$ = new BehaviorSubject<SavingState>('idle');
  meanVolumeIsSaving$ = new BehaviorSubject<SavingState>('idle');
  maxVolumeIsSaving$ = new BehaviorSubject<SavingState>('idle');

  randomInfixesHasChanges$ = new BehaviorSubject(false);
  randomInfixIsSaving$ = new BehaviorSubject(false);

  constructor(
    private apiService: ApiService,
    private errorService: ErrorService,
    private snackBar: MatSnackBar,
    route: ActivatedRoute,
    cdRef: ChangeDetectorRef
  ) {
    route.params
      .pipe(
        takeUntil(this.onDestroy$),
        map(params => params.guildId)
      )
      .subscribe((guildId: string) => {
        this.guild$ = this.apiService.user$.pipe(
          map(user => user.guilds.find(guild => guild.id === guildId)),
          shareReplay(1)
        );
        this.role$ = this.apiService.user$.pipe(
          map(user => user.guilds.find(guild => guild.id === guildId).role),
          shareReplay(1)
        );
        this.guildSettings$ = this.apiService
          .loadGuildSettings(guildId)
          .pipe(this.errorService.showError('Failed to fetch random buttons'), shareReplay(1));
        this.randomInfixes$ = this.apiService.randomInfixes$.pipe(
          map(randomInfixes => randomInfixes.filter(infix => infix.guildId === guildId)),
          shareReplay(1)
        );
        cdRef.markForCheck();
      });
  }

  saveRandomInfixes() {
    this.randomInfixIsSaving$.next(true);
    this.randomInfixesComponent
      .saveChanges()
      .pipe(finalize(() => this.randomInfixIsSaving$.next(false)))
      .subscribe({
        error: err => {
          console.error(err);
          this.snackBar.open('Failed to save random buttons', 'Damn');
        },
      });
  }

  setUserRoleId(roleId: string, guildId: string) {
    this.userIsSaving$.next('saving');
    this.apiService.updateGuildSettings(guildId, { userRoleId: roleId }).subscribe(
      () => this.userIsSaving$.next('idle'),
      () => this.userIsSaving$.next('error')
    );
  }

  setModeratorRoleId(roleId: string, guildId: string) {
    this.moderatorIsSaving$.next('saving');
    this.apiService.updateGuildSettings(guildId, { moderatorRoleId: roleId }).subscribe(
      () => this.moderatorIsSaving$.next('idle'),
      () => this.moderatorIsSaving$.next('error')
    );
  }

  setMeanVolume(volume: string, guildId: string) {
    if (volume.length > 0 && +volume > -30 && +volume < 30) {
      this.meanVolumeIsSaving$.next('saving');
      this.apiService.updateGuildSettings(guildId, { targetMeanVolume: +volume }).subscribe(
        () => this.meanVolumeIsSaving$.next('idle'),
        () => this.meanVolumeIsSaving$.next('error')
      );
    }
  }

  setMaxVolume(volume: string, guildId: string) {
    if (volume.length > 0 && +volume > -30 && +volume < 30) {
      this.maxVolumeIsSaving$.next('saving');
      this.apiService.updateGuildSettings(guildId, { targetMaxVolume: +volume }).subscribe(
        () => this.maxVolumeIsSaving$.next('idle'),
        () => this.maxVolumeIsSaving$.next('error')
      );
    }
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }
}
