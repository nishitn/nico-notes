import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import schema, { accent } from './schema';
import { authedMutation, authedQuery, member, owner, person, personValidator } from './lib';
import { INVITE_LIFETIME, MAX_MEMBERS, textValue } from '../shared';

export const me = authedQuery({
  args: {},
  returns: personValidator,
  handler: (ctx) => person(ctx, ctx.userId),
});
export const list = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(schema.doc('boards')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .order('desc')
      .paginate(args.paginationOpts);
    const boards = await Promise.all(page.page.map((m) => ctx.db.get(m.boardId)));
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      page: boards.filter((b) => b !== null).filter((b) => !b.deleting),
    };
  },
});
export const get = authedQuery({
  args: { boardId: v.id('boards') },
  returns: v.object({
    board: schema.doc('boards'),
    members: v.array(personValidator),
    types: v.array(schema.doc('visitTypes')),
  }),
  handler: async (ctx, { boardId }) => {
    const { board } = await member(ctx, boardId);
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .take(MAX_MEMBERS);
    return {
      board,
      members: await Promise.all(memberships.map((m) => person(ctx, m.userId))),
      types: await ctx.db
        .query('visitTypes')
        .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
        .take(50),
    };
  },
});
export const create = authedMutation({
  args: { name: v.string(), description: v.string(), accent },
  returns: v.id('boards'),
  handler: async (ctx, args) => {
    const boardId = await ctx.db.insert('boards', {
      ...args,
      name: textValue(args.name, 'Board name', 80),
      description: args.description.trim().slice(0, 500),
      ownerId: ctx.userId,
      deleting: false,
    });
    await ctx.db.insert('memberships', { boardId, userId: ctx.userId });
    await ctx.db.insert('visitTypes', {
      boardId,
      name: 'Food',
      categories: ['Food', 'Ambience', 'Value'],
      showDishes: true,
    });
    await ctx.db.insert('visitTypes', {
      boardId,
      name: 'Adventure',
      categories: ['Experience', 'View'],
      showDishes: false,
    });
    return boardId;
  },
});
export const update = authedMutation({
  args: { boardId: v.id('boards'), name: v.string(), description: v.string(), accent },
  returns: v.null(),
  handler: async (ctx, { boardId, ...fields }) => {
    await owner(ctx, boardId);
    await ctx.db.patch(boardId, {
      ...fields,
      name: textValue(fields.name, 'Board name', 80),
      description: fields.description.trim().slice(0, 500),
    });
    return null;
  },
});
export const removeMember = authedMutation({
  args: { boardId: v.id('boards'), userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { board } = await owner(ctx, args.boardId);
    if (args.userId === board.ownerId) throw new ConvexError('The owner cannot be removed.');
    const m = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) =>
        q.eq('boardId', args.boardId).eq('userId', args.userId),
      )
      .unique();
    if (m) await ctx.db.delete(m._id);
    return null;
  },
});
export const createInvitation = authedMutation({
  args: { boardId: v.id('boards') },
  returns: schema.doc('invitations'),
  handler: async (ctx, { boardId }) => {
    await owner(ctx, boardId);
    const old = await ctx.db
      .query('invitations')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .take(20);
    for (const invite of old) await ctx.db.delete(invite._id);
    const id = await ctx.db.insert('invitations', {
      boardId,
      token: crypto.randomUUID(),
      expiresAt: Date.now() + INVITE_LIFETIME,
      revoked: false,
    });
    await ctx.scheduler.runAfter(INVITE_LIFETIME, internal.cleanup.expireInvitation, {
      invitationId: id,
    });
    return (await ctx.db.get(id))!;
  },
});
export const invitations = authedQuery({
  args: { boardId: v.id('boards') },
  returns: v.array(schema.doc('invitations')),
  handler: async (ctx, { boardId }) => {
    await owner(ctx, boardId);
    return ctx.db
      .query('invitations')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .take(20);
  },
});
export const revokeInvitation = authedMutation({
  args: { invitationId: v.id('invitations') },
  returns: v.null(),
  handler: async (ctx, { invitationId }) => {
    const invitation = await ctx.db.get(invitationId);
    if (!invitation) return null;
    await owner(ctx, invitation.boardId);
    await ctx.db.patch(invitationId, { revoked: true });
    return null;
  },
});
export const invitation = authedQuery({
  args: { token: v.string() },
  returns: v.object({ name: v.string(), boardId: v.id('boards'), alreadyMember: v.boolean() }),
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query('invitations')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (!invite || invite.revoked || invite.expiresAt <= Date.now())
      throw new ConvexError(
        'This invitation has expired or been revoked. Ask the owner for a new link.',
      );
    const board = await ctx.db.get(invite.boardId);
    if (!board || board.deleting) throw new ConvexError('This board is no longer available.');
    const m = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) =>
        q.eq('boardId', board._id).eq('userId', ctx.userId),
      )
      .unique();
    return { name: board.name, boardId: board._id, alreadyMember: !!m };
  },
});
export const acceptInvitation = authedMutation({
  args: { token: v.string() },
  returns: v.id('boards'),
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query('invitations')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (!invite || invite.revoked || invite.expiresAt <= Date.now())
      throw new ConvexError('This invitation has expired or been revoked.');
    const board = await ctx.db.get(invite.boardId);
    if (!board || board.deleting) throw new ConvexError('This board is no longer available.');
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
      .take(MAX_MEMBERS);
    if (memberships.some((m) => m.userId === ctx.userId)) return board._id;
    if (memberships.length >= MAX_MEMBERS)
      throw new ConvexError('This board has reached its 20-member limit.');
    await ctx.db.insert('memberships', { boardId: board._id, userId: ctx.userId });
    return board._id;
  },
});
export const remove = authedMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    await owner(ctx, boardId);
    await ctx.db.patch(boardId, { deleting: true });
    await ctx.scheduler.runAfter(0, internal.cleanup.board, { boardId });
    return null;
  },
});
