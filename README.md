# Light Protocol V2 CPI Reproducer

## Status: BLOCKED - System Program Writable Escalation

**Current Error:**
```
Error: 11111111111111111111111111111111's writable privilege escalated
```

Despite extensive debugging and multiple approaches, we've hit a fundamental issue where the Light Protocol CPI internally tries to make System Program writable, which is impossible on Solana (executables can never be writable).

---

## Problem Statement

**Goal:** Create a compressed NFT using Light Protocol V2 CPI from a custom Anchor program.

**Error:** `11111111111111111111111111111111's writable privilege escalated`

**Environment:**
- Network: Solana Devnet
- light-sdk: 0.16.0 (with features `["v2", "cpi-context"]`)
- @lightprotocol/stateless.js: 0.21.0
- anchor-lang: 0.32.1

---

## Our Journey (Chronological)

### 1. Initial Attempt - `LightSystemProgramCpi::new_cpi()`
**Approach:** Used the standard CPI pattern from Light SDK docs.
**Result:** `signer privilege escalated` on `registeredProgramPda`
**Analysis:** Account ordering was wrong - fee payer was not at index [0].

### 2. Account Ordering Fix - Fee Payer at [0]
**Approach:** Added fee payer at `remaining_accounts[0]` based on V2 documentation.
**Result:** Same signer privilege escalation error.

### 3. Light System Program at [0]
**Approach:** Per DeepWiki analysis, placed Light System Program first as CPI target.
**Result:** `Unknown program` error - the Light System Program wasn't being recognized.

### 4. Added Light System Program Back to Remaining Accounts
**Approach:** Fixed account ordering with Light System Program at [0], fee payer at [1].
**Result:** NEW ERROR: `11111111111111111111111111111111's writable privilege escalated`
**Analysis:** Now System Program (not our PDA) has privilege escalation.

### 5. Tried `InstructionDataInvokeCpiWithReadOnly`
**Approach:** Per DeepWiki, used read-only variant for accounts.
**Result:** Same System Program writable escalation.

### 6. Tried `InstructionDataInvokeCpiWithAccountInfo`
**Approach:** Per DeepWiki, used AccountInfo variant which supports writable accounts for new addresses.
**Result:** Same System Program writable escalation.

### 7. Multiple remaining_accounts Orderings
**Approach:** Tried various combinations:
- Fee Payer first at [0]
- Light System Program first at [0]
- CPI Authority first at [0]
**Result:** All failed with System Program writable escalation.

---

## Code Samples

### Current Rust Implementation (`anchor/programs/light_nft_reproducer/src/lib.rs`)

```rust
use anchor_lang::prelude::*;
use light_sdk::cpi::v2::CpiAccounts;
use light_compressed_account::instruction_data::with_account_info::InstructionDataInvokeCpiWithAccountInfo;
use light_sdk::cpi::{LightCpiInstruction, InvokeLightSystemProgram};
use light_sdk::derive_light_cpi_signer;

declare_id!("FqnkaXZkLJfMZbrx36qBnuSZcJAaktguuhp32mqmAKAo");

pub const LIGHT_CPI_SIGNER: CpiSigner =
    derive_light_cpi_signer!("FqnkaXZkLJfMZbrx36qBnuSZcJAaktguuhp32mqmAKAo");

#[program]
pub mod light_nft_reproducer {
    use super::*;

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
        // V2 CpiAccounts
        let cpi_accounts = CpiAccounts::new(
            ctx.accounts.user.as_ref(),
            ctx.remaining_accounts,
            LIGHT_CPI_SIGNER,
        );

        // Validity proof from Photon RPC
        let proof = ValidityProof(Some(CompressedProof {
            a: proof_a,
            b: proof_b,
            c: proof_c,
        }));

        // New address params
        let new_address_params = NewAddressParamsAssignedPacked {
            seed: address_seed,
            address_queue_account_index: 0,  // V2: integrated queue
            address_merkle_tree_account_index: 8,  // Absolute index
            address_merkle_tree_root_index: address_tree_root_index,
            assigned_to_account: false,
            assigned_account_index: 0,
        };

        // NFT registry data
        let mut registry = LightAccount::<NFTRegistry>::new_init(
            &crate::ID,
            None,
            9,  // output_queue_index
        );
        // ... set registry fields ...

        // Execute V2 CPI - THIS FAILS WITH SYSTEM PROGRAM WRITABLE ESCALATION
        InstructionDataInvokeCpiWithAccountInfo::new_cpi(LIGHT_CPI_SIGNER, proof)
            .with_light_account(registry)?
            .with_new_addresses(&[new_address_params])
            .invoke(cpi_accounts)?;

        Ok(())
    }
}
```

