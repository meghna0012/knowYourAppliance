import express from "express";
import mongoose from "mongoose";
import Appliance from "../models/Appliance.js";
import { protect } from "../middleware/authMiddleware.js";
import { acceptUpload } from "../middleware/uploadMiddleware.js";
import { askApplianceQuestion } from "../services/aiService.js";
import { deleteStored, hasStored, saveUpload, storedPath } from "../services/uploadStore.js";
import {
  DiagnosisError,
  allowedMime,
  buildUploadContext,
  clipText,
  diagnoseFile,
  normalizeDiagnosis,
  prepareStoredFile,
  safeOriginalName,
} from "../services/diagnosisService.js";
import {
  buildReminders,
  compareReminders,
  isoDate,
  recordsAreEmpty,
  recordsFromUploads,
  reminderInList,
  todayIso,
} from "../services/documentRecords.js";

const router = express.Router();

// All appliance routes require a valid JWT
router.use(protect);

// Every query is scoped to the caller's household; that's the access check.
const inHousehold = (req, extra = {}) => ({
  household: req.user.household,
  ...extra,
});

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const withAuthors = (query) =>
  query
    .populate("user", "name")
    .populate("history.askedBy", "name")
    .populate("uploads.uploadedBy", "name");

const sendDiagnosisError = (res, err) => {
  if (err instanceof DiagnosisError) {
    if (err.status >= 500) console.error(err);
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: "Couldn't read that upload" });
};

// Records and reminders are computed from the documents, not from a stored
// status, so "due" stays correct as the calendar moves.
const decorate = (appliance) => {
  const plain = typeof appliance.toObject === "function" ? appliance.toObject() : { ...appliance };
  plain.records = recordsFromUploads(plain.uploads, plain.serviceLog);
  plain.reminders = buildReminders(plain.records);
  return plain;
};

// Older appliances only have a warranty phrase on the bill. The first read
// writes the derived record so a later reminder query does not scan uploads.
const backfillRecords = async (appliances) => {
  const writes = [];
  for (const appliance of appliances) {
    const next = recordsFromUploads(appliance.uploads, appliance.serviceLog);
    if (recordsAreEmpty(appliance.records) && !recordsAreEmpty(next)) {
      writes.push(Appliance.updateOne({ _id: appliance._id }, { $set: { records: next } }));
    }
  }
  if (writes.length) await Promise.all(writes);
};

// Retry on a version conflict so two members can upload at the same time
// without one of them dropping the other's document or its dates.
const changeAppliance = async (req, id, mutate) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const appliance = await Appliance.findOne(inHousehold(req, { _id: id }));
    if (!appliance) return null;
    await mutate(appliance);
    appliance.records = recordsFromUploads(appliance.uploads, appliance.serviceLog);
    appliance.markModified("records");
    try {
      await appliance.save();
      return appliance;
    } catch (err) {
      if (err.name !== "VersionError" || attempt === 2) throw err;
    }
  }
  return null;
};

const parseDiagnosisInput = (value) => {
  if (value == null || value === "") return null;
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      throw new DiagnosisError("The identification reading was malformed.", 400);
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DiagnosisError("The identification reading was malformed.", 400);
  }
  return { raw, diagnosis: normalizeDiagnosis(raw) };
};

const toUpload = ({ diagnosis, originalName, mimeType, storedName, userId }) => ({
  ...diagnosis,
  originalName: safeOriginalName(originalName),
  mimeType: allowedMime(mimeType) || "application/octet-stream",
  storedName,
  uploadedBy: userId,
});

const loadAppliance = (req, id) =>
  withAuthors(Appliance.findOne(inHousehold(req, { _id: id })));

// @route   POST /api/appliances/identify
// @desc    Read a sticker, manual, bill, or photo. Nothing is saved.
router.post("/identify", acceptUpload, async (req, res) => {
  try {
    const diagnosis = {
      ...reading.diagnosis,
      originalName: safeOriginalName(req.file.originalname),
      mimeType: reading.mimeType,
    };
    res.json({ diagnosis, records: recordsFromUploads([diagnosis]) });
  } catch (err) {
    sendDiagnosisError(res, err);
  }
});

