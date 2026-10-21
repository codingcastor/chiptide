import { readFileSync } from 'node:fs';
import { format } from 'prettier';
import { describe, expect, it } from 'vitest';
import { FUNCTIONS, MACRO_CONTROLS, controls, referenceMarkdown, renderCode } from '../src';

describe('function catalogue', () => {
  it('documents every NES control', () => {
    const documented = new Set(FUNCTIONS.map((d) => d.name));
    for (const name of [
      ...Object.keys(controls),
      ...Object.keys(MACRO_CONTROLS),
      'instrument',
      'setcps',
      'setcpm',
    ]) {
      expect(documented, `missing docs for ${name}`).toContain(name);
    }
  });

  it('has unique names', () => {
    const names = FUNCTIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(FUNCTIONS.map((d) => [d.name, d.example]))(
    'example of %s plays without warnings',
    async (_, code) => {
      const result = await renderCode(code, { cycles: 1, sampleRate: 8000 });
      expect(result.warnings).toEqual([]);
    },
  );

  it('matches docs/reference.md (run pnpm docs to update)', async () => {
    const file = readFileSync(new URL('../../../docs/reference.md', import.meta.url), 'utf8');
    const expected = await format(referenceMarkdown(), {
      parser: 'markdown',
      singleQuote: true,
      printWidth: 110,
    });
    expect(file).toBe(expected);
  });
});
