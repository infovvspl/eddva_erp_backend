import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extractUserContext, scopeWhere } from '../common/utils/institute-scope.util';
import { CreateItemCategoryDto } from './dto/create-item-category.dto';
import { UpdateItemCategoryDto } from './dto/update-item-category.dto';
import { CreateUomDto } from './dto/create-uom.dto';
import { UpdateUomDto } from './dto/update-uom.dto';
import { CreateTaxCodeDto } from './dto/create-tax-code.dto';
import { UpdateTaxCodeDto } from './dto/update-tax-code.dto';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class MastersService {
  constructor(private prisma: PrismaService) {}

  // --- Categories ---
  async createCategory(dto: CreateItemCategoryDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const existing = await this.prisma.itemCategory.findFirst({
      where: scopeWhere({ categoryName: dto.categoryName }, instituteId),
    });
    if (existing) {
      throw new ConflictException('Category with this name already exists.');
    }
    return this.prisma.itemCategory.create({
      data: { ...dto, instituteId },
    });
  }

  async getCategories(userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    return this.prisma.itemCategory.findMany({
      where: scopeWhere({}, instituteId),
      orderBy: { categoryName: 'asc' },
    });
  }

  async getCategoryById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const category = await this.prisma.itemCategory.findFirst({
      where: scopeWhere({ id }, instituteId),
    });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return category;
  }

  async updateCategory(id: string, dto: UpdateItemCategoryDto, userParam?: any) {
    const category = await this.getCategoryById(id, userParam);
    const { instituteId } = extractUserContext(userParam);

    if (dto.categoryName && dto.categoryName !== category.categoryName) {
      const existing = await this.prisma.itemCategory.findFirst({
        where: scopeWhere({ categoryName: dto.categoryName }, instituteId),
      });
      if (existing) {
        throw new ConflictException('Category with this name already exists.');
      }
    }

    return this.prisma.itemCategory.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCategory(id: string, userParam?: any) {
    const category = await this.getCategoryById(id, userParam);
    const itemCount = await this.prisma.item.count({
      where: { categoryId: id },
    });

    if (itemCount > 0) {
      throw new BadRequestException(
        `Category "${category.categoryName}" is referenced by ${itemCount} items and cannot be deleted.`,
      );
    }

    await this.prisma.itemCategory.delete({ where: { id } });
    return { message: `Category "${category.categoryName}" deleted successfully.` };
  }

  // --- UOM ---
  async createUom(dto: CreateUomDto) {
    const existing = await this.prisma.uom.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('UOM with this code already exists.');
    }
    return this.prisma.uom.create({ data: dto });
  }

  async getUoms() {
    return this.prisma.uom.findMany({ orderBy: { code: 'asc' } });
  }

  async getUomById(id: string) {
    const uom = await this.prisma.uom.findUnique({ where: { id } });
    if (!uom) {
      throw new NotFoundException('UOM not found.');
    }
    return uom;
  }

  async updateUom(id: string, dto: UpdateUomDto) {
    await this.getUomById(id);
    return this.prisma.uom.update({
      where: { id },
      data: dto,
    });
  }

  async deleteUom(id: string) {
    const uom = await this.getUomById(id);
    const itemCount = await this.prisma.item.count({
      where: { uomId: id },
    });

    if (itemCount > 0) {
      throw new BadRequestException(
        `UOM "${uom.code}" is referenced by ${itemCount} items and cannot be deleted.`,
      );
    }

    await this.prisma.uom.delete({ where: { id } });
    return { message: `UOM "${uom.code}" deleted successfully.` };
  }

  // --- Tax Codes ---
  async createTaxCode(dto: CreateTaxCodeDto) {
    return this.prisma.taxCode.create({
      data: {
        name: dto.name,
        cgstPct: dto.cgstPct,
        sgstPct: dto.sgstPct,
        igstPct: dto.igstPct,
        effectiveFrom: new Date(dto.effectiveFrom),
      },
    });
  }

  async getTaxCodes() {
    return this.prisma.taxCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getTaxCodeById(id: string) {
    const taxCode = await this.prisma.taxCode.findUnique({ where: { id } });
    if (!taxCode) {
      throw new NotFoundException('Tax Code not found.');
    }
    return taxCode;
  }

  async updateTaxCode(id: string, dto: UpdateTaxCodeDto) {
    await this.getTaxCodeById(id);
    return this.prisma.taxCode.update({
      where: { id },
      data: {
        name: dto.name,
        cgstPct: dto.cgstPct,
        sgstPct: dto.sgstPct,
        igstPct: dto.igstPct,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      },
    });
  }

  async deleteTaxCode(id: string) {
    const taxCode = await this.getTaxCodeById(id);
    const [itemCount, poItemCount, piItemCount] = await Promise.all([
      this.prisma.item.count({ where: { taxCodeId: id } }),
      this.prisma.purchaseOrderItem.count({ where: { taxCodeId: id } }),
      this.prisma.purchaseInvoiceItem.count({ where: { taxCodeId: id } }),
    ]);

    if (itemCount > 0 || poItemCount > 0 || piItemCount > 0) {
      throw new BadRequestException(
        `Tax Code "${taxCode.name}" is referenced by existing items/invoices and cannot be deleted.`,
      );
    }

    await this.prisma.taxCode.delete({ where: { id } });
    return { message: `Tax Code "${taxCode.name}" deleted successfully.` };
  }

  // --- Payment Terms ---
  async createPaymentTerm(dto: CreatePaymentTermDto) {
    const existing = await this.prisma.paymentTerm.findUnique({
      where: { termName: dto.termName },
    });
    if (existing) {
      throw new ConflictException('Payment term already exists.');
    }
    return this.prisma.paymentTerm.create({ data: dto });
  }

  async getPaymentTerms() {
    return this.prisma.paymentTerm.findMany({ orderBy: { days: 'asc' } });
  }

  async getPaymentTermById(id: string) {
    const term = await this.prisma.paymentTerm.findUnique({ where: { id } });
    if (!term) {
      throw new NotFoundException('Payment term not found.');
    }
    return term;
  }

  async updatePaymentTerm(id: string, dto: UpdatePaymentTermDto) {
    await this.getPaymentTermById(id);
    return this.prisma.paymentTerm.update({
      where: { id },
      data: dto,
    });
  }

  async deletePaymentTerm(id: string) {
    const term = await this.getPaymentTermById(id);
    const [vendorCount, customerCount] = await Promise.all([
      this.prisma.vendor.count({ where: { paymentTermId: id } }),
      this.prisma.customer.count({ where: { paymentTermId: id } }),
    ]);

    if (vendorCount > 0 || customerCount > 0) {
      throw new BadRequestException(
        `Payment Term "${term.termName}" is assigned to vendors or customers and cannot be deleted.`,
      );
    }

    await this.prisma.paymentTerm.delete({ where: { id } });
    return { message: `Payment Term "${term.termName}" deleted successfully.` };
  }

  // --- Warehouses ---
  async createWarehouse(dto: CreateWarehouseDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: scopeWhere({ isDefault: true }, instituteId),
        data: { isDefault: false },
      });
    }
    return this.prisma.warehouse.create({
      data: { ...dto, instituteId },
    });
  }

  async getWarehouses(userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    return this.prisma.warehouse.findMany({
      where: scopeWhere({}, instituteId),
      orderBy: { name: 'asc' },
    });
  }

  async getWarehouseById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: scopeWhere({ id }, instituteId),
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found.');
    }
    return warehouse;
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto, userParam?: any) {
    const warehouse = await this.getWarehouseById(id, userParam);
    const { instituteId } = extractUserContext(userParam);

    if (dto.isDefault && !warehouse.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: scopeWhere({ isDefault: true }, instituteId),
        data: { isDefault: false },
      });
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  async deleteWarehouse(id: string, userParam?: any) {
    const warehouse = await this.getWarehouseById(id, userParam);
    const [poCount, grnCount, stockCount] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { warehouseId: id } }),
      this.prisma.goodsReceiptNote.count({ where: { warehouseId: id } }),
      this.prisma.inventoryTransaction.count({ where: { warehouseId: id } }),
    ]);

    if (poCount > 0 || grnCount > 0 || stockCount > 0) {
      await this.prisma.warehouse.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
      return { message: `Warehouse "${warehouse.name}" is linked to transactions. Status set to INACTIVE.` };
    }

    await this.prisma.warehouse.delete({ where: { id } });
    return { message: `Warehouse "${warehouse.name}" deleted successfully.` };
  }

  // --- Items ---
  async createItem(dto: CreateItemDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const existing = await this.prisma.item.findFirst({
      where: scopeWhere({ itemCode: dto.itemCode }, instituteId),
    });
    if (existing) {
      throw new ConflictException('Item with this code already exists.');
    }
    return this.prisma.item.create({
      data: { ...dto, instituteId },
      include: { category: true, uom: true, taxCode: true },
    });
  }

  async updateItem(id: string, dto: UpdateItemDto, userParam?: any) {
    const item = await this.getItemById(id, userParam);
    const { instituteId } = extractUserContext(userParam);

    if (dto.itemCode && dto.itemCode !== item.itemCode) {
      const existing = await this.prisma.item.findFirst({
        where: scopeWhere({ itemCode: dto.itemCode }, instituteId),
      });
      if (existing) {
        throw new ConflictException('Item code already in use.');
      }
    }
    return this.prisma.item.update({
      where: { id },
      data: dto,
      include: { category: true, uom: true, taxCode: true },
    });
  }

  async getItems(query: PaginationQueryDto, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const { page = 1, limit = 25, search } = query;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (search) {
      where.OR = [
        { itemCode: { contains: search, mode: 'insensitive' } },
        { itemName: { contains: search, mode: 'insensitive' } },
        { hsnSacCode: { contains: search, mode: 'insensitive' } },
      ];
    }
    where = scopeWhere(where, instituteId);

    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { itemCode: 'asc' },
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          hsnSacCode: true,
          purchasePrice: true,
          salesPrice: true,
          quantity: true,
          status: true,
          category: { select: { id: true, categoryName: true } },
          uom: { select: { id: true, code: true, name: true } },
          taxCode: { select: { id: true, name: true } },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getItemById(id: string, userParam?: any) {
    const { instituteId } = extractUserContext(userParam);
    const where = scopeWhere({ id }, instituteId);
    const item = await this.prisma.item.findFirst({
      where,
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        hsnSacCode: true,
        purchasePrice: true,
        salesPrice: true,
        quantity: true,
        status: true,
        categoryId: true,
        uomId: true,
        taxCodeId: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, categoryName: true } },
        uom: { select: { id: true, code: true, name: true } },
        taxCode: { select: { id: true, name: true, cgstPct: true, sgstPct: true, igstPct: true } },
      },
    });
    if (!item) {
      throw new NotFoundException('Item not found.');
    }
    return item;
  }

  async deleteItem(id: string, userParam?: any) {
    const item = await this.getItemById(id, userParam);
    const [poCount, grnCount, piCount, soCount, siCount] = await Promise.all([
      this.prisma.purchaseOrderItem.count({ where: { itemId: id } }),
      this.prisma.grnItem.count({ where: { itemId: id } }),
      this.prisma.purchaseInvoiceItem.count({ where: { itemId: id } }),
      this.prisma.salesOrderItem.count({ where: { itemId: id } }),
      this.prisma.salesInvoiceItem.count({ where: { itemId: id } }),
    ]);

    if (poCount > 0 || grnCount > 0 || piCount > 0 || soCount > 0 || siCount > 0) {
      await this.prisma.item.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
      return { message: `Item ${item.itemName} (${item.itemCode}) is linked to active transactions. Status set to INACTIVE.` };
    }

    await this.prisma.item.delete({ where: { id } });
    return { message: `Item ${item.itemName} (${item.itemCode}) deleted successfully.` };
  }
}
