using System.Collections.Concurrent;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


/// <summary>
/// Optional reader for a locally installed copy of Heroes of Might and Magic III (full game or the free 1999 demo).
/// Art is decoded on demand from the player's own LOD archives and is only ever served to loopback clients,
/// so nothing copyrighted is bundled with or redistributed by City of Towers.
/// </summary>
public sealed class H3Assets
{
    private readonly Dictionary<string, (string File, int Offset, int Size, int CSize)> _index = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte[]?> _cache = new(StringComparer.OrdinalIgnoreCase);
    public string? DataPath { get; }
    public bool Available => _index.Count > 0;

    public H3Assets(IConfiguration config, ILogger<H3Assets> log)
    {
        var path = config["Homm:H3DataPath"] ?? config["H3:DataPath"];
        if (string.IsNullOrWhiteSpace(path))
            path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CityOfTowers", "h3data");
        if (!Directory.Exists(path)) return;
        DataPath = path;
        // Later archives override earlier ones (expansion content wins over base content).
        var lods = Directory.GetFiles(path, "*.lod").OrderBy(f => Path.GetFileName(f).ToLowerInvariant() switch
        {
            "h3bitmap.lod" => 0, "h3sprite.lod" => 1, _ => 2
        });
        foreach (var lod in lods)
        {
            try { IndexLod(lod); }
            catch (Exception e) { log.LogWarning(e, "Could not read {Lod}", lod); }
        }
        log.LogInformation("Heroes III data: {Count} entries from {Path}", _index.Count, path);
    }

    private void IndexLod(string file)
    {
        using var fs = File.OpenRead(file);
        using var br = new BinaryReader(fs);
        if (Encoding.ASCII.GetString(br.ReadBytes(4)) != "LOD\0") return;
        br.ReadUInt32();
        var count = br.ReadInt32();
        fs.Position = 92;
        for (var i = 0; i < count; i++)
        {
            var name = Encoding.Latin1.GetString(br.ReadBytes(16)).Split('\0')[0];
            var offset = br.ReadInt32(); var size = br.ReadInt32(); br.ReadInt32(); var csize = br.ReadInt32();
            _index[name] = (file, offset, size, csize);
        }
    }

