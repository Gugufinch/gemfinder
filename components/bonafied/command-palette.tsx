'use client';

import { useEffect, useRef } from 'react';
import { SearchResult } from '@/lib/bonafied/types';

interface CommandPaletteProps {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  results: SearchResult[];
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}

export function CommandPalette({
  open,
  query,
  onQueryChange,
  results,
  onClose,
  onSelect
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="command-overlay" onClick={onClose}>
      <div className="command-shell" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-input"
          placeholder="Search stories, entities, topics..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />

        <div className="command-list">
          {results.length ? (
            results.map((result) => (
              <button key={result.id} className="command-item" onClick={() => onSelect(result)}>
                <div>{result.title}</div>
                <div className="command-sub">
                  {result.type.toUpperCase()} • {result.subtitle}
                </div>
              </button>
            ))
          ) : (
            <div className="command-item" style={{ cursor: 'default' }}>
              <div>No matching signals</div>
              <div className="command-sub">Try source names, entities, or category terms.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
