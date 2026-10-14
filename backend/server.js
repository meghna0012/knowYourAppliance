import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import applianceRoutes from "./routes/applianceRoutes.js";

dotenv.config();
console.log("Groq key loaded:", process.env.GROQ_API_KEY?.slice(0, 8) + "...");
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// Separate routers so auth and appliance endpoints never collide
app.use("/api/auth", authRoutes);
app.use("/api/appliances", applianceRoutes);

app.get("/", (req, res) => {
  res.send("Know Your Appliance API is running");
});

// Basic error handler for anything that slips through
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
