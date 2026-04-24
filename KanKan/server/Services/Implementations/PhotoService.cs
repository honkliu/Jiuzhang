using KanKan.API.Models.DTOs.Photo;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Implementations;
using KanKan.API.Services.Interfaces;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Utils;
using MongoDB.Driver;

namespace KanKan.API.Services.Implementations;

public class PhotoService
{
    private readonly IPhotoRepository _repository;
    private readonly string _webRootPath;
    private readonly string _uploadFolder;

    public PhotoService(IPhotoRepository repository, IWebHostEnvironment environment)
    {
        _repository = repository;
        _webRootPath = environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot");
        _uploadFolder = Path.Combine(_webRootPath, "uploads", "receipts");

        if (!Directory.Exists(_uploadFolder))
            Directory.CreateDirectory(_uploadFolder);
    }

    private static string BuildPublicImageUrl(string fileName)
        => $"/uploads/receipts/{Uri.EscapeDataString(fileName)}";

    private async Task<(string storedFileName, string filePath, string imageUrl)> SaveImageBytesAsync(string originalFileName, byte[] imageBytes)
    {
        var safeFileName = Path.GetFileName(originalFileName);
        var extension = Path.GetExtension(safeFileName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ".jpg";
        }

        var storedFileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var filePath = Path.Combine(_uploadFolder, storedFileName);
        await System.IO.File.WriteAllBytesAsync(filePath, imageBytes);
        return (storedFileName, filePath, BuildPublicImageUrl(storedFileName));
    }

