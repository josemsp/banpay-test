import { vi } from "vitest";

export const USER_ID = "11111111-1111-1111-1111-111111111111";

// Shared chainable PostgREST builder. Every `.from()` call returns it, so a
// test configures the terminal method (`single`, `maybeSingle`, `range`) once.
const builder = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
};

export const query = builder;

export const db = {
  auth: {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    admin: {
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
  from: vi.fn(),
};

const chainable = ["select", "insert", "update", "eq", "is", "order"] as const;

function wireChain() {
  for (const method of chainable) {
    builder[method].mockReturnValue(builder);
  }
  db.from.mockReturnValue(builder);
}

wireChain();

export function resetDb() {
  vi.resetAllMocks();
  wireChain();

  builder.maybeSingle.mockResolvedValue({ data: null, error: null });
  builder.single.mockResolvedValue({ data: null, error: null });
  builder.range.mockResolvedValue({ data: [], error: null, count: 0 });

  db.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "getUser not mocked" },
  });
  db.auth.signInWithPassword.mockResolvedValue({
    data: { user: null, session: null },
    error: { message: "signInWithPassword not mocked" },
  });
  db.auth.admin.createUser.mockResolvedValue({
    data: { user: null },
    error: { message: "createUser not mocked" },
  });
  db.auth.admin.deleteUser.mockResolvedValue({ data: {}, error: null });
}

// Makes requireAuth pass with the given role.
export function mockSignedInUser(
  role = "admin",
  options: { deletedAt?: string | null } = {},
) {
  db.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID, email: "admin@test.dev" } },
    error: null,
  });

  builder.maybeSingle.mockResolvedValue({
    data: {
      id: USER_ID,
      role,
      deleted_at: options.deletedAt ?? null,
    },
    error: null,
  });
}
