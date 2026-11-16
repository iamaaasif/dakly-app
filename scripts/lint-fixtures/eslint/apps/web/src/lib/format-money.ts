export const formatMoney = (poisha: number) => new Intl.NumberFormat('bn-BD').format(poisha / 100);
