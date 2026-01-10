import { describe, it, expect } from 'vitest';
import { Sound } from './sounds.service';

describe('Sound', () => {
  describe('encodeId', () => {
    it('should encode sound IDs with special characters', () => {
      const sound = new Sound({
        id: 'guild-id/sound name with spaces',
        guildId: 'guild-id',
        name: 'sound name with spaces',
        category: 'default',
        createdAt: 123456,
      });

      const encoded = sound.encodeId();

      expect(encoded).toBe('guild-id/sound%20name%20with%20spaces');
    });

    it('should handle IDs with multiple slashes', () => {
      const sound = new Sound({
        id: 'guild/category/sound',
        guildId: 'guild',
        name: 'sound',
        category: 'category',
        createdAt: 123456,
      });

      const encoded = sound.encodeId();

      expect(encoded).toBe('guild/category/sound');
    });

    it('should encode special characters in each segment', () => {
      const sound = new Sound({
        id: 'guild-id/sound#1',
        guildId: 'guild-id',
        name: 'sound#1',
        category: 'default',
        createdAt: 123456,
      });

      const encoded = sound.encodeId();

      expect(encoded).toBe('guild-id/sound%231');
    });
  });

  describe('getDownloadUrl', () => {
    it('should generate correct download URL with encoded ID', () => {
      const sound = new Sound({
        id: 'guild-id/test sound',
        guildId: 'guild-id',
        name: 'test sound',
        category: 'default',
        createdAt: 123456,
      });

      const url = sound.getDownloadUrl();

      expect(url).toBe('/api/sounds/guild-id/test%20sound');
    });
  });

  describe('getPlayUrl', () => {
    it('should generate play URL with guild ID string', () => {
      const sound = new Sound({
        id: 'guild-id/test-sound',
        guildId: 'guild-id',
        name: 'test-sound',
        category: 'default',
        createdAt: 123456,
      });

      const url = sound.getPlayUrl('target-guild-id');

      expect(url).toBe('/api/guilds/target-guild-id/play/guild-id/test-sound');
    });

    it('should generate play URL with guild object', () => {
      const sound = new Sound({
        id: 'guild-id/test-sound',
        guildId: 'guild-id',
        name: 'test-sound',
        category: 'default',
        createdAt: 123456,
      });

      const guild = { id: 'target-guild', name: 'Target Guild', role: 'admin' as const };
      const url = sound.getPlayUrl(guild);

      expect(url).toBe('/api/guilds/target-guild/play/guild-id/test-sound');
    });
  });
});
