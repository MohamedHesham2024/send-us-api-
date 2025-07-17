const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema({
  index: Number,
  file_link: String,
  file_type: String,
});

const SecondaryListingSchema = new mongoose.Schema({
  name: String,
  header:String,
  description: String,
  media: [mediaSchema],
  price:Number,
  mobile: String,
});

module.exports = mongoose.model("SecondaryListing", SecondaryListingSchema);
