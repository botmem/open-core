import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPeopleSearchTool } from '../../src/tools/people-search';
import { BotmemClient, BotmemApiError } from '../../src/client';
import { PluginApi, AgentToolDef } from '../../src/types';

vi.mock('@toon-format/toon', () => ({
  encode: (data: unknown) => `TOON:${JSON.stringify(data)}`,
}));

function createMockApi() {
  const tools: AgentToolDef[] = [];
  const api: PluginApi = {
    getConfig: () => ({}),
    registerAgentTool: (tool) => tools.push(tool),
    on: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { api, tools };
}

describe('people_search tool', () => {
  let tool: AgentToolDef;
  let client: BotmemClient;

  beforeEach(() => {
    client = new BotmemClient('http://localhost:12412', 'key');
    const { api, tools } = createMockApi();
    registerPeopleSearchTool(api, client);
    tool = tools[0];
  });

  it('registers with correct name', () => {
    expect(tool.name).toBe('people_search');
  });

  it('calls searchContacts and returns toon-encoded result', async () => {
    const mockResult = { contacts: [{ id: 'c-1', name: 'Bob' }] };
    vi.spyOn(client, 'searchContacts').mockResolvedValueOnce(mockResult);

    const result = await tool.execute('call-1', { query: 'Bob' });
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('TOON:');
    expect(result.content[0].text).toContain('Bob');
  });

  it('passes query and limit to searchContacts', async () => {
    const spy = vi.spyOn(client, 'searchContacts').mockResolvedValueOnce({});

    await tool.execute('call-2', { query: 'alice@example.com', limit: 5 });

    expect(spy).toHaveBeenCalledWith('alice@example.com', 5);
  });

  it('passes undefined limit when not provided', async () => {
    const spy = vi.spyOn(client, 'searchContacts').mockResolvedValueOnce({});

    await tool.execute('call-3', { query: 'test' });

    expect(spy).toHaveBeenCalledWith('test', undefined);
  });

  it('returns friendly error on BotmemApiError', async () => {
    vi.spyOn(client, 'searchContacts').mockRejectedValueOnce(
      new BotmemApiError('Unauthorized', 401),
    );

    const result = await tool.execute('call-4', { query: 'test' });
    expect(result.content[0].text).toContain('Botmem API error');
    expect(result.content[0].text).toContain('Unauthorized');
  });

  it('rethrows non-API errors', async () => {
    vi.spyOn(client, 'searchContacts').mockRejectedValueOnce(new Error('fail'));
    await expect(tool.execute('call-5', { query: 'test' })).rejects.toThrow('fail');
  });
});
