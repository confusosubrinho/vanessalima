

# Smart Version Update on Navigation

## Idea
Instead of forcing a disruptive `window.location.reload()` while the user is browsing, the VersionChecker will silently flag that a new version is available, and the actual reload will happen naturally when the user clicks a link to navigate to another page.

## How It Works

1. **VersionChecker detects stale version** → sets a flag in `sessionStorage` (e.g. `pending_version_update = true`) instead of calling `window.location.reload()`.

2. **Intercept navigation** → In the `StoreLayout` or a wrapper component, listen to `react-router-dom` navigation events via `useLocation`. When the path changes and `pending_version_update` is set, call `window.location.href = newPath` (full page load) instead of a client-side transition. This loads the fresh assets.

3. **Cache cleanup stays** — before setting the flag, still clear `caches` and old localStorage keys so the reload fetches fresh bundles.

## Files Modified

- **`src/components/store/VersionChecker.tsx`** — Replace `window.location.reload()` with setting `sessionStorage.setItem('pending_version_update', 'true')` + cache cleanup.

- **`src/components/store/StoreLayout.tsx`** (or new small component) — Add a `useEffect` watching `location.pathname`. On change, check `sessionStorage.getItem('pending_version_update')`. If set, remove it and do `window.location.replace(window.location.href)` to force a full reload on the new page.

## Technical Detail

```typescript
// VersionChecker — instead of reload:
sessionStorage.setItem('pending_version_update', serverVersion);
// cache cleanup happens here too

// StoreLayout or NavigationReloader:
const location = useLocation();
const prevPath = useRef(location.pathname);
useEffect(() => {
  if (prevPath.current !== location.pathname) {
    prevPath.current = location.pathname;
    if (sessionStorage.getItem('pending_version_update')) {
      sessionStorage.removeItem('pending_version_update');
      window.location.replace(window.location.href);
    }
  }
}, [location.pathname]);
```

This gives a seamless experience — the user never sees an unexpected reload on the current page, and the update happens transparently during their next navigation.

