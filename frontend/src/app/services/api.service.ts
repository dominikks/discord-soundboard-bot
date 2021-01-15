import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, retry, shareReplay } from 'rxjs/operators';

export interface AppInfo {
  version: string;
  build_id?: string;
  build_timestamp?: number;
  title: string;
  file_management_url?: string;
}

export interface Guild {
  id: string;
  name?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private _appInfo: AppInfo;
  get appInfo() {
    return this._appInfo;
  }

  private _guilds$ = this.http.get('/api/discord', { responseType: 'text' }).pipe(
    retry(5),
    map(response => {
      response = response.replace(/("id"\s*:\s*)(\d+)/g, '$1"$2"');
      return JSON.parse(response) as Guild[];
    }),
    shareReplay()
  );
  private _randomInfixes$ = this.http.get<string[]>('/api/randominfixes').pipe(retry(5), shareReplay());

  get guilds$() {
    return this._guilds$;
  }
  get randomInfixes$() {
    return this._randomInfixes$;
  }

  constructor(private http: HttpClient) {}

  loadAppInfo() {
    return new Promise<AppInfo>((resolve, reject) => {
      this.http
        .get<AppInfo>('/api/info')
        .pipe(retry(5))
        .subscribe(
          info => {
            info.title = info.title ?? '';
            this._appInfo = info;
            resolve(info);
          },
          error => reject(error)
        );
    });
  }
}
