import { formatMoney } from '@dakly/contracts/money';

// Plain, polite Bangla with no offer, no link and no threat (SHOP-R3). Taka amounts keep the
// ৳ sign and Latin digits, as in every other Dakly message.
export function bakiNoticeText(shopName: string, addedPoisha: number, totalPoisha: number): string {
  return `${shopName}: ${formatMoney(addedPoisha)} বাকি যোগ হয়েছে। মোট বাকি ${formatMoney(totalPoisha)}। ধন্যবাদ।`;
}

export function reminderText(shopName: string, totalPoisha: number): string {
  return `${shopName}: প্রিয় গ্রাহক, আপনার ${formatMoney(totalPoisha)} বাকি আছে। সুবিধামতো পরিশোধ করলে কৃতজ্ঞ থাকব। ধন্যবাদ।`;
}
