/**
 * Scripted reference-matrix capture harness (roadmap F12b).
 *
 * Drives headless Chrome over CDP against the running local dev server and
 * captures the matrix defined in ./matrix.mjs into stored JPEG artifacts.
 *
 * Usage:
 *   npm run capture:reference-matrix                # wide band (default)
 *   node scripts/reference-matrix/capture.mjs --band wide,compact
 *   node scripts/reference-matrix/capture.mjs --state browse-compact
 *
 * Requirements:
 *   - `npm run dev` serving http://localhost:3000 against the seeded dev DB;
 *   - REFERENCE_EMAIL / REFERENCE_PASSWORD in .env or the environment
 *     (dev-only credentials for the seeded capture account, never committed).
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import CDP from 'chrome-remote-interface';
import { BANDS, STATES } from './matrix.mjs';

const DEFAULT_URL = 'http://localhost:3000';
const DEFAULT_OUT = 'docs/review/responsive-layout-matrix';
const CHROME_BIN =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NETWORK_QUIET_MS = 600;
const SETTLE_CAP_MS = 15_000;
const RENDER_EXTRA_MS = 1_200;

function parseArgs(argv) {
  const args = { bands: ['wide'], states: null, url: DEFAULT_URL, out: DEFAULT_OUT };
  for (let i = 2; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[i + 1];
    if (flag === '--band') args.bands = value.split(',');
    else if (flag === '--state') args.states = value.split(',');
    else if (flag === '--url') args.url = value;
    else if (flag === '--out') args.out = value;
    else continue;
    if (inline === undefined) i += 1;
  }
  return args;
}

async function readEnvCredentials() {
  let envFile = '';
  try {
    envFile = await readFile(resolve('.env'), 'utf8');
  } catch {
    // .env is optional when the variables are exported directly.
  }
  const fromFile = (key) => envFile.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, 'm'))?.[1];
  const email = process.env.REFERENCE_EMAIL ?? fromFile('REFERENCE_EMAIL');
  const password = process.env.REFERENCE_PASSWORD ?? fromFile('REFERENCE_PASSWORD');
  if (!email || !password) {
    throw new Error(
      'Missing REFERENCE_EMAIL / REFERENCE_PASSWORD (set them in .env or the environment).',
    );
  }
  return { email, password };
}

async function signIn(baseUrl, { email, password }) {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed (${response.status}): ${await response.text()}`);
  }
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(';');
    const eq = pair.indexOf('=');
    return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
  });
}

async function launchChrome(userDataDir) {
  const chrome = spawn(
    CHROME_BIN,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--enable-unsafe-swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  chrome.stderr.resume();
  const portFile = join(userDataDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).split('\n');
      if (port) return { chrome, port: Number(port) };
    } catch {
      // Port file not written yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  chrome.kill();
  throw new Error('Chrome did not expose a DevTools port within 10s.');
}

/** Track in-flight requests once per CDP client; drivers share the set. */
function trackInflightRequests(Network) {
  const inflight = new Set();
  Network.requestWillBeSent(({ requestId }) => inflight.add(requestId));
  Network.loadingFinished(({ requestId }) => inflight.delete(requestId));
  Network.loadingFailed(({ requestId }) => inflight.delete(requestId));
  return inflight;
}

