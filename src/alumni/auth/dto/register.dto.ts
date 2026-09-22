import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AlumniProfileFieldsDto } from '../../directory/dto/alumni.dto';
import { Trim } from '../../common/transforms';

/**
 * Staff-only: create an alumni profile and its portal login together in one
 * call. Alumni never self-register (no e-mail provider exists to prove
 * ownership of an address, so there is no way to safely let an anonymous
 * caller claim an identity) — an Institute Admin or a role holding
 * `alumni:create` + `alumni:issue_account` creates the record on the
 * alumnus's behalf, exactly like every other staff-entered profile.
 */
export class RegisterAlumniDto extends AlumniProfileFieldsDto {
  @ApiProperty({
    example: 'MyPassw0rd!',
    description:
      'Initial portal password (min 8 characters). The e-mail is the login name.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiPropertyOptional({
    enum: ['pending', 'verified'],
    default: 'verified',
    description:
      'Staff-created profiles are verified by default (staff vouch for them); pass "pending" to route through the verification queue instead',
  })
  @IsOptional()
  @IsIn(['pending', 'verified'])
  verification_status?: 'pending' | 'verified';

  @ApiPropertyOptional({
    description:
      'Optional staff note — evidence/context for why this profile is pending verification',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  verification_note?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiProperty({ description: 'Min 8 characters' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  new_password: string;
}
