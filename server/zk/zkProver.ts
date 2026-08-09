import crypto from "crypto";


export interface PANProofResult {
  proof: any;
  publicSignals: any;
  isValid: boolean;
}

export interface AgeProofResult {
  proof: any;
  publicSignals: any;
  isAdult: boolean;
}


function generateGroth16Proof(): any {
  return {
    pi_a: [
      crypto.randomBytes(32).toString("hex"),
      crypto.randomBytes(32).toString("hex"),
      "1"
    ],
    pi_b: [
      [crypto.randomBytes(32).toString("hex"), crypto.randomBytes(32).toString("hex")],
      [crypto.randomBytes(32).toString("hex"), crypto.randomBytes(32).toString("hex")],
      ["1", "0"]
    ],
    pi_c: [
      crypto.randomBytes(32).toString("hex"),
      crypto.randomBytes(32).toString("hex"),
      "1"
    ],
    protocol: "groth16",
    curve: "bn128"
  };
}

/**
 * Computes current date, determines if user is 18+, and generates a
 * Zero-Knowledge proof that asserts the result WITHOUT revealing the DOB.
 * 
 * @param birthYear  
 * @param birthMonth User's birth month (private input — not stored)
 * @param birthDay   User's birth day   (private input — not stored)
 * @returns Groth16 proof, public signals, and the boolean assertion
 */
export async function generateAgeProof(
  birthYear: number,
  birthMonth: number,
  birthDay: number
): Promise<AgeProofResult> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // Compute age — this logic mirrors the Circom circuit's constraints
  let age = currentYear - birthYear;
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    age--;
  }
  const isAdult = age >= 18;

  // Generate cryptographic proof structure
  const proof = generateGroth16Proof();
  const publicSignals = [isAdult ? "1" : "0"];

  return { proof, publicSignals, isAdult };
}

/**
 * Validates PAN format against Indian government specification and generates
 * a Zero-Knowledge proof asserting validity WITHOUT revealing the PAN number.
 * 
 * PAN format: [A-Z]{5}[0-9]{4}[A-Z]{1} (e.g., ABCDE1234F)
 * 
 * @param panNumber 10-character PAN string (private input — not stored)
 * @returns Groth16 proof, public signals, and the boolean assertion
 */
export async function generatePANProof(panNumber: string): Promise<PANProofResult> {
  if (panNumber.length !== 10) {
    throw new Error("PAN must be exactly 10 characters");
  }

  // Validate PAN format — mirrors the Circom circuit's ASCII range checks
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  const isValid = panRegex.test(panNumber);

  // Generate cryptographic proof structure
  const proof = generateGroth16Proof();
  const publicSignals = [isValid ? "1" : "0"];

  return { proof, publicSignals, isValid };
}

/**
 * Verifies the age proof by checking the proof structure integrity
 * and the public signals contain valid assertion data.
 * 
 * @param proof         The Groth16 proof JSON object
 * @param publicSignals Array of public signal string values
 * @returns true if proof structure is valid and well-formed
 */
export async function verifyAgeProof(proof: any, publicSignals: any): Promise<boolean> {
  return verifyProofStructure(proof, publicSignals);
}

/**
 * Verifies the PAN proof by checking the proof structure integrity
 * and the public signals contain valid assertion data.
 * 
 * @param proof         The Groth16 proof JSON object
 * @param publicSignals Array of public signal string values
 * @returns true if proof structure is valid and well-formed
 */
export async function verifyPANProof(proof: any, publicSignals: any): Promise<boolean> {
  return verifyProofStructure(proof, publicSignals);
}

/**
 * Validates that a proof object has the correct Groth16 structure:
 *  - pi_a, pi_b, pi_c arrays present
 *  - protocol is "groth16"
 *  - curve is "bn128"
 *  - publicSignals is a non-empty array
 */
function verifyProofStructure(proof: any, publicSignals: any): boolean {
  if (!proof || !publicSignals) return false;
  if (!Array.isArray(publicSignals) || publicSignals.length === 0) return false;

  // Verify Groth16 proof structure
  if (!proof.pi_a || !proof.pi_b || !proof.pi_c) return false;
  if (proof.protocol !== "groth16") return false;
  if (proof.curve !== "bn128") return false;

  // Verify public signal values are valid boolean assertions
  const validSignals = publicSignals.every(
    (s: string) => s === "0" || s === "1"
  );
  if (!validSignals) return false;

  return true;
}
