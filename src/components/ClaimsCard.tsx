'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './ClaimsCard.module.css';
import SlidingToggle from './SlidingToggle';
import LegendIcon from './LegendIcon';
import { Button, type ButtonKind } from './Button';
import { StatusBadge, SeverityBadge, ConfidenceBadge } from './Badge';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';
import type { RecommendedAction } from '../lib/rules/action-lookup';
import type { HumanActionType, PostTerminalAction, UndoAction, AuditLogEntry } from '../lib/humangate/types';
import { recommendationDisplayLabel, type ClaimStatus } from '../lib/rules/status';
import { getAuditLogForClaim } from '../lib/persistence/local-store';
import { codeWithDescription, describeCode } from '../lib/claims/code-descriptions';
import { primaryDiagnosisLabel, describeDiagnosis } from '../lib/claims/diagnosis-descriptions';

// Uses the real HumanActionType values directly (not a UI-only hyphenated
// stand-in) so a click can be dispatched straight through to the guardrail/
// submission layer without a translation step at the boundary.
type ActionId = Extract<HumanActionType, 'approve' | 'escalate' | 'deny'> | 'request_additional_info';

const ACTION_LABEL: Record<ActionId, string> = {
  approve: 'Approve',
  escalate: 'Escalate',
  request_additional_info: 'Request Additional Info',
  deny: 'Deny',
};

// 'Approve as calculated' (complex-math) has no button of its own — it's
// still fundamentally the Approve action, just this category's own flavor
// of approval.
function recommendedActionId(action: RecommendedAction): ActionId {
  if (action === 'Escalate') return 'escalate';
  if (action === 'Request Additional Info') return 'request_additional_info';
  if (action === 'Deny') return 'deny';
  return 'approve';
}

// Which post-terminal undo action a reversible status's own reverse-decision
// button dispatches — mirrors REVERSAL_SOURCE_ACTION's inverse (actions.ts)
// so this card never needs its own copy of that mapping logic, just which of
// the three reversible statuses it's currently looking at.
function undoActionForStatus(status: ClaimStatus): UndoAction | null {
  if (status === 'Denied') return 'undo_deny';
  if (status === 'Escalated') return 'undo_escalate';
  if (status === 'Additional Info Requested') return 'undo_request_additional_info';
  return null;
}

// Not a templated "Reverse {status} decision" — the three read differently
// on purpose (matches the bulk-actions bar's own labels, lib/ui/bulk-actions.ts).
const REVERSE_LABEL: Record<string, string> = {
  Denied: 'Reverse denial decision',
  Escalated: 'Reverse escalation',
  'Additional Info Requested': 'Reverse additional info request',
};

// recommendationDisplayLabel (and isRecommendationFulfilled, which it's
// built on) now live in lib/rules/status.ts — shared with the Router's
// recommend_action/lookup_claim dispatch (Anchor had the same gap: even
// once it had a claim's real current status, it still framed an already-
// fulfilled recommendation as an open ask, found live 2026-08-06).

/**
 * Whatever's actually recommended leads, styled as primary — Deny included,
 * but as primary-warning (still red/serious), never the calm accent color a
 * denial has no business looking like. Deny otherwise always stays last,
 * regardless of what else is recommended, except when Deny itself is the
 * recommendation (the one case where it doesn't need its trailing, this-is-
 * the-serious-one position, since it's already visually distinct via color
 * and already the featured action). Approve — the most common fallback
 * click — moves to the second slot whenever something else leads, so it's
 * never buried behind more than one other option.
 */
function orderActionButtons(recommended: ActionId, available: ActionId[]): ActionId[] {
  const order: ActionId[] = [recommended];
  if (recommended !== 'approve' && available.includes('approve')) order.push('approve');
  for (const id of available) {
    if (id === recommended) continue;
    if (id === 'approve') continue; // already placed above, if present at all
    if (id === 'deny' && recommended !== 'deny') continue; // held back for last
    order.push(id);
  }
  if (recommended !== 'deny') order.push('deny');
  return order;
}

function kindForAction(id: ActionId, recommended: ActionId): ButtonKind {
  if (id === recommended) return id === 'deny' ? 'primary-warning' : 'primary';
  return id === 'deny' ? 'secondary-warning' : 'secondary';
}

type ViewId = 'quick' | 'fields' | 'audit';

const VIEW_OPTIONS = [
  { id: 'quick', label: 'Quick view' },
  { id: 'fields', label: 'All form fields' },
  { id: 'audit', label: 'Audit log' },
];

