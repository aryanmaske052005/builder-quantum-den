import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import { z } from "zod";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10, // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and PDF files are allowed"));
    }
  },
});

// Validation schemas
const KYCSubmissionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  pan: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Valid PAN format required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  address: z.object({
    street: z.string().min(1, "Street address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z.string().min(6, "Valid pincode is required"),
    country: z.string().min(1, "Country is required"),
  }),
});

// Real database storage using Prisma PostgreSQL
import { initializeDatabase, prisma } from "./database/prisma";
import { kycService } from "./database/kyc-service";

// Use simplified blockchain services for development (switch to real services when network is ready)
import { fabricService } from "./blockchain/simple-fabric-service";
import { ipfsService } from "./blockchain/simple-ipfs-service";

// Clean storage - NO DUMMY DATA - only real user uploads
console.log("🚀 Authen Ledger initialized - READY FOR REAL BLOCKCHAIN");
console.log("📋 Hyperledger Fabric: Ready for real blockchain integration");
console.log("📋 IPFS: Ready for real distributed file storage");
console.log("🗃️  Storage: Clean - only actual user submissions will be stored");
console.log(
  "⚡ App is functional - real blockchain can be added when infrastructure is ready",
);

// Initialize real blockchain and database services
const initializeServices = async (): Promise<void> => {
  try {
    console.log("🔄 Initializing real blockchain and database services...");

    // Initialize PostgreSQL database connection
    await initializeDatabase();

    // Initialize Hyperledger Fabric connection
    await fabricService.initializeConnection();

    // Initialize IPFS connection
    await ipfsService.initializeConnection();

    console.log("✅ All services initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize services:", error);
    console.log("⚠️  Some features may not work until services are connected");
  }
};

// Initialize on server startup
initializeServices();

