import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import schema from './schema';
import { authedMutation, authedQuery, member, person, personValidator, visitAccess } from './lib';
import { deleteVisit } from './cleanup';
import { MAX_ITEMS, MAX_PHOTOS, textValue, validDate } from '../shared';

const fields = { title: v.string(), date: v.string(), place: v.string(), notes: v.string() };
export const list = authedQuery({
  args: { boardId: v.id('boards'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        ...schema.doc('visits').fields,
        photoId: v.union(v.id('photos'), v.null()),
        dishCount: v.number(),
        photoCount: v.number(),
        overall: v.union(v.number(), v.null()),
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
        return {
          ...visit,
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
  }),
  handler: async (ctx, { visitId }) => {
    const { visit, board } = await visitAccess(ctx, visitId);
    const ratings = await ctx.db
      .query('ratings')
      .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
      .take(2000);
    return {
      visit,
      board,
      ratings,
      people: await Promise.all(
        [...new Set(ratings.map((r) => r.userId))].map((id) => person(ctx, id)),
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
      ).map(({ storageId: _storageId, ...photo }) => photo),
    };
  },
});
export const create = authedMutation({
  args: {
    boardId: v.id('boards'),
    typeId: v.optional(v.id('visitTypes')),
    categories: v.optional(v.array(v.string())),
    showDishes: v.boolean(),
    ...fields,
  },
  returns: v.id('visits'),
  handler: async (ctx, args) => {
    await member(ctx, args.boardId);
    if (!validDate(args.date)) throw new ConvexError('Choose a valid visit date.');
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
    const visitId = await ctx.db.insert('visits', {
      boardId: args.boardId,
      creatorId: ctx.userId,
      title: textValue(args.title, 'Visit title'),
      date: args.date,
      place: args.place.trim().slice(0, 250),
      notes: args.notes.trim().slice(0, 5000),
      typeName: type?.name ?? 'A date',
      showDishes: args.showDishes,
    });
    for (const [position, name] of categories.entries())
      await ctx.db.insert('categories', { visitId, name, position });
    return visitId;
  },
});
export const update = authedMutation({
  args: { visitId: v.id('visits'), showDishes: v.boolean(), ...fields },
  returns: v.null(),
  handler: async (ctx, { visitId, ...args }) => {
    await visitAccess(ctx, visitId);
    if (!validDate(args.date)) throw new ConvexError('Choose a valid visit date.');
    await ctx.db.patch(visitId, {
      ...args,
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
    const { visit, board } = await visitAccess(ctx, visitId);
    if (visit.creatorId !== ctx.userId && board.ownerId !== ctx.userId)
      throw new ConvexError('Only the visit creator or board owner can delete this visit.');
    await deleteVisit(ctx, visitId);
    return null;
  },
});
