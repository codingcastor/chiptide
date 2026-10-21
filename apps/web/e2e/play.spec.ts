import { expect, test } from '@playwright/test';

test('plays the default example through the AudioWorklet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#code')).not.toBeEmpty();
  await page.click('#play');
  await expect(page.locator('#status')).toContainText('Lecture');

  // The channel meters show notes once the worklet renders frames.
  await expect(page.locator('#channels .note').first()).not.toHaveText('—', { timeout: 5000 });

  // Measure the actual output signal through an analyser.
  const { rms, late } = await page.evaluate(async () => {
    const player = (window as any).chiptide;
    const analyser = player.audioContext.createAnalyser();
    analyser.fftSize = 8192;
    player.output.connect(analyser);
    await new Promise((r) => setTimeout(r, 1500));
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return { rms: Math.sqrt(data.reduce((a, x) => a + x * x, 0) / data.length), late: player.lateFrames };
  });
  expect(rms).toBeGreaterThan(0.01);
  expect(late).toBe(0);
  await page.screenshot({ path: test.info().outputPath('playing.png'), fullPage: true });

  await page.keyboard.press('Control+.');
  await expect(page.locator('#status')).toContainText('Arrêté');
  expect(errors).toEqual([]);
});

test('reports evaluation errors without crashing', async ({ page }) => {
  await page.goto('/');
  await page.fill('#code', 'note("c4").env("15 12")');
  await page.click('#play');
  await expect(page.locator('#status .error')).toContainText('single-quoted');
});
