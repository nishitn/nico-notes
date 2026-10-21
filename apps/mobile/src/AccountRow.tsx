import { Pressable, StyleSheet, Text } from 'react-native';
import { Icon } from 'react-native-paper';
import { colors } from './ui';

export function AccountRow({
  label,
  onPress,
  disabled,
  separator,
  expanded,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  separator?: boolean;
  expanded?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        row.button,
        separator && row.separator,
        pressed && { backgroundColor: colors.coralLight },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[row.label, danger && { color: colors.error }]}>{label}</Text>
      <Icon
        source={expanded ? 'chevron-up' : 'chevron-right'}
        size={19}
        color={danger ? colors.error : colors.muted}
      />
    </Pressable>
  );
}
const row = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  separator: { borderTopWidth: 1, borderColor: colors.border },
  label: { fontFamily: 'JakartaSemiBold', color: colors.ink, fontSize: 15, flex: 1 },
});
