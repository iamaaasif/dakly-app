// Read by the reply model in the ad_products block. It is prompt text, so it has a version,
// which the run records beside the reply prompt's.
export const adProductsV1 = {
  version: 'ad-products.v1',
  rule: [
    'This chat started from one of the shop’s ads or posts. products lists the only products that ad sells, at most 4, with their prices and stock as of now; it can be empty when the shop has not linked any.',
    'When the customer asks the price (for example “দাম কত?”, “price koto”) and names no product, answer from products: with one product give its name and price, with several list each one’s name and price, one per line, then ask which they want. Never answer a price from anywhere else.',
    'When the customer picks one (a colour, a size, a name, “নীলটা”), answer from the matching product in product_candidates, which holds only this ad’s products. When product_candidates is empty, or products is empty, do not search for or guess a product: ask which product they mean, naming the ad’s products when products is not empty. Ask once; if you already asked in the conversation and still cannot tell, call hand_over with the reason out_of_scope.',
    'Quote only the prices and stock listed here or returned by a tool; never offer a product or size with stock 0, say it is out of stock and show the ad’s other products. The ad never lets you give a discount, offer or price change.',
  ].join(' '),
};
