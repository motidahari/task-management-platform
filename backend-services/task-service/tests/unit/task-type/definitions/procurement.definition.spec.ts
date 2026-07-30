import { ProcurementDefinition } from '../../../../src/task-type/definitions/procurement.definition';

describe('ProcurementDefinition', () => {
  const definition = new ProcurementDefinition();

  describe('Given:the definition, When:reading its type identity', () => {
    it('should expose the procurement type key and display name', () => {
      expect(definition.type).toBe('procurement');
      expect(definition.displayName).toBe('Procurement');
    });
  });

  describe('Given:the status list, When:reading its length and ordering', () => {
    it('should have three statuses numbered contiguously from 1', () => {
      expect(definition.statuses).toHaveLength(3);
      expect(definition.statuses.map((status) => status.status)).toEqual([1, 2, 3]);
    });
  });

  describe('Given:status 1 (created), When:reading its shape', () => {
    it('should require no fields', () => {
      const created = definition.statuses[0];

      expect(created).toEqual({
        status: 1,
        name: 'created',
        displayName: 'Created',
        requiredFields: [],
      });
    });
  });

  describe('Given:status 2 (supplier-offers-received), When:reading its shape', () => {
    it('should require two bounded price-quote strings', () => {
      const supplierOffersReceived = definition.statuses[1];

      expect(supplierOffersReceived).toEqual({
        status: 2,
        name: 'supplier-offers-received',
        displayName: 'Supplier offers received',
        requiredFields: [
          { key: 'quote1', label: 'Price quote 1', fieldType: 'string', maxLength: 500 },
          { key: 'quote2', label: 'Price quote 2', fieldType: 'string', maxLength: 500 },
        ],
      });
    });
  });

  describe('Given:status 3 (purchase-completed), When:reading its shape', () => {
    it('should require a bounded receipt string', () => {
      const purchaseCompleted = definition.statuses[2];

      expect(purchaseCompleted).toEqual({
        status: 3,
        name: 'purchase-completed',
        displayName: 'Purchase completed',
        requiredFields: [{ key: 'receipt', label: 'Receipt', fieldType: 'string', maxLength: 500 }],
      });
    });
  });
});
