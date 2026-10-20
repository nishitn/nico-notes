import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { colors } from './ui';

export const VALID_SCORES = [
  1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5,
  6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0,
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
  compact?: boolean;
};

export function ScorePicker({ value, onChange, label, compact = false }: ScorePickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const currentScore = value !== null && value !== undefined && Number.isFinite(value) ? value : undefined;

  useEffect(() => {
    // Auto-scroll to near the selected score or near 8.0
    const targetScore = currentScore ?? 8.0;
    const index = VALID_SCORES.findIndex((s) => Math.abs(s - targetScore) < 0.25);
    if (index > 4 && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * 52), animated: true });
      }, 100);
    }
  }, []);

  function handleStep(direction: -0.5 | 0.5) {
    if (currentScore === undefined) {
      onChange(direction > 0 ? 8.0 : 7.5);
      return;
    }
    const next = Math.round((currentScore + direction) * 2) / 2;
    if (next >= 1.0 && next <= 10.0) {
      onChange(next);
      // Scroll to new position
      const index = VALID_SCORES.findIndex((s) => Math.abs(s - next) < 0.25);
      if (index >= 0) {
        scrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * 52), animated: true });
      }
    }
  }

  return (
    <View style={scorePickerStyles.container}>
      {label && <Text style={scorePickerStyles.label}>{label}</Text>}

      {/* Stepper Display Row */}
      <View style={scorePickerStyles.stepperRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease score by 0.5"
          disabled={currentScore !== undefined && currentScore <= 1.0}
          onPress={() => handleStep(-0.5)}
          style={({ pressed }) => [
            scorePickerStyles.stepBtn,
            (currentScore !== undefined && currentScore <= 1.0) && scorePickerStyles.stepBtnDisabled,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon
            source="minus"
            size={22}
            color={currentScore !== undefined && currentScore <= 1.0 ? colors.muted : colors.rust}
          />
        </Pressable>

        <View style={scorePickerStyles.displayBox}>
          <View style={scorePickerStyles.scoreNumberRow}>
            <Text style={scorePickerStyles.scoreNumber}>
              {currentScore !== undefined ? currentScore.toFixed(1) : '—'}
            </Text>
            <Text style={scorePickerStyles.scoreOutOf}>/10</Text>
          </View>
          {currentScore !== undefined ? (
            <Text style={scorePickerStyles.scoreTag}>{scoreDescriptor(currentScore)}</Text>
          ) : (
            <Text style={scorePickerStyles.scorePlaceholder}>Tap score or + / -</Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase score by 0.5"
          disabled={currentScore !== undefined && currentScore >= 10.0}
          onPress={() => handleStep(0.5)}
          style={({ pressed }) => [
            scorePickerStyles.stepBtn,
            (currentScore !== undefined && currentScore >= 10.0) && scorePickerStyles.stepBtnDisabled,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon
            source="plus"
            size={22}
            color={currentScore !== undefined && currentScore >= 10.0 ? colors.muted : colors.rust}
          />
        </Pressable>

        {currentScore !== undefined && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear score"
            onPress={() => onChange(undefined)}
            style={scorePickerStyles.clearBtn}
          >
            <Icon source="close-circle-outline" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Quick Score Buttons (0.5 increments) */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={scorePickerStyles.pillsContainer}
      >
        {VALID_SCORES.map((score) => {
          const isSelected = currentScore !== undefined && Math.abs(currentScore - score) < 0.1;
          return (
            <Pressable
              key={score}
              accessibilityRole="button"
              accessibilityLabel={`Score ${score.toFixed(1)}`}
              accessibilityState={{ selected: isSelected }}
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
    </View>
  );
}

const scorePickerStyles = StyleSheet.create({
  container: {
    gap: 10,
    width: '100%',
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
  stepBtnDisabled: {
    opacity: 0.35,
  },
  displayBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
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
  scoreOutOf: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.muted,
  },
  scoreTag: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    color: colors.green,
    marginTop: -2,
  },
  scorePlaceholder: {
    fontFamily: 'Jakarta',
    fontSize: 11,
    color: colors.muted,
    marginTop: -2,
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
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
    minWidth: 46,
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
