namespace KanShan.Server.Storage;

public sealed class FileStorageOptions
{
    public string UploadsPath { get; set; } = "App_Data/uploads";
    public string PublicBasePath { get; set; } = "/uploads";
}
