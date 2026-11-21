import { bdMobileSchema } from '@dakly/contracts/phone';

import { contactError } from './contacts.errors';
import type { ContactFilter } from './contacts.repository';

export function searchFilter(
  search: string | undefined,
  seeFullPhone: boolean,
): Pick<ContactFilter, 'name' | 'phone' | 'phonePrefix'> {
  if (!search) return {};
  const fullPhone = bdMobileSchema.safeParse(search);
  if (fullPhone.success) return { phone: fullPhone.data };
  if (/^\d+$/.test(search)) return seeFullPhone ? { phonePrefix: search } : { phone: search };
  // The trigram name index cannot narrow a search shorter than one trigram.
  if (search.length < 3) throw contactError('CONTACT_SEARCH_TOO_SHORT');
  return { name: search };
}