    public static bool IsLocal(HttpContext ctx) =>
        ctx.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip);

    public bool Has(string name) => _index.ContainsKey(name);

    private byte[]? Raw(string name)
    {
        if (!_index.TryGetValue(name, out var e)) return null;
        using var fs = File.OpenRead(e.File);
        fs.Position = e.Offset;
        var buf = new byte[e.CSize > 0 ? e.CSize : e.Size];
        fs.ReadExactly(buf);
        if (e.CSize == 0) return buf;
        using var z = new ZLibStream(new MemoryStream(buf), CompressionMode.Decompress);
        var outBuf = new byte[e.Size];
        z.ReadExactly(outBuf);
        return outBuf;
    }

    // ------------------------------------------------------------------ PCX

    public byte[]? PcxPng(string name) => _cache.GetOrAdd("pcx:" + name, _ =>
    {
        var d = Raw(name.EndsWith(".pcx", StringComparison.OrdinalIgnoreCase) ? name : name + ".pcx");
        if (d == null) return null;
        int size = BitConverter.ToInt32(d, 0), w = BitConverter.ToInt32(d, 4), h = BitConverter.ToInt32(d, 8);
        var rgba = new byte[w * h * 4];
        if (size == w * h * 3)
        {
            for (var i = 0; i < w * h; i++)
            {
                rgba[i * 4] = d[12 + i * 3 + 2]; rgba[i * 4 + 1] = d[12 + i * 3 + 1]; rgba[i * 4 + 2] = d[12 + i * 3]; rgba[i * 4 + 3] = 255;
            }
        }
        else
        {
            var pal = 12 + w * h;
            for (var i = 0; i < w * h; i++)
            {
                var c = d[12 + i];
                rgba[i * 4] = d[pal + c * 3]; rgba[i * 4 + 1] = d[pal + c * 3 + 1]; rgba[i * 4 + 2] = d[pal + c * 3 + 2];
                // index 0 in interface bitmaps is the transparency key (cyan)
                rgba[i * 4 + 3] = (byte)(c == 0 && d[pal] == 0 && d[pal + 1] == 255 && d[pal + 2] == 255 ? 0 : 255);
            }
        }
        return Png.Encode(w, h, rgba);
    });

    // ------------------------------------------------------------------ DEF

    private static readonly (byte R, byte G, byte B, byte A)[] Special =
    {
        (0, 255, 255, 0), (255, 150, 255, 64), (255, 100, 255, 64), (255, 50, 255, 128),
        (255, 0, 255, 128), (255, 255, 0, 0), (180, 0, 255, 128), (0, 255, 0, 64)
    };

    private sealed record Def(int W, int H, List<(int Group, List<int> Frames)> Groups, List<byte[]> FramesRgba);

    private readonly ConcurrentDictionary<string, Def?> _defs = new(StringComparer.OrdinalIgnoreCase);

    private Def? LoadDef(string name) => _defs.GetOrAdd(name, n =>
    {
        var d = Raw(n.EndsWith(".def", StringComparison.OrdinalIgnoreCase) ? n : n + ".def");
        if (d == null) return null;
        int W = BitConverter.ToInt32(d, 4), H = BitConverter.ToInt32(d, 8), blocks = BitConverter.ToInt32(d, 12);
        var pal = new (byte R, byte G, byte B, byte A)[256];
        for (var i = 0; i < 256; i++)
        {
            var c = (d[16 + i * 3], d[17 + i * 3], d[18 + i * 3]);
            pal[i] = (c.Item1, c.Item2, c.Item3, (byte)255);
            if (i < 8 && Special[i].R == c.Item1 && Special[i].G == c.Item2 && Special[i].B == c.Item3)
                pal[i] = (0, 0, 0, Special[i].A);
        }
        var p = 16 + 768;
        var groups = new List<(int, List<int>)>();
        var frames = new List<byte[]>();
        var seen = new Dictionary<int, int>();
        for (var b = 0; b < blocks; b++)
        {
            int id = BitConverter.ToInt32(d, p), count = BitConverter.ToInt32(d, p + 4);
            p += 16 + count * 13;
            var list = new List<int>();
            for (var f = 0; f < count; f++)
            {
                var off = BitConverter.ToInt32(d, p + f * 4);
                if (!seen.TryGetValue(off, out var idx))
                {
                    idx = frames.Count; seen[off] = idx;
                    frames.Add(DecodeFrame(d, off, W, H, pal));
                }
                list.Add(idx);
            }
            p += count * 4;
            groups.Add((id, list));
        }
        return new Def(W, H, groups, frames);
    });

    private static byte[] DecodeFrame(byte[] d, int off, int W, int H, (byte R, byte G, byte B, byte A)[] pal)
    {
        int fmt = BitConverter.ToInt32(d, off + 4);
        int fw = BitConverter.ToInt32(d, off + 8), fh = BitConverter.ToInt32(d, off + 12);
        int w = BitConverter.ToInt32(d, off + 16), h = BitConverter.ToInt32(d, off + 20);
        int lm = BitConverter.ToInt32(d, off + 24), tm = BitConverter.ToInt32(d, off + 28);
        // some DEFs have frames bigger than the header size; clip to header
        var rgba = new byte[W * H * 4];
        var data = off + 32;
        var row = new byte[Math.Max(w, 1)];

        void Put(int y)
        {
            var ty = y + tm;
            if (ty < 0 || ty >= H) return;
            for (var x = 0; x < w; x++)
            {
                var tx = x + lm;
                if (tx < 0 || tx >= W) continue;
                var c = pal[row[x]];
                var o = (ty * W + tx) * 4;
                rgba[o] = c.R; rgba[o + 1] = c.G; rgba[o + 2] = c.B; rgba[o + 3] = c.A;
            }
        }

        for (var y = 0; y < h; y++)
        {
            switch (fmt)
            {
                case 0:
                    Array.Copy(d, data + y * w, row, 0, w);
                    break;
                case 1:
                {
                    var q = data + BitConverter.ToInt32(d, data + y * 4);
                    for (var x = 0; x < w;)
                    {
                        int code = d[q++], len = d[q++] + 1;
                        for (var k = 0; k < len && x < w; k++, x++) row[x] = code == 0xFF ? d[q + k] : (byte)code;
                        if (code == 0xFF) q += len;
                    }
                    break;
                }
                default: // formats 2 and 3 share the segment encoding; 3 stores one offset per 32px block
                {
                    var stride = fmt == 3 ? Math.Max(1, w / 32) : 1;
                    var q = data + BitConverter.ToUInt16(d, data + y * 2 * stride);
                    for (var x = 0; x < w;)
                    {
                        var b = d[q++];
                        int code = b >> 5, len = (b & 31) + 1;
                        for (var k = 0; k < len && x < w; k++, x++) row[x] = code == 7 ? d[q + k] : (byte)code;
                        if (code == 7) q += len;
                    }
                    break;
                }
            }
            Put(y);
        }
        return rgba;
    }

    /// <summary>All frames laid out in a grid of full-size cells; frame i is at (i % cols, i / cols).</summary>
    public byte[]? DefSheetPng(string name) => _cache.GetOrAdd("defpng:" + name, _ =>
    {
        var def = LoadDef(name);
        if (def == null || def.FramesRgba.Count == 0) return null;
        var cols = Cols(def);
        var rows = (def.FramesRgba.Count + cols - 1) / cols;
        int SW = cols * def.W, SH = rows * def.H;
        var sheet = new byte[SW * SH * 4];
        for (var i = 0; i < def.FramesRgba.Count; i++)
        {
            int cx = i % cols * def.W, cy = i / cols * def.H;
            for (var y = 0; y < def.H; y++)
                Array.Copy(def.FramesRgba[i], y * def.W * 4, sheet, ((cy + y) * SW + cx) * 4, def.W * 4);
        }
        return Png.Encode(SW, SH, sheet);
    });

    public string? DefJson(string name)
    {
        var def = LoadDef(name);
        if (def == null) return null;
        return JsonSerializer.Serialize(new
        {
            w = def.W, h = def.H, cols = Cols(def), count = def.FramesRgba.Count,
            groups = def.Groups.ToDictionary(g => g.Group.ToString(), g => g.Frames)
        });
    }

    private static int Cols(Def def) => Math.Max(1, Math.Min(def.FramesRgba.Count, 4096 / Math.Max(1, def.W)));

    public static IResult Serve(HttpContext ctx, H3Assets h3, Func<byte[]?> get, string type)
    {
        if (!h3.Available || !IsLocal(ctx)) return Results.NotFound();
        byte[]? bytes;
        try { bytes = get(); }
        catch { bytes = null; }
        if (bytes == null) return Results.NotFound();
        ctx.Response.Headers.CacheControl = "private, max-age=86400";
        return Results.Bytes(bytes, type);
    }
}

