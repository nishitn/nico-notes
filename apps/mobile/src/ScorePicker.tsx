import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { colors } from './ui';

export const VALID_SCORES = [
  1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0,
];

function scoreDescriptor(score: number): string {
  if (score >= 9.5) return 'Perfection ✨';
  if (score >= 9.0) return 'Exceptional 🌟';
  if (score >= 8.5) return 'Outstanding 👍';
  if (score >= 8.0) return 'Great 👌';
  if (score >= 7.5) return 'Very Good 🙂';
  if (score >= 7.0) return 'Good 👍';
  if (score >= 6.0) return 'Decent';
  if (score >= 5.0) return 'Average';
  return 'Not for us';
}

export type ScorePickerProps = {
  value?: number | null;
  onChange: (score: number | undefined) => void;
  label?: string;
  header?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
};

export function ScorePicker({
  value,
  onChange,
  label,
  header,
  compact = false,
  disabled = false,
}: ScorePickerProps) {
  const hasHeader = Boolean(header);
  const scrollRef = useRef<ScrollView>(null);
  const scrollMetrics = useRef({ width: 0, contentWidth: 0, offset: 0 });
  const scoreLayouts = useRef(new Map<number, { x: number; width: number }>());
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  const currentScore =
    value !== null && value !== undefined && Number.isFinite(value) ? value : undefined;

  function updateScrollEdges(metrics: Partial<typeof scrollMetrics.current>) {
    Object.assign(scrollMetrics.current, metrics);
    const { width, contentWidth, offset } = scrollMetrics.current;
    const left = width > 0 && offset > 1;
    const right = width > 0 && contentWidth - width - offset > 1;
    setScrollEdges((previous) =>
      previous.left === left && previous.right === right ? previous : { left, right },
    );
  }

  const scrollToScore = useCallback((score: number | undefined) => {
    const { width, contentWidth } = scrollMetrics.current;
    if (!width || !contentWidth) return;
    if (score === undefined) {
      scrollRef.current?.scrollToEnd({ animated: false });
      return;
    }
    const layout = scoreLayouts.current.get(score);
    if (!layout) return;
    const x = Math.max(0, Math.min(layout.x - (width - layout.width) / 2, contentWidth - width));
    scrollRef.current?.scrollTo({ x, animated: false });
  }, []);

  useEffect(() => {
    scrollToScore(currentScore);
  }, [currentScore, scrollToScore]);

  function handleStep(direction: -0.5 | 0.5) {
    if (currentScore === undefined) {
      onChange(direction > 0 ? 8.0 : 7.5);
      return;
    }
    const next = Math.round((currentScore + direction) * 2) / 2;
    if (next >= 1.0 && next <= 10.0) {
      onChange(next);
    }
  }

  return (
    <View style={[scorePickerStyles.container, compact && scorePickerStyles.compactContainer]}>
      {label && <Text style={scorePickerStyles.label}>{label}</Text>}

      {/* Stepper Display Row */}
      <View
        style={[
          scorePickerStyles.stepperRow,
          compact && scorePickerStyles.compactStepperRow,
          hasHeader && scorePickerStyles.headerRow,
        ]}
      >
        {hasHeader && <View style={scorePickerStyles.header}>{header}</View>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease score by 0.5"
          hitSlop={hasHeader ? 6 : undefined}
          disabled={disabled || (currentScore !== undefined && currentScore <= 1.0)}
          onPress={() => handleStep(-0.5)}
          style={({ pressed }) => [
            scorePickerStyles.stepBtn,
            hasHeader && scorePickerStyles.headerStepBtn,
            currentScore !== undefined && currentScore <= 1.0 && scorePickerStyles.stepBtnDisabled,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon
            source="minus"
            size={hasHeader ? 18 : 22}
            color={currentScore !== undefined && currentScore <= 1.0 ? colors.muted : colors.rust}
          />
        </Pressable>

        <View
          style={[
            scorePickerStyles.displayBox,
            compact && scorePickerStyles.compactDisplayBox,
            hasHeader && scorePickerStyles.headerDisplayBox,
          ]}
        >
          <View style={scorePickerStyles.scoreNumberRow}>
            <Text
              style={[
                scorePickerStyles.scoreNumber,
                compact && scorePickerStyles.compactScore,
                hasHeader && scorePickerStyles.headerScore,
              ]}
            >
              {currentScore !== undefined ? currentScore.toFixed(1) : '—'}
            </Text>
            <Text
              style={[scorePickerStyles.scoreOutOf, hasHeader && scorePickerStyles.headerOutOf]}
            >
              /10
            </Text>
          </View>
          {currentScore !== undefined && !hasHeader && (
            <Text style={scorePickerStyles.scoreTag}>{scoreDescriptor(currentScore)}</Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase score by 0.5"
          hitSlop={hasHeader ? 6 : undefined}
          disabled={disabled || (currentScore !== undefined && currentScore >= 10.0)}
          onPress={() => handleStep(0.5)}
          style={({ pressed }) => [
            scorePickerStyles.stepBtn,
            hasHeader && scorePickerStyles.headerStepBtn,
            currentScore !== undefined && currentScore >= 10.0 && scorePickerStyles.stepBtnDisabled,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon
            source="plus"
            size={hasHeader ? 18 : 22}
            color={currentScore !== undefined && currentScore >= 10.0 ? colors.muted : colors.rust}
          />
        </Pressable>

        {currentScore !== undefined && !hasHeader && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear score"
            disabled={disabled}
            onPress={() => onChange(undefined)}
            style={[scorePickerStyles.clearBtn, compact && scorePickerStyles.compactClearBtn]}
          >
            <Icon source="close-circle-outline" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Quick Score Buttons (0.5 increments) */}
      <View style={scorePickerStyles.optionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="No rating"
          accessibilityState={{ selected: currentScore === undefined, disabled }}
          disabled={disabled}
          onPress={() => {
            if (currentScore !== undefined) onChange(undefined);
          }}
          style={({ pressed }) => [
            scorePickerStyles.pill,
            currentScore === undefined && scorePickerStyles.pillSelected,
            pressed && { opacity: 0.75 },
          ]}
        >
          <Text
            style={[
              scorePickerStyles.pillText,
              currentScore === undefined && scorePickerStyles.pillTextSelected,
            ]}
          >
            −
          </Text>
        </Pressable>
        <View style={scorePickerStyles.scoresViewport}>
          <ScrollView
            ref={scrollRef}
            horizontal
            onLayout={({ nativeEvent }) => {
              updateScrollEdges({ width: nativeEvent.layout.width });
              scrollToScore(currentScore);
            }}
            onContentSizeChange={(contentWidth) => {
              updateScrollEdges({ contentWidth });
              scrollToScore(currentScore);
            }}
            onScroll={({ nativeEvent }) =>
              updateScrollEdges({ offset: nativeEvent.contentOffset.x })
            }
            scrollEventThrottle={16}
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={scorePickerStyles.pillsContainer}
          >
            {VALID_SCORES.map((score) => {
              const isSelected = currentScore !== undefined && Math.abs(currentScore - score) < 0.1;
              return (
                <Pressable
                  key={score}
                  onLayout={({ nativeEvent }) => {
                    scoreLayouts.current.set(score, nativeEvent.layout);
                    if (score === currentScore) scrollToScore(score);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Score ${score.toFixed(1)}`}
                  accessibilityState={{ selected: isSelected, disabled }}
                  accessibilityHint={isSelected ? 'Tap again to clear score' : undefined}
                  disabled={disabled}
                  onPress={() => onChange(isSelected ? undefined : score)}
                  style={({ pressed }) => [
                    scorePickerStyles.pill,
                    isSelected && scorePickerStyles.pillSelected,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text
                    style={[
                      scorePickerStyles.pillText,
                      isSelected && scorePickerStyles.pillTextSelected,
                    ]}
                  >
                    {score.toFixed(1)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {scrollEdges.left && (
            <View
              pointerEvents="none"
              style={[scorePickerStyles.scrollShadow, scorePickerStyles.scrollShadowLeft]}
            />
          )}
          {scrollEdges.right && (
            <View
              pointerEvents="none"
              style={[scorePickerStyles.scrollShadow, scorePickerStyles.scrollShadowRight]}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const scorePickerStyles = StyleSheet.create({
  container: {
    gap: 10,
    width: '100%',
  },
  compactContainer: {
    gap: 6,
  },
  label: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.ink,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.peachLight,
    borderWidth: 1,
    borderColor: colors.peachBorder,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    position: 'relative',
  },
  compactStepperRow: {
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  headerRow: {
    gap: 4,
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  header: {
    flex: 1,
    minWidth: 0,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  headerStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    elevation: 0,
    shadowOpacity: 0,
  },
  stepBtnDisabled: {
    opacity: 0.35,
  },
  displayBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  compactDisplayBox: {
    flex: 1,
    minWidth: 0,
  },
  headerDisplayBox: {
    flex: 0,
    minWidth: 54,
  },
  scoreNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  scoreNumber: {
    fontFamily: 'Epilogue',
    fontSize: 32,
    color: colors.rust,
    letterSpacing: -1,
  },
  compactScore: {
    fontSize: 24,
  },
  headerScore: {
    fontSize: 20,
  },
  scoreOutOf: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.muted,
  },
  headerOutOf: {
    fontSize: 11,
  },
  scoreTag: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    color: colors.green,
    marginTop: -2,
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactClearBtn: {
    position: 'relative',
    right: 0,
    top: 0,
    minWidth: 44,
    minHeight: 44,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoresViewport: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  scrollShadow: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: 12,
  },
  scrollShadowLeft: {
    left: 0,
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(48, 43, 38, 0.14), rgba(48, 43, 38, 0))',
  },
  scrollShadowRight: {
    right: 0,
    experimental_backgroundImage:
      'linear-gradient(to left, rgba(48, 43, 38, 0.14), rgba(48, 43, 38, 0))',
  },
  pillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSelected: {
    backgroundColor: colors.rust,
    borderColor: colors.rust,
    elevation: 2,
    shadowColor: colors.rust,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  pillText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.ink,
  },
  pillTextSelected: {
    color: colors.paper,
  },
});