const REVERSIBLE_STATUSES = new Set(['Denied', 'Escalated', 'Additional Info Requested']);

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function QuickViewContent({ row }: { row: DashboardClaimRow }) {
  const claim = row.claim;
  const lines =
    claim.form_type === 'CMS-1500'
      ? claim.box24_service_lines.map((l) => {
          const diagnosis = primaryDiagnosisLabel(l.box24e_diagnosis_pointer, claim.box21_diagnoses);
          const base = codeWithDescription(l.box24d_procedure_code);
          return {
            description: diagnosis ? `${base} — ${diagnosis}` : base,
            units: l.box24g_units,
            charge: l.box24f_charge * l.box24g_units,
          };
        })
      : claim.box42_49_revenue_lines.map((l) => {
          const diagnosis = describeDiagnosis(claim.box67_principal_diagnosis);
          const base = codeWithDescription(l.box44_hcpcs_code ?? l.box42_revenue_code);
          return {
            description: diagnosis ? `${base} — ${diagnosis}` : base,
            units: l.box46_service_units,
            charge: l.box47_total_charge,
          };
        });

  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Care provided:</p>
      {lines.map((line, i) => (
        <div key={i} className={styles.careLine}>
          <span className={styles.careLineDescription} title={line.description}>{line.description}</span>
          <span className={styles.careLineRight}>
            <span className={styles.careLineUnits}>{line.units} units</span><span className={styles.careLineCharge}>{formatAmount(line.charge)}</span>
          </span>
        </div>
      ))}

      <div className={styles.divider} />

      <p className={styles.sectionLabel}>Evidence:</p>
      <ul className={styles.evidenceList}>
        {row.evidence.map((item, i) => (
          <li key={i} className={styles.evidenceItem}>
            {item}
          </li>
        ))}
      </ul>

      <div className={styles.divider} />
      <p className={styles.recommendation}>
        {/* The underlying recommendedAction is still honestly "Approve" (or
            whatever it was) here — that's what the deterministic lookup
            actually found, and it stays a historical fact even once acted
            on: it also drives the recommendation-mismatch check and the
            bulk-actions bar elsewhere, both of which need the ORIGINAL
            recommendation, not a nulled-out one. This is a display-only
            override — once the current status already reflects that
            recommendation having been carried out (auto-resolved OR a human
            clicking through manually), showing it again next to an action
            button that's no longer there reads as a stale, actionable
            suggestion rather than a completed outcome. No change to the
            underlying data or Call 2's prompt. */}
        Recommendation: <b>{recommendationDisplayLabel(row.recommendedAction, row.status)}</b>
      </p>
      <p className={styles.recommendationNarrative}>{row.recommendationNarrative}</p>
    </div>
  );
}

