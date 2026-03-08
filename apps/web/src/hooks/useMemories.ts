import { useEffect } from 'react';
import { useMemoryStore } from '../store/memoryStore';
import { useMemoryBankStore } from '../store/memoryBankStore';

export function useMemories() {
  const store = useMemoryStore();
  const filtered = store.getFiltered();
  const activeMemoryBankId = useMemoryBankStore((s) => s.activeMemoryBankId);

  useEffect(() => {
    store.loadMemories();
    store.connectWs();
  }, [activeMemoryBankId]);

  return { ...store, filtered };
}
