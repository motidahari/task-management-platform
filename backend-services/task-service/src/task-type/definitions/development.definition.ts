import { Injectable } from '@nestjs/common';

import { TaskTypeDefinition } from '../interfaces/task-type-definition.interface';

@Injectable()
export class DevelopmentDefinition implements TaskTypeDefinition {
  readonly type = 'development';
  readonly displayName = 'Development';
  readonly statuses = [
    { status: 1, name: 'created', displayName: 'Created', requiredFields: [] },
    {
      status: 2,
      name: 'specification-completed',
      displayName: 'Specification completed',
      requiredFields: [
        { key: 'specification', label: 'Specification', fieldType: 'string', maxLength: 5000 },
      ],
    },
    {
      status: 3,
      name: 'development-completed',
      displayName: 'Development completed',
      requiredFields: [
        { key: 'branchName', label: 'Branch name', fieldType: 'string', maxLength: 255 },
      ],
    },
    {
      status: 4,
      name: 'distribution-completed',
      displayName: 'Distribution completed',
      requiredFields: [
        // Versions are dotted identifiers ("1.4.2"), not numeric quantities —
        // modeled as a pattern-validated string rather than a number field.
        {
          key: 'versionNumber',
          label: 'Version number',
          fieldType: 'string',
          maxLength: 50,
          pattern: '^\\d+\\.\\d+\\.\\d+$',
        },
      ],
    },
  ] as const;
}
