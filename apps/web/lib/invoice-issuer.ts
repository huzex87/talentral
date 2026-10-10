// Who issues placement invoices and where to pay, from the environment so it can change without a
// code change. Missing bank details show a notice on the invoice instead of a blank.
export interface InvoiceIssuer { name: string; address: string | null; email: string | null; tin: string | null;
  bank: { bank: string; accountName: string; accountNumber: string } | null }

export function invoiceIssuer(): InvoiceIssuer {
  const bank = process.env.INVOICE_BANK, accountName = process.env.INVOICE_ACCOUNT_NAME, accountNumber = process.env.INVOICE_ACCOUNT_NUMBER;
  return {
    name: process.env.INVOICE_FROM || 'Talentral',
    address: process.env.INVOICE_ADDRESS || null,
    email: process.env.INVOICE_EMAIL || null,
    tin: process.env.INVOICE_TIN || null,
    bank: bank && accountName && accountNumber ? { bank, accountName, accountNumber } : null,
  };
}
