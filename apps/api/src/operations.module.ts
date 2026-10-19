import { Module } from '@nestjs/common';
import { CashController } from './cash/cash.controller.js';
import { CashService } from './cash/cash.service.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogServiceRepo } from './catalog/catalog.service.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomersService } from './customers/customers.service.js';
import { EmployeesController, EmployeesService } from './employees/employees.controller.js';
import { ParkingController } from './parking/parking.controller.js';
import { ParkingService } from './parking/parking.service.js';
import { ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { WorkOrdersController } from './work-orders/work-orders.controller.js';
import { WorkOrdersService } from './work-orders/work-orders.service.js';

/** Módulos operativos de la Fase 1 (docs/FASE-1.md). */
@Module({
  controllers: [
    CatalogController,
    CustomersController,
    EmployeesController,
    WorkOrdersController,
    ParkingController,
    CashController,
    ReportsController,
  ],
  providers: [
    CatalogServiceRepo,
    CustomersService,
    EmployeesService,
    WorkOrdersService,
    ParkingService,
    CashService,
    ReportsService,
  ],
})
export class OperationsModule {}
