/**
 * Get Product By Id use case — reads a single product's detail.
 *
 * Pure application logic: delegates to the read-port and returns
 * the product detail or null if not found.
 */
import type { ProductListReadRepository, ProductListItem } from '../../domain/ProductListReadRepository.js';

export class GetProductByIdUseCase {
  constructor(
    private readonly readRepository: ProductListReadRepository,
  ) {}

  async execute(id: string): Promise<ProductListItem | null> {
    return this.readRepository.getProductById(id);
  }
}
