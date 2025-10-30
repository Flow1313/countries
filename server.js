import express from "express";
import mysql from "mysql2/promise";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
<<<<<<< HEAD
import { createCanvas } from "canvas";
=======
//import { createCanvas } from "canvas";
>>>>>>> c8f9d459fc540cb23c64116e387a6b7d312fd26a

const app = express();
app.use(express.json());

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------
// Database Setup
// -----------------
const db = await mysql.createPool({
    // IMPORTANT: Make sure these environment variables are set in your .env file
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
<<<<<<< HEAD
async function generateSummaryImage(countries, lastRefreshedAt) {
    const total = countries.length;
=======
>>>>>>> c8f9d459fc540cb23c64116e387a6b7d312fd26a
    // Sort by estimated_gdp, treating nulls/undefined values as 0 for sorting
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
        // Handle null GDP display
        const gdpText = c.estimated_gdp ? c.estimated_gdp.toFixed(2) : 'N/A';
        ctx.fillText(`${i + 1}. ${c.name} - ${gdpText}`, 40, 150 + i * 30);
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

        // Fetch Countries API
        const countriesResp = await fetch(
            "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies"
        );
        if (!countriesResp.ok) throw new Error("Could not fetch data from Restcountries API");
        const countriesData = await countriesResp.json();

        // Fetch Exchange Rates API
        const ratesResp = await fetch("https://open.er-api.com/v6/latest/USD");
        if (!ratesResp.ok) throw new Error("Could not fetch data from Exchange rates API");
        const ratesData = await ratesResp.json();
        const rates = ratesData.rates;

        const refreshTime = new Date().toISOString();
        let inserted = 0;
        const processedCountries = [];

        for (const country of countriesData) {
            // Currency Handling Logic
            const currencyCode = country.currencies?.[0]?.code || null;
            let exchangeRate = null;
            let estimated_gdp = null; // Set to null by default

            if (currencyCode) {
                exchangeRate = rates[currencyCode] || null;
            }

            // GDP Calculation Logic (FIXED: returns null if exchangeRate is missing/0)
            if (country.population && exchangeRate) {
                const multiplier = Math.random() * 1000 + 1000; // random 1000-2000
                estimated_gdp = (country.population * multiplier) / exchangeRate;
            }

            try {
                // Update vs Insert Logic using ON DUPLICATE KEY UPDATE (relies on UNIQUE INDEX on name)
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
                        refreshTime, // Insert time
                        refreshTime, // Update time
                    ]
                );
                
                // Collect processed data for image generation
                processedCountries.push({ ...country, estimated_gdp }); 
                inserted++;
            } catch (err) {
                console.error(`❌ Failed to insert/update ${country.name}:`, err.message);
            }
        }
        
        // Image Generation
<<<<<<< HEAD
        await generateSummaryImage(processedCountries, refreshTime);
=======
        
>>>>>>> c8f9d459fc540cb23c64116e387a6b7d312fd26a

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

        // Sorting by estimated_gdp descending
        if (req.query.sort === "gdp_desc") sql += " ORDER BY estimated_gdp DESC";

        const [rows] = await db.execute(sql, params);
        return res.json(rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// POST /countries - New endpoint for Validation (400 Bad Request)
app.post("/countries", async (req, res) => {
    const { name, population, currency_code, capital, region, flag_url, exchange_rate } = req.body;

    // 1. Validation Logic
    const validationErrors = {};
    if (!name) validationErrors.name = "is required";
    if (!population || isNaN(Number(population))) validationErrors.population = "is required and must be a number";
    if (!currency_code) validationErrors.currency_code = "is required";

    if (Object.keys(validationErrors).length > 0) {
        return res.status(400).json({
            error: "Validation failed",
            details: validationErrors,
        });
    }

    try {
        // Use provided rate or default to null, and calculate GDP
        const rate = exchange_rate && !isNaN(Number(exchange_rate)) ? Number(exchange_rate) : null;
        let estimated_gdp = null;
        
        if (rate && Number(population)) {
            const multiplier = Math.random() * 1000 + 1000;
            estimated_gdp = (Number(population) * multiplier) / rate;
        }

        // 2. Database Insertion/Update
        const sql = `
            INSERT INTO countries 
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
            last_refreshed_at=NOW()
        `;

        await db.execute(sql, [
            name,
            capital || null,
            region || null,
            Number(population),
            currency_code,
            rate,
            estimated_gdp,
            flag_url || null,
        ]);

        return res.status(201).json({ message: `Country ${name} created/updated successfully.` });
    } catch (err) {
        console.error("❌ Error processing POST /countries:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// GET /countries/:name
app.get("/countries/:name", async (req, res) => {
    try {
        // FIXED: Using LOWER() for case-insensitive match
        const [rows] = await db.execute("SELECT * FROM countries WHERE LOWER(name) = LOWER(?)", [req.params.name]);
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
        // FIXED: Using LOWER() for case-insensitive match
        const [result] = await db.execute("DELETE FROM countries WHERE LOWER(name) = LOWER(?)", [req.params.name]);
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
        // Get the single latest refresh time from all records
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
<<<<<<< HEAD
            return res.status(404).json({ error: "Summary image not found" });
=======
            return res.status(404).json({ error: "Summary image not generated or found" });
>>>>>>> c8f9d459fc540cb23c64116e387a6b7d312fd26a
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
<<<<<<< HEAD
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
=======
<<<<<<< HEAD
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
=======
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
>>>>>>> fb7a125e7e4dac925099bb196b95cde774c82c93
>>>>>>> c8f9d459fc540cb23c64116e387a6b7d312fd26a
