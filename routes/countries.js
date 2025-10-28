import express from "express";
import axios from "axios";
import db from "../db.js";

const router = express.Router();

// Utility: calculate estimated GDP
function calculateEstimatedGDP(population, exchangeRate) {
  const randomFactor = Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
  return (population * randomFactor) / exchangeRate;
}

// ✅ POST /countries/refresh
router.post("/refresh", async (req, res) => {
  try {
    // 1️⃣ Fetch all countries
    const countriesRes = await axios.get(
      "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies"
    );
    const countries = countriesRes.data;

    // 2️⃣ Fetch exchange rates
    const ratesRes = await axios.get("https://open.er-api.com/v6/latest/USD");
    const rates = ratesRes.data.rates;

    // 3️⃣ Clear existing records
    await db.query("DELETE FROM countries");

    // 4️⃣ Insert all countries
    for (const c of countries) {
      if (!c.name || !c.population || !c.currencies?.[0]?.code) continue;

      const currency = c.currencies[0].code;
      const exchangeRate = rates[currency] || 1;
      const gdp = calculateEstimatedGDP(c.population, exchangeRate);

      await db.query(
        `INSERT INTO countries 
        (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          c.name,
          c.capital || null,
          c.region || null,
          c.population,
          currency,
          exchangeRate,
          gdp,
          c.flag || null,
        ]
      );
    }

    res.json({ message: "✅ Countries refreshed successfully!" });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Failed to refresh countries" });
  }
});

// ✅ GET /countries
router.get("/", async (req, res) => {
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
    if (req.query.sort === "gdp_asc") query += " ORDER BY estimated_gdp ASC";

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch countries" });
  }
});

// ✅ GET /countries/:name
router.get("/:name", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM countries WHERE name = ?", [
      req.params.name,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Country not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch country" });
  }
});

// ✅ DELETE /countries/:name
router.delete("/:name", async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM countries WHERE name = ?", [
      req.params.name,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Country not found" });
    res.json({ message: "✅ Country deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete country" });
  }
});

export default router;