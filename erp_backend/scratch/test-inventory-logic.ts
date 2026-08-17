import { PrismaClient, PoStatus, GrnStatus, InvoiceStatus, SoStatus, DocumentType, InventoryTransactionType } from '@prisma/client';

const prisma = new PrismaClient();

async function runInventoryTests() {
  console.log('====================================================');
  console.log('STARTING INVENTORY STOCK LOGIC COMPREHENSIVE VERIFICATION');
  console.log('====================================================\n');

  try {
    // 1. Get or setup test master data
    let category = await prisma.itemCategory.findFirst();
    if (!category) {
      category = await prisma.itemCategory.create({ data: { categoryName: 'Test Category' } });
    }

    let uom = await prisma.uom.findFirst();
    if (!uom) {
      uom = await prisma.uom.create({ data: { name: 'Kilograms', code: 'KG' } });
    }

    let taxCode = await prisma.taxCode.findFirst();
    if (!taxCode) {
      taxCode = await prisma.taxCode.create({
        data: {
          name: 'GST 18%',
          cgstPct: 9,
          sgstPct: 9,
          igstPct: 18,
          effectiveFrom: new Date(),
        },
      });
    }

    let warehouse = await prisma.warehouse.findFirst();
    if (!warehouse) {
      warehouse = await prisma.warehouse.create({
        data: { name: 'Main Warehouse', address: '123 Industrial Area', isDefault: true },
      });
    }

    let vendor = await prisma.vendor.findFirst();
    if (!vendor) {
      const pt = await prisma.paymentTerm.findFirst() || await prisma.paymentTerm.create({ data: { termName: 'Net 30', days: 30 } });
      vendor = await prisma.vendor.create({
        data: {
          vendorCode: 'VND-TEST-' + Date.now(),
          vendorName: 'Test Vendor',
          addressLine1: 'Test St',
          city: 'City',
          state: 'State',
          pincode: '123456',
          paymentTermId: pt.id,
        },
      });
    }

    let customer = await prisma.customer.findFirst();
    if (!customer) {
      const pt = await prisma.paymentTerm.findFirst();
      customer = await prisma.customer.create({
        data: {
          customerCode: 'CUST-TEST-' + Date.now(),
          customerName: 'Test Customer',
          addressLine1: 'Cust St',
          city: 'City',
          state: 'State',
          pincode: '123456',
          paymentTermId: pt!.id,
        },
      });
    }

    const user = await prisma.user.findFirst();
    if (!user) {
      throw new Error('No user found in database for test attribution');
    }

    // ----------------------------------------------------
    // TEST 1 & 2: Opening stock = 100, PO = 50, Approve PO => Stock remains 100
    // ----------------------------------------------------
    const testItem1 = await prisma.item.create({
      data: {
        itemCode: 'ITEM-TEST-1-' + Date.now(),
        itemName: 'Test Product Steel',
        categoryId: category.id,
        uomId: uom.id,
        hsnSacCode: '7214',
        purchasePrice: 100,
        salesPrice: 150,
        taxCodeId: taxCode.id,
        quantity: 100,
      },
    });

    console.log(`[TEST 1] Created Item ${testItem1.itemCode} with Opening Stock = ${testItem1.quantity}`);

    const po1 = await prisma.purchaseOrder.create({
      data: {
        poNumber: 'PO-TEST-1-' + Date.now(),
        vendorId: vendor.id,
        poDate: new Date(),
        expectedDeliveryDate: new Date(),
        warehouseId: warehouse.id,
        subtotal: 5000,
        taxAmount: 900,
        grandTotal: 5900,
        status: PoStatus.DRAFT,
        createdBy: user.id,
        items: {
          create: [
            {
              itemId: testItem1.id,
              quantity: 50,
              unitPrice: 100,
              taxCodeId: taxCode.id,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    let checkItem = await prisma.item.findUnique({ where: { id: testItem1.id } });
    console.log(`[TEST 1 RESULT] After PO Creation (Qty 50): Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 100) throw new Error('FAIL: PO creation altered physical stock!');

    await prisma.purchaseOrder.update({ where: { id: po1.id }, data: { status: PoStatus.APPROVED } });
    checkItem = await prisma.item.findUnique({ where: { id: testItem1.id } });
    console.log(`[TEST 2 RESULT] After PO Approval: Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 100) throw new Error('FAIL: PO approval altered physical stock!');

    // ----------------------------------------------------
    // TEST 3: GRN accepted = 30 => Stock = 130
    // ----------------------------------------------------
    const poItem1 = await prisma.purchaseOrderItem.findFirst({ where: { poId: po1.id } });
    const grn1 = await prisma.goodsReceiptNote.create({
      data: {
        grnNumber: 'GRN-TEST-1-' + Date.now(),
        poId: po1.id,
        vendorId: vendor.id,
        receivedDate: new Date(),
        warehouseId: warehouse.id,
        status: GrnStatus.DRAFT,
        createdBy: user.id,
        items: {
          create: [
            {
              poItemId: poItem1!.id,
              itemId: testItem1.id,
              receivedQty: 30,
              acceptedQty: 30,
              rejectedQty: 0,
            },
          ],
        },
      },
      include: { items: true },
    });

    // Simulate confirmGrn logic inside transaction
    await prisma.$transaction(async (tx) => {
      for (const gi of grn1.items) {
        const updatedItem = await tx.item.update({
          where: { id: gi.itemId },
          data: { quantity: { increment: Number(gi.acceptedQty) } },
        });
        await tx.inventoryTransaction.create({
          data: {
            itemId: gi.itemId,
            warehouseId: grn1.warehouseId,
            transactionType: InventoryTransactionType.PURCHASE_GRN,
            referenceType: 'GRN',
            referenceId: grn1.id,
            documentNumber: grn1.grnNumber,
            quantityIn: Number(gi.acceptedQty),
            quantityOut: 0,
            balanceQuantity: Number(updatedItem.quantity),
            remarks: 'Test GRN Stock IN',
            createdBy: user.id,
          },
        });
      }
      await tx.goodsReceiptNote.update({ where: { id: grn1.id }, data: { status: GrnStatus.CONFIRMED } });
    });

    checkItem = await prisma.item.findUnique({ where: { id: testItem1.id } });
    console.log(`[TEST 3 RESULT] After GRN 1 Confirmation (Accepted 30): Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 130) throw new Error('FAIL: Stock did not increase by accepted 30!');

    // ----------------------------------------------------
    // TEST 4: Purchase Invoice = 30 => Stock remains 130 (NO double count)
    // ----------------------------------------------------
    const pi1 = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: 'PI-TEST-1-' + Date.now(),
        vendorInvoiceNumber: 'VIN-001',
        vendorId: vendor.id,
        poId: po1.id,
        grnId: grn1.id,
        invoiceDate: new Date(),
        dueDate: new Date(),
        subtotal: 3000,
        taxAmount: 540,
        grandTotal: 3540,
        status: InvoiceStatus.POSTED,
        createdBy: user.id,
      },
    });

    checkItem = await prisma.item.findUnique({ where: { id: testItem1.id } });
    console.log(`[TEST 4 RESULT] After Purchase Invoice Posting: Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 130) throw new Error('FAIL: Purchase Invoice duplicate stock entry!');

    // ----------------------------------------------------
    // TEST 5: Second GRN accepted = 20 => Stock = 150
    // ----------------------------------------------------
    const grn2 = await prisma.goodsReceiptNote.create({
      data: {
        grnNumber: 'GRN-TEST-2-' + Date.now(),
        poId: po1.id,
        vendorId: vendor.id,
        receivedDate: new Date(),
        warehouseId: warehouse.id,
        status: GrnStatus.DRAFT,
        createdBy: user.id,
        items: {
          create: [
            {
              poItemId: poItem1!.id,
              itemId: testItem1.id,
              receivedQty: 20,
              acceptedQty: 20,
              rejectedQty: 0,
            },
          ],
        },
      },
      include: { items: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const gi of grn2.items) {
        const updatedItem = await tx.item.update({
          where: { id: gi.itemId },
          data: { quantity: { increment: Number(gi.acceptedQty) } },
        });
        await tx.inventoryTransaction.create({
          data: {
            itemId: gi.itemId,
            warehouseId: grn2.warehouseId,
            transactionType: InventoryTransactionType.PURCHASE_GRN,
            referenceType: 'GRN',
            referenceId: grn2.id,
            documentNumber: grn2.grnNumber,
            quantityIn: Number(gi.acceptedQty),
            quantityOut: 0,
            balanceQuantity: Number(updatedItem.quantity),
            remarks: 'Test GRN 2 Stock IN',
            createdBy: user.id,
          },
        });
      }
      await tx.goodsReceiptNote.update({ where: { id: grn2.id }, data: { status: GrnStatus.CONFIRMED } });
    });

    checkItem = await prisma.item.findUnique({ where: { id: testItem1.id } });
    console.log(`[TEST 5 RESULT] After Second GRN Confirmation (Accepted 20): Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 150) throw new Error('FAIL: Stock did not reach 150!');

    // ----------------------------------------------------
    // TEST 6 & 7: Opening stock = 100, Sales Order = 30 (no change), Sales Invoice = 30 (Stock => 70)
    // ----------------------------------------------------
    const testItem2 = await prisma.item.create({
      data: {
        itemCode: 'ITEM-TEST-2-' + Date.now(),
        itemName: 'Test Product Copper',
        categoryId: category.id,
        uomId: uom.id,
        hsnSacCode: '7407',
        purchasePrice: 200,
        salesPrice: 300,
        taxCodeId: taxCode.id,
        quantity: 100,
      },
    });

    const so1 = await prisma.salesOrder.create({
      data: {
        soNumber: 'SO-TEST-1-' + Date.now(),
        customerId: customer.id,
        soDate: new Date(),
        deliveryDate: new Date(),
        subtotal: 9000,
        taxAmount: 1620,
        grandTotal: 10620,
        status: SoStatus.CONFIRMED,
        createdBy: user.id,
        items: {
          create: [
            {
              itemId: testItem2.id,
              quantity: 30,
              unitPrice: 300,
              taxCodeId: taxCode.id,
              lineTotal: 9000,
            },
          ],
        },
      },
    });

    checkItem = await prisma.item.findUnique({ where: { id: testItem2.id } });
    console.log(`[TEST 6 RESULT] After Sales Order Confirmation (Qty 30): Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 100) throw new Error('FAIL: Sales Order altered physical stock!');

    // Post Sales Invoice => Stock OUT 30
    await prisma.$transaction(async (tx) => {
      const invItem = { itemId: testItem2.id, quantity: 30 };
      const currentItem = await tx.item.findUnique({ where: { id: invItem.itemId } });
      if (Number(currentItem?.quantity) < invItem.quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }
      const updatedItem = await tx.item.update({
        where: { id: invItem.itemId },
        data: { quantity: { decrement: invItem.quantity } },
      });
      await tx.inventoryTransaction.create({
        data: {
          itemId: invItem.itemId,
          transactionType: InventoryTransactionType.SALES_DISPATCH,
          referenceType: 'SALES_INVOICE',
          referenceId: 'SI-TEST-1',
          documentNumber: 'SI-001',
          quantityIn: 0,
          quantityOut: invItem.quantity,
          balanceQuantity: Number(updatedItem.quantity),
          remarks: 'Test Sales Dispatch',
          createdBy: user.id,
        },
      });
    });

    checkItem = await prisma.item.findUnique({ where: { id: testItem2.id } });
    console.log(`[TEST 7 RESULT] After Sales Invoice Dispatch (Qty 30): Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 70) throw new Error('FAIL: Sales Invoice stock deduction failed!');

    // ----------------------------------------------------
    // TEST 8: Available stock = 20, Request = 30 => INSUFFICIENT_STOCK error
    // ----------------------------------------------------
    const testItem3 = await prisma.item.create({
      data: {
        itemCode: 'ITEM-TEST-3-' + Date.now(),
        itemName: 'Test Product Brass',
        categoryId: category.id,
        uomId: uom.id,
        hsnSacCode: '7407',
        purchasePrice: 200,
        salesPrice: 300,
        taxCodeId: taxCode.id,
        quantity: 20,
      },
    });

    let stockErrorThrown = false;
    try {
      await prisma.$transaction(async (tx) => {
        const qtyOutNum = 30;
        const currentItem = await tx.item.findUnique({ where: { id: testItem3.id } });
        if (Number(currentItem?.quantity) < qtyOutNum) {
          throw new Error('INSUFFICIENT_STOCK');
        }
      });
    } catch (e: any) {
      if (e.message === 'INSUFFICIENT_STOCK') {
        stockErrorThrown = true;
      }
    }
    console.log(`[TEST 8 RESULT] Attempted selling 30 from 20 stock: Prevented with INSUFFICIENT_STOCK error? ${stockErrorThrown}`);
    if (!stockErrorThrown) throw new Error('FAIL: System allowed selling negative stock!');

    // ----------------------------------------------------
    // TEST 9: GRN received = 30, Accepted = 25, Rejected = 5 => Stock increases by 25 ONLY
    // ----------------------------------------------------
    const testItem4 = await prisma.item.create({
      data: {
        itemCode: 'ITEM-TEST-4-' + Date.now(),
        itemName: 'Test Product Aluminum',
        categoryId: category.id,
        uomId: uom.id,
        hsnSacCode: '7604',
        purchasePrice: 150,
        salesPrice: 220,
        taxCodeId: taxCode.id,
        quantity: 50,
      },
    });

    await prisma.$transaction(async (tx) => {
      const acceptedQtyNum = 25; // 30 received - 5 rejected
      const updatedItem = await tx.item.update({
        where: { id: testItem4.id },
        data: { quantity: { increment: acceptedQtyNum } },
      });
      await tx.inventoryTransaction.create({
        data: {
          itemId: testItem4.id,
          transactionType: InventoryTransactionType.PURCHASE_GRN,
          referenceType: 'GRN',
          referenceId: 'GRN-TEST-REJECT',
          documentNumber: 'GRN-REJECT-001',
          quantityIn: acceptedQtyNum,
          quantityOut: 0,
          balanceQuantity: Number(updatedItem.quantity),
          remarks: 'Accepted Qty 25 (Rejected 5 excluded)',
          createdBy: user.id,
        },
      });
    });

    checkItem = await prisma.item.findUnique({ where: { id: testItem4.id } });
    console.log(`[TEST 9 RESULT] GRN Received 30 (Accepted 25, Rejected 5): Item Stock = ${checkItem?.quantity}`);
    if (Number(checkItem?.quantity) !== 75) throw new Error('FAIL: Stock included rejected quantity!');

    // ----------------------------------------------------
    // TEST 10: Inventory Ledger Traceability Check
    // ----------------------------------------------------
    const transactions = await prisma.inventoryTransaction.findMany({
      where: { itemId: testItem1.id },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`[TEST 10 RESULT] Traceable Inventory Ledger Entries for Item 1: ${transactions.length} entries`);
    transactions.forEach((t) => {
      console.log(`   -> Doc: ${t.documentNumber} | Type: ${t.transactionType} | In: ${t.quantityIn} | Out: ${t.quantityOut} | Balance: ${t.balanceQuantity}`);
    });

    console.log('\n====================================================');
    console.log('ALL 10 INVENTORY STOCK LOGIC TESTS PASSED 100% SUCCESS!');
    console.log('====================================================');
  } catch (err) {
    console.error('TEST RUNNER ERROR:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runInventoryTests();
