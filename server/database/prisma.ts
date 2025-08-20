import { PrismaClient } from "@prisma/client";

// Create global Prisma client instance
declare global {
  var prisma: PrismaClient | undefined;
}

// Use global instance in development to prevent multiple connections
const prisma =
  globalThis.prisma ||
  new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

// Initialize database connection
export const initializeDatabase = async (): Promise<void> => {
  try {
    console.log("🔄 Connecting to Prisma PostgreSQL database...");

    // Test the connection
    await prisma.$connect();
    console.log("✅ Database connection established successfully");

    // Initialize system stats if they don't exist
    await initializeSystemStats();
  } catch (error) {
    console.error("❌ Failed to connect to database:", error);
    throw new Error(
      `Database connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// Initialize system statistics
const initializeSystemStats = async (): Promise<void> => {
  try {
    const stats = await prisma.systemStats.findUnique({
      where: { id: "system_stats" },
    });

    if (!stats) {
      await prisma.systemStats.create({
        data: {
          id: "system_stats",
          totalSubmissions: 0,
          pendingVerifications: 0,
          verifiedRecords: 0,
          rejectedRecords: 0,
          averageProcessingTimeHours: 0,
        },
      });
      console.log("📊 System statistics initialized");
    }
  } catch (error) {
    console.warn("⚠️  Could not initialize system stats:", error);
  }
};

// Update system statistics based on current records
export const updateSystemStats = async (): Promise<void> => {
  try {
    const [totalSubmissions, pendingRecords, verifiedRecords, rejectedRecords] =
      await Promise.all([
        prisma.kYCRecord.count(),
        prisma.kYCRecord.count({ where: { status: "PENDING" } }),
        prisma.kYCRecord.count({ where: { status: "VERIFIED" } }),
        prisma.kYCRecord.count({ where: { status: "REJECTED" } }),
      ]);

    // Calculate average processing time for verified records
    const verifiedWithTimes = await prisma.kYCRecord.findMany({
      where: {
        status: "VERIFIED",
        verifiedAt: { not: null },
      },
      select: {
        createdAt: true,
        verifiedAt: true,
      },
    });

    let averageProcessingTimeHours = 0;
    if (verifiedWithTimes.length > 0) {
      const totalHours = verifiedWithTimes.reduce((sum, record) => {
        if (record.verifiedAt) {
          const diffMs =
            record.verifiedAt.getTime() - record.createdAt.getTime();
          return sum + diffMs / (1000 * 60 * 60); // Convert to hours
        }
        return sum;
      }, 0);
      averageProcessingTimeHours = totalHours / verifiedWithTimes.length;
    }

    await prisma.systemStats.upsert({
      where: { id: "system_stats" },
      update: {
        totalSubmissions,
        pendingVerifications: pendingRecords,
        verifiedRecords,
        rejectedRecords,
        averageProcessingTimeHours,
      },
      create: {
        id: "system_stats",
        totalSubmissions,
        pendingVerifications: pendingRecords,
        verifiedRecords,
        rejectedRecords,
        averageProcessingTimeHours,
      },
    });

    console.log("📊 System statistics updated successfully");
  } catch (error) {
    console.error("❌ Error updating system stats:", error);
  }
};

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log("🔌 Database connection closed");
  } catch (error) {
    console.error("❌ Error closing database connection:", error);
  }
};

export { prisma };
export default prisma;
