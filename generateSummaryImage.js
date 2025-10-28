import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import db from "./db.js";

export async function generateSummaryImage(countries) {
  try {
    // Canvas size
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = "#333333";
    ctx.font = "bold 28px Arial";
    ctx.fillText("Countries Summary", 20, 40);

    // Total countries
    ctx.font = "bold 20px Arial";
    ctx.fillText(`Total Countries: ${countries.length}`, 20, 80);

    // Top 5 by GDP
    const [topCountries] = await db.execute(
      "SELECT name, estimated_gdp FROM countries ORDER BY estimated_gdp DESC LIMIT 5"
    );

    ctx.fillText("Top 5 Countries by Estimated GDP:", 20, 120);
    ctx.font = "18px Arial";
    topCountries.forEach((c, i) => {
      ctx.fillText(`${i + 1}. ${c.name} - ${c.estimated_gdp?.toFixed(2) || 0}`, 40, 150 + i * 30);
    });

    // Last refreshed
    const lastRefreshed = new Date().toISOString();
    ctx.font = "16px Arial";
    ctx.fillText(`Last Refresh: ${lastRefreshed}`, 20, 350);

    // Create cache folder if not exists
    const cacheDir = path.join(process.cwd(), "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    // Save PNG
    const imagePath = path.join(cacheDir, "summary.png");
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(imagePath, buffer);

    console.log("✅ Summary image generated at cache/summary.png");
  } catch (err) {
    console.error("❌ Failed to generate summary image:", err.message);
  }
}