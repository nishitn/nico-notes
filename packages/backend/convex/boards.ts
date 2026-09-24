import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import schema, { accent, memberRole } from './schema';
import {
  authedMutation,
  authedQuery,
  member,
  admin,
  membershipRole,
  person,
  personValidator,
} from './lib';
import { INVITE_LIFETIME, MAX_MEMBERS, textValue } from '../shared';

const inviteWords = `
  ARCH AURA BAKE BARN BEAM BEAR BELL BIRD BLUE BOAT BOLD BOOK
  BOWL BUDS CAKE CALM CAMP CANE CAPE CARD CAVE CHAI CHAT
  CHEF CLAY CLUB COZY COVE DAWN DEER DESK DOVE DRAW DUNE DUSK
  ECHO FERN FILM FISH FIZZ FLAG FOLK FONT FOOD FORK FROG GATE
  GEMS GIFT GLOW GOAT GOLD GOOD GRIN GROW HARP HAZE HERB HIKE
  HILL HOME HUGS IRIS ISLE JADE JARS JAZZ JUNE KITE KIWI LACE
  LAKE LAMB LAMP LAND LARK LEAF LIME LION LOFT LOVE LUCK LUNA
  LUSH LYNX MALT MANY MARS MESA MILD MILK MINT MIST MOON MOSS
  MUSE NEST NEXT NOTE NOVA OAKS OATS OPAL OPEN OVEN PALM PARK
  PATH PEAR PINE PINK PLUM POND POOL POPS PORT POSE PUFF PURE
  QUAY QUIZ RAIN REED REEF REST RICE RISE ROAD ROAM ROCK ROSE
  RUBY SAGE SAIL SALT SAND SEAL SEED SILK SING SKIP SNOW SOAP
  SOAR SOCK SOFT SONG SOUP STAR STEM STEP STIR SURF SWAN TACO
  TALE TEAM TENT TIDE TILE TIME TINY TOFU TREE TRIP TUBA TUNA
  TUNE TWIG VASE VAST VEIL VIBE VIEW VINE WAVE WEST WILD WIND
  WING WINK WISH WOLF WOOD WOOL WREN YARN YEAR YOGA ZEST ZINC
`
  .trim()
  .split(/\s+/);

export function generateInviteCode(): string {
  return Array.from(
    { length: 3 },
    () => inviteWords[Math.floor(Math.random() * inviteWords.length)],
  ).join('-');
}

async function uniqueInviteCode(ctx: QueryCtx): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const code = generateInviteCode();
    const existing = await ctx.db
      .query('boards')
      .withIndex('by_inviteCode', (q) => q.eq('inviteCode', code))
      .first();
    if (!existing) return code;
  }
  throw new ConvexError('Could not create an invite code. Please try again.');
}

export async function resolveBoardFromCode(
  ctx: QueryCtx,
  rawCode: string,
): Promise<Doc<'boards'> | null> {
  const trimmed = rawCode.trim();
  if (!trimmed) return null;

  let tokenOrCode = trimmed;
  if (tokenOrCode.includes('/')) {
    const parts = tokenOrCode.split('/').filter(Boolean);
    tokenOrCode = parts[parts.length - 1] || tokenOrCode;
  }
  tokenOrCode = tokenOrCode.trim();

  const uppercase = tokenOrCode.toUpperCase();
  let board = await ctx.db
    .query('boards')
    .withIndex('by_inviteCode', (q) => q.eq('inviteCode', uppercase))
    .first();

  if (!board && !uppercase.startsWith('DN-')) {
    board = await ctx.db
      .query('boards')
      .withIndex('by_inviteCode', (q) => q.eq('inviteCode', `DN-${uppercase}`))
      .first();
  }

  if (board && !board.deleting) return board;

  const invitation = await ctx.db
    .query('invitations')
    .withIndex('by_token', (q) => q.eq('token', tokenOrCode))
    .unique();

  if (invitation && !invitation.revoked && invitation.expiresAt > Date.now()) {
    const inviteBoard = await ctx.db.get(invitation.boardId);
    if (inviteBoard && !inviteBoard.deleting) return inviteBoard;
  }

  return null;
}

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
    members: v.array(v.object({ ...personValidator.fields, role: memberRole })),
    isAdmin: v.boolean(),
    types: v.array(schema.doc('visitTypes')),
  }),
  handler: async (ctx, { boardId }) => {
    const { board, isAdmin } = await member(ctx, boardId);
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .take(MAX_MEMBERS);
    return {
      board,
      isAdmin,
      members: await Promise.all(
        memberships.map(async (m) => ({
          ...(await person(ctx, m.userId)),
          role: membershipRole(board, m),
        })),
      ),
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
    const inviteCode = await uniqueInviteCode(ctx);
    const boardId = await ctx.db.insert('boards', {
      ...args,
      name: textValue(args.name, 'Board name', 80),
      description: args.description.trim().slice(0, 500),
      ownerId: ctx.userId,
      deleting: false,
      inviteCode,
    });
    await ctx.db.insert('memberships', { boardId, userId: ctx.userId, role: 'admin' });
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
    await admin(ctx, boardId);
    await ctx.db.patch(boardId, {
      ...fields,
      name: textValue(fields.name, 'Board name', 80),
      description: fields.description.trim().slice(0, 500),
    });
    return null;
  },
});
export const ensureInviteCode = authedMutation({
  args: { boardId: v.id('boards') },
  returns: v.string(),
  handler: async (ctx, { boardId }) => {
    const { board } = await member(ctx, boardId);
    if (board.inviteCode) return board.inviteCode;
    const code = await uniqueInviteCode(ctx);
    await ctx.db.patch(boardId, { inviteCode: code });
    return code;
  },
});
export const regenerateInviteCode = authedMutation({
  args: { boardId: v.id('boards') },
  returns: v.string(),
  handler: async (ctx, { boardId }) => {
    await admin(ctx, boardId);
    const code = await uniqueInviteCode(ctx);
    await ctx.db.patch(boardId, { inviteCode: code });
    return code;
  },
});
async function keepAdmin(ctx: QueryCtx, board: Doc<'boards'>, membership: Doc<'memberships'>) {
  if (membershipRole(board, membership) !== 'admin') return;
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
    .take(MAX_MEMBERS);
  if (!memberships.some((m) => m._id !== membership._id && membershipRole(board, m) === 'admin'))
    throw new ConvexError('Keep at least one admin on this board.');
}

