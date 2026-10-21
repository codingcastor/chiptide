// Renders a Chiptide file to WAV: pnpm render examples/intro.js out.wav [seconds]
import { readFileSync, writeFileSync } from 'node:fs';
import { encodeWav, renderCode } from '../src';

const [input, output = input.replace(/\.\w+$/, '') + '.wav', seconds] = process.argv
  .slice(2)
  .filter((a) => a !== '--');
if (!input) {
  console.error('Usage: pnpm render <file.js> [out.wav] [seconds]');
  process.exit(1);
}
const started = performance.now();
const result = await renderCode(readFileSync(input, 'utf8'), {
  seconds: seconds ? Number(seconds) : undefined,
  onWarning: (w) => console.warn(`warning: ${w}`),
});
writeFileSync(output, encodeWav(result.samples, result.sampleRate));
const duration = result.samples.length / result.sampleRate;
console.log(
  `${output}: ${duration.toFixed(1)} s rendered in ${((performance.now() - started) / 1000).toFixed(2)} s`,
);
