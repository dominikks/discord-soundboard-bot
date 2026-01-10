import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mock user/guild data
  http.get('/api/user', () => {
    return HttpResponse.json({
      id: '123',
      username: 'testuser',
      discriminator: 1,
      avatarUrl: 'https://example.com/avatar.png',
      guilds: [
        {
          id: '253973667250307085',
          name: 'Test Guild',
          iconUrl: 'https://example.com/icon.png',
          role: 'admin',
        },
      ],
    });
  }),

  http.get('/api/info', () => {
    return HttpResponse.json({
      version: '1.0.0',
      buildId: 'test#abc123',
      buildTimestamp: 1234567890,
      discordClientId: 'test-client-id',
    });
  }),

  // Mock sounds API
  http.get('/api/sounds', () => {
    return HttpResponse.json([
      {
        id: 'test-guild/test-sound',
        guildId: '253973667250307085',
        name: 'test-sound',
        category: 'default',
        createdAt: 1234567890,
        volumeAdjustment: 0,
        soundFile: {
          maxVolume: 1.0,
          meanVolume: 0.5,
          length: 1000,
          uploadedAt: 1234567890,
        },
      },
      {
        id: 'test-guild/another-sound',
        guildId: '253973667250307085',
        name: 'another-sound',
        category: 'default',
        createdAt: 1234567890,
        volumeAdjustment: 0,
        soundFile: {
          maxVolume: 1.0,
          meanVolume: 0.5,
          length: 1000,
          uploadedAt: 1234567890,
        },
      },
    ]);
  }),

  http.post('/api/guilds/:guildId/play/:soundId', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/guilds/:guildId/stop', () => {
    return HttpResponse.text('success');
  }),

  http.delete('/api/sounds/:soundId', () => {
    return HttpResponse.text('success');
  }),

  http.post('/api/sounds', () => {
    return HttpResponse.json({
      id: 'test-guild/new-sound',
      guildId: '253973667250307085',
      name: 'new-sound',
      category: 'default',
      createdAt: Date.now(),
      volumeAdjustment: 0,
    });
  }),

  // Mock SSE events endpoint
  http.get('/api/events', () => {
    return new HttpResponse(null, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    });
  }),

  // Mock random infixes
  http.get('/api/random-infixes', () => {
    return HttpResponse.json([
      {
        guildId: '253973667250307085',
        infix: 'loud',
        displayName: 'Loud',
      },
    ]);
  }),

  // Mock guild settings
  http.get('/api/guilds/:guildId/settings', () => {
    return HttpResponse.json({
      autojoin: true,
      volume: 1.0,
    });
  }),

  // Mock recordings
  http.get('/api/recordings', () => {
    return HttpResponse.json([]);
  }),

  // Mock auth endpoints
  http.post('/api/auth/logout', () => {
    return HttpResponse.text('success');
  }),

  http.get('/api/auth/token', () => {
    return HttpResponse.json({
      token: 'test-token',
      createdAt: Date.now(),
    });
  }),

  http.post('/api/auth/token', () => {
    return HttpResponse.json({
      token: 'test-token',
      createdAt: Date.now(),
    });
  }),

  // Mock guild actions
  http.post('/api/guilds/:guildId/join', () => {
    return HttpResponse.text('success');
  }),

  http.post('/api/guilds/:guildId/leave', () => {
    return HttpResponse.text('success');
  }),
];
