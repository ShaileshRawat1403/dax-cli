#!/usr/bin/env bun
import { initDb } from "./db/index.js"

initDb()

const { default: app, wsHandler } = await import("./index")

const PORT = parseInt(process.env.PORT || "4096", 10)
const WS_PATH = "/ws"

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)

    if (url.pathname === WS_PATH) {
      const success = server.upgrade(req, { data: undefined })
      if (success) {
        return undefined as unknown as Response
      }
    }

    return app.fetch(req)
  },
  websocket: wsHandler,
})

console.log(`\n🚀 Server running on http://localhost:${PORT}`)
console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}${WS_PATH}`)
console.log(`📡 API endpoint: http://localhost:${PORT}/api`)

process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down gracefully...")
  server.stop()
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("\n\n👋 Shutting down gracefully...")
  server.stop()
  process.exit(0)
})