    public async Task<PhotoResponse> UploadFormAsync(string ownerId, PhotoUploadFormRequest request)
    {
        if (request.File == null || request.File.Length == 0)
        {
            throw new ArgumentException("No file provided.");
        }

        byte[] imageBytes;
        await using (var stream = request.File.OpenReadStream())
        await using (var memoryStream = new MemoryStream())
        {
            await stream.CopyToAsync(memoryStream);
            imageBytes = memoryStream.ToArray();
        }

        var saved = await SaveImageBytesAsync(request.File.FileName, imageBytes);

        var photo = new PhotoAlbum
        {
            Id = $"photo_{Guid.NewGuid():N}",
            OwnerId = ownerId,
            FileName = saved.storedFileName,
            ContentType = request.File.ContentType,
            FileSize = request.File.Length,
            Base64Data = null,
            FilePath = saved.filePath,
            ImageUrl = saved.imageUrl,
            UploadedAt = DateTime.UtcNow,
            CapturedDate = request.CapturedDate,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            LocationName = request.LocationName,
            CameraModel = request.CameraModel,
            Width = request.Width,
            Height = request.Height,
            AssociatedReceiptIds = request.AssociatedReceiptIds ?? new(),
            Tags = request.Tags ?? new(),
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        await _repository.CreateAsync(photo);
        return PhotoDtosMapper.ToResponse(photo);
    }

    public async Task<PhotoResponse> UploadAsync(string ownerId, PhotoCreateRequest request)
    {
        string? base64Data = request.Base64Data;
        string? filePath = null;
        string? imageUrl = request.ImageUrl;
        string? storedFileName = null;

        if (!string.IsNullOrEmpty(base64Data))
        {
            byte[] imageBytes;
            try
            {
                string b64 = base64Data;
                if (b64.Contains(',')) b64 = b64.Split(',')[1];
                imageBytes = Convert.FromBase64String(b64);
            }
            catch
            {
                throw new ArgumentException("Invalid base64 data.");
            }

            var saved = await SaveImageBytesAsync(
                string.IsNullOrEmpty(request.FileName) ? $"photo{Path.GetExtension(request.ContentType)}" : request.FileName,
                imageBytes);
            storedFileName = saved.storedFileName;
            filePath = saved.filePath;
            imageUrl = saved.imageUrl;
            base64Data = null;
        }

        var photo = new PhotoAlbum
        {
            Id = $"photo_{Guid.NewGuid():N}",
            OwnerId = ownerId,
            FileName = storedFileName ?? $"{Guid.NewGuid():N}.jpg",
            ContentType = request.ContentType,
            FileSize = request.FileSize,
            Base64Data = base64Data,
            FilePath = filePath,
            ImageUrl = imageUrl,
            UploadedAt = DateTime.UtcNow,
            CapturedDate = request.CapturedDate,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            LocationName = request.LocationName,
            CameraModel = request.CameraModel,
            Width = request.Width,
            Height = request.Height,
            AssociatedReceiptIds = request.AssociatedReceiptIds ?? new(),
            Tags = request.Tags ?? new(),
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        await _repository.CreateAsync(photo);
        return PhotoDtosMapper.ToResponse(photo);
    }

    public async Task<PhotoUploadBatchResponse> UploadBatchAsync(string ownerId, PhotoUploadBatchRequest request)
    {
        var result = new PhotoUploadBatchResponse();
        var errors = new List<string>();

        foreach (var item in request.Photos)
        {
            try
            {
                var req = new PhotoCreateRequest
                {
                    FileName = item.FileName,
                    ContentType = item.ContentType,
                    FileSize = item.FileSize,
                    Base64Data = item.Base64Data,
                    CapturedDate = item.CapturedDate,
                    Latitude = item.Latitude,
                    Longitude = item.Longitude,
                    LocationName = item.LocationName,
                    CameraModel = item.CameraModel,
                    Width = item.Width,
                    Height = item.Height,
                    AssociatedReceiptIds = item.AssociatedReceiptIds,
                    Tags = item.Tags,
                    Notes = item.Notes,
                };
                var photo = await UploadAsync(ownerId, req);
                result.Photos.Add(photo);
                result.SuccessCount++;
            }
            catch (Exception ex)
            {
                errors.Add($"Failed to upload {item.FileName}: {ex.Message}");
                result.FailCount++;
            }
        }

        if (errors.Count > 0)
            result.Errors = errors;

        return result;
    }

    public async Task<PhotoResponse?> GetByIdAsync(string ownerId, string photoId)
    {
        var photo = await _repository.GetByIdAsync(photoId);
        return photo != null && photo.OwnerId == ownerId ? PhotoDtosMapper.ToResponse(photo) : null;
    }

    public async Task<List<PhotoResponse>> GetAllAsync(string ownerId)
    {
        var photos = await _repository.GetByOwnerIdAsync(ownerId);
        return photos.Select(PhotoDtosMapper.ToResponse).ToList();
    }

    public async Task<List<PhotoResponse>> GetByDateRangeAsync(string ownerId, DateTime startDate, DateTime endDate)
    {
        var photos = await _repository.GetByOwnerIdAndDatesAsync(ownerId, startDate, endDate);
        return photos.Select(PhotoDtosMapper.ToResponse).ToList();
    }

    public async Task<List<PhotoResponse>> GetByReceiptIdAsync(string ownerId, string receiptId)
    {
        var photos = await _repository.GetByReceiptIdAsync(receiptId);
        return photos
            .Where(p => p.OwnerId == ownerId)
            .Select(PhotoDtosMapper.ToResponse)
            .ToList();
    }

    public async Task<PhotoResponse> UpdateAsync(string ownerId, string photoId, PhotoUpdateRequest request)
    {
        var photo = await _repository.GetByIdAsync(photoId);
        if (photo == null || photo.OwnerId != ownerId)
            throw new KeyNotFoundException("Photo not found.");

        if (request.AssociatedReceiptIds != null) photo.AssociatedReceiptIds = request.AssociatedReceiptIds;
        if (request.Tags != null) photo.Tags = request.Tags;
        if (request.Notes != null) photo.Notes = request.Notes;
        if (request.CapturedDate != null) photo.CapturedDate = request.CapturedDate;
        if (request.Latitude != null) photo.Latitude = request.Latitude;
        if (request.Longitude != null) photo.Longitude = request.Longitude;
        photo.UpdatedAt = DateTime.UtcNow;

        await _repository.UpdateAsync(photo);
        return PhotoDtosMapper.ToResponse(photo);
    }

    public async Task DeleteAsync(string ownerId, string photoId)
    {
        var photo = await _repository.GetByIdAsync(photoId);
        if (photo == null || photo.OwnerId != ownerId)
            throw new KeyNotFoundException("Photo not found.");

        if (!string.IsNullOrEmpty(photo.FilePath) && System.IO.File.Exists(photo.FilePath))
            System.IO.File.Delete(photo.FilePath);

        await _repository.DeleteAsync(photoId);
    }

    public async Task<byte[]> DownloadAsync(string photoId)
    {
        var photo = await _repository.GetByIdAsync(photoId);
        if (photo == null) throw new KeyNotFoundException("Photo not found.");

        if (!string.IsNullOrEmpty(photo.FilePath) && System.IO.File.Exists(photo.FilePath))
            return await System.IO.File.ReadAllBytesAsync(photo.FilePath);

        if (!string.IsNullOrEmpty(photo.Base64Data))
        {
            string b64 = photo.Base64Data;
            if (b64.Contains(',')) b64 = b64.Split(',')[1];
            return Convert.FromBase64String(b64);
        }

        throw new InvalidOperationException("No data found for photo.");
    }
}
