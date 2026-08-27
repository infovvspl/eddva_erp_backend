import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const FRONT_OFFICE_RESOURCE_CATALOG = [
  {
    resource: 'departments',
    name: 'Departments',
    description: 'Manage Front Office departments',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'employees',
    name: 'Employees',
    description: 'Manage Front Office employees and their availability',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'visitors',
    name: 'Visitor Register',
    description: 'Visitor master records, check-in/check-out, and sensitive ID proof access',
    available_actions: ['read', 'create', 'update', 'checkin', 'sensitive_view'],
  },
  {
    resource: 'enquiries',
    name: 'Enquiry Register',
    description: 'Enquiry capture, assignment, and follow-ups',
    available_actions: ['read', 'create', 'update', 'assign', 'followup'],
  },
  {
    resource: 'appointments',
    name: 'Appointment Management',
    description: 'Appointment scheduling, confirmation, rescheduling, and host assignment',
    available_actions: ['read', 'create', 'update', 'assign'],
  },
  {
    resource: 'complaints',
    name: 'Complaint Register',
    description: 'Complaint capture, assignment, priority, and escalation',
    available_actions: ['read', 'create', 'update', 'assign', 'escalate'],
  },
  {
    resource: 'attachments',
    name: 'Attachments',
    description: 'Upload/view/delete attachments on visitors, enquiries, and complaints',
    available_actions: ['read', 'manage'],
  },
  {
    resource: 'dashboard',
    name: 'Dashboard',
    description: 'View Front Office summary/reporting dashboard',
    available_actions: ['read'],
  },
] as const;

export class FrontOfficePermissionRuleDto {
  @ApiProperty({ example: 'visitors', description: 'Target resource name' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['read', 'checkin'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateFrontOfficeDynamicRoleDto {
  @ApiProperty({ example: 'Front Desk' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Registers visitors, manages appointments, logs enquiries and complaints' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [FrontOfficePermissionRuleDto],
    example: [
      { resource: 'visitors', actions: ['read', 'create', 'update', 'checkin'] },
      { resource: 'appointments', actions: ['read', 'create', 'update'] },
      { resource: 'enquiries', actions: ['read', 'create', 'update', 'followup'] },
      { resource: 'complaints', actions: ['read', 'create', 'update'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FrontOfficePermissionRuleDto)
  permissions: FrontOfficePermissionRuleDto[];
}
