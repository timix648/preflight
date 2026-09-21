// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @title The association slice of the Hedera Token Service at 0x167.
/// @notice The scaffold ships a minimal IHederaTokenService covering token
///         creation and minting. These are the association-related functions,
///         kept in their own interface so the shipped one stays untouched and
///         a reader can see exactly which precompile calls this kit makes.
interface IHtsAssociation {
    /// @notice Associate one token with one account. The account must sign.
    /// @return responseCode 22 is SUCCESS. See IHtsResponseCodes.
    function associateToken(address account, address token) external returns (int64 responseCode);

    /// @notice Associate several tokens with one account in a single call.
    function associateTokens(address account, address[] memory tokens) external returns (int64 responseCode);

    /// @notice Dissociate a token. Fails if the account still holds a balance.
    function dissociateToken(address account, address token) external returns (int64 responseCode);

    /// @notice Does this address correspond to an HTS token at all?
    function isToken(address token) external returns (int64 responseCode, bool result);

    /// @notice 0 is fungible, 1 is non-fungible.
    function getTokenType(address token) external returns (int64 responseCode, int32 tokenType);
}

/// @title The Hedera Account Service at 0x16a.
/// @notice HIP-632. This is where signature verification lives.
///
///         It is NOT at 0x167. Confusing the Token Service with the Account
///         Service is a common and expensive mistake: the call does not revert
///         with a helpful message, it simply is not there.
interface IHederaAccountService {
    /// @notice Verify a signature against an account's key, whatever that key
    ///         is — ECDSA, ED25519, or a threshold key that no single
    ///         `ecrecover` could ever satisfy.
    /// @param account The Hedera account whose key should be checked.
    /// @param messageHash The hash that was signed.
    /// @param signature The signature bytes.
    /// @return responseCode 22 is SUCCESS.
    /// @return authorized True when the signature satisfies the account's key.
    function isAuthorizedRaw(
        address account,
        bytes memory messageHash,
        bytes memory signature
    ) external returns (int64 responseCode, bool authorized);
}

/// @notice The HTS response codes this template actually checks.
/// @dev HTS returns int64 response codes rather than reverting, so a call that
///      "succeeded" at the EVM level can still have failed at the Hedera level.
///      Ignoring the return value is the single most common HTS bug: the
///      transaction shows as successful and nothing happened.
library IHtsResponseCodes {
    int64 internal constant SUCCESS = 22;
    int64 internal constant TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184;
    int64 internal constant TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT = 194;
    int64 internal constant INVALID_TOKEN_ID = 167;
    int64 internal constant INVALID_ACCOUNT_ID = 15;
    int64 internal constant ACCOUNT_FROZEN_FOR_TOKEN = 24;
}
