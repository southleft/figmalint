import { useState, useCallback } from 'react';

interface SettingsPanelProps {
  hasApiKey: boolean;
  analysisMode: 'quick' | 'deep';
  backendAvailable: boolean;
  onSaveApiKey: (apiKey: string, provider: string) => void;
  onClearApiKey: () => void;
  onToggleMode: () => void;
  onClose: () => void;
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', label: 'Google AI', placeholder: 'AIza...' },
];

export default function SettingsPanel({
  hasApiKey,
  analysisMode,
  backendAvailable,
  onSaveApiKey,
  onClearApiKey,
  onToggleMode,
  onClose,
}: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(() => {
    if (!apiKey.trim()) return;
    setSaving(true);
    onSaveApiKey(apiKey.trim(), provider);
    setTimeout(() => {
      setSaving(false);
      setApiKey('');
    }, 500);
  }, [apiKey, provider, onSaveApiKey]);

  return (
    <div className="absolute inset-0 z-50 bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-12 font-medium">Settings</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-fg-tertiary hover:text-fg rounded-md hover:bg-bg-hover transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* API Key section */}
        <section className="space-y-2">
          <h3 className="text-11 font-medium text-fg-secondary uppercase tracking-wide">API Key</h3>

          {hasApiKey ? (
            <div className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-fg-success" />
                <span className="text-12 text-fg">Key configured</span>
              </div>
              <button
                onClick={onClearApiKey}
                className="text-11 text-fg-danger hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-1">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={`px-2 py-1 text-11 rounded-md transition-colors ${
                      provider === p.id
                        ? 'bg-bg-brand text-fg-onbrand'
                        : 'text-fg-secondary hover:bg-bg-hover'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={PROVIDERS.find(p => p.id === provider)?.placeholder}
                className="w-full px-2 py-1.5 text-12 bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-fg-brand"
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              />
              <button
                onClick={handleSave}
                disabled={!apiKey.trim() || saving}
                className="w-full py-1.5 text-12 font-medium bg-bg-brand text-fg-onbrand rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save API Key'}
              </button>
            </div>
          )}
        </section>

        {/* Analysis mode */}
        <section className="space-y-2">
          <h3 className="text-11 font-medium text-fg-secondary uppercase tracking-wide">Analysis Mode</h3>
          <button
            onClick={onToggleMode}
            className="w-full flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2"
          >
            <div>
              <p className="text-12 font-medium text-fg">{analysisMode === 'quick' ? 'Quick' : 'Deep'}</p>
              <p className="text-11 text-fg-tertiary">
                {analysisMode === 'quick'
                  ? 'Fast analysis, Refero loads in background'
                  : 'Full analysis with Refero comparison included'}
              </p>
            </div>
            <span className="text-11 text-fg-brand">Switch</span>
          </button>
        </section>

        {/* Backend status */}
        <section className="space-y-2">
          <h3 className="text-11 font-medium text-fg-secondary uppercase tracking-wide">Backend</h3>
          <div className="flex items-center gap-2 bg-bg-secondary rounded-lg px-3 py-2">
            <span className={`w-2 h-2 rounded-full ${backendAvailable ? 'bg-fg-success' : 'bg-fg-danger'}`} />
            <span className="text-12 text-fg">
              {backendAvailable ? 'Connected' : 'Unavailable'}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