export const setMemberRole = authedMutation({
  args: { boardId: v.id('boards'), userId: v.id('users'), role: memberRole },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { board } = await admin(ctx, args.boardId);
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) =>
        q.eq('boardId', args.boardId).eq('userId', args.userId),
      )
      .unique();
    if (!membership) throw new ConvexError('This person is no longer a board member.');
    if (args.role === 'member') await keepAdmin(ctx, board, membership);
    await ctx.db.patch(membership._id, { role: args.role });
    return null;
  },
});

export const removeMember = authedMutation({
  args: { boardId: v.id('boards'), userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { board } = await admin(ctx, args.boardId);
    const m = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) =>
        q.eq('boardId', args.boardId).eq('userId', args.userId),
      )
      .unique();
    if (m) {
      await keepAdmin(ctx, board, m);
      await ctx.db.delete(m._id);
    }
    return null;
  },
});
export const createInvitation = authedMutation({
  args: { boardId: v.id('boards') },
  returns: schema.doc('invitations'),
  handler: async (ctx, { boardId }) => {
    const { board } = await member(ctx, boardId);
    if (!board.inviteCode) {
      await ctx.db.patch(boardId, { inviteCode: await uniqueInviteCode(ctx) });
    }
    const old = await ctx.db
      .query('invitations')
      .withIndex('by_boardId', (q) => q.eq('boardId', boardId))
      .take(20);
    // Sharing a board's active link must not invalidate a link someone else sent.
    const active = old.find((invite) => !invite.revoked && invite.expiresAt > Date.now());
    if (active) return active;
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
    await member(ctx, boardId);
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
    await admin(ctx, invitation.boardId);
    await ctx.db.patch(invitationId, { revoked: true });
    return null;
  },
});
export const invitation = authedQuery({
  args: { token: v.string() },
  returns: v.object({
    name: v.string(),
    boardId: v.id('boards'),
    alreadyMember: v.boolean(),
    requestStatus: v.optional(v.string()),
  }),
  handler: async (ctx, { token }) => {
    let board: Doc<'boards'> | null = null;
    const invite = await ctx.db
      .query('invitations')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique();
    if (invite && !invite.revoked && invite.expiresAt > Date.now()) {
      board = await ctx.db.get(invite.boardId);
    } else {
      board = await resolveBoardFromCode(ctx, token);
    }
    if (!board || board.deleting)
      throw new ConvexError(
        'This invitation has expired or been revoked. Ask a board member for a new link.',
      );
    const m = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) =>
        q.eq('boardId', board._id).eq('userId', ctx.userId),
      )
      .unique();
    const existingReq = await ctx.db
      .query('joinRequests')
      .withIndex('by_boardId_and_userId', (q) =>
        q.eq('boardId', board._id).eq('userId', ctx.userId),
      )
      .first();
    return {
      name: board.name,
      boardId: board._id,
      alreadyMember: !!m,
      requestStatus: existingReq ? existingReq.status : undefined,
    };
  },
});
async function requestBoardAccess(
  ctx: MutationCtx & { userId: Id<'users'> },
  board: Doc<'boards'>,
) {
  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', board._id).eq('userId', ctx.userId))
    .unique();
  if (membership) {
    return { status: 'already_member' as const, boardId: board._id, boardName: board.name };
  }

  const existingRequest = await ctx.db
    .query('joinRequests')
    .withIndex('by_boardId_and_userId', (q) => q.eq('boardId', board._id).eq('userId', ctx.userId))
    .first();
  if (existingRequest?.status === 'pending') {
    return { status: 'already_pending' as const, boardId: board._id, boardName: board.name };
  }

  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_boardId', (q) => q.eq('boardId', board._id))
    .take(MAX_MEMBERS);
  if (memberships.length >= MAX_MEMBERS) {
    throw new ConvexError('This board has reached its 20-member limit.');
  }

  if (existingRequest) {
    await ctx.db.patch(existingRequest._id, {
      status: 'pending',
      createdAt: Date.now(),
      reviewedAt: undefined,
      reviewedBy: undefined,
    });
  } else {
    await ctx.db.insert('joinRequests', {
      boardId: board._id,
      userId: ctx.userId,
      status: 'pending',
      createdAt: Date.now(),
    });
  }
  return { status: 'requested' as const, boardId: board._id, boardName: board.name };
}

