/**
 * RuleCreator.jsx
 *
 * Natural-language rule authoring component.
 * Allows users to type discount instructions in plain English,
 * sends them to the backend /api/rules/interpret endpoint,
 * displays preview or clarification requests,
 * and requires explicit confirmation before activating the rule.
 */

import { useState } from 'react'

const EXAMPLES = [
  'Give 20% off on all Natura Casa products',
  'Give 15% off on Amazon India, and allow it to stack',
  'Give 10% off when the cart total reaches Rs.4,000',
  'Give Rs.150 off on Natura Casa products',
]

export default function RuleCreator({ onRuleConfirmed, disabled = false, style }) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [clarification, setClarification] = useState(null)
  const [proposedRule, setProposedRule] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  async function handleInterpret(e) {
    if (e) e.preventDefault()
    if (!instruction.trim() || loading || disabled) return

    setLoading(true)
    setError(null)
    setClarification(null)
    setProposedRule(null)
    setSuccessMsg(null)

    try {
      const response = await fetch('/api/rules/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || `Server returned error ${response.status}`)
      }

      if (data.status === 'needs_clarification') {
        setClarification(data.question)
      } else if (data.status === 'success' && data.rule) {
        setProposedRule(data.rule)
      } else {
        setError(data.message || 'Unable to interpret discount rule.')
      }
    } catch (err) {
      setError(
        `Interpretation service unavailable: ${err.message}. (Ensure the backend server is running on port 3001 with GEMINI_API_KEY configured).`
      )
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm() {
    if (!proposedRule) return
    if (onRuleConfirmed) {
      onRuleConfirmed(proposedRule)
    }
    setSuccessMsg(`Rule added successfully!`)
    setProposedRule(null)
    setInstruction('')
    setClarification(null)
    setError(null)
  }

  function handleCancel() {
    setProposedRule(null)
    setClarification(null)
    setError(null)
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #CECECE',
        borderRadius: 6,
        padding: '1.2rem 1.4rem',
        marginBottom: '1.2rem',
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
          fontSize: 14,
          color: '#131A48',
          marginBottom: '0.4rem',
          paddingBottom: 4,
          borderBottom: '2px solid #FF5800',
          display: 'inline-block',
        }}
      >
        AI Rule Creator (Natural Language)
      </div>

      <div style={{ fontSize: 12, color: '#666', marginBottom: '0.75rem' }}>
        Describe your discount rule in plain English. The AI will convert it into a structured rule for your review.
      </div>

      {/* Example Prompts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', alignSelf: 'center' }}>Try:</span>
        {EXAMPLES.map((ex, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setInstruction(ex)}
            style={{
              background: '#f4f4f7',
              border: '1px solid #e0e0e0',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 11,
              color: '#131A48',
              cursor: 'pointer',
            }}
          >
            "{ex}"
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleInterpret} style={{ display: 'flex', gap: '0.6rem' }}>
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Give 20% off on all Natura Casa products"
          disabled={loading || disabled}
          style={{
            flex: 1,
            padding: '0.65rem 0.9rem',
            borderRadius: 4,
            border: '1px solid #CECECE',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || disabled || !instruction.trim()}
          style={{
            background: loading || !instruction.trim() ? '#CECECE' : '#131A48',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '0.65rem 1.4rem',
            fontSize: 12,
            fontWeight: 700,
            cursor: loading || !instruction.trim() ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Interpreting...' : 'Interpret Rule'}
        </button>
      </form>

      {/* Success Banner */}
      {successMsg && (
        <div
          style={{
            marginTop: '0.75rem',
            background: '#eaf7ed',
            borderLeft: '4px solid #1e5c2c',
            padding: '0.6rem 0.9rem',
            borderRadius: 4,
            fontSize: 12,
            color: '#1e5c2c',
            fontWeight: 600,
          }}
        >
          ✅ {successMsg}
        </div>
      )}

      {/* Clarification Alert */}
      {clarification && (
        <div
          style={{
            marginTop: '0.75rem',
            background: '#fff8e1',
            borderLeft: '4px solid #f57f17',
            padding: '0.75rem 1rem',
            borderRadius: 4,
            fontSize: 12,
            color: '#e65100',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>⚠️ Clarification Needed</div>
          <div>{clarification}</div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div
          style={{
            marginTop: '0.75rem',
            background: '#fce8e8',
            borderLeft: '4px solid #c0392b',
            padding: '0.75rem 1rem',
            borderRadius: 4,
            fontSize: 12,
            color: '#8a1a1a',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Error</div>
          <div>{error}</div>
        </div>
      )}

      {/* Proposed Rule Preview Card */}
      {proposedRule && (
        <div
          style={{
            marginTop: '0.9rem',
            border: '1px solid #1e5c2c',
            borderRadius: 6,
            background: '#f8fcf9',
            padding: '1rem 1.2rem',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e5c2c', marginBottom: '0.5rem' }}>
            Proposed Rule Preview (Review & Confirm)
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.6rem',
              fontSize: 12,
              marginBottom: '0.9rem',
              background: '#fff',
              padding: '0.75rem 1rem',
              borderRadius: 4,
              border: '1px solid #e0e0e0',
            }}
          >
            <div>
              <span style={{ color: '#888' }}>Scope: </span>
              <strong style={{ textTransform: 'capitalize' }}>{proposedRule.scope}</strong>
            </div>
            <div>
              <span style={{ color: '#888' }}>Applies To: </span>
              <strong>{proposedRule.appliesTo}</strong>
            </div>
            <div>
              <span style={{ color: '#888' }}>Type: </span>
              <strong style={{ textTransform: 'capitalize' }}>{proposedRule.type}</strong>
            </div>
            <div>
              <span style={{ color: '#888' }}>Value: </span>
              <strong style={{ color: '#1e5c2c' }}>
                {proposedRule.type === 'percentage' ? `${proposedRule.value}% off` : `Rs.${proposedRule.value} off`}
              </strong>
            </div>
            <div>
              <span style={{ color: '#888' }}>Stackable: </span>
              <strong>{proposedRule.stackable ? 'Yes' : 'No'}</strong>
            </div>
            {proposedRule.minSpend > 0 && (
              <div>
                <span style={{ color: '#888' }}>Min Spend: </span>
                <strong>Rs.{proposedRule.minSpend.toLocaleString('en-IN')}</strong>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                background: '#fff',
                border: '1px solid #CECECE',
                color: '#555',
                padding: '0.5rem 1.2rem',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                background: '#1e5c2c',
                border: 'none',
                color: '#fff',
                padding: '0.5rem 1.4rem',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Confirm & Add Rule
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
