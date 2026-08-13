import type { ReviewerResult, DimensionScores, ReviewHardFailure } from '../../domain/schema';

/**
 * Displays the structured `ReviewerResult` from
 * docs/architecture/modules/05-reviewer-and-quality-gates.md §5.7 in the
 * artifact detail page (§6.8). Shows pass/fail status, hard failures, per-
 * dimension scores, total score, rewrite directives, and override eligibility.
 */

export interface ReviewerResultViewProps {
  readonly result: ReviewerResult;
}

const DIMENSION_LABELS: Readonly<Record<keyof DimensionScores, string>> = {
  antiAiVoice: '文风去 AI 味',
  webFictionPacing: '网文节奏',
  emotionCurve: '情绪曲线',
  characterConsistency: '角色一致性',
  settingConsistency: '设定/科技一致性',
  clueCausality: '伏笔与因果',
  readabilityLayout: '可读性与排版',
  languageTexture: '语言质感',
};

const PASS_THRESHOLD = 85;
const DIMENSION_PASS_THRESHOLD = 75;

function ScoreBar({ score, threshold }: { score: number; threshold: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const passing = score >= threshold;
  return (
    <div className="score-bar-wrapper" aria-label={`${score} / 100`}>
      <div
        className={passing ? 'score-bar score-bar-pass' : 'score-bar score-bar-fail'}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      <span className="score-bar-label">{score}</span>
    </div>
  );
}

export function ReviewerResultView({ result }: ReviewerResultViewProps) {
  const overallClass = result.approved ? 'reviewer-result reviewer-pass' : 'reviewer-result reviewer-fail';

  return (
    <section className={overallClass} aria-label="Reviewer 评审结果">
      <header>
        <h3>Reviewer 结果</h3>
        <span className={result.approved ? 'badge badge-pass' : 'badge badge-fail'}>
          {result.approved ? '✓ 通过' : '✗ 未通过'}
        </span>
        <span className="total-score">总分：{result.totalScore} / 100</span>
        <ScoreBar score={result.totalScore} threshold={PASS_THRESHOLD} />
      </header>

      {result.hardFailures.length > 0 && (
        <section aria-label="硬失败项">
          <h4>硬失败 ({result.hardFailures.length})</h4>
          <ul className="hard-failure-list">
            {result.hardFailures.map((failure: ReviewHardFailure, index: number) => (
              <li key={`${failure.code}-${index}`} className="hard-failure-item">
                <code>{failure.code}</code>
                {failure.message !== undefined && <span className="failure-message">{failure.message}</span>}
              </li>
            ))}
          </ul>
          {result.overrideEligible ? (
            <p className="override-note">可豁免（作者需记录 OverrideAudit）</p>
          ) : (
            <p className="override-note override-blocked">不可豁免 — 阻断 canonical commit</p>
          )}
        </section>
      )}

      <section aria-label="评分维度">
        <h4>维度评分</h4>
        <dl className="dimension-scores">
          {(Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[]).map((key) => {
            const score = result.dimensionScores[key];
            return (
              <div key={key} className="dimension-row">
                <dt>{DIMENSION_LABELS[key]}</dt>
                <dd>
                  <ScoreBar score={score} threshold={DIMENSION_PASS_THRESHOLD} />
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {result.rewriteDirectives.length > 0 && (
        <section aria-label="改写指令">
          <h4>改写指令</h4>
          <ol className="rewrite-directives">
            {result.rewriteDirectives.map((directive: string, index: number) => (
              <li key={index}>{directive}</li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
