using System.Collections.Generic;
using MetadataExtractor;

namespace KanKan.API.Utils;

/// <summary>
/// Utility for reading EXIF metadata from image files.
/// Compatible with MetadataExtractor 2.8.1.
/// </summary>
public static class ExifReader
{
    public static Dictionary<string, object?> Read(string imagePath)
    {
        var result = new Dictionary<string, object?>();
        try
        {
            var directories = ImageMetadataReader.ReadMetadata(imagePath);
            foreach (var dir in directories)
            {
                foreach (var tag in dir.Tags)
                {
                    var key = tag.Name;
                    var val = tag.Description;
                    
                    switch (key)
                    {
                        case "Date/Time Original":
                            result["DateTimeOriginal"] = val;
                            break;
                        case "GPS Latitude":
                            result["Latitude"] = val;
                            break;
                        case "GPS Longitude":
                            result["Longitude"] = val;
                            break;
                        case "Make":
                            result["CameraMake"] = val;
                            break;
                        case "Model":
                            result["CameraModel"] = val;
                            break;
                        case "Image Width":
                        case "Image Height":
                            if (long.TryParse(val?.Replace("px", "").Trim(), out var pixels))
                                result[key == "Image Width" ? "Width" : "Height"] = pixels;
                            break;
                    }
                }
            }
        }
        catch
        {
            // Missing metadata is not an error
        }
        return result;
    }
}
