/**
 * CartPreviewModal.jsx
 *
 * Confirmation dialog shown after a PDF is parsed.
 * Allows the user to inspect extracted cart items and any row-level warnings
 * before deciding to replace their current cart or cancel.
 */

import DataTable from './DataTable.jsx'
import ErrorBanner from './ErrorBanner.jsx'

export default function CartPreviewModal({ pendingCart, columns, onConfirm, onCancel }) {
  if (!pendingCart) return null

  const { items, fileName, errors } = pendingCart

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(19, 26, 72, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          maxWidth: 820,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.2rem 1.5rem',
            borderBottom: '1px solid #CECECE',
            background: '#131A48',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 16 }}>
              Review Extracted Cart Items
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              Source PDF: <strong>{fileName}</strong> — {items.length} item{items.length === 1 ? '' : 's'} identified
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
            }}
            title="Cancel"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.2rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              background: '#e8f4fd',
              borderLeft: '4px solid #0288d1',
              padding: '0.65rem 0.9rem',
              borderRadius: 4,
              fontSize: 12,
              color: '#01579b',
              marginBottom: '1rem',
            }}
          >
            Review the extracted rows below. Clicking <strong>Confirm & Replace Cart</strong> will update your active cart. Your loaded discount rules will remain active.
          </div>

          {errors && errors.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <ErrorBanner errors={errors} />
            </div>
          )}

          {items.length > 0 ? (
            <DataTable columns={columns} rows={items} />
          ) : (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#888',
                border: '1px dashed #CECECE',
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              No valid items could be extracted from this PDF.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #CECECE',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.8rem',
            alignItems: 'center',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              background: '#fff',
              border: '1px solid #CECECE',
              color: '#555',
              padding: '0.6rem 1.4rem',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={items.length === 0}
            style={{
              background: items.length > 0 ? '#1e5c2c' : '#CECECE',
              border: 'none',
              color: '#fff',
              padding: '0.6rem 1.6rem',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: items.length > 0 ? 'pointer' : 'not-allowed',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Confirm & Replace Cart
          </button>
        </div>
      </div>
    </div>
  )
}
