import React, { useState, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { MintForm } from '../components/MintForm';
import { NFTPreview } from '../components/NFTPreview';
import { LogPanel, LogEntry } from '../components/LogPanel';

export default function Home() {
  const { publicKey, connected } = useWallet();

  // NFT preview state
  const [nftName, setNftName] = useState('Test Compressed NFT');
  const [nftSymbol, setNftSymbol] = useState('TCNFT');
  const [nftImage, setNftImage] = useState<string | null>(null);

  // Log state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logId, setLogId] = useState(0);

  const addLog = useCallback(
    (message: string, type: 'info' | 'success' | 'error' | 'debug' = 'info') => {
      setLogs((prev) => [
        ...prev,
        {
          id: logId,
          timestamp: new Date(),
          message,
          type,
        },
      ]);
      setLogId((prev) => prev + 1);
    },
    [logId]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f0f1a',
        color: '#e2e8f0',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #1a1a2e',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>
            Light Protocol V2 CPI Reproducer
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
            Demonstrates correct remaining_accounts ordering for V2 CPI calls
          </p>
        </div>
        <WalletMultiButton />
      </header>

      {/* Connection Status */}
      {connected && publicKey && (
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#16213e',
            borderBottom: '1px solid #1a1a2e',
            fontSize: '13px',
          }}
        >
          <span style={{ color: '#34d399' }}>Connected: </span>
          <span style={{ color: '#a0aec0', fontFamily: 'monospace' }}>
            {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
          </span>
          <span style={{ marginLeft: '16px', color: '#666' }}>Network: Devnet</span>
        </div>
      )}

      {/* Main Content */}
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          padding: '24px',
          maxWidth: '1400px',
          margin: '0 auto',
          minHeight: 'calc(100vh - 140px)',
        }}
      >
        {/* Left Column - NFT Preview & Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <NFTPreview imageUrl={nftImage} name={nftName} symbol={nftSymbol} />
          <MintForm
            onNameChange={setNftName}
            onSymbolChange={setNftSymbol}
            onImageChange={setNftImage}
            onLog={addLog}
          />
        </div>

        {/* Right Column - Log Panel */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <LogPanel logs={logs} onClear={clearLogs} />
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: '16px 24px',
          borderTop: '1px solid #1a1a2e',
          textAlign: 'center',
          fontSize: '12px',
          color: '#666',
        }}
      >
        <p style={{ margin: '0 0 8px 0' }}>
          Light Protocol V2 CPI Reproducer - Demonstrating correct account ordering
        </p>
        <p style={{ margin: 0 }}>
          <strong>Fix:</strong> Fee Payer must be at remaining_accounts[0], not cpi_authority
        </p>
      </footer>
    </div>
  );
}
