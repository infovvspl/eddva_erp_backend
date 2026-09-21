import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AlumniProfileFieldsDto } from '../../directory/dto/alumni.dto';
import { Trim } from '../../common/transforms';

/** Alumni self-registration (public endpoint). */
export class RegisterAlumniDto extends AlumniProfileFieldsDto {
  @ApiProperty({
    example: 'inst-001',
    description: 'The institute whose alumni directory you are joining',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  institute_id: string;

  @ApiProperty({
    example: 'MyPassw0rd!',
    description:
      'Portal password (min 8 characters). The e-mail is your login name.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiPropertyOptional({
    description:
      'Anything that helps staff confirm who you are (section, house, teacher…)',
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
