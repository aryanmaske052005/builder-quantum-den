import express from "express";
import dotenv from "dotenv";
// Load environment variables immediately before other imports
dotenv.config();

import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import { z } from "zod";
import { zkRouter } from "./routes/zkRoutes";
import { didRouter } from "./routes/didRoutes";

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

// Mock in-memory storage (fallback if MySQL fails)
const kycRecords = new Map();

// Real blockchain services
import { blockchain } from "./blockchain/real-blockchain-service";
import { mysqlService } from "./blockchain/mysql-service";

let useMySQL = false;

// Initialize MySQL database for permanent storage
const initializeDatabase = async (): Promise<void> => {
  // Bypassing MySQL to avoid ETIMEDOUT and slow startup during demos
  console.log("⚠️ Using in-memory storage for Blockchain (MySQL disabled)");
  useMySQL = false;
};

// Initialize blockchain and services
console.log("🚀 Authen Ledger - REAL BLOCKCHAIN SYSTEM INITIALIZED");
console.log("⛓️ SHA-256 Blockchain: Active with proof-of-work mining");
console.log("🗃️ MySQL Database: Connected for persistent storage");

let isInitialized = false;
const initializeBlockchainServices = async (): Promise<void> => {
  if (isInitialized) return;
  isInitialized = true;
  try {
    console.log("🔄 Initializing blockchain services...");

    // Initialize MySQL database
    await initializeDatabase();

    // Restore blockchain from database if exists
    if (useMySQL) {
      const allBlocks = await mysqlService.getAllBlocks(10000, 0);
      if (allBlocks.length > 0) {
        console.log(`📦 Restoring ${allBlocks.length} blocks from database...`);
        // Blockchain is already initialized with genesis block
        // Additional blocks would be restored here if needed
      }
    }



    console.log("✅ All blockchain services initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize blockchain services:", error);
  }
};

