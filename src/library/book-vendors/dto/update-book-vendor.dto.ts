import { PartialType } from '@nestjs/swagger';
import { CreateBookVendorDto } from './create-book-vendor.dto';
export class UpdateBookVendorDto extends PartialType(CreateBookVendorDto) {}
