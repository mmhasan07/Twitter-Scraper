const { Builder, By, until, Key } = require("selenium-webdriver");
require("chromedriver");
const { MongoClient } = require("mongodb");
const { Proxy } = require("selenium-webdriver");
const express = require("express");
const cors = require("cors");

const app = express();
const port = 3000; // Change to another port if needed

const uri = "mongodb://localhost:27017"; // MongoDB URI
const dbName = "span_data";
const collectionName = "spans";

// ProxyMesh rotating proxy endpoint
const proxyEndpoint = "http://us-rotating.proxymesh.com:31280";
const proxyUsername = "Mike";
const proxyPassword = "proxy123";

let activeProxy = "localhost"; // Variable to store the active proxy

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// Serve the index.html file
app.get("/", (req, res) => {
    res.sendFile(`${__dirname}/index.html`);
});

// API endpoint to fetch data
app.get("/api/data", async (req, res) => {
    console.log("API endpoint /api/data hit"); // Log to confirm the request is received

    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Fetch top 5 documents
        const data = await collection.find().limit(5).toArray();

        if (!data || data.length === 0) {
            console.warn("No data found.");
            return res.status(404).json({ error: "No data available." });
        }

        console.log("Data fetched successfully.");
        res.json(data); // Send data as JSON response
    } catch (err) {
        console.error("Error fetching data from MongoDB:", err.message);
        res.status(500).json({ error: "Internal server error." }); // Return a JSON error message
    } finally {
        await client.close();
    }
});

// API endpoint to trigger scraping
app.get("/api/scrape", async (req, res) => {
    console.log("API endpoint /api/scrape hit");

    try {
        await scrapeAndStore(); // Run the scraper function
        console.log("Scraping completed.");

        // Fetch the latest data
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        
        const data = await collection.find().limit(5).toArray();
        console.log("Fetched data:", data);

        if (!data || data.length === 0) {
            console.warn("No data found in the database.");
            return res.status(404).json({ error: "No data available." });
        }

        await client.close();

        res.json(data); // Send the newly fetched data
    } catch (err) {
        console.error("Error during scraping or fetching data:", err.message);
        res.status(500).json({ error: "Internal server error during scraping or fetching data." });
    }
});


// Scraper function
async function scrapeAndStore() {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    app.get("/api/scrape", async (req, res) => {
        console.log("API endpoint /api/scrape hit");
    
        try {
            await scrapeAndStore(); // Run the scraper function
            console.log("Scraping completed.");
    
            // Fetch the latest data
            const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
            await client.connect();
            const db = client.db(dbName);
            const collection = db.collection(collectionName);
            
            const data = await collection.find().limit(5).toArray();
            console.log("Fetched data:", data);
    
            if (!data || data.length === 0) {
                console.warn("No data found in the database.");
                return res.status(404).json({ error: "No data available." });
            }
    
            await client.close();
    
            res.json(data); // Send the newly fetched data
        } catch (err) {
            console.error("Error during scraping or fetching data:", err.message);
            res.status(500).json({ error: "Internal server error during scraping or fetching data." });
        }
    });
    
    let driver;

    try {
        const chrome = require("selenium-webdriver/chrome");
        const options = new chrome.Options();

        // Set up the ProxyMesh endpoint
        try {
            console.log(`Trying to use ProxyMesh endpoint: ${proxyEndpoint}`);

            const proxy = new Proxy()
                .usingHttpProxy(`${proxyUsername}:${proxyPassword}@${proxyEndpoint.replace("http://", "")}`);

            driver = new Builder()
                .forBrowser("chrome")
                .setProxy(proxy)
                .setChromeOptions(options)
                .build();

            activeProxy = proxyEndpoint;
        } catch (proxyError) {
            console.warn(`ProxyMesh setup failed: ${proxyError.message}. Falling back to localhost.`);
            driver = new Builder()
                .forBrowser("chrome")
                .setChromeOptions(options)
                .build();
        }

        // Connect to MongoDB
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Delete existing data in the collection
        console.log("Deleting existing data...");
        await collection.deleteMany({}); // Removes all documents from the collection

        // Scrape new data
        console.log("Scraping new data...");

        // Navigate to Twitter login page
        await driver.get("https://x.com/i/flow/login");

        // Wait for login form to appear (adjust selectors based on page structure)
        await driver.wait(until.elementLocated(By.name("text")), 10000); // Wait for the username field
        const usernameField = await driver.findElement(By.name("text"));
        await usernameField.sendKeys("Shayne917862"); // Enter your username here
        await usernameField.sendKeys(Key.RETURN);

        await driver.wait(until.elementLocated(By.name("password")), 10000); // Wait for password field
        const passwordField = await driver.findElement(By.name("password"));
        await passwordField.sendKeys("ShayneDummyAcc01"); // Enter your password here
        await passwordField.sendKeys(Key.RETURN);

        // Wait for the homepage to load after login
        await driver.wait(until.urlContains("home"), 15000); // Wait for the URL to contain 'home'
        
        // Wait for the explore link to appear and be clickable
        await driver.wait(until.elementLocated(By.xpath("//a[@href='/explore']")), 10000);

        // Find the explore link element
        let explore = await driver.findElement(By.xpath("//a[@href='/explore']"));
        explore.click();

        // Now scrape the data
        await driver.wait(until.elementsLocated(By.xpath("//span[@dir='ltr']")), 100000); // Ensure elements are present
        let spanElements = await driver.findElements(By.xpath("//span[@dir='ltr']"));

        // Store top 5 entries
        for (let i = 0; i < Math.min(5, spanElements.length); i++) {
            let text = await spanElements[i].getText();

            const document = {
                text: text,
                timestamp: new Date(),
                proxy: activeProxy,
                page: "explore",
                xpath: "//span[@dir='ltr']",
                additional_info: {
                    is_featured: false,
                    user: "Shayne917862", // Customize as necessary
                },
            };

            await collection.insertOne(document);
        }

        console.log("Scraping completed and top 5 data stored in MongoDB.");
        await driver.quit();
    } catch (err) {
        console.error("An error occurred during scraping:", err.message);
    } finally {
        await client.close();
    }
}

// Start Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});