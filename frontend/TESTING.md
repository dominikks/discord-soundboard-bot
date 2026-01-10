# Testing Documentation

This document describes the testing infrastructure and best practices for the Discord Soundboard Bot frontend.

## Testing Stack

- **Unit Tests**: [Vitest](https://vitest.dev/) - Fast, modern unit testing framework
- **Component Tests**: [@testing-library/angular](https://testing-library.com/docs/angular-testing-library/intro/) - User-centric component testing
- **E2E Tests**: [Playwright](https://playwright.dev/) - Reliable end-to-end testing
- **API Mocking**: [MSW](https://mswjs.io/) - Mock Service Worker for API mocking in E2E tests

## Testing Philosophy

Our testing strategy follows these core principles:

### 1. Minimal, High-Value Tests
- Only test where there's actual complexity
- Skip unit tests for simple HTTP wrappers (tests would be longer than the implementation)
- Focus on business logic, calculations, and transformations

### 2. Protection for Dependabot
- Tests should catch breaking changes during dependency upgrades
- Focus on integration points and critical user workflows

### 3. Avoid Test Bloat
- Too many tests make changes difficult
- Keep test count low (aim for 10-20 total tests, not 50+)
- Delete tests that don't provide value

### 4. DOM-Based Component Testing
- Test components through DOM interactions (Testing Library)
- Don't test internal implementation details
- Focus on what users see and interact with

## Running Tests

### Unit Tests (Vitest)

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run E2E tests
npm run e2e

# Run E2E tests with UI mode
npm run e2e:ui

# Run E2E tests in debug mode
npm run e2e:debug
```

## Writing Tests

### Unit Tests

Create test files with `.spec.ts` extension next to the source file.

**What to test:**
- Complex filtering/transformation logic
- URL encoding, data manipulation
- Calculations and business rules

**What NOT to test:**
```typescript
// ❌ Don't test simple HTTP wrappers
class ApiService {
  getUser() { return this.http.get('/api/user'); }  // Too simple to test
}
```

**Example: Testing complex logic**
```typescript
import { describe, it, expect } from 'vitest';
import { Sound } from './sounds.service';

describe('Sound', () => {
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
});
```

### Component Tests

Test components through user interactions, not implementation details.

**DO:**
- Use accessible queries (getByRole, getByLabelText)
- Test user-visible behavior
- Test complete scenarios

**DON'T:**
- Test component properties (e.g., `component.sounds`)
- Test component methods (e.g., `component.filterSounds()`)
- Test internal state changes

### E2E Tests

E2E tests verify complete user workflows. API calls are mocked with MSW.

**Example:**
```typescript
import { test, expect } from '@playwright/test';

test('should display and filter sounds', async ({ page }) => {
  await page.goto('/soundboard');
  
  // Wait for sounds to load
  await expect(page.getByText('test-sound')).toBeVisible();
  
  // Search for a specific sound
  const searchInput = page.locator('input[type="text"]').first();
  await searchInput.fill('test-sound');
  
  // Verify filtering works
  await expect(page.getByText('test-sound')).toBeVisible();
});
```

## API Mocking with MSW

E2E tests use MSW to mock backend API calls. Handlers are defined in `e2e/mocks/handlers.ts`.

**Example handler:**
```typescript
http.get('/api/sounds', () => {
  return HttpResponse.json([
    {
      id: 'test-guild/test-sound',
      guildId: '253973667250307085',
      name: 'test-sound',
      category: 'default',
    },
  ]);
}),
```

## CI/CD Integration

Tests run automatically in GitHub Actions:

- **Unit tests**: Run on every push as part of the build workflow
- **E2E tests**: Run on every push in the test workflow

### Local CI Simulation

To simulate CI locally:

```bash
# Run all checks that CI runs
npm run lint
npm run test:run
npm run build
npm run e2e
```

## Test Coverage

**We don't target coverage percentages.** Coverage metrics can be misleading and encourage writing low-value tests.

Instead, we focus on:
- Testing complex logic that's likely to break
- Testing critical user workflows
- Catching breaking changes from dependency updates

## Best Practices

### DO
- Test user-visible behavior
- Test complete scenarios (not fragmented operations)
- Mock external dependencies (HTTP, Discord API)
- Use accessible queries (getByRole, getByLabelText)
- Keep tests focused and readable
- Delete tests that don't provide value

### DON'T
- Target coverage percentages
- Test implementation details (private methods, internal state)
- Create redundant tests
- Use brittle selectors (CSS classes, data-testid unless necessary)
- Test third-party library internals
- Make tests dependent on each other
- Write unit tests for simple HTTP services
- Write too many tests (makes changes harder)

## Maintenance

1. **Run tests frequently**: On every code change and PR
2. **Be selective with new tests**: New features don't automatically need tests - only if there's complex logic
3. **Review failing tests**: Failures indicate real problems or outdated assumptions
4. **Delete low-value tests**: If a test hasn't caught bugs and just creates maintenance burden, delete it
5. **Monitor test speed**: Slow tests reduce developer productivity
6. **Keep count low**: Resist pressure to increase coverage - quality over quantity

## Troubleshooting

### Vitest Issues

**Problem**: Tests fail with Angular compilation errors  
**Solution**: Ensure `tsconfig.spec.json` is properly configured and `@analogjs/vite-plugin-angular` is installed

**Problem**: Tests can't find modules  
**Solution**: Check that module paths in `vitest.config.ts` match your project structure

### Playwright Issues

**Problem**: E2E tests timeout  
**Solution**: Increase timeout in test or check if dev server is starting correctly

**Problem**: Browser not installed  
**Solution**: Run `npx playwright install chromium`

**Problem**: Tests fail in CI but pass locally  
**Solution**: Ensure playwright browsers are installed in CI with `npx playwright install --with-deps`

## Further Reading

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [Playwright Documentation](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/)
