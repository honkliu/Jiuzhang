import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devServerPort = 80
const apiProxyTarget = 'http://localhost:5001'

// https://vitejs.dev/config/
export default defineConfig(() => {
  const proxyTarget = apiProxyTarget.trim()
  const isValidProxyTarget = /^https?:\/\//i.test(proxyTarget)

  if (proxyTarget && !isValidProxyTarget) {
    console.warn(
      `Vite proxy disabled: invalid target "${proxyTarget}" (expected http(s) URL).`
    )
  }

  const proxy: Record<string, string | ProxyOptions> | undefined = isValidProxyTarget
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
        '/standing': {
          target: proxyTarget,
          changeOrigin: true,
        },
      }
    : undefined

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
      port: devServerPort,
      host: '0.0.0.0',
      allowedHosts: true as const,
      proxy,
    },
    build: {
      outDir: 'build',
      sourcemap: true,
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
  }
})
