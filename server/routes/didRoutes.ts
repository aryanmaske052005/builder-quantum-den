import { Router } from "express";
import { generateDID, getDIDForUser, resolveDID, storeDIDInSupabase } from "../did/didService";
import { getUserVCs, issueVerifiableCredential, revokeVC, storeVC, verifyVerifiableCredential, getVCById } from "../did/vcService";

export const didRouter = Router();

// Mock Auth Middleware based on headers
const requireAuth = (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "Unauthorized. Missing x-user-id header." });
  req.user = { id: userId, role: req.headers['x-user-role'] || 'user' };
  next();
};

didRouter.post("/generate", requireAuth, async (req: any, res) => {
  try {
    const { did, didDocument, publicKey, privateKey } = await generateDID(req.user.id);
    
    await storeDIDInSupabase(req.user.id, did, didDocument, publicKey);
    
    // We do NOT return the private key in API responses.
    res.json({ success: true, did, didDocument });
  } catch (error: any) {
    console.error("DID Generate Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate DID" });
  }
});

didRouter.get("/resolve/:did", async (req, res) => {
  try {
    const document = await resolveDID(req.params.did);
    res.json(document);
  } catch (error: any) {
    console.error("DID Resolve Error:", error);
    res.status(500).json({ error: error.message || "Failed to resolve DID" });
  }
});

didRouter.get("/user/:userId", async (req, res) => {
  try {
    const result = await getDIDForUser(req.params.userId);
    if (!result) return res.status(404).json({ error: "DID not found for user" });
    res.json(result);
  } catch (error: any) {
    console.error("Get User DID Error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch DID" });
  }
});

didRouter.post("/vc/issue", requireAuth, async (req: any, res) => {
  try {
    if (req.user.role === 'user') return res.status(403).json({ error: "Officers only." });

    const { holderUserId, credentialType, claims, expiryDays } = req.body;
    
    let issuerInfo = await getDIDForUser(req.user.id);
    if (!issuerInfo) {
      const generated = await generateDID(req.user.id);
      await storeDIDInSupabase(req.user.id, generated.did, generated.didDocument, generated.publicKey);
      issuerInfo = generated;
    }

    const holderInfo = await getDIDForUser(holderUserId);
    if (!holderInfo) return res.status(400).json({ error: "Holder does not have a DID." });

    const vc = await issueVerifiableCredential({
      issuerDID: issuerInfo.did,
      issuerPrivateKey: "mock-private-key-because-we-never-store-it", 
      holderDID: holderInfo.did,
      credentialType,
      claims,
      expiryDays: expiryDays || 365
    });

    await storeVC(holderUserId, vc, credentialType);

    res.json({ success: true, vc });
  } catch (error: any) {
    console.error("Issue VC Error:", error);
    res.status(500).json({ error: error.message || "Failed to issue VC" });
  }
});

didRouter.post("/vc/verify", async (req, res) => {
  try {
    const { vc } = req.body;
    if (!vc) return res.status(400).json({ error: "Missing VC" });

    const result = await verifyVerifiableCredential(vc);
    res.json(result);
  } catch (error: any) {
    console.error("Verify VC Error:", error);
    res.status(500).json({ error: error.message || "Failed to verify VC" });
  }
});

didRouter.get("/vc/user/:userId", async (req, res) => {
  try {
    const vcs = await getUserVCs(req.params.userId);
    res.json({ success: true, data: vcs });
  } catch (error: any) {
    console.error("Get VCs Error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch VCs" });
  }
});

didRouter.delete("/vc/:vcId/revoke", requireAuth, async (req: any, res) => {
  try {
    if (req.user.role === 'user') return res.status(403).json({ error: "Officers only." });
    
    await revokeVC(req.params.vcId);
    res.json({ success: true, message: "VC revoked successfully." });
  } catch (error: any) {
    console.error("Revoke VC Error:", error);
    res.status(500).json({ error: error.message || "Failed to revoke VC" });
  }
});

// Public VC Auto-Download Endpoint (for QR code scans)
didRouter.get("/vc/public/:vcId/download", async (req, res) => {
  try {
    const vcRecord = await getVCById(req.params.vcId);
    if (!vcRecord || vcRecord.is_revoked) {
      return res.status(404).send("Verifiable Credential not found or has been revoked.");
    }

    // Verify signature of the VC
    const verification = await verifyVerifiableCredential(vcRecord.vc_json);
    if (!verification.verified) {
      return res.status(400).send("Verification failed: " + (verification.error || "Invalid signature"));
    }

    // Set download headers to auto-download on phone/browser
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="vc_${vcRecord.credential_type}_${req.params.vcId.slice(0, 8)}.json"`);
    res.send(JSON.stringify(vcRecord.vc_json, null, 2));
  } catch (error: any) {
    console.error("Public VC Download Error:", error);
    res.status(500).send("Failed to retrieve or download credential: " + error.message);
  }
});
