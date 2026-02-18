export interface BarcodeScanner {
  start: () => void;
  stop: () => void;
  onScan: (callback: (barcode: string) => void) => void;
}

export function createBarcodeScanner(onScan?: (barcode: string) => void): BarcodeScanner {
  return {
    start: () => console.log('Barcode scanner not available in web mode'),
    stop: () => {},
    onScan: (cb) => { if (onScan) onScan(''); },
  };
}
