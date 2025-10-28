import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "", // put your real MySQL password here if you use one
  database: "countries_cache",
};

async function testConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log("✅ Connected to MySQL successfully!");

    // Run a test query
    const [rows] = await connection.execute("SELECT COUNT(*) AS total FROM countries");
    console.log("✅ Query executed successfully!");
    console.log("Total countries in table:", rows[0].total);

    await connection.end();
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
  }
}

testConnection();