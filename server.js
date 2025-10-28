import express from "express";
import mysql from "mysql2/promise";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas } from "canvas";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Get current directory for path operations
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ✅ Helper to generate summary image
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
  ctx.fillText(
    `Last Refresh: ${new Date(lastRefreshedAt).toLocaleString()}`,
    20,
    80
  );

  ctx.fillText("Top 5 by Estimated GDP:", 20, 120);
  top5.forEach((c, i) => {
    ctx.fillText(
      `${i + 1}. ${c.name} - ${c.estimated_gdp?.toFixed(2)}`,
      40,
      150 + i * 30
    );
  });

  const outPath = path.join(__dirname, "cache", "summary.png");
  fs.mkdirSync(path.join(__dirname, "cache"), { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log("🖼 Summary image generated:", outPath);
}

// ✅ POST /countries/refresh
app.post("/countries/refresh", async (req, res) => {
  try {
    console.log("🌍 Fetching countries and exchange rates...");

    const [countriesRes, ratesRes] = await Promise.all([
      axios.get(
        "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies"
      ),
      axios.get("https://open.er-api.com/v6/latest/USD"),
    ]);

    const countriesData = countriesRes.data;
    const rates = ratesRes.data.rates;

    const countries = [];

    for (const c of countriesData) {
      const name = c.name || "Unknown";
      const capital = c.capital || null;
      const region = c.region || null;
      const population = c.population || 0;
      const flag_url = c.flag || null;

      let currency_code = null;
      let exchange_rate = null;
      let estimated_gdp = null;

      if (c.currencies && c.currencies.length > 0) {
        currency_code = c.currencies[0].code || null;
        exchange_rate = rates[currency_code] || null;
        if (exchange_rate && exchange_rate > 0) {
          const multiplier = Math.floor(Math.random() * 1000) + 1000;
          estimated_gdp = (population * multiplier) / exchange_rate;
        } else {
          estimated_gdp = 0;
        }
      } else {
        estimated_gdp = 0;
      }

      countries.push({
        name,
        capital,
        region,
        population,
        currency_code,
        exchange_rate,
        estimated_gdp,
        flag_url,
      });
    }

    const conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const c of countries) {
      try {
        await conn.execute(
          `INSERT INTO countries 
           (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             capital = VALUES(capital),
             region = VALUES(region),
             population = VALUES(population),
             currency_code = VALUES(currency_code),
             exchange_rate = VALUES(exchange_rate),
             estimated_gdp = VALUES(estimated_gdp),
             flag_url = VALUES(flag_url),
             last_refreshed_at = NOW()`,
          [
            c.name,
            c.capital,
            c.region,
            c.population,
            c.currency_code,
            c.exchange_rate,
            c.estimated_gdp,
            c.flag_url,
          ]
        );
      } catch (err) {
        console.error(`❌ Failed to insert ${c.name}:`, err.message);
      }
    }

    await conn.commit();
    conn.release();

    await generateSummaryImage(countries, new Date().toISOString());

    res.json({
      message: "✅ Countries refreshed successfully!",
      total: countries.length,
      lastRefreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Refresh error:", err.message);
    res.status(503).json({
      error: "External data source unavailable",
      details: err.message,
    });
  }
});

// ✅ GET /countries (with filters & sorting)
app.get("/countries", async (req, res) => {
  try {
    const { region, currency, sort } = req.query;

    let query = "SELECT * FROM countries WHERE 1=1";
    const params = [];

    if (region) {
      query += " AND region = ?";
      params.push(region);
    }
    if (currency) {
      query += " AND currency_code = ?";
      params.push(currency);
    }

    if (sort === "gdp_desc") {
      query += " ORDER BY estimated_gdp DESC";
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching countries:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /countries/:name
app.get("/countries/:name", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM countries WHERE name = ?",
      [req.params.name]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Country not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ DELETE /countries/:name
app.delete("/countries/:name", async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM countries WHERE name = ?",
      [req.params.name]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Country not found" });
    res.json({ message: "Country deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting country:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /status
app.get("/status", async (req, res) => {
  try {
    const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM countries");
    const [timeRows] = await pool.query(
      "SELECT MAX(last_refreshed_at) AS last_refreshed_at FROM countries"
    );
    res.json({
      total_countries: countRows[0].total,
      last_refreshed_at: timeRows[0].last_refreshed_at,
    });
  } catch (err) {
    console.error("❌ Error getting status:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /countries/image
app.get("/countries/image", async (req, res) => {
  const imagePath = path.join(__dirname, "cache", "summary.png");

  try {
    if (fs.existsSync(imagePath)) {
      res.setHeader("Content-Type", "image/png");
      return res.sendFile(imagePath);
    }
    return res.status(404).json({ error: "Summary image not found" });
  } catch (err) {
    console.error("❌ Error serving image:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Country not found" });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
