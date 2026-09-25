import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { LibCategoriesService } from './lib-categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Categories')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibPermissionsGuard)
@Controller('api/library/categories')
export class LibCategoriesController {
  constructor(private readonly categoriesService: LibCategoriesService) {}

  @Post()
  @RequirePermission({ resource: 'categories', action: 'create' })
  @ApiOperation({ summary: 'Create a new category (admin)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  create(@LibUser() user: LibPlatformUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.institute_id, dto);
  }

  @Get()
  @RequirePermission({ resource: 'categories', action: 'read' })
  @ApiOperation({ summary: 'List all categories' })
  findAll(@LibUser() user: LibPlatformUser) {
    return this.categoriesService.findAll(user.institute_id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'categories', action: 'update' })
  @ApiOperation({ summary: 'Update a category (admin)' })
  @ApiParam({ name: 'id', description: 'category_id of the Category to update (e.g. 1)' })
  update(
    @LibUser() user: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.institute_id, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'categories', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category — only if no books assigned (admin)' })
  @ApiParam({ name: 'id', description: 'category_id of the Category to delete (e.g. 1)' })
  remove(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(user.institute_id, id);
  }
}
