import { ChangeDetectionStrategy, ChangeDetectorRef, Component, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { pull } from 'lodash-es';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { catchError, forkJoin, of, Subject, tap, throwError } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { AppSettingsService } from '../services/app-settings.service';
import { ApiService, AuthToken } from '../services/api.service';
import { Sound, SoundsService } from '../services/sounds.service';
import { KeyCombination } from './keycombination-input/key-combination-input.component';

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
export class KeybindGeneratorComponent {
  readonly displayedColumns = ['dragDrop', 'keyCombination', 'discordServer', 'command', 'actions'];

  readonly user = this.apiService.user();

  readonly data$ = forkJoin([
    this.soundsService.loadSounds(),
    this.apiService
      .getAuthToken()
      .pipe(catchError(error => (error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => error)))),
  ]);
  readonly dataLoaded$ = new Subject<[Array<Sound>, AuthToken | null]>();

  readonly sounds = signal<Sound[]>(null);
  readonly authToken = signal<AuthToken | null>(null);
  keybinds: Keybind[];

  constructor(
    private apiService: ApiService,
    private soundsService: SoundsService,
    private settingsService: AppSettingsService,
    private snackBar: MatSnackBar,
    private cdRef: ChangeDetectorRef
  ) {
    const saved = localStorage.getItem(STORAGE_KEY);
    let initialKeybinds = [];
    if (saved) {
      try {
        initialKeybinds = JSON.parse(saved);
      } catch {}
    }
    this.keybinds = initialKeybinds;

    this.dataLoaded$.pipe(takeUntilDestroyed()).subscribe(([sounds, authToken]) => {
      this.cleanupKeybinds(this.keybinds, sounds);
      this.sounds.set(sounds);
      this.authToken.set(authToken);
    });
  }

  private cleanupKeybinds(keybinds: Keybind[], sounds: Sound[]) {
    // The keybind objects might have different instances of the sound objects with the same content.
    // We ensure the same instances are used.
    for (const keybind of keybinds) {
      const sound = sounds.find(s => keybind.command && typeof keybind.command === 'object' && s.id === keybind.command.id);
      if (sound != null) {
        keybind.command = sound;
      } else if (typeof keybind.command !== 'string') {
        keybind.command = null;
      }
    }
  }

  saveKeybinds() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keybinds));
  }

  addKeybind() {
    this.keybinds.push({
      keyCombination: { key: '', isControl: false, isAlt: false },
      command: null,
      guildId: this.settingsService.settings.guildId(),
    });
    this.keybinds = this.keybinds.slice();
  }

  deleteKeybind(keybind: Keybind) {
    pull(this.keybinds, keybind);
    this.keybinds = this.keybinds.slice();
  }

  downloadKeybinds() {
    this.downloadText(JSON.stringify(this.keybinds), 'keybinds.json');
  }

  regenerateToken() {
    this.apiService.generateAuthToken().subscribe({
      next: newToken => this.authToken.set(newToken),
      error: error => {
        console.error(error);
        this.snackBar.open('Failed to generate new auth token.', 'Damn');
      },
    });
  }

  generateAutohotkey() {
    const authToken = this.authToken();

    const observable = authToken
      ? of(authToken)
      : this.apiService.generateAuthToken().pipe(tap(authToken => this.authToken.set(authToken)));

    observable.subscribe({
      next: authToken => {
        const script = this.generateAutohotkeyScript(authToken.token, this.keybinds);
        this.downloadText(script, 'soundboard.ahk');
      },
      error: error => {
        console.error(error);
        this.snackBar.open('Failed to fetch the auth token.', 'Damn', { duration: undefined });
      },
    });
  }

  onDrop(event: CdkDragDrop<Keybind[]>) {
    moveItemInArray(this.keybinds, event.previousIndex, event.currentIndex);
    this.keybinds = this.keybinds.slice();
  }

  onImportFileChange(event: Event) {
    const fileReader = new FileReader();
    fileReader.readAsText((event.target as HTMLInputElement).files[0], 'UTF-8');
    fileReader.onload = () => {
      const keybinds = JSON.parse(fileReader.result as string);
      this.cleanupKeybinds(keybinds, this.sounds());
      this.keybinds = keybinds;
      this.snackBar.open('Import successful!', undefined, { duration: 1000 });
      this.cdRef.markForCheck();
    };
    fileReader.onerror = error => {
      console.error(error);
      this.snackBar.open('Import failed.', 'Damn', { duration: undefined });
    };
  }

  private generateAutohotkeyScript(authToken: string, keybinds: Keybind[]) {
    let script = 'PlaySound(server, id) {\n';
    script += `command := "curl -X POST -H ""Authorization: Bearer ${authToken}"" `;
    // eslint-disable-next-line max-len
    script += `""${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/guilds/" . server . "/play/" . id . """"\n`;
    script += 'shell := ComObjCreate("WScript.Shell")\n';
    script += 'launch := "cmd.exe /c " . command\n';
    script += 'exec := shell.Run(launch, 0, true)\n';
    script += '}\n';

    script += 'ExecCommand(server, cmd) {\n';
    script += `command := "curl -X POST -H ""Authorization: Bearer ${authToken}"" `;
    // eslint-disable-next-line max-len
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

    return script;
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
