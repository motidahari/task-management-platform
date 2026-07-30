import { Module } from '@nestjs/common';

import { PartitionMaintenanceService } from './partition-maintenance.service';

@Module({
  providers: [PartitionMaintenanceService],
})
export class PartitionMaintenanceModule {}
