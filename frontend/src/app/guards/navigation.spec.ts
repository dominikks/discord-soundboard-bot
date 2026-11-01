import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { userResolver } from '../resolvers/user.resolver';
import { ApiService, User } from '../services/api.service';
import { guildPermissionGuard } from './guild-permission.guard';
import { notLoggedInGuard } from './not-logged-in.guard';

@Component({ selector: 'app-test-page', template: 'Test page' })
class TestPageComponent {}

describe('Authenticated navigation boundaries', () => {
  let user: User;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    user = {
      id: '1',
      username: 'tester',
      discriminator: 0,
      avatarUrl: '',
      guilds: [{ id: '100', name: 'Guild', role: 'user' }],
    };
    api = jasmine.createSpyObj<ApiService>('ApiService', ['loadUser']);
    api.loadUser.and.callFake(() => of(user));
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        provideRouter([
          { path: 'login', component: TestPageComponent },
          { path: 'login-check', canActivate: [notLoggedInGuard], component: TestPageComponent },
          {
            path: '',
            resolve: { user: userResolver },
            children: [
              { path: '', component: TestPageComponent },
              { path: 'settings', component: TestPageComponent },
              { path: 'settings/guilds/:guildId', canActivate: [guildPermissionGuard], component: TestPageComponent },
            ],
          },
        ]),
      ],
    });
  });

  it('redirects expired sessions to login through the real resolver', async () => {
    api.loadUser.and.returnValue(throwError(() => new Error('401')));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/settings');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('denies ordinary members and unknown guilds, permits moderator and administrator routes', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/settings/guilds/100');
    expect(TestBed.inject(Router).url).toBe('/settings');
    for (const role of ['moderator', 'admin'] as const) {
      user.guilds[0].role = role;
      await harness.navigateByUrl('/settings/guilds/100');
      expect(TestBed.inject(Router).url).toBe('/settings/guilds/100');
      await harness.navigateByUrl('/settings');
    }
    await harness.navigateByUrl('/settings/guilds/999');
    expect(TestBed.inject(Router).url).toBe('/settings');
  });

  it('prevents logged-in users returning to login and allows unauthenticated login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login-check');
    expect(TestBed.inject(Router).url).toBe('/');
    api.loadUser.and.returnValue(throwError(() => new Error('401')));
    await harness.navigateByUrl('/login-check');
    expect(TestBed.inject(Router).url).toBe('/login-check');
  });
});
