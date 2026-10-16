import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuItem,
  HorizontalDivider,
  Host,
  RNHostView,
  Text,
} from '@expo/ui/jetpack-compose';
import { width } from '@expo/ui/jetpack-compose/modifiers';
import { BoardPickerTrigger, type BoardPickerProps } from './boardPickerShared';
import { colors } from './ui';

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
  const [open, setOpen] = useState(false);
  function choose(action: () => void) {
    setOpen(false);
    action();
  }
  return (
    <Host matchContents colorScheme="light" seedColor={colors.primary}>
      <DropdownMenu
        expanded={open}
        onDismissRequest={() => setOpen(false)}
        color={colors.paper}
        cornerRadius={12}
        shadowElevation={4}
        properties={{ clippingEnabled: false }}
      >
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <BoardPickerTrigger
              boardName={boardName}
              expanded={open}
              onPress={() => setOpen(!open)}
            />
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {boards.map((board) => (
            <DropdownMenuItem
              key={board._id}
              modifiers={[width(220)]}
              elementColors={{ textColor: board._id === boardId ? colors.primaryDark : colors.ink }}
              onClick={() => choose(() => onSelect(board._id))}
            >
              <DropdownMenuItem.Text>
                <Text>{board.name}</Text>
              </DropdownMenuItem.Text>
              {board._id === boardId && (
                <DropdownMenuItem.TrailingIcon>
                  <Text color={colors.primaryDark}>✓</Text>
                </DropdownMenuItem.TrailingIcon>
              )}
            </DropdownMenuItem>
          ))}
          {(canLoadMore || loadingMore) && (
            <DropdownMenuItem
              modifiers={[width(220)]}
              enabled={!loadingMore}
              onClick={() => choose(onLoadMore)}
            >
              <DropdownMenuItem.Text>
                <Text>{loadingMore ? 'Loading…' : 'More boards'}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          )}
          {boards.length > 0 && <HorizontalDivider />}
          <DropdownMenuItem modifiers={[width(220)]} onClick={() => choose(onNewBoard)}>
            <DropdownMenuItem.Text>
              <Text>New board</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
          <DropdownMenuItem modifiers={[width(220)]} onClick={() => choose(onJoinBoard)}>
            <DropdownMenuItem.Text>
              <Text>Join board</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
