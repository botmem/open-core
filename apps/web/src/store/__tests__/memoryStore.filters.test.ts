import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMemoryStore } from '../memoryStore';

vi.mock('../../lib/api', () => ({
  api: {
    listMemories: vi.fn(),
    searchMemories: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      fallback: false,
    }),
    pinMemory: vi.fn(),
    unpinMemory: vi.fn(),
    recordRecall: vi.fn(),
    getGraphData: vi.fn(),
    getMemoryStats: vi.fn(),
    askMemories: vi.fn(),
  },
}));

vi.mock('../../lib/ws', () => ({
  sharedWs: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    onMessage: vi.fn(),
    offMessage: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../authStore', () => ({
  useAuthStore: Object.assign(
    (sel: (state: Record<string, unknown>) => unknown) =>
      sel({ accessToken: 'tok', user: { id: 'u1' } }),
    {
      getState: () => ({ accessToken: 'tok', user: { id: 'u1' }, refreshSession: vi.fn() }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}));

vi.mock('../memoryBankStore', () => ({
  useMemoryBankStore: Object.assign(
    (sel: (state: Record<string, unknown>) => unknown) => sel({ activeMemoryBankId: null }),
    { getState: () => ({ activeMemoryBankId: null }), setState: vi.fn(), subscribe: vi.fn() },
  ),
}));

vi.mock('../../lib/posthog', () => ({ trackEvent: vi.fn() }));

import { api } from '../../lib/api';

describe('memoryStore filters & conversation', () => {
  beforeEach(() => {
    useMemoryStore.getState().reset();
    vi.clearAllMocks();
  });

  describe('setMode', () => {
    it('sets mode to ask', () => {
      useMemoryStore.getState().setMode('ask');
      expect(useMemoryStore.getState().mode).toBe('ask');
    });

    it('sets mode to search', () => {
      useMemoryStore.getState().setMode('ask');
      useMemoryStore.getState().setMode('search');
      expect(useMemoryStore.getState().mode).toBe('search');
    });
  });

  describe('toggleFilter', () => {
    it('adds a filter value', () => {
      useMemoryStore.getState().toggleFilter('connectorTypes', 'gmail');
      expect(useMemoryStore.getState().activeFilters.connectorTypes).toContain('gmail');
    });

    it('removes a filter value when toggled again', () => {
      useMemoryStore.getState().toggleFilter('connectorTypes', 'gmail');
      useMemoryStore.getState().toggleFilter('connectorTypes', 'gmail');
      expect(useMemoryStore.getState().activeFilters.connectorTypes).not.toContain('gmail');
    });

    it('clears active preset', () => {
      useMemoryStore.setState({ activePreset: 'pinned' });
      useMemoryStore.getState().toggleFilter('sourceTypes', 'email');
      expect(useMemoryStore.getState().activePreset).toBeNull();
    });
  });

  describe('setTimeRange', () => {
    it('sets time range filter', () => {
      useMemoryStore.getState().setTimeRange('2026-01-01', '2026-03-01');
      const { timeRange } = useMemoryStore.getState().activeFilters;
      expect(timeRange.from).toBe('2026-01-01');
      expect(timeRange.to).toBe('2026-03-01');
    });

    it('clears active preset', () => {
      useMemoryStore.setState({ activePreset: 'facts_only' });
      useMemoryStore.getState().setTimeRange('2026-01-01', null);
      expect(useMemoryStore.getState().activePreset).toBeNull();
    });
  });

  describe('setPinnedFilter', () => {
    it('sets pinned filter', () => {
      useMemoryStore.getState().setPinnedFilter(true);
      expect(useMemoryStore.getState().activeFilters.pinned).toBe(true);
    });

    it('clears pinned filter', () => {
      useMemoryStore.getState().setPinnedFilter(true);
      useMemoryStore.getState().setPinnedFilter(null);
      expect(useMemoryStore.getState().activeFilters.pinned).toBeNull();
    });
  });

  describe('clearAllFilters', () => {
    it('resets all active filters', () => {
      useMemoryStore.getState().toggleFilter('connectorTypes', 'gmail');
      useMemoryStore.getState().setPinnedFilter(true);
      useMemoryStore.getState().clearAllFilters();
      const { activeFilters } = useMemoryStore.getState();
      expect(activeFilters.connectorTypes).toEqual([]);
      expect(activeFilters.pinned).toBeNull();
      expect(activeFilters.timeRange).toEqual({ from: null, to: null });
    });
  });

  describe('applyPreset', () => {
    it('applies a known preset', () => {
      useMemoryStore.getState().applyPreset('pinned');
      expect(useMemoryStore.getState().activePreset).toBe('pinned');
      expect(useMemoryStore.getState().activeFilters.pinned).toBe(true);
    });

    it('toggles off when same preset applied again', () => {
      useMemoryStore.getState().applyPreset('pinned');
      useMemoryStore.getState().applyPreset('pinned');
      expect(useMemoryStore.getState().activePreset).toBeNull();
    });

    it('ignores unknown preset', () => {
      useMemoryStore.getState().applyPreset('nonexistent');
      expect(useMemoryStore.getState().activePreset).toBeNull();
    });

    it('applies facts_only preset', () => {
      useMemoryStore.getState().applyPreset('facts_only');
      expect(useMemoryStore.getState().activeFilters.factualityLabels).toEqual(['FACT']);
    });
  });

  describe('clearConversation', () => {
    it('resets conversation state', () => {
      useMemoryStore.setState({
        conversation: {
          id: 'conv-1',
          messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 1 }],
          loading: true,
        },
      });
      useMemoryStore.getState().clearConversation();
      const { conversation } = useMemoryStore.getState();
      expect(conversation.id).toBeNull();
      expect(conversation.messages).toEqual([]);
      expect(conversation.loading).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('sends a message and receives response', async () => {
      (api.askMemories as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        answer: 'The answer is 42',
        citations: [],
        conversationId: 'conv-1',
      });

      await useMemoryStore.getState().sendMessage('What is the meaning?');
      const { conversation } = useMemoryStore.getState();
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[1].role).toBe('assistant');
      expect(conversation.messages[1].content).toBe('The answer is 42');
      expect(conversation.id).toBe('conv-1');
      expect(conversation.loading).toBe(false);
    });

    it('handles error gracefully', async () => {
      (api.askMemories as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error'),
      );

      await useMemoryStore.getState().sendMessage('Will this fail?');
      const { conversation } = useMemoryStore.getState();
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[1].role).toBe('assistant');
      expect(conversation.messages[1].content).toContain("couldn't process");
      expect(conversation.loading).toBe(false);
    });
  });

  describe('loadFullGraph', () => {
    it('loads full graph data', async () => {
      (api.getGraphData as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        nodes: [],
        links: [],
      });
      await useMemoryStore.getState().loadFullGraph();
      expect(useMemoryStore.getState().graphPreview).toBe(false);
      expect(useMemoryStore.getState().graphLoading).toBe(false);
    });

    it('handles error', async () => {
      (api.getGraphData as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('fail'),
      );
      await useMemoryStore.getState().loadFullGraph();
      expect(useMemoryStore.getState().graphLoading).toBe(false);
    });
  });
});
