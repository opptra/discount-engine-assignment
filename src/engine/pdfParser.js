/**
 * pdfParser.js
 *
 * Client-side PDF parser for cart files.
 * Extracts tabular item rows from digital (text-based) PDFs and normalizes them
 * into the existing CartItem structure:
 *   { itemId, product, brand, platform, basePrice }
 *
 * Uses pdfjs-dist for browser and Node.js execution.
 */

import * as pdfjsLibRaw from 'pdfjs-dist/legacy/build/pdf.js'
import { normalizeCartRow } from './csvParser.js'

const pdfjsLib = pdfjsLibRaw.default || pdfjsLibRaw

// Configure PDF worker in browser environment
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.js',
      import.meta.url
    ).toString()
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
}

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB limit

/**
 * Validates basic PDF file attributes before attempting extraction.
 */
export function validatePdfFile(file) {
  if (!file) {
    return 'No file selected.'
  }

  const name = file.name || ''
  if (!name.toLowerCase().endsWith('.pdf')) {
    return `Invalid file type: "${name}". Only .pdf files are accepted.`
  }

  if (file.size === 0) {
    return 'The uploaded PDF file is empty (0 bytes).'
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return `File size (${sizeMb} MB) exceeds the 10 MB limit.`
  }

  return null
}

/**
 * Extracts structured text lines from an ArrayBuffer or Uint8Array.
 * Reconstructs lines by clustering tokens on similar vertical Y positions (sorted top-to-bottom),
 * and ordering horizontal tokens left-to-right with column-gap detection.
 */
export async function extractTextLinesFromPdf(dataBuffer) {
  // pdfjs-dist throws if passed a Node.js Buffer instance directly.
  // Ensure we pass a pure Uint8Array view over the ArrayBuffer.
  let uint8Data
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(dataBuffer)) {
    uint8Data = new Uint8Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength)
  } else if (dataBuffer instanceof Uint8Array) {
    uint8Data = dataBuffer
  } else {
    uint8Data = new Uint8Array(dataBuffer)
  }

  let pdfDoc
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Data,
      useSystemFonts: true,
      disableFontFace: true,
    })
    pdfDoc = await loadingTask.promise
  } catch (err) {
    if (err && (err.name === 'PasswordException' || String(err).includes('password'))) {
      throw new Error('This PDF is password-protected. Please upload an unprotected PDF.')
    }
    if (err && (err.name === 'InvalidPDFException' || String(err).includes('Invalid PDF'))) {
      throw new Error('The uploaded file is not a valid PDF or is corrupted.')
    }
    throw new Error(`Failed to load PDF document: ${err.message || String(err)}`)
  }

  const numPages = pdfDoc.numPages
  const allLines = []
  let totalTextItems = 0

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const textContent = await page.getTextContent()

    if (!textContent || !textContent.items || textContent.items.length === 0) {
      continue
    }

    totalTextItems += textContent.items.length

    // Cluster items into lines by Y coordinate
    // Note: PDF origin (0, 0) is at bottom-left, so higher Y means higher on page (top).
    const lineBuckets = []
    const Y_TOLERANCE = 4.0 // pixels tolerance for characters on the same line

    for (const item of textContent.items) {
      const text = item.str
      if (!text || text.trim() === '') continue

      const x = item.transform[4]
      const y = item.transform[5]
      const width = item.width || 0

      // Find an existing line bucket within vertical tolerance
      let bucket = lineBuckets.find((b) => Math.abs(b.y - y) <= Y_TOLERANCE)
      if (!bucket) {
        bucket = { y, items: [] }
        lineBuckets.push(bucket)
      }
      bucket.items.push({ text, x, width })
    }

    // Sort lines top-to-bottom (descending Y)
    lineBuckets.sort((a, b) => b.y - a.y)

    for (const bucket of lineBuckets) {
      // Sort items on the same line left-to-right (ascending X)
      bucket.items.sort((a, b) => a.x - b.x)

      // Join items with tab delimiter when there is a significant column gap
      let lineText = ''
      for (let i = 0; i < bucket.items.length; i++) {
        const cur = bucket.items[i]
        if (i === 0) {
          lineText += cur.text
        } else {
          const prev = bucket.items[i - 1]
          const gap = cur.x - (prev.x + prev.width)
          // If gap is large (> 12px), treat it as a tabular column separation
          if (gap > 12) {
            lineText += '\t' + cur.text
          } else if (gap > 2) {
            lineText += ' ' + cur.text
          } else {
            lineText += cur.text
          }
        }
      }

      const trimmed = lineText.trim()
      if (trimmed.length > 0) {
        allLines.push(trimmed)
      }
    }
  }

  return { lines: allLines, totalTextItems, numPages }
}

