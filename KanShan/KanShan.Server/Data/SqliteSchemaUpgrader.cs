using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Data;

namespace KanShan.Server.Data;

public static class SqliteSchemaUpgrader
{
    public static void UpgradeIfNeeded(AppDbContext db, ILogger logger)
    {
        if (!db.Database.IsSqlite())
        {
            return;
        }

        try
        {
            // New table used for unread/read tracking.
            db.Database.ExecuteSqlRaw(
                "CREATE TABLE IF NOT EXISTS \"ConversationReadStates\" (" +
                "\"ConversationId\" TEXT NOT NULL, " +
                "\"UserId\" TEXT NOT NULL, " +
                "\"LastReadMessageId\" TEXT NULL, " +
                "\"LastReadAt\" TEXT NOT NULL, " +
                "\"UpdatedAt\" TEXT NOT NULL, " +
                "PRIMARY KEY (\"ConversationId\", \"UserId\")" +
                ");");

            db.Database.ExecuteSqlRaw(
                "CREATE INDEX IF NOT EXISTS \"IX_ConversationReadStates_UserId\" ON \"ConversationReadStates\" (\"UserId\");");

            db.Database.ExecuteSqlRaw(
                "CREATE INDEX IF NOT EXISTS \"IX_ConversationReadStates_ConversationId_LastReadAt\" ON \"ConversationReadStates\" (\"ConversationId\", \"LastReadAt\");");

            // Add recall/delete columns to Messages table for older dev DBs.
            TryAddColumn(db, "Messages", "IsRecalled", "INTEGER NOT NULL DEFAULT 0", logger);
            TryAddColumn(db, "Messages", "RecalledAt", "TEXT NULL", logger);
            TryAddColumn(db, "Messages", "RecalledByUserId", "TEXT NULL", logger);
            TryAddColumn(db, "Messages", "IsDeleted", "INTEGER NOT NULL DEFAULT 0", logger);
            TryAddColumn(db, "Messages", "DeletedAt", "TEXT NULL", logger);
            TryAddColumn(db, "Messages", "DeletedByUserId", "TEXT NULL", logger);

            // Helpful indexes (safe to create if missing).
            db.Database.ExecuteSqlRaw(
                "CREATE INDEX IF NOT EXISTS \"IX_Messages_ConversationId_IsDeleted_CreatedAt\" ON \"Messages\" (\"ConversationId\", \"IsDeleted\", \"CreatedAt\");");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SQLite schema upgrade skipped/failed (dev DB may be old)");
        }
    }

    private static void TryAddColumn(AppDbContext db, string table, string column, string definition, ILogger logger)
    {
        if (SqliteColumnExists(db, table, column, logger))
        {
            return;
        }

        db.Database.ExecuteSqlRaw(
            "ALTER TABLE \"" + table + "\" ADD COLUMN \"" + column + "\" " + definition + ";");
    }

    private static bool SqliteColumnExists(AppDbContext db, string table, string column, ILogger logger)
    {
        IDbConnection? connection = null;
        var shouldClose = false;
        try
        {
            connection = db.Database.GetDbConnection();
            shouldClose = connection.State == ConnectionState.Closed;
            if (shouldClose)
            {
                connection.Open();
            }

            using var cmd = connection.CreateCommand();
            cmd.CommandText = "PRAGMA table_info(\"" + table + "\");";

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
                var name = reader.GetString(1);
                if (string.Equals(name, column, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Failed to read SQLite schema for {Table}.{Column}", table, column);
            return false;
        }
        finally
        {
            if (shouldClose && connection is not null)
            {
                try { connection.Close(); } catch { }
            }
        }
    }
}
