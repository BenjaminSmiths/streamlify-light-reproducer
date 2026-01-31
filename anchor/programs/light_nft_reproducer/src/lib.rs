use anchor_lang::prelude::*;
use borsh::{BorshDeserialize, BorshSerialize};
use light_sdk::cpi::CpiSigner;
use light_sdk::cpi::v2::CpiAccounts;
use light_compressed_account::instruction_data::with_account_info::InstructionDataInvokeCpiWithAccountInfo;
use light_sdk::cpi::{LightCpiInstruction, InvokeLightSystemProgram};
use light_sdk::derive_light_cpi_signer;
use light_sdk::instruction::{ValidityProof, CompressedProof};
use light_sdk::{LightAccount, LightDiscriminator};
use light_sdk::address::NewAddressParamsAssignedPacked;
use light_hasher::Hasher;

// Replace with your deployed program ID after `anchor deploy`
declare_id!("FqnkaXZkLJfMZbrx36qBnuSZcJAaktguuhp32mqmAKAo");

/// V2 CPI Signer - derived from program ID
/// This macro generates the CPI signer PDA seeds for Light Protocol
pub const LIGHT_CPI_SIGNER: CpiSigner =
    derive_light_cpi_signer!("FqnkaXZkLJfMZbrx36qBnuSZcJAaktguuhp32mqmAKAo");

#[program]
pub mod light_nft_reproducer {
    use super::*;

    /// Create a compressed NFT registry using Light Protocol V2 CPI
    ///
    /// # Arguments
    /// * `ctx` - Context containing user signer and remaining_accounts
    /// * `name` - NFT name (max 32 bytes)
    /// * `symbol` - NFT symbol (max 10 bytes)
    /// * `uri` - NFT metadata URI (hashed for storage)
    /// * `proof_a` - Validity proof component A (compressed G1 point)
    /// * `proof_b` - Validity proof component B (compressed G2 point)
    /// * `proof_c` - Validity proof component C (compressed G1 point)
    /// * `address_tree_root_index` - Root index for address tree
    /// * `address_tree_account_index` - Index of address tree in remaining_accounts
    /// * `output_queue_index` - Index of output queue in remaining_accounts (V2 batch trees)
    /// * `address_seed` - Seed for deriving compressed account address
    ///
    /// # Remaining Accounts (V2 ORDER - CRITICAL!)
    /// * [0+] Light Protocol accounts in V2 order
    pub fn create_compressed_nft<'info>(
        ctx: Context<'_, '_, '_, 'info, CreateCompressedNFT<'info>>,
        name: String,
        symbol: String,
        uri: String,
        proof_a: [u8; 32],
        proof_b: [u8; 64],
        proof_c: [u8; 32],
        address_tree_root_index: u16,
        address_tree_account_index: u8,
        output_queue_index: u8,
        address_seed: [u8; 32],
    ) -> Result<()> {
        msg!("=== Light Protocol V2 CPI Reproducer ===");
        msg!("Creating compressed NFT registry: {}", name);
        msg!("Symbol: {}, URI length: {}", symbol, uri.len());

        // Log remaining_accounts for debugging
        msg!("Remaining accounts count: {}", ctx.remaining_accounts.len());
        for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
            msg!(
                "  [{}] {} signer={} writable={}",
                i,
                acc.key,
                acc.is_signer,
                acc.is_writable
            );
        }

        // V2 CpiAccounts - SDK parses remaining_accounts in correct order
        // Fee payer MUST be at index 0 in remaining_accounts
        let cpi_accounts = CpiAccounts::new(
            ctx.accounts.user.as_ref(), // fee_payer reference
            ctx.remaining_accounts,     // accounts in V2 order
            LIGHT_CPI_SIGNER,
        );

        // Construct validity proof from client-provided data
        // The proof comes from Photon RPC's getValidityProof endpoint
        let compressed_proof = CompressedProof {
            a: proof_a,
            b: proof_b,
            c: proof_c,
        };
        // ValidityProof is a tuple struct wrapping Option<CompressedProof>
        let proof = ValidityProof(Some(compressed_proof));
        msg!("Validity proof constructed from client data");

        // Create new address parameters with proper tree configuration
        // For V2 batch address trees:
        // - address_queue_account_index = 0 signals "integrated queue" (V2 pattern)
        // - address_merkle_tree_account_index is ABSOLUTE 0-indexed in remaining_accounts
        //   Address Tree at remaining_accounts[8]
        let address_tree_absolute_index = 8u8;  // Absolute index in remaining_accounts
        let new_address_params = NewAddressParamsAssignedPacked {
            seed: address_seed,
            address_queue_account_index: 0,  // V2: 0 = integrated queue
            address_merkle_tree_account_index: address_tree_absolute_index,
            address_merkle_tree_root_index: address_tree_root_index,
            assigned_to_account: false,               // Not assigned to existing account
            assigned_account_index: 0,                // N/A since not assigned
        };
        msg!("Address params: root_index={}, tree_index={} (absolute), queue=0 (integrated), seed={:?}",
             address_tree_root_index, address_tree_absolute_index, &address_seed[..8]);

        // Prepare NFT registry data
        let mut owner_bytes = [0u8; 32];
        let mut name_bytes = [0u8; 32];
        let mut symbol_bytes = [0u8; 10];

        owner_bytes.copy_from_slice(ctx.accounts.user.key.as_ref());

        let name_len = name.len().min(32);
        let symbol_len = symbol.len().min(10);
        name_bytes[..name_len].copy_from_slice(&name.as_bytes()[..name_len]);
        symbol_bytes[..symbol_len].copy_from_slice(&symbol.as_bytes()[..symbol_len]);

        // Hash URI to fixed 32 bytes for storage efficiency
        let uri_hash = hash_to_32_bytes(uri.as_bytes());

        // Initialize Light Account for the NFT registry
        // output_tree_index is ABSOLUTE 0-indexed in remaining_accounts
        // Output Queue at remaining_accounts[9]
        let output_queue_absolute_index = 9u8;
        let mut registry = LightAccount::<NFTRegistry>::new_init(
            &crate::ID,
            None, // Address derived by Light Protocol
            output_queue_absolute_index,
        );
        msg!("Output queue index: {} (absolute)", output_queue_absolute_index);
        registry.owner = owner_bytes;
        registry.name = name_bytes;
        registry.symbol = symbol_bytes;
        registry.uri_hash = uri_hash;

        msg!("NFT Registry initialized:");
        msg!("  Owner: {}", ctx.accounts.user.key);
        msg!("  Name: {:?}", String::from_utf8_lossy(&registry.name));

        msg!("Invoking Light System Program V2 CPI (AccountInfo variant)...");

        // Execute V2 CPI with AccountInfo variant - supports writable accounts for new addresses
        // InstructionDataInvokeCpiWithAccountInfo is required when creating new addresses
        InstructionDataInvokeCpiWithAccountInfo::new_cpi(LIGHT_CPI_SIGNER, proof)
            .with_light_account(registry)
            .map_err(|e| {
                msg!("Failed to add light account: {:?}", e);
                error!(ErrorCode::LightAccountError)
            })?
            .with_new_addresses(&[new_address_params])
            .invoke(cpi_accounts)
            .map_err(|e| {
                msg!("CPI invoke failed: {:?}", e);
                error!(ErrorCode::CpiInvokeFailed)
            })?;

        msg!("=== Compressed NFT registry created successfully! ===");
        Ok(())
    }
}

