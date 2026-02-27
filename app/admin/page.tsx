'use client';

import { useEffect, useState } from 'react';
import { FeedConfig } from '@/lib/bonafied/types';

const CATEGORY_OPTIONS = [
  { label: 'Business', value: 'BUSINESS' },
  { label: 'Technology', value: 'TECHNOLOGY' },
  { label: 'Music Industry', value: 'MUSIC_INDUSTRY' },
  { label: 'Podcast / Creator', value: 'PODCAST_CREATOR' }
] as const;

export default function AdminPage() {
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: '',
    url: '',
    category: 'BUSINESS',
    credibilityScore: 0.75,
    active: true
  });

  const loadFeeds = async () => {
    const response = await fetch('/api/feeds', { cache: 'no-store' });
    const data = await response.json();
    setFeeds(data.feeds || []);
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadFeeds();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const createFeed = async () => {
    setMessage('Saving feed...');
    const response = await fetch('/api/feeds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...form,
        credibilityScore: Number(form.credibilityScore)
      })
    });

    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error || 'Could not add feed');
      return;
    }

    await loadFeeds();
    setMessage('Feed added.');
    setForm({
      name: '',
      url: '',
      category: form.category,
      credibilityScore: 0.75,
      active: true
    });
  };

  const toggleFeedActive = async (feed: FeedConfig) => {
    await fetch(`/api/feeds/${feed.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ active: !feed.active })
    });

    await loadFeeds();
  };

  const runIngestion = async () => {
    setMessage('Running ingestion...');
    const response = await fetch('/api/ingest', {
      method: 'POST'
    });
    const data = await response.json();
    setMessage(
      `Ingestion complete: +${data.ingestedStories || 0} stories, ${data.clusteredSignals || 0} clusters (${data.ingestedAt}).`
    );
  };

  return (
    <div className="admin-wrap">
      <h1 style={{ fontSize: 32, marginTop: 0, letterSpacing: '-0.02em' }}>BONAFIED Admin</h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
        Configure RSS feeds and run ingestion for THE WIRE.
      </p>

      <section className="admin-card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Feed Configuration</h2>
          <button className="small-btn primary" onClick={() => void runIngestion()}>
            Ingest Now
          </button>
        </div>

        <div className="admin-form">
          <input
            placeholder="Feed Name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            placeholder="RSS URL"
            value={form.url}
            onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
          />

          <select
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as typeof form.category }))}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={form.credibilityScore}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                credibilityScore: Number(event.target.value)
              }))
            }
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <button className="small-btn" onClick={() => void createFeed()}>
            Add Feed
          </button>
        </div>

        {message ? <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>{message}</div> : null}

        {loading ? (
          <div style={{ marginTop: 18, color: 'var(--text-tertiary)' }}>Loading feeds...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Credibility</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => (
                <tr key={feed.id}>
                  <td>
                    {feed.name}
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4 }}>{feed.url}</div>
                  </td>
                  <td>{feed.category}</td>
                  <td>{feed.credibilityScore.toFixed(2)}</td>
                  <td>{feed.active ? 'Yes' : 'No'}</td>
                  <td>
                    <button className="small-btn" onClick={() => void toggleFeedActive(feed)}>
                      {feed.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
