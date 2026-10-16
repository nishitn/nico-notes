import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Id } from '@nico-notes/backend/dataModel';

export type Routes = {
  Boards: undefined;
  Board: { boardId: Id<'boards'> };
  BoardForm: { boardId?: Id<'boards'> } | undefined;
  Join: { token?: string } | undefined;
  Account: undefined;
  Settings: { boardId: Id<'boards'> };
  Visit: { visitId: Id<'visits'> };
  VisitForm: {
    boardId: Id<'boards'>;
    visitId?: Id<'visits'>;
    placeId?: Id<'places'>;
    googlePlaceId?: string;
    title?: string;
    place?: string;
    location?: { latitude: number; longitude: number };
  };
  WishlistForm: {
    boardId: Id<'boards'>;
    title?: string;
    place?: string;
    notes?: string;
    googlePlaceId?: string;
    location?: { latitude: number; longitude: number };
    link?: string;
  };
  Places: { boardId: Id<'boards'> };
  Place: { boardId: Id<'boards'>; placeId: Id<'places'>; name: string };
};
export type ScreenProps<T extends keyof Routes> = NativeStackScreenProps<Routes, T>;
