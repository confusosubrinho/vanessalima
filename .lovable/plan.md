

## Diagnosis: RLS Policy on `orders` Table Blocking Inserts

The current INSERT policy on `orders` has a logic gap. It checks:
- Branch 1: `auth.uid() IS NOT NULL AND user_id = auth.uid()` (logged-in user)
- Branch 2: `auth.uid() IS NULL AND user_id IS NULL AND access_token IS NOT NULL` (guest)

**The gap**: If the browser has a stale/partial Supabase auth session (e.g. expired token still in localStorage), `auth.uid()` may evaluate as NOT NULL but `user_id` is set to NULL in the code (because `getSession()` returns null). This fails both branches.

## Plan

### 1. Replace the INSERT RLS policy with a simpler, robust version

Drop the current policy and create a new one that covers all cases:

```sql
DROP POLICY "Anyone can create orders" ON public.orders;

CREATE POLICY "Anyone can create orders" ON public.orders
FOR INSERT WITH CHECK (
  -- Logged-in: user_id must match auth
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR
  -- Guest: no user_id, must have access_token
  (user_id IS NULL AND access_token IS NOT NULL)
);
```

Key change: Remove the `auth.uid() IS NULL` check from the guest branch. A guest order just needs `user_id IS NULL AND access_token IS NOT NULL` — we don't need to verify the JWT state.

### 2. Also fix the UPDATE policy for guests

The current guest update policy also checks `auth.uid() IS NULL`, which has the same vulnerability:

```sql
DROP POLICY "Guest users can update own orders" ON public.orders;

CREATE POLICY "Guest users can update own orders" ON public.orders
FOR UPDATE USING (
  user_id IS NULL AND access_token IS NOT NULL
) WITH CHECK (
  user_id IS NULL AND access_token IS NOT NULL
);
```

### 3. Add a logged-in user UPDATE policy

Currently only admins and guests can update orders. Logged-in users should also be able to update their own orders (e.g. during payment processing):

```sql
CREATE POLICY "Users can update own orders" ON public.orders
FOR UPDATE USING (
  user_id IS NOT NULL AND user_id = auth.uid()
) WITH CHECK (
  user_id IS NOT NULL AND user_id = auth.uid()
);
```

### 4. Verify end-to-end via browser test

After applying the migration, navigate through the full checkout flow (product → cart → checkout → payment) to confirm orders are created successfully without RLS errors.

---

**Technical note**: These are database migration changes only — no frontend code changes needed. The root cause is purely the overly strict RLS conditions.