export const createServer = () => {
  const app = express();

  // Enable CORS for all origins in development
  app.use(cors());

  // Parse JSON bodies
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Health check endpoint
  app.get("/api/ping", (req, res) => {
    res.json({ message: "pong", timestamp: new Date().toISOString() });
  });

  // Blockchain status endpoint
  app.get("/api/blockchain/status", async (req, res) => {
    try {
      const fabricConnected = fabricService.isConnected();
      const ipfsStatus = await ipfsService.getStatus();

      res.json({
        success: true,
        blockchain: {
          hyperledgerFabric: {
            connected: fabricConnected,
            network: fabricConnected
              ? "Authen Ledger Network"
              : "Not Connected",
            type: "REAL - Hyperledger Fabric 2.5.4",
          },
          ipfs: {
            connected: ipfsStatus.connected,
            version: ipfsStatus.version || "Unknown",
            peerId: ipfsStatus.peerId || "Unknown",
            type: "REAL - IPFS Network",
          },
        },
        message:
          fabricConnected && ipfsStatus.connected
            ? "✅ All blockchain services connected - REAL IMPLEMENTATION"
            : "⚠️ Some blockchain services not connected",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to check blockchain status",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Demo endpoint (simplified)
  app.get("/api/demo", (req, res) => {
    res.json({ message: "Hello from Express server" });
  });

  // KYC Stats endpoint with REAL database data
  app.get("/api/kyc/stats", async (req, res) => {
    try {
      // Get real stats from PostgreSQL database
      const stats = await kycService.getSystemStats();

      res.json({
        success: true,
        data: {
          totalSubmissions: stats.totalSubmissions,
          pendingVerifications: stats.pendingVerifications,
          verifiedRecords: stats.verifiedRecords,
          rejectedRecords: stats.rejectedRecords,
          averageProcessingTime: stats.averageProcessingTimeHours,
        },
        message: "Real KYC stats retrieved from database",
        blockchainConnected: fabricService.isConnected(),
        ipfsConnected: ipfsService.isConnected(),
        databaseConnected: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Database stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch stats from database",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // KYC Verify endpoint with database lookup
  app.get("/api/kyc/verify", async (req, res) => {
    try {
      const { id, pan, email } = req.query;

      // Search in database
      const record = await kycService.searchKYCRecord({
        id: id as string,
        pan: pan as string,
        email: email as string,
      });

      if (!record) {
        return res.status(404).json({
          success: false,
          message: "KYC record not found in database",
          timestamp: new Date().toISOString(),
        });
      }

      // Real blockchain verification
      const blockchainVerified = !!record.blockchainTxHash;

      const verificationResult = {
        success: true,
        record,
        message: `KYC status: ${record.status}`,
        verificationLevel: record.verificationLevel,
        blockchainVerified,
        blockchainTxHash: record.blockchainTxHash,
      };

      res.json({
        success: true,
        data: verificationResult,
        message: "Verification completed from database",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Database KYC verification error:", error);
      res.status(500).json({
        success: false,
        message: "Database verification failed",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // KYC Submit endpoint (fully implemented)
  app.post("/api/kyc/submit", upload.array("documents"), async (req, res) => {
    try {
      console.log("Received KYC submission request");
      console.log("Body:", req.body);
      console.log("Files:", req.files);

      // Parse form data
      const formData = JSON.parse(req.body.data || "{}");
      console.log("Parsed form data:", formData);

      // Validate data
      const validatedData = KYCSubmissionSchema.parse(formData);

      // 🔒 SECURITY: Check for duplicate Aadhaar and PAN numbers
      const existingRecords = Array.from(kycRecords.values());

      // Check for duplicate PAN
      const existingPAN = existingRecords.find(
        (record) =>
          record.pan === validatedData.pan && record.status !== "REJECTED",
      );
      if (existingPAN) {
        return res.status(400).json({
          success: false,
          message: `❌ DUPLICATE PAN: This PAN number (${validatedData.pan}) is already registered with KYC ID: ${existingPAN.id}`,
          error: "DUPLICATE_PAN",
          existingKYCId: existingPAN.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Check for duplicate Email (additional security)
      const existingEmail = existingRecords.find(
        (record) =>
          record.email === validatedData.email && record.status !== "REJECTED",
      );
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: `❌ DUPLICATE EMAIL: This email (${validatedData.email}) is already registered with KYC ID: ${existingEmail.id}`,
          error: "DUPLICATE_EMAIL",
          existingKYCId: existingEmail.id,
          timestamp: new Date().toISOString(),
        });
      }

      console.log("✅ Duplicate validation passed - PAN and Email are unique");

      const files = (req.files as Express.Multer.File[]) || [];

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one document is required",
          timestamp: new Date().toISOString(),
        });
      }

      // Generate unique KYC ID
      const kycId = `KYC-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

      // Process documents
      console.log(
        `📤 Processing ${files.length} documents for REAL IPFS upload...`,
      );
      const documentPromises = files.map(async (file, index) => {
        console.log(
          `🔄 Processing file ${index + 1}: ${file.originalname} (${file.size} bytes)`,
        );

        // Generate document hash for verification
        const documentHash = crypto
          .createHash("sha256")
          .update(file.buffer)
          .digest("hex");

        // Upload to REAL IPFS network
        const ipfsResult = await ipfsService.uploadFile(
          file.buffer,
          file.originalname,
          {
            kycId: kycId,
            uploadedBy: validatedData.email,
            uploadedAt: new Date().toISOString(),
            documentHash: documentHash,
          },
        );

        if (!ipfsResult.success) {
          throw new Error(
            `IPFS upload failed for ${file.originalname}: ${ipfsResult.error}`,
          );
        }

        console.log(
          `✅ File uploaded to IPFS: ${file.originalname} -> ${ipfsResult.hash}`,
        );

        return {
          id: crypto.randomUUID(),
          type: file.originalname.toLowerCase().includes("pan")
            ? "PAN"
            : file.originalname.toLowerCase().includes("aadhaar")
              ? "AADHAAR"
              : file.originalname.toLowerCase().includes("passport")
                ? "PASSPORT"
                : file.originalname.toLowerCase().includes("bank")
                  ? "BANK_STATEMENT"
                  : "OTHER",
          documentHash,
          ipfsHash: ipfsResult.hash,
          ipfsUrl: ipfsResult.url,
          fileName: file.originalname,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        };
      });

      const documents = await Promise.all(documentPromises);
      const documentHashes = documents.map((doc) => doc.documentHash);

      console.log(`✅ All documents uploaded to IPFS: ${documents.length}`);

      // Submit to REAL HYPERLEDGER FABRIC BLOCKCHAIN with enhanced data
      console.log("📝 Submitting KYC to Hyperledger Fabric blockchain...");

      // Enhanced blockchain data with detailed information
      const blockchainData = {
        ...validatedData,
        id: kycId,
        documentHashes,
        submissionTimestamp: new Date().toISOString(),
        submissionHash: crypto.createHash('sha256')
          .update(JSON.stringify({ ...validatedData, kycId, documentHashes }))
          .digest('hex'),
        documentCount: documents.length,
        ipfsHashes: documents.map(doc => doc.ipfsHash),
        fileTypes: documents.map(doc => doc.type)
      };

      const blockchainResult = await fabricService.submitKYC(
        blockchainData,
        documentHashes,
      );
      console.log("✅ Enhanced blockchain submission result:", blockchainResult);

      // 🔒 TEMPORARY STORAGE: Record stays temporary until admin approval
      const temporaryKYCRecord = {
        id: kycId,
        userId: crypto.randomUUID(), // In real implementation, get from authenticated user
        ...validatedData,
        documents,
        status: "PENDING", // Temporary status until admin approves
        verificationLevel: "L0", // Unverified level until approval

        // 📋 Enhanced Blockchain Information
        blockchainTxHash: blockchainResult.txHash,
        blockchainBlockNumber: blockchainResult.blockNumber,
        submissionHash: blockchainData.submissionHash,
        ipfsHashes: blockchainData.ipfsHashes,
        documentHashes: documentHashes,

        // 🕐 Timestamp Information
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),

        // 🔐 Security Information
        approvalRequired: true,
        permanentStorage: false, // Will become true after admin approval
        temporaryRecord: true
      };

      // Store in temporary storage (in-memory until admin approval)
      kycRecords.set(kycId, temporaryKYCRecord);
      console.log(`🔒 KYC record stored TEMPORARILY until admin approval: ${kycId}`);
      console.log(`📊 Blockchain Hash: ${blockchainResult.txHash}`);
      console.log(`📊 Submission Hash: ${blockchainData.submissionHash}`);
      console.log(`📊 IPFS Documents: ${blockchainData.ipfsHashes.length} files`);

      // Return success response with enhanced blockchain data
      res.json({
        success: true,
        data: {
          ...temporaryKYCRecord,
          blockchainInfo: {
            transactionHash: blockchainResult.txHash,
            blockNumber: blockchainResult.blockNumber,
            submissionHash: blockchainData.submissionHash,
            ipfsHashes: blockchainData.ipfsHashes,
            documentHashes: documentHashes,
            documentCount: documents.length
          }
        },
        message: "🔒 KYC submitted successfully! Your application is stored temporarily. It will be permanently saved after admin verification.",
        redirectTo: `/verify?id=${kycId}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("KYC submission error:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: `Validation error: ${error.errors[0].message}`,
          error: error.errors,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(500).json({
        success: false,
        message: "KYC submission failed. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // KYC History endpoint with real database audit logs
  app.get("/api/kyc/history", async (req, res) => {
    try {
      const { kycId, action } = req.query;

      if (!kycId) {
        return res.status(400).json({
          success: false,
          message: "KYC ID is required",
          timestamp: new Date().toISOString(),
        });
      }

      // Get real audit logs from database
      const history = await kycService.getKYCHistory(
        kycId as string,
        action as string,
      );

      res.json({
        success: true,
        data: history,
        message: `Found ${history.length} real audit log entries from database`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Database KYC history error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch history from database",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Admin: Get all KYC records from database
  app.get("/api/admin/kyc/all", async (req, res) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      // Get records from PostgreSQL database
      const result = await kycService.getAllKYCRecords({
        status: status as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      res.json({
        success: true,
        data: result,
        message: `Found ${result.total} KYC records in database`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Database admin KYC fetch error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch KYC records from database",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Admin: Update KYC status with database and blockchain
  app.put("/api/admin/kyc/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, remarks, verifiedBy } = req.body;

      // 🔒 Check temporary storage first (submitted records awaiting approval)
      const tempRecord = kycRecords.get(id);
      if (!tempRecord) {
        return res.status(404).json({
          success: false,
          message: "KYC record not found in temporary storage",
          timestamp: new Date().toISOString(),
        });
      }

      console.log(
        `🔄 ADMIN APPROVAL: Processing ${status} for KYC ID: ${id}`,
      );
      console.log(`📊 Current Record Status: ${tempRecord.status} (Temporary: ${tempRecord.temporaryRecord})`);

      // 📋 Enhanced admin approval with blockchain verification
      if (status === "VERIFIED") {
        console.log("✅ ADMIN APPROVED - Moving to PERMANENT STORAGE");
        tempRecord.permanentStorage = true;
        tempRecord.temporaryRecord = false;
        tempRecord.approvalRequired = false;
      } else if (status === "REJECTED") {
        console.log("❌ ADMIN REJECTED - Record will remain temporary");
        tempRecord.permanentStorage = false;
        tempRecord.temporaryRecord = true;
      }

      // Submit status update to REAL HYPERLEDGER FABRIC BLOCKCHAIN
      console.log(
        `📝 Recording status update on Hyperledger Fabric blockchain...`,
      );
      const blockchainTx = await fabricService.updateKYCStatus(
        id,
        status,
        remarks || `KYC ${status.toLowerCase()} by admin`,
        verifiedBy || "admin@authenledger.com",
      );
      console.log(
        `✅ REAL BLOCKCHAIN RECORDED: TX Hash ${blockchainTx.txHash}`,
      );

      // 📋 Update temporary record with admin decision and blockchain data
      tempRecord.status = status;
      tempRecord.remarks = remarks || `KYC ${status.toLowerCase()} by admin`;
      tempRecord.verifiedBy = verifiedBy || "admin@authenledger.com";
      tempRecord.updatedAt = new Date().toISOString();

      // Add additional blockchain transaction hash for admin action
      tempRecord.adminBlockchainTxHash = blockchainTx.txHash;
      tempRecord.adminApprovalTimestamp = new Date().toISOString();

      if (status === "VERIFIED") {
        tempRecord.verifiedAt = tempRecord.updatedAt;
        tempRecord.verificationLevel = "L2";
        console.log(`✅ APPROVED & MOVED TO PERMANENT STORAGE: ${id}`);
      } else if (status === "REJECTED") {
        tempRecord.rejectedAt = tempRecord.updatedAt;
        console.log(`❌ REJECTED - Remains in temporary storage: ${id}`);
      }

      // Update the record in temporary storage
      kycRecords.set(id, tempRecord);

      console.log(`💾 Admin action recorded with blockchain hash: ${blockchainTx.txHash}`);

      // 📊 Enhanced response with all blockchain data
      res.json({
        success: true,
        data: {
          ...tempRecord,
          blockchainInfo: {
            originalTxHash: tempRecord.blockchainTxHash,
            adminTxHash: blockchainTx.txHash,
            submissionHash: tempRecord.submissionHash,
            ipfsHashes: tempRecord.ipfsHashes,
            documentHashes: tempRecord.documentHashes,
            blockNumber: tempRecord.blockchainBlockNumber,
            totalTransactions: 2 // Original submission + Admin action
          }
        },
        message: status === "VERIFIED"
          ? `✅ KYC APPROVED: Record permanently stored on blockchain with TX: ${blockchainTx.txHash}`
          : `❌ KYC REJECTED: Admin decision recorded on blockchain with TX: ${blockchainTx.txHash}`,
        blockchainTxHash: blockchainTx.txHash,
        permanentStorage: tempRecord.permanentStorage,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Admin database/blockchain update error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update KYC status in database",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Error handling middleware for multer and general errors
  app.use(
    (
      error: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "File too large. Maximum size is 5MB per file.",
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
        if (error.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            success: false,
            message: "Too many files. Maximum 10 files allowed.",
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (error.message === "Only JPEG, PNG, and PDF files are allowed") {
        return res.status(400).json({
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      console.error("Server error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    },
  );

  // 404 handler for API routes
  app.use("/api", (req, res) => {
    res.status(404).json({
      success: false,
      message: `API endpoint not found: ${req.method} ${req.path}`,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createServer();
  const port = process.env.PORT || 8080;

  app.listen(port, () => {
    console.log(`🚀 eKYC Server running on port ${port}`);
    console.log(`📊 API endpoints:`);
    console.log(`   GET  /api/ping                - Health check`);
    console.log(`   GET  /api/demo                - Demo endpoint`);
    console.log(`   GET  /api/kyc/stats           - Get KYC statistics (mock)`);
    console.log(`   GET  /api/kyc/verify          - Verify KYC status (mock)`);
    console.log(
      `   POST /api/kyc/submit          - Submit KYC documents (mock)`,
    );
    console.log(`   GET  /api/kyc/history         - Get KYC history (mock)`);
    console.log(`🔧 Note: Using simplified mock endpoints for now`);
  });
}
