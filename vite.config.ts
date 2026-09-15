import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5310, strictPort: true },
  build: { target: 'chrome120', emptyOutDir: true },
})
