

# Protect Admin Panel Against Double Clicks

## Problem
Many buttons across the admin panel lack `disabled={mutation.isPending}` protection, allowing double-clicks to fire duplicate mutations (deletes, status updates, saves).

## Scope of Changes

### Category 1: AlertDialogAction delete buttons missing `disabled`
These fire `deleteMutation.mutate()` on click but never disable during pending state:

| File | Line | Context |
|------|------|---------|
| `src/pages/admin/Banners.tsx` | 366 | Delete banner |
| `src/pages/admin/Categories.tsx` | 288 | Delete category |
| `src/pages/admin/Coupons.tsx` | 410 | Delete coupon |
| `src/pages/admin/HighlightBanners.tsx` | 180 | Delete highlight banner |
| `src/pages/admin/Team.tsx` | 176, 261 | Remove team member (2 places) |
| `src/pages/admin/HelpEditor.tsx` | 164 | Remove help article |
| `src/pages/admin/Personalization.tsx` | 285, 536 | Delete banner/video (2 places) |

**Fix**: Add `disabled={deleteMutation.isPending}` to each `AlertDialogAction` and also to the `AlertDialogCancel` sibling.

### Category 2: Direct delete buttons without `disabled`
Buttons that call `deleteMutation.mutate()` directly (no confirmation dialog):

| File | Line | Context |
|------|------|---------|
| `src/components/admin/ErrorLogsPanel.tsx` | 207-214 | Delete error log |
| `src/components/admin/HomeSectionsManager.tsx` | 245 | Delete section |
| `src/components/admin/FeaturesBarManager.tsx` | 199 | Delete feature bar item |
| `src/components/admin/TestimonialsManager.tsx` | 437 | Delete testimonial |

**Fix**: Add `disabled={deleteMutation.isPending}` to each button.

### Category 3: Action buttons without `disabled` in Reviews
| File | Line | Context |
|------|------|---------|
| `src/pages/admin/Reviews.tsx` | 129, 134 | Publish/Reject review buttons |

**Fix**: Add `disabled={updateStatus.isPending}`.

## Implementation Approach
Simple, surgical edits: add `disabled={mutation.isPending}` to each identified button. No new hooks or utilities needed — the mutations already exist and expose `isPending`.

Total: ~15 button fixes across 11 files.

