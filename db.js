import mysql from 'mysql2/promise';

// NOTE: Please ensure your Railway environment variables include:
// MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_PORT

let db;

/**
 * Initializes and returns the database connection pool.
 * If the connection pool has not been created, it initializes it 
 * using environment variables provided by the hosting service (Railway/Heroku).
 * * @returns {mysql.ConnectionPool} The MySQL connection pool instance.
 */
function initializeDb() {
    if (!db) {
        // Use environment variables provided by Railway
        const config = {
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        };

        // Basic check to ensure environment variables are present before connecting
        if (!config.host || !config.user || !config.database) {
            console.error("FATAL: Missing essential database environment variables.");
            // Log the config but hide the password
            console.log("DB Config Attempted:", { ...config, password: '***' });
            throw new Error("Database connection failed due to missing configuration.");
        }

        try {
            // Create the connection pool
            db = mysql.createPool(config);
            console.log("Database pool initialized.");
            
            // Immediately run setup to create the 'countries' table if it doesn't exist
            setupDatabase(db);

        } catch (error) {
            console.error("Failed to connect to MySQL database:", error.message);
            throw error;
        }
    }
    return db;
}

/**
 * Ensures the 'countries' table exists in the database.
 * @param {mysql.ConnectionPool} pool - The active database connection pool.
 */
async function setupDatabase(pool) {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS countries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            capital VARCHAR(255),
            currency CHAR(3),
            gdp BIGINT,
            population BIGINT,
            exchange_rate DOUBLE,
            refresh_time DATETIME
        );
    `;
    try {
        await pool.execute(createTableQuery);
        console.log("Database setup complete: 'countries' table ensured.");
    } catch (error) {
        console.error("Error setting up database table:", error.message);
        // Do not throw error here, as server should still start
    }
}

// Export the function required by server.js
export function getDb() {
    return initializeDb();
}
