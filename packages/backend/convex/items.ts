import { logVisitChange } from './activity';
import { ConvexError, v } from 'convex/values';
import { authedMutation, visitAccess } from './lib';
import { MAX_ITEMS, textValue } from '../shared';

export const saveDish = authedMutation({
  args: {
    visitId: v.id('visits'),
    id: v.optional(v.id('dishes')),
    name: v.string(),
    description: v.string(),
  },
  returns: v.id('dishes'),
  handler: async (ctx, { id, ...args }) => {
    await visitAccess(ctx, args.visitId);
    const fields = {
      ...args,
      name: textValue(args.name, 'Dish name'),
      description: args.description.trim().slice(0, 500),
    };
    if (id) {
      const dish = await ctx.db.get(id);
      if (!dish || dish.visitId !== args.visitId)
        throw new ConvexError('This dish is not part of this visit.');
      await ctx.db.patch(id, fields);
      if (dish.name !== fields.name || dish.description !== fields.description)
        await logVisitChange(ctx, args.visitId, ctx.userId, 'updated a dish on');
      return id;
    }
    const dishes = await ctx.db
      .query('dishes')
      .withIndex('by_visitId', (q) => q.eq('visitId', args.visitId))
      .take(MAX_ITEMS);
    if (dishes.length >= MAX_ITEMS) throw new ConvexError('A visit can have up to 50 dishes.');
    const dishId = await ctx.db.insert('dishes', fields);
    await logVisitChange(ctx, args.visitId, ctx.userId, 'added a dish to');
    return dishId;
  },
});
export const saveCategory = authedMutation({
  args: { visitId: v.id('visits'), id: v.optional(v.id('categories')), name: v.string() },
  returns: v.id('categories'),
  handler: async (ctx, { id, visitId, name }) => {
    await visitAccess(ctx, visitId);
    const clean = textValue(name, 'Category', 50);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_visitId', (q) => q.eq('visitId', visitId))
      .take(MAX_ITEMS);
    if (categories.some((c) => c._id !== id && c.name.toLowerCase() === clean.toLowerCase()))
      throw new ConvexError('This visit already has that category.');
    if (id) {
      const category = await ctx.db.get(id);
      if (!category || category.visitId !== visitId)
        throw new ConvexError('This category is not part of this visit.');
      await ctx.db.patch(id, { name: clean });
      if (category.name !== clean)
        await logVisitChange(ctx, visitId, ctx.userId, 'updated a category on');
      return id;
    }
    if (categories.length >= MAX_ITEMS)
      throw new ConvexError('A visit can have up to 50 categories.');
    await logVisitChange(ctx, visitId, ctx.userId, 'added a category to');
    return ctx.db.insert('categories', {
      visitId,
      name: clean,
      position: Math.max(-1, ...categories.map((c) => c.position)) + 1,
    });
  },
});
export const remove = authedMutation({
  args: {
    visitId: v.id('visits'),
    target: v.union(v.id('dishes'), v.id('categories')),
    confirmed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { visitId, target, confirmed }) => {
    const { isAdmin } = await visitAccess(ctx, visitId);
    if (!isAdmin) throw new ConvexError('Only a board admin can remove dishes or categories.');
    const item = await ctx.db.get(target);
    if (!item || item.visitId !== visitId)
      throw new ConvexError('This item is not part of this visit.');
    if (!confirmed) throw new ConvexError('Confirm removal of this item and its ratings.');
    const kind = ctx.db.normalizeId('dishes', target) ? 'dish' : 'category';
    const ratings = await ctx.db
      .query('ratings')
      .withIndex('by_visitId_and_kind_and_targetId', (q) =>
        q.eq('visitId', visitId).eq('kind', kind).eq('targetId', target),
      )
      .take(2000);
    for (const rating of ratings) await ctx.db.delete(rating._id);
    await ctx.db.delete(target);
    await logVisitChange(ctx, visitId, ctx.userId, `removed a ${kind} from`);
    return null;
  },
});
