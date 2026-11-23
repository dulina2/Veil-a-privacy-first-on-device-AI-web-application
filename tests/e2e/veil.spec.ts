import path from 'path';
import { expect, test } from '@playwright/test';

async function completeOnboarding(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByText('On-device AI that never phones home')).toBeVisible();
  await page.getByRole('button', { name: 'Choose Local Model' }).click();

  await expect(page.getByText('Select your on-device model tier')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Create your encryption passphrase')).toBeVisible();
  await page.getByLabel('Passphrase (minimum 8 characters)').fill('veil-e2e-passphrase-2026');
  await page.getByLabel('Confirm Passphrase').fill('veil-e2e-passphrase-2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create Encrypted Vault' }).click();

  await expect(page.getByText('Airplane Mode Verification')).toBeVisible();
  await page.getByRole('button', { name: 'Verify Local Vault Offline' }).click();
  await expect(page.getByText(/AES-GCM vault active/)).toBeVisible();
  await page.getByRole('button', { name: 'Enter Veil Workspace' }).click();
}

test.describe('Veil Privacy-First E2E Flows', () => {
  test('onboarding, journal entry persistence across lock/unlock, and scanner fixture flow', async ({
    page,
  }) => {
    await completeOnboarding(page);

    // 1. Journal flow
    await expect(page.getByLabel('Journal entry title')).toBeVisible();
    await page.getByLabel('Journal entry title').fill('Quiet Evening Reflection');
    await page
      .getByLabel('Journal entry content')
      .fill('I feel calm and grateful after finishing my work for the week.');

    await page.getByRole('button', { name: 'Save & Analyze Mood' }).click();
    await expect(page.getByText('Encrypted & saved')).toBeVisible();

    // Override mood manually
    await page.getByLabel('Mood:').selectOption('gratitude');

    // Lock vault and unlock again to verify encrypted IndexedDB persistence
    await page.getByRole('button', { name: 'Lock Vault' }).click();
    await expect(page.getByText('Veil Vault Locked')).toBeVisible();
    await page.getByLabel('Vault Passphrase').fill('veil-e2e-passphrase-2026');
    await page.getByRole('button', { name: 'Unlock Vault' }).click();
    await expect(page.getByText('Quiet Evening Reflection')).toBeVisible();

    // 2. Smart Document Scanner flow using fixture image
    await page.getByRole('link', { name: 'Scanner' }).click();
    await expect(
      page.getByText(
        'OCR and AI can make mistakes. Verify important details. This is not legal advice.',
      ),
    ).toBeVisible();

    const fixturePath = path.resolve(process.cwd(), 'tests/e2e/fixtures/sample-invoice.png');
    await page.getByTestId('scanner-file-input').setInputFiles(fixturePath);

    await expect(page.getByAltText('Perspective corrected document preview')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to OCR' }).click();

    // Verify editable OCR + downstream Summarize & Key Dates steps
    const sampleInvoiceText =
      'NORTHWOOD STUDIO LLC\nClient: Elena Vance\nTotal Amount Due: $2,450.00 USD\nPayment Due Date: December 15, 2026\nNotice Deadline: Written notice by February 28, 2027.';
    await page.getByLabel('Extracted Text (editable)').fill(sampleInvoiceText);
    await page.getByRole('button', { name: 'Continue to Translate' }).click();
    await page.getByRole('button', { name: 'Skip Translation' }).click();

    await page.getByRole('button', { name: 'Quick Deterministic Extract' }).click();
    await expect(page.getByText('$2,450.00', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Key Dates' }).click();

    await page.getByRole('button', { name: 'Extract Key Dates' }).click();
    await expect(page.locator('input[value="2026-12-15"]')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm All' }).click();
    await page.getByRole('button', { name: 'Save Document to Vault' }).click();
    await expect(page.getByText(/Document, OCR text, summary, and dates encrypted/)).toBeVisible();
  });

  test('works completely offline after initial load with network disabled', async ({
    page,
    context,
  }) => {
    await completeOnboarding(page);

    // Wait briefly for Service Worker registration & precache
    await page.waitForTimeout(1000);

    // Disable all network traffic
    await context.setOffline(true);

    // Navigate to Privacy screen and verify 0 user-data requests + offline detection
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByText('0 network requests with your data')).toBeVisible();
    await page.getByRole('button', { name: 'Check Connectivity Status' }).click();
    await expect(page.getByText(/Offline Mode confirmed/)).toBeVisible();

    // Create and save an encrypted journal entry while network is disabled
    await page.getByRole('link', { name: 'Journal' }).click();
    await page.getByRole('button', { name: 'New Entry' }).click();
    await page.getByLabel('Journal entry title').fill('Offline Airplane Entry');
    await page
      .getByLabel('Journal entry content')
      .fill('Written completely offline in Airplane Mode.');
    await page.getByRole('button', { name: 'Save & Analyze Mood' }).click();
    await expect(page.getByText('Encrypted & saved')).toBeVisible();

    await context.setOffline(false);
  });
});
