import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import schema, { locationValidator } from './schema';
import { authedMutation, authedQuery, member, person, personValidator, visitAccess } from './lib';
import { deleteVisit } from './cleanup';
import { MAX_ITEMS, MAX_PHOTOS, MAX_MEMBERS, textValue, validDate, validScore } from '../shared';

const fields = {
  title: v.string(),
  date: v.string(),
  place: v.string(),
  notes: v.string(),
  location: v.optional(v.union(locationValidator, v.null())),
};
function validateLocation(
  location: { latitude: number; longitude: number; source?: string } | null | undefined,
) {
  if (
    location &&
    (!Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180)
  )
    throw new ConvexError('Choose a valid map location.');
  return location ? { latitude: location.latitude, longitude: location.longitude } : undefined;
}
// Lightweight, paginated metadata lets the map include every visit, not just the first card page.
export const places = authedQuery({
  args: { boardId: v.id('boards'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(schema.doc('visits')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await member(ctx, args.boardId);
    const { page, isDone, continueCursor } = await ctx.db
      .query('visits')
      .withIndex('by_boardId_and_date', (q) => q.eq('boardId', args.boardId))
      .order('desc')
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 100) });
    return { page, isDone, continueCursor };
  },
});
export const list = authedQuery({
  args: { boardId: v.id('boards'), paginationOpts: paginationOptsValidator },
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
    const result = await ctx.db
      .query('visits')
      .withIndex('by_boardId_and_date', (q) => q.eq('boardId', args.boardId))
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
          photoIds: photos.slice(0, 3).map((p) => p._id),
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
      ).map(({ storageId: _storageId, localKey: _localKey, ...photo }) => photo),
    };
  },
});
export const create = authedMutation({
  args: {
    boardId: v.id('boards'),
    typeId: v.optional(v.id('visitTypes')),
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
    const { isAdmin } = await member(ctx, args.boardId);
    if (args.date && !validDate(args.date)) throw new ConvexError('Choose a valid visit date.');
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
    const visitId = await ctx.db.insert('visits', {
      boardId: args.boardId,
      creatorId: ctx.userId,
      title: textValue(args.title, 'Visit title'),
      date: args.date,
      place: args.place.trim().slice(0, 250),
      notes: args.notes.trim().slice(0, 5000),
      typeName: type?.name ?? 'A visit',
      showDishes: args.showDishes || dishes.length > 0,
      location: validateLocation(args.location),
    });
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
    return visitId;
  },
});
export const update = authedMutation({
  args: { visitId: v.id('visits'), showDishes: v.boolean(), ...fields },
  returns: v.null(),
  handler: async (ctx, { visitId, ...args }) => {
    const { visit } = await visitAccess(ctx, visitId);
    if (args.date && !validDate(args.date)) throw new ConvexError('Choose a valid visit date.');
    await ctx.db.patch(visitId, {
      ...args,
      mapQuery:
        args.title !== visit.title || args.place !== visit.place ? undefined : visit.mapQuery,
      location: args.location === undefined ? visit.location : validateLocation(args.location),
      title: textValue(args.title, 'Visit title'),
      place: args.place.trim().slice(0, 250),
      notes: args.notes.trim().slice(0, 5000),
    });
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
    await deleteVisit(ctx, visitId);
    return null;
  },
});
