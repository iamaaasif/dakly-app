import { describe, expect, it } from 'vitest';

import { canSearch, chatScreenQuerySchema, chatsHref, conversationFilters } from './chat-filters';

describe('chat filters', () => {
  it('searches names from three letters and phones from the first digit', () => {
    expect(canSearch('Sa')).toBe(false);
    expect(canSearch('Sad')).toBe(true);
    expect(canSearch('01')).toBe(true);
    expect(canSearch(undefined)).toBe(false);
  });

  it('keeps search, sort and assignee in the address and drops the defaults', () => {
    const assignee = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e5f';
    const query = chatScreenQuerySchema.parse({ q: 'Sadia', sort: 'unread', assignee });
    expect(chatsHref(query)).toBe(`/chats?sort=unread&q=Sadia&assignee=${assignee}`);
    expect(chatsHref({ ...query, label: 'VIP' })).toContain('&label=VIP');
    expect(chatsHref(chatScreenQuerySchema.parse({}))).toBe('/chats');
    expect(chatsHref(chatScreenQuerySchema.parse({ folder: 'spam', state: 'resolved' }))).toBe(
      '/chats?folder=spam&state=resolved',
    );
  });

  it('sends the folder, state, sort and search to the list', () => {
    expect(
      conversationFilters(chatScreenQuerySchema.parse({ folder: 'not_customers', q: 'ab' })),
    ).toEqual({
      folder: 'not_customers',
      state: 'open',
      sort: 'needs_you',
      channel: undefined,
      q: undefined,
      assigneeUserId: undefined,
    });
  });
});