### Current TypeScript Client (`app/src/lib/light-accounts.ts`)

```typescript
export function buildV2RemainingAccounts(
  feePayer: PublicKey,
  programId: PublicKey
): AccountMeta[] {
  const cpiAuthority = deriveCpiAuthority(programId);
  const registeredProgramPda = deriveRegisteredProgramPda(programId);

  // V2 REQUIRED ORDER - DO NOT REORDER!
  return [
    // [0] Light System Program - CPI target
    { pubkey: LIGHT_SYSTEM_PROGRAM, isSigner: false, isWritable: false },

    // [1] Fee Payer (signer, writable)
    { pubkey: feePayer, isSigner: true, isWritable: true },

    // [2] CPI Authority PDA
    { pubkey: cpiAuthority, isSigner: false, isWritable: false },

    // [3] Registered Program PDA
    { pubkey: registeredProgramPda, isSigner: false, isWritable: false },

    // [4] Account Compression Authority
    { pubkey: ACCOUNT_COMPRESSION_AUTHORITY, isSigner: false, isWritable: false },

    // [5] Account Compression Program
    { pubkey: ACCOUNT_COMPRESSION_PROGRAM, isSigner: false, isWritable: false },

    // [6] System Program (read-only - NEVER writable!)
    { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },

    // [7] State Tree
    { pubkey: STATE_TREE, isSigner: false, isWritable: true },

    // [8] Address Tree
    { pubkey: ADDRESS_TREE, isSigner: false, isWritable: true },

    // [9] Output Queue
    { pubkey: OUTPUT_QUEUE, isSigner: false, isWritable: true },
  ];
}
```

### Transaction Logs Showing Error

```
Program FqnkaXZkLJfMZbrx36qBnuSZcJAaktguuhp32mqmAKAo invoke [1]
Program log: === Light Protocol V2 CPI Reproducer ===
Program log: Creating compressed NFT registry: TestNFT
Program log: Remaining accounts count: 10
Program log:   [0] SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7 signer=false writable=false
Program log:   [1] <fee_payer> signer=true writable=true
Program log:   [2] <cpi_authority> signer=false writable=false
Program log:   [3] <registered_pda> signer=false writable=false
...
Program log: Invoking Light System Program V2 CPI (AccountInfo variant)...
Program SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7 invoke [2]
Error: 11111111111111111111111111111111's writable privilege escalated
```

---

## Questions for Light Protocol Team

1. **Is V2 CPI with `with_new_addresses()` supported on devnet?**
   - We're trying to create compressed accounts with derived addresses
   - The error suggests the SDK internally marks System Program as writable

2. **What SDK version is required for V2 CPI with new addresses?**
   - We're using `light-sdk = "0.16.0"` with features `["v2", "cpi-context"]`
   - Is there a newer version that fixes this?

3. **Is there working example code for custom programs calling Light System Program?**
   - All examples we found are for Light's own test infrastructure
   - We need a real-world CPI example from a custom Anchor program

