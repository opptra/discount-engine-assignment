/**
 * App.jsx
 *
 * Top-level component for Opptra Discount Engine.
 * Wires together multi-channel inputs:
 *  - CSV Cart Ingestion
 *  - PDF Invoice Extraction
 *  - CSV Discount Rule Import
 *  - AI Natural Language Rule Creation
 * Automatically recalculates discounts using the deterministic calculation engine.
 */

import { useState, useMemo } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import PdfUploader from './components/PdfUploader.jsx'
import CartPreviewModal from './components/CartPreviewModal.jsx'
import RuleCreator from './components/RuleCreator.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { processCart, cartTotal } from './engine/discountEngine.js'

// ── Badge Helpers ──────────────────────────────────────────────────

function badgeStyle(color, bg, borderColor = 'transparent') {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 12,
    background: bg,
    color: color,
    border: `1px solid ${borderColor}`,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
  }
}

// ── Column Definitions ─────────────────────────────────────────────

const RULES_COLUMNS = [
  {
    key: 'ruleId',
    label: 'Rule ID',
    render: (v) => {
      const isAi = v && v.startsWith('RULE-AI-')
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#131A48' }}>
            {v}
          </span>
          {isAi ? (
            <span style={badgeStyle('#1e5c2c', '#eaf7ed', '#b7e4c7')}>AI Generated</span>
          ) : (
            <span style={badgeStyle('#555', '#f0f0f4')}>CSV</span>
          )}
        </div>
      )
    },
  },
  {
    key: 'scope',
    label: 'Scope',
    render: (v) => {
      if (v === 'brand') return <span style={badgeStyle('#0288d1', '#e1f5fe', '#b3e5fc')}>Brand</span>
      if (v === 'platform') return <span style={badgeStyle('#7b1fa2', '#f3e5f5', '#e1bee7')}>Platform</span>
      if (v === 'cart') return <span style={badgeStyle('#e65100', '#fff3e0', '#ffe0b2')}>Cart</span>
      return v
    },
  },
  {
    key: 'appliesTo',
    label: 'Target / Condition',
    render: (v, row) => {
      if (row.scope === 'cart') {
        return row.minSpend > 0 ? (
          <span style={{ fontWeight: 600, color: '#131A48' }}>
            Orders ≥ Rs.{row.minSpend.toLocaleString('en-IN')}
          </span>
        ) : (
          <span style={{ color: '#666', fontStyle: 'italic' }}>All Cart Orders</span>
        )
      }
      return <strong style={{ color: '#131A48' }}>{v}</strong>
    },
  },
  {
    key: 'type',
    label: 'Type',
    render: (v) => {
      return v === 'percentage' ? (
        <span style={badgeStyle('#2e7d32', '#e8f5e9')}>% Off</span>
      ) : (
        <span style={badgeStyle('#00695c', '#e0f2f1')}>Flat Off</span>
      )
    },
  },
  {
    key: 'value',
    label: 'Discount',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: '#131A48', fontSize: 13 }}>
        {row.type === 'percentage' ? `${v}%` : `Rs.${v.toLocaleString('en-IN')}`}
      </span>
    ),
  },
  {
    key: 'stackable',
    label: 'Stackability',
    render: (v) =>
      v ? (
        <span style={badgeStyle('#1565c0', '#e3f2fd', '#bbdefb')}>✓ Stackable</span>
      ) : (
        <span style={badgeStyle('#546e7a', '#eceff1')}>Exclusive (Best)</span>
      ),
  },
]

const CART_COLUMNS = [
  {
    key: 'itemId',
    label: 'Item ID',
    render: (v) => <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11 }}>{v}</span>,
  },
  {
    key: 'product',
    label: 'Product',
    render: (v) => <span style={{ fontWeight: 600, color: '#131A48' }}>{v}</span>,
  },
  {
    key: 'brand',
    label: 'Brand',
    render: (v) => <span style={badgeStyle('#0288d1', '#f0f9ff')}>{v}</span>,
  },
  {
    key: 'platform',
    label: 'Platform',
    render: (v) => <span style={badgeStyle('#5b21b6', '#f5f3ff')}>{v}</span>,
  },
  {
    key: 'basePrice',
    label: 'Base Price',
    render: (v) => (
      <span style={{ fontWeight: 700, color: '#131A48', fontSize: 13 }}>
        Rs.{v.toLocaleString('en-IN')}
      </span>
    ),
  },
]

// ── Styles ─────────────────────────────────────────────────────────

