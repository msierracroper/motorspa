import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Oculta la bolita de Next.js en desarrollo (tapaba la barra inferior en el celular).
  // Los errores de compilación y ejecución se siguen mostrando.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
