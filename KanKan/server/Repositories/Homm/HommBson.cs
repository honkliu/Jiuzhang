using System.IO.Compression;
using System.Text;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Bson.Serialization.Serializers;

namespace KanKan.API.Repositories.Homm;

/// <summary>BSON mapping conventions for the HoMM entities (registered once at startup).</summary>
public static class HommBson
{
    public const string EntityNamespace = "KanKan.API.Models.Entities.Homm";
    private static int _registered;

    public static void Register()
    {
        if (Interlocked.Exchange(ref _registered, 1) == 1) return;
        var pack = new ConventionPack
        {
            new IgnoreExtraElementsConvention(true),
            new EnumRepresentationConvention(BsonType.String),
            new GuidAsStringConvention(),
        };
        ConventionRegistry.Register("HommEntities", pack, t => t.Namespace == EntityNamespace);
    }

    private sealed class GuidAsStringConvention : ConventionBase, IMemberMapConvention
    {
        private static readonly GuidSerializer Guid = new(BsonType.String);

        public void Apply(BsonMemberMap memberMap)
        {
            if (memberMap.MemberType == typeof(Guid))
                memberMap.SetSerializer(Guid);
            else if (memberMap.MemberType == typeof(Guid?))
                memberMap.SetSerializer(new NullableSerializer<Guid>(Guid));
        }
    }
}

/// <summary>
/// Stores large strings (the map and fog JSON) as gzip-compressed binary. Plain strings are still
/// read for robustness. <see cref="PlainMode"/> writes uncompressed strings, used for cheap change detection.
/// </summary>
public sealed class HommCompressedStringSerializer : SerializerBase<string>
{
    [ThreadStatic] internal static bool PlainMode;

    public override string Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args)
    {
        var reader = context.Reader;
        switch (reader.GetCurrentBsonType())
        {
            case BsonType.Null:
                reader.ReadNull();
                return "";
            case BsonType.String:
                return reader.ReadString();
            default:
                var bytes = reader.ReadBinaryData().Bytes;
                using (var input = new MemoryStream(bytes))
                using (var gz = new GZipStream(input, CompressionMode.Decompress))
                using (var sr = new StreamReader(gz, Encoding.UTF8))
                    return sr.ReadToEnd();
        }
    }

    public override void Serialize(BsonSerializationContext context, BsonSerializationArgs args, string value)
    {
        value ??= "";
        if (PlainMode)
        {
            context.Writer.WriteString(value);
            return;
        }
        using var output = new MemoryStream();
        using (var gz = new GZipStream(output, CompressionLevel.Fastest, leaveOpen: true))
            gz.Write(Encoding.UTF8.GetBytes(value));
        context.Writer.WriteBinaryData(new BsonBinaryData(output.ToArray(), BsonBinarySubType.Binary));
    }
}

/// <summary>Thrown by <see cref="HommDb.SaveChangesAsync"/> when a game document changed since it was loaded.</summary>
public sealed class HommConcurrencyException : Exception
{
    public HommConcurrencyException(string message) : base(message) { }
}
