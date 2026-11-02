import mongoose from "mongoose";

// Membership is stored on User.household (single source of truth), not as an
// array here, so the two can never drift out of sync.
const householdSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const Household = mongoose.model("Household", householdSchema);
export default Household;
