# Global Workbench Shell Design

## Goal

Upgrade QXC Serial from a page-by-page tool collection into a more consistent professional workbench shell. The first implementation should improve the global navigation, page context, status visibility, and visual consistency without rewriting the internal workflows of Serial, RTT, Chart, Modbus, Shell, or the utility pages.

## Scope

In scope:

- Replace the repeated hardcoded navigation markup in `src/App.vue` with a typed navigation configuration rendered through `v-for`.
- Keep a compact left navigation rail, but group primary debugging pages separately from utility/settings pages.
- Add a global top bar rendered by `src/App.vue`.
- Show the current route title and short subtitle in the top bar using the existing custom i18n system.
- Show browser capability/status chips for Web Serial, WebUSB, and RTT Bridge availability where the data can be read without adding heavy polling.
- Move low-priority global actions, such as donation and profile/settings entry points, into a quieter area of the shell.
- Unify shell-level spacing, active states, borders, hover states, and dark-mode styling.
- Preserve each route's existing page component and its internal panel layout.

Out of scope for this iteration:

- Rebuilding `SerialView.vue` internals.
- Rebuilding `RttView.vue` internals.
- Adding new serial protocol features.
- Adding new persistence models beyond existing settings/localStorage behavior.
- Introducing a new design system package or UI component library.

## Recommended Layout

Use a "compact rail plus top context bar" shell.

The left rail remains the primary app navigation because it preserves horizontal scan speed and keeps route switching available while working with dense logs. The rail should use a fixed width, icon-first entries, and compact text labels. It should group routes as:

- Debugging: Serial, Modbus, RTT, Shell, Chart.
- Tools: ASCII, converter.
- System: Settings, profile, donation.

The top bar gives every page consistent context. It should contain:

- Current page title.
- One-line page subtitle or capability hint.
- Status chips for supported browser APIs and bridge state when available.
- A small global action cluster for theme/language/settings/profile/donation as appropriate.

The main content area remains a full-height route viewport. Existing views continue to own their page-level side panels, logs, editors, and toolbars.

## UX Rules

- Keep the app work-focused and dense. Avoid large decorative cards, hero layouts, gradient backgrounds, and oversized type inside the shell.
- Use clear icon buttons with accessible labels and `title` attributes.
- Prefer stable dimensions for navigation items and status chips so route changes do not shift the shell.
- Active route state should be visible through color and background, not scale transforms.
- Dark mode should use the existing `dark` class approach and Tailwind utility classes.
- Navigation labels and route metadata should be translatable through the existing `useI18n()` dot-key API.

## Architecture

`src/App.vue` should become responsible for the application shell:

- Define route metadata in a local typed array or a small local constant.
- Render navigation groups from that metadata.
- Compute the current route metadata from `useRoute()`.
- Render the top bar from the current metadata.
- Keep `RouterView` wrapped in the existing `keep-alive`.

If the navigation metadata becomes too large, extract it to a small file such as `src/router/nav.ts`. Do not introduce global state for navigation unless a later feature needs dynamic navigation.

Capability data should be lightweight:

- Web Serial: read `'serial' in navigator`.
- WebUSB: read `'usb' in navigator`.
- RTT Bridge: only use existing `useBridgeStatus()` if it does not create unwanted work on unrelated pages. If that composable starts active polling or WebSocket checks, defer Bridge status from the top bar and keep it inside `RttView`.

## Error Handling

The shell should not block route rendering if a browser API is unavailable. Capability chips are informational only.

If a capability check is not available in the current browser, show an unsupported/inactive chip. Avoid alerts, modals, or navigation redirects from the shell.

## Performance

The shell must avoid adding high-frequency watchers.

Expected performance improvements:

- Navigation markup is generated from data instead of repeated template blocks.
- Active route styling is computed from route path/name.
- Top bar metadata is computed from current route only.
- No new polling should be introduced for global status.

Existing performance-sensitive views, especially `SerialView.vue` and `RttView.vue`, should keep their current virtual list and batching logic untouched in this iteration.

## Testing

Verification should include:

- `npm run build`
- Manual route checks for `/`, `/modbus`, `/rtt`, `/shell`, `/chart`, `/ascii`, `/converter`, `/settings`, and `/profile`.
- Manual dark-mode check.
- Narrow viewport check that the rail, top bar, and page content do not overlap.

## Acceptance Criteria

- The app has a consistent global shell with compact left navigation and a top context bar.
- All existing routes remain reachable.
- The active route is clearly highlighted.
- Existing route components keep their state when switching routes.
- Shell text uses existing i18n keys or newly added keys in `useI18n.ts`.
- The production build passes.