// @route   POST /api/appliances
// @desc    Add an appliance. A previous reading and its file can be attached
//          without running the reader a second time.
const createAppliance = async (req, res) => {
  let storedName;
  try {
    const { brand, modelNumber, nickname, serialNumber, generation } = req.body;

    if (!brand || !modelNumber) {
      return res.status(400).json({ message: "Brand and model number are required" });
    }

    const supplied = parseDiagnosisInput(req.body.diagnosis);
    let reading = supplied?.diagnosis || null;
    let mimeType = allowedMime(supplied?.raw?.mimeType);
    let originalName = supplied?.raw?.originalName;

    if (req.file) {
      // A reading supplied with the file is the one the user already reviewed.
      // Don't call the model again, or a second pass could disagree with it.
      const stored = reading ? await prepareStoredFile(req.file.buffer) : null;
      const diagnosed = reading ? null : await diagnoseFile(req.file.buffer);
      const file = stored || diagnosed;
      reading = reading || diagnosed.diagnosis;
      mimeType = file.mimeType;
      originalName = req.file.originalname;
      storedName = await saveUpload(file.fileBuffer, file.extension);
    }

    const appliance = new Appliance({
      household: req.user.household,
      user: req.user._id,
      brand,
      modelNumber,
      nickname: clipText(nickname, 80),
      serialNumber: clipText(serialNumber, 80),
      generation: clipText(generation, 80),
      uploads: reading
        ? [
            toUpload({
              diagnosis: reading,
              originalName,
              mimeType,
              storedName,
              userId: req.user._id,
            }),
          ]
        : [],
    });
    appliance.records = recordsFromUploads(appliance.uploads, appliance.serviceLog);
    await appliance.save();
    await appliance.populate("user", "name");
    await appliance.populate("uploads.uploadedBy", "name");

    res.status(201).json(decorate(appliance));
  } catch (err) {
    if (storedName) await deleteStored(storedName).catch((cleanupErr) => console.error(cleanupErr));
    if (err instanceof DiagnosisError || err.status) return sendDiagnosisError(res, err);
    res.status(500).json({ message: err.message });
  }
};

router.post("/", (req, res, next) => {
  if (req.is("multipart/form-data")) return acceptUpload(req, res, next);
  next();
}, createAppliance);

// @route   GET /api/appliances?q=
// @desc    List the household's appliances, optionally filtered by brand,
//          model number or nickname
router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const filter = inHousehold(req);

    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { brand: pattern },
        { modelNumber: pattern },
        { nickname: pattern },
      ];
    }

    const appliances = await Appliance.find(filter)
      .select("-uploads.excerpt")
      .populate("user", "name")
      .sort({ createdAt: -1 });
    await backfillRecords(appliances);
    res.json(appliances.map(decorate));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/appliances/reminders
