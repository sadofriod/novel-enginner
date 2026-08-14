/* eslint-disable complexity */

import type { ReviewerResult, DimensionScores, ReviewHardFailure } from '../../domain/schema';
import { RadarChart } from './RadarChart';

/**
 * Displays the structured `ReviewerResult` from
 * docs/architecture/modules/05-reviewer-and-quality-gates.md §5.7 in the
 * artifact detail page (§6.8). Shows pass/fail status, hard failures, per-
 * dimension scores (radar chart), total score, rewrite directives, and override eligibility.
 */

export interface ReviewerResultViewProps {
  readonly result: ReviewerResult;
}

const DIMENSION_LABELS: Readonly<Record<keyof DimensionScores, string>> = {
  antiAiVoice: '文风',
  webFictionPacing: '节奏',
  emotionCurve: '情绪',
  characterConsistency: '角色',
  settingConsistency: '设定',
  clueCausality: '伏笔',
  readabilityLayout: '排版',
  languageTexture: '质感',
};

const DIMENSION_PASS_THRESHOLD = 75;

// MUI-aligned design tokens (used as inline styles, no runtime JS required)
const PASS_BG = '#e3f2fd';
const FAIL_BG = '#ffebee';
const PASS_BORDER = '#1976d2';
const FAIL_BORDER = '#d32f2f';
const PASS_COLOR = '#0d47a1';
const FAIL_COLOR = '#b71c1c';

export function ReviewerResultView({ result }: ReviewerResultViewProps) {
  const passing = result.approved;
  const borderColor = passing ? PASS_BORDER : FAIL_BORDER;
  const bgColor = passing ? PASS_BG : FAIL_BG;
  const labelColor = passing ? PASS_COLOR : FAIL_COLOR;

  const radarAxes = (Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[]).map((key) => ({
    label: DIMENSION_LABELS[key],
    value: result.dimensionScores[key],
  }));

  return (
    <section
      aria-label="Reviewer 评审结果"
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: '4px',
        padding: '16px',
        background: bgColor,
        display: 'grid',
        gap: '12px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '15px', color: '#212121' }}>Reviewer 结果</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            background: passing ? '#1976d2' : '#d32f2f',
            color: '#fff',
          }}
        >
          {passing ? '✓ 通过' : '✗ 未通过'}
        </span>
        <span style={{ fontSize: '13px', color: labelColor, fontWeight: 500 }}>
          总分：{result.totalScore} / 100
        </span>
      </div>

      {/* Hard failures */}
      {result.hardFailures.length > 0 && (
        <div
          role="alert"
          style={{
            border: '1px solid #ef9a9a',
            borderRadius: '4px',
            padding: '10px 12px',
            background: '#fff3e0',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#b71c1c' }}>
            硬失败 ({result.hardFailures.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' }}>
            {result.hardFailures.map((failure: ReviewHardFailure, index: number) => (
              <li key={`${failure.code}-${index}`} style={{ fontSize: '13px' }}>
                <code style={{ background: '#ffcdd2', borderRadius: '2px', padding: '1px 4px' }}>
                  {failure.code}
                </code>
                {failure.message !== undefined && (
                  <span style={{ marginLeft: '8px', color: '#424242' }}>{failure.message}</span>
                )}
              </li>
            ))}
          </ul>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: result.overrideEligible ? '#1565c0' : '#b71c1c' }}>
            {result.overrideEligible
              ? '可豁免（作者需记录 OverrideAudit）'
              : '不可豁免 — 阻断 canonical commit'}
          </p>
        </div>
      )}

      {/* Radar chart + dimension score table */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div aria-label="评分维度雷达图">
          <RadarChart axes={radarAxes} threshold={DIMENSION_PASS_THRESHOLD} size={220} />
        </div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#616161', marginBottom: '6px' }}>维度评分</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <tbody>
              {(Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[]).map((key) => {
                const score = result.dimensionScores[key];
                const dimPass = score >= DIMENSION_PASS_THRESHOLD;
                return (
                  <tr key={key}>
                    <td style={{ padding: '3px 8px 3px 0', color: '#424242' }}>
                      {DIMENSION_LABELS[key]}
                    </td>
                    <td
                      style={{
                        padding: '3px 0',
                        fontWeight: 600,
                        color: dimPass ? '#1565c0' : '#c62828',
                        textAlign: 'right',
                      }}
                    >
                      {score}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rewrite directives */}
      {result.rewriteDirectives.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#616161', marginBottom: '6px' }}>改写指令</div>
          <ol style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' }}>
            {result.rewriteDirectives.map((directive: string, index: number) => (
              <li key={index} style={{ fontSize: '13px', color: '#424242' }}>
                {directive}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
