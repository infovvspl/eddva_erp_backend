import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PdfService implements OnModuleDestroy {
  private browser: puppeteer.Browser | null = null;

  private async getBrowser() {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
    return this.browser;
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  private getLogoBase64(): string {
    const possiblePaths = [
      path.resolve(process.cwd(), '../erp_frontend/public/EDVA LOGO 04.png'),
      path.resolve(process.cwd(), 'public/EDVA LOGO 04.png'),
      'd:\\Program Files\\Eddva_ERP\\erp_frontend\\public\\EDVA LOGO 04.png',
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const fileData = fs.readFileSync(p);
        return `data:image/png;base64,${fileData.toString('base64')}`;
      }
    }
    return '';
  }

  async generateInvoicePdf(type: 'PURCHASE' | 'SALES', invoice: any): Promise<Buffer> {
    const isPurchase = type === 'PURCHASE';
    const title = isPurchase ? 'PURCHASE INVOICE' : 'TAX INVOICE';
    const logoBase64 = this.getLogoBase64();

    const partyName = isPurchase
      ? invoice.vendor?.vendorName
      : invoice.customer?.customerName;
    const partyCode = isPurchase
      ? invoice.vendor?.vendorCode
      : invoice.customer?.customerCode;
    const partyGstin = isPurchase
      ? invoice.vendor?.gstin
      : invoice.customer?.gstin;
    const partyAddress = isPurchase
      ? `${invoice.vendor?.addressLine1 || ''}, ${invoice.vendor?.city || ''}, ${invoice.vendor?.state || ''} - ${invoice.vendor?.pincode || ''}`
      : `${invoice.customer?.addressLine1 || ''}, ${invoice.customer?.city || ''}, ${invoice.customer?.state || ''} - ${invoice.customer?.pincode || ''}`;

    const itemsRows = (invoice.items || [])
      .map(
        (item: any, idx: number) => `
        <tr>
          <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e2e8f0; color: #64748b;">${idx + 1}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">
            <strong style="color: #0f172a;">${item.item?.itemName || 'Item'}</strong>
            <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">${item.item?.itemCode || ''}</div>
          </td>
          <td style="padding: 8px; font-family: monospace; border-bottom: 1px solid #e2e8f0; color: #475569;">${item.item?.hsnSacCode || '-'}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${item.quantity}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${Number(item.unitPrice).toFixed(2)}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #475569;">₹${(Number(item.cgstAmount || 0) + Number(item.sgstAmount || 0) + Number(item.igstAmount || 0)).toFixed(2)}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">₹${Number(item.lineTotal).toFixed(2)}</td>
        </tr>
      `,
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${invoice.invoiceNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            margin: 0;
            padding: 24px;
            color: #1e293b;
            font-size: 12px;
            background: #ffffff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .brand-title {
            font-size: 22px;
            font-weight: 800;
            color: #4338ca;
            letter-spacing: -0.5px;
          }
          .brand-subtitle {
            font-size: 11px;
            color: #64748b;
            margin-top: 2px;
          }
          .doc-title {
            font-size: 14px;
            font-weight: 800;
            color: #4338ca;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: right;
          }
          .doc-number {
            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            text-align: right;
            margin-top: 4px;
          }
          .meta-grid {
            display: flex;
            justify-content: space-between;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 20px;
          }
          .meta-box {
            width: 48%;
          }
          .meta-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: #94a3b8;
            letter-spacing: 0.5px;
          }
          .party-name {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 2px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
          }
          .items-table th {
            background: #f1f5f9;
            color: #475569;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 10px 8px;
            border-bottom: 1px solid #cbd5e1;
          }
          .totals-container {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 24px;
          }
          .totals-box {
            width: 260px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            color: #475569;
          }
          .totals-grand {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            font-weight: 800;
            color: #4338ca;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            margin-top: 6px;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
            margin-top: 30px;
            font-size: 11px;
          }
          .terms {
            color: #64748b;
            max-width: 60%;
          }
          .signature {
            text-align: right;
            width: 180px;
          }
          .sig-line {
            border-bottom: 1px solid #94a3b8;
            margin-top: 40px;
            padding-bottom: 2px;
            font-size: 10px;
            color: #64748b;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            ${
              logoBase64
                ? `<img src="${logoBase64}" alt="EDDVA" style="height: 55px; width: auto; max-width: 220px; object-fit: contain; margin-bottom: 4px; display: block;" />`
                : `<div class="brand-title">EDDVA</div>`
            }
            <div class="brand-subtitle">Corporate Office: Plot 101, Industrial Area, Phase II</div>
            <div class="brand-subtitle">GSTIN: 27EDDVA0000A1Z9 • Email: billing@eddva.com</div>
          </div>
          <div>
            <div class="doc-title">${title}</div>
            <div class="doc-number">${invoice.invoiceNumber}</div>
            <div style="text-align: right; margin-top: 6px;">
              <span style="background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;">
                STATUS: ${invoice.status}
              </span>
            </div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-box">
            <div class="meta-label">Billed ${isPurchase ? 'From (Vendor)' : 'To (Customer)'}:</div>
            <div class="party-name">${partyName || 'N/A'}</div>
            <div style="color: #64748b; margin-top: 2px;">Code: ${partyCode || 'N/A'}</div>
            <div style="color: #475569; margin-top: 2px;">${partyAddress}</div>
            <div style="font-weight: 600; margin-top: 4px;">GSTIN: ${partyGstin || 'URP'}</div>
          </div>

          <div class="meta-box" style="text-align: right;">
            <div><strong>Invoice Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString()}</div>
            <div style="margin-top: 4px;"><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</div>
            ${
              isPurchase && invoice.vendorInvoiceNumber
                ? `<div style="margin-top: 4px;"><strong>Vendor Ref No:</strong> ${invoice.vendorInvoiceNumber}</div>`
                : ''
            }
            <div style="margin-top: 6px;">
              <strong>Payment Status:</strong> 
              <span style="font-weight: 700; color: ${invoice.paymentStatus === 'PAID' ? '#059669' : '#d97706'};">
                ${invoice.paymentStatus}
              </span>
            </div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th style="text-align: left;">Item Description</th>
              <th style="text-align: left;">HSN/SAC</th>
              <th style="text-align: right;">Qty</th>
              <th style="text-align: right;">Rate (₹)</th>
              <th style="text-align: right;">Tax (GST)</th>
              <th style="text-align: right;">Line Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="totals-container">
          <div class="totals-box">
            <div class="totals-row">
              <span>Subtotal:</span>
              <strong>₹${Number(invoice.subtotal).toFixed(2)}</strong>
            </div>
            ${
              Number(invoice.discount) > 0
                ? `<div class="totals-row" style="color: #e11d48;">
                    <span>Discount:</span>
                    <strong>-₹${Number(invoice.discount).toFixed(2)}</strong>
                  </div>`
                : ''
            }
            <div class="totals-row">
              <span>Total Tax (GST):</span>
              <strong>₹${Number(invoice.taxAmount).toFixed(2)}</strong>
            </div>
            <div class="totals-grand">
              <span>Grand Total:</span>
              <span>₹${Number(invoice.grandTotal).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="terms">
            <strong>Terms & Conditions:</strong>
            <ul style="margin: 4px 0 0 14px; padding: 0;">
              <li>Payment due within agreed payment terms.</li>
              <li>Interest @ 18% p.a. applicable on overdue bills.</li>
              <li>Subject to local jurisdiction only.</li>
            </ul>
          </div>

          <div class="signature">
            <strong>For EDDVA</strong>
            <div class="sig-line">Authorized Signatory</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '12mm',
          bottom: '10mm',
          left: '12mm',
        },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }
}
