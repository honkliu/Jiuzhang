using System.Security.Claims;
using System.Text.Json;
using KanKan.API.Models.DTOs.Music;
using KanKan.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/music")]
[Produces("application/json")]
public sealed class MusicController(
    IMusicCatalogService catalogService,
    IMusicPlaybackUrlService playbackUrlService,
    ILogger<MusicController> logger) : ControllerBase
{
    /// <summary>Returns the schema-driven music catalog without reshaping its metadata.</summary>
    [HttpGet("catalog")]
    [ProducesResponseType<JsonElement>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<JsonElement>> GetCatalog(
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await catalogService.GetCatalogAsync(cancellationToken));
        }
        catch (MusicCatalogUnavailableException exception)
        {
            return CatalogUnavailable(exception);
        }
    }

    /// <summary>Creates a short-lived signed URL for streaming a catalog record.</summary>
    [HttpPost("records/{id}/playback-url")]
    [ProducesResponseType<MusicPlaybackUrlResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<MusicPlaybackUrlResponse>> CreatePlaybackUrl(
        string id,
        CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        try
        {
            var target = await catalogService.GetPlaybackTargetAsync(id, cancellationToken);
            return target is null
                ? NotFound()
                : Ok(playbackUrlService.Create(id, userId));
        }
        catch (MusicCatalogUnavailableException exception)
        {
            return CatalogUnavailable(exception);
        }
    }

    /// <summary>Streams a catalog record using HTTP Range processing.</summary>
    [AllowAnonymous]
    [HttpGet("records/{id}/stream")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status206PartialContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Stream(
        string id,
        [FromQuery] string user,
        [FromQuery] long expires,
        [FromQuery] string signature,
        CancellationToken cancellationToken)
    {
        if (!playbackUrlService.Validate(id, user, expires, signature))
        {
            return Unauthorized();
        }

        try
        {
            var target = await catalogService.GetPlaybackTargetAsync(id, cancellationToken);
            if (target is null)
            {
                return NotFound();
            }

            Response.Headers.CacheControl = "private, no-store";
            return PhysicalFile(
                target.AbsolutePath,
                target.ContentType,
                enableRangeProcessing: true);
        }
        catch (MusicCatalogUnavailableException exception)
        {
            return CatalogUnavailable(exception);
        }
    }

    private ObjectResult CatalogUnavailable(MusicCatalogUnavailableException exception)
    {
        logger.LogError(exception, "Music catalog is unavailable");
        return Problem(
            statusCode: StatusCodes.Status503ServiceUnavailable,
            title: "Music catalog unavailable",
            detail: "The server music catalog is not configured or cannot be read.");
    }
}
