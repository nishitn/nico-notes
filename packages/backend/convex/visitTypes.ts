import { ConvexError, v } from 'convex/values';
import { authedMutation, member } from './lib';
import { textValue } from '../shared';

export const save = authedMutation({
  args: {
    boardId: v.id('boards'),
    id: v.optional(v.id('visitTypes')),
    name: v.string(),
    categories: v.array(v.string()),
    showDishes: v.boolean(),
  },
  returns: v.id('visitTypes'),
  handler: async (ctx, { id, ...args }) => {
    await member(ctx, args.boardId);
    const categories = args.categories.map((s) => textValue(s, 'Category', 50));
    if (
      categories.length > 20 ||
      new Set(categories.map((s) => s.toLowerCase())).size !== categories.length
    )
      throw new ConvexError('Use up to 20 different category names.');
    const fields = { ...args, name: textValue(args.name, 'Type name', 50), categories };
    if (id) {
      const old = await ctx.db.get(id);
      if (!old || old.boardId !== args.boardId)
        throw new ConvexError('This type does not belong to this board.');
      await ctx.db.patch(id, fields);
      return id;
    }
    const types = await ctx.db
      .query('visitTypes')
      .withIndex('by_boardId', (q) => q.eq('boardId', args.boardId))
      .take(50);
    if (types.length >= 50) throw new ConvexError('A board can have up to 50 visit types.');
    return ctx.db.insert('visitTypes', fields);
  },
});
export const remove = authedMutation({
  args: { id: v.id('visitTypes') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const type = await ctx.db.get(id);
    if (!type) return null;
    await member(ctx, type.boardId);
    await ctx.db.delete(id);
    return null;
  },
});
