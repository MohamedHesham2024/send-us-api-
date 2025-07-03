const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
require("dotenv").config();
const axios = require("axios");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;

// اتصال بـ MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// مخطط التوكن
const tokenSchema = new mongoose.Schema({
  refresh_token: String,
  created_at: { type: Date, default: Date.now },
});

const Token = mongoose.model("Token", tokenSchema);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public")); 

app.post("/send-email", async (req, res) => {
  const { firstName, lastName, email, bookCount, additionalInfo } = req.body;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
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
    res.status(200).json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});
app.get("/zoho-success.html", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Zoho Connected</title>
      <style>
        body {
          font-family: sans-serif;
          text-align: center;
          margin-top: 80px;
        }
      </style>
    </head>
    <body>
      <h1>🎉 Zoho Account Connected Successfully!</h1>
      <p>You can now close this window.</p>
    </body>
    </html>
  `);
});

// Zoho callback
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
        timeout: 8000,
      }
    );

    const refreshToken = response.data.refresh_token;

    await Token.create({ refresh_token: refreshToken });
    console.log("✅ Refresh token saved to MongoDB:", refreshToken);

    return res.redirect("/zoho-success.html");
  } catch (err) {
    console.error("❌ Error fetching token from Zoho:", err.response?.data || err);
    return res.status(500).send("Failed to get token from Zoho");
  }
});

// جلب آخر refresh_token
app.get("/zoho/last-refresh-token", async (req, res) => {
  try {
    const latest = await Token.findOne().sort({ created_at: -1 });
    if (!latest) return res.status(404).json({ error: "No token found" });

    return res.status(200).json({ refresh_token: latest.refresh_token });
  } catch (err) {
    console.error("DB Error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

// جلب access token من Zoho
async function getAccessTokenFromMongo() {
  const latest = await Token.findOne().sort({ created_at: -1 });
  if (!latest) throw new Error("No refresh token found");

  const response = await axios.post(
    "https://accounts.zoho.com/oauth/v2/token",
    null,
    {
      params: {
        refresh_token: latest.refresh_token,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: "refresh_token",
      },
      timeout: 8000,
    }
  );

  return response.data.access_token;
}
app.get("/zoho/contact/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const accessToken = await getAccessTokenFromMongo(); // أو env أو db حسب شغلك

    const response = await axios.get(
      `https://www.zohoapis.com/bigin/v1/Contacts/${id}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    res.status(200).json({ success: true, contact: response.data.data });
  } catch (error) {
    console.error("❌ Error fetching contact:", error.response?.data || error);
    res
      .status(500)
      .json({ success: false, error: error.response?.data || error });
  }
});

// إرسال بيانات إلى Zoho
app.post("/zoho/send-data", async (req, res) => {
  const zohoData = req.body;

  try {
    const accessToken = await getAccessTokenFromMongo();

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
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
