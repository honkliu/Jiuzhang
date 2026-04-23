using KanKan.API.Models.Entities;
using KanKan.API.Models.DTOs.Receipt;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Repositories.Implementations;
using KanKan.API.Services.Interfaces;

namespace KanKan.API.Services.Implementations;

/// <summary>
/// Phase 5 增强: 新增 Level 0 匹配 (MedicalRecordNumber 精确匹配).
/// 匹配优先级:
///   Level 0: MedicalRecordNumber 精确匹配 (最高优先级)
///   Level 1: OutpatientNumber 精确匹配 via photo tags
///   Level 2: Hospital + Patient name match within ±3 days
///   Level 3: Hospital name match within ±7 days
/// </summary>
public class AutoAssociateService : IAutoAssociateService
{
    private readonly IReceiptRepository _receiptRepo;
    private readonly IPhotoRepository _photoRepo;
    private readonly IMedicalRecordIndexRepository? _medicalRecordIndexRepo;

    public AutoAssociateService(IReceiptRepository receiptRepo, IPhotoRepository photoRepo, IMedicalRecordIndexRepository? medicalRecordIndexRepo = null)
    {
        _receiptRepo = receiptRepo;
        _photoRepo = photoRepo;
        _medicalRecordIndexRepo = medicalRecordIndexRepo;
    }

    public async Task<AutoAssociateMatch?> TryAssociatePhotoAsync(string ownerId, string photoId, string receiptId)
    {
        var receipt = await _receiptRepo.GetByIdAsync(receiptId);
        if (receipt == null) return null;

        var photo = await _photoRepo.GetByIdAsync(photoId);
        if (photo == null) return null;

        if (receipt.Type != ReceiptType.Medical) return null;

        return new AutoAssociateMatch
        {
            ReceiptId = receipt.Id,
            ReceiptType = receipt.Type,
            MatchLevel = "Manual",
            ReceiptAmount = receipt.TotalAmount,
            ReceiptDate = receipt.ReceiptDate,
            HospitalName = receipt.HospitalName,
            PatientName = receipt.PatientName,
            OutpatientNumber = receipt.OutpatientNumber,
        };
    }

    public async Task<List<AutoAssociateResult>> AutoAssociateAllAsync(string ownerId)
    {
        var results = new List<AutoAssociateResult>();
        var receipts = await _receiptRepo.GetByOwnerIdAsync(ownerId, ReceiptType.Medical);
        var photos = await _photoRepo.GetByOwnerIdAsync(ownerId);

        foreach (var photo in photos)
        {
            if (photo.AssociatedReceiptIds.Count > 0)
            {
                results.Add(new AutoAssociateResult
                {
                    PhotoId = photo.Id,
                    Matched = true,
                    ReceiptId = photo.AssociatedReceiptIds[0],
                    MatchLevel = "AlreadyAssociated",
                });
                continue;
            }

            AutoAssociateResult? bestMatch = null;

            // ── Phase 5 新增: Level 0 — MedicalRecordNumber 精确匹配 ──
            if (bestMatch == null)
            {
                foreach (var receipt in receipts)
                {
                    if (!string.IsNullOrEmpty(receipt.MedicalRecordNumber))
                    {
                        var mrnMatch = photo.Tags.Any(t =>
                            !string.IsNullOrEmpty(t) &&
                            !string.IsNullOrEmpty(receipt.MedicalRecordNumber) &&
                            t.IndexOf(receipt.MedicalRecordNumber, StringComparison.OrdinalIgnoreCase) >= 0);

                        if (mrnMatch)
                        {
                            bestMatch = new AutoAssociateResult
                            {
                                PhotoId = photo.Id,
                                Matched = true,
                                ReceiptId = receipt.Id,
                                MatchLevel = "MedicalRecordNumber",
                            };
                            break;
                        }
                    }
                }
            }

            // Level 1: OutpatientNumber exact match via photo tags
            if (bestMatch == null)
            {
                foreach (var receipt in receipts)
                {
                    if (string.IsNullOrEmpty(receipt.OutpatientNumber)) continue;
                    var tagMatch = photo.Tags.Any(t =>
                        !string.IsNullOrEmpty(t) &&
                        t.IndexOf(receipt.OutpatientNumber!, StringComparison.OrdinalIgnoreCase) >= 0);
                    if (tagMatch)
                    {
                        bestMatch = new AutoAssociateResult
                        {
                            PhotoId = photo.Id,
                            Matched = true,
                            ReceiptId = receipt.Id,
                            MatchLevel = "OutpatientNumber",
                        };
                        break;
                    }
                }
            }

            // Level 2: Hospital + Patient name match within ±3 days
            if (bestMatch == null)
            {
                foreach (var receipt in receipts)
                {
                    if (string.IsNullOrEmpty(receipt.HospitalName) || string.IsNullOrEmpty(receipt.PatientName)) continue;
                    if (string.IsNullOrEmpty(photo.LocationName)) continue;
                    if (!receipt.ReceiptDate.HasValue) continue;
                    var dateMatch = photo.UploadedAt.Date >= receipt.ReceiptDate.Value.Date.AddDays(-3)
                        && photo.UploadedAt.Date <= receipt.ReceiptDate.Value.Date.AddDays(3);
                    if (dateMatch &&
                        receipt.HospitalName.IndexOf(photo.LocationName, StringComparison.OrdinalIgnoreCase) >= 0 &&
                        receipt.PatientName.IndexOf(photo.LocationName, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        bestMatch = new AutoAssociateResult
                        {
                            PhotoId = photo.Id,
                            Matched = true,
                            ReceiptId = receipt.Id,
                            MatchLevel = "Hospital+Patient",
                        };
                        break;
                    }
                }
            }

            // Level 3: Hospital name match within ±7 days
            if (bestMatch == null && !string.IsNullOrEmpty(photo.LocationName))
            {
                foreach (var receipt in receipts)
                {
                    if (string.IsNullOrEmpty(receipt.HospitalName) || !receipt.ReceiptDate.HasValue) continue;
                    var dateMatch = photo.UploadedAt.Date >= receipt.ReceiptDate.Value.Date.AddDays(-7)
                        && photo.UploadedAt.Date <= receipt.ReceiptDate.Value.Date.AddDays(7);
                    if (dateMatch && receipt.HospitalName.IndexOf(photo.LocationName, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        bestMatch = new AutoAssociateResult
                        {
                            PhotoId = photo.Id,
                            Matched = true,
                            ReceiptId = receipt.Id,
                            MatchLevel = "Hospital",
                        };
                        break;
                    }
                }
            }

            if (bestMatch != null)
            {
                photo.AssociatedReceiptIds.Add(bestMatch.ReceiptId!);
                photo.UpdatedAt = DateTime.UtcNow;
                await _photoRepo.UpdateAsync(photo);
            }
            else
            {
                bestMatch = new AutoAssociateResult
                {
                    PhotoId = photo.Id,
                    Matched = false,
                };
            }

            results.Add(bestMatch);
        }

        return results;
    }
}
