import { storedPlace, GOOGLE_PLACE_LABEL } from '../placePersistence';
import { logVisitChange, logVisitUpdate } from './activity';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import schema, { locationValidator } from './schema';
import {
  authedMutation,
  authedQuery,
  bumpVisitCount,
  member,
  person,
  personValidator,
  visitAccess,
} from './lib';
import {
  linkVisit,
  resolvePlace,
  syncPlace,
  updatePlaceDetails,
  requireLinkedBoard,
  validateLocation,
  normalizedPlaceKey,
} from './places';
import { softDeleteVisit as deleteVisit } from './cleanup';
import { completePlannedVisit, ensurePlannedVisit, safeLink } from './plannedVisits';
import { MAX_ITEMS, MAX_PHOTOS, MAX_MEMBERS, textValue, validDate, validScore } from '../shared';

const fields = {
  placeId: v.optional(v.id('places')),
  googlePlaceId: v.optional(v.string()),
  title: v.string(),
  date: v.string(),
  place: v.string(),
  notes: v.string(),
  savedLink: v.optional(v.string()),
  location: v.optional(v.union(locationValidator, v.null())),
};
// Lightweight, paginated metadata lets the map include every visit, not just the first card page.
export const places = authedQuery({
  args: {
    boardId: v.id('boards'),
    paginationOpts: paginationOptsValidator,
    includePlanned: v.optional(v.boolean()),
  },
  returns: v.object({
    page: v.array(schema.doc('visits')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await member(ctx, args.boardId);
    const query = args.includePlanned
      ? ctx.db
          .query('visits')
          .withIndex('by_boardId_and_date', (q) => q.eq('boardId', args.boardId))
      : ctx.db
          .query('visits')
          .withIndex('by_boardId_and_status_and_date', (q) =>
            q.eq('boardId', args.boardId).eq('status', undefined),
          );
    const { page, isDone, continueCursor } = await query
      .order('desc')
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 100) });
    return { page, isDone, continueCursor };
  },
});
export const list = authedQuery({
  args: {
    boardId: v.id('boards'),
    placeId: v.optional(v.id('places')),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        ...schema.doc('visits').fields,
        photoId: v.union(v.id('photos'), v.null()),
        photoIds: v.array(v.id('photos')),
        dishAverage: v.union(v.number(), v.null()),
        highlights: v.array(v.string()),
        dishCount: v.number(),
        photoCount: v.number(),
        overall: v.union(v.number(), v.null()),
        dishes: v.optional(
          v.array(
            v.object({
              _id: v.id('dishes'),
              name: v.string(),
              score: v.union(v.number(), v.null()),
              ratings: v.array(
                v.object({
                  userId: v.optional(v.id('users')),
                  importedName: v.optional(v.string()),
                  score: v.number(),
                }),
              ),
            }),
          ),
        ),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await member(ctx, args.boardId);
    if (args.placeId) {
      const p = await ctx.db.get(args.placeId);
      if (!p || p.boardId !== args.boardId) {
        return { isDone: true, continueCursor: '', page: [] };
      }
    }
    const query = args.placeId
      ? ctx.db
          .query('visits')
          .withIndex('by_placeId_and_date', (q) => q.eq('placeId', args.placeId))
      : ctx.db
          .query('visits')
          .withIndex('by_boardId_and_status_and_date', (q) =>
            q.eq('boardId', args.boardId).eq('status', undefined),
          );
    const result = await query
      .order('desc')
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 24) });
    const page = await Promise.all(
      result.page.map(async (visit) => {
        const photos = await ctx.db
          .query('photos')
          .withIndex('by_visitId', (q) => q.eq('visitId', visit._id))
          .take(MAX_PHOTOS);
        const dishes = await ctx.db
          .query('dishes')
          .withIndex('by_visitId', (q) => q.eq('visitId', visit._id))
          .take(MAX_ITEMS);
        const ratings = await ctx.db
          .query('ratings')
          .withIndex('by_visitId_and_kind_and_targetId', (q) =>
            q.eq('visitId', visit._id).eq('kind', 'overall').eq('targetId', visit._id),
          )
          .take(2000);
        const dishRatings = await ctx.db
          .query('ratings')
          .withIndex('by_visitId_and_kind_and_targetId', (q) =>
            q.eq('visitId', visit._id).eq('kind', 'dish'),
          )
          .take(2000);
        const dishItems = dishes.slice(0, 5).map((d) => {
          const dRatings = dishRatings.filter((r) => r.targetId === d._id);
          const avg = dRatings.length
            ? dRatings.reduce((sum, r) => sum + r.score, 0) / dRatings.length
            : null;
          return {
            _id: d._id,
            name: d.name,
            score: avg,
            ratings: dRatings.map((r) => ({
              userId: r.userId,
              importedName: r.importedName,
              score: r.score,
            })),
          };
        });
        return {
          ...visit,
          photoIds: photos.map((p) => p._id),
          highlights: dishes.slice(0, 5).map((d) => d.name),
          dishes: dishItems,
          dishAverage: dishRatings.length
            ? dishRatings.reduce((sum, r) => sum + r.score, 0) / dishRatings.length
            : null,
          photoId: photos[0]?._id ?? null,
          photoCount: photos.length,
          dishCount: dishes.length,
          overall: ratings.length
            ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
            : null,
        };
      }),
    );
    return { isDone: result.isDone, continueCursor: result.continueCursor, page };
  },
});
export const get = authedQuery({
  args: { visitId: v.id('visits') },
  returns: v.object({
    visit: schema.doc('visits'),
    historyPlaceId: v.optional(v.union(v.id('places'), v.null())),
    board: schema.doc('boards'),
    categories: v.array(schema.doc('categories')),
    dishes: v.array(schema.doc('dishes')),
    photos: v.array(
      v.object({
        _id: v.id('photos'),
        _creationTime: v.number(),
        visitId: v.id('visits'),
        uploaderId: v.id('users'),
        caption: v.string(),
        contentType: v.string(),
      }),
    ),
    ratings: v.array(schema.doc('ratings')),
    people: v.array(personValidator),
    members: v.array(personValidator),
    isAdmin: v.boolean(),
  }),
  handler: async (ctx, { visitId }) => {
    const { visit, board, isAdmin } = await visitAccess(ctx, visitId);
    // Wishlist entries do not create visited places. Match an existing place
    // using the same durable identity as completed visits, without changing it.
    const historyPlace = visit.placeId
      ? await ctx.db.get(visit.placeId)
      : visit.status !== 'planned'
        ? null
        : visit.googlePlaceId
          ? await ctx.db
              .query('places')
              .withIndex('by_boardId_and_googlePlaceId', (q) =>
                q.eq('boardId', board._id).eq('googlePlaceId', visit.googlePlaceId),
              )
              .first()
          : await ctx.db
              .query('places')
              .withIndex('by_boardId_and_matchKey', (q) =>
                q
                  .eq('boardId', board._id)
                  .eq('matchKey', normalizedPlaceKey(visit.title, visit.place)),
              )
              .first();
    const ratings = await ctx.db
      .query('ratings')
      .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
      .take(2000);
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .take(MAX_MEMBERS);
    return {
      visit,
      historyPlaceId: historyPlace?.boardId === board._id ? historyPlace._id : null,
      board,
      ratings,
      isAdmin,
      members: await Promise.all(memberships.map((m) => person(ctx, m.userId))),
      people: await Promise.all(
        [...new Set(ratings.flatMap((r) => (r.userId ? [r.userId] : [])))].map((id) =>
          person(ctx, id),
        ),
      ),
      categories: (
        await ctx.db
          .query('categories')
          .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
          .take(MAX_ITEMS)
      ).sort((a, b) => a.position - b.position),
      dishes: await ctx.db
        .query('dishes')
        .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
        .take(MAX_ITEMS),
      photos: (
        await ctx.db
          .query('photos')
          .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
          .take(MAX_PHOTOS)
      ).map(
        ({ storageId: _storageId, localKey: _localKey, uploadId: _uploadId, ...photo }) => photo,
      ),
    };
  },
});
export const create = authedMutation({
  args: {
    boardId: v.id('boards'),
    typeId: v.optional(v.id('visitTypes')),
    planned: v.optional(v.boolean()),
    wishlistId: v.optional(v.id('wishlist')),
    keepWishlist: v.optional(v.boolean()),
    categories: v.optional(v.array(v.string())),
    dishes: v.optional(v.array(v.string())),
    initialScores: v.optional(
      v.array(
        v.object({
          userId: v.id('users'),
          overall: v.union(v.number(), v.null()),
          categories: v.array(v.union(v.number(), v.null())),
          dishes: v.array(v.union(v.number(), v.null())),
        }),
      ),
    ),
    showDishes: v.boolean(),
    ...fields,
  },
  returns: v.id('visits'),
  handler: async (ctx, args) => {
    args = storedPlace(args);
    const { isAdmin } = await member(ctx, args.boardId);
    if (args.date && !validDate(args.date)) throw new ConvexError('Choose a valid visit date.');
    if (args.planned && args.placeId) {
      const selectedPlace = await ctx.db.get(args.placeId);
      if (!selectedPlace || selectedPlace.boardId !== args.boardId)
        throw new ConvexError('Choose a place from this board.');
    }
    if (args.wishlistId && args.planned)
      throw new ConvexError('Edit the existing planned visit instead.');
    if (args.wishlistId) {
      const wish = await ctx.db.get(args.wishlistId);
      if (!wish || wish.boardId !== args.boardId)
        throw new ConvexError('Choose a wishlist item from this board.');
      if (args.keepWishlist === false) {
        const plannedId = await ensurePlannedVisit(ctx, wish);
        return completePlannedVisit(ctx, (await ctx.db.get(plannedId))!, args.date);
      }
    }
    const type = args.typeId ? await ctx.db.get(args.typeId) : null;
    if (args.typeId && (!type || type.boardId !== args.boardId))
      throw new ConvexError('Choose a visit type from this board.');
    const categories = (args.categories ?? type?.categories ?? []).map((n) =>
      textValue(n, 'Category', 50),
    );
    if (
      categories.length > MAX_ITEMS ||
      new Set(categories.map((n) => n.toLowerCase())).size !== categories.length
    )
      throw new ConvexError('Use up to 50 different category names.');
    const dishes = (args.dishes ?? []).map((name) => textValue(name, 'Dish name'));
    if (dishes.length > MAX_ITEMS) throw new ConvexError('A visit can have up to 50 dishes.');
    const initialScores = args.initialScores ?? [];
    if (args.planned && initialScores.length)
      throw new ConvexError('Mark this visit as visited before adding ratings.');
    if (
      initialScores.length > MAX_MEMBERS ||
      new Set(initialScores.map((entry) => entry.userId)).size !== initialScores.length
    )
      throw new ConvexError('Provide ratings once per member.');
    const memberships = initialScores.length
      ? await ctx.db
          .query('memberships')
          .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
          .take(MAX_MEMBERS)
      : [];
    let ratingCount = 0;
    for (const entry of initialScores) {
      if (entry.userId !== ctx.userId && !isAdmin)
        throw new ConvexError('Only a board admin can rate for another member.');
      if (!memberships.some((membership) => membership.userId === entry.userId))
        throw new ConvexError('This person is no longer a board member.');
      if (entry.categories.length !== categories.length || entry.dishes.length !== dishes.length)
        throw new ConvexError('Match scores to the categories and dishes in this visit.');
      for (const score of [entry.overall, ...entry.categories, ...entry.dishes]) {
        if (score === null) continue;
        if (!validScore(score)) throw new ConvexError('Ratings must be 1–10 in half-point steps.');
        ratingCount++;
      }
    }
    if (ratingCount > 2000) throw new ConvexError('A visit can have up to 2,000 ratings.');
    const place = args.planned
      ? null
      : args.placeId
        ? await ctx.db.get(args.placeId)
        : await resolvePlace(ctx, args);
    if (!args.planned && (!place || place.boardId !== args.boardId))
      throw new ConvexError('Choose a place from this board.');
    if (place?.googlePlaceId) args = storedPlace({ ...args, googlePlaceId: place.googlePlaceId });
    const visitId = await ctx.db.insert('visits', {
      placeId: place?._id,
      status: args.planned ? 'planned' : undefined,
      plannedAt: args.planned ? Date.now() : undefined,
      savedLink: safeLink(args.savedLink),
      googlePlaceId: args.googlePlaceId
        ? textValue(args.googlePlaceId, 'Google Place ID', 300)
        : undefined,
      boardId: args.boardId,
      creatorId: ctx.userId,
      title: textValue(args.title, 'Visit title'),
      date: args.date,
      place: args.place.trim().slice(0, 250),
      notes: args.notes.trim().slice(0, 5000),
      notesAuthorId: ctx.userId,
      typeName: type?.name ?? 'A visit',
      showDishes: args.showDishes || dishes.length > 0,
      location: validateLocation(args.location),
    });
    if (place) await syncPlace(ctx, place._id);
    const categoryIds = [];
    for (const [position, name] of categories.entries())
      categoryIds.push(await ctx.db.insert('categories', { visitId, name, position }));
    const dishIds = [];
    for (const name of dishes)
      dishIds.push(await ctx.db.insert('dishes', { visitId, name, description: '' }));
    for (const entry of initialScores) {
      const scores = [
        { kind: 'overall' as const, targetId: visitId, score: entry.overall },
        ...categoryIds.map((targetId, index) => ({
          kind: 'category' as const,
          targetId,
          score: entry.categories[index],
        })),
        ...dishIds.map((targetId, index) => ({
          kind: 'dish' as const,
          targetId,
          score: entry.dishes[index],
        })),
      ];
      for (const { score, ...target } of scores) {
        if (score !== null)
          await ctx.db.insert('ratings', {
            visitId,
            userId: entry.userId,
            ...target,
            score,
            note: '',
          });
      }
    }
    if (args.planned) {
      const wishlistId = await ctx.db.insert('wishlist', {
        boardId: args.boardId,
        creatorId: ctx.userId,
        visitId,
        title: textValue(args.title, 'Visit title'),
        place: args.place.trim().slice(0, 250),
        notes: args.notes.trim().slice(0, 5000),
        location: validateLocation(args.location),
        googlePlaceId: args.googlePlaceId,
        link: safeLink(args.savedLink),
        createdAt: Date.now(),
      });
      await ctx.db.patch(visitId, { wishlistId });
    } else await bumpVisitCount(ctx, args.boardId, 1);
    await logVisitChange(
      ctx,
      visitId,
      ctx.userId,
      args.planned ? 'added ' : 'added a visit to ',
      args.planned ? ' to the wishlist' : '',
    );
    return visitId;
  },
});
export const update = authedMutation({
  args: {
    visitId: v.id('visits'),
    showDishes: v.boolean(),
    expectedRevision: v.optional(v.number()),
    clearGooglePlace: v.optional(v.boolean()),
    ...fields,
  },
  returns: v.null(),
  handler: async (ctx, { visitId, ...args }) => {
    const { visit } = await visitAccess(ctx, visitId);
    const selected = args.placeId ? await ctx.db.get(args.placeId) : null;
    args = storedPlace({
      ...args,
      googlePlaceId: args.clearGooglePlace
        ? undefined
        : (args.googlePlaceId ?? selected?.googlePlaceId ?? visit.googlePlaceId),
    });
    if (args.expectedRevision !== undefined && args.expectedRevision !== (visit.revision ?? 0))
      throw new ConvexError(
        'This visit changed while you were editing. Your draft is safe. Reopen the latest visit before saving again.',
      );
    if (args.date && !validDate(args.date)) throw new ConvexError('Choose a valid visit date.');
    const title = textValue(args.title, 'Visit title');
    if (visit.status === 'planned') {
      if (args.placeId) {
        const place = await ctx.db.get(args.placeId);
        if (!place || place.boardId !== visit.boardId)
          throw new ConvexError('Choose a place from this board.');
      }
      const patch = {
        title,
        date: args.date,
        place: args.place.trim().slice(0, 250),
        notes: args.notes.trim().slice(0, 5000),
        notesAuthorId:
          args.notes.trim().slice(0, 5000) !== visit.notes ? ctx.userId : visit.notesAuthorId,
        showDishes: args.showDishes,
        location: args.googlePlaceId
          ? undefined
          : args.location === undefined
            ? visit.location
            : validateLocation(args.location),
        googlePlaceId: args.googlePlaceId
          ? textValue(args.googlePlaceId, 'Google Place ID', 300)
          : args.clearGooglePlace
            ? undefined
            : visit.googlePlaceId,
        savedLink: args.savedLink === undefined ? visit.savedLink : safeLink(args.savedLink),
        revision: (visit.revision ?? 0) + 1,
      };
      await ctx.db.patch(visitId, patch);
      if (visit.wishlistId && (await ctx.db.get(visit.wishlistId)))
        await ctx.db.patch(visit.wishlistId, {
          title: patch.title,
          place: patch.place,
          notes: patch.notes,
          location: patch.location,
          googlePlaceId: patch.googlePlaceId,
          link: patch.savedLink,
        });
      await logVisitUpdate(ctx, visit, ctx.userId);
      return null;
    }
    const oldPlace = visit.placeId ? await ctx.db.get(visit.placeId) : null;
    const explicitPlace = args.placeId ? await ctx.db.get(args.placeId) : null;
    if (args.placeId && (!explicitPlace || explicitPlace.boardId !== visit.boardId))
      throw new ConvexError('Choose a place from this board.');
    const sameIdentity =
      oldPlace &&
      !args.clearGooglePlace &&
      (!args.placeId || args.placeId === oldPlace._id) &&
      (!args.googlePlaceId || args.googlePlaceId === oldPlace.googlePlaceId) &&
      normalizedPlaceKey(title, '') === normalizedPlaceKey(visit.title, '');
    let place;
    if (sameIdentity) {
      // Change canonical fields only when the visit form actually changed them.
      const address =
        args.place === visit.place ? oldPlace.address : args.place.trim().slice(0, 250);
      const location =
        args.location === undefined ||
        JSON.stringify(args.location) === JSON.stringify(visit.location ?? null)
          ? oldPlace.location
          : validateLocation(args.location);
      if (
        address !== oldPlace.address ||
        JSON.stringify(location) !== JSON.stringify(oldPlace.location)
      )
        await requireLinkedBoard(ctx, visit.boardId);
      place = await updatePlaceDetails(ctx, oldPlace, address, location);
    } else {
      place =
        explicitPlace && explicitPlace._id !== oldPlace?._id
          ? explicitPlace
          : await resolvePlace(ctx, { ...args, boardId: visit.boardId });
    }
    await ctx.db.patch(visitId, {
      revision: (visit.revision ?? 0) + 1,
      title: place.googlePlaceId ? GOOGLE_PLACE_LABEL : title,
      date: args.date,
      notes: args.notes.trim().slice(0, 5000),
      ...(args.savedLink !== undefined ? { savedLink: safeLink(args.savedLink) } : {}),
      ...(args.notes.trim().slice(0, 5000) !== visit.notes ? { notesAuthorId: ctx.userId } : {}),
      showDishes: args.showDishes,
      placeId: place._id,
      mapQuery: undefined,
    });
    await linkVisit(ctx, visitId);
    if (oldPlace && oldPlace._id !== place._id) await syncPlace(ctx, oldPlace._id);
    await logVisitUpdate(ctx, visit, ctx.userId);
    return null;
  },
});
export const remove = authedMutation({
  args: { visitId: v.id('visits') },
  returns: v.null(),
  handler: async (ctx, { visitId }) => {
    const { visit, isAdmin } = await visitAccess(ctx, visitId);
    if (visit.creatorId !== ctx.userId && !isAdmin)
      throw new ConvexError('Only the visit creator or board admin can delete this visit.');
    await logVisitChange(
      ctx,
      visitId,
      ctx.userId,
      visit.status === 'planned' ? 'removed ' : 'deleted the visit to ',
      visit.status === 'planned' ? ' from the wishlist' : '',
    );
    await deleteVisit(ctx, visitId);
    if (visit.placeId) await syncPlace(ctx, visit.placeId);
    return null;
  },
});