/** Minimal CDP page driver exposing the verbs the matrix states use. */
function createDriver({ client, inflight, baseUrl, outputPath }) {
  const { Page, Runtime, Network } = client;

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await Runtime.evaluate({
      expression,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(`Page evaluation failed: ${exceptionDetails.text}`);
    }
    return result.value;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    async goto(path) {
      inflight.clear();
      await Page.navigate({ url: `${baseUrl}${path}` });
      await Page.loadEventFired();
    },

    /** Navigate under throttling and return once the app shell has mounted. */
    async gotoThrottled(path) {
      await Network.emulateNetworkConditions({
        offline: false,
        latency: 300,
        downloadThroughput: (1.5 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
      inflight.clear();
      await Page.navigate({ url: `${baseUrl}${path}` });
      const deadline = Date.now() + SETTLE_CAP_MS;
      while (Date.now() < deadline) {
        if (await evaluate('document.querySelector("#root > *") !== null')) break;
        await sleep(100);
      }
      await sleep(300);
    },

    async clearThrottling() {
      await Network.emulateNetworkConditions({
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    },

    /** Wait until the network has been quiet for a beat, then let WebGL/fonts paint. */
    async settle() {
      const deadline = Date.now() + SETTLE_CAP_MS;
      let quietSince = inflight.size === 0 ? Date.now() : null;
      while (Date.now() < deadline) {
        if (inflight.size === 0) {
          quietSince ??= Date.now();
          if (Date.now() - quietSince >= NETWORK_QUIET_MS) break;
        } else {
          quietSince = null;
        }
        await sleep(100);
      }
      await sleep(RENDER_EXTRA_MS);
    },

    async clickByLabel(label, { optional = false } = {}) {
      const clicked = await evaluate(
        `(() => { const el = document.querySelector('[aria-label=${JSON.stringify(label)}]');
          if (!el) return false; el.click(); return true; })()`,
      );
      if (!clicked && !optional) {
        throw new Error(`No element with aria-label ${JSON.stringify(label)}.`);
      }
      return clicked;
    },

    async clickByText(text) {
      const clicked = await evaluate(
        `(() => {
          const el = [...document.querySelectorAll('button, [role="button"], a, label')]
            .find((c) => c.textContent.trim() === ${JSON.stringify(text)});
          if (!el) return false; el.click(); return true; })()`,
      );
      if (!clicked) throw new Error(`No clickable element with text ${JSON.stringify(text)}.`);
    },

    async waitForText(text) {
      const deadline = Date.now() + SETTLE_CAP_MS;
      while (Date.now() < deadline) {
        if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return;
        await sleep(100);
      }
      throw new Error(`Timed out waiting for text ${JSON.stringify(text)}.`);
    },

    async capture() {
      const { data } = await Page.captureScreenshot({ format: 'jpeg', quality: 85 });
      await writeFile(outputPath(), Buffer.from(data, 'base64'));
    },
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const credentials = await readEnvCredentials();

  try {
    await fetch(args.url, { method: 'HEAD' });
  } catch {
    throw new Error(`Dev server is not reachable at ${args.url} (start it with: npm run dev).`);
  }
  const cookies = await signIn(args.url, credentials);

  const bands = BANDS.filter((band) => args.bands.includes(band.name));
  if (bands.length === 0) {
    throw new Error(`Unknown band(s): ${args.bands.join(', ')}`);
  }
  const states = args.states
    ? STATES.filter((state) => args.states.includes(state.name))
    : STATES;
  if (args.states && states.length !== args.states.length) {
    throw new Error(`Unknown state(s): ${args.states.join(', ')}`);
  }

  const userDataDir = mkdtempSync(join(tmpdir(), 'wave-atlas-reference-'));
  const { chrome, port } = await launchChrome(userDataDir);
  let client;
  const failures = [];
  try {
    client = await CDP({ port });
    await Promise.all([client.Page.enable(), client.Network.enable(), client.Runtime.enable()]);
    const inflight = trackInflightRequests(client.Network);
    for (const cookie of cookies) {
      await client.Network.setCookie({ ...cookie, url: args.url });
    }

    for (const band of bands) {
      for (const viewport of band.viewports) {
        const viewportDir = resolve(args.out, band.name, `${viewport.width}x${viewport.height}`);
        await mkdir(viewportDir, { recursive: true });
        await client.Emulation.setDeviceMetricsOverride({
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: band.mobile,
        });
        if (band.mobile) {
          await client.Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 5 });
        }
        for (const state of states) {
          const target = join(viewportDir, `${state.name}.jpg`);
          const driver = createDriver({ client, inflight, baseUrl: args.url, outputPath: () => target });
          try {
            await state.run(driver);
            console.log(`✓ ${band.name} ${viewport.width}x${viewport.height} ${state.name}`);
          } catch (error) {
            failures.push({ band: band.name, viewport, state: state.name, error });
            console.error(
              `✗ ${band.name} ${viewport.width}x${viewport.height} ${state.name}: ${error.message}`,
            );
          }
        }
      }
    }
  } finally {
    if (client) await client.close().catch(() => {});
    chrome.kill();
    if (chrome.exitCode === null) {
      await new Promise((resolve) => chrome.once('exit', resolve));
    }
    await rm(userDataDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} capture(s) failed.`);
  }
  console.log('Reference matrix capture complete.');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