/// <summary>Minimal RGBA PNG encoder.</summary>
internal static class Png
{
    private static readonly uint[] Crc = Enumerable.Range(0, 256).Select(n =>
    {
        var c = (uint)n;
        for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
        return c;
    }).ToArray();

    public static byte[] Encode(int w, int h, byte[] rgba)
    {
        using var ms = new MemoryStream();
        ms.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var ihdr = new byte[13];
        WriteBE(ihdr, 0, (uint)w); WriteBE(ihdr, 4, (uint)h);
        ihdr[8] = 8; ihdr[9] = 6;
        Chunk(ms, "IHDR", ihdr);
        using (var raw = new MemoryStream())
        {
            using (var z = new ZLibStream(raw, CompressionLevel.Fastest, leaveOpen: true))
            {
                for (var y = 0; y < h; y++)
                {
                    z.WriteByte(0);
                    z.Write(rgba, y * w * 4, w * 4);
                }
            }
            Chunk(ms, "IDAT", raw.ToArray());
        }
        Chunk(ms, "IEND", Array.Empty<byte>());
        return ms.ToArray();
    }

    private static void Chunk(Stream s, string type, byte[] data)
    {
        var len = new byte[4]; WriteBE(len, 0, (uint)data.Length); s.Write(len);
        var t = Encoding.ASCII.GetBytes(type); s.Write(t); s.Write(data);
        var c = 0xFFFFFFFFu;
        foreach (var b in t) c = Crc[(c ^ b) & 0xFF] ^ (c >> 8);
        foreach (var b in data) c = Crc[(c ^ b) & 0xFF] ^ (c >> 8);
        var crc = new byte[4]; WriteBE(crc, 0, c ^ 0xFFFFFFFFu); s.Write(crc);
    }

    private static void WriteBE(byte[] b, int o, uint v)
    {
        b[o] = (byte)(v >> 24); b[o + 1] = (byte)(v >> 16); b[o + 2] = (byte)(v >> 8); b[o + 3] = (byte)v;
    }
}
