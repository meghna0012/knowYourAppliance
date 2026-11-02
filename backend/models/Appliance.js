import mongoose from "mongoose";

const qaSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    askedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const identificationSchema = new mongoose.Schema(
  {
    brand: { type: String, trim: true },
    modelNumber: { type: String, trim: true },
    serialNumber: { type: String, trim: true },
    generation: { type: String, trim: true },
    applianceType: { type: String, trim: true },
  },
  { _id: false }
);

const calendarDate = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

const warrantySchema = new mongoose.Schema(
  {
    provider: { type: String, trim: true },
    coverageType: {
      type: String,
      enum: ["manufacturer", "extended", "retailer", "unknown"],
    },
    termMonths: { type: Number, min: 1, max: 240 },
    startDate: calendarDate,
    endDate: calendarDate,
    coverage: { type: String, trim: true },
    renewable: Boolean,
    renewalDate: calendarDate,
  },
  { _id: false }
);

const maintenanceSchema = new mongoose.Schema(
  {
    task: { type: String, required: true, trim: true },
    intervalMonths: { type: Number, min: 1, max: 240 },
    intervalDays: { type: Number, min: 1, max: 3650 },
    lastDone: calendarDate,
    nextDue: calendarDate,
  },
  { _id: false }
);

const uploadSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["sticker", "manual", "bill", "warranty", "service", "condition", "other"],
      required: true,
    },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    // Absent when the reading was saved without the file itself.
    storedName: { type: String },
    summary: { type: String, required: true },
    identification: identificationSchema,
    bill: {
      type: new mongoose.Schema(
        {
          retailer: String,
          purchaseDate: String,
          price: String,
          currency: String,
          invoiceNumber: String,
          // Older readings stored the warranty as a phrase ("2 years").
          // New readings put the term on `warranty` and leave this for wording
          // that is not just a duration.
          warranty: String,
        },
        { _id: false }
      ),
    },
    warranty: { type: warrantySchema },
    maintenance: { type: [maintenanceSchema], default: undefined },
    condition: {
      type: new mongoose.Schema(
        {
          observations: [String],
          issues: [String],
          severity: { type: String, enum: ["none", "minor", "moderate", "urgent"] },
          safeToUse: Boolean,
          advice: String,
        },
        { _id: false }
      ),
    },
    manual: {
      type: new mongoose.Schema(
        {
          topic: String,
          keyPoints: [String],
        },
        { _id: false }
      ),
    },
    unreadable: [String],
    // Source text (a PDF) or a short quotation from a photo, used when answering questions.
    excerpt: { type: String, maxlength: 8000 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const purchaseRecordSchema = new mongoose.Schema(
  {
    retailer: String,
    purchaseDate: calendarDate,
    price: String,
    currency: String,
    invoiceNumber: String,
    sourceUploadId: mongoose.Schema.Types.ObjectId,
  },
  { _id: false }
);

const warrantyRecordSchema = new mongoose.Schema(
  {
    provider: String,
    coverageType: {
      type: String,
      enum: ["manufacturer", "extended", "retailer", "unknown"],
    },
    termMonths: Number,
    startDate: calendarDate,
    endDate: calendarDate,
    // True when endDate was calculated from a start date plus a term,
    // rather than printed on the document.
    endDateCalculated: Boolean,
    coverage: String,
    renewable: Boolean,
    renewalDate: calendarDate,
    sourceUploadId: mongoose.Schema.Types.ObjectId,
  },
  { _id: false }
);

const maintenanceRecordSchema = new mongoose.Schema(
  {
    task: { type: String, required: true },
    taskKey: { type: String, required: true },
    intervalMonths: Number,
    intervalDays: Number,
    lastDone: calendarDate,
    nextDue: calendarDate,
    sourceUploadId: mongoose.Schema.Types.ObjectId,
  },
  { _id: false }
);

const recordsSchema = new mongoose.Schema(
  {
    purchase: purchaseRecordSchema,
    warranties: { type: [warrantyRecordSchema], default: [] },
    maintenance: { type: [maintenanceRecordSchema], default: [] },
  },
  { _id: false }
);

const serviceLogSchema = new mongoose.Schema(
  {
    taskKey: { type: String, required: true },
    task: String,
    doneOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const applianceSchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true,
    },
    // The member who added it; access is controlled by `household`, not this.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    brand: { type: String, required: true, trim: true },
    modelNumber: { type: String, required: true, trim: true },
    nickname: { type: String, trim: true }, // optional friendly name, e.g. "Kitchen fridge"
    serialNumber: { type: String, trim: true },
    generation: { type: String, trim: true },
    history: [qaSchema],
    uploads: { type: [uploadSchema], default: [] },
    // Derived from uploads plus serviceLog. Rebuilt whenever either changes.
    records: { type: recordsSchema, default: () => ({ warranties: [], maintenance: [] }) },
    serviceLog: { type: [serviceLogSchema], default: [] },
  },
  { timestamps: true }
);

applianceSchema.index({ household: 1, "records.warranties.endDate": 1 });
applianceSchema.index({ household: 1, "records.maintenance.nextDue": 1 });

const Appliance = mongoose.model("Appliance", applianceSchema);
export default Appliance;
