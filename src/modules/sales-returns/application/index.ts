export { CreateSaleUseCase } from './use-cases/CreateSaleUseCase.js';
export type {
  CreateSaleCommand,
  CreateSaleResponse,
  SaleItemCommand,
} from './use-cases/CreateSaleUseCase.js';
export {
  InvalidChannelError,
  EmptySaleError,
  InvalidQuantityError,
} from './use-cases/CreateSaleUseCase.js';

export { CancelSaleUseCase } from './use-cases/CancelSaleUseCase.js';
export type {
  CancelSaleCommand,
  CancelSaleResponse,
} from './use-cases/CancelSaleUseCase.js';

export { ReturnFullSaleUseCase } from './use-cases/ReturnFullSaleUseCase.js';
export type {
  ReturnFullSaleCommand,
  ReturnFullSaleResponse,
} from './use-cases/ReturnFullSaleUseCase.js';

export { ListSalesUseCase } from './use-cases/ListSalesUseCase.js';
export type { SaleSummary, SaleWithItems } from './use-cases/ListSalesUseCase.js';

export { GetSaleDetailUseCase } from './use-cases/GetSaleDetailUseCase.js';
export type {
  GetSaleDetailCommand,
  SaleDetailResponse,
  SaleDetailLine,
  SaleDetailConsumption,
} from './use-cases/GetSaleDetailUseCase.js';

export { CreateSaleConstanciaEmissionUseCase } from './use-cases/CreateSaleConstanciaEmissionUseCase.js';
export type {
  CreateSaleConstanciaEmissionCommand,
  CreateSaleConstanciaEmissionResponse,
} from './use-cases/CreateSaleConstanciaEmissionUseCase.js';

export { ListSaleConstanciaEmissionsUseCase } from './use-cases/ListSaleConstanciaEmissionsUseCase.js';
export type {
  SaleConstanciaEmissionSummary,
} from './use-cases/ListSaleConstanciaEmissionsUseCase.js';

export { GetSaleConstanciaPdfUseCase } from './use-cases/GetSaleConstanciaPdfUseCase.js';