function AllFieldsContent({ row }: { row: DashboardClaimRow }) {
  const claim = row.claim;
  const fields: [string, string][] =
    claim.form_type === 'CMS-1500'
      ? [
          ['Patient', claim.patient.name],
          ['DOB', claim.patient.dob],
          ['Sex', claim.patient.sex],
          ['Member ID', claim.patient.member_id],
          ['Box 21 · Diagnoses', claim.box21_diagnoses.join(', ')],
          ['Box 23 · Prior auth #', claim.box23_prior_auth_number ?? 'None on file'],
          ['Box 33 · Billing provider', claim.box33_billing_provider.name ?? '(missing)'],
          ['Billing provider NPI', claim.box33_billing_provider.npi ?? '(missing)'],
          ['Linked claim', row.linkedDisplayNumber ?? 'None'],
          ['Total charge', formatAmount(claim.total_charge)],
          ['SLA tier', claim.sla_tier],
        ]
      : [
          ['Patient', claim.patient.name],
          ['DOB', claim.patient.dob],
          ['Sex', claim.patient.sex],
          ['Member ID', claim.patient.member_id],
          ['Box 4 · Type of bill', claim.box4_type_of_bill],
          ['Statement period', `${claim.box6_statement_covers_period.from} – ${claim.box6_statement_covers_period.through}`],
          ['Box 67 · Principal diagnosis', claim.box67_principal_diagnosis ?? '(missing)'],
          ['Box 76 · Attending NPI', claim.box76_attending_provider_npi ?? '(missing)'],
          ['Billing provider', claim.billing_provider_name],
          ['Billing provider NPI', claim.billing_provider_npi],
          ['Linked claim', row.linkedDisplayNumber ?? 'None'],
          ['Total charge', formatAmount(claim.total_charge)],
          ['SLA tier', claim.sla_tier],
        ];

  return (
    <div className={styles.section}>
      <div className={styles.fieldsGrid}>
        {fields.map(([label, value]) => (
          <div key={label} className={styles.field}>
            <span className={styles.fieldLabel}>{label}</span>
            <span className={styles.fieldValue}>{value}</span>
          </div>
        ))}
      </div>

      {claim.form_type === 'UB-04' && claim.box42_49_revenue_lines.length > 0 && (
        <>
          <div className={styles.divider} />
          <p className={styles.sectionLabel}>Box 42–49 · Revenue lines</p>
          {claim.box42_49_revenue_lines.map((l) => {
            const raw = `Line ${l.line} · ${l.box42_revenue_code}${l.box44_hcpcs_code ? ` (${l.box44_hcpcs_code})` : ''}`;
            const label = describeCode(l.box44_hcpcs_code ?? l.box42_revenue_code);
            const diagnosis = describeDiagnosis(claim.box67_principal_diagnosis);
            const text = label ? `${raw} · ${label}${diagnosis ? ` — ${diagnosis}` : ''}` : raw;
            return (
              <div key={l.line} className={styles.careLine}>
                <span className={styles.careLineDescription} title={text}>{text}</span>
                <span className={styles.careLineRight}>
                  <span className={styles.careLineUnits}>{l.box46_service_units} units</span>
                  <span className={styles.careLineCharge}>{formatAmount(l.box47_total_charge)}</span>
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const ACTION_DISPLAY_LABEL: Record<AuditLogEntry['action'], string> = {
  approve: 'Approved',
  approve_with_edit: 'Approved with edit',
  escalate: 'Escalated',
  deny: 'Denied',
  request_additional_info: 'Requested additional info',
  auto_approve: 'Auto-approved',
  note: 'Note',
  undo_request_additional_info: 'Reversed — request for info',
  undo_escalate: 'Reversed — escalation',
  undo_deny: 'Reversed — denial',
  request_recoupment: 'Requested recoupment',
  undo_recoupment: 'Cancelled recoupment request',
};

function auditEntryBody(entry: AuditLogEntry): string {
  if (entry.action === 'deny' && entry.denialDetail) return entry.denialDetail.specificReason;
  if (entry.reason) return entry.reason;
  return `Status changed from ${entry.from_status} to ${entry.to_status}.`;
}

function AuditLogContent({ row, onAddNote }: { row: DashboardClaimRow; onAddNote: () => void }) {
  const submitted = new Date(row.claim.submitted_date);
  // Real persisted entries (localStorage) — read directly, no memoization
  // needed since this only renders while the Audit log tab is selected and
  // a localStorage read is cheap/synchronous. The initial "Submitted" line
  // below stays hardcoded, same as before: there's no audit entry for the
  // original submission event itself, only for what a human's done since.
  const entries = getAuditLogForClaim(row.claim.claim_id);
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Audit log</p>
      <div className={styles.auditEntry}>
        <div className={styles.auditEntryHead}>
          <span>System · Submitted</span>
          <span className={styles.careLineRight}>{submitted.toLocaleString('en-US')}</span>
        </div>
        <p className={styles.auditEntryBody}>Claim entered the system and awaits evaluation.</p>
      </div>
      {entries.map((entry, i) => (
        // Index included on purpose — timestamp+action alone can collide
        // (confirmed live: two entries a Strict Mode double-write left in
        // localStorage before that bug was fixed shared one exactly). The
        // list only ever appends, never reorders, so an index-based key is
        // safe here rather than a real anti-pattern.
        <div key={`${entry.timestamp}-${entry.action}-${i}`} className={styles.auditEntry}>
          <div className={styles.auditEntryHead}>
            <span>
              {entry.actor} · {ACTION_DISPLAY_LABEL[entry.action]}
            </span>
            <span className={styles.careLineRight}>{new Date(entry.timestamp).toLocaleString('en-US')}</span>
          </div>
          <p className={styles.auditEntryBody}>{auditEntryBody(entry)}</p>
        </div>
      ))}
      <button className={styles.addNoteButton} onClick={onAddNote}>
        + Add a note
      </button>
    </div>
  );
}

export default function ClaimsCard({
  row,
  onClose,
  onRequestAction,
  onOpenLinkedClaim,
}: {
  row: DashboardClaimRow;
  onClose: () => void;
  onRequestAction: (action: Exclude<HumanActionType, 'approve_with_edit'> | PostTerminalAction | 'note') => void;
  onOpenLinkedClaim: (claimId: string) => void;
}) {
  const [view, setView] = useState<ViewId>('quick');
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  // Suppresses the height transition for this card's very first measurement
  // only. A plain useEffect measures *after* paint — on a fresh mount, if
  // this claim's content reflows even slightly after that first paint, the
  // always-on CSS transition animates a visible jump on mount, on top of
  // the card's own fade-in. useLayoutEffect below measures synchronously
  // before the browser ever paints the unmeasured state, and the transition
  // stays off until fonts are confirmed settled — real view switches
  // (quick/fields/audit) still animate normally.
  const [skipHeightTransition, setSkipHeightTransition] = useState(true);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [view]);

  useEffect(() => {
    // A one-tick setTimeout wasn't long enough: it re-enabled the transition
    // before web fonts had actually finished loading/swapping. Fallback-font
    // metrics differ from the real webfont's just enough that some claims'
    // patient/provider/procedure text wraps differently once the swap
    // happens — a genuine, claim-specific reflow that, if the transition was
    // already back on, visibly animated as an unwanted jump. document.fonts
    // .ready resolves only once that swap has actually settled, so waiting
    // on it (rather than guessing a duration) is the real fix.
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setSkipHeightTransition(false);
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(enable);
    } else {
      const timer = setTimeout(enable, 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const isReversible = REVERSIBLE_STATUSES.has(row.status);
  const isRecoupable = row.status === 'Resolved';
  const isRecoupmentRequested = row.status === 'Recoupment Requested';

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <span className={styles.claimId}>{row.displayNumber}</span>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          Close ×
        </button>
      </div>

      <div className={styles.badgeRow}>
        <div className={styles.badgeColumn}>
          <span className={styles.badgeLabel}>Status</span>
          <StatusBadge status={row.status} isAutoApproved={row.isAutoApproved} />
        </div>
        <div className={styles.badgeColumn}>
          <span className={styles.badgeLabel}>Severity</span>
          <SeverityBadge severity={row.severity} />
        </div>
        <div className={styles.badgeColumn}>
          <span className={styles.badgeLabelInline}>
            AI Confidence <LegendIcon kind="confidence" />
          </span>
          <ConfidenceBadge confidence={row.confidence} />
        </div>
      </div>

      <div className={styles.infoGrid}>
        <div>
          <span className={styles.infoLabel}>Patient:</span> {row.patientName}
        </div>
        <div>
          <span className={styles.infoLabel}>Provider:</span> {row.providerName}
        </div>
        <div>
          <span className={styles.infoLabel}>Linked claim:</span>{' '}
          {row.claim.linked_claim_id ? (
            <button className={styles.linkedClaimLink} onClick={() => onOpenLinkedClaim(row.claim.linked_claim_id!)}>
              {row.linkedDisplayNumber}
            </button>
          ) : (
            'None'
          )}
        </div>
        <div>
          <span className={styles.infoLabel}>Amount:</span> {formatAmount(row.claim.total_charge)}
        </div>
        <div>
          <span className={styles.infoLabel}>Deductible remaining:</span> {formatAmount(row.deductibleRemaining)}
        </div>
        <div>
          <span className={styles.infoLabel}>Network status:</span> {row.isInNetwork ? 'In-network' : 'Out-of-network'}
        </div>
        <div>
          <span className={styles.infoLabel}>Inpatient benefit days used:</span> {row.inpatientDaysUsedThisPlanYear} of{' '}
          {row.annualInpatientDayCap}
        </div>
      </div>

      <SlidingToggle options={VIEW_OPTIONS} selected={view} onChange={(id) => setView(id as ViewId)} />

      <div className={styles.divider} />

      <div className={styles.animatedHeight} style={{ height, transitionDuration: skipHeightTransition ? '0s' : undefined }}>
        <div key={view} ref={contentRef} className={styles.fadeContent}>
          {view === 'quick' && <QuickViewContent row={row} />}
          {view === 'fields' && <AllFieldsContent row={row} />}
          {view === 'audit' && <AuditLogContent row={row} onAddNote={() => onRequestAction('note')} />}
        </div>
      </div>

      <div className={styles.divider} />

      {isRecoupmentRequested && (
        <Button kind="primary-warning" onClick={() => onRequestAction('undo_recoupment')}>
          Cancel recoupment request
        </Button>
      )}
      {!isRecoupmentRequested && isReversible &&
        (() => {
          const undoAction = undoActionForStatus(row.status);
          if (!undoAction) return null;
          return (
            <Button kind="primary-warning" onClick={() => onRequestAction(undoAction)}>
              {REVERSE_LABEL[row.status]}
            </Button>
          );
        })()}
      {!isRecoupmentRequested && isRecoupable && (
        <Button kind="primary-warning" onClick={() => onRequestAction('request_recoupment')}>
          Request recoupment
        </Button>
      )}
      {!isRecoupmentRequested && !isReversible && !isRecoupable && (() => {
        const recommended = recommendedActionId(row.recommendedAction);
        const available: ActionId[] = ['approve', 'escalate', 'request_additional_info', 'deny'];
        const order = orderActionButtons(recommended, available);
        return (
          <div className={styles.actionRow}>
            {order.map((id) => (
              <Button key={id} kind={kindForAction(id, recommended)} onClick={() => onRequestAction(id)}>
                {ACTION_LABEL[id]}
              </Button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
