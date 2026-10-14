import mongoose from "mongoose";

const qaSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { timestamps: true }
);

const applianceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    brand: { type: String, required: true, trim: true },
    modelNumber: { type: String, required: true, trim: true },
    nickname: { type: String, trim: true }, // optional friendly name, e.g. "Kitchen fridge"
    history: [qaSchema],
  },
  { timestamps: true }
);

const Appliance = mongoose.model("Appliance", applianceSchema);
export default Appliance;
