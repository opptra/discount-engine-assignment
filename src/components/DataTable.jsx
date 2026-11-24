/**
 * DataTable.jsx
 *
 * Enhanced data table component with optional search/filtering,
 * client-side pagination, sticky headers, and responsive layout.
 * Supports custom cell renderers and maintains 100% backward compatibility.
 */

import { useState, useMemo } from 'react'

export default function DataTable({
  columns,
  rows,
  emptyMessage = 'No data loaded.',
  searchable = false,
  searchPlaceholder = 'Filter records...',
  pageSize = 15,
  maxHeight,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [showAll, setShowAll] = useState(false)

  // Filter rows based on search term across all column values
  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return []
    if (!searchTerm.trim()) return rows

    const q = searchTerm.toLowerCase().trim()
    return rows.filter((row) => {
      return columns.some((col) => {
        const val = row[col.key]
        if (val === null || val === undefined) return false
        return String(val).toLowerCase().includes(q)
      })
    })
  }, [rows, columns, searchTerm])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    if (showAll || !pageSize || filteredRows.length <= pageSize) {
      return filteredRows
    }
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize, showAll])

  if (!rows || rows.length === 0) {
    return (
      <div
        style={{
          padding: '1.2rem',
          textAlign: 'center',
          color: '#888',
          fontSize: 13,
          border: '1px solid #CECECE',
          borderRadius: 6,
          background: '#fff',
        }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Table controls: Search + Counter */}
      {searchable && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.25rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              placeholder={searchPlaceholder}
              style={{
                width: '100%',
                padding: '6px 10px 6px 28px',
                fontSize: 12,
                border: '1px solid #CECECE',
                borderRadius: 4,
                boxSizing: 'border-box',
                outline: 'none',
                color: '#131A48',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 9,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 12,
                color: '#888',
                pointerEvents: 'none',
              }}
            >
              🔍
            </span>
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  setPage(1)
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  color: '#888',
                  cursor: 'pointer',
                  padding: 2,
                }}
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>
            Showing {filteredRows.length} of {rows.length} {rows.length === 1 ? 'record' : 'records'}
            {searchTerm && ` (filtered)`}
          </div>
        </div>
      )}

      {/* Table container */}
      <div
        style={{
          overflowX: 'auto',
          maxHeight: maxHeight || undefined,
          overflowY: maxHeight ? 'auto' : undefined,
          border: '1px solid #CECECE',
          borderRadius: 6,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr
              style={{
                background: '#131A48',
                color: '#fff',
                position: maxHeight ? 'sticky' : 'static',
                top: 0,
                zIndex: 2,
              }}
            >
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    borderBottom: '1px solid #0f143a',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '1.5rem',
                    textAlign: 'center',
                    color: '#888',
                    fontStyle: 'italic',
                  }}
                >
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, i) => (
                <tr
                  key={row.itemId || row.ruleId || i}
                  style={{
                    background: i % 2 === 0 ? '#fff' : '#fcfcfd',
                    borderBottom: '1px solid #eee',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f6fb')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fcfcfd')
                  }
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: '7px 12px',
                        color: '#131A48',
                        verticalAlign: 'middle',
                      }}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filteredRows.length > pageSize && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 2px',
            fontSize: 11,
            color: '#666',
          }}
        >
          <div>
            Page {page} of {totalPages} ({filteredRows.length} total)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              onClick={() => setShowAll(!showAll)}
              style={{
                background: 'none',
                border: '1px solid #CECECE',
                borderRadius: 3,
                padding: '2px 8px',
                fontSize: 11,
                cursor: 'pointer',
                color: '#131A48',
                fontWeight: 600,
              }}
            >
              {showAll ? `Show Pages (15/pg)` : `View All (${filteredRows.length})`}
            </button>
            {!showAll && totalPages > 1 && (
              <>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    background: '#fff',
                    border: '1px solid #CECECE',
                    borderRadius: 3,
                    padding: '2px 8px',
                    fontSize: 11,
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    color: page <= 1 ? '#aaa' : '#131A48',
                  }}
                >
                  ‹ Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    background: '#fff',
                    border: '1px solid #CECECE',
                    borderRadius: 3,
                    padding: '2px 8px',
                    fontSize: 11,
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    color: page >= totalPages ? '#aaa' : '#131A48',
                  }}
                >
                  Next ›
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
