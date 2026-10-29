import { expect, test } from '@playwright/test';
test.describe.configure({ mode: 'serial' });
test('first fails', async () => { expect(1).toBe(2); });
test('second is not run', async () => {});
test('third is not run', async () => {});
