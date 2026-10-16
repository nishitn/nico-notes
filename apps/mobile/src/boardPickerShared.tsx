import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Icon } from 'react-native-paper';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { colors } from './ui';

export type BoardPickerProps = {
  boards: Pick<Doc<'boards'>, '_id' | 'name'>[];
  boardId?: Id<'boards'>;
  boardName: string;
  canLoadMore: boolean;
  loadingMore: boolean;
  onSelect: (boardId: Id<'boards'>) => void;
  onLoadMore: () => void;
  onNewBoard: () => void;
  onJoinBoard: () => void;
};

export function BoardPickerTrigger({
  boardName,
  expanded,
  onPress,
}: {
  boardName: string;
  expanded?: boolean;
  onPress?: () => void;
}) {
  const { width } = useWindowDimensions();
  const triggerStyle = [picker.trigger, { width: Math.min(180, Math.floor(width * 0.43)) }];
  const content = (
    <>
      <Text numberOfLines={1} ellipsizeMode="tail" style={picker.label}>
        {boardName}
      </Text>
      <Icon source={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
    </>
  );
  const accessibility = {
    accessible: true,
    accessibilityRole: 'button' as const,
    accessibilityLabel: `Switch board, ${boardName}`,
    accessibilityState: expanded === undefined ? undefined : { expanded },
  };
  return onPress ? (
    <Pressable {...accessibility} style={triggerStyle} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    <View {...accessibility} style={triggerStyle}>
      {content}
    </View>
  );
}

const picker = StyleSheet.create({
  trigger: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: { flexShrink: 1, color: colors.ink, fontSize: 14, fontWeight: '600' },
});
