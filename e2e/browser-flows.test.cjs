const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:58080';
const password = 'Browser-e2e-password-2026!';
const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `browser-e2e-${unique}@example.com`;
const workspaceName = `Browser E2E ${unique}`;
const documentTitle = `E2E document ${unique}`;
const updatedTitle = `Updated ${documentTitle}`;

test('register, sign in, create/edit/search document, and sign out', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 5000 });
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    assert.equal(ready, true, `Web app did not start at ${baseURL}`);

    await page.getByRole('button', { name: 'ثبت‌نام کنید' }).click();
    await page.getByLabel('ایمیل').fill(email);
    await page.getByLabel('گذرواژه').fill(password);
    await page.getByRole('button', { name: 'ساخت حساب', exact: true }).click();

    const registrationStatus = page.getByRole('status').filter({ hasText: 'حساب ساخته شد' });
    const registrationError = page.getByRole('alert');
    await Promise.race([
      registrationStatus.waitFor({ timeout: 15000 }),
      registrationError.waitFor({ timeout: 15000 }).then(async () => {
        throw new Error(`Registration failed: ${await registrationError.innerText()}`);
      }),
    ]);

    await page.getByLabel('ایمیل').fill(email);
    await page.getByLabel('گذرواژه').fill(password);
    await page.getByRole('button', { name: 'ورود به حساب' }).click();
    await page.getByText(email, { exact: true }).waitFor();

    await page.getByLabel('نام فضای کاری جدید').fill(workspaceName);
    await page.getByRole('button', { name: '+ ساخت فضای کاری' }).click();
    await page.getByRole('heading', { name: workspaceName, exact: true }).waitFor();

    await page.getByLabel('عنوان سند').fill(documentTitle);
    await page.getByLabel('محتوای Markdown').fill('Browser test document body');
    await page.getByRole('button', { name: 'ایجاد سند' }).click();
    await page.getByRole('heading', { name: documentTitle, exact: true }).waitFor();

    await page.getByRole('button', { name: 'ویرایش', exact: true }).click();
    await page.getByLabel('عنوان سند').fill(updatedTitle);
    await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
    await page.getByRole('heading', { name: updatedTitle, exact: true }).waitFor();

    await page.getByLabel('جست‌وجوی اسناد').fill(updatedTitle);
    await page.getByRole('button', { name: 'جست‌وجو' }).click();
    await page.getByRole('heading', { name: updatedTitle, exact: true }).waitFor();

    await page.getByRole('button', { name: 'خروج' }).click();
    await page.getByRole('heading', { name: 'خوش برگشتید' }).waitFor();
    assert.equal(await page.getByText(email, { exact: true }).count(), 0);
  } finally {
    await browser.close();
  }
});