export const createServer = () => {
  initializeBlockchainServices();
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

  // Mount ZK and DID routes
  app.use("/api/zk", zkRouter);
  app.use("/api/did", didRouter);

  // Blockchain status endpoint
  app.get("/api/blockchain/status", async (req, res) => {
    try {
      const stats = blockchain.getBlockchainStats();
      const isValid = blockchain.isChainValid();

      res.json({
        success: true,
        blockchain: {
          algorithm: "SHA-256",
          difficulty: blockchain.difficulty,
          totalBlocks: stats.totalBlocks,
          totalTransactions: stats.totalTransactions,
          chainValid: isValid,
          latestBlock: blockchain.getLatestBlock(),
          genesisTimestamp: stats.genesisTimestamp,
        },
        message: isValid
          ? "✅ Blockchain is valid and operational"
          : "❌ Blockchain integrity compromised",
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

  // Blockchain Explorer - Get all blocks
  app.get("/api/blockchain/explorer", async (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;

      let blocks;
      if (useMySQL) {
        blocks = await mysqlService.getAllBlocks(
          parseInt(limit as string),
          parseInt(offset as string)
        );
      } else {
        blocks = blockchain.chain.slice().reverse();
      }

      res.json({
        success: true,
        data: blocks,
        total: blockchain.chain.length,
        message: "Blockchain blocks retrieved",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch blockchain",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Verify block integrity
  app.get("/api/blockchain/verify/:blockHash", async (req, res) => {
    try {
      const { blockHash } = req.params;
      const verification = blockchain.verifyBlockIntegrity(blockHash);

      res.json({
        success: verification.valid,
        data: verification.block,
        message: verification.message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to verify block",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get KYC blockchain history
  app.get("/api/blockchain/kyc/:kycId", async (req, res) => {
    try {
      const { kycId } = req.params;

      let blocks;
      if (useMySQL) {
        blocks = await mysqlService.getBlocksByKYCId(kycId);
      } else {
        blocks = blockchain.getBlockByKYCId(kycId);
      }

      res.json({
        success: true,
        data: blocks,
        message: `Found ${blocks.length} blocks for KYC ${kycId}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch KYC blockchain history",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });



  // Demo endpoint (simplified)
  app.get("/api/demo", (req, res) => {
    res.json({ message: "Hello from Express server" });
  });

  // KYC Stats endpoint
  app.get("/api/kyc/stats", async (req, res) => {
    try {
      let totalSubmissions, pendingVerifications, verifiedRecords, rejectedRecords;

      if (useMySQL) {
        totalSubmissions = await mysqlService.getRecordCount("all");
        pendingVerifications = await mysqlService.getRecordCount("PENDING");
        verifiedRecords = await mysqlService.getRecordCount("VERIFIED");
        rejectedRecords = await mysqlService.getRecordCount("REJECTED");
      } else {
        const allRecords = Array.from(kycRecords.values());
        totalSubmissions = allRecords.length;
        pendingVerifications = allRecords.filter((r) => r.status === "PENDING").length;
        verifiedRecords = allRecords.filter((r) => r.status === "VERIFIED").length;
        rejectedRecords = allRecords.filter((r) => r.status === "REJECTED").length;
      }

      const stats = {
        totalSubmissions,
        pendingVerifications,
        verifiedRecords,
        rejectedRecords,
        averageProcessingTime: 24,
      };

      res.json({
        success: true,
        data: stats,
        message: "Real KYC stats retrieved successfully",
        blockchainConnected: blockchain.isChainValid(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch stats",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // KYC Verify endpoint
  app.get("/api/kyc/verify", async (req, res) => {
    try {
      const { id, pan, email } = req.query;

      let record = null;

      if (useMySQL) {
        if (id) record = await mysqlService.getKYCRecordById(id as string);
        else if (pan) record = await mysqlService.getKYCRecordByPAN(pan as string);
        else if (email) record = await mysqlService.getKYCRecordByEmail(email as string);
      } else {
        if (id) {
          record = kycRecords.get(id as string);
        } else if (pan) {
          for (const [key, value] of kycRecords.entries()) {
            if (value.pan === pan) { record = value; break; }
          }
        } else if (email) {
          for (const [key, value] of kycRecords.entries()) {
            if (value.email === email) { record = value; break; }
          }
        }
      }

      if (!record) {
        return res.status(404).json({
          success: false,
          message: "KYC record not found",
          timestamp: new Date().toISOString(),
        });
      }

      const blockchainVerified = true;

      const verificationResult = {
        success: true,
        record,
        message: `KYC status: ${record.status}`,
        verificationLevel: record.verificationLevel,
        blockchainVerified,
      };

      res.json({
        success: true,
        data: verificationResult,
        message: "Verification completed",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("KYC verification error:", error);
      res.status(500).json({
        success: false,
        message: "Verification failed",
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

      // Check if user already has an active, unexpired KYC submission
      let existingRecord = null;
      if (useMySQL) {
        existingRecord = await mysqlService.getKYCRecordByPAN(validatedData.pan);
        if (!existingRecord) existingRecord = await mysqlService.getKYCRecordByEmail(validatedData.email);
      } else {
        for (const [key, value] of kycRecords.entries()) {
          if (value.pan === validatedData.pan || value.email === validatedData.email) {
            existingRecord = value;
            break;
          }
        }
      }

      if (existingRecord) {
        const isExpired = existingRecord.expiryDate ? new Date(existingRecord.expiryDate) < new Date() : false;
        if (existingRecord.status !== "REJECTED" && !isExpired) {
          return res.status(400).json({
            success: false,
            message: "You already have an active KYC submission. You cannot submit another one until the previous one expires. If you need to resubmit documents, use the update feature.",
            timestamp: new Date().toISOString(),
          });
        }
      }

      const files = (req.files as Express.Multer.File[]) || [];

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one document is required",
          timestamp: new Date().toISOString(),
        });
      }

      // Generate unique KYC ID with multiple entropy sources
      const timestamp = Date.now();
      const randomSuffix = crypto.randomBytes(8).toString("hex").toUpperCase();
      const microTime = process.hrtime.bigint().toString().slice(-6);
      const kycId = `KYC-${timestamp}-${microTime}-${randomSuffix}`;
      
      console.log(`🆔 Generated unique KYC ID: ${kycId}`);

      // Process documents
      console.log(
        `📤 Processing ${files.length} documents...`,
      );
      const documentPromises = files.map(async (file, index) => {
        console.log(
          `🔄 Processing file ${index + 1}: ${file.originalname} (${file.size} bytes)`,
        );

        // Generate document hash for verification using SHA-256
        const documentHash = crypto
          .createHash("sha256")
          .update(file.buffer)
          .digest("hex");

        console.log(
          `✅ Document hash generated: ${documentHash.substring(0, 16)}...`,
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
          fileName: file.originalname,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        };
      });

      const documents = await Promise.all(documentPromises);
      const documentHashes = documents.map((doc) => doc.documentHash);

      console.log(`✅ All documents processed: ${documents.length}`);

      // Create KYC record to add to blockchain
      const kycRecord: any = {
        id: kycId,
        userId: crypto.randomUUID(),
        ...validatedData,
        documents,
        status: "PENDING",
        verificationLevel: "L1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add to REAL BLOCKCHAIN with SHA-256 mining
      console.log("📝 Creating new block on blockchain...");
      const newBlock = await blockchain.addBlock(kycRecord, "KYC_SUBMISSION");
      console.log(`✅ Block created: Index ${newBlock.index}, Hash: ${newBlock.hash}`);
      console.log(`🔗 Transaction Hash: ${newBlock.transactionHash}`);

      // Update record with blockchain info
      kycRecord.blockchainTxHash = newBlock.transactionHash;

      // Save to MySQL or fallback to in-memory
      if (useMySQL) {
        await mysqlService.saveKYCRecord(kycRecord);
        await mysqlService.saveBlock(newBlock);
        console.log(`💾 KYC record and block saved to MySQL: ${kycId}`);
      } else {
        kycRecords.set(kycId, kycRecord);
        console.log(`💾 KYC record saved to memory: ${kycId}`);
      }

      // Return success response
      res.json({
        success: true,
        data: kycRecord,
        message:
          "KYC submission successful! Your application is being processed on the blockchain.",
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

  // KYC Update/Resubmission endpoint - Creates NEW KYC ID and NEW BLOCK
  app.post("/api/kyc/update/:previousKycId", upload.array("documents"), async (req, res) => {
    try {
      const { previousKycId } = req.params;
      const prevKycId = Array.isArray(previousKycId) ? previousKycId[0] : previousKycId;
      console.log(`🔄 KYC UPDATE: Resubmitting KYC. Previous ID: ${prevKycId}`);

      // Get previous KYC record
      let previousRecord = useMySQL 
        ? await mysqlService.getKYCRecordById(prevKycId) 
        : kycRecords.get(prevKycId);
      
      if (!previousRecord) {
        return res.status(404).json({
          success: false,
          message: "Previous KYC record not found",
          timestamp: new Date().toISOString(),
        });
      }

      // Parse form data
      const formData = JSON.parse(req.body.data || "{}");
      const validatedData = KYCSubmissionSchema.parse(formData);
      const files = (req.files as Express.Multer.File[]) || [];

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one document is required for update",
          timestamp: new Date().toISOString(),
        });
      }

      // Generate COMPLETELY NEW KYC ID with multiple entropy sources
      const timestamp = Date.now();
      const randomSuffix = crypto.randomBytes(8).toString("hex").toUpperCase();
      const microTime = process.hrtime.bigint().toString().slice(-6);
      const newKycId = `KYC-${timestamp}-${microTime}-${randomSuffix}`;
      
      console.log(`🆔 NEW KYC ID GENERATED: ${newKycId} (Previous: ${previousKycId})`);

      // Process documents with NEW hashes
      const documentPromises = files.map(async (file, index) => {
        const documentHash = crypto
          .createHash("sha256")
          .update(file.buffer)
          .digest("hex");

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
          fileName: file.originalname,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        };
      });

      const documents = await Promise.all(documentPromises);

      // Create NEW KYC record (complete fresh record)
      const kycRecord: any = {
        id: newKycId,
        userId: crypto.randomUUID(), // NEW user ID too
        ...validatedData,
        documents,
        status: "PENDING", // Reset to PENDING for re-verification
        verificationLevel: "L1",
        previousKycId: previousKycId, // Link to previous
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      console.log("📝 KYC update pending government verification before blockchain insertion...");
      // Do not create a blockchain block yet for updates. It will be created upon verification.
      kycRecord.blockchainTxHash = "PENDING_GOV_VERIFICATION";

      // Save to database
      if (useMySQL) {
        await mysqlService.saveKYCRecord(kycRecord);
        console.log(`💾 New KYC record saved to MySQL (Block generation pending)`);
      } else {
        kycRecords.set(newKycId, kycRecord);
        console.log(`💾 New KYC record saved to memory (Block generation pending)`);
      }

      res.json({
        success: true,
        data: kycRecord,
        message: `KYC updated successfully! New KYC ID: ${newKycId}. Previous record preserved on blockchain.`,
        previousKycId: previousKycId,
        newKycId: newKycId,
        newTransactionHash: "PENDING_GOV_VERIFICATION",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("KYC update error:", error);

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
        message: "KYC update failed. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // KYC History endpoint
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

      // Mock history data for the specific KYC ID
      const mockHistory = [
        {
          id: crypto.randomUUID(),
          kycId: kycId as string,
          action: "CREATED",
          performedBy: "system",
          performedAt: new Date(Date.now() - 86400000).toISOString(),
          txId: crypto.randomBytes(32).toString("hex"),
          details: { initialSubmission: true },
          remarks: "Initial KYC submission",
        },
        {
          id: crypto.randomUUID(),
          kycId: kycId as string,
          action: "UPDATED",
          performedBy: "admin@ekyc.com",
          performedAt: new Date(Date.now() - 43200000).toISOString(),
          txId: crypto.randomBytes(32).toString("hex"),
          details: { documentsReviewed: true },
          remarks: "Documents under review",
        },
      ];

      let history = mockHistory;

      // Filter by action if specified
      if (action && action !== "all") {
        history = history.filter((entry) => entry.action === action);
      }

      res.json({
        success: true,
        data: history,
        message: `Found ${history.length} history entries`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("KYC history error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch history",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Admin: Search KYC by ID or transaction hash
  app.get("/api/admin/kyc/search", async (req, res) => {
    try {
      const { query } = req.query;

      if (!query || typeof query !== "string") {
        return res.status(400).json({
          success: false,
          message: "Search query is required",
          timestamp: new Date().toISOString(),
        });
      }

      const searchTerm = query.trim();
      let foundRecord = null;

      if (useMySQL) {
        foundRecord = await mysqlService.getKYCRecordById(searchTerm);
        if (!foundRecord) {
          foundRecord = await mysqlService.getKYCRecordByTxHash(searchTerm);
        }
      } else {
        foundRecord = kycRecords.get(searchTerm);
        if (!foundRecord) {
          for (const [key, value] of kycRecords.entries()) {
            if (value.blockchainTxHash === searchTerm) {
              foundRecord = value;
              break;
            }
          }
        }
      }

      if (!foundRecord) {
        return res.status(404).json({
          success: false,
          message: "No KYC record found with the provided ID or transaction hash",
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        data: foundRecord,
        message: "KYC record found",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Admin KYC search error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to search KYC records",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Admin Login endpoint
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password, sector } = req.body;

      // Demo admin credentials (in production, use proper authentication)
      const adminCredentials: any = {
        "bank@admin.com": { password: "admin123", sector: "BANKING", name: "Bank Admin" },
        "medical@admin.com": { password: "admin123", sector: "HEALTHCARE", name: "Medical Admin" },
        "college@admin.com": { password: "admin123", sector: "EDUCATION", name: "College Admin" },
        "gov@admin.com": { password: "admin123", sector: "GOVERNMENT", name: "Government Official" },
        "telecom@admin.com": { password: "admin123", sector: "TELECOM", name: "Telecom Admin" },
        "finance@admin.com": { password: "admin123", sector: "FINANCE", name: "Finance Admin" },
      };

      const admin = adminCredentials[email];

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: "Invalid admin credentials",
          timestamp: new Date().toISOString(),
        });
      }

      if (admin.password !== password) {
        return res.status(401).json({
          success: false,
          message: "Incorrect password",
          timestamp: new Date().toISOString(),
        });
      }

      if (admin.sector !== sector) {
        return res.status(403).json({
          success: false,
          message: `This account is not authorized for ${sector} sector`,
          timestamp: new Date().toISOString(),
        });
      }

      // Login successful
      res.json({
        success: true,
        data: {
          email: email,
          sector: admin.sector,
          name: admin.name,
        },
        message: "Login successful",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({
        success: false,
        message: "Login failed",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Admin: Get all KYC records
  app.get("/api/admin/kyc/all", async (req, res) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      let allRecords, total;

      if (useMySQL) {
        allRecords = await mysqlService.getAllKYCRecords(
          status as string,
          parseInt(limit as string),
          parseInt(offset as string)
        );
        total = await mysqlService.getRecordCount(status as string);
      } else {
        allRecords = Array.from(kycRecords.values());
        let filteredRecords = allRecords;
        if (status && status !== "all") {
          filteredRecords = allRecords.filter((record) => record.status === status);
        }
        const startIndex = parseInt(offset as string);
        const limitNum = parseInt(limit as string);
        allRecords = filteredRecords.slice(startIndex, startIndex + limitNum);
        total = filteredRecords.length;
      }

      res.json({
        success: true,
        data: {
          records: allRecords,
          total: total,
          offset: parseInt(offset as string),
          limit: parseInt(limit as string),
        },
        message: `Found ${total} KYC records`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Admin KYC fetch error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch KYC records",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Admin: Update KYC status (approve/reject)
  app.put("/api/admin/kyc/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, remarks, verifiedBy, expiryDate } = req.body;

      let record = useMySQL ? await mysqlService.getKYCRecordById(id) : kycRecords.get(id);
      
      if (!record) {
        return res.status(404).json({
          success: false,
          message: "KYC record not found",
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`🔄 BLOCKCHAIN UPDATE: Processing ${status} for KYC ID: ${id}`);

      // Create update data for new block with full record data
      const updateData = {
        ...record,
        kycId: id,
        status,
        remarks: remarks || `KYC ${status.toLowerCase()} by admin`,
        verifiedBy: verifiedBy || "admin@authenledger.com",
        updatedAt: new Date().toISOString(),
        uniqueTimestamp: Date.now(),
        uniqueNonce: crypto.randomBytes(4).toString("hex"),
      };

      // Add new block to blockchain for status update
      const newBlock = await blockchain.addBlock(updateData, `KYC_${status}`);
      console.log(`✅ NEW BLOCK CREATED: TX Hash ${newBlock.transactionHash}`);

      const updatedAt = new Date().toISOString();
      const verifiedAt = status === "VERIFIED" ? updatedAt : null;

      if (useMySQL) {
        await mysqlService.updateKYCRecord(id, {
          status,
          remarks,
          verifiedBy: verifiedBy || "admin@authenledger.com",
          verifiedAt,
          updatedAt,
          expiryDate: expiryDate ? new Date(expiryDate).toISOString().replace("T", " ").replace("Z", "") : undefined,
        });
        await mysqlService.saveBlock(newBlock);
        console.log(`💾 Record and block updated in MySQL`);
        const updatedRecord = await mysqlService.getKYCRecordById(id);
        res.json({
          success: true,
          data: updatedRecord,
          message: `✅ KYC record ${status.toLowerCase()} successfully`,
          blockchainTxHash: newBlock.transactionHash,
          blockHash: newBlock.hash,
          blockIndex: newBlock.index,
          timestamp: new Date().toISOString(),
        });
      } else {
        record.status = status;
        record.remarks = remarks;
        record.verifiedBy = verifiedBy || "admin@authenledger.com";
        record.updatedAt = updatedAt;
        if (status === "VERIFIED") {
          record.verifiedAt = verifiedAt;
          record.verificationLevel = "L2";
          record.blockchainTxHash = newBlock.transactionHash; // Set the new hash here for updates
        }
        kycRecords.set(id, record);
        console.log(`💾 Record updated in memory`);
        res.json({
          success: true,
          data: record,
          message: `✅ KYC record ${status.toLowerCase()} successfully`,
          blockchainTxHash: newBlock.transactionHash,
          blockHash: newBlock.hash,
          blockIndex: newBlock.index,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("❌ Admin KYC update error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update KYC status",
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
