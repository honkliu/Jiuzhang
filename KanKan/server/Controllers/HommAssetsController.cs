using KanKan.API.Services.Homm;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KanKan.API.Controllers.Homm;

/// <summary>HoMM3 asset routes (decoded from the local .lod files). Anonymous: loaded by &lt;img&gt; and fetch without auth headers.</summary>
[AllowAnonymous]
[ApiExplorerSettings(IgnoreApi = true)]
[Route("api/homm/h3")]
public class HommAssetsController : ControllerBase
{
    [HttpGet("status")]
    public IResult Status([FromServices] H3Assets h3) =>
        Results.Ok(new { available = h3.Available && H3Assets.IsLocal(HttpContext) });

    [HttpGet("pcx/{name}")]
    public IResult Pcx(string name, [FromServices] H3Assets h3) =>
        H3Assets.Serve(HttpContext, h3, () => h3.PcxPng(Path.GetFileNameWithoutExtension(name)), "image/png");

    [HttpGet("def/{name}")]
    public IResult Def(string name, [FromServices] H3Assets h3)
    {
        var key = Path.GetFileNameWithoutExtension(name);
        return name.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
            ? H3Assets.Serve(HttpContext, h3, () => h3.DefJson(key) is { } j ? System.Text.Encoding.UTF8.GetBytes(j) : null, "application/json")
            : H3Assets.Serve(HttpContext, h3, () => h3.DefSheetPng(key), "image/png");
    }
}
