import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SoundboardButtonComponent } from './soundboard-button.component';

describe('Soundboard button interaction', () => {
  it('separates remote playback, local preview and local stop through rendered buttons', async () => {
    await TestBed.configureTestingModule({
      imports: [SoundboardButtonComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SoundboardButtonComponent);
    fixture.componentRef.setInput('guildId', '100');
    fixture.componentRef.setInput('category', 'effects');
    const remote = spyOn(fixture.componentInstance.playRemote, 'emit');
    const local = spyOn(fixture.componentInstance.playLocal, 'emit');
    const stop = spyOn(fixture.componentInstance.stopLocal, 'emit');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.main-button').click();
    expect(remote).toHaveBeenCalledTimes(1);
    expect(local).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.preview-button').click();
    expect(local).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('isLocallyPlaying', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-icon').textContent).toBe('stop');
    fixture.nativeElement.querySelector('.preview-button').click();
    expect(stop).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('canPlayLocally', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.preview-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sound-source').textContent).toContain('effects');
  });
});
