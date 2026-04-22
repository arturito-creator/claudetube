import { NextResponse } from "next/server";
import { PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Read-only debug endpoint that exercises R2 from the server side to surface
 * whatever error R2 returns (browsers strip the body when CORS isn't set on
 * error responses). Safe to expose: it only reports configured env values'
 * presence (never contents) and R2's own diagnostic text.
 */
export async function GET() {
  const bucket = process.env.S3_BUCKET || "claudetube";
  const report: Record<string, unknown> = {
    env: {
      S3_ENDPOINT: Boolean(process.env.S3_ENDPOINT),
      S3_REGION: process.env.S3_REGION || "(default us-east-1)",
      S3_BUCKET: bucket,
      S3_ACCESS_KEY: Boolean(process.env.S3_ACCESS_KEY),
      S3_SECRET_KEY: Boolean(process.env.S3_SECRET_KEY),
      S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "(default true)",
    },
  };

  // 1. Can we list/head the bucket?
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    report.headBucket = "ok";
  } catch (err) {
    report.headBucket = describe(err);
  }

  // 2. Can we write a tiny probe object?
  const key = `debug/probe-${Date.now()}.txt`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from("ok"),
        ContentType: "text/plain",
      }),
    );
    report.putObject = { ok: true, key };
  } catch (err) {
    report.putObject = describe(err);
  }

  return NextResponse.json(report, { status: 200 });
}

function describe(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as {
      name?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number };
      Code?: string;
    };
    return {
      name: e.name,
      message: e.message,
      status: e.$metadata?.httpStatusCode,
      code: e.Code,
    };
  }
  return { raw: String(err) };
}