const S = {
  page: { minHeight: '100vh', background: '#f5f6fa', fontFamily: 'Arial, sans-serif' },
  header: {
    background: '#131A48',
    padding: '0.9rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '3px solid #FF5800',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  logoTxt: {
    fontFamily: 'Georgia, serif',
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  logoSpan: { color: '#FF5800' },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
  },
  main: { maxWidth: 1040, margin: '0 auto', padding: '1.6rem 1.2rem' },

  // Executive KPI Cards
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.9rem',
    marginBottom: '1.4rem',
  },
  kpiCard: {
    background: '#fff',
    border: '1px solid #CECECE',
    borderRadius: 8,
    padding: '0.9rem 1.1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 4,
  },
  kpiValue: {
    fontFamily: 'Georgia, serif',
    fontSize: 20,
    fontWeight: 700,
    color: '#131A48',
  },
  kpiSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },

  // Main Section Cards
  section: {
    background: '#fff',
    border: '1px solid #d4d4d8',
    borderRadius: 8,
    padding: '1.3rem 1.5rem',
    marginBottom: '1.3rem',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
    paddingBottom: '0.5rem',
    borderBottom: '2px solid #FF5800',
  },
  sectionTitle: {
    fontFamily: 'Georgia, serif',
    fontWeight: 700,
    fontSize: 16,
    color: '#131A48',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#666',
    marginBottom: '1rem',
    lineHeight: 1.45,
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },

  // Summary Container
  summaryContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.5rem',
    marginTop: '1.2rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e4e4e7',
  },
  summaryLine: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '360px',
    fontSize: 13,
    color: '#52525b',
  },
  summaryFinalLine: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '360px',
    fontSize: 18,
    fontWeight: 700,
    color: '#131A48',
    paddingTop: '0.75rem',
    marginTop: '0.3rem',
    borderTop: '2px solid #131A48',
  },
}

// ── Helpers ────────────────────────────────────────────────────────

function generateNextRuleId(existingRules) {
  let maxAiIndex = 0
  for (const r of existingRules) {
    if (!r || !r.ruleId) continue
    const match = r.ruleId.match(/^RULE-AI-(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxAiIndex) maxAiIndex = num
    }
  }
  let candidateNum = maxAiIndex + 1
  let ruleId = `RULE-AI-${String(candidateNum).padStart(2, '0')}`
  while (existingRules.some((r) => r.ruleId === ruleId)) {
    candidateNum++
    ruleId = `RULE-AI-${String(candidateNum).padStart(2, '0')}`
  }
  return ruleId
}

function recalculateDiscounts(cart, activeRules) {
  if (cart && cart.length > 0 && activeRules && activeRules.length > 0) {
    return processCart(cart, activeRules)
  }
  return null
}

