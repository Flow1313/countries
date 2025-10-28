import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🧩 MySQL Connection
const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "countries_cache",
});

// 🧱 Ensure Table Exists
await db.execute(`
  CREATE TABLE IF NOT EXISTS countries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE,
    capital VARCHAR(255),
    region VARCHAR(100),
    population BIGINT,
    flag_url VARCHAR(500),
    currency_code VARCHAR(10),
    exchange_rate FLOAT,
    estimated_gdp FLOAT,
    last_refreshed_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);

// 🧭 ROUTE: Refresh Countries Cache
app.post("/countries/refresh", async (req, res) => {
  try {
    console.log("🔄 Fetching countries and exchange rates...");

    const [countriesRes, ratesRes] = await Promise.all([
      fetch("https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies"),
      fetch("https://open.er-api.com/v6/latest/USD"),
    ]);

    if (!countriesRes.ok)
      return res.status(503).json({
        error: "External data source unavailable",
        details: "Countries API failed with status " + countriesRes.status,
      });
    if (!ratesRes.ok)
      return res.status(503).json({
        error: "External data source unavailable",
        details: "Exchange Rates API failed with status " + ratesRes.status,
      });

    const countriesData = await countriesRes.json();
    const ratesData = await ratesRes.json();
    const rates = ratesData.rates || {};

    const countries = countriesData.map((c) => {
      const currencyCode = c.currencies && c.currencies.length > 0 ? c.currencies[0].code : null;
      const exchangeRate = currencyCode && rates[currencyCode] ? rates[currencyCode] : null;
      const randomMultiplier = Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
      const estimatedGDP = exchangeRate
        ? (c.population * randomMultiplier) / exchangeRate
        : 0;

      return {
        name: c.name,
        capital: c.capital || null,
        region: c.region || null,
        population: c.population || 0,
        flag_url: c.flag || null,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        estimated_gdp: estimatedGDP,
      };
    });

    let inserted = 0;
    for (const country of countries) {
      try {
        await db.execute(
          `INSERT INTO countries (name, capital, region, population, flag_url, currency_code, exchange_rate, estimated_gdp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             capital=VALUES(capital),
             region=VALUES(region),
             population=VALUES(population),
             flag_url=VALUES(flag_url),
             currency_code=VALUES(currency_code),
             exchange_rate=VALUES(exchange_rate),
             estimated_gdp=VALUES(estimated_gdp),
             last_refreshed_at=CURRENT_TIMESTAMP`,
          [
            country.name,
            country.capital,
            country.region,
            country.population,
            country.flag_url,
            country.currency_code,
            country.exchange_rate,
            country.estimated_gdp,
          ]
        );
        inserted++;
      } catch (err) {
        console.error(`❌ Failed to insert ${country.name}:`, err.message);
      }
    }

    console.log(`✅ Inserted/updated ${inserted} countries`);

    // 🖼 Generate summary image
    await generateSummaryImage(countries, new Date().toISOString());

    res.json({
      message: "✅ Countries refreshed successfully!",
      total: countries.length,
      lastRefreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Refresh failed:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// 🧭 ROUTE: Get All Countries (with filters & sorting)
app.get("/countries", async (req, res) => {
  try {
    let query = "SELECT * FROM countries WHERE 1=1";
    const params = [];

    if (req.query.region) {
      query += " AND region = ?";
      params.push(req.query.region);
    }
    if (req.query.currency) {
      query += " AND currency_code = ?";
      params.push(req.query.currency);
    }

    if (req.query.sort === "gdp_desc") query += " ORDER BY estimated_gdp DESC";
    else if (req.query.sort === "gdp_asc") query += " ORDER BY estimated_gdp ASC";

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// 🧭 ROUTE: Get Single Country
app.get("/countries/:name", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM countries WHERE LOWER(name)=LOWER(?)", [
      req.params.name,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Country not found" });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// 🧭 ROUTE: Delete Country
app.delete("/countries/:name", async (req, res) => {
  try {
    const [result] = await db.execute("DELETE FROM countries WHERE LOWER(name)=LOWER(?)", [
      req.params.name,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Country not found" });
    res.json({ message: `✅ ${req.params.name} deleted successfully` });
  } catch (error) {
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// 🧭 ROUTE: Status
app.get("/status", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT COUNT(*) AS total FROM countries");
    const [last] = await db.execute(
      "SELECT MAX(last_refreshed_at) AS lastRefreshedAt FROM countries"
    );
    res.json({
      total_countries: rows[0].total,
      last_refreshed_at: last[0].lastRefreshedAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// 🖼 ROUTE: Serve Summary Image
app.get("/countries/image", (req, res) => {
  const imagePath = path.join("cache", "summary.png");
  if (fs.existsSync(imagePath)) {
    res.sendFile(path.resolve(imagePath));
  } else {
    res.status(404).json({ error: "Summary image not found" });
  }
});

// 🧩 Image Generator
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

  const outPath = path.join("cache", "summary.png");
  fs.mkdirSync("cache", { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log("🖼 Summary image generated:", outPath);
}

// 🖥 Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));