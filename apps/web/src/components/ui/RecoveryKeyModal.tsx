import { useState } from 'react';
import { Modal } from './Modal';
import { useAuthStore } from '../../store/authStore';

export function RecoveryKeyModal() {
  const recoveryKey = useAuthStore((s) => s.recoveryKey);
  const dismissRecoveryKey = useAuthStore((s) => s.dismissRecoveryKey);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!recoveryKey) return null;

  // Split mnemonic into word array for grid display
  const words = recoveryKey.includes(' ') ? recoveryKey.split(/\s+/) : null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={true} onClose={() => {}} title="Save Your Recovery Phrase">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-sm text-nb-red font-bold">
          This is your encryption key. Without it, your data CANNOT be recovered. Not by us, not by
          anyone. Write it down and store it safely.
        </p>

        <div className="relative">
          {words ? (
            <div
              data-ph-mask
              className="grid grid-cols-3 gap-2 p-4 border-3 border-nb-border bg-nb-surface"
            >
              {words.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1.5 border-2 border-nb-border/50 bg-nb-bg"
                >
                  <span className="font-mono text-[10px] text-nb-muted w-5 text-right select-none">
                    {i + 1}.
                  </span>
                  <span className="font-mono text-sm text-nb-text">{word}</span>
                </div>
              ))}
            </div>
          ) : (
            <pre
              data-ph-mask
              className="w-full p-4 border-3 border-nb-border bg-nb-surface font-mono text-base text-nb-text break-all whitespace-pre-wrap select-all"
            >
              {recoveryKey}
            </pre>
          )}
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-3 py-1 border-2 border-nb-border bg-nb-bg font-mono text-xs text-nb-muted hover:text-nb-text hover:border-nb-lime cursor-pointer transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 accent-[#C4F53A] size-4"
          />
          <span className="font-mono text-sm text-nb-muted">
            I have written down my recovery phrase in a safe place
          </span>
        </label>

        <button
          onClick={dismissRecoveryKey}
          disabled={!confirmed}
          className="w-full py-3 border-3 border-nb-lime bg-nb-lime font-display text-sm font-bold uppercase tracking-wider text-black hover:bg-nb-lime/80 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          Continue
        </button>
      </div>
    </Modal>
  );
}
