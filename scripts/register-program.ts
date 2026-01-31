/**
 * Light Protocol V2 - Self-Service Program Registration
 *
 * This script registers a program with Light Protocol by:
 * 1. Creating a GroupAuthority (if needed)
 * 2. Registering the program to that group
 *
 * Based on Light Protocol's initialize_group_authority + register_program_to_group
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Light Protocol Constants (Devnet)
const ACCOUNT_COMPRESSION_PROGRAM = new PublicKey('compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq');
const LIGHT_SYSTEM_PROGRAM = new PublicKey('H5sFv8VwWmjxHYS2GB4fTDsK7uTtnRT4WiixtHrET3bN');

// Devnet RPC
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com';

// Instruction discriminators (from Light Protocol IDL)
// These are the first 8 bytes of sha256("global:<instruction_name>")
const INITIALIZE_GROUP_AUTHORITY_DISCRIMINATOR = Buffer.from([
  0x7b, 0xed, 0xa1, 0x50, 0xea, 0xd7, 0x43, 0xb7 // initialize_group_authority
]);

const REGISTER_PROGRAM_TO_GROUP_DISCRIMINATOR = Buffer.from([
  0xe1, 0x56, 0xcf, 0xd3, 0x15, 0x01, 0x2e, 0x19 // register_program_to_group
]);

// Optional: Set these if you have an existing Group Authority you want to reuse
// Otherwise, the script will create a new one
const EXISTING_GROUP_AUTHORITY_PDA: PublicKey | null = null;
const EXISTING_SEED_PUBKEY: PublicKey | null = null;

async function loadKeypair(keypairPath?: string): Promise<Keypair> {
  const defaultPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const filePath = keypairPath || defaultPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Keypair file not found: ${filePath}`);
  }

  const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

async function loadProgramKeypair(): Promise<Keypair> {
  const possiblePaths = [
    path.join(process.cwd(), 'anchor', 'target', 'deploy', 'light_nft_reproducer-keypair.json'),
    path.join(process.cwd(), '..', 'anchor', 'target', 'deploy', 'light_nft_reproducer-keypair.json'),
    path.join(process.cwd(), 'target', 'deploy', 'light_nft_reproducer-keypair.json'),
  ];

  for (const keypairPath of possiblePaths) {
    if (fs.existsSync(keypairPath)) {
      console.log(`  Found program keypair at: ${keypairPath}`);
      const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      return Keypair.fromSecretKey(new Uint8Array(secretKey));
    }
  }

  throw new Error('Program keypair not found. Run `anchor build` first.');
}

function deriveGroupAuthorityPda(seed: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('group_authority'), seed.toBuffer()],
    ACCOUNT_COMPRESSION_PROGRAM
  );
}

function deriveRegisteredProgramPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    ACCOUNT_COMPRESSION_PROGRAM
  );
}

function deriveCpiAuthorityPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('cpi_authority')],
    programId
  );
}

async function checkGroupAuthorityExists(
  connection: Connection,
  groupAuthorityPda: PublicKey
): Promise<boolean> {
  const account = await connection.getAccountInfo(groupAuthorityPda);
  return account !== null;
}

async function checkProgramRegistered(
  connection: Connection,
  registeredProgramPda: PublicKey
): Promise<boolean> {
  const account = await connection.getAccountInfo(registeredProgramPda);
  return account !== null;
}

/**
 * Create instruction for initialize_group_authority
 */
