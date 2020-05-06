const ScreenshotTester = require('puppeteer-screenshot-tester');

const timeout = 100000;
const test_slides = [
  [
    'localhost',
    'http://localhost:8080/nammd/test/slide.md',
  ],
  [
    'githubusercontent',
    'https://raw.githubusercontent.com/araij/nammd/master/docs/test/slide.md',
  ],
  [
    'raw',
    'https://github.com/araij/nammd/raw/master/docs/test/slide.md',
  ],
  [
    'blob',
    'https://github.com/araij/nammd/blob/master/docs/test/slide.md',
  ],
];
let tester;

async function test_screenshot(name, relativeurl) {
  await page.goto(URL + relativeurl, {waitUntil: 'networkidle0'});
  expect(await tester(page, name, {fullPage: true})).toBe(true);
}

beforeAll(async () => {
  await page.setViewport({width: 640, height: 480});
  tester = await ScreenshotTester(0.8, false, false, [], {
    transparency: 0.5
  });
});

describe(`Version 'master'`, () => {
  it('should not change its top page', async () => {
    await test_screenshot('master-top', '/nammd/master');
  }, timeout);

  it.each(test_slides)(
    'should correctly render the slide in %p',
    (_, url) => test_screenshot('master-test-slide', `/nammd/master/?url=${url}`),
    timeout);
});

describe('Version 1', () => {
  it('should not change its top page', async () => {
    await test_screenshot('v1-top', '/nammd/v1');
  }, timeout);

  it.each(test_slides)(
    'should correctly render the slide in %p',
    (_, url) => test_screenshot('v1-test-slide', `/nammd/v1/?url=${url}`),
    timeout);
});
