# Optional probe deployment

The [quick start](../README.md#1-create-a-project-from-this-template) and browser
wallet acquisition do not require a deployment or deployer-key import. Use this
procedure only to deploy your own `AssociationProbe` for the scaffold debug UI.
Run every command below from the repository root, after installing dependencies.

## Import a testnet deployer

Use a funded testnet ECDSA account. Keep its key and encryption password local.

```bash
node .yarn/releases/yarn-3.2.3.cjs hardhat:account:import
node .yarn/releases/yarn-3.2.3.cjs hardhat:account
```

The first command prompts for the key and an encryption password, then writes
`DEPLOYER_PRIVATE_KEY_ENCRYPTED` to `packages/hardhat/.env`. The second displays
account information. Check the derived address is the account you intended to use.
The importer refuses to replace an existing encrypted account; preserve that
configuration rather than deleting it to bypass the check.

## Compile and deploy

```bash
node .yarn/releases/yarn-3.2.3.cjs hardhat:compile
node .yarn/releases/yarn-3.2.3.cjs hardhat:test
node .yarn/releases/yarn-3.2.3.cjs hardhat:deploy --network hederaTestnet
```

Deployment spends test HBAR. The wrapper prompts to unlock the encrypted account.
The expected outputs are the deployed address in the terminal, deployment data in
`packages/hardhat/deployments/hederaTestnet/AssociationProbe.json`, and generated
ABI/address data in `packages/nextjs/contracts/deployedContracts.ts`. Restart the
frontend if needed and use `/debug` on testnet to inspect your deployed probe.

The deployment task generates the frontend contract file; do not manually paste
the address into an invented environment variable. Compilation and deployment
alone are not proof that contract source verification passed.

## Verify the deployed source

Replace `<deployed-address>` with the address printed by your deployment:

```bash
node .yarn/releases/yarn-3.2.3.cjs hardhat:verify:sourcify <deployed-address>
```

The script defaults to testnet and `contracts/AssociationProbe.sol:AssociationProbe`.
It uses local compiler build-info and submits to Sourcify. Inspect its returned
verification status before claiming a match. The bundled `hardhat:verify:testnet`
plugin route hit a retired verification endpoint during development; this script
is the repository's documented alternative. See [failure notes](../NOTES-failures.md).

## Hosting the frontend

The existing example is [hosted on Vercel](https://preflight-peach-theta.vercel.app).
For your own deployment use `packages/nextjs` as the project root and include the
workspace files above it: the root Yarn lockfile and workspace packages are needed.
The package's `vercel.json` supplies the installation command.

Set your own `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` for a public deployment.
Public RPC/mirror defaults support credential-free reads; deployer keys do not
belong in the frontend hosting environment. External API availability and mirror
indexing can affect responses. The acquire page uses a 300-second revalidation
interval, so a rendered snapshot is not necessarily a new upstream read on every visit.
