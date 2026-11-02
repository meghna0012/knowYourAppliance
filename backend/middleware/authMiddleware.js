import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Household from "../models/Household.js";
import { ensureHousehold } from "../services/householdService.js";

// Household is resolved from the DB on every request (not baked into the JWT)
// so removing a member revokes their access immediately.
export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }

  try {
    // Attach user (without password) to the request
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    await ensureHousehold(req.user);
    return next();
  } catch (err) {
    return next(err);
  }
};

// Must run after `protect`. Exposes the loaded household as `req.household`.
export const requireHouseholdAdmin = async (req, res, next) => {
  try {
    const household = await Household.findById(req.user.household);

    if (!household) {
      return res.status(404).json({ message: "Household not found" });
    }
    if (!household.admin.equals(req.user._id)) {
      return res
        .status(403)
        .json({ message: "Only the household admin can do that" });
    }

    req.household = household;
    return next();
  } catch (err) {
    return next(err);
  }
};
