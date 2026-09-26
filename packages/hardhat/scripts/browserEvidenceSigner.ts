/** Test harness only. A verified encrypted recovery file is required before funding. */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { JsonRpcProvider, parseEther } from "ethers";
import { recoverableEvidenceSigner, saveEvidenceFunding } from "./evidenceKeystore";

export async function browserEvidenceSigner() {
  const { wallet, state } = await recoverableEvidenceSigner();
  const capability = randomBytes(32).toString("hex");
  const provider = new JsonRpcProvider("https://testnet.hashio.io/api", 296);
  const amount = parseEther("40");
  if (state.fundingHash) {
    try {
      if (!process.argv.includes("--refund") && !process.argv.includes("--resume"))
        throw new Error(
          "This signer already has a funded run. Use --browser --refund to recover remaining HBAR; do not fund it again.",
        );
      const tx = await provider.getTransaction(state.fundingHash);
      const receipt = await provider.getTransactionReceipt(state.fundingHash);
      if (
        !tx ||
        tx.chainId !== 296n ||
        tx.to?.toLowerCase() !== wallet.address.toLowerCase() ||
        tx.value !== amount ||
        receipt?.status !== 1
      )
        throw new Error("Saved funding could not be verified; no refund sent.");
      return { wallet, refundAddress: tx.from };
    } finally {
      provider.destroy();
    }
  }
  if (process.argv.includes("--refund") || process.argv.includes("--resume")) {
    provider.destroy();
    throw new Error(
      "No verified funding hash saved. Recheck the original funding receipt first; refund mode never requests funding.",
    );
  }
  const origin = "http://127.0.0.1:3939";
  let pending = false;
  let resolveFunding: (from: string) => void;
  let rejectFunding: (error: Error) => void;
  const funded = new Promise<string>((resolve, reject) => {
    resolveFunding = resolve;
    rejectFunding = reject;
  });
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Preflight testnet evidence</title>
<style>body{font:17px system-ui;max-width:720px;margin:60px auto;padding:24px;background:#101817;color:#e4f0ed}h1{font-size:32px}code{word-break:break-all}button{font:inherit;padding:12px 20px;margin:8px 0;background:#9eebc7;border:0;border-radius:8px;cursor:pointer}pre{white-space:pre-wrap}.box{border:1px solid #547266;padding:20px;border-radius:12px}small{color:#b6c6bf}</style>
</head><body><h1>Fresh Preflight evidence</h1><p>This local runner will test the native SDK and EVM transaction builders on <strong>Hedera testnet, chain 296</strong>.</p>
<div class="box"><p><strong>Fund once: 40 test HBAR, plus the wallet's network fee.</strong></p><p>Testnet destination:<br><code>${wallet.address}</code></p><p>The runner creates isolated token/account fixtures, checks all four native mechanisms and airdrop lifecycle, then makes small SaucerSwap purchases. It attempts to return unused HBAR to the verified funding sender.</p><p>An encrypted recovery keystore was saved and verified before this page opened. Keep that file and its password until recovery completes. No browser-wallet key is requested.</p></div>
<p>Open this page in the Chrome profile containing your funded OKX testnet wallet. Review the destination and amount in the wallet before approving.</p>
<button id="fund">Connect OKX and review 40 test HBAR funding</button><pre id="status">Waiting for your wallet.</pre><small>Funding authorizes this isolated test run. This is a developer evidence helper, not a production wallet or a mainnet flow.</small>
<script nonce="${capability}">
const button=document.getElementById('fund'),status=document.getElementById('status');
let pendingHash=sessionStorage.getItem('preflight-funding-${wallet.address}');
button.onclick=async()=>{button.disabled=true;try{
if(!pendingHash){
const injected=window.okxwallet||window.ethereum;if(!injected)throw Error('No EVM wallet found in this Chrome profile. Open this URL in your OKX profile.');
await injected.request({method:'eth_requestAccounts'});
if(await injected.request({method:'eth_chainId'})!=='0x128')await injected.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x128'}]});
if(await injected.request({method:'eth_chainId'})!=='0x128')throw Error('Only Hedera testnet (296) is allowed.');
const [account]=await injected.request({method:'eth_accounts'});
status.textContent='Review the testnet funding request in your wallet.';
pendingHash=await injected.request({method:'eth_sendTransaction',params:[{from:account,to:'${wallet.address}',value:'0x${amount.toString(16)}'}]});
sessionStorage.setItem('preflight-funding-${wallet.address}',pendingHash);
}
status.textContent='Funding submitted: '+pendingHash+' — checking its receipt…';
const response=await fetch('/funded',{method:'POST',headers:{'content-type':'application/json','x-evidence-capability':'${capability}'},body:JSON.stringify({hash:pendingHash})});
const result=await response.json();if(!response.ok)throw Error(result.error);
status.textContent='Funding verified. The local test runner is executing. Keep its terminal open. You can close this page.';
}catch(error){status.textContent=error.message;button.textContent=pendingHash?'Recheck existing funding':'Connect OKX and review funding';button.disabled=false;}};
</script></body></html>`;
  const server = createServer(async (request, response) => {
    if (request.headers.host !== "127.0.0.1:3939") {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${capability}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`,
      });
      response.end(page);
      return;
    }
    if (
      request.method !== "POST" ||
      request.url !== "/funded" ||
      request.headers.origin !== origin ||
      request.headers["x-evidence-capability"] !== capability ||
      pending
    ) {
      response.writeHead(403).end();
      return;
    }
    pending = true;
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 256) throw new Error("Invalid funding response");
      }
      const { hash } = JSON.parse(body);
      if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Invalid transaction hash");
      const tx = await provider.getTransaction(hash);
      if (!tx || tx.chainId !== 296n || tx.to?.toLowerCase() !== wallet.address.toLowerCase() || tx.value !== amount)
        throw new Error("Transaction does not match the displayed testnet funding request");
      const receipt = await provider.waitForTransaction(hash, 1, 120_000);
      if (receipt?.status !== 1)
        throw new Error("Funding has not succeeded. Do not send again; check the wallet transaction first.");
      saveEvidenceFunding(state, hash);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ funded: true }));
      resolveFunding(tx.from);
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Funding verification failed" }));
    } finally {
      pending = false;
    }
  });
  server.on("error", error => rejectFunding(error));
  await new Promise<void>(resolve => server.listen(3939, "127.0.0.1", resolve));
  console.log(`BROWSER FUNDING READY: ${origin}`);
  console.log(`Testnet destination ${wallet.address}; amount 40 test HBAR. No key export.`);
  const timeout = setTimeout(() => rejectFunding(new Error("Funding window expired after 30 minutes")), 30 * 60_000);
  try {
    return { wallet, refundAddress: await funded };
  } finally {
    clearTimeout(timeout);
    server.close();
    provider.destroy();
  }
}