/// Accounts for creating a compressed NFT
///
/// The key insight for V2 CPI is that remaining_accounts MUST be in the correct order:
/// [0] light_system_program (CPI target), [1] fee_payer, [2] cpi_authority, [3] registered_pda,
/// [4] compression_auth, [5] compression_program, [6] system_program, [7+] trees...
#[derive(Accounts)]
pub struct CreateCompressedNFT<'info> {
    /// The user creating the NFT (pays for transaction)
    #[account(mut)]
    pub user: Signer<'info>,

    /// System program for account creation
    pub system_program: Program<'info, System>,

    // V2 Light Protocol accounts passed via remaining_accounts
    // This is INTENTIONAL - V2 CPI uses remaining_accounts for flexibility
}

/// Compressed NFT Registry stored in Light Protocol state tree
/// Uses LightDiscriminator for proper serialization
#[derive(Clone, Debug, Default, LightDiscriminator, BorshSerialize, BorshDeserialize)]
pub struct NFTRegistry {
    /// Owner of the NFT
    pub owner: [u8; 32],
    /// NFT name (padded to 32 bytes)
    pub name: [u8; 32],
    /// NFT symbol (padded to 10 bytes)
    pub symbol: [u8; 10],
    /// Hash of the metadata URI (32 bytes)
    pub uri_hash: [u8; 32],
}

/// Simple hash function to convert arbitrary bytes to 32 bytes
fn hash_to_32_bytes(data: &[u8]) -> [u8; 32] {
    use light_hasher::Poseidon;

    // Use Poseidon hasher from light-hasher
    let result = Poseidon::hash(data);
    match result {
        Ok(hash) => hash,
        Err(_) => {
            // Fallback: use simple truncation/padding
            let mut output = [0u8; 32];
            let len = data.len().min(32);
            output[..len].copy_from_slice(&data[..len]);
            output
        }
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Failed to add light account to CPI")]
    LightAccountError,
    #[msg("CPI invoke to Light System Program failed")]
    CpiInvokeFailed,
}
