import { Connection, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { createRpc, bn, hashvToBn254FieldSizeBe } from '@lightprotocol/stateless.js';
import { buildV2RemainingAccounts, logRemainingAccounts, SYSTEM_PROGRAM, ADDRESS_TREE } from './light-accounts';

// Program ID - replace after deployment
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || 'FqnkaXZkLJfMZbrx36qBnuSZcJAaktguuhp32mqmAKAo'
);

export interface MintResult {
  signature: string;
  success: boolean;
  error?: string;
}

export type LogCallback = (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;

/**
 * Compute Anchor instruction discriminator using Web Crypto API
 * This is sha256("global:<instruction_name>")[0..8]
 */
async function computeDiscriminator(instructionName: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${instructionName}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer).slice(0, 8);
}

/**
 * Serialize a string for Borsh encoding
 * Format: 4 bytes length (u32 LE) + string bytes
 */
function serializeString(str: string): Buffer {
  const bytes = Buffer.from(str, 'utf-8');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([lengthBuf, bytes]);
}

/**
 * Serialize a fixed-size byte array for Borsh encoding
 */
function serializeBytes(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

/**
 * Serialize a u16 for Borsh encoding (little-endian)
 */
function serializeU16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value, 0);
  return buf;
}

/**
 * Serialize a u8 for Borsh encoding
 */
function serializeU8(value: number): Buffer {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(value, 0);
  return buf;
}

/**
 * Get validity proof from Photon RPC for creating a new address
 */
