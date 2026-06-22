import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '@/store/useChatStore';
import { StageIndicator } from '@/components/chat/StageIndicator';
import { colors, spacing, radius, Fonts } from '@/constants/theme';

/**
 * 라이브 답변의 진단 스트립 — 정량 평가용. "코치가 왜 이렇게 답했는지"를
 * 세 축으로 보여준다:
 *   1) 환자 발화 분석 (감정·의도·인지왜곡·갈망강도 + 안전 분류)
 *   2) 참고한 정확한 가이드라인 (제목 + 본문) 및 조립된 전체 시스템 프롬프트
 *   3) 치료 주차/단계 진행도
 * 백엔드 LLM_TRACE=on 일 때만 데이터가 온다.
 *
 * 데모/평가용 UI. 실제 환자 배포 빌드에서는 SHOW_TRACE 를 false 로 두거나
 * 백엔드 LLM_TRACE 를 끄면 스트립이 사라진다.
 */
const SHOW_TRACE = true;

const CONTEXT_LABEL: Record<string, string> = {
  session: '세션',
  craving: '갈망 대화',
  resu: '재발 대응(RESU)',
  soma: '복약 지원(SOMA)',
};

const GRADE_LABEL: Record<string, string> = {
  A: '응급(A)',
  B: '주의(B)',
  none: '해당없음',
};

type Props = { sessionId: string };