export const markVisited = authedMutation({
  args: {
    visitId: v.id('visits'),
    date: v.string(),
    expectedRevision: v.optional(v.number()),
    details: v.optional(
      v.object({
        notes: v.string(),
        dishes: v.array(v.string()),
        savedLink: v.optional(v.string()),
      }),
    ),
  },
  returns: v.id('visits'),
  handler: async (ctx, { visitId, date, expectedRevision, details }) => {
    const { visit } = await visitAccess(ctx, visitId);
    // Retrying a completed save must not replace dishes or notes a second time.
    if (visit.status !== 'planned') return visitId;
    if (details && details.dishes.length > MAX_ITEMS)
      throw new ConvexError('A visit can have up to 50 dishes.');
    const dishes = details?.dishes.map((name) => textValue(name, 'Dish name'));
    const savedLink = details ? safeLink(details.savedLink) : undefined;
    await completePlannedVisit(ctx, visit, date, expectedRevision);
    if (details && dishes) {
      const previousDishes = await ctx.db
        .query('dishes')
        .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
        .take(MAX_ITEMS + 1);
      if (previousDishes.length > MAX_ITEMS)
        throw new ConvexError('This wishlist has too many dishes. Remove some before saving.');
      for (const dish of previousDishes) await ctx.db.delete(dish._id);
      for (const name of dishes) await ctx.db.insert('dishes', { visitId, name, description: '' });
      await ctx.db.patch(visitId, {
        notes: details.notes.trim().slice(0, 5000),
        notesAuthorId: ctx.userId,
        showDishes: visit.showDishes || dishes.length > 0,
        savedLink,
      });
    }
    return visitId;
  },
});
