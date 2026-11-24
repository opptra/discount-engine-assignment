import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseCartCSV } from '../src/engine/csvParser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const csvPath = path.join(__dirname, '..', 'sample-data', 'advanced-retailer', 'advanced-cart.csv')
const outputPath = path.join(__dirname, '..', 'sample-data', 'advanced-retailer', 'advanced-cart.pdf')

const csvText = fs.readFileSync(csvPath, 'utf8')
const { data: cartItems } = parseCartCSV(csvText)

console.log(`Loaded ${cartItems.length} items from advanced-cart.csv`)

// Formats text lines into a PDF content stream
function makePageContent(pageItems, pageNum, totalPages) {
  let stream = 'BT\n/F1 9 Tf\n12 TL\n40 760 Td\n'
  // Header / Title banner starting with Page
  stream += `(Page ${pageNum} of ${totalPages} - Retail Order Export) Tj\n`
  stream += `T* () Tj\n`
  // Table Column Header (Pipe-separated for universal column extraction)
  stream += `(Item ID | Product | Brand | Platform | Base Price) Tj\n`

  for (const item of pageItems) {
    // Truncate ultra-long names slightly so line fits on standard width
    const cleanProduct = item.product.replace(/\|/g, '-').slice(0, 42)
    const line = `${item.itemId} | ${cleanProduct} | ${item.brand} | ${item.platform} | ${item.basePrice}`
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    stream += `T* (${escaped}) Tj\n`
  }

  stream += 'ET\n'
  return stream
}

function buildMultiPagePdf(items, itemsPerPage = 20) {
  const pages = []
  for (let i = 0; i < items.length; i += itemsPerPage) {
    pages.push(items.slice(i, i + itemsPerPage))
  }
  const totalPages = pages.length

  const objects = [null] // 1-indexed

  // Catalog: obj 1
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')

  // Pages parent: obj 2
  const pageRefs = []
  for (let p = 0; p < totalPages; p++) {
    pageRefs.push(`${3 + p} 0 R`)
  }
  objects.push(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${totalPages} >>`)

  // Page objects: obj 3 .. 3 + totalPages - 1
  const contentObjStart = 3 + totalPages
  const fontObjId = contentObjStart + totalPages

  for (let p = 0; p < totalPages; p++) {
    const contentObjId = contentObjStart + p
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`
    )
  }

  // Content streams
  for (let p = 0; p < totalPages; p++) {
    const contentStr = makePageContent(pages[p], p + 1, totalPages)
    const len = Buffer.byteLength(contentStr, 'utf8')
    objects.push(`<< /Length ${len} >>\nstream\n${contentStr}endstream`)
  }

  // Font object
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  // Assemble full PDF with xref
  let body = '%PDF-1.4\n'
  const xref = [0]

  for (let i = 1; i < objects.length; i++) {
    xref[i] = Buffer.byteLength(body, 'utf8')
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(body, 'utf8')
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

  return Buffer.from(body, 'utf8')
}

const pdfBuffer = buildMultiPagePdf(cartItems, 20)
fs.writeFileSync(outputPath, pdfBuffer)
console.log(`Generated ${pdfBuffer.length} bytes multi-page PDF at: ${outputPath}`)
