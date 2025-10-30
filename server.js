import express from "express";
import mysql from "mysql2/promise";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Jimp from "jimp";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// -----------------
// Setup for __dirname
// -----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------
// Database Setup
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
// Helper: Generate Summary Image
// -----------------
async function generateSummaryImage(countries, lastRefreshedAt) {
  const total = countries.length;
  const top5 = [...countries]
    .sort((a, b) => (b.estimated_gdp || 0) - (a.estimated_gdp || 0))
    .slice(0, 5);

  const width = 600;
  const height = 400;

  const image = new Jimp(width, height, 0xffffffff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

  let y = 30;
  await image.print(font, 20, y, `Total Countries: ${total}`);
  y += 30;
  await image.print(
    font,
    20,
    y,
    `Last Refresh: ${new Date(lastRefreshedAt).toLocaleString()}`
  );
  y += 40;
  await image.print(font, 20, y, `Top 5 by Estimated GDP:`);
  y += 30;

  for (let i = 0; i < top5.length; i++) {
    const c = top5[i];
    const gdpText = c.estimated_gdp ? c.estimated_gdp.toFixed(2) : "N/A";
    await image.print(font, 40, y, `${i + 1}. ${c.name} - ${gdpText}`);
    y += 25;
  }

  fs.mkdirSync(path.join(__dirname, "cache"), { recursive: true });
  const outPath = path.join(__dirname, "cache", "summary.png");
  await image.writeAsync(outPath);
  console.log("🖼 Summary image generated:", outPath);
}

// -----------------
// ROUTES
// -----------------

// 🔁 Refresh and Store Countries
app.post("/countries/refresh", async (req, res) => {
  try {
    console.log("🔄 Fetching countries and exchange rates...");

    const countriesResp = await fetch(
      "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies"
    );
    if (!countriesResp.ok) throw new Error("Could not fetch Restcountries API");
    const countriesData = await countriesResp.json();

    const ratesResp = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!ratesResp.ok) throw new Error("Could not fetch exchange rates API");
    const ratesData = await ratesResp.json();
    const rates = ratesData.rates;

    const refreshTime = new Date().toISOString();
    let inserted = 0;
    const processedCountries = [];

    for (const country of countriesData) {
      const currencyCode = country.currencies?.[0]?.code || null;
      const exchangeRate = currencyCode ? rates[currencyCode] || null : null;

      let estimated_gdp = null;
      if (country.population && exchangeRate) {
        const multiplier = Math.random() * 1000 + 1000;
        estimated_gdp = (country.population * multiplier) / exchangeRate;
      }

      try {
        await db.execute(
          `INSERT INTO countries 
          (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          capital=VALUES(capital),
          region=VALUES(region),
          population=VALUES(population),
          currency_code=VALUES(currency_code),
          exchange_rate=VALUES(exchange_rate),
          estimated_gdp=VALUES(estimated_gdp),
          flag_url=VALUES(flag_url),
          last_refreshed_at=?`,
          [
            country.name,
            country.capital || null,
            country.region || null,
            country.population || 0,
            currencyCode,
            exchangeRate,
            estimated_gdp,
            country.flag || null,
            refreshTime,
            refreshTime,
          ]
        );

        processedCountries.push({ ...country, estimated_gdp });
        inserted++;
      } catch (err) {
        console.error(`❌ Failed to insert/update ${country.name}:`, err.message);
      }
    }

    await generateSummaryImage(processedCountries, refreshTime);

    return res.json({
      message: "✅ Countries refreshed successfully!",
      total: inserted,
      lastRefreshedAt: refreshTime,
    });
  } catch (err) {
    console.error("❌ Refresh failed:", err.message);
    return res
      .status(503)
      .json({ error: "External data source unavailable", details: err.message });
  }
});

// 🌍 GET all countries (filter/sort)
app.get("/countries", async (req, res) => {
  try {
    const { region, currency, sort } = req.query;
    let query = "SELECT * FROM countries";
    const params = [];

    if (region) {
      query += " WHERE region = ?";
      params.push(region);
    } else if (currency) {
      query += " WHERE currency_code = ?";
      params.push(currency);
    }

    if (sort === "gdp") query += " ORDER BY estimated_gdp DESC";
    else if (sort === "population") query += " ORDER BY population DESC";

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// 🔎 GET single country
app.get("/countries/:name", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM countries WHERE LOWER(name)=LOWER(?)", [
      req.params.name,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Country not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ❌ DELETE a country
app.delete("/countries/:name", async (req, res) => {
  try {
    const [result] = await db.execute("DELETE FROM countries WHERE LOWER(name)=LOWER(?)", [
      req.params.name,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Country not found" });
    res.json({ message: `✅ ${req.params.name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// 📊 Status endpoint
app.get("/status", async (req, res) => {
  try {
    const [[{ total_countries }]] = await db.execute(
      "SELECT COUNT(*) AS total_countries FROM countries"
    );
    const [[{ last_refreshed_at }]] = await db.execute(
      "SELECT MAX(last_refreshed_at) AS last_refreshed_at FROM countries"
    );
    res.json({ total_countries, last_refreshed_at });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🖼 Image endpoint
app.get("/countries/image", (req, res) => {
  const imagePath = path.join(__dirname, "cache", "summary.png");
  if (fs.existsSync(imagePath)) {
    res.setHeader("Content-Type", "image/png");
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: "Summary image not generated or found" });
  }
});

// 🚫 404 handler (keep this last)
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// -----------------
// Start Server
// -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));