/**
 * Checks if a string line appears to be a table header.
 */
function isHeaderLine(line) {
  const lower = line.toLowerCase()
  const headerKeywords = ['item', 'product', 'brand', 'platform', 'price', 'base_price', 'amount']
  let matchCount = 0
  for (const kw of headerKeywords) {
    if (lower.includes(kw)) matchCount++
  }
  return matchCount >= 2
}

/**
 * Checks if a line is irrelevant non-data text (e.g. invoice metadata, totals, footer).
 */
function isIgnorableLine(line) {
  const lower = line.toLowerCase().trim()
  if (lower.startsWith('---') || lower.startsWith('===') || lower.startsWith('___')) {
    return true
  }
  if (lower.startsWith('page ') || lower.includes('page ') || lower.startsWith('cart summary') || lower.startsWith('invoice') || lower.startsWith('order ') || lower.startsWith('retail enterprise')) {
    return true
  }
  if (lower.startsWith('subtotal') || lower.startsWith('grand total') || lower.startsWith('total:')) {
    return true
  }
  return false
}

/**
 * Tokenizes a single line of text into candidate columns:
 * Supports both 5-column layouts: [itemId, product, brand, platform, basePrice]
 * and 4-column layouts:          [product, brand, platform, basePrice]
 */
function tokenizeLine(line) {
  // Strategy 1: Tab-separated (created by column gap detector)
  if (line.includes('\t')) {
    const parts = line.split('\t').map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 5) {
      return {
        item_id: parts[0],
        product: parts[1],
        brand: parts[2],
        platform: parts[3],
        base_price: parts[4],
      }
    }
    if (parts.length === 4) {
      return {
        product: parts[0],
        brand: parts[1],
        platform: parts[2],
        base_price: parts[3],
      }
    }
  }

  // Strategy 2: Pipe-separated
  if (line.includes('|')) {
    const parts = line.split('|').map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 5) {
      return {
        item_id: parts[0],
        product: parts[1],
        brand: parts[2],
        platform: parts[3],
        base_price: parts[4],
      }
    }
    if (parts.length === 4) {
      return {
        product: parts[0],
        brand: parts[1],
        platform: parts[2],
        base_price: parts[3],
      }
    }
  }

  // Strategy 3: Comma-separated
  if (line.includes(',')) {
    const parts = line.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 5) {
      return {
        item_id: parts[0],
        product: parts[1],
        brand: parts[2],
        platform: parts[3],
        base_price: parts[4],
      }
    }
    if (parts.length === 4) {
      return {
        product: parts[0],
        brand: parts[1],
        platform: parts[2],
        base_price: parts[3],
      }
    }
  }

  // Strategy 4: Multiple spaces (>= 2 spaces between columns)
  const multiSpaceParts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
  if (multiSpaceParts.length >= 5) {
    return {
      item_id: multiSpaceParts[0],
      product: multiSpaceParts[1],
      brand: multiSpaceParts[2],
      platform: multiSpaceParts[3],
      base_price: multiSpaceParts[4],
    }
  }
  if (multiSpaceParts.length === 4) {
    return {
      product: multiSpaceParts[0],
      brand: multiSpaceParts[1],
      platform: multiSpaceParts[2],
      base_price: multiSpaceParts[3],
    }
  }

  // Strategy 5: Space-separated with regex anchoring (item_id at start, price at end)
  const match5 = line.match(/^([A-Za-z0-9_-]+)\s+(.+)\s+(\d+(?:[.,]\d+)?)$/)
  if (match5) {
    const itemId = match5[1]
    const middle = match5[2].trim()
    const basePrice = match5[3]

    const words = middle.split(/\s+/)
    if (words.length >= 3) {
      return {
        item_id: itemId,
        product: words.slice(0, words.length - 2).join(' '),
        brand: words[words.length - 2],
        platform: words[words.length - 1],
        base_price: basePrice,
      }
    }
  }

  return null
}

