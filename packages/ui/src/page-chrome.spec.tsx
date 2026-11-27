import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Box } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { TableFooter } from './table';
import { TabCount, Tabs, TabsList, TabsTrigger } from './tabs';

afterEach(cleanup);

describe('PageHeader', () => {
  it('shows the title, the description and the actions', () => {
    render(
      <PageHeader title="Products" description="What you sell" actions={<button>Add</button>} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Products' })).toBeTruthy();
    expect(screen.getByText('What you sell')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('names the empty list and offers the next step', () => {
    render(
      <EmptyState
        icon={Box}
        title="No product created yet"
        action={<button>Add product</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No product created yet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add product' })).toBeTruthy();
  });
});

describe('TabCount', () => {
  it('stays part of the tab name', () => {
    render(
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending <TabCount>4</TabCount>
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Pending 4' })).toBeTruthy();
  });
});

describe('TableFooter', () => {
  it('disables Previous on the first page and moves forward on Next', async () => {
    const onNext = vi.fn();
    render(
      <TableFooter
        summary="Showing 12 of 2,486"
        page={1}
        pageCount={208}
        onPrevious={vi.fn()}
        onNext={onNext}
      />,
    );
    expect(screen.getByText('Page 1 of 208')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
  it('disables Next on the last page', () => {
    render(
      <TableFooter
        summary="Showing 3 of 3"
        page={1}
        pageCount={1}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
