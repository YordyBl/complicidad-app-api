export { CreateCustomerUseCase } from './use-cases/CreateCustomerUseCase.js';
export type {
  CreateCustomerCommand,
  CreateCustomerResponse,
} from './use-cases/CreateCustomerUseCase.js';
export { CustomerNameRequiredError } from './use-cases/CreateCustomerUseCase.js';

export { UpdateCustomerUseCase } from './use-cases/UpdateCustomerUseCase.js';
export type {
  UpdateCustomerCommand,
  UpdateCustomerResponse,
} from './use-cases/UpdateCustomerUseCase.js';

export { GetCustomerUseCase } from './use-cases/GetCustomerUseCase.js';
export type {
  GetCustomerCommand,
  GetCustomerResponse,
} from './use-cases/GetCustomerUseCase.js';

export { ListCustomersUseCase } from './use-cases/ListCustomersUseCase.js';
export type { ListCustomerItem } from './use-cases/ListCustomersUseCase.js';

export { GetCustomerHistoryUseCase } from './use-cases/GetCustomerHistoryUseCase.js';
export type {
  GetCustomerHistoryCommand,
  CustomerHistoryResponse,
  CustomerHistoryScope,
  CustomerHistorySummary,
  CustomerSaleSummary,
} from './use-cases/GetCustomerHistoryUseCase.js';
