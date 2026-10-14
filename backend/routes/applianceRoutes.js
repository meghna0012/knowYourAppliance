import express from "express";
import Appliance from "../models/Appliance.js";
import { protect } from "../middleware/authMiddleware.js";
import { askApplianceQuestion } from "../services/aiService.js";

const router = express.Router();

// All appliance routes require a valid JWT
router.use(protect);

// @route   POST /api/appliances
// @desc    Register a new appliance for the logged-in user
router.post("/", async (req, res) => {
  try {
    const { brand, modelNumber, nickname } = req.body;

    if (!brand || !modelNumber) {
      return res.status(400).json({ message: "Brand and model number are required" });
    }

    const appliance = await Appliance.create({
      user: req.user._id,
      brand,
      modelNumber,
      nickname,
    });

    res.status(201).json(appliance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/appliances
// @desc    Get all appliances belonging to the logged-in user
router.get("/", async (req, res) => {
  try {
    const appliances = await Appliance.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(appliances);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/appliances/:id
// @desc    Get a single appliance (with its Q&A history)
router.get("/:id", async (req, res) => {
  try {
    const appliance = await Appliance.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!appliance) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    res.json(appliance);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE /api/appliances/:id
router.delete("/:id", async (req, res) => {
  try {
    const appliance = await Appliance.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!appliance) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    res.json({ message: "Appliance removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/appliances/:id/ask
// @desc    Ask the AI a question about a specific appliance
router.post("/:id/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    const appliance = await Appliance.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!appliance) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    const answer = await askApplianceQuestion({
      brand: appliance.brand,
      modelNumber: appliance.modelNumber,
      question,
    });

    appliance.history.push({ question, answer });
    await appliance.save();

    res.json({ question, answer, history: appliance.history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "AI request failed", error: err.message });
  }
});

export default router;
