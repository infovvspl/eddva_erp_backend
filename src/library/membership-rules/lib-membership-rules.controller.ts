import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { LibMembershipRulesService } from './lib-membership-rules.service';
import { CreateMembershipRuleDto } from './dto/create-membership-rule.dto';
import { UpdateMembershipRuleDto } from './dto/update-membership-rule.dto';

@ApiTags('Library / Membership Rules')
@ApiBearerAuth()
@Controller('api/library/membership-rules')
export class LibMembershipRulesController {
  constructor(private readonly rulesService: LibMembershipRulesService) {}

  @Post()
  @ApiOperation({ summary: 'Create membership rule for a member_type (admin)' })
  create(@Body() dto: CreateMembershipRuleDto) {
    return this.rulesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all membership rules' })
  findAll() {
    return this.rulesService.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update membership rule (admin)' })
  @ApiParam({ name: 'id', description: 'rule_id of the Membership Rule to update (e.g. 1)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMembershipRuleDto,
  ) {
    return this.rulesService.update(id, dto);
  }
}