// @desc    Warranty and upkeep reminders that are due, overdue, or within 90 days
router.get("/reminders", async (req, res) => {
  try {
    const appliances = await Appliance.find(inHousehold(req)).select("-history -uploads.excerpt");
    const reminders = [];
    for (const appliance of appliances) {
      const records = recordsFromUploads(appliance.uploads, appliance.serviceLog);
      for (const reminder of buildReminders(records)) {
        if (!reminderInList(reminder)) continue;
        reminders.push({
          ...reminder,
          applianceId: appliance._id,
          brand: appliance.brand,
          modelNumber: appliance.modelNumber,
          nickname: appliance.nickname,
        });
      }
    }
    reminders.sort(compareReminders);
    res.json({ reminders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/appliances/:id
// @desc    Get a single appliance (with its Q&A history and readings)
router.get("/:id", async (req, res) => {
  try {
    const appliance = await loadAppliance(req, req.params.id);

    if (!appliance) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    await backfillRecords([appliance]);
    res.json(decorate(appliance));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE /api/appliances/:id
router.delete("/:id", async (req, res) => {
  try {
    const appliance = await Appliance.findOneAndDelete(
      inHousehold(req, { _id: req.params.id })
    );

    if (!appliance) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    await Promise.all(
      (appliance.uploads || []).map((upload) =>
        deleteStored(upload.storedName).catch((err) => console.error(err))
      )
    );

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

    const appliance = await Appliance.findOne(inHousehold(req, { _id: req.params.id }));

    if (!appliance) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    const records = recordsFromUploads(appliance.uploads, appliance.serviceLog);
    const answer = await askApplianceQuestion({
      brand: appliance.brand,
      modelNumber: appliance.modelNumber,
      nickname: appliance.nickname,
      serialNumber: appliance.serialNumber,
      generation: appliance.generation,
      question,
      context: buildUploadContext(appliance.uploads, records),
    });

    // Atomic $push: other household members may be asking about the same
    // appliance concurrently, and a read-modify-save could drop their entry.
    const updated = await Appliance.findOneAndUpdate(
      inHousehold(req, { _id: appliance._id }),
      { $push: { history: { question, answer, askedBy: req.user._id } } },
      { new: true }
    ).populate("history.askedBy", "name");

    if (!updated) {
      return res.status(404).json({ message: "Appliance was removed" });
    }

    res.json({ question, answer, history: updated.history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "AI request failed", error: err.message });
  }
});

// @route   POST /api/appliances/:id/diagnose
// @desc    Read any photo or PDF and keep the reading on the appliance
router.post("/:id/diagnose", acceptUpload, async (req, res) => {
  let storedName;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    const appliance = await Appliance.findOne(inHousehold(req, { _id: req.params.id }));
    if (!appliance) {
      return res.status(404).json({ message: "Appliance not found" });
    }

    const reading = await diagnoseFile(req.file.buffer, appliance);
    storedName = await saveUpload(reading.fileBuffer, reading.extension);

    const saved = await changeAppliance(req, appliance._id, (doc) => {
      doc.uploads.push(
        toUpload({
          diagnosis: reading.diagnosis,
          originalName: req.file.originalname,
          mimeType: reading.mimeType,
          storedName,
          userId: req.user._id,
        })
      );
    });

    if (!saved) {
      await deleteStored(storedName);
      return res.status(404).json({ message: "Appliance was removed" });
    }

    const populated = await loadAppliance(req, saved._id);
    res.json({ appliance: decorate(populated) });
  } catch (err) {
    if (storedName) await deleteStored(storedName).catch((cleanupErr) => console.error(cleanupErr));
    sendDiagnosisError(res, err);
  }
});

// @route   POST /api/appliances/:id/uploads/:uploadId/apply
// @desc    Copy a reading's identification onto the appliance
router.post("/:id/uploads/:uploadId/apply", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.uploadId)) {
      return res.status(404).json({ message: "Reading not found" });
    }
    const appliance = await Appliance.findOne(inHousehold(req, { _id: req.params.id }));
    if (!appliance) return res.status(404).json({ message: "Appliance not found" });

    const upload = appliance.uploads.id(req.params.uploadId);
    if (!upload) return res.status(404).json({ message: "Reading not found" });

    const id = upload.identification || {};
    const $set = {};
    if (id.brand) $set.brand = id.brand;
    if (id.modelNumber) $set.modelNumber = id.modelNumber;
    if (id.serialNumber) $set.serialNumber = id.serialNumber;
    if (id.generation) $set.generation = id.generation;
    if (id.applianceType && !appliance.nickname) $set.nickname = id.applianceType;

    if (!Object.keys($set).length) {
      return res.status(400).json({ message: "Nothing on this upload identifies the appliance" });
    }

    const saved = await withAuthors(
      Appliance.findOneAndUpdate(inHousehold(req, { _id: appliance._id }), { $set }, { new: true })
    );
    if (!saved) return res.status(404).json({ message: "Appliance was removed" });

    res.json({ appliance: decorate(saved) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/appliances/:id/uploads/:uploadId/file
router.get("/:id/uploads/:uploadId/file", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.uploadId)) {
      return res.status(404).json({ message: "Reading not found" });
    }
    const appliance = await Appliance.findOne(inHousehold(req, { _id: req.params.id }));
    if (!appliance) return res.status(404).json({ message: "Appliance not found" });

    const upload = appliance.uploads.id(req.params.uploadId);
    if (!upload?.storedName) {
      return res.status(404).json({ message: "This reading has no file attached" });
    }

    const full = storedPath(upload.storedName);
    if (!full || !(await hasStored(upload.storedName))) {
      return res.status(404).json({ message: "This reading has no file attached" });
    }

    const filename = safeOriginalName(upload.originalName).replace(/[^\w.\- ]+/g, "") || "upload";
    res.setHeader("Content-Type", upload.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(full);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE /api/appliances/:id/uploads/:uploadId
router.delete("/:id/uploads/:uploadId", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.uploadId)) {
      return res.status(404).json({ message: "Reading not found" });
    }
    const appliance = await Appliance.findOne(inHousehold(req, { _id: req.params.id }));
    if (!appliance) return res.status(404).json({ message: "Appliance not found" });

    const upload = appliance.uploads.id(req.params.uploadId);
    if (!upload) return res.status(404).json({ message: "Reading not found" });

    const storedName = upload.storedName;
    const uploadId = upload._id;
    const saved = await changeAppliance(req, appliance._id, (doc) => {
      const current = doc.uploads.id(uploadId);
      if (!current) {
        const missing = new Error("Reading not found");
        missing.status = 404;
        throw missing;
      }
      current.deleteOne();
    });
    if (!saved) return res.status(404).json({ message: "Appliance was removed" });

    await deleteStored(storedName).catch((err) => console.error(err));
    const populated = await loadAppliance(req, saved._id);
    res.json({ appliance: decorate(populated) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// @route   POST /api/appliances/:id/maintenance/done
// @desc    Record that an upkeep task was done, then schedule the next one
router.post("/:id/maintenance/done", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Appliance not found" });
    }
    const taskKey = String(req.body?.taskKey || "");
    if (!/^[a-z0-9][a-z0-9 ]{0,159}$/.test(taskKey)) {
      return res.status(400).json({ message: "Say which upkeep task you finished." });
    }
    const doneOn = isoDate(req.body?.doneOn);
    if (!doneOn) {
      return res.status(400).json({ message: "Give the date you did it, as YYYY-MM-DD." });
    }
    if (doneOn > todayIso()) {
      return res.status(400).json({ message: "That date is in the future." });
    }

    const saved = await changeAppliance(req, req.params.id, (appliance) => {
      const records = recordsFromUploads(appliance.uploads, appliance.serviceLog);
      const task = (records.maintenance || []).find((item) => item.taskKey === taskKey);
      if (!task) {
        const missing = new Error("No upkeep task matches that.");
        missing.status = 404;
        throw missing;
      }
      appliance.serviceLog.push({
        taskKey,
        task: task.task,
        doneOn,
        completedBy: req.user._id,
      });
      while (appliance.serviceLog.length > 50) appliance.serviceLog.shift();
    });
    if (!saved) return res.status(404).json({ message: "Appliance not found" });

    const populated = await loadAppliance(req, saved._id);
    res.json({ appliance: decorate(populated) });
  } catch (err) {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ message: err.message });
  }
});

export default router;
