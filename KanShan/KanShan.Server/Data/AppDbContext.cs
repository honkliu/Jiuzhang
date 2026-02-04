using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using System.Globalization;
using KanShan.Server.Domain.Entities;

namespace KanShan.Server.Data;

public sealed class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ConversationParticipant> ConversationParticipants => Set<ConversationParticipant>();
    public DbSet<ConversationReadState> ConversationReadStates => Set<ConversationReadState>();
    public DbSet<ChatMessage> Messages => Set<ChatMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // SQLite can't translate DateTimeOffset ordering well; store as ISO-8601 text for stable ordering.
        // This keeps dev DBs compatible and makes ORDER BY work.
        var dtoToString = new ValueConverter<DateTimeOffset, string>(
            v => v.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            v => DateTimeOffset.Parse(v, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind));

        var nullableDtoToString = new ValueConverter<DateTimeOffset?, string?>(
            v => v.HasValue ? v.Value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture) : null,
            v => string.IsNullOrWhiteSpace(v)
                ? null
                : DateTimeOffset.Parse(v, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind));

        foreach (var property in modelBuilder.Model
                     .GetEntityTypes()
                     .SelectMany(t => t.GetProperties()))
        {
            if (property.ClrType == typeof(DateTimeOffset))
            {
                property.SetValueConverter(dtoToString);
                property.SetColumnType("TEXT");
            }
            else if (property.ClrType == typeof(DateTimeOffset?))
            {
                property.SetValueConverter(nullableDtoToString);
                property.SetColumnType("TEXT");
            }
        }

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.UserName).HasMaxLength(64).IsRequired();
            entity.Property(x => x.DisplayName).HasMaxLength(128).IsRequired();
            entity.Property(x => x.PasswordHash).IsRequired();
            entity.HasIndex(x => x.UserName).IsUnique();
        });

        modelBuilder.Entity<Conversation>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Title).HasMaxLength(128);
            entity.HasIndex(x => x.CreatedAt);
        });

        modelBuilder.Entity<ConversationParticipant>(entity =>
        {
            entity.HasKey(x => new { x.ConversationId, x.UserId });

            entity.HasOne(x => x.Conversation)
                .WithMany(c => c.Participants)
                .HasForeignKey(x => x.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany(u => u.Conversations)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(x => x.UserId);
        });

        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Text).HasMaxLength(4000);
            entity.Property(x => x.ImageUrl).HasMaxLength(1024);
            entity.Property(x => x.ClientMessageId).HasMaxLength(64);

            entity.Property(x => x.IsRecalled).HasDefaultValue(false);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);

            entity.HasOne(x => x.Conversation)
                .WithMany(c => c.Messages)
                .HasForeignKey(x => x.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Sender)
                .WithMany(u => u.MessagesSent)
                .HasForeignKey(x => x.SenderUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(x => new { x.ConversationId, x.CreatedAt });
            entity.HasIndex(x => new { x.ConversationId, x.ClientMessageId });
            entity.HasIndex(x => new { x.ConversationId, x.IsDeleted, x.CreatedAt });
        });

        modelBuilder.Entity<ConversationReadState>(entity =>
        {
            entity.HasKey(x => new { x.ConversationId, x.UserId });

            entity.HasOne(x => x.Conversation)
                .WithMany()
                .HasForeignKey(x => x.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => new { x.ConversationId, x.LastReadAt });
        });
    }
}