4. **What exact `remaining_accounts` order is expected by `CpiAccounts::new()`?**
   - DeepWiki shows Light System Program at [0], fee payer at [1]
   - But the SDK's `to_account_metas` explicitly marks System Program read-only
   - Yet the CPI still fails with writable escalation

5. **Is this a known issue with V2 batch address trees?**
   - We're using the devnet V2 batch trees:
     - State: `bmt1LryLZUMmF7ZtqESaw7wifBXLfXHQYoE4GAmrahU`
     - Address: `amt2kaJA14v3urZbZvnc5v2np8jqvc4Z8zDep5wbtzx`
     - Queue: `oq1na8gojfdUhsfCpyjNt6h4JaDWtHf1yQj4koBWfto`

---

## Environment Details

| Component | Version/Value |
|-----------|---------------|
| Network | Solana Devnet |
| Program ID | `FqnkaXZkLJfMZbrx36qBnuSZcJAaktguuhp32mqmAKAo` |
| light-sdk | 0.16.0 (features: v2, cpi-context) |
| light-sdk-types | 0.16.0 |
| light-hasher | 5.0.0 |
| @lightprotocol/stateless.js | 0.21.0 |
| anchor-lang | 0.32.1 |
| solana-program | 2.3 |
| Rust | 1.75+ |
| Node.js | 18+ |

### V2 Devnet Tree Addresses

| Tree Type | Address |
|-----------|---------|
| State Tree (V2 Batch) | `bmt1LryLZUMmF7ZtqESaw7wifBXLfXHQYoE4GAmrahU` |
| Address Tree (V2 Batch) | `amt2kaJA14v3urZbZvnc5v2np8jqvc4Z8zDep5wbtzx` |
| Output Queue | `oq1na8gojfdUhsfCpyjNt6h4JaDWtHf1yQj4koBWfto` |

---

## How to Reproduce

### Prerequisites
- Rust 1.75+
- Anchor CLI 0.32.1
- Solana CLI 2.x
- Node.js 18+
- Yarn
- **Helius API Key** (free) - Get one at https://dev.helius.xyz/

### 1. Build & Deploy the Anchor Program

```bash
cd reproducer/anchor

# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

Or use the convenience script:
```bash
./scripts/deploy.sh
```

### 2. Register with Light Protocol

Before your program can make CPI calls to Light Protocol, it must be registered. This involves two steps:

#### How Light Protocol Registration Works

1. **Create a Group Authority** - A PDA that owns a "group" of registered programs
2. **Register Program to Group** - Links your program to that group, creating a `registeredProgramPda`

The registration script handles both steps automatically:

```bash
cd reproducer
npx ts-node scripts/register-program.ts
```

#### What the Script Does

```
Step 1: Initialize Group Authority
  - Generates a random seed keypair
  - Derives Group Authority PDA: findProgramAddressSync(['group_authority', seed], ACCOUNT_COMPRESSION_PROGRAM)
  - Calls initialize_group_authority instruction on Account Compression Program
  - You (the authority) can register multiple programs to this group

Step 2: Register Program to Group
  - Derives Registered Program PDA: findProgramAddressSync([programId], ACCOUNT_COMPRESSION_PROGRAM)
  - Calls register_program_to_group instruction
  - IMPORTANT: Requires program keypair to sign (proves you deployed the program)
```

#### Manual Registration (Alternative)

If you prefer to register manually or need to understand the process:

```typescript
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';

const ACCOUNT_COMPRESSION_PROGRAM = new PublicKey('compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq');

// 1. Derive PDAs
const seedKeypair = Keypair.generate();  // Random seed for your group
const [groupAuthorityPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('group_authority'), seedKeypair.publicKey.toBuffer()],
  ACCOUNT_COMPRESSION_PROGRAM
);

const [registeredProgramPda] = PublicKey.findProgramAddressSync(
  [YOUR_PROGRAM_ID.toBuffer()],
  ACCOUNT_COMPRESSION_PROGRAM
);

