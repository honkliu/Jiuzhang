using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Webp;

namespace KanKan.API.Utils;

public static class ImageResizer
{
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
