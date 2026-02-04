namespace KanShan.Server.Dtos;

public sealed record RegisterRequest(
    string UserName,
    string Password,
    string? DisplayName);

public sealed record LoginRequest(
    string UserName,
    string Password);

public sealed record DevLoginRequest(
    string UserName);

public sealed record AuthResponse(
    string AccessToken,
    UserDto User);
