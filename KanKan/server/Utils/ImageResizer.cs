using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Jpeg;

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
        using var image = Image.Load(imageData);
        return GetScaledDimensions(image.Width, image.Height, maxDimension);
    }

    /// <summary>
    /// Resize to exact dimensions and encode using the provided content type or extension.
    /// </summary>
    public static byte[] ResizeToExact(byte[] imageData, int width, int height, string? contentTypeOrExtension, int quality = 85)
    {
        using var image = Image.Load(imageData);
        image.Mutate(x => x.Resize(width, height));

        using var ms = new MemoryStream();
        var hint = (contentTypeOrExtension ?? string.Empty).ToLowerInvariant();
        if (hint.Contains("jpeg") || hint.Contains("jpg") || hint.EndsWith(".jpg") || hint.EndsWith(".jpeg"))
        {
            image.SaveAsJpeg(ms, new JpegEncoder { Quality = quality });
        }
        else if (hint.Contains("webp") || hint.EndsWith(".webp"))
        {
            image.SaveAsWebp(ms, new WebpEncoder { Quality = quality, Method = WebpEncodingMethod.BestQuality });
        }
        else
        {
            image.SaveAsPng(ms, new PngEncoder());
        }

        return ms.ToArray();
    }

    /// <summary>
    /// Re-encode arbitrary image bytes into a standard PNG payload for downstream model compatibility.
    /// </summary>
    public static byte[] NormalizeToPng(byte[] imageData)
    {
        using var image = Image.Load(imageData);
        StripMetadata(image.Metadata);

        var pngMetadata = image.Metadata.GetPngMetadata();
        pngMetadata.TextData.Clear();

        using var ms = new MemoryStream();
        image.SaveAsPng(ms, new PngEncoder());
        return ms.ToArray();
    }

    public static byte[] CreateContactSheet(IReadOnlyList<byte[]> images, int cellSize = 768)
    {
        if (images.Count == 0)
            throw new ArgumentException("At least one image is required.", nameof(images));

        var columns = images.Count == 1 ? 1 : 2;
        var rows = (int)Math.Ceiling(images.Count / (double)columns);
        using var sheet = new Image<SixLabors.ImageSharp.PixelFormats.Rgba32>(
            columns * cellSize,
            rows * cellSize,
            SixLabors.ImageSharp.Color.White);

        for (var index = 0; index < images.Count; index++)
        {
            using var image = Image.Load<SixLabors.ImageSharp.PixelFormats.Rgba32>(images[index]);
            image.Mutate(context => context.Resize(new ResizeOptions
            {
                Size = new Size(cellSize, cellSize),
                Mode = ResizeMode.Pad,
                PadColor = SixLabors.ImageSharp.Color.White,
            }));
            var x = index % columns * cellSize;
            var y = index / columns * cellSize;
            sheet.Mutate(context => context.DrawImage(image, new Point(x, y), 1f));
        }

        using var stream = new MemoryStream();
        sheet.SaveAsPng(stream, new PngEncoder());
        return stream.ToArray();
    }

    private static void StripMetadata(ImageMetadata metadata)
    {
        metadata.ExifProfile = null;
        metadata.IccProfile = null;
        metadata.IptcProfile = null;
        metadata.XmpProfile = null;
        metadata.CicpProfile = null;
    }

    /// <summary>
    /// Resize image to max width/height while keeping aspect ratio
    /// </summary>
    public static byte[] ResizeImage(byte[] imageData, int maxWidth, int maxHeight, int quality = 85)
    {
        using var image = Image.Load(imageData);

        // Calculate new size keeping aspect ratio
        var ratioX = (double)maxWidth / image.Width;
        var ratioY = (double)maxHeight / image.Height;
        var ratio = Math.Min(ratioX, ratioY);

        var newWidth = (int)(image.Width * ratio);
        var newHeight = (int)(image.Height * ratio);

        // Resize
        image.Mutate(x => x.Resize(newWidth, newHeight));

        // Save as WebP
        using var ms = new MemoryStream();
        var encoder = new WebpEncoder
        {
            Quality = quality,
            Method = WebpEncodingMethod.BestQuality
        };
        image.SaveAsWebp(ms, encoder);

        return ms.ToArray();
    }

    /// <summary>
    /// Generate thumbnail (128x128 WebP)
    /// </summary>
    public static byte[] GenerateThumbnail(byte[] imageData)
    {
        return ResizeImage(imageData, 128, 128, quality: 75);
    }
}
