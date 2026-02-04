namespace KanShan.Server.Wa;

public sealed class WaOptions
{
    public string BaseUrl { get; set; } = "http://52.171.138.19:8001/";

    public string Token { get; set; } = "123";

    // OpenAI-compatible model name.
    public string Model { get; set; } = "wa";

    // How many recent messages to send as context.
    public int MaxContextMessages { get; set; } = 30;
}
