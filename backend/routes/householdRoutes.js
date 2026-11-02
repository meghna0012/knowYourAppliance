import express from "express";
import mongoose from "mongoose";
import Household from "../models/Household.js";
import User from "../models/User.js";
import { protect, requireHouseholdAdmin } from "../middleware/authMiddleware.js";
import {
  HouseholdError,
  MAX_HOUSEHOLD_MEMBERS,
  findHouseholdByInviteCode,
  joinHousehold,
  leaveHousehold,
  regenerateInviteCode,
  removeMember,
  transferAdmin,
} from "../services/householdService.js";

const router = express.Router();

router.use(protect);

const serializeHousehold = async (household, currentUserId) => {
  const members = await User.find({ household: household._id })
    .select("name email createdAt")
    .sort({ createdAt: 1 });

  return {
    _id: household._id,
    name: household.name,
    inviteCode: household.inviteCode,
    maxMembers: MAX_HOUSEHOLD_MEMBERS,
    isAdmin: household.admin.equals(currentUserId),
    members: members.map((m) => ({
      _id: m._id,
      name: m.name,
      email: m.email,
      isAdmin: household.admin.equals(m._id),
    })),
  };
};

const sendError = (res, err) => {
  if (err instanceof HouseholdError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: err.message });
};

const requireValidUserId = (req, res, next) => {
  const userId = req.params.userId ?? req.body.userId;
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  return next();
};

// @route   GET /api/household
// @desc    Current user's household, invite code and members
router.get("/", async (req, res) => {
  try {
    const household = await Household.findById(req.user.household);
    if (!household) {
      return res.status(404).json({ message: "Household not found" });
    }
    res.json(await serializeHousehold(household, req.user._id));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   PATCH /api/household
// @desc    Rename the household (admin only)
router.patch("/", requireHouseholdAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 60) {
      return res
        .status(400)
        .json({ message: "Name must be between 1 and 60 characters" });
    }
    req.household.name = name;
    await req.household.save();
    res.json(await serializeHousehold(req.household, req.user._id));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/household/invite-code
// @desc    Replace the invite code, invalidating the old one (admin only)
router.post("/invite-code", requireHouseholdAdmin, async (req, res) => {
  try {
    await regenerateInviteCode(req.household);
    res.json(await serializeHousehold(req.household, req.user._id));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/household/join
// @desc    Join another household with its invite code `{ inviteCode }`
router.post("/join", async (req, res) => {
  try {
    const target = await findHouseholdByInviteCode(req.body.inviteCode);
    await joinHousehold(req.user, target);
    res.json(await serializeHousehold(target, req.user._id));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/household/leave
// @desc    Leave the household; you get a fresh personal one
router.post("/leave", async (req, res) => {
  try {
    const household = await leaveHousehold(req.user);
    res.json(await serializeHousehold(household, req.user._id));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/household/transfer-admin
// @desc    Hand the admin role to another member `{ userId }` (admin only)
router.post(
  "/transfer-admin",
  requireHouseholdAdmin,
  requireValidUserId,
  async (req, res) => {
    try {
      await transferAdmin(req.household, req.body.userId);
      res.json(await serializeHousehold(req.household, req.user._id));
    } catch (err) {
      sendError(res, err);
    }
  }
);

// @route   DELETE /api/household/members/:userId
// @desc    Remove a member; they get a fresh personal household (admin only)
router.delete(
  "/members/:userId",
  requireHouseholdAdmin,
  requireValidUserId,
  async (req, res) => {
    try {
      await removeMember(req.household, req.params.userId);
      res.json(await serializeHousehold(req.household, req.user._id));
    } catch (err) {
      sendError(res, err);
    }
  }
);

export default router;
