import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  define: {
    'process.env.NODE_ENV': '"test"'
  }
})