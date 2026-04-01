import "dotenv/config"
import express from "express"
import path from "path"
import { fileURLToPath } from "url"
import { ghostRoutes } from "./routes/ghost-routes.js"
import { previewRoutes } from "./routes/preview-routes.js"
import { syncRoutes } from "./routes/sync-routes.js"
import { wpRoutes } from "./routes/wp-routes.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = parseInt(process.env.PORT ?? "3000", 10)

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

app.use("/api/ghost", ghostRoutes)
app.use("/api/preview", previewRoutes)
app.use("/api/sync", syncRoutes)
app.use("/api/wp", wpRoutes)

app.listen(PORT, () => {
  console.log(`\n  Ghost → WP Admin`)
  console.log(`  http://localhost:${PORT}\n`)
})
