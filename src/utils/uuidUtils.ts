import { v5 as uuidv5 } from "uuid";

const NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"; // Use a fixed namespace UUID
// Generate a UUID based on a given path using a fixed namespace
export const generateUid = (s: string) => uuidv5(s, NAMESPACE);