export function TraceStrip({ sessionId }: Props) {
  const trace = useChatStore((s) => s.traces[sessionId]);
  const [open, setOpen] = useState(true);
  // 펼침 상태: 가이드라인 블록 본문(target 별) + 전체 시스템 프롬프트
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});
  const [showSystem, setShowSystem] = useState(false);

  if (!SHOW_TRACE || !trace || (!trace.prompt && !trace.progress && !trace.analysis)) {
    return null;
  }

  const { prompt, progress, analysis } = trace;
  const step = progress?.current_step;
  const a = analysis?.analysis;
  const prev = prompt?.previous_session_summary;

  const toggleBlock = (target: string) =>
    setOpenBlocks((m) => ({ ...m, [target]: !m[target] }));

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)} hitSlop={8}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>LLM TRACE</Text>
        </View>
        <Text style={styles.headerSummary} numberOfLines={1}>
          {progress
            ? `주차 ${progress.week_number}/${progress.total_weeks} · 단계 ${progress.current_step}/${progress.total_steps}`
            : prompt
              ? CONTEXT_LABEL[prompt.context_type] ?? prompt.context_type
              : '발화 분석'}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textTertiary}
        />
      </Pressable>

      {open && (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* ── 1) 환자 발화 분석 ───────────────────────────── */}
          {analysis && a && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>환자 발화 분석</Text>
              {a.summary ? <Text style={styles.summary}>{a.summary}</Text> : null}

              <Text style={styles.line}>
                <Text style={styles.key}>감정 </Text>
                {a.primary_emotion || '—'}
                {a.emotions.length > 1 ? ` (${a.emotions.join(', ')})` : ''}
              </Text>
              {a.intent ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>의도 </Text>
                  {a.intent}
                </Text>
              ) : null}

              {/* 갈망 강도 0~10 막대 */}
              <View style={styles.cravingRow}>
                <Text style={styles.key}>갈망 </Text>
                <View style={styles.cravingTrack}>
                  <View style={[styles.cravingFill, { width: `${a.craving_intensity * 10}%` as any }]} />
                </View>
                <Text style={styles.cravingNum}>{a.craving_intensity}/10</Text>
              </View>

              {a.cognitive_distortions.length > 0 ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>인지왜곡 </Text>
                  {a.cognitive_distortions.join(', ')}
                </Text>
              ) : null}
              {a.topics.length > 0 ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>주제 </Text>
                  {a.topics.join(', ')}
                  {a.relevant_step ? ` · 관련 단계 ${a.relevant_step}/5` : ''}
                </Text>
              ) : null}

              {/* 안전 분류기 결과 */}
              <Text style={styles.line}>
                <Text style={styles.key}>안전 </Text>
                {GRADE_LABEL[analysis.safety.grade] ?? analysis.safety.grade}
                {analysis.safety.event_type !== 'none' ? ` · ${analysis.safety.event_type}` : ''}
                {analysis.safety.recommended_action !== 'none'
                  ? ` → ${analysis.safety.recommended_action}`
                  : ''}
                {`  (${analysis.safety.matched_by}, ${Math.round(analysis.safety.confidence * 100)}%)`}
              </Text>
            </View>
          )}

          {/* ── 2) 진행도 ───────────────────────────────────── */}
          {progress && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>진행도</Text>
              <Text style={styles.line}>
                주차 {progress.week_number}/{progress.total_weeks} · Phase {progress.phase} · 완료{' '}
                {Math.round(progress.step_completion * 100)}%
                {progress.drift !== 'low' ? `  ⚠︎ 이탈:${progress.drift}` : ''}
              </Text>
              {step ? <StageIndicator stage={step as 1 | 2 | 3 | 4 | 5} /> : null}
              {progress.session_advanced && (
                <Text style={styles.advance}>
                  ✅ {progress.week_number}주차 세션 완료
                  {progress.next_week ? ` → ${progress.next_week}주차로 진행` : ' (프로그램 종결)'}
                </Text>
              )}
            </View>
          )}

          {/* ── 직전 세션 참고 (#5) — 이 세션이 지난 대화를 어떻게 참고하는지 ── */}
          {prompt && prompt.context_type === 'session' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {prev ? `직전 세션 참고 (${prev.week_number}주차)` : '직전 세션 참고: 없음 (첫 세션)'}
              </Text>
              {prev && prev.completed_objectives.length > 0 ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>완료 목표 </Text>
                  {prev.completed_objectives.join(', ')}
                </Text>
              ) : null}
              {prev && prev.unaddressed_objectives.length > 0 ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>미해결 </Text>
                  {prev.unaddressed_objectives.join(', ')}
                </Text>
              ) : null}
              {prev && prev.key_insights.length > 0 ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>핵심 통찰 </Text>
                  {prev.key_insights.join(', ')}
                </Text>
              ) : null}
              {prev && prev.handoff_notes ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>핸드오프 </Text>
                  {prev.handoff_notes}
                </Text>
              ) : null}
              {prev && prev.assigned_homework ? (
                <Text style={styles.line}>
                  <Text style={styles.key}>지난 과제 </Text>
                  {prev.assigned_homework}
                </Text>
              ) : null}
            </View>
          )}

          {/* ── 3) 참고한 정확한 가이드라인 + 전체 시스템 프롬프트 ── */}
          {prompt && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                참고 가이드라인 ({CONTEXT_LABEL[prompt.context_type] ?? prompt.context_type})
              </Text>

              {prompt.selected_modules && prompt.selected_modules.selected_modules.length > 0 && (
                <Text style={styles.line}>
                  <Text style={styles.key}>선택 모듈 </Text>
                  {prompt.selected_modules.selected_modules.join(', ')}
                  {prompt.selected_modules.rationale
                    ? ` — ${prompt.selected_modules.rationale}`
                    : ''}
                </Text>
              )}

              {prompt.prompt_blocks.length === 0 ? (
                <Text style={styles.line}>(참고 블록 없음)</Text>
              ) : (
                prompt.prompt_blocks.map((b) => {
                  const expanded = !!openBlocks[b.target];
                  return (
                    <View key={b.target}>
                      <Pressable
                        style={styles.blockRow}
                        onPress={() => toggleBlock(b.target)}
                        hitSlop={6}
                      >
                        <Ionicons
                          name={expanded ? 'chevron-down' : 'chevron-forward'}
                          size={13}
                          color={colors.sageDark}
                        />
                        <Text style={styles.blockTitle} numberOfLines={expanded ? undefined : 1}>
                          {b.title}
                        </Text>
                      </Pressable>
                      {expanded && (
                        <Text style={styles.blockBody}>{b.body || '(본문 없음)'}</Text>
                      )}
                    </View>
                  );
                })
              )}

              {/* 조립된 전체 시스템 프롬프트 (환자 컨텍스트 포함) */}
              <Pressable
                style={styles.blockRow}
                onPress={() => setShowSystem((v) => !v)}
                hitSlop={6}
              >
                <Ionicons
                  name={showSystem ? 'chevron-down' : 'chevron-forward'}
                  size={13}
                  color={colors.coralDark}
                />
                <Text style={[styles.blockTitle, styles.systemTitle]}>
                  전체 시스템 프롬프트 ({prompt.system_prompt_chars.toLocaleString()}자)
                </Text>
              </Pressable>
              {showSystem && (
                <ScrollView style={styles.systemBox} nestedScrollEnabled>
                  <Text selectable style={styles.systemText}>
                    {prompt.system_prompt}
                  </Text>
                </ScrollView>
              )}

              <Text style={styles.meta}>{prompt.prompt_version}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  badge: {
    backgroundColor: colors.dark,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.textOnDark,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: Fonts.mono,
  },
  headerSummary: { flex: 1, fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  body: {
    maxHeight: 360,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  section: {
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: Fonts.mono,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  summary: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 17,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  line: { fontSize: 11, color: colors.textPrimary, lineHeight: 16 },
  key: { fontFamily: Fonts.mono, fontSize: 10, color: colors.sageDark, fontWeight: '700' },
  meta: { fontSize: 10, color: colors.textTertiary, fontFamily: Fonts.mono, marginTop: 2 },
  advance: { fontSize: 11, color: colors.sageDark, fontWeight: '700', marginTop: 2 },

  // 갈망 강도 막대
  cravingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cravingTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.borderSoft,
    overflow: 'hidden',
  },
  cravingFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.coral },
  cravingNum: { fontSize: 10, color: colors.textSecondary, fontFamily: Fonts.mono, minWidth: 34, textAlign: 'right' },

  // 가이드라인 블록 (접기/펼치기)
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  blockTitle: { flex: 1, fontSize: 11, color: colors.textPrimary, fontWeight: '600' },
  systemTitle: { color: colors.coralDark },
  blockBody: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 15,
    paddingLeft: 17,
    paddingBottom: 4,
  },

  // 전체 시스템 프롬프트
  systemBox: {
    maxHeight: 200,
    backgroundColor: colors.surfaceWhite,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
    marginTop: 2,
  },
  systemText: { fontSize: 10, color: colors.textPrimary, lineHeight: 15, fontFamily: Fonts.mono },
});