async function getValidityProofForNewAddress(
  addressSeed: Uint8Array,
  addressTreePubkey: PublicKey,
  log: LogCallback
): Promise<{
  proof: { a: Uint8Array; b: Uint8Array; c: Uint8Array };
  rootIndex: number;
}> {
  log('Fetching validity proof from Photon RPC...', 'info');

  try {
    // Get RPC endpoints from environment
    // IMPORTANT: API key must be included in ALL endpoints for Helius compression API
    const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    if (!heliusApiKey || heliusApiKey === 'YOUR_HELIUS_API_KEY_HERE') {
      throw new Error('Missing NEXT_PUBLIC_HELIUS_API_KEY in .env.local - get a free key at https://dev.helius.xyz/');
    }
    const solanaRpcUrl = `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const photonApiUrl = `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    const proverUrl = `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;

    log(`Using Helius RPC with compression API`, 'debug');

    // Create Light Protocol RPC client with all three endpoints
    const rpc = createRpc(solanaRpcUrl, photonApiUrl, proverUrl);

    // V2 address derivation: hash(seed, tree, programId)
    // This must match on-chain derive_address(seed, tree, program_id)
    // Ensure all inputs are Uint8Array
    const seedBytes = Uint8Array.from(addressSeed);
    const treeBytes = Uint8Array.from(addressTreePubkey.toBytes());
    const programBytes = Uint8Array.from(PROGRAM_ID.toBytes());

    log(`V2 derivation inputs:`, 'debug');
    log(`  seed: ${Buffer.from(seedBytes).toString('hex')}`, 'debug');
    log(`  tree: ${Buffer.from(treeBytes).toString('hex')}`, 'debug');
    log(`  programId: ${Buffer.from(programBytes).toString('hex')}`, 'debug');

    const derivedAddressBytes = hashvToBn254FieldSizeBe([seedBytes, treeBytes, programBytes]);
    const derivedAddressPubkey = new PublicKey(derivedAddressBytes);

    // Convert the derived address to a BN254 value for the proof
    const newAddress = bn(derivedAddressBytes);

    log(`Derived address bytes: ${Buffer.from(derivedAddressBytes).toString('hex')}`, 'debug');
    log(`Derived address: ${derivedAddressPubkey.toBase58()}`, 'debug');
    log(`Address tree: ${addressTreePubkey.toBase58()}`, 'debug');
    // For V2 batch address trees, the queue IS the tree itself (integrated queue)
    log(`Address queue: ${addressTreePubkey.toBase58()} (same as tree for V2)`, 'debug');

    // Get validity proof for the new address (proves non-existence)
    // For V2 getValidityProofV0, we need to pass objects with { address, tree, queue }
    log('Calling getValidityProofV0...', 'debug');

    // Use getValidityProofV0 with proper format
    // IMPORTANT: For V2 address trees, queue = tree (integrated queue)
    const validityProof = await rpc.getValidityProofV0(
      [], // No existing account hashes
      [
        {
          address: newAddress,
          tree: addressTreePubkey,
          queue: addressTreePubkey,  // V2 address tree has integrated queue (same pubkey)
        }
      ]
    );

    if (!validityProof) {
      throw new Error('Failed to get validity proof from RPC');
    }

    log('Validity proof obtained successfully', 'success');

    // Debug: Log raw proof structure
    log(`Raw proof keys: ${Object.keys(validityProof).join(', ')}`, 'debug');
    log(`Root indices: ${JSON.stringify(validityProof.rootIndices)}`, 'debug');
    log(`Roots: ${validityProof.roots?.map((r: any) => r.toString(16).slice(0, 16) + '...').join(', ') || 'none'}`, 'debug');
    log(`Leaves: ${validityProof.leaves?.map((l: any) => l.toString(16).slice(0, 16) + '...').join(', ') || 'none'}`, 'debug');
    log(`Leaf indices: ${JSON.stringify(validityProof.leafIndices)}`, 'debug');
    log(`Tree infos: ${JSON.stringify(validityProof.treeInfos?.map((t: any) => t.tree?.toBase58?.() || t))}`, 'debug');

    // Check compressedProof structure
    const cp = validityProof.compressedProof;
    if (cp) {
      log(`Compressed proof keys: ${Object.keys(cp).join(', ')}`, 'debug');
      log(`Proof A length: ${cp.a?.length || 'undefined'}`, 'debug');
      log(`Proof B length: ${cp.b?.length || 'undefined'}`, 'debug');
      log(`Proof C length: ${cp.c?.length || 'undefined'}`, 'debug');
      log(`Proof A first 8 bytes: ${Buffer.from(cp.a || []).slice(0, 8).toString('hex')}`, 'debug');
    } else {
      log('WARNING: compressedProof is null/undefined!', 'error');
    }

    // Extract proof components
    const proof = {
      a: new Uint8Array(cp?.a || new Array(32).fill(0)),
      b: new Uint8Array(cp?.b || new Array(64).fill(0)),
      c: new Uint8Array(cp?.c || new Array(32).fill(0)),
    };

    // Get the correct root index for addresses (may be different from state tree)
    const addressRootIndex = validityProof.rootIndices?.[0] || 0;
    log(`Using root index: ${addressRootIndex}`, 'debug');

    return {
      proof,
      rootIndex: addressRootIndex,
    };
  } catch (error: any) {
    log(`Failed to get validity proof: ${error.message}`, 'error');

    // Log more details about the error
    if (error.response) {
      log(`Response status: ${error.response.status}`, 'debug');
    }

    log('Using empty proof (will likely fail on-chain)', 'debug');

    // Return empty proof as fallback
    return {
      proof: {
        a: new Uint8Array(32).fill(0),
        b: new Uint8Array(64).fill(0),
        c: new Uint8Array(32).fill(0),
      },
      rootIndex: 0,
    };
  }
}

/**
 * Build the create_compressed_nft instruction data with proof
 */
async function buildInstructionData(
  name: string,
  symbol: string,
  uri: string,
  proofA: Uint8Array,
  proofB: Uint8Array,
  proofC: Uint8Array,
  addressTreeRootIndex: number,
  addressTreeAccountIndex: number,
  outputQueueIndex: number,
  addressSeed: Uint8Array
): Promise<Buffer> {
  const discriminator = await computeDiscriminator('create_compressed_nft');
  const nameData = serializeString(name);
  const symbolData = serializeString(symbol);
  const uriData = serializeString(uri);
  const proofAData = serializeBytes(proofA);
  const proofBData = serializeBytes(proofB);
  const proofCData = serializeBytes(proofC);
  const rootIndexData = serializeU16(addressTreeRootIndex);
  const treeAccountIndexData = serializeU8(addressTreeAccountIndex);
  const outputQueueIndexData = serializeU8(outputQueueIndex);
  const addressSeedData = serializeBytes(addressSeed);

  return Buffer.concat([
    Buffer.from(discriminator),
    nameData,
    symbolData,
    uriData,
    proofAData,
    proofBData,
    proofCData,
    rootIndexData,
    treeAccountIndexData,
    outputQueueIndexData,
    addressSeedData,
  ]);
}

/**
 * Create a compressed NFT using Light Protocol V2 CPI
 */
export async function createCompressedNFT(
  connection: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  name: string,
  symbol: string,
  uri: string,
  onLog?: LogCallback
): Promise<MintResult> {
  const log = onLog || console.log;

  try {
    log('Starting compressed NFT creation...', 'info');
    log(`Name: ${name}, Symbol: ${symbol}`, 'debug');
    log(`URI: ${uri.slice(0, 50)}...`, 'debug');

    // Build remaining accounts in V2 order
    log('Building V2 remaining_accounts...', 'info');
    const remainingAccounts = buildV2RemainingAccounts(wallet.publicKey, PROGRAM_ID);
    logRemainingAccounts(remainingAccounts);

    // Log the critical fix
    log('V2 Account Order Applied (CORRECTED):', 'info');
    log('  [0] Light System Program (CPI target)', 'success');
    log('  [1] Fee Payer (signer, writable)', 'info');
    log('  [2] CPI Authority PDA', 'info');
    log('  [3] Registered Program PDA', 'info');
    log('  [4-6] Compression Auth, Program & System', 'info');
    log('  [7-9] Tree accounts (State, Address, Output)', 'info');

    // Generate unique address seed for this NFT
    // V2: Create seed by hashing raw inputs (without programId)
    const timestamp = Date.now();
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const seedInput = Buffer.concat([
      Buffer.from(name),
      wallet.publicKey.toBuffer(),
      Buffer.from(timestamp.toString()),
      Buffer.from(randomBytes),
    ]);
    // V2 seed derivation: hash the raw inputs (programId NOT included in seed)
    const addressSeed = hashvToBn254FieldSizeBe([seedInput]);

    log(`Generated address seed: ${Buffer.from(addressSeed).toString('hex').slice(0, 16)}...`, 'debug');

    // Get validity proof from Photon RPC
    const { proof, rootIndex } = await getValidityProofForNewAddress(
      addressSeed,
      ADDRESS_TREE,
      log
    );

    log('Building transaction with validity proof...', 'info');

    // Remaining accounts indices (V2 CORRECT ORDER):
    // [0] Light System Program, [1] Fee Payer, [2] CPI Authority, [3] Registered PDA,
    // [4] Compression Auth, [5] Compression Program, [6] System Program,
    // [7] State Tree, [8] Address Tree, [9] Output Queue
    const ADDRESS_TREE_ACCOUNT_INDEX = 8;
    const OUTPUT_QUEUE_INDEX = 9;  // V2 batch trees: output queue for state writes
    log(`Address tree account index: ${ADDRESS_TREE_ACCOUNT_INDEX}`, 'debug');
    log(`Output queue index: ${OUTPUT_QUEUE_INDEX}`, 'debug');

    // Build instruction data with proof
    const data = await buildInstructionData(
      name,
      symbol,
      uri,
      proof.a,
      proof.b,
      proof.c,
      rootIndex,
      ADDRESS_TREE_ACCOUNT_INDEX,
      OUTPUT_QUEUE_INDEX,
      addressSeed
    );

    // Log discriminator for debugging
    const discriminator = data.slice(0, 8);
    log(`Instruction discriminator: ${Buffer.from(discriminator).toString('hex')}`, 'debug');

    // Build account keys for the instruction
    // Anchor expects: user (signer), systemProgram, then remaining_accounts
    const keys = [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },  // System Program always read-only
      ...remainingAccounts,
    ];

    // Create the instruction
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data,
    });

    // Create transaction with increased compute budget
    // Light Protocol V2 CPI requires ~400k+ compute units for proof verification
    const tx = new Transaction();

    // Add compute budget instruction FIRST
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 500_000, // 500k CUs for proof verification
    });
    tx.add(computeBudgetIx);
    tx.add(ix);

    log('Requesting 500,000 compute units for proof verification', 'debug');

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    log('Requesting wallet signature...', 'info');

    // Sign transaction
    const signedTx = await wallet.signTransaction(tx);

    log('Sending transaction to network...', 'info');

    // Send and confirm
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    log(`Transaction sent: ${signature}`, 'info');
    log('Waiting for confirmation...', 'info');

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    );

    if (confirmation.value.err) {
      const errorMsg = JSON.stringify(confirmation.value.err);
      log(`Transaction failed: ${errorMsg}`, 'error');
      return {
        signature,
        success: false,
        error: errorMsg,
      };
    }

    log('Transaction confirmed!', 'success');
    log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`, 'success');

    return {
      signature,
      success: true,
    };
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    log(`Error: ${errorMsg}`, 'error');

    // Check for specific error types
    if (errorMsg.includes('signer privilege escalated')) {
      log('This is the original bug! Check remaining_accounts order.', 'error');
      log('Expected V2 order: feePayer at [0], not cpiAuthority', 'error');
    }

    if (error.logs) {
      log('Program logs:', 'debug');
      error.logs.forEach((line: string) => log(`  ${line}`, 'debug'));
    }

    return {
      signature: '',
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Check if a program is registered with Light Protocol
 */
export async function checkProgramRegistration(
  connection: Connection,
  programId: PublicKey
): Promise<boolean> {
  try {
    const [registeredPda] = PublicKey.findProgramAddressSync(
      [programId.toBuffer()],
      new PublicKey('compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq')
    );

    const account = await connection.getAccountInfo(registeredPda);
    return account !== null;
  } catch {
    return false;
  }
}
