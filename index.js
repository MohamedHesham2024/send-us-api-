// server.js
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
require('dotenv').config();
const cors = require('cors');


const app = express();
const PORT = 3000;
app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // هنا حط الـ HTML

app.post('/send-email', async (req, res) => {
  const { firstName, lastName, email, bookCount, additionalInfo } = req.body;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // true لو بتستخدم 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
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
      <p><strong>Additional Info:</strong> ${additionalInfo || 'N/A'}</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
