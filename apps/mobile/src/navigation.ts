import type { NativeStackScreenProps } from 'expo-router';
import type { Id } from '@nico-notes/backend/dataModel';

export type Routes = {
  Boards: undefined;
  JournalVisits: { boardId: Id<'boards'> };
  JournalWishlist: { boardId: Id<'boards'> };
  Board: { boardId: Id<'boards'> };
  BoardForm: { boardId?: Id<'boards'> } | undefined;
  Join: { token?: string } | undefined;
  Account: undefined;
  Support: undefined;
  Safety: { boardId: Id<'boards'>; visitId?: Id<'visits'>; photoId?: Id<'photos'> };
  YourBoards: undefined;
  Settings: { boardId: Id<'boards'> };
  Visit: { visitId: Id<'visits'>; promptRating?: boolean };
  VisitForm: {
    boardId: Id<'boards'>;
    planned?: boolean;
    completePlanned?: boolean;
    notes?: string;
    savedLink?: string;
    wishlistId?: Id<'wishlist'>;
    keepWishlist?: boolean;
    visitId?: Id<'visits'>;
    placeId?: Id<'places'>;
    googlePlaceId?: string;
    title?: string;
    place?: string;
    location?: { latitude: number; longitude: number };
  };
  Wishlist: { id: Id<'wishlist'> };
  WishlistForm: {
    boardId: Id<'boards'>;
    id?: Id<'wishlist'>;
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
