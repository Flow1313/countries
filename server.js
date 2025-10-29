import express from "express";
import mysql from "mysql2/promise";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas } from "canvas";

const app = express();
app.use(express.json());

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------
// Database
// -----------------
const db = await mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "countries_cache",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// -----------------
// Helpers
// -----------------
async function generateSummaryImage(countries, lastRefreshedAt) {
  const total = countries.length;
  const top5 = [...countries]
    .sort((a, b) => (b.estimated_gdp || 0) - (a.estimated_gdp || 0))
    .slice(0, 5);

  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 600, 400);
  ctx.fillStyle = "#000";
  ctx.font = "20px Arial";
  ctx.fillText(`Total Countries: ${total}`, 20, 50);
  ctx.fillText(`Last Refresh: ${new Date(lastRefreshedAt).toLocaleString()}`, 20, 80);

  ctx.fillText("Top 5 by Estimated GDP:", 20, 120);
  top5.forEach((c, i) => {
    ctx.fillText(`${i + 1}. ${c.name} - ${c.estimated_gdp?.toFixed(2)}`, 40, 150 + i * 30);
  });

  const outPath = path.join(__dirname, "cache", "summary.png");
  fs.mkdirSync("cache", { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log("🖼 Summary image generated:", outPath);
}

// -----------------
// Routes
// -----------------

// POST /countries/refresh
app.post("/countries/refresh", async (req, res) => {
  try {
    console.log("🔄 Fetching countries and exchange rates...");

    const countriesResp = await fetch(
      "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies"
    );
    if (!countriesResp.ok) throw new Error("Countries API failed");
    const countriesData = await countriesResp.json();

    const ratesResp = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!ratesResp.ok) throw new Error("Exchange rates API failed");
    const ratesData = await ratesResp.json();
    const rates = ratesData.rates;

    let inserted = 0;
    for (const country of countriesData) {
      const currencyCode = country.currencies?.[0]?.code || null;
      let exchangeRate = currencyCode ? rates[currencyCode] || null : null;
      const multiplier = Math.random() * 1000 + 1000; // random 1000-2000
      const estimated_gdp =
        country.population && exchangeRate ? (country.population * multiplier) / exchangeRate : 0;

      try {
        await db.execute(
          `INSERT INTO countries 
          (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
           capital=VALUES(capital),
           region=VALUES(region),
           population=VALUES(population),
           currency_code=VALUES(currency_code),
           exchange_rate=VALUES(exchange_rate),
           estimated_gdp=VALUES(estimated_gdp),
           flag_url=VALUES(flag_url),
           last_refreshed_at=NOW()`,
          [
            country.name,
            country.capital || null,
            country.region || null,
            country.population || 0,
            currencyCode,
            exchangeRate,
            estimated_gdp,
            country.flag || null,
          ]
        );
        inserted++;
      } catch (err) {
        console.error(`❌ Failed to insert ${country.name}:`, err.message);
      }
    }

    await generateSummaryImage(countriesData, new Date().toISOString());

    return res.json({
      message: "✅ Countries refreshed successfully!",
      total: inserted,
      lastRefreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Refresh failed:", err.message);
    return res
      .status(503)
      .json({ error: "External data source unavailable", details: err.message });
  }
});

// GET /countries
app.get("/countries", async (req, res) => {
  try {
    let sql = "SELECT * FROM countries";
    const params = [];

    const filters = [];
    if (req.query.region) {
      filters.push("region = ?");
      params.push(req.query.region);
    }
    if (req.query.currency) {
      filters.push("currency_code = ?");
      params.push(req.query.currency);
    }
    if (filters.length) sql += " WHERE " + filters.join(" AND ");

    if (req.query.sort === "gdp_desc") sql += " ORDER BY estimated_gdp DESC";

    const [rows] = await db.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /countries/:name
app.get("/countries/:name", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM countries WHERE name = ?", [req.params.name]);
    if (!rows.length) return res.status(404).json({ error: "Country not found" });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /countries/:name
app.delete("/countries/:name", async (req, res) => {
  try {
    const [result] = await db.execute("DELETE FROM countries WHERE name = ?", [req.params.name]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Country not found" });
    return res.json({ message: "Country deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /status
app.get("/status", async (req, res) => {
  try {
    const [[{ total_countries }]] = await db.execute("SELECT COUNT(*) AS total_countries FROM countries");
    const [[{ last_refreshed_at }]] = await db.execute("SELECT MAX(last_refreshed_at) AS last_refreshed_at FROM countries");
    return res.json({ total_countries, last_refreshed_at });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /countries/image
app.get("/countries/image", (req, res) => {
  const imagePath = path.join(__dirname, "cache", "summary.png");
  try {
    if (fs.existsSync(imagePath)) {
      res.setHeader("Content-Type", "image/png");
      return res.sendFile(imagePath);
    } else {
      return res.status(404).json({ error: "Summary image not found" });
    }
  } catch (err) {
    console.error("❌ Error serving image:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// -----------------
// Start server
// -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
