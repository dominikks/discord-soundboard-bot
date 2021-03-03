import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Sound, SoundsService } from '../services/sounds.service';
import { KeyCombination } from './keycombination-input/keycombination-input.component';
import { pull } from 'lodash-es';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SettingsService } from '../services/settings.service';
import { ApiService } from '../services/api.service';
import { combineLatest, EMPTY, Subject } from 'rxjs';
import { catchError, mergeMap, shareReplay, takeUntil, withLatestFrom } from 'rxjs/operators';
import { LoginService } from '../services/login.service';

export type KeyCommand = Sound | 'stop' | 'record';

interface Keybind {
  keyCombination: KeyCombination;
  command: KeyCommand | null;
  guildId: string;
}

const STORAGE_KEY = 'keybinds';

@Component({
  templateUrl: './keybind-generator.component.html',
  styleUrls: ['./keybind-generator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeybindGeneratorComponent implements OnInit, OnDestroy {
  displayedColumns = ['dragDrop', 'keyCombination', 'discordServer', 'command', 'actions'];

  user$ = this.apiService.user$;
  sounds$ = this.soundsService.sounds$;
  private _keybinds$ = new Subject<Keybind[]>();
  keybinds$ = this._keybinds$.asObservable().pipe(shareReplay());

  private onDestroy$ = new Subject<void>();
  loadKeybinds$ = new Subject<Keybind[]>();
  saveKeybinds$ = new Subject<void>();
  addKeybind$ = new Subject<void>();
  deleteKeybind$ = new Subject<Keybind>();
  moveKeybind$ = new Subject<{ from: number; to: number }>();
  downloadKeybinds$ = new Subject<void>();
  generateAutohotkey$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private soundsService: SoundsService,
    private loginService: LoginService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    combineLatest([this.loadKeybinds$, this.sounds$])
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(([keybinds, sounds]) => {
        // The keybind objects might have different instances of the sound objects with the same content.
        // We ensure the same instances are used.
        keybinds = keybinds.slice();
        for (const keybind of keybinds) {
          const sound = sounds.find(s => typeof keybind.command === 'object' && s.id === keybind.command.id);
          if (sound != null) {
            keybind.command = sound;
          }
        }
        this._keybinds$.next(keybinds);
      });

    this.saveKeybinds$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.keybinds$)).subscribe(([, keybinds]) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds));
    });

    this.addKeybind$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.keybinds$)).subscribe(([, keybinds]) => {
      // Recreate the array
      this._keybinds$.next([
        ...keybinds,
        {
          keyCombination: { key: '', isControl: false, isAlt: false },
          command: null,
          guildId: this.settingsService.settings.guildId$.value,
        },
      ]);
    });

    this.deleteKeybind$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.keybinds$)).subscribe(([toDelete, keybinds]) => {
      keybinds = keybinds.slice();
      pull(keybinds, toDelete);
      this._keybinds$.next(keybinds);
    });

    this.moveKeybind$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.keybinds$)).subscribe(([move, keybinds]) => {
      keybinds = keybinds.slice();
      moveItemInArray(keybinds, move.from, move.to);
      this._keybinds$.next(keybinds);
    });

    this.downloadKeybinds$.pipe(takeUntil(this.onDestroy$), withLatestFrom(this.keybinds$)).subscribe(([, keybinds]) => {
      this.downloadText(JSON.stringify(keybinds), 'keybinds.json');
    });

    this.generateAutohotkey$
      .pipe(
        takeUntil(this.onDestroy$),
        mergeMap(() =>
          this.loginService.getAuthToken().pipe(
            catchError(error => {
              console.error(error);
              this.snackBar.open('Failed to fetch auth token', 'Damn');
              return EMPTY;
            })
          )
        ),
        withLatestFrom(this.keybinds$)
      )
      .subscribe(([authtoken, keybinds]) => {
        this.generateAutohotkey(authtoken, keybinds);
      });

    // Save every time the keybinds change
    this.keybinds$.pipe(takeUntil(this.onDestroy$)).subscribe(_ => this.saveKeybinds$.next());

    const saved = localStorage.getItem(STORAGE_KEY);
    let initialKeybinds = [];
    if (saved) {
      try {
        initialKeybinds = JSON.parse(saved);
      } catch {}
    }
    this.loadKeybinds$.next(initialKeybinds);
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  onDrop(event: CdkDragDrop<Keybind[]>) {
    this.moveKeybind$.next({ from: event.previousIndex, to: event.currentIndex });
  }

  onImportFileChange(event: Event) {
    const fileReader = new FileReader();
    fileReader.readAsText((event.target as HTMLInputElement).files[0], 'UTF-8');
    fileReader.onload = () => {
      this.loadKeybinds$.next(JSON.parse(fileReader.result as string));
      this.snackBar.open('Import successful', undefined, { duration: 1000 });
    };
    fileReader.onerror = error => {
      console.error(error);
      this.snackBar.open('Import failed');
    };
  }

  private generateAutohotkey(authtoken: string, keybinds: Keybind[]) {
    let script = 'PlaySound(server, id) {\n';
    script += `command := "curl -X POST -H ""Authorization: Bearer ${authtoken}"" `;
    script += `""${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/guilds/" . server . "/play/" . id . """"\n`;
    script += 'shell := ComObjCreate("WScript.Shell")\n';
    script += 'launch := "cmd.exe /c " . command\n';
    script += 'exec := shell.Run(launch, 0, true)\n';
    script += '}\n';

    script += 'ExecCommand(server, cmd) {\n';
    script += `command := "curl -X POST -H ""Authorization: Bearer ${authtoken}"" `;
    script += `""${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/guilds/" . server . "/" . cmd . """"\n`;
    script += 'shell := ComObjCreate("WScript.Shell")\n';
    script += 'launch := "cmd.exe /c " . command\n';
    script += 'exec := shell.Run(launch, 0, true)\n';
    script += '}\n';

    for (const bind of keybinds.filter(keybind => keybind.command != null && keybind.keyCombination.key !== '')) {
      script +=
        '\n' + (bind.keyCombination.isControl ? '^' : '') + (bind.keyCombination.isAlt ? '!' : '') + bind.keyCombination.key + '::\n';
      if (bind.command === 'record') {
        script += 'ExecCommand(' + bind.guildId + ', "record")\n';
      } else if (bind.command === 'stop') {
        script += 'ExecCommand(' + bind.guildId + ', "stop")\n';
      } else {
        script += 'PlaySound(' + bind.guildId + ', "' + bind.command.encodeId() + '")\n';
      }
      script += 'return\n';
    }

    this.downloadText(script, 'soundboard.ahk');
  }

  private downloadText(text: string, filename: string) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/json;charset=UTF-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}
