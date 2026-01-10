import { test as base } from '@playwright/test';

// You can extend the base test with custom fixtures here if needed
// For example, authenticated user state, pre-configured test data, etc.

export const test = base;
export { expect } from '@playwright/test';
