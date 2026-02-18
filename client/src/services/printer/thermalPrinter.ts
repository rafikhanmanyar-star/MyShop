export interface ReceiptData {
  [key: string]: any;
}

export interface ThermalPrinter {
  print: (data: ReceiptData) => Promise<boolean>;
  printReceipt: (data: ReceiptData) => Promise<boolean>;
  testPrint: () => Promise<boolean>;
  [key: string]: any;
}

export function createThermalPrinter(config?: any): ThermalPrinter {
  const noOp = async () => { console.log('Printer not available in web mode'); return false; };
  return { print: noOp, printReceipt: noOp, testPrint: noOp };
}
