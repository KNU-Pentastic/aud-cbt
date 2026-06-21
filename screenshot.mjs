import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = 'c:/Contest/aud-cbt/screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

// --- Web (provider) ---
const webPage = await browser.newPage();
await webPage.setViewportSize({ width: 1440, height: 900 });

await webPage.goto('http://localhost:3002/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
await webPage.waitForTimeout(1500);
await webPage.screenshot({ path: `${outDir}/web_login.png`, fullPage: true });
console.log('✓ web_login');

await webPage.fill('#email', 'provider@example.com');
await webPage.fill('#password', 'Demo!Pass1234');
await webPage.click('button[type="submit"]');
await webPage.waitForFunction(() => !document.querySelector('button[type="submit"]')?.textContent?.includes('로그인 중'), { timeout: 15000 }).catch(() => {});
await webPage.waitForTimeout(2000);

for (const { url, name } of [
  { url: 'http://localhost:3002/patients', name: 'web_patients' },
  { url: 'http://localhost:3002/patients/new', name: 'web_patients_new' },
]) {
  await webPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await webPage.waitForTimeout(2000);
  await webPage.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`✓ ${name}`);
}

// --- App (patient) ---
const appPage = await browser.newPage();
await appPage.setViewportSize({ width: 390, height: 844 });

// 1. 등록 화면
await appPage.goto('http://localhost:8081/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
await appPage.waitForTimeout(2000);
await appPage.screenshot({ path: `${outDir}/app_register.png`, fullPage: false });
console.log('✓ app_register');

// 2. 로그인 탭 클릭
await appPage.click('text=이미 등록했어요');
await appPage.waitForTimeout(1500);
await appPage.screenshot({ path: `${outDir}/app_login.png`, fullPage: false });
console.log('✓ app_login');

// 3. 실제 키입력으로 폼 채우기 (React Native web은 fill()이 state 업데이트 안 됨)
const inputs = appPage.locator('input');
await inputs.nth(0).click();
await appPage.keyboard.type('BWWAHM68', { delay: 50 });
await appPage.waitForTimeout(300);
await inputs.nth(1).click();
await appPage.keyboard.type('482917', { delay: 50 });
await appPage.waitForTimeout(500);
await appPage.screenshot({ path: `${outDir}/app_login_filled.png`, fullPage: false });
console.log('✓ app_login_filled');

// 4. 버튼 클릭 (활성화된 버튼 찾기)
await appPage.locator('text=로그인').click({ timeout: 5000 });
await appPage.waitForTimeout(6000);
console.log('After login URL:', appPage.url());

// 5. 내부 화면 스크린샷
const screens = [
  { url: 'http://localhost:8081/', name: 'app_home' },
  { url: 'http://localhost:8081/checkin', name: 'app_checkin' },
  { url: 'http://localhost:8081/progress', name: 'app_progress' },
  { url: 'http://localhost:8081/safety', name: 'app_safety' },
  { url: 'http://localhost:8081/settings', name: 'app_settings' },
  { url: 'http://localhost:8081/addiction-centers', name: 'app_addiction_centers' },
];

for (const { url, name } of screens) {
  await appPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await appPage.waitForTimeout(3000);
  // 에러 오버레이 있으면 닫기
  await appPage.locator('text=Dismiss').click({ timeout: 1500 }).catch(() => {});
  await appPage.waitForTimeout(500);
  await appPage.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  console.log(`✓ ${name}`);
}

await browser.close();
