import { PartialType } from '@nestjs/swagger';
import { CreateSalesOrderDto } from './create-sales-order.dto';

/** A DRAFT sales order can be edited freely; once CONFIRMED it is rejected by the service. */
export class UpdateSalesOrderDto extends PartialType(CreateSalesOrderDto) {}
