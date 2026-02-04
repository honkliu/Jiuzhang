namespace KanShan.Server.Dtos;

public sealed record UserDto(
    Guid Id,
    string UserName,
    string DisplayName);
