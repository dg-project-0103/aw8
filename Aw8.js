// script.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));

/* ---------- helpers (frames, bounding box, CDP click) ---------- */
async function findInFramesBySelector(page, selector, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const handle = await frame.$(selector);
        if (handle) return { frame, handle };
      } catch {}
    }
    await delay(150);
  }
  return null;
}

async function findInFramesByXPath(page, xpath, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const handles = await frame.$x(xpath);
        if (handles && handles.length > 0) return { frame, handle: handles[0] };
      } catch {}
    }
    await delay(150);
  }
  return null;
}

async function waitForBoundingBox(handle, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const box = await handle.boundingBox();
      if (box && box.width > 1 && box.height > 1) return box;
    } catch {}
    await delay(100);
  }
  return null;
}

async function cdpClick(client, x, y) {
  try {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1,
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1,
    });
    return true;
  } catch (e) {
    return false;
  }
}

/* ----------------- MAIN ----------------- */
(async () => {
  // read credentials from env
  const username = process.env.USERNAME || '';
  const password = process.env.PASSWORD || '';

  if (!username || !password) {
    console.error('ERROR: USERNAME and PASSWORD environment variables must be set.');
    console.error('Use login.bat to set them for this session, or set them in your shell.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--disable-infobars']
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  // keep pageForSpam later
  let pageForSpam = page;

  // ---------- Steps 1-8: login and open game (unchanged) ----------
  await page.goto('https://www.aw8casinos.com/en-my', { waitUntil: 'domcontentloaded', timeout: 0 });
  console.log('Opened Dream Gaming page');
  await delay(10000);

  try { await page.click('button._loginButton_oo0rk_15'); console.log('Clicked Login button'); } catch (e) { console.log('Login button not found'); }
  await delay(2000);

  try { await page.click('button._loginButton_oo0rk_15'); console.log('Clicked Login button'); } catch (e) { console.log('Login button not found'); }
  await delay(2000);

  try {
    await page.type('div:nth-of-type(1) > input', username);
    console.log('Entered username');
  } catch (e) {
    console.log('Username input not found');
  }
  await delay(2000);

  try {
    await page.type('div._passDropdownContainer_x3wte_29 input', password);
    console.log('Entered password');
  } catch (e) {
    console.log('Password input not found');
  }
  await delay(2000);

  await page.keyboard.press('Enter');
  console.log('Pressed Enter to login');
  try { await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) {}
  await delay(3000);

  await page.goto('https://www.aw8casinos.com/en-my/casino-landing', { waitUntil: 'domcontentloaded', timeout: 0 });
  console.log('Navigated to Dream Gaming after login');
  await delay(5000);

  {
    const targetPage = page;
    const timeout = 10000; // define timeout here
    await puppeteer.Locator.race([
      targetPage.locator('li:nth-of-type(8) img'),
      targetPage.locator('::-p-xpath(//*[@id="root"]/div[1]/div[6]/div/div[2]/ul/li[8]/div[1]/img)'),
      targetPage.locator(':scope >>> li:nth-of-type(8) img')
    ])
      .setTimeout(timeout)
      .click({
        offset: {
          x: 56.5413818359375,
          y: 152.42657470703125,
        },
      });
    console.log('Clicked game in slot 8');
    await delay(2000);
  }

  // ---------- Continue your logic after login here ----------
  console.log('Login flow complete — ready for next actions');

  // === After Step 8: wait 15s then import steps.json and replay ===
  console.log('Waiting 15 seconds before importing steps.json and replaying...');
  await delay(15000);

  // helper: find page containing selector
  async function findPageWithSelector(browser, selector, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const pages = await browser.pages();
      for (const p of pages) {
        try {
          const top = await p.$(selector);
          if (top) return p;
          for (const f of p.frames()) {
            try {
              const h = await f.$(selector);
              if (h) return p;
            } catch {}
          }
        } catch {}
      }
      await delay(250);
    }
    return null;
  }

  // find replay page (laya canvas)
  let replayPage = await findPageWithSelector(browser, '#layaCanvas', 15000);
  if (!replayPage) {
    console.log('No page had #layaCanvas - trying longer...');
    replayPage = await findPageWithSelector(browser, '#layaCanvas', 30000);
  }
  if (!replayPage) {
    console.log('No #layaCanvas found; will use original page as fallback.');
    replayPage = page;
  } else {
    console.log('Found page containing #layaCanvas at URL:', await replayPage.url());
    try { await replayPage.bringToFront(); } catch {}
  }
  pageForSpam = replayPage;

  // create CDP session for replay page
  let client = null;
  try {
    client = await replayPage.target().createCDPSession();
    console.log('CDP session created on replay page.');
  } catch (e) {
    console.log('Failed to create CDP session on replay page:', e.message);
    try { client = await page.target().createCDPSession(); replayPage = page; pageForSpam = page; console.log('CDP created on original page fallback.'); } catch (e2) { console.log('No CDP session available', e2.message || e2); }
  }

  const stepsUrl = 'https://raw.githubusercontent.com/dg-project-0103/click/main/steps.json';
  let stepsJson = null;

  try {
      const response = await fetch(stepsUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      stepsJson = await response.json();
      console.log('Loaded steps.json from GitHub:');
  } catch (e) {
      console.log('Failed to fetch steps.json:');
  }


  if (stepsJson && Array.isArray(stepsJson.steps) && client) {
    console.log('Loaded steps.json — starting replay of steps on the correct page...');
    for (const step of stepsJson.steps) {
      console.log('Replaying step type:', step.type);
      try {
        const t = (step.type || '').toLowerCase();
        if (t === 'setviewport') {
          await replayPage.setViewport({
            width: step.width || 1365,
            height: step.height || 953,
            deviceScaleFactor: step.deviceScaleFactor || 1,
            isMobile: !!step.isMobile,
            hasTouch: !!step.hasTouch,
            isLandscape: !!step.isLandscape
          });
        } else if (t === 'navigate') {
          if (step.url) await replayPage.goto(step.url, { waitUntil: 'domcontentloaded', timeout: step.timeout || 30000 });
        } else if (t === 'wait') {
          const ms = step.ms || step.duration || 1000;
          await delay(ms);
        } else if (t === 'type') {
          if (step.selector && typeof step.value === 'string') {
            await replayPage.waitForSelector(step.selector, { visible: true, timeout: step.timeout || 10000 }).catch(()=>{});
            await replayPage.type(step.selector, step.value, { delay: step.delay || 10 });
          }
        } else if (t === 'click' || t === 'doubleclick') {
          // keep original execute style for replay steps
          await (async function executeClickStepSimple(pageLocal, clientLocal, stepLocal) {
            const offsetX = typeof stepLocal.offsetX === 'number' ? stepLocal.offsetX : (stepLocal.offset || {}).x || 0;
            const offsetY = typeof stepLocal.offsetY === 'number' ? stepLocal.offsetY : (stepLocal.offset || {}).y || 0;
            const selectorList = [];
            if (Array.isArray(stepLocal.selectors)) {
              for (const arr of stepLocal.selectors) {
                if (Array.isArray(arr)) {
                  for (const s of arr) selectorList.push(s);
                } else {
                  selectorList.push(arr);
                }
              }
            }
            for (const rawSel of selectorList) {
              if (!rawSel || typeof rawSel !== 'string') continue;
              const sel = rawSel.trim();
              if (sel.toLowerCase().startsWith('xpath')) {
                const xpath = sel.replace(/^\s*xpath:?\/*/i, '').trim();
                if (!xpath) continue;
                const found = await findInFramesByXPath(pageLocal, xpath, 4000);
                if (found) {
                  const box = await waitForBoundingBox(found.handle, 8000);
                  if (box) {
                    const clickX = box.x + (offsetX || box.width/2);
                    const clickY = box.y + (offsetY || box.height/2);
                    const ok = await cdpClick(clientLocal, clickX, clickY);
                    if (ok) return true;
                    try { await pageLocal.mouse.click(clickX, clickY, { delay: 10 }); return true; } catch {}
                  }
                }
              } else if (sel.toLowerCase().startsWith('pierce/')) {
                const css = sel.slice('pierce/'.length);
                const found = await findInFramesBySelector(pageLocal, css, 4000);
                if (found) {
                  const box = await waitForBoundingBox(found.handle, 8000);
                  if (box) {
                    const clickX = box.x + (offsetX || box.width/2);
                    const clickY = box.y + (offsetY || box.height/2);
                    const ok = await cdpClick(clientLocal, clickX, clickY);
                    if (ok) return true;
                    try { await pageLocal.mouse.click(clickX, clickY, { delay: 10 }); return true; } catch {}
                  }
                }
              } else {
                try {
                  const topHandle = await pageLocal.$(sel);
                  if (topHandle) {
                    const box = await waitForBoundingBox(topHandle, 8000);
                    if (box) {
                      const clickX = box.x + (offsetX || box.width/2);
                      const clickY = box.y + (offsetY || box.height/2);
                      const ok = await cdpClick(clientLocal, clickX, clickY);
                      if (ok) return true;
                      try { await pageLocal.mouse.click(clickX, clickY, { delay: 10 }); return true; } catch {}
                    }
                  }
                } catch {}
                const found = await findInFramesBySelector(pageLocal, sel, 4000);
                if (found) {
                  const box = await waitForBoundingBox(found.handle, 8000);
                  if (box) {
                    const clickX = box.x + (offsetX || box.width/2);
                    const clickY = box.y + (offsetY || box.height/2);
                    const ok = await cdpClick(clientLocal, clickX, clickY);
                    if (ok) return true;
                    try { await pageLocal.mouse.click(clickX, clickY, { delay: 10 }); return true; } catch {}
                  }
                }
              }
            }
            // fallback coords
            if (typeof offsetX === 'number' && typeof offsetY === 'number') {
              const ok = await cdpClick(clientLocal, offsetX, offsetY);
              if (ok) return true;
              try { await pageLocal.mouse.click(offsetX, offsetY, { delay: 10 }); return true; } catch {}
            }
            return false;
          })(replayPage, client, step);
        }
      } catch (e) {
        console.log('Error executing step:', e.message || e);
      }
      await delay(step.postDelay || 250);
    }
    console.log('Replay finished.');
  } else {
    console.log('No steps.json or invalid format or no CDP client — attempting a fallback click at (548,225)');
    try {
      if (client) {
        const ok = await cdpClick(client, 548, 225);
        if (!ok) await replayPage.mouse.click(548, 225, { delay: 10 });
      } else {
        await replayPage.mouse.click(548, 225, { delay: 10 });
      }
      console.log('Fallback click done.');
    } catch (e) {
      console.log('Fallback click failed:', e.message || e);
    }
  }

  // === NEW: wait 2 seconds after replay finished ===
  await delay(2000);

  // -------------------------
  // Step 10: load Clicking.json, resolve coords (keep only step 0), test run (3s), set all to double, throttle to TARGET_CPS, then schedule bursts
  // -------------------------
  const targetTimes = [
    "10:04:59", "16:04:59", "18:04:59",
    "19:04:59", "21:04:59", "22:04:59", "23:04:59"
  ];

  const WORKERS = 4;              // number of concurrent worker loops (you requested 3)
  const BURST_MS = 3 * 1000;     // scheduled burst duration: 10s
  const TEST_MS = 3 * 1000;       // short test run: 3s

  // Desired overall CPS target (choose between ~100 and ~200). Default 150.
  const TARGET_CPS = 2000;

  // GitHub raw URL for Clicking.json
  const clickingFile = 'https://raw.githubusercontent.com/dg-project-0103/click/main/Clicking.json';
  let clickingJson = null;
  try {
      const response = await fetch(clickingFile);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      clickingJson = await response.json();
      console.log('Loaded Clicking.json from GitHub');
  } catch (e) {
      console.log('Failed to fetch Clicking.json:', e.message);
      clickingJson = null;
  }


  // helpers
  function normalizeXpathCandidate(sel) { return sel.replace(/^\s*xpath:?\/*/i, '').trim(); }

  const rawClickSteps = clickingJson && Array.isArray(clickingJson.steps) ? clickingJson.steps.filter(s => s.type === 'click' || s.type === 'doubleClick') : [];
  if (!rawClickSteps || rawClickSteps.length === 0) {
    console.warn('No click/doubleClick steps found in Clicking.json; will fallback to coordinate spam.');
  }

  // create CDP clients (one per worker if possible)
  const clients = [];
  for (let i = 0; i < WORKERS; i++) {
    try {
      const c = await replayPage.target().createCDPSession();
      clients.push(c);
    } catch (e) {
      console.warn('Could not create CDP session for worker', i, e.message || e);
    }
  }
  if (clients.length === 0 && client) clients.push(client);
  console.log(`Using ${clients.length} CDP client(s)`);

  // resolve step -> absolute coord
  async function resolveStepToCoord(step) {
    const offsetX = (typeof step.offsetX === 'number') ? step.offsetX : ((step.offset || {}).x || 0);
    const offsetY = (typeof step.offsetY === 'number') ? step.offsetY : ((step.offset || {}).y || 0);

    const selectorList = [];
    if (Array.isArray(step.selectors)) {
      for (const sarr of step.selectors) {
        if (Array.isArray(sarr)) for (const s of sarr) selectorList.push(s); else selectorList.push(sarr);
      }
    }

    for (const rawSel of selectorList) {
      if (!rawSel || typeof rawSel !== 'string') continue;
      const sel = rawSel.trim();
      if (sel.toLowerCase().startsWith('xpath')) {
        const xpath = normalizeXpathCandidate(sel);
        try {
          const found = await findInFramesByXPath(replayPage, xpath, 3000);
          if (found) {
            const box = await waitForBoundingBox(found.handle, 3000);
            if (box) return { x: box.x + (offsetX || box.width/2), y: box.y + (offsetY || box.height/2), double: (step.type === 'doubleClick') };
          }
        } catch {}
      } else if (sel.toLowerCase().startsWith('pierce/')) {
        const css = sel.slice('pierce/'.length);
        try {
          const found = await findInFramesBySelector(replayPage, css, 3000);
          if (found) {
            const box = await waitForBoundingBox(found.handle, 3000);
            if (box) return { x: box.x + (offsetX || box.width/2), y: box.y + (offsetY || box.height/2), double: (step.type === 'doubleClick') };
          }
        } catch {}
      } else {
        try {
          const top = await replayPage.$(sel);
          if (top) {
            const box = await waitForBoundingBox(top, 3000);
            if (box) return { x: box.x + (offsetX || box.width/2), y: box.y + (offsetY || box.height/2), double: (step.type === 'doubleClick') };
          }
          const found = await findInFramesBySelector(replayPage, sel, 3000);
          if (found) {
            const box = await waitForBoundingBox(found.handle, 3000);
            if (box) return { x: box.x + (offsetX || box.width/2), y: box.y + (offsetY || box.height/2), double: (step.type === 'doubleClick') };
          }
        } catch {}
      }
    }

    // fallback: use offsets or viewport center
    try {
      const vp = replayPage.viewport() || { width: 1365, height: 953 };
      return { x: offsetX || Math.floor(vp.width/2), y: offsetY || Math.floor(vp.height/2), double: (step.type === 'doubleClick') };
    } catch {
      return { x: offsetX || 739, y: offsetY || 465, double: (step.type === 'doubleClick') };
    }
  }

  // Resolve all coords
  const resolvedCoordsAll = [];
  for (let i = 0; i < rawClickSteps.length; i++) {
    try {
      const r = await resolveStepToCoord(rawClickSteps[i]);
      resolvedCoordsAll.push(r);
      console.log('Resolved click step', i, '->', r);
    } catch (e) {
      console.warn('Failed to resolve click step', i, e.message || e);
    }
  }

  // Keep only steps 0,1,2,3,4
  let resolvedCoords = [];
  if (resolvedCoordsAll.length > 0) {
    resolvedCoords = resolvedCoordsAll.slice(0, 5); // steps 0,1,2,3,4
    resolvedCoords.forEach(r => r.double = true); // force double-click
    console.log('Keeping only steps 0,1,2:', resolvedCoords);
  } else {
    resolvedCoords = [{ x: 739, y: 465, double: true }];
    console.warn('No resolved coords; using fallback', resolvedCoords[0]);
  }

  // Force all to double-click as requested
  for (const r of resolvedCoords) r.double = true;

  // Calculate throttling delay to achieve TARGET_CPS
  // clicksPerIteration = 2 when double-click
  const clicksPerIteration = resolvedCoords[0].double ? 2 : 1;
  const workersCount = WORKERS; // number of async worker loops
  const perWorkerClicksPerSecond = TARGET_CPS / workersCount;
  const iterationsPerSecondPerWorker = perWorkerClicksPerSecond / clicksPerIteration;
  // Avoid zero or negative; compute loopDelayMs
  let loopDelayMs;
  if (iterationsPerSecondPerWorker <= 0) loopDelayMs = 50;
  else loopDelayMs = Math.max(5, Math.round(1000 / iterationsPerSecondPerWorker));
  console.log(`Throttling: TARGET_CPS=${TARGET_CPS}, workers=${workersCount}, clicks/iter=${clicksPerIteration}, loopDelayMs=${loopDelayMs} ms`);

  // utility: run a burst for durationMs using clients and coords, applying loopDelayMs between iterations
  async function runBurstWithClients(durationMs, clientsArr, coordsArr, loopDelay) {
    const start = Date.now();
    const end = start + durationMs;
    const counts = new Array(clientsArr.length).fill(0);

    async function workerLoop(workerIndex) {
      const clientLocal = clientsArr[workerIndex % clientsArr.length];
      let idx = workerIndex; // offset start index to spread load
      while (Date.now() < end) {
        const step = coordsArr[idx % coordsArr.length];
        if (!step) { idx++; continue; }
        try {
          if (step.double) {
            await cdpClick(clientLocal, step.x, step.y);
            await cdpClick(clientLocal, step.x, step.y);
            counts[workerIndex % clientsArr.length] += 2;
          } else {
            await cdpClick(clientLocal, step.x, step.y);
            counts[workerIndex % clientsArr.length] += 1;
          }
        } catch {}
        idx++;
        // throttle to target rate
        if (loopDelay > 0) await delay(loopDelay);
      }
    }

    const workers = [];
    for (let w = 0; w < WORKERS; w++) workers.push(workerLoop(w));
    await Promise.all(workers);

    const total = counts.reduce((a, b) => a + b, 0);
    const elapsed = (Date.now() - start) / 1000;
    const cps = (total / elapsed).toFixed(1);
    return { totalClicks: total, elapsed, cps, perClient: counts };
  }

  // --- TEST RUN (3s) ---
  console.log(`Running short TEST burst for ${TEST_MS/1000}s (throttled to ~${TARGET_CPS} CPS) ...`);
  try {
    const testResult = await runBurstWithClients(TEST_MS, clients, resolvedCoords, loopDelayMs);
    console.log(`TEST run finished — totalClicks=${testResult.totalClicks}, elapsed=${testResult.elapsed.toFixed(2)}s, CPS≈${testResult.cps}`);
    testResult.perClient.forEach((c, i) => console.log(`  client ${i}: ${c} clicks`));
  } catch (e) {
    console.error('TEST run error:', e.message || e);
  }

  console.log('All resolved clicks are already set to double-click. Scheduled bursts will use the same throttled rate.');

  // scheduled bursts using same throttled loopDelayMs
  async function runClickSpam() {
    console.log('⚡ Starting scheduled CDP burst for 10s (double-click mode) ...');
    const res = await runBurstWithClients(BURST_MS, clients, resolvedCoords, loopDelayMs);
    console.log(`✅ Burst complete — totalClicks=${res.totalClicks}, elapsed=${res.elapsed.toFixed(2)}s, approx CPS=${res.cps}`);
    res.perClient.forEach((c, i) => console.log(`  client ${i}: ${c} clicks`));
  }

  // scheduler loop (exact-second matching)
  const checkTimeAndRun = async () => {
    console.log('Scheduler armed. Target times:', targetTimes.join(', '));
    while (true) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const timeStr = `${hh}:${mm}:${ss}`;
      if (targetTimes.includes(timeStr)) {
        console.log(`🎯 Target time matched: ${timeStr}`);
        try {
          await runClickSpam();
        } catch (e) {
          console.error('runClickSpam error:', e.message || e);
        }
        // avoid duplicate trigger
        await delay(61000);
      } else {
        process.stdout.write(`\r⏰ Current: ${timeStr}`);
        await delay(300);
      }
    }
  };

  await checkTimeAndRun();

  // end main
})();
