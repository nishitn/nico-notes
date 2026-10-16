import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { BoardPickerTrigger, type BoardPickerProps } from './boardPickerShared';

export function BoardPicker({
  boards,
  boardId,
  boardName,
  canLoadMore,
  loadingMore,
  onSelect,
  onLoadMore,
  onNewBoard,
  onJoinBoard,
}: BoardPickerProps) {
  const actions: MenuAction[] = boards.map((board) => ({
    id: `board:${board._id}`,
    title: board.name,
    state: board._id === boardId ? 'on' : 'off',
  }));
  if (canLoadMore || loadingMore)
    actions.push({
      id: 'load-more',
      title: loadingMore ? 'Loading…' : 'More boards',
      attributes: { disabled: loadingMore },
    });
  actions.push({
    id: 'board-actions',
    title: 'Boards',
    displayInline: true,
    subactions: [
      { id: 'new-board', title: 'New board', image: 'plus' },
      { id: 'join-board', title: 'Join board', image: 'person.2.badge.plus' },
    ],
  });

  return (
    <MenuView
      actions={actions}
      colorScheme="light"
      testID="board-picker"
      onPressAction={({ nativeEvent: { event } }) => {
        if (event === 'new-board') onNewBoard();
        else if (event === 'join-board') onJoinBoard();
        else if (event === 'load-more') onLoadMore();
        else {
          const selected = boards.find((board) => event === `board:${board._id}`);
          if (selected) onSelect(selected._id);
        }
      }}
    >
      <BoardPickerTrigger boardName={boardName} />
    </MenuView>
  );
}
