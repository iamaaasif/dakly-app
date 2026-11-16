// Constructors take injected dependencies, so the parameter limit skips them.
export class OrdersService {
  constructor(
    readonly orders: object,
    readonly customers: object,
    readonly products: object,
    readonly payments: object,
    readonly clock: object,
  ) {}
}
