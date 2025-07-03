// server.js
const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
require("dotenv").config();
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const cors = require("cors");

const db = new sqlite3.Database("./zoho_tokens.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refresh_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

const app = express();
const PORT = 3000;
app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public")); // هنا حط الـ HTML

app.post("/send-email", async (req, res) => {
  const { firstName, lastName, email, bookCount, additionalInfo } = req.body;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // true لو بتستخدم 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"Book Order" <${process.env.SMTP_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `New Book Order from ${firstName} ${lastName}`,
    html: `
      <h2>New Book Order</h2>
      <p><strong>Name:</strong> ${firstName} ${lastName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Books Count:</strong> ${bookCount}</p>
      <p><strong>Additional Info:</strong> ${additionalInfo || "N/A"}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res
      .status(200)
      .json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});
app.get("/zoho/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) return res.status(400).send("Missing code from Zoho");

  try {
    const response = await axios.post(
  "https://accounts.zoho.com/oauth/v2/token",
  null,
  {
    params: {
      grant_type: "authorization_code",
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      redirect_uri: "https://send-us-api.vercel.app/zoho/callback",
      code,
    },
    timeout: 8000, // <= مهم جدًا
  }
);

    const refreshToken = response.data.refresh_token;

    db.run(
      `INSERT INTO tokens (refresh_token) VALUES (?)`,
      [refreshToken],
      function (err) {
        if (err) {
          console.error("DB Error:", err);
          return res.status(500).send("Database error");
        }

        console.log("✅ Refresh token saved to DB:", refreshToken);
        return res.redirect("/zoho-success.html");
      }
    );
  } catch (err) {
    console.error(
      "❌ Error fetching token from Zoho:",
      err.response?.data || err
    );
    return res.status(500).send("Failed to get token from Zoho");
  }
});
app.get("/zoho/last-refresh-token", (req, res) => {
  db.get(
    `SELECT refresh_token FROM tokens ORDER BY created_at DESC LIMIT 1`,
    [],
    (err, row) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (!row) {
        return res.status(404).json({ error: "No token found" });
      }

      return res.status(200).json({ refresh_token: row.refresh_token });
    }
  );
});
async function getAccessTokenFromDB() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT refresh_token FROM tokens ORDER BY created_at DESC LIMIT 1`,
      [],
      async (err, row) => {
        if (err) return reject(err);
        if (!row) return reject("No refresh_token found");

        try {
         const res = await axios.post(
  "https://accounts.zoho.com/oauth/v2/token",
  null,
  {
    params: {
      refresh_token: row.refresh_token,
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    },
    timeout: 8000, // <= مهم جدًا
  }
);


          resolve(res.data.access_token);
        } catch (error) {
          reject(error.response?.data || error);
        }
      }
    );
  });
}
app.post("/zoho/send-data", async (req, res) => {
  const zohoData = req.body;

  try {
    const accessToken = await getAccessTokenFromDB();

    const response = await axios.post(
      "https://www.zohoapis.com/bigin/v1/Contacts",
      {
        data: [zohoData],
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    res.status(200).json({ success: true, zoho: response.data });
  } catch (error) {
    console.error("❌ Failed to send to Zoho:", error);
    res.status(500).json({ success: false, error });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
