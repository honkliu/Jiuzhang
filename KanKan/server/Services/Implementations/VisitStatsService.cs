using KanKan.API.Models.Entities;
using KanKan.API.Models.DTOs.Receipt;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Repositories.Implementations;
using KanKan.API.Services.Interfaces;
using MongoDB.Driver;

namespace KanKan.API.Services.Implementations;

public class VisitStatsService : IVisitStatsService
{
    private readonly IReceiptRepository _receiptRepo;
    private readonly IPhotoRepository _photoRepo;
    private readonly IReceiptVisitRepository _visitRepo;

    public VisitStatsService(IReceiptRepository receiptRepo, IPhotoRepository photoRepo, IReceiptVisitRepository visitRepo)
    {
        _receiptRepo = receiptRepo;
        _photoRepo = photoRepo;
        _visitRepo = visitRepo;
    }

    public async Task<VisitStatsResponse> GetVisitStatsAsync(string ownerId, DateTime startDate, DateTime endDate)
    {
        // Get all medical receipts in the date range
        var receipts = await _receiptRepo.GetByOwnerIdAsync(ownerId, ReceiptType.Medical);
        var filteredReceipts = receipts.Where(r => r.ReceiptDate.HasValue &&
            r.ReceiptDate.Value >= startDate && r.ReceiptDate.Value <= endDate).ToList();

        var response = new VisitStatsResponse
        {
            TotalReceipts = filteredReceipts.Count,
            TotalSpending = filteredReceipts.Where(r => r.TotalAmount.HasValue).Sum(r => r.TotalAmount!.Value),
        };

        // Get visits in this range
        var visits = await _visitRepo.GetByOwnerIdAsync(ownerId);
        var filteredVisits = visits.Where(v => v.VisitDate.HasValue &&
            v.VisitDate.Value >= startDate && v.VisitDate.Value <= endDate).ToList();
        response.TotalVisits = filteredVisits.Count;
        response.AveragePerVisit = response.TotalVisits > 0 ? response.TotalSpending / response.TotalVisits : 0;

        // Daily stats
        var dailyGroups = filteredReceipts.GroupBy(r => r.ReceiptDate!.Value.Date);
        foreach (var g in dailyGroups)
        {
            response.DailyStats.Add(new VisitDayStat
            {
                Date = g.Key.ToString("yyyy-MM-dd"),
                Spending = g.Where(r => r.TotalAmount.HasValue).Sum(r => r.TotalAmount!.Value),
                ReceiptCount = g.Count(),
            });
        }

        // Hospital stats
        var hospitalGroups = filteredReceipts.GroupBy(r => r.HospitalName ?? "Unknown");
        foreach (var g in hospitalGroups)
        {
            response.HospitalStats.Add(new VisitHospitalStat
            {
                HospitalName = g.Key,
                TotalSpending = g.Where(r => r.TotalAmount.HasValue).Sum(r => r.TotalAmount!.Value),
                ReceiptCount = g.Count(),
            });
        }

        return response;
    }

    public async Task RelinkReceiptsAsync(string ownerId, string sourceVisitId, string targetVisitId)
    {
        var receipts = await _receiptRepo.GetByVisitIdAsync(sourceVisitId);
        foreach (var receipt in receipts)
        {
            if (receipt.OwnerId != ownerId) continue;
            receipt.VisitId = targetVisitId;
            await _receiptRepo.UpdateAsync(receipt);
        }
    }
}
