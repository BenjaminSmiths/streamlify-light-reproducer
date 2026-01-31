import { PublicKey, AccountMeta } from '@solana/web3.js';

/**
 * Light Protocol V2 Devnet Constants
 * These are the official addresses for devnet
 */
// Light System Program V2 (from error logs)
export const LIGHT_SYSTEM_PROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_LIGHT_SYSTEM_PROGRAM || 'SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7'
);

export const ACCOUNT_COMPRESSION_PROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_ACCOUNT_COMPRESSION_PROGRAM || 'compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq'
);

export const ACCOUNT_COMPRESSION_AUTHORITY = new PublicKey(
  process.env.NEXT_PUBLIC_ACCOUNT_COMPRESSION_AUTHORITY || 'HwXnGK3tPkkVY6P439H2p68AxpeuWXd5PcrAxFpbmfbA'
);

// V2 Batch Trees (devnet)
export const STATE_TREE = new PublicKey(
  process.env.NEXT_PUBLIC_STATE_TREE || 'bmt1LryLZUMmF7ZtqESaw7wifBXLfXHQYoE4GAmrahU'
);

export const ADDRESS_TREE = new PublicKey(
  process.env.NEXT_PUBLIC_ADDRESS_TREE || 'amt2kaJA14v3urZbZvnc5v2np8jqvc4Z8zDep5wbtzx'
);

export const OUTPUT_QUEUE = new PublicKey(
  process.env.NEXT_PUBLIC_OUTPUT_QUEUE || 'oq1na8gojfdUhsfCpyjNt6h4JaDWtHf1yQj4koBWfto'
);

export const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

/**
 * Derive the CPI Authority PDA for a given program
 * This is the PDA that signs on behalf of the calling program
 */
export function deriveCpiAuthority(programId: PublicKey): PublicKey {
  const [cpiAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('cpi_authority')],
    programId
  );
  return cpiAuthority;
}

/**
 * Derive the Registered Program PDA for a given program
 * This PDA is created when a program is registered with Light Protocol
 */
export function deriveRegisteredProgramPda(programId: PublicKey): PublicKey {
  const [registeredProgramPda] = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    ACCOUNT_COMPRESSION_PROGRAM
  );
  return registeredProgramPda;
}

/**
 * Build the remaining_accounts array in V2 ORDER
 *
 * CRITICAL: The order matters! This was the root cause of the
 * "signer privilege escalated" error.
 *
 * V2 Required Order (CpiAccounts::new() expects):
 * [0] Light System Program (CPI target - must be present for invoke!)
 * [1] Fee Payer (signer, writable)
 * [2] CPI Authority PDA (read-only)
 * [3] Registered Program PDA (read-only)
 * [4] Account Compression Authority (read-only)
 * [5] Account Compression Program (read-only)
 * [6] System Program (read-only) - NEVER writable!
 * [7+] Tree accounts (writable)
 */
export function buildV2RemainingAccounts(
  feePayer: PublicKey,
  programId: PublicKey
): AccountMeta[] {
  const cpiAuthority = deriveCpiAuthority(programId);
  const registeredProgramPda = deriveRegisteredProgramPda(programId);

  // V2 REQUIRED ORDER - DO NOT REORDER!
  const accounts: AccountMeta[] = [
    // [0] Light System Program - CPI target, must be present!
    {
      pubkey: LIGHT_SYSTEM_PROGRAM,
      isSigner: false,
      isWritable: false,
    },

    // [1] Fee Payer (signer, writable)
    {
      pubkey: feePayer,
      isSigner: true,
      isWritable: true,
    },

    // [2] CPI Authority PDA
    // The program's PDA that signs the CPI call
    {
      pubkey: cpiAuthority,
      isSigner: false, // PDA signing handled by Light SDK
      isWritable: false,
    },

    // [3] Registered Program PDA
    // Proves the program is registered with Light Protocol
    {
      pubkey: registeredProgramPda,
      isSigner: false,
      isWritable: false,
    },

    // [4] Account Compression Authority
    // Light Protocol's authority for compression operations
    {
      pubkey: ACCOUNT_COMPRESSION_AUTHORITY,
      isSigner: false,
      isWritable: false,
    },

    // [5] Account Compression Program
    // The compression program that manages state trees
    {
      pubkey: ACCOUNT_COMPRESSION_PROGRAM,
      isSigner: false,
      isWritable: false,
    },

    // [6] System Program (read-only - NEVER writable!)
    {
      pubkey: SYSTEM_PROGRAM,
      isSigner: false,
      isWritable: false,
    },

    // [7] State Tree (V2 Batch)
    // Where compressed account data is stored
    {
      pubkey: STATE_TREE,
      isSigner: false,
      isWritable: true,
    },

    // [8] Address Tree (V2 Batch)
    // Where compressed account addresses are indexed
    {
      pubkey: ADDRESS_TREE,
      isSigner: false,
      isWritable: true,
    },

    // [9] Output Queue
    // Queue for batched outputs
    {
      pubkey: OUTPUT_QUEUE,
      isSigner: false,
      isWritable: true,
    },
  ];

  return accounts;
}

/**
 * Log remaining accounts for debugging
 */
export function logRemainingAccounts(accounts: AccountMeta[]): void {
  console.log('=== V2 Remaining Accounts ===');
  const labels = [
    'Light System Program',  // [0] - CPI target
    'Fee Payer',             // [1]
    'CPI Authority',         // [2]
    'Registered PDA',        // [3]
    'Compression Auth',      // [4]
    'Compression Program',   // [5]
    'System Program',        // [6]
    'State Tree',            // [7]
    'Address Tree',          // [8]
    'Output Queue',          // [9]
  ];

  accounts.forEach((acc, i) => {
    const label = labels[i] || `Account ${i}`;
    console.log(
      `  [${i}] ${label}: ${acc.pubkey.toBase58().slice(0, 8)}... signer=${acc.isSigner} writable=${acc.isWritable}`
    );
  });
}
