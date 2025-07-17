const express = require("express");
const multer = require("multer");
const SecondaryListing = require("../models/secondary_listing.model");
const router = express.Router();
const ImageKit = require("imagekit");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @swagger
 * components:
 *   schemas:
 *     Media:
 *       type: object
 *       properties:
 *         index:
 *           type: integer
 *         file_link:
 *           type: string
 *         file_type:
 *           type: string
 *     SecondaryListing:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         header:
 *           type: string
 *         description:
 *           type: string
 *         price:
 *           type: number
 *         mobile:
 *           type: string
 *         media:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Media'
 */

/**
 * @swagger
 * /api/secondary-listing:
 *   post:
 *     summary: Create new secondary listing with media files
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               header:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               mobile:
 *                 type: string
 *               media:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Listing created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SecondaryListing'
 */
router.post("/", upload.array("media"), async (req, res) => {
  try {
    const { name, header, description, price, mobile } = req.body;
    const files = req.files;

    const media = await Promise.all(
      files.map(async (file, index) => {
        const uploaded = await imagekit.upload({
          file: file.buffer,
          fileName: `${Date.now()}-${file.originalname.replace(/\s+/g, "")}`,
        });

        return {
          index,
          file_link: uploaded.url,
          file_type: file.mimetype,
        };
      })
    );

    const listing = new SecondaryListing({
      name,
      header,
      description,
      price,
      mobile,
      media,
    });

    await listing.save();
    res.status(201).json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/secondary-listing:
 *   get:
 *     summary: Get all secondary listings
 *     responses:
 *       200:
 *         description: A list of secondary listings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SecondaryListing'
 */
router.get("/", async (req, res) => {
  try {
    const listings = await SecondaryListing.find();
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/secondary-listing/{id}:
 *   get:
 *     summary: Get a secondary listing by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the listing
 *     responses:
 *       200:
 *         description: A single listing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SecondaryListing'
 *       404:
 *         description: Listing not found
 */
router.get("/:id", async (req, res) => {
  try {
    const listing = await SecondaryListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: "Not found" });
    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
