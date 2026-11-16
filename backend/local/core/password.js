import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const options = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(24).toString("hex");
  const hash = await scrypt(password, salt, 64, options);
  return `scrypt$65536$8$2$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  const [, n, r, p, salt, expected] = encoded.split("$");
  if (
    n !== "65536" ||
    r !== "8" ||
    p !== "2" ||
    !/^[a-f0-9]{48}$/.test(salt || "")
  )
    return false;
  const actual = await scrypt(password, salt, 64, options);
  const target = Buffer.from(expected || "", "hex");
  return target.length === actual.length && timingSafeEqual(actual, target);
}

export const tokenHash = (value) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
