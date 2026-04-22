import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.S3_BUCKET || "claudetube";

export const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  // Cloudflare R2 rejects requests that carry the SDK's default
  // x-amz-checksum-* headers when the body is provided separately (as with
  // browser PUTs against a presigned URL). Skip checksum injection unless an
  // operation explicitly needs it.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "claudetube",
    secretAccessKey: process.env.S3_SECRET_KEY || "claudetube",
  },
});

export async function putFile(
  key: string,
  absPath: string,
  contentType: string,
): Promise<void> {
  const stat = await fs.stat(absPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(absPath),
      ContentType: contentType,
      ContentLength: stat.size,
    }),
  );
}

export async function putBuffer(
  key: string,
  buf: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      ContentLength: buf.length,
    }),
  );
}

export async function getObjectStream(key: string): Promise<{
  stream: Readable;
  contentType?: string;
  contentLength?: number;
}> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body as Readable;
  return {
    stream: body,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
  };
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function presignGet(key: string, expiresSec = 60 * 60): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresSec,
  });
}

export async function presignPut(
  key: string,
  {
    contentType,
    expiresSec = 10 * 60,
  }: { contentType?: string; expiresSec?: number } = {},
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresSec },
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { stream } = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Upload an entire extracted bundle directory to S3. */
export async function putDirectory(
  localDir: string,
  keyPrefix: string,
  files: { relPath: string; absPath: string; contentType: string }[],
): Promise<void> {
  // Keep it serial to avoid overwhelming MinIO on dev machines.
  for (const f of files) {
    const key = path.posix.join(keyPrefix, f.relPath);
    await putFile(key, f.absPath, f.contentType);
  }
  void localDir;
}
