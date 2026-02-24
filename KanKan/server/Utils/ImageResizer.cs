using SixLabors.ImageSharp;
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
    /// Resize so the longer side equals maxDimension while keeping aspect ratio.
    /// </summary>
    public static byte[] ResizeToMaxDimensionPng(byte[] imageData, int maxDimension)
    {
        using var image = Image.Load(imageData);

        var maxSide = Math.Max(image.Width, image.Height);
        var scale = maxSide == 0 ? 1.0 : (double)maxDimension / maxSide;
        var newWidth = Math.Max(1, (int)Math.Round(image.Width * scale));
        var newHeight = Math.Max(1, (int)Math.Round(image.Height * scale));

        image.Mutate(x => x.Resize(newWidth, newHeight));

        using var ms = new MemoryStream();
        image.Save(ms, new PngEncoder());
        return ms.ToArray();
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
