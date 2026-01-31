import React, { useRef, useEffect, useState } from 'react';

export interface LogEntry {
  id: number;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'debug';
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

const TYPE_STYLES: Record<string, { color: string; prefix: string }> = {
  info: { color: '#60a5fa', prefix: '[INFO]' },
  success: { color: '#34d399', prefix: '[OK]' },
  error: { color: '#f87171', prefix: '[ERROR]' },
  debug: { color: '#a78bfa', prefix: '[DEBUG]' },
};

export function LogPanel({ logs, onClear }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      // If user scrolls up, disable auto-scroll
      // If near bottom, re-enable
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  const copyLogs = () => {
    const text = logs
      .map((log) => {
        const time = log.timestamp.toISOString().slice(11, 23);
        const { prefix } = TYPE_STYLES[log.type];
        return `${time} ${prefix} ${log.message}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  const formatTime = (date: Date) => {
    return date.toISOString().slice(11, 23);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #333',
          backgroundColor: '#16213e',
        }}
      >
        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '14px', fontWeight: 600 }}>
          Transaction Logs
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={copyLogs}
            style={{
              padding: '4px 12px',
              backgroundColor: '#2d3748',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Copy
          </button>
          <button
            onClick={onClear}
            style={{
              padding: '4px 12px',
              backgroundColor: '#4a1a1a',
              color: '#f87171',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
          fontFamily: 'Monaco, Consolas, monospace',
          fontSize: '12px',
          lineHeight: '1.6',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            No logs yet. Connect wallet and mint to see logs.
          </div>
        ) : (
          logs.map((log) => {
            const style = TYPE_STYLES[log.type];
            return (
              <div key={log.id} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#666' }}>{formatTime(log.timestamp)} </span>
                <span style={{ color: style.color }}>{style.prefix} </span>
                <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Status bar */}
      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid #333',
          backgroundColor: '#16213e',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#666',
        }}
      >
        <span>{logs.length} entries</span>
        <span>{autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF (scroll to bottom to enable)'}</span>
      </div>
    </div>
  );
}

export default LogPanel;
