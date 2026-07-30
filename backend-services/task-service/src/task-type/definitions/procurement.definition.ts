import { Injectable } from '@nestjs/common';

import { TaskTypeDefinition } from '../interfaces/task-type-definition.interface';

@Injectable()
export class ProcurementDefinition implements TaskTypeDefinition {
  readonly type = 'procurement';
  readonly displayName = 'Procurement';
  readonly statuses = [
    { status: 1, name: 'created', displayName: 'Created', requiredFields: [] },
    {
      status: 2,
      name: 'supplier-offers-received',
      displayName: 'Supplier offers received',
      requiredFields: [
        { key: 'quote1', label: 'Price quote 1', fieldType: 'string', maxLength: 500 },
        { key: 'quote2', label: 'Price quote 2', fieldType: 'string', maxLength: 500 },
      ],
    },
    {
      status: 3,
      name: 'purchase-completed',
      displayName: 'Purchase completed',
      requiredFields: [{ key: 'receipt', label: 'Receipt', fieldType: 'string', maxLength: 500 }],
    },
  ] as const;
}
