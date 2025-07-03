const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
require("dotenv").config();
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = 3000;
const TOKEN_FILE = path.join(__dirname, "token.json");

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public")); // حط HTML هنا

// ------------------ إرسال الإيميل ------------------
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
    res.status(200).json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});

// ------------------ استلام الكود من Zoho ------------------
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
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: refreshToken }, null, 2));
    console.log("✅ Refresh token saved to file:", refreshToken);

    return res.redirect("/zoho-success.html");
  } catch (err) {
    console.error("❌ Error fetching token from Zoho:", err.response?.data || err);
    return res.status(500).send("Failed to get token from Zoho");
  }
});

// ------------------ عرض آخر Refresh Token (اختياري) ------------------
app.get("/zoho/last-refresh-token", (req, res) => {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return res.status(404).json({ error: "No token file found" });
    }

    const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    return res.status(200).json({ refresh_token: tokenData.refresh_token });
  } catch (err) {
    return res.status(500).json({ error: "Failed to read token file" });
  }
});

// ------------------ جلب Access Token ------------------
async function getAccessTokenFromFile() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      throw new Error("No refresh_token saved");
    }

    const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    const refreshToken = tokenData.refresh_token;

    const res = await axios.post(
      "https://accounts.zoho.com/oauth/v2/token",
      null,
      {
        params: {
          refresh_token: refreshToken,
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          grant_type: "refresh_token",
        },
        timeout: 8000,
      }
    );

    return res.data.access_token;
  } catch (err) {
    console.error("❌ Error getting access token:", err.response?.data || err);
    throw err;
  }
}

// ------------------ إرسال بيانات إلى Zoho Bigin ------------------
app.post("/zoho/send-data", async (req, res) => {
  const zohoData = req.body;

  try {
    const accessToken = await getAccessTokenFromFile();

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
