import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawProxyTarget =
    env.VITE_PROXY_TARGET ||
    env.VITE_API_PROXY_TARGET ||
    env.VITE_API_URL?.replace(/\/api\/?$/, '') ||
    ''
  const proxyTarget = rawProxyTarget.trim()
  const isValidProxyTarget = /^https?:\/\//i.test(proxyTarget)

  if (proxyTarget && !isValidProxyTarget) {
    console.warn(
      `Vite proxy disabled: invalid target "${proxyTarget}" (expected http(s) URL).`
    )
  }

  const proxy = isValidProxyTarget
    ? {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/hub': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/zodiac': {
          target: proxyTarget,
          changeOrigin: true,
        },
      }
    : {}

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@services': path.resolve(__dirname, './src/services'),
        '@store': path.resolve(__dirname, './src/store'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@types': path.resolve(__dirname, './src/types'),
        '@utils': path.resolve(__dirname, './src/utils'),
      },
    },
    server: {
      port: 80,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy,
    },
    build: {
      outDir: 'build',
      sourcemap: true,
    },
  }
})