// ── Component ──────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErr] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')

  const [pendingPdfCart, setPendingPdfCart] = useState(null)
  const [results, setResults] = useState(null)

  // ── Executive KPI Metrics ──
  const kpiData = useMemo(() => {
    const totalItems = cartItems.length
    const originalTotal = cartItems.reduce((sum, item) => sum + item.basePrice, 0)
    const payable = results ? cartTotal(results) : null
    const totalSavings = results ? originalTotal - payable : null
    const savingsPercent =
      results && originalTotal > 0 ? ((totalSavings / originalTotal) * 100).toFixed(1) : null
    const aiRulesCount = rules.filter((r) => r.ruleId && r.ruleId.startsWith('RULE-AI-')).length
    const csvRulesCount = rules.length - aiRulesCount

    return {
      totalItems,
      originalTotal,
      payable,
      totalSavings,
      savingsPercent,
      activeRulesCount: rules.length,
      aiRulesCount,
      csvRulesCount,
    }
  }, [cartItems, rules, results])

  // Results Column Definition (with interactive skipped rules breakdown)
  const resultsColumns = useMemo(
    () => [
      {
        key: 'itemId',
        label: 'Item ID',
        render: (v) => <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11 }}>{v}</span>,
      },
      {
        key: 'product',
        label: 'Product',
        render: (v) => <span style={{ fontWeight: 600, color: '#131A48' }}>{v}</span>,
      },
      {
        key: 'basePrice',
        label: 'Base Price',
        render: (v, row) => (
          <span
            style={{
              textDecoration: row.totalDiscount > 0 ? 'line-through' : 'none',
              color: row.totalDiscount > 0 ? '#71717a' : '#131A48',
              fontSize: 12,
            }}
          >
            Rs.{v.toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        key: 'reasoning',
        label: 'Offer Applied',
        render: (v, row) => {
          const hasDiscount = row.totalDiscount > 0
          return (
            <div>
              <div
                style={{
                  color: hasDiscount ? '#131A48' : '#888',
                  fontStyle: hasDiscount ? 'normal' : 'italic',
                  fontWeight: hasDiscount ? 600 : 400,
                  fontSize: 12,
                }}
              >
                {v}
              </div>
              {row.skippedRules && row.skippedRules.length > 0 && (
                <div style={{ marginTop: 3 }}>
                  <span
                    title={`Skipped competing rules: ${row.skippedRules.join(', ')}`}
                    style={{
                      fontSize: 10,
                      color: '#b45309',
                      background: '#fef3c7',
                      padding: '1px 5px',
                      borderRadius: 4,
                      fontWeight: 600,
                      display: 'inline-block',
                    }}
                  >
                    ℹ {row.skippedRules.length} offer{row.skippedRules.length > 1 ? 's' : ''} beaten
                  </span>
                </div>
              )}
            </div>
          )
        },
      },
      {
        key: 'totalDiscount',
        label: 'You Save',
        render: (v) =>
          v > 0 ? (
            <span style={{ color: '#1e5c2c', fontWeight: 700, fontSize: 12 }}>
              -Rs.{v.toLocaleString('en-IN')}
            </span>
          ) : (
            <span style={{ color: '#a1a1aa' }}>—</span>
          ),
      },
      {
        key: 'finalPrice',
        label: 'Final Price',
        render: (v, row) => (
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48',
            }}
          >
            Rs.{v.toLocaleString('en-IN')}
          </span>
        ),
      },
    ],
    []
  )

  // ── Handlers ──

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    if (errors && errors.length > 0) {
      // All-or-Nothing policy: preserve active rules on import failure
      setRulesErr(errors)
      return
    }
    setRules(data)
    setRulesErr([])
    setRulesFileName(fileName)
    setResults(recalculateDiscounts(cartItems, data))
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    if (errors && errors.length > 0) {
      // All-or-Nothing policy: preserve active cart items on import failure
      setCartErrors(errors)
      return
    }
    setCartItems(data)
    setCartErrors([])
    setCartFileName(fileName)
    setPendingPdfCart(null)
    setResults(recalculateDiscounts(data, rules))
  }

  function handlePdfParsed({ data, errors, fileName }) {
    if (data.length === 0 && errors.length > 0) {
      setCartErrors(errors)
      return
    }
    setPendingPdfCart({ items: data, fileName, errors })
  }

  function handlePdfError(errorMessage) {
    setCartErrors([errorMessage])
  }

  function handleConfirmPdfCart() {
    if (!pendingPdfCart) return
    const newItems = pendingPdfCart.items
    const fileName = pendingPdfCart.fileName
    const errors = pendingPdfCart.errors || []

    setCartItems(newItems)
    setCartFileName(fileName)
    setCartErrors(errors)
    setPendingPdfCart(null)

    setResults(recalculateDiscounts(newItems, rules))
  }

  function handleCancelPdfCart() {
    setPendingPdfCart(null)
  }

  function handleRuleConfirmed(interpretedRule) {
    // Pure state updates: compute updated rules collection outside setter
    const ruleId = generateNextRuleId(rules)

    const newRule = {
      ruleId,
      scope: interpretedRule.scope,
      appliesTo: interpretedRule.appliesTo,
      type: interpretedRule.type,
      value: interpretedRule.value,
      stackable: interpretedRule.stackable,
      minSpend: interpretedRule.minSpend || 0,
    }

    const updatedRules = [...rules, newRule]
    setRules(updatedRules)
    // Sibling state update: recalculate discounts without nesting inside updater
    setResults(recalculateDiscounts(cartItems, updatedRules))
  }

  // ── Render ──

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoTxt}>
          O<span style={S.logoSpan}>pp</span>tra
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={S.headerSub}>Retail Discount Engine</span>
          <span
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 12,
              fontWeight: 700,
            }}
          >
            v2.1 Enterprise
          </span>
        </div>
      </div>

      <div style={S.main}>
        {/* ── EXECUTIVE KPI DASHBOARD ────────────────────────────── */}
        <div style={S.kpiGrid}>
          {/* Card 1: Total Cart Items */}
          <div style={S.kpiCard}>
            <div style={S.kpiLabel}>Total Cart Items</div>
            <div style={S.kpiValue}>
              {kpiData.totalItems > 0 ? `${kpiData.totalItems} Items` : '0 Items'}
            </div>
            <div style={S.kpiSub}>
              {kpiData.totalItems > 0 ? (
                <span>
                  Source: <strong>{cartFileName}</strong>
                </span>
              ) : (
                'Upload cart CSV or PDF below'
              )}
            </div>
          </div>

          {/* Card 2: Original Cart Value */}
          <div style={S.kpiCard}>
            <div style={S.kpiLabel}>Original Cart Value</div>
            <div style={S.kpiValue}>
              {kpiData.totalItems > 0
                ? `Rs.${kpiData.originalTotal.toLocaleString('en-IN')}`
                : '—'}
            </div>
            <div style={S.kpiSub}>Gross retail subtotal before discounts</div>
          </div>

          {/* Card 3: Total Savings */}
          <div style={S.kpiCard}>
            <div style={S.kpiLabel}>Total Customer Savings</div>
            <div
              style={{
                ...S.kpiValue,
                color: kpiData.totalSavings > 0 ? '#1e5c2c' : '#131A48',
              }}
            >
              {kpiData.totalSavings !== null
                ? `Rs.${kpiData.totalSavings.toLocaleString('en-IN')}`
                : '—'}
            </div>
            <div style={S.kpiSub}>
              {kpiData.savingsPercent !== null && kpiData.totalSavings > 0
                ? `${kpiData.savingsPercent}% total discount unlocked`
                : 'Awaiting calculation'}
            </div>
          </div>

          {/* Card 4: Final Net Payable */}
          <div style={S.kpiCard}>
            <div style={S.kpiLabel}>Final Net Payable</div>
            <div style={{ ...S.kpiValue, color: '#131A48' }}>
              {kpiData.payable !== null ? `Rs.${kpiData.payable.toLocaleString('en-IN')}` : '—'}
            </div>
            <div style={S.kpiSub}>
              {results?.cartDiscount > 0
                ? `Includes Rs.${results.cartDiscount.toLocaleString('en-IN')} cart discount`
                : 'Item discounts applied'}
            </div>
          </div>

          {/* Card 5: Active Rules */}
          <div style={S.kpiCard}>
            <div style={S.kpiLabel}>Active Rules</div>
            <div style={S.kpiValue}>{kpiData.activeRulesCount} Rules</div>
            <div style={S.kpiSub}>
              {kpiData.activeRulesCount > 0
                ? `${kpiData.csvRulesCount} CSV · ${kpiData.aiRulesCount} AI Created`
                : 'Import CSV or type AI rule'}
            </div>
          </div>
        </div>

        {/* ── SECTION 1: CART INPUT ─────────────────────────────── */}
        <div style={S.section}>
          <div style={S.sectionHeader}>
            <div style={S.sectionTitle}>1. Cart Ingestion</div>
            {cartItems.length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#1e5c2c',
                  background: '#eaf7ed',
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                ● Active Cart: {cartFileName} ({cartItems.length} items)
              </span>
            )}
          </div>
          <div style={S.sectionDesc}>
            Load or replace cart items using <strong>CSV</strong> or multi-page digital <strong>PDF</strong> invoices.
            Switching or re-uploading carts preserves all currently active discount rules.
          </div>

          <div style={S.grid2}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#131A48',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Upload Cart CSV
              </div>
              <CsvUploader
                label="cart.csv"
                description="Upload cart items CSV (e.g. sample-data/advanced-retailer/advanced-cart.csv)"
                onLoad={handleCartLoad}
                hasData={cartItems.length > 0 && cartFileName.toLowerCase().endsWith('.csv')}
                fileName={cartFileName}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#131A48',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Upload Cart PDF
              </div>
              <PdfUploader onParsed={handlePdfParsed} onError={handlePdfError} />
            </div>
          </div>

          <ErrorBanner errors={cartErrors} />

          {cartItems.length > 0 && (
            <div style={{ marginTop: '1.2rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.9rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#131A48' }}>
                  Loaded Cart Items ({cartItems.length})
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>
                  Format:{' '}
                  <strong>{cartFileName.toLowerCase().endsWith('.pdf') ? 'Digital PDF' : 'Standard CSV'}</strong>
                </div>
              </div>
              <DataTable
                columns={CART_COLUMNS}
                rows={cartItems}
                searchable={true}
                searchPlaceholder="Search product, brand, platform, or ID..."
                pageSize={15}
                maxHeight="440px"
              />
            </div>
          )}
        </div>

        {/* ── SECTION 2: DISCOUNT RULE INPUT ───────────────────── */}
        <div style={S.section}>
          <div style={S.sectionHeader}>
            <div style={S.sectionTitle}>2. Discount Rule Management</div>
            {rules.length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#1565c0',
                  background: '#e3f2fd',
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                ● Active Rules: {rules.length} ({rules.filter((r) => r.ruleId.startsWith('RULE-AI-')).length} AI)
              </span>
            )}
          </div>
          <div style={S.sectionDesc}>
            Import enterprise discount rules from CSV or create ad-hoc promotional rules using Natural Language.
            All rules dynamically co-exist and automatically calculate on the loaded cart.
          </div>

          <div style={{ marginBottom: '1.2rem' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#131A48',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Upload Rules CSV
            </div>
            <CsvUploader
              label="rules.csv"
              description="Import rules CSV (e.g. sample-data/advanced-retailer/advanced-rules.csv)"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0 && rulesFileName.toLowerCase().endsWith('.csv')}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#131A48',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Create Rule Using Natural Language
            </div>
            <RuleCreator onRuleConfirmed={handleRuleConfirmed} style={{ marginBottom: 0 }} />
          </div>

          {rules.length > 0 && (
            <div style={{ marginTop: '1.2rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.9rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#131A48' }}>
                  Active Rulebook ({rules.length} rules)
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>
                  {kpiData.csvRulesCount} from CSV · {kpiData.aiRulesCount} from Natural Language
                </div>
              </div>
              <DataTable
                columns={RULES_COLUMNS}
                rows={rules}
                searchable={true}
                searchPlaceholder="Search rules by brand, platform, scope, or ID..."
                pageSize={15}
                maxHeight="420px"
              />
            </div>
          )}
        </div>

        {/* ── SECTION 3: CALCULATION RESULTS & SAVINGS SUMMARY ─── */}
        {results && (
          <div style={S.section}>
            <div style={S.sectionHeader}>
              <div style={S.sectionTitle}>3. Discount Calculation & Payable Summary</div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#1e5c2c',
                  background: '#eaf7ed',
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                ✓ Live Deterministic Calculation
              </span>
            </div>
            <div style={S.sectionDesc}>
              Item-level discounts apply highest saving offers (or stacked offers), followed by order-level cart thresholds.
            </div>

            <DataTable
              columns={resultsColumns}
              rows={results.items || results}
              searchable={true}
              searchPlaceholder="Search evaluated items or offers..."
              pageSize={15}
              maxHeight="480px"
            />

            {/* Cart Summary & Order Discounts */}
            <div style={S.summaryContainer}>
              <div style={S.summaryLine}>
                <span>Gross Items Subtotal:</span>
                <span style={{ fontWeight: 600, color: '#131A48' }}>
                  Rs.{kpiData.originalTotal.toLocaleString('en-IN')}
                </span>
              </div>

              {kpiData.originalTotal > (results.subtotal ?? 0) && (
                <div style={S.summaryLine}>
                  <span>Total Item-Level Discounts:</span>
                  <span style={{ fontWeight: 600, color: '#1e5c2c' }}>
                    -Rs.{(kpiData.originalTotal - results.subtotal).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div style={S.summaryLine}>
                <span>Discounted Items Subtotal:</span>
                <span style={{ fontWeight: 600, color: '#131A48' }}>
                  Rs.{(results.subtotal ?? cartTotal(results)).toLocaleString('en-IN')}
                </span>
              </div>

              {results.cartDiscount > 0 ? (
                <div style={S.summaryLine}>
                  <div>
                    <span>Cart-Level Discount </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#1e5c2c',
                        background: '#eaf7ed',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontWeight: 600,
                      }}
                    >
                      {results.cartReasoning}
                    </span>
                  </div>
                  <span style={{ fontWeight: 700, color: '#1e5c2c' }}>
                    -Rs.{results.cartDiscount.toLocaleString('en-IN')}
                  </span>
                </div>
              ) : (
                results.skippedCartRules &&
                results.skippedCartRules.length > 0 && (
                  <div style={{ ...S.summaryLine, fontSize: 11, color: '#71717a', fontStyle: 'italic' }}>
                    <span>Cart Threshold Offers:</span>
                    <span>No cart thresholds met for subtotal Rs.{results.subtotal?.toLocaleString('en-IN')}</span>
                  </div>
                )
              )}

              <div style={S.summaryFinalLine}>
                <span>Final Net Payable:</span>
                <span style={{ color: '#131A48', fontSize: 20 }}>
                  Rs.{cartTotal(results).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* PDF Cart Preview & Confirmation Modal */}
        <CartPreviewModal
          pendingCart={pendingPdfCart}
          columns={CART_COLUMNS}
          onConfirm={handleConfirmPdfCart}
          onCancel={handleCancelPdfCart}
        />
      </div>
    </div>
  )
}