// Keep older clients compatible without allowing them to bypass admin approval.
export const acceptInvitation = authedMutation({
  args: { token: v.string() },
  returns: v.id('boards'),
  handler: async (ctx, { token }) => {
    const board = await resolveBoardFromCode(ctx, token);
    if (!board) throw new ConvexError('This invitation has expired or been revoked.');
    await requestBoardAccess(ctx, board);
    return board._id;
  },
});
export const requestToJoin = authedMutation({
  args: { code: v.string() },
  returns: v.object({
    status: v.union(
      v.literal('requested'),
      v.literal('already_member'),
      v.literal('already_pending'),
    ),
    boardId: v.id('boards'),
    boardName: v.string(),
  }),
  handler: async (ctx, { code }) => {
    const board = await resolveBoardFromCode(ctx, code);
    if (!board) throw new ConvexError('Board not found. Please verify your invite code or link.');
    return requestBoardAccess(ctx, board);
  },
});
export const pendingRequests = authedQuery({
  args: { boardId: v.id('boards') },
  returns: v.array(
    v.object({
      _id: v.id('joinRequests'),
      boardId: v.id('boards'),
      userId: v.id('users'),
      userName: v.string(),
      createdAt: v.number(),
      status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('rejected')),
    }),
  ),
  handler: async (ctx, { boardId }) => {
    await admin(ctx, boardId);
    const requests = await ctx.db
      .query('joinRequests')
      .withIndex('by_boardId_and_status', (q) => q.eq('boardId', boardId).eq('status', 'pending'))
      .collect();

    return Promise.all(
      requests.map(async (r) => {
        const u = await person(ctx, r.userId);
        return {
          _id: r._id,
          boardId: r.boardId,
          userId: r.userId,
          userName: u.name,
          createdAt: r.createdAt,
          status: r.status,
        };
      }),
    );
  },
});
export const acceptRequest = authedMutation({
  args: { requestId: v.id('joinRequests') },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new ConvexError('Join request not found.');
    await admin(ctx, request.boardId);

    if (request.status === 'accepted') return null;

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_boardId', (q) => q.eq('boardId', request.boardId))
      .take(MAX_MEMBERS);
    if (memberships.length >= MAX_MEMBERS) {
      throw new ConvexError('This board has reached its 20-member limit.');
    }

    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_boardId_and_userId', (q) =>
        q.eq('boardId', request.boardId).eq('userId', request.userId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert('memberships', {
        boardId: request.boardId,
        userId: request.userId,
        role: 'member',
      });
    }

    await ctx.db.patch(requestId, {
      status: 'accepted',
      reviewedAt: Date.now(),
      reviewedBy: ctx.userId,
    });

    return null;
  },
});
export const rejectRequest = authedMutation({
  args: { requestId: v.id('joinRequests') },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new ConvexError('Join request not found.');
    await admin(ctx, request.boardId);

    await ctx.db.patch(requestId, {
      status: 'rejected',
      reviewedAt: Date.now(),
      reviewedBy: ctx.userId,
    });

    return null;
  },
});
export const myOutgoingRequests = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('joinRequests'),
      boardId: v.id('boards'),
      boardName: v.string(),
      status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('rejected')),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const requests = await ctx.db
      .query('joinRequests')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', ctx.userId).eq('status', 'pending'))
      .collect();

    const results = [];
    for (const r of requests) {
      const b = await ctx.db.get(r.boardId);
      if (b && !b.deleting) {
        results.push({
          _id: r._id,
          boardId: r.boardId,
          boardName: b.name,
          status: r.status,
          createdAt: r.createdAt,
        });
      }
    }
    return results;
  },
});
export const remove = authedMutation({
  args: { boardId: v.id('boards') },
  returns: v.null(),
  handler: async (ctx, { boardId }) => {
    await admin(ctx, boardId);
    await ctx.db.patch(boardId, { deleting: true });
    await ctx.scheduler.runAfter(0, internal.cleanup.board, { boardId });
    return null;
  },
});
