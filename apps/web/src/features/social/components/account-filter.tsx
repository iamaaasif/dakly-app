import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import type { SocialAccount } from '../api/get-social-accounts';

type AccountFilterProps = {
  accounts: SocialAccount[];
  accountId: string | null;
  onChange: (accountId: string | null) => void;
};

export function AccountFilter({ accounts, accountId, onChange }: AccountFilterProps) {
  return (
    <Select
      value={accountId ?? 'all'}
      onValueChange={(value) => onChange(value === 'all' ? null : value)}
    >
      <SelectTrigger aria-label="Filter by account" className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All accounts</SelectItem>
        {accounts.map(({ id, displayName }) => (
          <SelectItem key={id} value={id}>
            {displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
