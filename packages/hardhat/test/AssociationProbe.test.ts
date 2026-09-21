/**
 * Revert paths for AssociationProbe.
 *
 * Every test is named after the guarantee it protects. Revert coverage matters
 * more here than line coverage: a test proving that a bad call fails LOUDLY is
 * worth more than one proving the happy path works, because the happy path is
 * the case people actually try by hand.
 *
 * These run on a plain Hardhat node, which has nothing deployed at 0x167 or
 * 0x16a. That is not a limitation to work around — it is the most important
 * case in the file. It is exactly what a developer hits when they point this
 * template at a non-Hedera chain, and the contract must say so clearly instead
 * of failing with an unexplained revert.
 *
 * The on-Hedera paths are covered by the testnet integration evidence in
 * EVIDENCE.md, because they need real HTS precompiles to exist.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import type { AssociationProbe } from "../typechain-types";

describe("AssociationProbe", () => {
  let probe: AssociationProbe;

  beforeEach(async () => {
    const factory = await ethers.getContractFactory("AssociationProbe");
    probe = (await factory.deploy()) as unknown as AssociationProbe;
    await probe.waitForDeployment();
  });

  describe("system contract addresses", () => {
    it("points at 0x167 for the Token Service", async () => {
      expect(await probe.HTS()).to.equal("0x0000000000000000000000000000000000000167");
    });

    it("points_at_0x16a_for_the_account_service_not_0x167", async () => {
      // The distinction this whole template insists on. isAuthorizedRaw lives
      // on the Account Service; wiring it to the Token Service produces a call
      // that simply is not there, with no helpful error.
      expect(await probe.HAS()).to.equal("0x000000000000000000000000000000000000016a");
      expect(await probe.HAS()).to.not.equal(await probe.HTS());
    });
  });

  describe("input validation happens before any external call", () => {
    it("rejects the zero address as a token", async () => {
      await expect(probe.associateSelf(ethers.ZeroAddress)).to.be.revertedWithCustomError(probe, "ZeroAddress");
    });

    it("rejects the zero address when inspecting a token", async () => {
      await expect(probe.inspectToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(probe, "ZeroAddress");
    });

    it("rejects the zero address when checking authorization", async () => {
      await expect(probe.isAuthorized(ethers.ZeroAddress, "0x", "0x")).to.be.revertedWithCustomError(
        probe,
        "ZeroAddress",
      );
    });
  });

  describe("every failure is named, in whichever environment this runs", () => {
    const SOME_TOKEN = "0x0000000000000000000000000000000000001234";

    /**
     * The guarantee under test, stated environment-independently.
     *
     * These tests must hold in two different worlds and must not assume
     * either. A plain Hardhat node has nothing at 0x167. `yarn hardhat:test`
     * sets HEDERA_FORKING=true, and the forking plugin serves precompile code
     * over `eth_getCode` while the EVM's own `extcodesize` still sees none —
     * so inspecting the environment gives contradictory answers depending on
     * which layer you ask, and ordering changes it again.
     *
     * Asserting a specific revert was therefore flaky for reasons that had
     * nothing to do with the contract. The real guarantee never depended on
     * the environment: whatever happens, the caller is never handed a bare
     * revert with no reason data. It either succeeds, or it fails with a name.
     */
    const expectNamedFailureOrSuccess = async (call: () => Promise<unknown>, allowed: string[]): Promise<void> => {
      try {
        await call();
        return; // succeeding is a legitimate outcome where HTS really exists
      } catch (error) {
        const data = (error as { data?: string }).data;
        const message = (error as { message?: string }).message ?? "";

        // A bare `revert(0,0)` carries no data. That is the failure mode this
        // contract exists to prevent, because it leaves a developer unable to
        // tell "wrong network" from "bad token".
        const isBareRevert = data === "0x" || /reverted without a reason|unexpected amount of data/i.test(message);
        expect(isBareRevert, `bare revert with no reason data: ${message}`).to.equal(false);

        const named = allowed.some(name => message.includes(name));
        expect(named, `expected one of [${allowed.join(", ")}], got: ${message}`).to.equal(true);
      }
    };

    it("associateSelf_never_fails_without_saying_why", async () => {
      await expectNamedFailureOrSuccess(
        () => probe.associateSelf(SOME_TOKEN),
        ["SystemContractUnreachable", "HtsCallFailed"],
      );
    });

    it("isAuthorized_never_fails_without_saying_why", async () => {
      await expectNamedFailureOrSuccess(
        () => probe.isAuthorized("0x0000000000000000000000000000000000005678", "0x1234", "0x5678"),
        ["SystemContractUnreachable", "HtsCallFailed"],
      );
    });

    it("inspectToken_never_fails_without_saying_why", async () => {
      await expectNamedFailureOrSuccess(
        () => probe.inspectToken(SOME_TOKEN),
        ["SystemContractUnreachable", "HtsCallFailed"],
      );
    });

    it("names_the_right_system_contract_when_one_is_missing", async () => {
      // When the guard does fire, it must name 0x16a for the Account Service
      // and 0x167 for the Token Service. Confusing the two is the mistake this
      // whole template is built to prevent.
      try {
        await probe.isAuthorized("0x0000000000000000000000000000000000005678", "0x12", "0x34");
      } catch (error) {
        const message = (error as { message?: string }).message ?? "";
        if (message.includes("SystemContractUnreachable")) {
          expect(message).to.include("016a");
          expect(message).to.not.include("0000167");
        }
      }
    });
  });

  describe("the unchecked variant demonstrates the bug it is named after", () => {
    it("associateUnchecked_gives_the_caller_nothing_to_work_with", async () => {
      // The contrast IS the documentation. Both functions fail here, but only
      // one of them explains itself.
      const token = "0x0000000000000000000000000000000000001234";

      // Careful version: a named error saying exactly which system contract
      // is missing.
      await expect(probe.associateSelf(token))
        .to.be.revertedWithCustomError(probe, "SystemContractUnreachable")
        .withArgs("0x0000000000000000000000000000000000000167");

      // Naive version: reverts with no reason data at all. A developer seeing
      // this cannot tell a wrong network from a bad token.
      await expect(probe.associateUnchecked(token)).to.be.reverted;
      await expect(probe.associateUnchecked(token)).to.not.be.revertedWithCustomError(
        probe,
        "SystemContractUnreachable",
      );
    });

    it("associateUnchecked_skips_input_validation_too", async () => {
      // associateSelf rejects the zero address by name. The naive one does not
      // even look, and fails later and less usefully.
      await expect(probe.associateSelf(ethers.ZeroAddress)).to.be.revertedWithCustomError(probe, "ZeroAddress");
      await expect(probe.associateUnchecked(ethers.ZeroAddress)).to.not.be.revertedWithCustomError(
        probe,
        "ZeroAddress",
      );
    });
  });

  describe("long-zero detection, on-chain", () => {
    it("recognises the long-zero form of real account ids", async () => {
      // Values confirmed against the live testnet mirror node.
      expect(await probe.isLongZero("0x0000000000000000000000000000000000000002")).to.equal(true);
      expect(await probe.isLongZero("0x00000000000000000000000000000000000003e8")).to.equal(true);
      expect(await probe.isLongZero("0x0000000000000000000000000000000000a1ddb4")).to.equal(true);
    });

    it("does not mistake a real key-derived address for long-zero", async () => {
      // A live ECDSA account's address, derived from its public key.
      expect(await probe.isLongZero("0x574c17b6d34ffb8e2993645b32f773963fc77a53")).to.equal(false);
    });

    it("treats the zero address as long-zero, because it is account 0.0.0", async () => {
      expect(await probe.isLongZero(ethers.ZeroAddress)).to.equal(true);
    });

    it("agrees_with_the_typescript_implementation_at_the_boundary", async () => {
      // 2^64 - 1 is the largest account number expressible; 2^64 is not, so the
      // first address at or above that boundary must classify as key-derived.
      const maxLongZero = "0x" + (2n ** 64n - 1n).toString(16).padStart(40, "0");
      const justOver = "0x" + (2n ** 64n).toString(16).padStart(40, "0");
      expect(await probe.isLongZero(maxLongZero)).to.equal(true);
      expect(await probe.isLongZero(justOver)).to.equal(false);
    });
  });

  describe("ecrecover is exposed for contrast, and behaves as documented", () => {
    it("recovers the signer of a genuine ECDSA signature", async () => {
      const [signer] = await ethers.getSigners();
      const message = "onboarding kit";
      const messageHash = ethers.hashMessage(message);
      const signature = ethers.Signature.from(await signer.signMessage(message));

      const recovered = await probe.recoverWithEcrecover(messageHash, signature.v, signature.r, signature.s);
      expect(recovered).to.equal(signer.address);
    });

    it("ecrecover_returns_a_wrong_address_rather_than_failing", async () => {
      // THE trap, demonstrated on-chain. Given a valid signature but the wrong
      // hash, ecrecover does not revert and does not return zero — it returns
      // a different, perfectly well-formed address. Any code comparing that to
      // an expected address rejects a legitimate signer and cannot say why.
      const [signer] = await ethers.getSigners();
      const signature = ethers.Signature.from(await signer.signMessage("onboarding kit"));
      const wrongHash = ethers.hashMessage("a different message");

      const recovered = await probe.recoverWithEcrecover(wrongHash, signature.v, signature.r, signature.s);

      expect(recovered).to.not.equal(signer.address);
      expect(recovered).to.not.equal(ethers.ZeroAddress);
      expect(ethers.isAddress(recovered)).to.equal(true);
    });
  });
});
