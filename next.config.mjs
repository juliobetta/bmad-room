/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon — never bundle it, let Node require() it
  // directly. Route handlers under src/app/api/** touching it must also
  // declare `export const runtime = 'nodejs'` (edge can't load native addons).
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
