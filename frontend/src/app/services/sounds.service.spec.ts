import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth-interceptor';
import { Sound, SoundsService } from './sounds.service';

describe('Sound API integration', () => {
  let http: HttpTestingController;
  let service: SoundsService;
  const sound = new Sound({ id: '42', guildId: '100', name: 'Bell', category: '', createdAt: 1 });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(SoundsService);
  });
  afterEach(() => http.verify());

  it('converts and sorts sound responses without losing Discord snowflake precision', () => {
    service.loadSounds().subscribe(sounds => {
      expect(sounds.map(item => item.name)).toEqual(['alpha', 'Zulu']);
      expect(sounds[0] instanceof Sound).toBeTrue();
      expect(sounds[0].guildId).toBe('9007199254740993');
    });
    http.expectOne('/api/sounds').flush([
      { ...sound, name: 'Zulu' },
      { ...sound, name: 'alpha', guildId: '9007199254740993' },
    ]);
  });

  it('plays on the selected guild with explicit autojoin, and stops using POST', () => {
    service.playSound(sound, '200', false).subscribe();
    const play = http.expectOne('/api/guilds/200/play/42?autojoin=false');
    expect(play.request.method).toBe('POST');
    expect(play.request.body).toEqual({});
    play.flush(null);
    service.stopSound('200').subscribe();
    const stop = http.expectOne('/api/guilds/200/stop');
    expect(stop.request.method).toBe('POST');
    stop.flush('Stopped playback');
  });

  it('sends sound metadata, explicit volume reset and original audio bytes', () => {
    service.createSound('100', 'New', 'effects').subscribe(result => expect(result instanceof Sound).toBeTrue());
    const create = http.expectOne('/api/sounds');
    expect(create.request.body).toEqual({ guildId: '100', name: 'New', category: 'effects' });
    create.flush(sound);
    service.updateSound(new Sound({ ...sound, volumeAdjustment: null as unknown as number })).subscribe();
    const update = http.expectOne('/api/sounds/42');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.volumeAdjustment).toBeNull();
    update.flush('');
    const file = new File(['audio bytes'], 'bell.mp3', { type: 'audio/mpeg' });
    service.uploadSound(sound, file).subscribe();
    const upload = http.expectOne('/api/sounds/42');
    expect(upload.request.body).toBe(file);
    expect(upload.request.headers.get('Content-Type')).toBe('audio/mpeg');
    upload.flush({ length: 1, maxVolume: 0, meanVolume: -13, uploadedAt: 1 });
  });

  it('redirects expired authentication but propagates forbidden playback without redirecting', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    spyOn(console, 'error');
    for (const status of [401, 403]) {
      service.playSound(sound, '100', true).subscribe({ error: error => expect(error.status).toBe(status) });
      http.expectOne('/api/guilds/100/play/42?autojoin=true').flush('Denied', { status, statusText: 'Denied' });
    }
    expect(navigate).toHaveBeenCalledOnceWith(['login']);
  });
});