// 2. Initialize Group Authority (first time only)
// Discriminator: sha256("global:initialize_group_authority")[0..8]
const initDiscriminator = Buffer.from([0x7b, 0xed, 0xa1, 0x50, 0xea, 0xd7, 0x43, 0xb7]);
const initData = Buffer.concat([initDiscriminator, authority.publicKey.toBuffer()]);

const initIx = new TransactionInstruction({
  programId: ACCOUNT_COMPRESSION_PROGRAM,
  keys: [
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: seedKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: groupAuthorityPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: initData,
});
// Sign with: [authority, seedKeypair]

// 3. Register Program to Group
// Discriminator: sha256("global:register_program_to_group")[0..8]
const registerDiscriminator = Buffer.from([0xe1, 0x56, 0xcf, 0xd3, 0x15, 0x01, 0x2e, 0x19]);

const registerIx = new TransactionInstruction({
  programId: ACCOUNT_COMPRESSION_PROGRAM,
  keys: [
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: YOUR_PROGRAM_ID, isSigner: true, isWritable: false },  // Program must sign!
    { pubkey: registeredProgramPda, isSigner: false, isWritable: true },
    { pubkey: groupAuthorityPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: registerDiscriminator,
});
// Sign with: [authority, programKeypair]  <-- Need your program's deploy keypair!
```

#### Important Notes

- **Program Keypair Required**: Registration requires the program's deploy keypair (found at `target/deploy/<program>-keypair.json` after `anchor build`). This proves you control the program.
- **One-Time Setup**: Once registered, your program stays registered. You don't need to re-register after redeployments to the same program ID.
- **Group Reuse**: You can register multiple programs to the same Group Authority.
- **Save Your Group Authority**: If you want to register more programs later, save your `seedKeypair` or `groupAuthorityPda`.

### 3. Configure Helius API Key

Edit `reproducer/app/.env.local` and add your Helius API key:
```bash
NEXT_PUBLIC_HELIUS_API_KEY=your_actual_api_key_here
```

Get a free key at https://dev.helius.xyz/

### 4. Start the Frontend

```bash
cd reproducer/app

# Install dependencies
yarn install

# Start dev server (runs on port 3001)
yarn dev
```

### 5. Test the CPI

1. Open http://localhost:3001
2. Connect Phantom wallet (switch to devnet)
3. Enter NFT name and symbol
4. Click "Mint Compressed NFT"
5. Check the log panel - you'll see the System Program writable escalation error

---

## Directory Structure

```
reproducer/
├── README.md                           # This file
├── anchor/
│   ├── Anchor.toml
│   ├── Cargo.toml
│   └── programs/light_nft_reproducer/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs                  # Main program with V2 CPI
├── app/
│   ├── package.json
│   ├── next.config.js
│   ├── .env.local
│   └── src/
│       ├── pages/
│       │   ├── _app.tsx
│       │   └── index.tsx               # Single page app
│       ├── components/
│       │   ├── MintForm.tsx
│       │   ├── NFTPreview.tsx
│       │   └── LogPanel.tsx
│       └── lib/
│           ├── program.ts              # Anchor client with proof fetching
│           └── light-accounts.ts       # V2 account derivation
└── scripts/
    ├── deploy.sh                       # Build & deploy script
    └── register-program.ts             # Light Protocol registration
```

---

## Troubleshooting

### Registration Issues

**"signature verification failed"**
The program keypair must sign the registration transaction. Make sure:
1. You've run `anchor build` (creates `target/deploy/<program>-keypair.json`)
2. The program ID in `Anchor.toml` matches the keypair
3. You're running the script from the `reproducer/` directory

**"account already in use"**
Your Group Authority already exists. This is fine - the script will reuse it.

**"Missing program keypair"**
The script looks for the keypair in these locations:
- `anchor/target/deploy/light_nft_reproducer-keypair.json`
- `../anchor/target/deploy/light_nft_reproducer-keypair.json`
- `target/deploy/light_nft_reproducer-keypair.json`

Make sure you've built the program with `anchor build` first.

### Runtime Issues

**"signer privilege escalated" error**
This is the original bug we're investigating. Verify:
1. `feePayer` is at the correct index in remaining_accounts
2. Cargo.toml has both `v2` AND `cpi-context` features
3. Program is registered with Light Protocol

**"Missing NEXT_PUBLIC_HELIUS_API_KEY"**
Edit `.env.local` and add your Helius API key. Get a free key at https://dev.helius.xyz/

**Build errors**
Ensure you have the correct Anchor version:
```bash
anchor --version  # Should be 0.32.1
```

**Insufficient SOL**
Request an airdrop:
```bash
solana airdrop 2
```

### 8. Packed Index Fix (From Light Protocol Team Feedback)
**Feedback:** The Light Protocol team confirmed our account order is correct, but pointed out that tree indices must be **relative to the packed accounts section**, not absolute indices into `remaining_accounts`.

The system accounts occupy positions [0-6]. The packed accounts start after that, so:
| Account | Absolute Index | Packed Index (what Light expects) |
|---------|---------------|-----------------------------------|
| State Tree (bmt1) | 7 | **0** |
| Address Tree (amt2) | 8 | **1** |
| Output Queue (oq1) | 9 | **2** |

**Changes made:**
- `lib.rs`: `address_tree_absolute_index = 8u8` → `address_tree_packed_index = 1u8`
- `lib.rs`: `output_queue_absolute_index = 9u8` → `output_queue_packed_index = 2u8`
- `program.ts`: `ADDRESS_TREE_ACCOUNT_INDEX = 8` → `1`
- `program.ts`: `OUTPUT_QUEUE_INDEX = 9` → `2`

**Result:** Same System Program writable escalation error persists. The index fix was correct but the root cause is elsewhere — the CPI invoke still tries to escalate `11111111111111111111111111111111` to writable.

---

## Key Findings from DeepWiki Analysis

1. **SDK explicitly marks System Program as read-only:**
   In `sdk-libs/sdk/src/cpi/v2/accounts.rs`, the `to_account_metas` function sets `is_writable: false` for System Program.

2. **Error happens during CPI invoke:**
   The error occurs when our program invokes the Light System Program, which then internally tries to escalate System Program's privileges.

3. **Test infrastructure is different:**
   Light Protocol tests use `LightProgramTest`, `TestIndexer`, and special mock accounts that may configure accounts differently than devnet.

4. **Possible SDK bug or version mismatch:**
   The SDK might have an issue with V2 CPI when creating new addresses, or we need a different version.

---

## Request for Help

We've built a complete, minimal reproducer demonstrating this issue. We need help from the Light Protocol team to understand:

1. Is this a known limitation or bug?
2. Is there a workaround?
3. What SDK version/configuration is required?

### Recommended Next Steps

**Option A: File GitHub Issue**
File at https://github.com/Lightprotocol/light-protocol with this reproducer.

**Option B: Use TypeScript SDK Directly**
Skip custom Anchor CPI and use `@lightprotocol/stateless.js` SDK functions directly.

**Option C: Try Without New Addresses**
Create compressed accounts WITHOUT `with_new_addresses()` - let Light Protocol assign addresses automatically.

**Option D: Reach Out on Discord**
https://discord.gg/lightprotocol - share reproducer for direct debugging.

---

## Resources

- [Light Protocol GitHub](https://github.com/Lightprotocol/light-protocol)
- [Light Protocol Documentation](https://docs.lightprotocol.com)
- [Anchor Book](https://book.anchor-lang.com)
- [Light Protocol Discord](https://discord.gg/lightprotocol)

---

## Sharing This Reproducer

1. Zip the entire `reproducer/` directory
2. Include transaction signature from failed attempt
3. Reference this README for context
4. Share the specific error message and logs
