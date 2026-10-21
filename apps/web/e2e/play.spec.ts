import { expect, test, type Page } from '@playwright/test';

const setCode = (page: Page, code: string) =>
  page.evaluate((c) => {
    (window as any).chiptideEditor.code = c;
  }, code);

test('plays the default example through the AudioWorklet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('setcps');
  await page.click('#play');
  await expect(page.locator('#status')).toContainText('Lecture');

  // Channel notes and highlighted code follow the music.
  await expect(page.locator('#scopes .note').first()).not.toHaveText('—', { timeout: 5000 });
  await expect(page.locator('.cm-playing').first()).toBeVisible();

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
  await page.screenshot({ path: test.info().outputPath('channels.png') });

  await page.click('[data-tab=registers]');
  await expect(page.locator('.register-description').first()).toContainText('période');
  await expect(page.locator('.register-bytes span.written').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('registers.png') });

  await page.keyboard.press('Control+.');
  await expect(page.locator('#status')).toContainText('Arrêté');
  expect(errors).toEqual([]);
});

test('marks evaluation errors in the code', async ({ page }) => {
  await page.goto('/');
  await setCode(page, 'note("c4 e4")\n  .dutty(25)');
  await page.click('#play');
  await expect(page.locator('#status .error')).toContainText('Ligne 2');
  await expect(page.locator('#status .error')).toContainText('Vouliez-vous dire « duty »');
  await expect(page.locator('.cm-error')).toHaveText('dutty');
});

test('shows warnings from the driver', async ({ page }) => {
  await page.goto('/');
  await setCode(page, 's("hhh*4")');
  await page.click('#play');
  await expect(page.locator('#status .warn')).toContainText('Vouliez-vous dire « hh »');
});

test('completes NES functions and sound names', async ({ page }) => {
  await page.goto('/');
  await setCode(page, '');
  await page.click('.cm-content');
  await page.keyboard.type('note("c4").du');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('duty');
  await page.keyboard.press('Escape');
  await page.keyboard.type('ty(25).s("h');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('hh');
});

test('the help panel plays examples without touching the code', async ({ page }) => {
  await page.goto('/');
  await setCode(page, 'note("c4")');
  await page.click('[data-tab=help]');
  await page.fill('#help input[type=search]', 'chordarp');
  const item = page.locator('.help-item:not([hidden])').first();
  await expect(item).toContainText('.chordarp("up")');
  await item.getByRole('button', { name: '▶ Écouter' }).click();
  await expect(page.locator('#status')).toContainText('Exemple de chordarp');
  await expect(page.locator('.cm-content')).toHaveText('note("c4")');
  await page.screenshot({ path: test.info().outputPath('help.png') });
});
