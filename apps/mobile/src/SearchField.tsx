import type { ComponentProps } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { Searchbar } from 'react-native-paper';
import { colors, styles } from './ui';

export function SearchField({ style, inputStyle, ...props }: ComponentProps<typeof Searchbar>) {
  return (
    <Searchbar
      autoCorrect={false}
      returnKeyType="search"
      onSubmitEditing={Keyboard.dismiss}
      iconColor={colors.rust}
      placeholderTextColor={colors.muted}
      selectionColor={colors.rust}
      {...props}
      style={[search.field, style]}
      inputStyle={[styles.body, search.input, inputStyle]}
    />
  );
}

const search = StyleSheet.create({
  field: {
    height: 48,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    elevation: 0,
  },
  input: { minHeight: 46, paddingVertical: 0 },
});
