import * as signalR from "@microsoft/signalr";

export function createChatConnection(params: {
  baseUrl: string;
  accessTokenFactory: () => string;
}) {
  const url = `${params.baseUrl}/hubs/chat`;

  const connection = new signalR.HubConnectionBuilder()
    .withUrl(url, {
      accessTokenFactory: params.accessTokenFactory,
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build();

  return connection;
}
