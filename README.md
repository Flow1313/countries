# 🌍 Countries Service API

A RESTful backend service that fetches countries and currency exchange data from external APIs, caches it in MySQL, and provides CRUD operations with analytics.

---

## 🚀 Features

✅ Fetches country data from [REST Countries API](https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies)  
✅ Fetches live exchange rates from [Open Exchange Rate API](https://open.er-api.com/v6/latest/USD)  
✅ Matches countries with exchange rates  
✅ Computes `estimated_gdp` = `population × random(1000–2000) ÷ exchange_rate`  
✅ Caches all data in MySQL  
✅ Supports filtering, sorting, and detailed querying  
✅ Generates a visual summary image (`cache/summary.png`) on refresh  
✅ Provides consistent JSON error handling  

---

## ⚙️ Tech Stack

- **Backend:** Node.js + Express  
- **Database:** MySQL  
- **Libraries:** `mysql2`, `dotenv`, `express`, `canvas`, `node-fetch`, `cors`, `fs`, `path`  
- **Runtime:** Railway (or any Node hosting platform)  

---

## 🧩 API Endpoints

### 🔁 POST `/countries/refresh`
Fetches all countries and exchange rates, then updates the MySQL cache.

**Response:**
```json
{
  "message": "✅ Countries refreshed successfully!",
  "total": 250,
  "lastRefreshedAt": "2025-10-28T18:42:18.000Z"
}
🌍 GET /countries
Get all cached countries with optional filters and sorting.

Supported queries:

?region=Africa

?currency=NGN

?sort=gdp_desc

Sample response:

json
Copy code
[
  {
    "id": 1,
    "name": "Nigeria",
    "capital": "Abuja",
    "region": "Africa",
    "population": 206139589,
    "currency_code": "NGN",
    "exchange_rate": 1600.23,
    "estimated_gdp": 25767448125.2,
    "flag_url": "https://flagcdn.com/ng.svg",
    "last_refreshed_at": "2025-10-22T18:00:00Z"
  }
]
📍 GET /countries/:name
Fetch details for a specific country by name.

❌ DELETE /countries/:name
Delete a country record from cache.

📊 GET /status
Shows the total number of countries and the last refresh timestamp.

🖼 GET /countries/image
Serves the generated summary image containing:

Total countries

Top 5 by estimated GDP

Last refresh time

If image is missing:

json
Copy code
{ "error": "Summary image not found" }
🧠 Validation & Error Handling
Status	Description	Example
400	Validation failed	{ "error": "Validation failed", "details": { "currency_code": "is required" }}
404	Country not found	{ "error": "Country not found" }
500	Server error	{ "error": "Internal server error" }
503	External API failed	{ "error": "External data source unavailable" }

💾 Database Schema
Database: countries_cache

sql
Copy code
CREATE TABLE countries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  capital VARCHAR(100),
  region VARCHAR(100),
  population BIGINT NOT NULL,
  currency_code VARCHAR(10),
  exchange_rate DECIMAL(15,6),
  estimated_gdp DECIMAL(20,2),
  flag_url VARCHAR(255),
  last_refreshed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
⚙️ Example .env
env
Copy code
PORT=3000

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=countries_cache
⚠️ Make sure to create the database first before running the server.

🧪 Run Locally
1️⃣ Clone the repository
bash
Copy code
git clone https://github.com/Flow1313/countries-service.git
cd countries-service
2️⃣ Install dependencies
bash
Copy code
npm install
3️⃣ Set up .env
Create a .env file using the example above.

4️⃣ Run the server
bash
Copy code
node server.js
Server will run at:
👉 http://localhost:3000

☁️ Deployment (Railway)
Push your project to GitHub:

bash
Copy code
git add .
git commit -m "Initial commit"
git push origin main
Go to https://railway.app

Click New Project → Deploy from GitHub Repo

Add your environment variables in Railway’s Environment tab:

PORT=3000

DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

Click Deploy

After deployment, verify your live API:

bash
Copy code
curl https://your-app-name.up.railway.app/status
👤 Author
Name: Bello Ibrahim
GitHub: Flow1313
Email: your.email@example.com
Stack: Node.js + Express + MySQL

🧾 License
MIT License © 2025 Bello Ibrahim