import React, { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { createCompressedNFT, checkProgramRegistration, PROGRAM_ID } from '../lib/program';

interface MintFormProps {
  onNameChange: (name: string) => void;
  onSymbolChange: (symbol: string) => void;
  onImageChange: (url: string | null) => void;
  onLog: (message: string, type?: 'info' | 'success' | 'error' | 'debug') => void;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export function MintForm({ onNameChange, onSymbolChange, onImageChange, onLog }: MintFormProps) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [name, setName] = useState('Test Compressed NFT');
  const [symbol, setSymbol] = useState('TCNFT');
  const [uri, setUri] = useState('https://example.com/metadata.json');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, 32);
    setName(value);
    onNameChange(value);
  };

  const handleSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, 10);
    setSymbol(value);
    onSymbolChange(value);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE) {
      onLog(`Image too large: ${(file.size / 1024 / 1024).toFixed(2)}MB (max 5MB)`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreview(dataUrl);
      onImageChange(dataUrl);
      onLog(`Image loaded: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`, 'info');
    };
    reader.readAsDataURL(file);
  };

  const handleMint = useCallback(async () => {
    if (!publicKey || !signTransaction || !connected) {
      onLog('Please connect your wallet first', 'error');
      return;
    }

    setIsLoading(true);
    onLog('='.repeat(50), 'info');
    onLog('Starting Light Protocol V2 CPI Test', 'info');
    onLog('='.repeat(50), 'info');

    try {
      // Check if program is registered
      onLog('Checking program registration...', 'info');
      const isRegistered = await checkProgramRegistration(connection, PROGRAM_ID);
      if (!isRegistered) {
        onLog('Program may not be registered with Light Protocol', 'error');
        onLog('Run: npx ts-node scripts/register-program.ts', 'info');
      } else {
        onLog('Program registration confirmed', 'success');
      }

      // Create the NFT
      const result = await createCompressedNFT(
        connection,
        { publicKey, signTransaction },
        name,
        symbol,
        uri,
        onLog
      );

      if (result.success) {
        setLastSignature(result.signature);
        onLog('='.repeat(50), 'success');
        onLog('V2 CPI TEST PASSED!', 'success');
        onLog('No "signer privilege escalated" error!', 'success');
        onLog('='.repeat(50), 'success');
      } else {
        onLog('='.repeat(50), 'error');
        onLog('V2 CPI TEST FAILED', 'error');
        onLog(`Error: ${result.error}`, 'error');
        onLog('='.repeat(50), 'error');
      }
    } catch (error: any) {
      onLog(`Unexpected error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connected, connection, name, symbol, uri, onLog]);

  return (
    <div
      style={{
        backgroundColor: '#1a1a2e',
        borderRadius: '12px',
        padding: '24px',
      }}
    >
      <h2
        style={{
          margin: '0 0 24px 0',
          color: '#e2e8f0',
          fontSize: '20px',
          fontWeight: 600,
        }}
      >
        Mint Compressed NFT
      </h2>

      {/* Image Upload */}
      <div style={{ marginBottom: '20px' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            color: '#a0aec0',
            fontSize: '14px',
          }}
        >
          Image (optional, max 5MB)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: '#2d3748',
            border: '1px solid #4a5568',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '14px',
          }}
        />
      </div>

      {/* Name Input */}
      <div style={{ marginBottom: '20px' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            color: '#a0aec0',
            fontSize: '14px',
          }}
        >
          Name (max 32 chars)
        </label>
        <input
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="My Compressed NFT"
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#2d3748',
            border: '1px solid #4a5568',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#666' }}>
          {name.length}/32 characters
        </div>
      </div>

      {/* Symbol Input */}
      <div style={{ marginBottom: '20px' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            color: '#a0aec0',
            fontSize: '14px',
          }}
        >
          Symbol (max 10 chars)
        </label>
        <input
          type="text"
          value={symbol}
          onChange={handleSymbolChange}
          placeholder="NFT"
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#2d3748',
            border: '1px solid #4a5568',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#666' }}>
          {symbol.length}/10 characters
        </div>
      </div>

      {/* URI Input */}
      <div style={{ marginBottom: '24px' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            color: '#a0aec0',
            fontSize: '14px',
          }}
        >
          Metadata URI
        </label>
        <input
          type="text"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="https://example.com/metadata.json"
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#2d3748',
            border: '1px solid #4a5568',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Mint Button */}
      <button
        onClick={handleMint}
        disabled={!connected || isLoading}
        style={{
          width: '100%',
          padding: '16px',
          backgroundColor: connected && !isLoading ? '#6366f1' : '#4a5568',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 600,
          cursor: connected && !isLoading ? 'pointer' : 'not-allowed',
          transition: 'background-color 0.2s',
        }}
      >
        {!connected
          ? 'Connect Wallet First'
          : isLoading
          ? 'Minting...'
          : 'Mint Compressed NFT'}
      </button>

      {/* Last Transaction */}
      {lastSignature && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#16213e',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        >
          <div style={{ color: '#a0aec0', marginBottom: '4px' }}>Last Transaction:</div>
          <a
            href={`https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#60a5fa',
              textDecoration: 'none',
              wordBreak: 'break-all',
            }}
          >
            {lastSignature.slice(0, 20)}...{lastSignature.slice(-20)}
          </a>
        </div>
      )}

      {/* V2 Fix Info */}
      <div
        style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#1a2744',
          borderRadius: '8px',
          border: '1px solid #2d4a77',
          fontSize: '12px',
          color: '#a0aec0',
        }}
      >
        <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: '8px' }}>
          V2 CPI Fix Applied:
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
          <li>Fee Payer now at remaining_accounts[0]</li>
          <li>CPI Authority at [1] (was [0])</li>
          <li>Registered PDA at [2] (was [1])</li>
          <li>Cargo features: v2 + cpi-context</li>
        </ul>
      </div>
    </div>
  );
}

export default MintForm;
