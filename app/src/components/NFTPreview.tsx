import React from 'react';

interface NFTPreviewProps {
  imageUrl: string | null;
  name: string;
  symbol: string;
}

export function NFTPreview({ imageUrl, name, symbol }: NFTPreviewProps) {
  // Generate a placeholder gradient if no image
  const placeholderStyle = !imageUrl
    ? {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }
    : {};

  return (
    <div
      style={{
        backgroundColor: '#1a1a2e',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '320px',
      }}
    >
      {/* NFT Image */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '16px',
          ...placeholderStyle,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name || 'NFT Preview'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{ color: '#fff', fontSize: '48px', opacity: 0.5 }}>?</div>
        )}
      </div>

      {/* NFT Info */}
      <div style={{ color: '#e2e8f0' }}>
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#fff',
          }}
        >
          {name || 'Untitled NFT'}
        </h3>
        <div
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            backgroundColor: '#2d3748',
            borderRadius: '16px',
            fontSize: '12px',
            color: '#a0aec0',
          }}
        >
          {symbol || 'NFT'}
        </div>
      </div>

      {/* Compression Badge */}
      <div
        style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#16213e',
          borderRadius: '8px',
          border: '1px solid #333',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#34d399',
          }}
        >
          <span style={{ fontSize: '16px' }}>ZK</span>
          <span>Light Protocol Compressed</span>
        </div>
        <div
          style={{
            marginTop: '8px',
            fontSize: '11px',
            color: '#666',
          }}
        >
          Uses V2 CPI with correct account ordering
        </div>
      </div>
    </div>
  );
}

export default NFTPreview;
