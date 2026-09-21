// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHtsAssociation, IHederaAccountService, IHtsResponseCodes } from "./interfaces/IHederaAssociation.sol";

/// @title AssociationProbe
/// @author 0xgenzero
/// @notice A deliberately small demonstration of calling Hedera's system
///         contracts from Solidity, and of the one mistake that makes those
///         calls dangerous.
///
/// @dev This template is not a contracts project. The interesting work lives in
///      `packages/nextjs/lib/onboarding/`. This contract exists to prove three
///      things a judge can verify on HashScan:
///
///        1. The Token Service at 0x167 can be called from Solidity, and its
///           int64 response codes must be CHECKED rather than ignored.
///        2. Signature verification lives on the Account Service at 0x16a,
///           not on 0x167 — a distinction most code gets wrong.
///        3. Every failure path reverts with a named error, so a caller can
///           tell what went wrong without decoding a raw integer.
///
///      THE BUG THIS CONTRACT EXISTS TO DEMONSTRATE:
///      HTS precompiles do not revert on failure. They return an int64 response
///      code. A call that "succeeded" at the EVM level can have done nothing at
///      all at the Hedera level, and the transaction still shows as successful.
///      Every external call below therefore checks its response code, and
///      `associateUnchecked` is kept as an executable illustration of what
///      happens when you do not.
contract AssociationProbe {
    /// @notice The Hedera Token Service system contract.
    IHtsAssociation public constant HTS = IHtsAssociation(address(0x167));

    /// @notice The Hedera Account Service system contract. NOT 0x167.
    IHederaAccountService public constant HAS = IHederaAccountService(address(0x16a));

    /// @notice Emitted on every probe so the whole journey is visible on-chain.
    event AssociationProbed(address indexed account, address indexed token, int64 responseCode, bool success);

    /// @notice Emitted when a signature is checked through 0x16a.
    event AuthorizationProbed(address indexed account, int64 responseCode, bool authorized);

    /// @dev The precompile answered, but with a failure code.
    error HtsCallFailed(int64 responseCode, string meaning);
    /// @dev The precompile did not answer at all — wrong address, or not Hedera.
    error SystemContractUnreachable(address systemContract);
    /// @dev A zero address cannot be an account or a token.
    error ZeroAddress();

    /// @dev Reverts unless this chain actually has Hedera system contracts.
    ///
    ///      ---------------------------------------------------------------
    ///      DO NOT CHECK `target.code.length`. IT IS ALWAYS ZERO.
    ///
    ///      Hedera's system contracts are precompiles, not deployed
    ///      bytecode. Inside the EVM `address(0x167).code.length` is 0 on a
    ///      live Hedera network, so an extcodesize guard rejects every
    ///      legitimate call. It is not even detectable from outside the
    ///      contract: `eth_getCode` reports a synthetic 1-byte placeholder
    ///      for 0x167 and an empty result for 0x16a, so the RPC layer and
    ///      the EVM disagree with each other AND with reality.
    ///
    ///      An earlier version of this contract used exactly that guard. It
    ///      passed every local test and then reverted on mainnet-shaped
    ///      networks with SystemContractUnreachable(0x167) for tokens that
    ///      plainly exist. See NOTES-failures.md #16.
    ///      ---------------------------------------------------------------
    ///
    ///      The chain id is the reliable signal: system contracts exist on
    ///      Hedera networks and nowhere else.
    function _requireHederaNetwork(address service) private view {
        uint256 id = block.chainid;
        // 295 mainnet, 296 testnet, 297 previewnet, 298 local node.
        if (id != 295 && id != 296 && id != 297 && id != 298) {
            revert SystemContractUnreachable(service);
        }
    }

    /// @notice Associate a token with this contract, checking the response code.
    /// @dev The contract associates ITSELF: a contract cannot associate a token
    ///      with somebody else's account without that account's signature, and
    ///      pretending otherwise is how association code goes wrong.
    /// @param token The token's EVM address.
    /// @return responseCode The raw HTS code, 22 on success.
    function associateSelf(address token) external returns (int64 responseCode) {
        if (token == address(0)) revert ZeroAddress();
        _requireHederaNetwork(address(HTS));

        try HTS.associateToken(address(this), token) returns (int64 code) {
            responseCode = code;
        } catch {
            // No precompile here. Almost always means this is not a Hedera
            // network — a plain Hardhat node has nothing at 0x167.
            revert SystemContractUnreachable(address(HTS));
        }

        bool success = responseCode == IHtsResponseCodes.SUCCESS ||
            responseCode == IHtsResponseCodes.TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT;

        emit AssociationProbed(address(this), token, responseCode, success);

        if (!success) {
            revert HtsCallFailed(responseCode, _explain(responseCode));
        }
    }

    /// @notice The naive version of the call above. Kept as documentation.
    ///
    /// @dev DO NOT COPY THIS. It is deliberately careless in all three ways
    ///      `associateSelf` is careful, so the README can point at a real
    ///      deployed example rather than a hypothetical one:
    ///
    ///        no input validation   a zero token address sails through
    ///        no presence check     off Hedera it reverts with NO reason data,
    ///                              leaving the caller unable to tell "wrong
    ///                              network" from "bad token"
    ///        no response check     ON Hedera this is the real damage. HTS
    ///                              returns an int64 rather than reverting, so
    ///                              a failed association yields a SUCCESSFUL
    ///                              transaction that did nothing at all
    ///
    ///      The third is the one that actually costs people days, and it is
    ///      invisible: the explorer shows a green transaction.
    function associateUnchecked(address token) external returns (int64 responseCode) {
        responseCode = HTS.associateToken(address(this), token);
        // No check. No revert. The caller cannot tell the difference between
        // code 22 and code 184 unless they read the return value themselves.
        emit AssociationProbed(address(this), token, responseCode, true);
    }

    /// @notice Is this address an HTS token, and of which type?
    /// @return isHtsToken True when 0x167 recognises it.
    /// @return isFungible True for fungible, false for an NFT collection.
    function inspectToken(address token) external returns (bool isHtsToken, bool isFungible) {
        if (token == address(0)) revert ZeroAddress();
        _requireHederaNetwork(address(HTS));

        int64 tokenCode;
        try HTS.isToken(token) returns (int64 code, bool result) {
            tokenCode = code;
            isHtsToken = result;
        } catch {
            revert SystemContractUnreachable(address(HTS));
        }

        if (tokenCode != IHtsResponseCodes.SUCCESS) {
            revert HtsCallFailed(tokenCode, _explain(tokenCode));
        }
        if (!isHtsToken) {
            return (false, false);
        }

        (int64 typeCode, int32 tokenType) = HTS.getTokenType(token);
        if (typeCode != IHtsResponseCodes.SUCCESS) {
            revert HtsCallFailed(typeCode, _explain(typeCode));
        }
        isFungible = tokenType == 0;
    }

    /// @notice Verify a signature through the Account Service at 0x16a.
    ///
    /// @dev This is the whole reason the Account Service exists, and why
    ///      `ecrecover` is not enough on Hedera:
    ///
    ///        - An ED25519 account has no EVM address derived from its key, so
    ///          `ecrecover` cannot produce it.
    ///        - A threshold key or key list cannot be reduced to one recovered
    ///          address at all.
    ///        - A long-zero address is derived from the account NUMBER, so
    ///          `ecrecover` returns a different, entirely valid-looking address
    ///          rather than failing.
    ///
    ///      In every one of those cases `ecrecover` gives a confident wrong
    ///      answer. 0x16a evaluates the account's real key structure instead.
    function isAuthorized(
        address account,
        bytes calldata messageHash,
        bytes calldata signature
    ) external returns (bool authorized) {
        if (account == address(0)) revert ZeroAddress();
        _requireHederaNetwork(address(HAS));

        int64 responseCode;
        try HAS.isAuthorizedRaw(account, messageHash, signature) returns (int64 code, bool result) {
            responseCode = code;
            authorized = result;
        } catch {
            revert SystemContractUnreachable(address(HAS));
        }

        emit AuthorizationProbed(account, responseCode, authorized);

        if (responseCode != IHtsResponseCodes.SUCCESS) {
            revert HtsCallFailed(responseCode, _explain(responseCode));
        }
    }

    /// @notice Recover a signer with plain ecrecover, for side-by-side contrast.
    /// @dev Provided so the /diagnose route can show both answers next to each
    ///      other. For a long-zero or ED25519 account this returns a plausible
    ///      address that is simply wrong — which is the point.
    function recoverWithEcrecover(
        bytes32 messageHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external pure returns (address recovered) {
        recovered = ecrecover(messageHash, v, r, s);
    }

    /// @notice True when the address is the long-zero form of an account id.
    /// @dev Pure, and cheap enough to call from anywhere. The leading 12 bytes
    ///      of a long-zero address are always zero; a key-derived address has
    ///      essentially no chance of that shape.
    function isLongZero(address candidate) external pure returns (bool) {
        return uint256(uint160(candidate)) < (1 << 64);
    }

    /// @dev Response code to a short sentence, so a reverted call says what
    ///      happened instead of returning a bare integer.
    function _explain(int64 responseCode) private pure returns (string memory) {
        if (responseCode == IHtsResponseCodes.TOKEN_NOT_ASSOCIATED_TO_ACCOUNT) {
            return "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT: the account has not opted in to this token";
        }
        if (responseCode == IHtsResponseCodes.TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT) {
            return "TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT: nothing to do";
        }
        if (responseCode == IHtsResponseCodes.INVALID_TOKEN_ID) {
            return "INVALID_TOKEN_ID: no such token on this network";
        }
        if (responseCode == IHtsResponseCodes.INVALID_ACCOUNT_ID) {
            return "INVALID_ACCOUNT_ID: no such account on this network";
        }
        if (responseCode == IHtsResponseCodes.ACCOUNT_FROZEN_FOR_TOKEN) {
            return "ACCOUNT_FROZEN_FOR_TOKEN: only the freeze key can lift this";
        }
        return "unrecognised HTS response code";
    }
}
