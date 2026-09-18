import { v2 as cloudinary } from "cloudinary";
import { getEnv } from "@asc/shared";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const env = getEnv();
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

/** Streams a buffer to Cloudinary and resolves with the secure URL + resource metadata. */
export function uploadBuffer(
  buffer: Buffer,
  options: { folder: string; filename: string },
): Promise<{ url: string; resourceType: string }> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.filename,
        resource_type: "auto",
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
        resolve({ url: result.secure_url, resourceType: result.resource_type });
      },
    );
    stream.end(buffer);
  });
}
