import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePdfFile,
  parseCartLines,
  parseCartPDF,
  MAX_PDF_SIZE_BYTES,
} from '../src/engine/pdfParser.js'

describe('PDF Parser — File Validation', () => {
  it('rejects null or missing file', () => {
    const err = validatePdfFile(null)
    assert.match(err, /No file selected/)
  })

  it('rejects non-PDF file extension', () => {
    const file = { name: 'invoice.docx', size: 1024 }
    const err = validatePdfFile(file)
    assert.match(err, /Invalid file type/)
  })

  it('rejects empty (0 byte) PDF', () => {
    const file = { name: 'cart.pdf', size: 0 }
    const err = validatePdfFile(file)
    assert.match(err, /empty \(0 bytes\)/)
  })

  it('rejects PDF exceeding size limit', () => {
    const file = { name: 'huge_cart.pdf', size: MAX_PDF_SIZE_BYTES + 1024 }
    const err = validatePdfFile(file)
    assert.match(err, /exceeds the 10 MB limit/)
  })

  it('accepts valid PDF file within size limits', () => {
    const file = { name: 'cart.pdf', size: 25 * 1024 }
    const err = validatePdfFile(file)
    assert.equal(err, null)
  })
})

describe('PDF Parser — Tabular Line Parsing', () => {
  it('parses tab-delimited cart lines into CartItems', () => {
    const lines = [
      'Item\tProduct\tBrand\tPlatform\tPrice',
      'ITEM-01\tCushion Cover\tNatura Casa\tAmazon India\t1299',
      'ITEM-02\tBed Sheet Set\tNatura Casa\tFlipkart\t849',
    ]
    const { data, errors } = parseCartLines(lines)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 2)
    assert.deepEqual(data[0], {
      itemId: 'ITEM-01',
      product: 'Cushion Cover',
      brand: 'Natura Casa',
      platform: 'Amazon India',
      basePrice: 1299,
    })
    assert.deepEqual(data[1], {
      itemId: 'ITEM-02',
      product: 'Bed Sheet Set',
      brand: 'Natura Casa',
      platform: 'Flipkart',
      basePrice: 849,
    })
  })

  it('parses pipe-delimited cart lines with surrounding metadata', () => {
    const lines = [
      'Invoice #12345',
      'Page 1 of 1',
      'item_id | product | brand | platform | base_price',
      'ITEM-03 | Wall Shelf | LivSpace Pro | Amazon India | 599',
      'Subtotal: 599',
      'Total: 599',
    ]
    const { data, errors } = parseCartLines(lines)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 1)
    assert.equal(data[0].itemId, 'ITEM-03')
    assert.equal(data[0].basePrice, 599)
  })

  it('parses multi-space separated tabular lines', () => {
    const lines = [
      'item_id       product         brand          platform       base_price',
      'ITEM-05       Cutting Board   Nordic Basics  Amazon India   449',
    ]
    const { data, errors } = parseCartLines(lines)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 1)
    assert.equal(data[0].itemId, 'ITEM-05')
    assert.equal(data[0].brand, 'Nordic Basics')
    assert.equal(data[0].basePrice, 449)
  })

  it('detects and flags invalid prices', () => {
    const lines = [
      'Item\tProduct\tBrand\tPlatform\tPrice',
      'ITEM-01\tCushion Cover\tNatura Casa\tAmazon India\tFREE',
    ]
    const { data, errors } = parseCartLines(lines)
    assert.equal(data.length, 0)
    assert.ok(errors.length > 0)
    assert.match(errors[0], /base_price must be a positive number/)
  })

  it('detects and flags duplicate item IDs', () => {
    const lines = [
      'Item\tProduct\tBrand\tPlatform\tPrice',
      'ITEM-01\tCushion Cover\tNatura Casa\tAmazon India\t1299',
      'ITEM-01\tDuplicate Item\tNatura Casa\tAmazon India\t1500',
    ]
    const { data, errors } = parseCartLines(lines)
    assert.equal(data.length, 1)
    assert.ok(errors.length > 0)
    assert.match(errors[0], /duplicate item ID "ITEM-01"/)
  })

  it('detects missing fields in malformed rows', () => {
    const lines = [
      'Item\tProduct\tBrand\tPlatform\tPrice',
      'ITEM-01\tIncomplete Item',
    ]
    const { errors } = parseCartLines(lines)
    assert.ok(errors.length > 0)
    assert.match(errors[0], /unable to extract required columns/)
  })

  it('returns clean error when no valid cart rows are found', () => {
    const lines = [
      'Invoice #999',
      'Company Name: Opptra Retail Ltd',
      'Thank you for your business!',
    ]
    const { data, errors } = parseCartLines(lines)
    assert.equal(data.length, 0)
    assert.ok(errors.length > 0)
    assert.match(errors[0], /No valid cart item rows could be identified/)
  })
})

describe('PDF Parser — Binary and Edge Case Handling', () => {
  it('successfully extracts all 6 cart items from sample-data/cart.pdf', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const pdfPath = path.resolve('sample-data/cart.pdf')
    const buffer = fs.readFileSync(pdfPath)

    const res = await parseCartPDF(buffer)
    assert.equal(res.errors.length, 0)
    assert.equal(res.data.length, 6)
    assert.equal(res.data[0].itemId, 'ITEM-01')
    assert.equal(res.data[0].product, 'Cushion Cover')
    assert.equal(res.data[0].brand, 'Natura Casa')
    assert.equal(res.data[0].platform, 'Amazon India')
    assert.equal(res.data[0].basePrice, 1299)
    assert.equal(res.data[5].itemId, 'ITEM-06')
    assert.equal(res.data[5].basePrice, 899)
  })

  it('returns error when input is invalid', async () => {
    const res = await parseCartPDF(null)
    assert.equal(res.data.length, 0)
    assert.ok(res.errors.length > 0)
    assert.match(res.errors[0], /Invalid input/)
  })

  it('returns error when buffer is not a valid PDF', async () => {
    const fakeBuffer = new Uint8Array([1, 2, 3, 4, 5])
    const res = await parseCartPDF(fakeBuffer)
    assert.equal(res.data.length, 0)
    assert.ok(res.errors.length > 0)
    assert.match(res.errors[0], /not a valid PDF|Failed to load PDF/)
  })
})