function createInitializeGroupAuthorityInstruction(
  authority: PublicKey,
  seed: PublicKey,
  groupAuthorityPda: PublicKey,
): TransactionInstruction {
  // Instruction data: discriminator + authority pubkey
  const data = Buffer.concat([
    INITIALIZE_GROUP_AUTHORITY_DISCRIMINATOR,
    authority.toBuffer(),
  ]);

  return new TransactionInstruction({
    programId: ACCOUNT_COMPRESSION_PROGRAM,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: seed, isSigner: true, isWritable: false },
      { pubkey: groupAuthorityPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Create instruction for register_program_to_group
 */
function createRegisterProgramToGroupInstruction(
  authority: PublicKey,
  programToBeRegistered: PublicKey,
  registeredProgramPda: PublicKey,
  groupAuthorityPda: PublicKey,
): TransactionInstruction {
  // Instruction data: just the discriminator
  const data = REGISTER_PROGRAM_TO_GROUP_DISCRIMINATOR;

  return new TransactionInstruction({
    programId: ACCOUNT_COMPRESSION_PROGRAM,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: programToBeRegistered, isSigner: true, isWritable: false },
      { pubkey: registeredProgramPda, isSigner: false, isWritable: true },
      { pubkey: groupAuthorityPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('Light Protocol V2 - Self-Service Program Registration');
  console.log('='.repeat(60));
  console.log('');

  // Load authority keypair (payer)
  console.log('Loading authority keypair...');
  const authority = await loadKeypair();
  console.log(`  Authority: ${authority.publicKey.toBase58()}`);

  // Load program keypair
  console.log('Loading program keypair...');
  const programKeypair = await loadProgramKeypair();
  const programId = programKeypair.publicKey;
  console.log(`  Program ID: ${programId.toBase58()}`);
  console.log('');

  // Connect to Solana
  console.log(`Connecting to ${RPC_ENDPOINT}...`);
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`  Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  if (balance < 0.1 * 1e9) {
    console.log('');
    console.log('Insufficient balance. Requesting airdrop...');
    try {
      const sig = await connection.requestAirdrop(authority.publicKey, 2 * 1e9);
      await connection.confirmTransaction(sig);
      console.log('  Airdrop successful!');
    } catch (e) {
      console.error('  Airdrop failed. Please fund your wallet manually.');
      process.exit(1);
    }
  }
  console.log('');

  // Generate a seed keypair for the group authority
  // Using authority pubkey as seed ensures deterministic group per authority
  const seedKeypair = Keypair.generate();
  console.log(`  Seed for group: ${seedKeypair.publicKey.toBase58()}`);

  // Derive PDAs
  const [groupAuthorityPda, groupBump] = deriveGroupAuthorityPda(seedKeypair.publicKey);
  const [registeredProgramPda, registeredBump] = deriveRegisteredProgramPda(programId);
  const [cpiAuthorityPda, cpiBump] = deriveCpiAuthorityPda(programId);

  console.log('Derived PDAs:');
  console.log(`  Group Authority PDA: ${groupAuthorityPda.toBase58()} (bump: ${groupBump})`);
  console.log(`  Registered Program PDA: ${registeredProgramPda.toBase58()} (bump: ${registeredBump})`);
  console.log(`  CPI Authority PDA: ${cpiAuthorityPda.toBase58()} (bump: ${cpiBump})`);
  console.log('');

  // Check if program is already registered
  console.log('Checking registration status...');
  const isRegistered = await checkProgramRegistered(connection, registeredProgramPda);

  if (isRegistered) {
    console.log('');
    console.log('='.repeat(60));
    console.log('PROGRAM ALREADY REGISTERED!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Registration details:');
    console.log(`  Program ID: ${programId.toBase58()}`);
    console.log(`  Registered PDA: ${registeredProgramPda.toBase58()}`);
    console.log('');
    console.log('You can proceed to test the CPI:');
    console.log('  cd reproducer/app && yarn install && yarn dev');
    return;
  }

  console.log('  Program is NOT registered. Proceeding with registration...');
  console.log('');

  // Check if we should use an existing group authority
  let useExistingGroup = false;
  if (EXISTING_GROUP_AUTHORITY_PDA) {
    useExistingGroup = await checkGroupAuthorityExists(connection, EXISTING_GROUP_AUTHORITY_PDA);
  }
  let groupAuthorityToUse: PublicKey;

  if (useExistingGroup && EXISTING_GROUP_AUTHORITY_PDA) {
    console.log('Step 1: Using existing Group Authority...');
    console.log(`  Group Authority: ${EXISTING_GROUP_AUTHORITY_PDA.toBase58()}`);
    groupAuthorityToUse = EXISTING_GROUP_AUTHORITY_PDA;
  } else {
    // Step 1: Initialize new Group Authority
    console.log('Step 1: Initializing new Group Authority...');

    const initGroupIx = createInitializeGroupAuthorityInstruction(
      authority.publicKey,
      seedKeypair.publicKey,
      groupAuthorityPda,
    );

    const initGroupTx = new Transaction().add(initGroupIx);

    try {
      const initSig = await sendAndConfirmTransaction(
        connection,
        initGroupTx,
        [authority, seedKeypair],
        { commitment: 'confirmed' }
      );
      console.log(`  Group Authority initialized!`);
      console.log(`  Signature: ${initSig}`);
      console.log(`  Explorer: https://explorer.solana.com/tx/${initSig}?cluster=devnet`);
      groupAuthorityToUse = groupAuthorityPda;
    } catch (e: any) {
      if (e.message?.includes('already in use')) {
        console.log('  Group Authority already exists, using it...');
        groupAuthorityToUse = groupAuthorityPda;
      } else {
        console.error('  Failed to initialize group authority:', e.message);
        throw e;
      }
    }
  }
  console.log('');

  // Step 2: Register Program to Group
  console.log('Step 2: Registering program to group...');
  console.log(`  Using Group Authority: ${groupAuthorityToUse.toBase58()}`);

  const registerIx = createRegisterProgramToGroupInstruction(
    authority.publicKey,
    programId,
    registeredProgramPda,
    groupAuthorityToUse,
  );

  const registerTx = new Transaction().add(registerIx);

  try {
    const registerSig = await sendAndConfirmTransaction(
      connection,
      registerTx,
      [authority, programKeypair], // Program keypair must sign!
      { commitment: 'confirmed' }
    );
    console.log(`  Program registered successfully!`);
    console.log(`  Signature: ${registerSig}`);
    console.log(`  Explorer: https://explorer.solana.com/tx/${registerSig}?cluster=devnet`);
  } catch (e: any) {
    console.error('  Failed to register program:', e.message);
    if (e.logs) {
      console.log('  Logs:');
      e.logs.forEach((log: string) => console.log(`    ${log}`));
    }
    throw e;
  }
  console.log('');

  // Verify registration
  console.log('Verifying registration...');
  const verified = await checkProgramRegistered(connection, registeredProgramPda);

  if (verified) {
    console.log('');
    console.log('='.repeat(60));
    console.log('REGISTRATION SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Registration details:');
    console.log(`  Program ID: ${programId.toBase58()}`);
    console.log(`  Registered PDA: ${registeredProgramPda.toBase58()}`);
    console.log(`  Group Authority: ${groupAuthorityToUse.toBase58()}`);
    console.log(`  CPI Authority: ${cpiAuthorityPda.toBase58()}`);
    console.log('');
    console.log('Next steps:');
    console.log('  cd reproducer/app && yarn install && yarn dev');
  } else {
    console.error('Registration verification failed!');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
