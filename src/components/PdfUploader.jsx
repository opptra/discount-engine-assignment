/**
 * PdfUploader.jsx
 *
 * Dedicated PDF file upload component for cart ingestion.
 * Follows CsvUploader conventions while providing async parsing,
 * loading state feedback, and file validation.
 */

import { useRef, useState } from 'react'
import { parseCartPDF, validatePdfFile } from '../engine/pdfParser.js'

export default function PdfUploader({ onParsed, onError, disabled = false }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return

    // Pre-validation
    const validationError = validatePdfFile(file)
    if (validationError) {
      if (onError) onError(validationError)
      e.target.value = ''
      return
    }

    setLoading(true)
    try {
      const { data, errors } = await parseCartPDF(file)
      if (onParsed) {
        onParsed({ data, errors, fileName: file.name })
      }
    } catch (err) {
      if (onError) {
        onError(`PDF Extraction failed: ${err.message || String(err)}`)
      }
    } finally {
      setLoading(false)
      // Reset input value so the same PDF file can be uploaded again
      e.target.value = ''
    }
  }

  return (
    <div
      style={{
        border: '2px dashed #CECECE',
        borderRadius: 6,
        padding: '1rem 1.2rem',
        background: loading ? '#f7f7f9' : '#fafafa',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.6 : 1,
      }}
      onClick={() => {
        if (!disabled && !loading) {
          inputRef.current?.click()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleFile}
        disabled={disabled || loading}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }}>{loading ? '⏳' : '📑'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>
            {loading ? 'Processing PDF...' : 'Upload Cart PDF'}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {loading ? 'Extracting tabular item data...' : 'Select a digital PDF invoice or cart export'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: loading ? '#888' : '#FF5800',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {loading ? 'Reading...' : 'Upload PDF'}
          </span>
        </div>
      </div>
    </div>
  )
}
