'use client';
import { Button } from '@/components/ui';

// Browsers print the report as a clean document; "Save as PDF" in the print dialog makes a file to send.
export function PrintButton() {
  return <Button onClick={() => window.print()}>Print or save as PDF</Button>;
}
