import { IsEmail, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CheckInDto {
  @ApiPropertyOptional({ description: 'Existing visitor_id — omit to create a new visitor master record from the fields below' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visitor_id?: number;

  @ApiPropertyOptional({ example: 'Rahul Verma', description: 'Required when neither visitor_id nor appointment_id is supplied' })
  @ValidateIf((o) => !o.visitor_id && !o.appointment_id)
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id_proof_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id_proof_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional({ description: 'Link to a scheduled appointment — host, department, and visitor details are cross-checked/populated from it' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  appointment_id?: number;

  @ApiPropertyOptional({ description: 'Required when not checking in against an appointment' })
  @ValidateIf((o) => !o.appointment_id)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  host_employee_id?: number;

  @ApiPropertyOptional({ example: 'Parent-teacher meeting' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: 'Badge number — auto-assigned via the numbering sequence if omitted' })
  @IsOptional()
  @IsString()
  badge_number?: string;
}
