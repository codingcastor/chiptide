// Regenerates docs/reference.md from the function catalogue: pnpm docs
import { writeFileSync } from 'node:fs';
import { referenceMarkdown } from '../src/docs';

const path = new URL('../../../docs/reference.md', import.meta.url);
writeFileSync(path, referenceMarkdown());
console.log(`Wrote ${path.pathname}`);
