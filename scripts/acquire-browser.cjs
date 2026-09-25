/* Real React/browser regression tests; wallet and network boundaries are mocked.
 * No funded wallet, keys, live RPC or testnet writes. The actual AcquireFlow and
 * TokenPicker are bundled using the esbuild installed with the Vitest toolchain.
 */
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const nextRoot = path.resolve(__dirname, "../packages/nextjs");
const { build } = require(require.resolve("esbuild", { paths: [nextRoot] }));

const wallet = `
import { useSyncExternalStore } from 'react';
let state = { account: {address:'0x0000000000000000000000000000000000000123', isConnected:true, chainId:296}, receipts:{} };
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const read = () => state;
window.walletTest = {
  writes: [],
  account(next) { state = {...state, account:{...state.account,...next}}; notify(); },
  receipt(status) {
    const hash = '0x' + this.writes.length.toString(16).padStart(64,'0');
    state = {...state, receipts:{...state.receipts, [hash]:{status,gasUsed:1n}}}; notify();
  }
};
export function useAccount() { return useSyncExternalStore(subscribe,read).account; }
export function useWriteContract() { return {isPending:false, writeContractAsync:async tx => {
  window.walletTest.writes.push(tx);
  return '0x'+window.walletTest.writes.length.toString(16).padStart(64,'0');
}}; }
export function useWaitForTransactionReceipt({hash}) {
  const receipt = useSyncExternalStore(subscribe,read).receipts[hash];
  return {data:receipt,isPending:!!hash&&!receipt,isLoading:!!hash&&!receipt,isSuccess:!!receipt,isError:false};
}
`;

async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {AcquireFlow} from './app/acquire/_components/AcquireFlow';
      const tokens = [['0.0.1183558','SAUCE'],['0.0.5365','CLXY']].map(([tokenId,symbol]) => ({
        tokenId,symbol,name:symbol,decimals:6,priceUsd:1,isFeeOnTransfer:false,dueDiligenceComplete:true,inTopPools:true
      })); createRoot(document.getElementById('root')).render(<AcquireFlow tokens={tokens}/>);`,
      resolveDir: nextRoot,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    alias: { "~~": nextRoot },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "wallet-boundary",
        setup(b) {
          b.onResolve({ filter: /^wagmi$/ }, () => ({
            path: "wagmi",
            namespace: "wallet-test",
          }));
          b.onLoad({ filter: /.*/, namespace: "wallet-test" }, () => ({
            contents: wallet,
            loader: "js",
            resolveDir: nextRoot,
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/app.js" ? "application/javascript" : "text/html",
    );
    res.end(
      req.url === "/app.js"
        ? bundle.outputFiles[0].text
        : '<div id="root"></div><script src="/app.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHANNEL
        ? { channel: process.env.PLAYWRIGHT_CHANNEL }
        : {}),
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    let holdQuote = false,
      holdProfile = false,
      associated = true;
    const waitingQuotes = [],
      waitingProfiles = [];
    await page.route("**/api/onboarding/quote?*", async (route) => {
      if (holdQuote)
        await new Promise((resolve) => waitingQuotes.push(resolve));
      const hbar = new URL(route.request().url()).searchParams.get("hbar");
      await route.fulfill({
        json: {
          amountOut: "100",
          amountOutMin: String(Number(hbar) * 99),
          amountOutFormatted: "100",
          rate: 100,
          indicative: null,
          comparison: null,
        },
      });
    });
    await page.route("**/api/onboarding/profile?*", async (route) => {
      const wasAssociated = associated;
      if (holdProfile)
        await new Promise((resolve) => waitingProfiles.push(resolve));
      await route.fulfill({
        json: {
          profile: {},
          association: {
            associated: wasAssociated,
            reason: "Confirmed relationship",
          },
          selection: {
            strategy: "explicit",
            reason: "Associate before the router",
          },
          hbar: null,
        },
      });
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    const swap = page.getByRole("button", { name: /Step 2|Swap again/ });
    await swap.waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.includes("Step 2") && !b.disabled,
      ),
    );

    holdQuote = true;
    await page.getByLabel("HBAR to spend").fill("10");
    assert.equal(
      await swap.isDisabled(),
      true,
      "stale amount must disable submission immediately",
    );
    await page.waitForTimeout(450);
    holdQuote = false;
    waitingQuotes.splice(0).forEach((resolve) => resolve());
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.includes("Step 2") && !b.disabled,
      ),
    );
    await swap.click();
    assert.equal(
      await swap.isDisabled(),
      true,
      "wallet hash alone must not enable another submission",
    );
    assert.equal(
      await page.evaluate(() => walletTest.writes[0].args[0].toString()),
      "990",
    );
    assert.equal(
      await page.evaluate(() => walletTest.writes[0].value.toString()),
      "10000000000000000000",
    );
    await page.evaluate(() => walletTest.receipt("reverted"));
    await page.getByText("The swap did not succeed.").waitFor();
    assert.equal(
      await page.getByText(/Swap complete/).count(),
      0,
      "a mined revert is not a success",
    );

    holdProfile = true;
    associated = false;
    await page.locator("#token").click();
    await page.getByRole("option", { name: /CLXY/ }).click();
    assert.equal(
      await swap.isDisabled(),
      true,
      "old token relationship must never authorize the new token",
    );
    await page.waitForTimeout(450);
    assert.equal(
      await swap.isDisabled(),
      true,
      "a new quote cannot substitute for association",
    );
    holdProfile = false;
    waitingProfiles.splice(0).forEach((resolve) => resolve());
    await page.getByRole("button", { name: "Associate CLXY" }).waitFor();

    holdProfile = true;
    associated = true;
    await page.evaluate(() =>
      walletTest.account({
        address: "0x0000000000000000000000000000000000000456",
      }),
    );
    assert.equal(
      await swap.isDisabled(),
      true,
      "wallet switches invalidate association",
    );
    // Let this request begin, then disconnect before its successful answer.
    await page.waitForTimeout(100);
    await page.evaluate(() =>
      walletTest.account({ isConnected: false, address: undefined }),
    );
    holdProfile = false;
    waitingProfiles.splice(0).forEach((resolve) => resolve());
    await page.waitForTimeout(100);
    assert.equal(
      await swap.isDisabled(),
      true,
      "late profile responses must not undo a disconnect",
    );
    await page.evaluate(() =>
      walletTest.account({
        isConnected: true,
        address: "0x0000000000000000000000000000000000000123",
        chainId: 295,
      }),
    );
    await page.getByText(/Switch your wallet to Hedera Testnet/).waitFor();
    assert.equal(
      await swap.isDisabled(),
      true,
      "mainnet writes are forbidden by the UI",
    );
    assert.equal(await page.evaluate(() => walletTest.writes.length), 1);
    assert.deepEqual(pageErrors, []);
    console.log(
      "Acquire browser regressions passed: stale amount/token/wallet, disconnect race, pending write, revert, wrong chain.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
