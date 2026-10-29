using SkiaSharp;

namespace KanKan.API.Utils;

public static class ImageResizer
{
    /// <summary>
    /// Calculate new size so the longer side equals maxDimension while keeping aspect ratio.
    /// </summary>
    public static (int width, int height) GetScaledDimensions(int width, int height, int maxDimension)
    {
        if (width <= 0 || height <= 0)
        {
            return (maxDimension, maxDimension);
        }

        var maxSide = Math.Max(width, height);
        var scale = (double)maxDimension / maxSide;
        var newWidth = Math.Max(1, (int)Math.Round(width * scale));
        var newHeight = Math.Max(1, (int)Math.Round(height * scale));

        return (newWidth, newHeight);
    }

    /// <summary>
    /// Calculate new size from image bytes so the longer side equals maxDimension.
    /// </summary>
    public static (int width, int height) GetScaledDimensions(byte[] imageData, int maxDimension)
    {
        using var codec = SKCodec.Create(new MemoryStream(imageData))
            ?? throw new InvalidDataException("Unsupported or corrupt image data.");
        return GetScaledDimensions(codec.Info.Width, codec.Info.Height, maxDimension);
    }

    /// <summary>
    /// Resize to exact dimensions and encode using the provided content type or extension.
    /// </summary>
    public static byte[] ResizeToExact(byte[] imageData, int width, int height, string? contentTypeOrExtension, int quality = 85)
    {
        using var source = Decode(imageData);
        using var resized = Resize(source, width, height);

        var hint = (contentTypeOrExtension ?? string.Empty).ToLowerInvariant();
        if (hint.Contains("jpeg") || hint.Contains("jpg"))
        {
            return Encode(resized, p => p.Encode(new SKJpegEncoderOptions(quality, SKJpegEncoderDownsample.Downsample420, SKJpegEncoderAlphaOption.Ignore)));
        }
        if (hint.Contains("webp"))
        {
            return Encode(resized, p => p.Encode(new SKWebpEncoderOptions(SKWebpEncoderCompression.Lossy, quality)));
        }
        return Encode(resized, p => p.Encode(SKPngEncoderOptions.Default));
    }

    /// <summary>
    /// Re-encode arbitrary image bytes into a standard PNG payload for downstream model compatibility.
    /// </summary>
    public static byte[] NormalizeToPng(byte[] imageData)
    {
        // Re-encoding from decoded pixels drops EXIF/ICC/IPTC/XMP and PNG text chunks.
        using var image = Decode(imageData);
        return Encode(image, p => p.Encode(SKPngEncoderOptions.Default));
    }

    /// <summary>
    /// Resize image to max width/height while keeping aspect ratio
    /// </summary>
    public static byte[] ResizeImage(byte[] imageData, int maxWidth, int maxHeight, int quality = 85)
    {
        using var image = Decode(imageData);

        // Calculate new size keeping aspect ratio
        var ratioX = (double)maxWidth / image.Width;
        var ratioY = (double)maxHeight / image.Height;
        var ratio = Math.Min(ratioX, ratioY);

        var newWidth = Math.Max(1, (int)(image.Width * ratio));
        var newHeight = Math.Max(1, (int)(image.Height * ratio));

        using var resized = Resize(image, newWidth, newHeight);
        return Encode(resized, p => p.Encode(new SKWebpEncoderOptions(SKWebpEncoderCompression.Lossy, quality)));
    }

    /// <summary>
    /// Generate thumbnail (128x128 WebP)
    /// </summary>
    public static byte[] GenerateThumbnail(byte[] imageData)
    {
        return ResizeImage(imageData, 128, 128, quality: 75);
    }

    private static SKBitmap Decode(byte[] imageData)
    {
        using var codec = SKCodec.Create(new MemoryStream(imageData))
            ?? throw new InvalidDataException("Unsupported or corrupt image data.");
        return SKBitmap.Decode(codec) ?? throw new InvalidDataException("Unsupported or corrupt image data.");
    }

    private static SKBitmap Resize(SKBitmap source, int width, int height)
    {
        // Mipmaps avoid aliasing on large downscales; cubic is sharper when enlarging.
        var sampling = width < source.Width || height < source.Height
            ? new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear)
            : new SKSamplingOptions(SKCubicResampler.Mitchell);
        var info = new SKImageInfo(width, height, SKColorType.Rgba8888, source.AlphaType == SKAlphaType.Opaque ? SKAlphaType.Opaque : SKAlphaType.Premul);
        var target = new SKBitmap(info);
        using var canvas = new SKCanvas(target);
        using var image = SKImage.FromBitmap(source);
        canvas.Clear(SKColors.Transparent);
        canvas.DrawImage(image, new SKRect(0, 0, width, height), sampling);
        return target;
    }

    private static byte[] Encode(SKBitmap bitmap, Func<SKPixmap, SKData?> encode)
    {
        using var pixmap = bitmap.PeekPixels();
        using var data = encode(pixmap) ?? throw new InvalidOperationException("Image encoding failed.");
        return data.ToArray();
    }
}