/**
 * Generates collision-safe item ID for 4-column carts lacking explicit item IDs.
 */
function generatePdfItemId(seenItemIds, index) {
  let num = index
  let id = `ITEM-${String(num).padStart(2, '0')}`
  while (seenItemIds.has(id)) {
    num++
    id = `ITEM-${String(num).padStart(2, '0')}`
  }
  return id
}

/**
 * Parses raw extracted text lines into validated CartItem objects.
 */
export function parseCartLines(lines) {
  const data = []
  const errors = []
  const seenItemIds = new Set()

  let hasSeenHeader = false
  let rowCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    if (isIgnorableLine(line)) {
      continue
    }

    if (isHeaderLine(line)) {
      hasSeenHeader = true
      continue
    }

    const candidate = tokenizeLine(line)
    if (!candidate) {
      if (hasSeenHeader) {
        errors.push(`Row ${rowCount + 2}: unable to extract required columns from line: "${line}"`)
      }
      continue
    }

    rowCount++

    // For 4-column layouts lacking an explicit item_id, generate a collision-safe ID
    if (!candidate.item_id) {
      candidate.item_id = generatePdfItemId(seenItemIds, rowCount)
    }

    const { item, error } = normalizeCartRow(candidate, rowCount)
    if (error) {
      errors.push(error)
      continue
    }

    if (seenItemIds.has(item.itemId)) {
      errors.push(`Row ${rowCount}: duplicate item ID "${item.itemId}"`)
      continue
    }

    seenItemIds.add(item.itemId)
    data.push(item)
  }

  if (data.length === 0 && errors.length === 0) {
    errors.push('No valid cart item rows could be identified in the PDF.')
  }

  return { data, errors }
}

/**
 * Primary entry point: accepts a File (browser) or ArrayBuffer/Uint8Array (Node).
 * Returns Promise<{ data: CartItem[], errors: string[] }>.
 */
export async function parseCartPDF(fileOrBuffer) {
  // If it's a File object, validate metadata first
  if (typeof File !== 'undefined' && fileOrBuffer instanceof File) {
    const validationError = validatePdfFile(fileOrBuffer)
    if (validationError) {
      return { data: [], errors: [validationError] }
    }
  }

  // Convert File or Blob to ArrayBuffer
  let dataBuffer
  if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
    try {
      dataBuffer = await fileOrBuffer.arrayBuffer()
    } catch (err) {
      return { data: [], errors: [`Failed to read file data: ${err.message || String(err)}`] }
    }
  } else if (fileOrBuffer instanceof ArrayBuffer || fileOrBuffer instanceof Uint8Array) {
    dataBuffer = fileOrBuffer
  } else {
    return { data: [], errors: ['Invalid input: expected a PDF File or ArrayBuffer.'] }
  }

  // Extract text lines
  let extraction
  try {
    extraction = await extractTextLinesFromPdf(dataBuffer)
  } catch (err) {
    return { data: [], errors: [err.message || 'Failed to extract text from PDF.'] }
  }

  const { lines, totalTextItems } = extraction

  // Check for scanned / image-only PDFs with no extractable text
  if (totalTextItems === 0 || lines.length === 0) {
    return {
      data: [],
      errors: [
        'No extractable text found in this PDF. Scanned or image-only PDFs without a digital text layer are not supported. Please upload a digital PDF or CSV.',
      ],
    }
  }

  // Parse lines into CartItem objects
  return parseCartLines(lines)
}
