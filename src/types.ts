export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
};

export type AppVariables = {
  authUser: {
    id: string;
    role: string;
  };
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: AppVariables;
};
