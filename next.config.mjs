/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon — never bundle it, let Node require() it
  // directly. Route handlers under src/app/api/** touching it must also
  // declare `export const runtime = 'nodejs'` (edge can't load native addons).
  serverExternalPackages: ['better-sqlite3'],
  // Next's dev-mode indicator badge defaults to bottom-left, the exact
  // corner ProjectRail's own "+" add-project button occupies — the
  // indicator's invisible hit area sits on top and swallows clicks meant
  // for that button. Move it out of the way rather than fighting z-index.
  devIndicators: {
    position: 'bottom-right',
  },
};

export default nextConfig;
