import multer from "multer";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

export function acceptUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "That file is over 8 MB. Export a smaller photo or PDF.",
      });
    }
    if (err) {
      return res.status(400).json({ message: "Couldn't read that upload." });
    }
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ message: "Choose a photo or PDF first." });
    }
    next();
  });
}
