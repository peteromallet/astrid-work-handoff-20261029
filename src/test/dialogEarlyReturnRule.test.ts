import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { dialogEarlyReturnMessage } from '../../eslint-rules/dialogEarlyReturnRule.js';

const repoRoot = process.cwd();
const fixturesDir = path.join(repoRoot, 'eslint-rules', '__fixtures__');
const invalidFixture = path.join(fixturesDir, 'dialog-early-return.invalid.tsx');
const validFixture = path.join(fixturesDir, 'dialog-early-return.valid.tsx');

function lintFixture(file: string) {
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(repoRoot, 'eslint.config.js'),
    ignore: false,
  });
  return eslint.lintFiles([file]).then(([result]) => result);
}

describe('dialog early-return lint rule', () => {
  it('flags the invalid fixture exactly once', async () => {
    const result = await lintFixture(invalidFixture);
    const matches = result.messages.filter((message) => message.message === dialogEarlyReturnMessage);
    expect(matches).toHaveLength(1);
  });

  it('accepts the valid fixture', async () => {
    const result = await lintFixture(validFixture);
    expect(result.messages).toEqual([]);
  });
});
