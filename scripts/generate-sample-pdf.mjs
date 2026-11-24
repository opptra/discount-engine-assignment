import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.join(__dirname, '..', 'sample-data', 'cart.pdf')

// Minimal valid PDF 1.4 generator in pure JavaScript
function createPdf(lines) {
  let contentStream = 'BT\n/F1 12 Tf\n14 TL\n72 720 Td\n'
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    if (i === 0) {
      contentStream += `(${line}) Tj\n`
    } else {
      contentStream += `T* (${line}) Tj\n`
    }
  }
  contentStream += 'ET\n'

  const streamLength = Buffer.byteLength(contentStream, 'utf-8')

  const objects = [
    null, // 0 is unused
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${streamLength} >>\nstream\n${contentStream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let body = '%PDF-1.4\n'
  const xref = [0] // byte offsets

  for (let i = 1; i < objects.length; i++) {
    xref[i] = Buffer.byteLength(body, 'utf-8')
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(body, 'utf-8')
  body += 'xref\n'
  body += `0 ${objects.length}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i < objects.length; i++) {
    body += String(xref[i]).padStart(10, '0') + ' 00000 n \n'
  }

  body += 'trailer\n'
  body += `<< /Size ${objects.length} /Root 1 0 R >>\n`
  body += 'startxref\n'
  body += `${xrefOffset}\n`
  body += '%%EOF\n'

  return Buffer.from(body, 'utf-8')
}

// Sample cart lines using pipe delimiters (universally recognized across PDF font decoders)
const lines = [
  'Item ID | Product | Brand | Platform | Base Price',
  'ITEM-01 | Cushion Cover | Natura Casa | Amazon India | 1299',
  'ITEM-02 | Bed Sheet Set | Natura Casa | Flipkart | 849',
  'ITEM-03 | Wall Shelf | LivSpace Pro | Amazon India | 599',
  'ITEM-04 | Ceramic Vase | LivSpace Pro | Noon | 2499',
  'ITEM-05 | Cutting Board | Nordic Basics | Amazon India | 449',
  'ITEM-06 | Desk Organiser | Nordic Basics | Flipkart | 899',
]

const pdfBuffer = createPdf(lines)
fs.writeFileSync(outputPath, pdfBuffer)
console.log('Successfully generated sample PDF at:', outputPath, `(${pdfBuffer.length} bytes)`)
